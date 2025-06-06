const Redis = use('Redis')
const _ = require('lodash')
const Logger = use('Logger')
const Promise = require('bluebird')

const SysNoti = use('App/Library/SysNoti')
const LRU = require('lru-cache')

const WithdrawService = use('App/Services/WithdrawService')
const BinanceBroker = use('App/Library/BinanceBroker')
const SmcConfig = use('App/Models/SmartcontractConfig')
const AssetConfig = use('App/Models/Config/AssetConfig')
const DwNetwork = use('App/Models/DwNetwork')
const DepositWithdraw = use('App/Models/DepositWithdraw')
const BeeQueueWithdraw = use('BeeQueue').connection('withdraw')
const User = use('App/Models/User')
const Big = require('bignumber.js')
const WithdrawAdminVerify = use("App/Services/WithdrawAdminVerify")
const Env = use('Env')
const Config = use('Config')
const ms = require('ms')

const Redlock = require('redlock')
const {PlatformProvider} = require("../Library/Enum")
const TonService = use('App/Services/TonService')

const WithdrawLocker = new Redlock([Redis], {
    retryCount: 24,
    retryDelay: 5000
})

const IS_PROD = Env.get('NODE_ENV') === 'production'

// ============ WITHDRAW
exports.initWithdrawalQueue = async function () {
    Logger.info('initWithdrawalQueue', new Date())
    BeeQueueWithdraw.process(processWithdrawal)
    BeeQueueWithdraw.on('failed', (job, err) => {
        Logger.error(`[Withdraw declined, job status=${job.status}] Withdraw job #${job.id} failed`, err)
        if (job.status === 'failed') {
            SysNoti.notify(`🛑 [Error & Declined] Withdraw job #${job.id} failed, err=${err.message || err}`)
            WithdrawAdminVerify.postRefundMessage(job.id, {}, err.message || err)
        } else {
            const errString = err.toString()
            if (errString !== 'NOT_ENOUGH_ROOT_BALANCE') {
                SysNoti.notifyDelayed(
                    `[Log] <@U7TRL8XSQ>Lệnh rút #${job.id} - ${job.status} bị lỗi, cần check lại: ${errString}`,
                    `error_withdraw_${job.id}`,
                    undefined,
                    ms('5 hours')
                )
            }
        }
    })
    BeeQueueWithdraw.on('error', (job, err) => {
        Logger.error(`[Withdraw declined, job status=${job.status}] Withdraw job #${job.id} failed`, err)
        if (job.status === 'failed') {
            SysNoti.notify(`🛑 [Error & Declined] Withdraw job #${job.id} failed, err=${err.message || err}`)
            WithdrawAdminVerify.postRefundMessage(job.id, {}, err.message || err)
        } else {
            const errString = err?.toString()
            if (errString !== 'NOT_ENOUGH_ROOT_BALANCE') {
                SysNoti.notifyDelayed(
                    `⚠️ <@U7TRL8XSQ>Lệnh rút #${job.id} - ${job.status} bị lỗi, cần check lại: ${errString}`,
                    `error_withdraw_${job.id}`,
                    undefined,
                    ms('5 hours')
                )
            }
        }
    })
    BeeQueueWithdraw.checkStalledJobs(60000, (err, numStalled) => {
        if (err) {
            Logger.error(`[BeeQueueWithdraw] Checked stalled jobs error`, err)
        }
        Logger.info(`[BeeQueueWithdraw] Checked stalled jobs`, numStalled)
    })
}
exports.addToWithdrawQueue = async function (withdrawalCode, additionalData = {}) {
    const BACK_OFF = Env.get('NODE_ENV') === 'production' ? ms('5 min') : ms('3 min')
    const MAX_RETRY_TIME = ms('2 days')

    const job = BeeQueueWithdraw
        .createJob({
            ...additionalData,
            withdrawalCode
        })
        .setId(withdrawalCode)
    job
        .backoff('fixed', BACK_OFF)
        .retries(Math.floor(MAX_RETRY_TIME / BACK_OFF))
    await job.save()
}

exports.processWithdrawal = processWithdrawal

async function processWithdrawal(job) {
    console.log('processWithdrawal job', job.data, job.id)
    let locker
    let withdrawCodeOutbound
    try {
        const withdrawal = await DepositWithdraw.findById(job.id)
        const withdrawalCode = job.id
        withdrawCodeOutbound = withdrawalCode
        locker = await WithdrawLocker.lock(`lock_withdrawal_Code_${withdrawalCode}`, 86400000)
        // Find withdraw order

        if (!withdrawal) {
            Logger.error(`Withdrawal ${withdrawalCode} not found!`)
            return
        }

        if (![DepositWithdraw.Status.Pending, DepositWithdraw.Status.TransferredWaitingForConfirmation].includes(withdrawal.status)) {
            Logger.error(`Withdrawal ${withdrawalCode} not found!`)
            return
        }

        if (withdrawal.adminStatus !== DepositWithdraw.AdminStatus.Approved) {
            Logger.info(`withdrawal ${withdrawalCode} rejected by admin, finish processing`)
            // Lệnh rút bị admin rejected, ko process nữa
            return
        }

        if (withdrawal.status === DepositWithdraw.Status.Declined) {
            Logger.info(`withdrawal ${withdrawalCode} rejected, finish processing`)
            // Lệnh rút rejected, ko process nữa
            return
        }

        const user = await User.getOne({_id: withdrawal.userId})
        const assetConfig = await AssetConfig.getOneCached({id: withdrawal.assetId})
        const dwNetworkConfig = await DwNetwork.findById(withdrawal?.metadata?.networkConfigId)
        const smartContractConfig = await SmcConfig.findOne({networkId: dwNetworkConfig._id})
        Logger.info('Processing Withdrawal code', withdrawalCode, dwNetworkConfig)

        if (dwNetworkConfig.provider !== PlatformProvider.BINANCE) {
            if (!smartContractConfig) {
                Logger.info(`withdrawal ${withdrawalCode} rejected, not found smart contract`)
                return
            }
            // Lệnh rút rejected, ko process nữa
        }
        if (dwNetworkConfig.provider === PlatformProvider.BINANCE) {
            const BinanceService = use('App/Services/BinanceService')
            let result

            const brokerBalance = await BinanceBroker.getBrokerBalance(assetConfig.assetCode)
            const na3Balance = await BinanceBroker.getNa3Balance(assetConfig.assetCode)

            Logger.info(`[Withdraw] #${job?.id}, check root balance`, {brokerBalance, na3Balance})
            if (na3Balance.available < withdrawal.actualReceive) {
                throw 'NOT_ENOUGH_ROOT_BALANCE'
            } else {
                // Transfer from na3 to broker
                let transferAmount =  +withdrawal.actualReceive + (+dwNetworkConfig.withdrawFee)
                const na3ToBrokerResult = await BinanceBroker.transferNa3ToBroker(
                    transferAmount, assetConfig.assetCode
                )
                Logger.info(`Request withdraw from Na3 to Broker Account req-res`, {
                    transferAmount, asset: assetConfig.assetCode, na3ToBrokerResult
                })
            }
            try {
                // TODO process binance withdraw from broker
                result = await BinanceBroker.withdrawFromBrokerAccount(
                    +withdrawal.actualReceive,
                    withdrawal.assetId,
                    dwNetworkConfig.network,
                    withdrawal?.to?.address,
                    withdrawal?.to?.tag,
                    +dwNetworkConfig.withdrawFee,
                    withdrawalCode
                )
            } catch (e) {
                Logger.error(`[Withdraw] Error while transfer token #${job?.id}, chưa hoàn tiền, check log`, e)
                SysNoti.notifyDelayed(`🔴[Error] <@U7TRL8XSQ>[Withdraw] Error while transfer token #${job?.id}, chưa hoàn tiền, check log: ${e.toString()}`)
                WithdrawAdminVerify.postRefundMessage(job?.id, {}, e.toString())
                return
            }
            Logger.info(`Request withdraw from Binance Account req-res`, {
                actualReceive: withdrawal.actualReceive,
                assetId: withdrawal.assetId,
                binanceNetwork: dwNetworkConfig.network,
                withdraw_to: withdrawal?.to?.address,
                memo: withdrawal?.to?.tag,
                binanceFee: dwNetworkConfig.withdrawFee,
                code: withdrawalCode,
                amountToSendToBinance: withdrawal.actualReceive
            }, result)
            const binanceResultCode = _.get(result, 'code')
            if (binanceResultCode === BinanceBroker.BinanceStatusCode.CAPITAL_WITHDRAW_USER_ASSET_NOT_ENOUGH) {
                const currencyBalance = await BinanceService.getBrokerBalance(assetConfig.assetCode)
                notifyWithdrawalBalanceNotEnough(withdrawal.assetId, dwNetworkConfig.network, currencyBalance.available, 'Ví broker Binance', 0)
                throw 'NOT_ENOUGH_ROOT_BALANCE'
            } else if (binanceResultCode === BinanceBroker.BinanceStatusCode.CAPITAL_WITHDRAW_MIN_AMOUNT) {
                SysNoti.notifyDelayed(
                    `🔴 [Withdraw Binance] Lỗi min amount ko đạt: ${_.get(result, 'msg', 'không rõ')}, chưa hoàn lại tiền`,
                    `binance_withdraw_err_${withdrawal.userId}`,
                    {
                        toSlackMention: IS_PROD ? [
                            SysNoti.SlackUserID.DEV_TRUNGND
                        ] : [
                            SysNoti.SlackUserID.DEV_LAMNV
                        ]
                    }
                )
                await DepositWithdraw.updateOne({_id: withdrawal._id}, {$set: {status: DepositWithdraw.Status.Declined}})
                return
            } else if (binanceResultCode < 0) {
                // Lỗi !
                SysNoti.notifyDelayed(
                    `🔴 [Withdraw Binance] #${withdrawalCode} Bị từ chối, Lỗi: ${_.get(result, 'msg', 'không rõ')}, chưa hoàn tiền, check log`,
                    `binance_withdraw_err_${withdrawal.userId}`,
                    {
                        toSlackMention: IS_PROD ? [
                            SysNoti.SlackUserID.DEV_TRUNGND
                        ] : [
                            SysNoti.SlackUserID.DEV_LAMNV
                        ]
                    }
                )
                WithdrawAdminVerify.postRefundMessage(withdrawal?._id, {}, result)
                await DepositWithdraw.updateOne({_id: withdrawal._id}, {$set: {status: DepositWithdraw.Status.Declined}})
                throw new Error(`Withdraw Binance err ${binanceResultCode}`)
            }
            const user = await User.getOne({_id: withdrawal.userId})
            SysNoti.notify(
                ` ✅ [Withdraw] Nami Payment #${user._id} (${user.username || '(no username)'} - ${user.email || '(no email)'}) rút ${(+withdrawal.actualReceive).toLocaleString()} ${assetConfig.assetCode} (provider Binance)`
            )
            await DepositWithdraw.updateOne({_id: withdrawal._id}, {$set: {'metadata.submitWithdrawalId': _.get(result, 'id', 'no_id')}})
        } else if (dwNetworkConfig.network === DwNetwork.Network.TON) {
            const rs = await TonService.transferExternalFromNami(
                withdrawal.to.address,
                withdrawal.amount,
                withdrawal.to.tag,
                smartContractConfig
            )

            const { isSuccess, msg } = rs;
            if (isSuccess) {
                SysNoti.notify(` ✅ [Withdraw] Nami Payment #${user._id} (${user.username || '(no username)'} - telegramId: ${user?.telegramId || 'null'}) rút ${(+withdrawal.actualReceive).toLocaleString()} ${assetConfig.assetCode} (provider Binance)`)
                await DepositWithdraw.updateOne({ _id: withdrawal._id }, { $set: { metadata: { txhash: rs.txHash } } })
                return;
            } 

            // case lỗi do ví rút Tổng ko đủ tiền, hoặc lỗi không xác định
            if (msg === "NOT_ENOUGH_ROOT_BALANCE") {
                notifyWithdrawalBalanceNotEnough(withdrawal.assetId, dwNetworkConfig.network, rs.available || 0, 'Ví TON Withdraw', 0)
                throw 'NOT_ENOUGH_ROOT_BALANCE'
            } else if (msg === "UNKNOWN_ERROR") {
                const e = rs.error;
                Logger.error(`[Withdraw] Error while transfer token #${job?.id}, chưa hoàn tiền, check log`, e)
                SysNoti.notifyDelayed(`🔴[Error] <@U7TRL8XSQ>[Withdraw] Error while transfer token #${job?.id}, chưa hoàn tiền, check log: ${e.toString()}`)
                WithdrawAdminVerify.postRefundMessage(job?.id, {}, e.toString())
                return
            }

            // if (transactionResultHash) {
            //     SysNoti.notify(` ✅ [Withdraw] Nami Payment #${user._id} (${user.username || '(no username)'} - telegramId: ${user?.telegramId || 'null'}) rút ${(+withdrawal.actualReceive).toLocaleString()} ${assetConfig.assetCode} (provider Binance)`)
            //     await DepositWithdraw.updateOne({ _id: withdrawal._id }, { $set: { metadata: { txhash: transactionResultHash } } })
            // } else {
            //     SysNoti.notify(`🔴[Error] <@U7TRL8XSQ>[Withdraw] Rút lỗi ${withdrawal.actualReceive} ${assetConfig.assetCode} , code ${withdrawalCode}, user ${withdrawal.userId} `)
            //     await DepositWithdraw.updateOne({_id: withdrawal._id}, {
            //         $set: {
            //             status: DepositWithdraw.Status.Declined,
            //             'metadata.txhash': transactionResultHash
            //         }
            //     })
            // }

        } else {
            Logger.warning(`[Withdraw] withdrawal #${withdrawal.code} not supported`)
        }
    } catch (e) {
        Logger.error(e)
        throw e
    } finally {
        Logger.info(`Release locker for ${withdrawCodeOutbound}, has locker=${!!locker}`)
        locker && await locker.unlock()
    }
}

const notifyWithdrawalBalanceNotEnough = _.debounce(async (assetId, network, currentBalance, withdrawalWalletAddress, delta = 0.001) => {
    const shouldNotify = await shouldNotifyWithdrawBalanceInsufficient(assetId, network, currentBalance)
    if (!shouldNotify) return

    // Tính tổng số tiền của token đang cần để nạp
    const desireBalanceData = await getDesireBalance(assetId, network)
    const desireBalance = desireBalanceData.total

    const assetConfig = await AssetConfig.getOneCached({id: assetId})
    const currencyName = assetConfig?.assetCode
    SysNoti.notify(`[Log] <@U7TRL8XSQ>[Withdraw] (Ví rút ${currencyName} hết tiền) (${network}) ${desireBalanceData.count} lệnh rút cần thêm ${(desireBalance - currentBalance + delta).toFixed(6)} ${currencyName}, ví ${withdrawalWalletAddress} chỉ còn ${currentBalance} ${currencyName}`)
}, 3000)
const DesireBalanceCache = new LRU({maxAge: ms('20s')})

async function getDesireBalance(assetId, network) {
    const cache = DesireBalanceCache.get(assetId)
    if (cache) return cache

    const desireBalances = await DepositWithdraw.find({
        assetId,
        network,
        status: {$in: [DepositWithdraw.Status.WithdrawWaitingForBalance, DepositWithdraw.Status.Pending]}
    })
    const data = {
        count: desireBalances.length,
        total: _.sumBy(desireBalances, 'actualReceive')
    }
    DesireBalanceCache.set(assetId, data)
    return data
}

exports.getDesireBalance = getDesireBalance

async function shouldNotifyWithdrawBalanceInsufficient(assetId, network, currentBalance) {
    let shouldNotify = true
    let
        desireBalance
    try {
        const [notifyData] = await Promise.all([
            Redis.hget('withdraw:notify_balance_data', assetId)
                .then(v => JSON.parse(v)),
            getDesireBalance(assetId, network)
                .then(v => desireBalance = v.total)
        ])
        if (currentBalance > desireBalance + 0.001) {
            shouldNotify = false
            return
        }
        const {
            lastTime,
            neededFund
        } = notifyData
        if (Date.now() - lastTime < ms('15 min')) {
            if (+desireBalance - currentBalance === +neededFund) {
                shouldNotify = false
            }
        }
    } catch (err) {

    } finally {
        if (shouldNotify) {
            await Redis.hset('withdraw:notify_balance_data', assetId, JSON.stringify({
                lastTime: Date.now(),
                balance: desireBalance != null ? desireBalance : (await getDesireBalance(assetId, network)).total,
                neededFund: desireBalance - currentBalance
            }))
        }
    }
    return shouldNotify
}
