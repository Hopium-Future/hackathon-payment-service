const Redlock = require('redlock')

const {DwTransactionMethod} = use("App/Library/Enum")
const {WalletNetwork} = use("App/Library/Enum")
const {WithdrawResult} = use("App/Library/Enum")
const Antl = use('Antl')
const RedisLocker = use('Redis')
    .connection('locker')
const DwConfig = use('App/Models/DwConfig')
const WalletService = use('Grpc').connection('wallet')
const AssetConfig = use('App/Models/Config/AssetConfig')
const configError = use("Adonis/Src/Config")
    .get('error')
const DepositWithdraw = use('App/Models/DepositWithdraw')
const FuturesService = use('App/Services/FuturesService')
const Redis = use('Redis')
const Big = require('big.js')
const Mail = use('Mail')
const ms = require('ms')
const {default: AwaitLock} = require('await-lock')
const Promise = require('bluebird')
const _ = require('lodash')

const NotificationService = use('App/Services/NotificationService')
const TfaService = use('App/Services/TfaService')
const dateFormat = require('dateformat')

const WithdrawAdminVerify = use("App/Services/WithdrawAdminVerify")
const {PlatformProvider} = use("App/Library/Enum")
const SmartOtpService = use("App/Services/SmartOtpService")

const User = use('App/Models/User')
const {generate} = require('randomstring')

const Env = use('Env')

const IS_PROD = Env.get('NODE_ENV') === 'production'

const WithdrawalLocker = new Redlock([RedisLocker], {
    retryCount: Math.floor(8000 / 500),
    retryDelay: 500
})

const onWithdrawalSuccessLocker = new AwaitLock()
const WithdrawalSuccessLocker = new Redlock([RedisLocker], {
    retryCount: Math.floor(600000 / 500),
    retryDelay: 500
})
module.exports = class WithdrawService {

    static async onWithdrawalSuccess(withdrawalId) {
        let locker
        try {
            await onWithdrawalSuccessLocker.acquireAsync()
            locker = await WithdrawalSuccessLocker.lock(`WithdrawalSuccessLocker_${withdrawalId}`, 900000)

            const withdrawal = await DepositWithdraw.findById(withdrawalId)
            if (!withdrawal || withdrawal.status !== DepositWithdraw.Status.Pending) {
                return
            }

            if (await isWithdrawalProcessed(withdrawalId)) {
                Logger.warning(`Withdrawal ${withdrawalId} is processed, return`)
                return
            }
            await markWithdrawalProcessed(withdrawalId)

            Logger.info(`onWithdrawalSuccess _id=${withdrawalId}`)
            const txs = []
            const deductTx = await WalletService.changeBalanceAsync(
                withdrawal.userId,
                withdrawal.assetId,
                -withdrawal.amount,
                -withdrawal.amount,
                5,
                `Withdrawal success, deduct balance`,
                {
                    fromUser: await User.getUserTransactionInfo(withdrawal.userId),
                    toUser: withdrawal.to,
                    metadata: {
                        source: {
                            collection: 'depositwithdraws',
                            filter: {_id: withdrawal._id}
                        }
                    }
                }
            )
            txs.push(deductTx)
            Logger.info(`onWithdrawalSuccess done _id=${withdrawalId}`, txs)
            await withdrawal.updateOne({status: DepositWithdraw.Status.Success})
            const assetConfig = await AssetConfig.findOne({id: withdrawal.assetId})
            const userData = await User.getOne({_id: withdrawal.userId})
            Promise.all([
                NotificationService.sendChatBotMessage({
                        templateName: 'WITHDRAW_SUCCESSFULLY',
                        userId: userData?.telegramId,
                        params: {
                            amount: withdrawal.amount.toLocaleString(),
                            currency: assetConfig.assetCode,
                            time: (new Date()).toISOString()
                        }
                    }
                ),
                NotificationService.sendChatBotNotify({
                    template: 'WITHDRAW_NOTI_SUCCESS',
                    userId: withdrawal.userId,
                    context: {
                        side: "withdraw",
                        orderID: withdrawal._id,
                        txId: withdrawal?.metadata?.txhash ?? withdrawal?.txId,
                        from: null, // không tồn tại
                        to: withdrawal.to.address,
                        network: withdrawal.network,
                        amount: withdrawal.amount.toLocaleString(),
                        assetId: withdrawal.assetId,
                        currency: assetConfig?.assetCode,
                        symbol: assetConfig?.assetCode,
                        time: withdrawal?.createdAt ?? withdrawal?.created_at,
                    }
                })
            ])
            return withdrawal
        } catch (e) {
            Logger.error('onWithdrawalSuccess error', e)
            throw e
        } finally {
            onWithdrawalSuccessLocker.release()
            locker && locker.unlock()
        }
    }

    static async onWithdrawalRejectedAndRollback(withdrawalId, force = false) {
        const withdrawal = await DepositWithdraw.findById(withdrawalId)
        if (!force && withdrawal.status !== DepositWithdraw.Status.Pending) {
            return
        }
        if (await isWithdrawalProcessed(withdrawalId)) {
            Logger.warning(`Withdrawal ${withdrawalId} is processed, return`)
            return
        }
        await markWithdrawalProcessed(withdrawalId)

        const txs = []
        const refundLockTx = await WalletService.changeBalanceAsync(
            withdrawal.userId,
            withdrawal.assetId,
            0,
            -withdrawal.amount,
            5,
            `Withdrawal rejected, refund lock balance ${withdrawalId}`
        )
        txs.push(refundLockTx)
        await withdrawal.updateOne({status: DepositWithdraw.Status.Declined})

        const assetConfig = await AssetConfig.getOneCached({id: withdrawal.assetId})
        
        Promise.all([
            NotificationService.sendChatBotNotify({
                template: 'WITHDRAW_NOTI_FAILED',
                userId: user.id,
                context: {
                    side: "withdraw",
                    orderID: withdrawal._id,
                    txId: withdrawal?.metadata?.txhash ?? withdrawal?.txId,
                    from: null, // không tồn tại
                    to: withdrawal.to.address,
                    network: withdrawal.network,
                    amount: withdrawal.amount.toLocaleString(),
                    assetId: withdrawal.assetId,
                    currency: assetConfig?.assetCode,
                    symbol: assetConfig?.assetCode,
                    time: withdrawal?.createdAt ?? withdrawal?.created_at,
                }
            }),
            NotificationService.sendChatBotMessage({
                templateName: "WITHDRAW_FAILED",
                userId: withdrawal.userId,
                params: {
                    amount: withdrawal.amount.toLocaleString(),
                    currency: assetConfig.assetCode,
                    id: withdrawal._id.toString(),
                    txHistoryUrl: `${Env.get(
                        "TELEBOT_WEB_APP_URL"
                    )}/payment-history?tab=withdraw`,
                    withdrawAgainUrl: `${Env.get(
                        "TELEBOT_WEB_APP_URL"
                    )}/withdraw?assetId=${withdrawal.assetId}`,
                    supportUrl: `${Env.get("TELEBOT_WEB_APP_URL")}/support`,
                },
            }),
        ])
        return refundLockTx
    }

    static async makeWithdrawal(
        userId,
        assetId,
        amount,
        network,
        withdrawToAddress,
        tag,
        otp,
        method = DwTransactionMethod.OnChain,
        confirmationCodes = {},
        metadata = {},
        justCreate = false,
        clientTime = 0,
        clientSecret = '',
        deviceId,
        isMobileApp,
        locale
    ) {
        const TAG = `[${generate(6)}] (withdraw) make Withdrawal user=${userId}`
        let locker
        try {
            Logger.info(`${TAG} before lock New withdrawal user=${userId}, amount=${amount}, asset=${assetId}, network=${network}, to=${withdrawToAddress}, tag=${tag}, method=${method}, confirmationCode=${confirmationCodes}`)
            locker = await WithdrawalLocker.lock(`withdrawal_lock::${userId}`, 150000)
            amount = +amount
            Logger.info(`${TAG} after lock New withdrawal user=${userId}, amount=${amount}, asset=${assetId}, network=${network}`)
            // Get config
            const dwConfig = await DwConfig.findOne({assetId})
                .populate('networkList')
                .lean()

            if (!dwConfig) {
                Logger.warning(`${TAG} invalid asset config not found`)
                throw (WithdrawResult.InvalidAsset)
            }
            const networkConfig = dwConfig.networkList.find(e => e.network === network)
            if (!networkConfig) {
                Logger.warning(`${TAG} network config not found`)
                throw (WithdrawResult.InvalidAsset)
            }
            if (!networkConfig.withdrawEnable) {
                Logger.warning(`${TAG} withdrawEnable = false`)
                throw (WithdrawResult.WithdrawDisabled)
            }

            // Verify target
            if (method === DwTransactionMethod.OnChain) {
                const addressValid = await isAddressValid(withdrawToAddress, network, networkConfig)
                Logger.info(`${TAG} address valid = ${addressValid}`)
                if (!addressValid) {
                    throw (WithdrawResult.InvalidAddress)
                }
            }

            // Check bot account
            const userModel = await User.findOne({_id: userId})

            if (!userModel || userModel?.permissions?.withdraw === false) {
                Logger.warning(`${TAG} not found user or bot type != null`)
                throw (WithdrawResult.WithdrawDisabled)
            }

            if (!userModel || userModel?.permissions?.withdraw === false) {
                Logger.warning(`${TAG} not found user or bot type != null`)
                throw (WithdrawResult.WithdrawDisabled)
            }


            // Verify amount
            let feeWithdraw
            if (method === DwTransactionMethod.BankTransfer) {
                feeWithdraw = +metadata.feeWithdraw || 0
                Logger.info(`${TAG} fee`, feeWithdraw)
            } else {
                feeWithdraw = (networkConfig.withdrawFee || 0)
                Logger.info(`${TAG} fee`, feeWithdraw)
                if (amount < Math.max(networkConfig.withdrawMin, feeWithdraw)) {
                    Logger.info(`${TAG} amount too small, amount=${amount}, min=${networkConfig.withdrawMin}, fee=${feeWithdraw}`)
                    throw (WithdrawResult.AmountTooSmall)
                }
                if (amount > networkConfig.withdrawMax) {
                    Logger.info(`${TAG} amount Exceeded`)
                    throw (WithdrawResult.AmountExceeded)
                }
            }
            const assetConfig = await AssetConfig.getOneCached({id: assetId})
            if (!assetConfig) {
                Logger.warning(`${TAG} assetConfig not found`)
                throw ('invalid_input')
            }
            const assetName = assetConfig.assetCode
            // Check balance
            const available = await WalletService.getAvailableAsync(userId, assetId)
            Logger.info(`${TAG} available`, available)
            if (available < amount) {
                throw (WithdrawResult.NotEnoughBalance)
            }

            // Check tổng nạp tương đương 5 USD chưa
            const checkDepositEnoughToWithdraw = await use('App/Services/DepositService').checkMaxDepositUsd(userId)
            Logger.info(`${TAG} DepositNotEnoughToWithdraw`, checkDepositEnoughToWithdraw)
            if (!checkDepositEnoughToWithdraw.canWithdraw) {
                throw WithdrawResult.DepositNotEnoughToWithdraw
            }

            if(await FuturesService.haveOpeningOrder(userId)){
                throw (WithdrawResult.HaveOpenPosition)
            }

            const actualReceive = +Big(amount).minus(+feeWithdraw)
            Logger.info(`${TAG} actual receive`, actualReceive)
            if (actualReceive <= 0) {
                Logger.warning(`${TAG} actual receive negative`, actualReceive)
                throw (WithdrawResult.AmountTooSmall)
            }

            let from
            let to
            let status = DepositWithdraw.Status.Pending
            const
                dwMetadata = {}
            if (method === DwTransactionMethod.OnChain) {
                from = {
                    type: 'Blockchain',
                    name: networkConfig.provider
                }
                to = {
                    type: 'Blockchain',
                    name: withdrawToAddress,
                    address: withdrawToAddress,
                    tag
                }
                status = DepositWithdraw.Status.Pending
            }
            Logger.info(`${TAG} from, to, status, metadata`, {
                from,
                to,
                status,
                dwMetadata
            })

            const shouldVerifyViaAdminData = await WithdrawAdminVerify.shouldVerifyViaAdmin(userId, amount, assetId)
            Logger.info(`WithdrawAdminVerify withdraw user ${userId}`, {
                userId,
                amount,
                assetId
            }, shouldVerifyViaAdminData)
            const shouldVerifyViaAdmin = _.get(shouldVerifyViaAdminData, 'shouldVerify')

            const transactionId = await WalletService.genTransactionIdAsync(assetConfig.assetCode)
            Logger.info(`${TAG} transaction id=${transactionId}`, networkConfig)
            const dw = await DepositWithdraw.create({
                type: DepositWithdraw.Type.Withdraw,
                transactionId,
                userId,
                provider: networkConfig.provider,
                assetId,
                transactionType: method,
                network: networkConfig.network,
                amount: +amount,
                actualReceive: +actualReceive,
                fee: {value: feeWithdraw},
                from,
                to,
                status,
                adminStatus: shouldVerifyViaAdmin ? DepositWithdraw.AdminStatus.WaitingForApproval : DepositWithdraw.AdminStatus.Approved,
                // txId: txhash,
                metadata: {
                    networkConfigId: networkConfig._id.toString(),
                    ...dwMetadata
                }
            })
            Logger.info(`${TAG} created withdraw`, dw.toObject())
            let toUserName
            if (method === DwTransactionMethod.OnChain) {
                toUserName = 'On-chain Gateway'
            } else if (method === DwTransactionMethod.BankTransfer) {
                toUserName = 'Bank Gateway'
            } else {
                toUserName = 'Nami Gateway'
            }
            Logger.info(`${TAG} before change balance, to user name=${toUserName}`)
            const deductTx = await WalletService.changeBalanceAsync(
                userId,
                assetId,
                status === DepositWithdraw.Status.Success ? -amount : 0,
                status === DepositWithdraw.Status.Success ? 0 : amount,
                5,
                status === DepositWithdraw.Status.Success ? `Withdraw, method ${method}` : `On submit withdraw, lock, method ${method}`,
                {
                    transactionId,
                    fromUser: await User.getUserTransactionInfo(userId),
                    toUser: {name: toUserName},
                    metadata: {
                        source: {
                            collection: 'depositwithdraws',
                            filter: {_id: dw._id}
                        }
                    }
                }
            )
            Logger.info(`${TAG} deduct tx`, deductTx)
            if (!deductTx) {
                throw (WithdrawResult.Unknown)
            }

            if (justCreate) {
                return dw
            }

            if (shouldVerifyViaAdmin) {
                await WithdrawAdminVerify.postConfirmationMessage(
                    dw,
                    {
                        action: 'WithdrawService.adminVerify',
                        params: [
                            dw._id,
                            TAG
                        ]
                    },
                    _.get(shouldVerifyViaAdminData, 'reason'),
                    shouldVerifyViaAdminData
                )
            } else {
                // Submit withdraw
                // Add to queue
                const backoffDelay = IS_PROD ? ms('15 min') : ms('1 min')
                const job = await use('BeeQueue')
                    .connection('withdraw')
                    .createJob()
                    .setId(dw._id.toString())
                    .retries(Math.floor(ms('1 hour') / backoffDelay))
                    .backoff('fixed', backoffDelay)
                    .save()
                Logger.info(`${TAG} withdraw onchain, job id=${job.id}, dwId=${dw._id.toString()}`)
            }

            return dw
        } catch (e) {
            Logger.error(e)
            throw e
        } finally {
            locker && await locker.unlock()
        }
    }

    static async adminVerify(withdrawId, TAG) {
        const backoffDelay = IS_PROD ? ms('5 min') : ms('1 min')
        const job = await use('BeeQueue')
            .connection('withdraw')
            .createJob()
            .setId(withdrawId)
            .retries(Math.floor(ms('1 hour') / backoffDelay))
            .backoff('fixed', backoffDelay)
            .save()
        Logger.info(`${TAG} admin accept, job id=${job.id}, dwId=${withdrawId}`)
    }
}

/**
 *
 * @returns {Promise<{ gasLimit: number, gasPrice: number }>}
 */
async function getGas(assetConfig, networkConfig) {
    let gasLimit
    let gasPrice
    gasPrice = await Redis.get('withdraw_gas_override', networkConfig.network)
    if (gasPrice != null) {
        gasPrice = +gasPrice
    }

    if (networkConfig.network === WalletNetwork.BSC) {
        if (gasPrice != null) {
            gasPrice = +gasPrice
        } else {
            gasPrice = +(await use('Web3')
                .connection('bsc')
                .eth
                .getGasPrice())
        }

        if (assetConfig.assetCode === 'BNB') {
            gasLimit = 21000
        } else {
            gasLimit = 60000
        }
    }
}

async function checkGas(network) {

}

async function isWithdrawalProcessed(_id) {
    return await Redis.hexists('mark_withdrawal_processed', _id.toString())
}

async function markWithdrawalProcessed(_id) {
    await Redis.hset('mark_withdrawal_processed', _id.toString(), 1)
}

// Trạng thái của lệnh rút ở các giai đoạn giữa chừng: ví dụ gửi onchain
// Trạng thái sẽ là: chờ đủ gas - chờ đủ balance - chờ confirm trên blockchain
async function getWithdrawalStatus(_id) {
    return await Redis.hget('withdraw_transaction_status', _id.toString())
}

async function setWithdrawalStatus(_id, status) {
    await Redis.hset('withdraw_transaction_status', _id.toString(), status)
}

async function isAddressValid(address, network, networkConfig) {
    if (
        network === WalletNetwork.Ethereum
        || network === WalletNetwork.BSC
        || network === WalletNetwork.KardiaChain
        || network === WalletNetwork.FTM
    ) {
        const web3 = use('Web3')
        return web3.utils.isAddress(address)
    }

    if (networkConfig && networkConfig.addressRegex) {
        return new RegExp(networkConfig.addressRegex).test(address)
    }
    throw (WithdrawResult.UnsupportedAddress)
}
