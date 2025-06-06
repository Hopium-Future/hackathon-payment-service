const UserBinanceAccount = use('App/Models/UserBinanceAccount')
const BinanceBroker = use('App/Library/BinanceBroker')
const _ = require('lodash')

const RedisLocker = use('Redis')
    .connection('locker')
const Redis = use('Redis')
const Redlock = require('redlock')

const proxyConfig = use('Config')
    .get('moduleProxy')
const jwt = require('jsonwebtoken')
const axios = require('axios')
const ms = require('ms')
const Promise = require('bluebird')
const { DwTransactionMethod } = require("../Library/Enum")

const DwConfig = use('App/Models/DwConfig')
const AssetConfig = use('App/Models/Config/AssetConfig')
const SysNoti = use('App/Library/SysNoti')
const { generate } = require('randomstring')

const DepositWithdraw = use('App/Models/DepositWithdraw')
const { default: AwaitLock } = require('await-lock')

const LockerCheckBinanceDeposit = new Redlock([RedisLocker], {
    retryCount: Math.floor(150000 / 500),
    retryDelay: 1000
})
const LockerBinanceWithdraw = new Redlock([RedisLocker], {
    retryCount: Math.floor(150000 / 500),
    retryDelay: 1000
})
const WithdrawLocker = new AwaitLock()

module.exports = class {
    static async processWithdrawQueue (
        job
    ) {
        const TAG = `[${generate(6)}] process queue Binance withdraw job id=${job.id}:`
        let locker

        try {
            Logger.info(`${TAG} (before lock) start processing`)
            await WithdrawLocker.acquireAsync()
            locker = await LockerBinanceWithdraw.lock(`withdrawal_lock_binance_job::${job.id}`, 150000)
            Logger.info(`${TAG} (after lock) start processing`)
            const { id: _id } = job

            // Check withdrawal
            const withdrawal = await DepositWithdraw.findById(_id)
            if (!withdrawal) {
                Logger.info(`${TAG} Withdrawal ${_id} not found, skip…`)
                return
            }
            if (!withdrawal.metadata.networkConfigId) {
                Logger.info(`${TAG} not found networkConfigId in metadata, skip…`)
                return
            }
            if (
                withdrawal.status !== DepositWithdraw.Status.Pending
                && withdrawal.status !== DepositWithdraw.Status.TransferredWaitingForConfirmation
            ) {
                Logger.info(`${TAG} not pending (${withdrawal.status}), skip…`)
                return
            }

            // Get config
            const dwConfig = await DwConfig.findOne({ assetId: withdrawal.assetId })
                .populate('networkList')
            const networkConfig = dwConfig.networkList.find(e => e._id.toString() === withdrawal.metadata.networkConfigId)
            if (!networkConfig) {
                Logger.info(`${TAG} networkConfig not found, asset=${withdrawal.assetId}, config id=${withdrawal.metadata.networkConfigId}`)
                return
            }
            const assetConfig = await AssetConfig.getOneCached({ id: withdrawal.assetId })

            // const { data: brokerBalance } = await makeBinanceBrokerAxios()
            //     .post('get_broker_balance')

            const { available: assetBalance } = await BinanceBroker.getBrokerBalance(assetConfig.assetCode)
            if (+assetBalance < withdrawal.actualReceive) {
                Logger.warning(`${TAG} balance not enough: ${assetBalance} < ${withdrawal.actualReceive} ${assetConfig.assetCode}`)
                SysNoti.notifyDelayed(`<@trungnd> Ví Binance hết tiền ${assetConfig.assetCode}, cần ${withdrawal.actualReceive.toLocaleString()}, còn ${assetBalance.toLocaleString()}`, `binance_het_tien_${assetConfig.assetCode}`)
                throw new OwnError('not_enough_balance')
            }

            try {
                const { data: withdrawResult } = await makeBinanceBrokerAxios()
                    .post('submit_withdrawal', {
                        amount: withdrawal.actualReceive,
                        asset: assetConfig.assetCode,
                        network: networkConfig.network,
                        withdrawTo: withdrawal.to.address,
                        addressTag: withdrawal.to.tag,

                        binanceFee: networkConfig.withdrawFee,
                        uniqId: _id
                    })
                Logger.info(`${TAG} Binance withdraw result`, withdrawResult)

                const binanceResultCode = _.get(withdrawResult, 'code')
                const binanceWithdrawRequestId = _.get(withdrawResult, 'id')
                if (binanceResultCode === BinanceStatusCode.CAPITAL_WITHDRAW_USER_ASSET_NOT_ENOUGH) {
                    SysNoti.notifyDelayed(`<@trungnd> Ví Binance hết tiền ${assetConfig.assetCode}, cần ${withdrawal.actualReceive.toLocaleString()}, còn ${assetBalance.toLocaleString()}`, `binance_het_tien_${assetConfig.assetCode}`)
                    throw OwnError('not_enough_balance')
                } else if (binanceResultCode === BinanceStatusCode.CAPITAL_WITHDRAW_MIN_AMOUNT) {
                    SysNoti.notifyDelayed(`<@trungnd> ${TAG} min amount không đạt: ${_.get(withdrawResult, 'msg', 'không rõ msg')}`, `binance_min_not_met_${_id}`)
                    const WithdrawService = use('App/Services/WithdrawService')
                    Logger.info(`${TAG} Starting charge back`)
                    const tx = await WithdrawService.onWithdrawalRejectedAndRollback(_id)
                    Logger.info(`${TAG} Finished charge back, tx=`, tx)
                    return
                } else if (binanceResultCode < 0) {
                    // Lỗi !
                    SysNoti.critical(`<@trungnd> ${TAG} rút lỗi chưa hoàn tiền: ${_.get(withdrawResult, 'msg', 'không rõ msg')}`, `binance_unknown_error_${_id}`)
                    return
                } else if (binanceWithdrawRequestId == null) {
                    SysNoti.critical(`<@trungnd> ${TAG} rút lỗi chưa hoàn tiền, không có code lỗi nhưng ko có withdraw id từ Binance`, `binance_unknown_error_${_id}`)
                    return
                }

                Logger.info(`${TAG} Submitted withdraw Binance without errors`)
                withdrawal.metadata = {
                    ...withdrawal.metadata,
                    withdrawalId: binanceWithdrawRequestId
                }
                await withdrawal.save()
                Logger.info(`${TAG} Updated withdraw id=${binanceWithdrawRequestId}`)
            } catch (e) {
                SysNoti.critical(`User ${withdrawal.userId}, _id=${_id}, rút lỗi khi submit Binance ${withdrawal.actualReceive} ${assetConfig.assetCode}, chưa hoàn tiền: ${e.toString()}`)
                return
            }
        } catch (e) {
            throw e
        } finally {
            locker && await locker.unlock()
            WithdrawLocker.release()
        }
    }

    static async scanDeposit (
        userId
    ) {
        const TAG = `[${generate(6)}] Binance scanDeposit user=${userId}`
        let locker
        try {
            locker = await LockerCheckBinanceDeposit.lock(`scanDeposit_binance_${userId}`, 120000)

            // Get binance sub-account
            const binanceSubAccount = await UserBinanceAccount.getOne({
                userId: userId,
                getSecretInformation: 1
            })
            if (!binanceSubAccount) {
                throw new Error(`Binance sub-account for user ${userId} not found`)
            }
            if (!binanceSubAccount.apiKey || !binanceSubAccount.apiSecret) {
                throw new Error(`Binance sub-account for user ${userId} not found apiKey or apiSecret`)
            }

            // Get history
            let lastScanTime = await Redis.hget('last_scan_deposit_binance_time', userId)
            Logger.info(`${TAG} lastScanTime=${lastScanTime}`)
            if (!lastScanTime) {
                lastScanTime = Date.now() - ms('5 min')
            } else {
                lastScanTime = +lastScanTime - ms('1 min')
            }
            const UPGRADE_TIME = 1733128437000
            lastScanTime = Math.max(lastScanTime, Date.now() - ms('85 days')) // Binance only allows 90days history

            // TODO check cho truong hop khong phai sub-account moi
            const history = await BinanceBroker.depositHistory({ id: userId }, {
                subAccountId: binanceSubAccount.subAccountId,
                startTime: lastScanTime,
                status: 1
            })
            Logger.info(`${TAG} all history (length=${_.get(history, 'length', 0)})`, history)
            history.sort((x, y) => x.insertTime - y.insertTime)

            // Check each history
            await Promise.each(history, async depositHistory => {
                /**
                 * {
                     "amount":"0.00999800",
                     "coin":"PAXG",
                     "network":"ETH",
                     "status":1,
                     "address":"0x788cabe9236ce061e5a892e1a59395a81fc8d62c",
                     "addressTag":"",
                     "txId":"0xaad4654a3234aa6118af9b4b335f5ae81c360b2394721c019b5d1e75328b09f3",
                     "insertTime":1599621997000,
                     "transferType":0,
                     "confirmTimes":"12/12"
                 } */
                const {
                    txId,
                    insertTime,
                    coin,
                    network,
                    amount,
                    status
                } = depositHistory
                Logger.info(`${TAG} process history item`, depositHistory)
                if (status != 1) {
                    Logger.info(`${TAG} process history item, status != 1, return`)
                    return
                }

                // Ignore old deposit
                if (+insertTime < UPGRADE_TIME) {
                    Logger.info(`${TAG} ignore process history item, set new insert time`)
                    await Redis.hset('last_scan_deposit_binance_time', userId, Math.max(+lastScanTime, +insertTime))
                    return
                }

                // Check if processed
                const isProcessed = await Redis.hexists('binance_deposit_transaction_processed', `${network}_${txId}`)
                Logger.info(`${TAG} processed ${`${network}_${txId}`}`, isProcessed)
                if (isProcessed) {
                    Logger.warning(`${TAG} Transaction is processed, id=${txId}, coin=${coin}, network=${network}`)
                    return
                }

                // Check deposit config
                const assetConfig = await AssetConfig.getOneCached({ assetCode: coin })
                if (!assetConfig) {
                    Logger.info(`${TAG} Deposit asset not found, depositHistory=`, depositHistory)
                    return
                }
                const isDepositEnabled = await this.isDepositEnabled(assetConfig.id, network)
                if (!isDepositEnabled) {
                    Logger.info(`${TAG} Deposit asset=${assetConfig.id}, deposit not enabled, coin=${coin}`)
                    return
                }

                // Transfer all to master
                try {
                    await Redis.hset('binance_deposit_transaction_processed', `${network}_${txId}`, 1)
                    const transferResult = await BinanceBroker.transferSubAccountAmountToNa3({ id: userId }, amount, coin)
                    Logger.info(`${TAG} transfer to master result`, transferResult)
                } catch (e) {
                    SysNoti.notifyDelayed(`<@U7TRL8XSQ>Deposit Binance: User ${userId} Transfer *${amount} ${coin}*; sub to master error ${JSON.stringify(e)}`, `err_transferSubAccountAmountToNa3_${userId}`)
                    Logger.error(`Deposit: transfer from subaccount to master error: ${amount} ${coin}`, e)
                    return
                }

                // Mark processed
                await Redis.hset('binance_deposit_transaction_processed', `${network}_${txId}`, 1)

                // Cong tien
                const DepositWithdraw = use('App/Models/DepositWithdraw')
                const deposit = await DepositWithdraw.create({
                    type: DepositWithdraw.Type.Deposit,
                    userId,
                    provider: DepositWithdraw.Provider.Binance,
                    assetId: assetConfig.id,
                    transactionType: DwTransactionMethod.OnChain,
                    network,
                    amount: +amount,
                    actualReceive: +amount,
                    fee: null,
                    from: {
                        type: 'Blockchain',
                        name: network
                    },
                    to: {
                        type: 'User',
                        name: userId
                    },
                    status: DepositWithdraw.Status.Success,
                    transactionId: txId,
                    txId,
                    metadata: depositHistory
                })
                Logger.info(`${TAG} created deposit`, deposit.toObject())
                const DepositService = use('App/Services/DepositService')
                // Cong tien o day
                const tx = await DepositService.onOnChainDepositAuthorized(deposit)
                Logger.info(`${TAG} deposit authorized`, tx)

                // Mark last time
                await Redis.hset('last_scan_deposit_binance_time', userId, insertTime)
                Logger.info(`${TAG} mark binance time`, insertTime)
            })

            // Mark last time to now
            await Redis.hset('last_scan_deposit_binance_time', userId, Date.now())
        } catch (e) {
            Logger.error(TAG, e)
            SysNoti.notify(`${TAG} Scan deposit binance user ${userId} failed: ${e.toString()}`)
        } finally {
            locker && await locker.unlock()
        }
    }

    // TODO fix sub-account
    static async getBrokerWithdrawalHistory (startTime, completedOnly) {
        try {
            const { data } = await makeBinanceBrokerAxios()
                .post('get_broker_withdraw_history', {
                    startTime,
                    completedOnly
                })
            if (data.status === 'ok') {
                return data.data
            }
            Logger.error(`getBrokerWithdrawalHistory startTime=${startTime}, completedOnly=${completedOnly}, error`, data)
            return null
        } catch (e) {
            Logger.error(`getBrokerWithdrawalHistory startTime=${startTime}, completedOnly=${completedOnly}, error`, e)
            return null
        }
    }

    static async getOrCreateUserBinanceAccount (
        userId,
        hideSecret = true
    ) {
        const existing = await UserBinanceAccount.getOne({
            userId: userId,
            getSecretInformation: 1
        })

        if (existing) {
            return existing
        }

        return existing
        // Create binance sub-account
        // const subAccount = await BinanceBroker.createSubAccountAsync()
        // Logger.info(`Binance sub account created for user ${userId}`, {
        //     ...subAccount,
        //     apiSecret: subAccount.secretKey ? `…${subAccount.secretKey.slice(-5)}` : '(no secret)'
        // })
        //
        // // Create instance
        // const instance = {
        //     userId,
        //     email: null,
        //     apiKey: subAccount.apiKey,
        //     apiSecret: subAccount.secretKey,
        //     subAccountId: subAccount.subaccountId
        // }
        // return UserBinanceAccount.create(instance)
    }

    static async isDepositEnabled (assetId, network) {
        const dwConfig = await DwConfig.findOne({ assetId })
            .populate('networkList')
        if (!dwConfig) {
            return false
        }
        const networkConfig = dwConfig.networkList.find(networkItem => networkItem.network === network)
        if (!networkConfig) {
            return false
        }
        return networkConfig.depositEnable === true
    }
}

function makeBinanceBrokerAxios () {
    const binanceProxy = proxyConfig.binanceBroker
    const signedPayload = jwt.sign({}, binanceProxy.secretKey, { expiresIn: '1 min' })
    return axios.create({
        baseURL: binanceProxy.host,
        headers: { __proxyPayload: signedPayload }
    })
}

const BinanceStatusCode = {
    CAPITAL_WITHDRAW_USER_ASSET_NOT_ENOUGH: -4026,
    CAPITAL_WITHDRAW_MIN_AMOUNT: -4022
}
