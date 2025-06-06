const DepositWithdraw = use('App/Models/DepositWithdraw')
const _ = require('lodash')

const Logger = use('Logger')
const WalletService = use('Grpc')
    .connection('wallet')
const Redis = use('Redis')
const {default: AwaitLock} = require('await-lock')
const Antl = use('Antl')
const SysNoti = use('App/Library/SysNoti')
const NotificationService = use('App/Services/NotificationService')
const Mail = use('Mail')
const Env = use('Env')
const AssetConfig = use('App/Models/Config/AssetConfig')
const User = use('App/Models/User')
const Promise = require('bluebird')
const AssetValueMongo = use('App/Models/AssetValue')

const onChainDepositLocker = new AwaitLock()

// user cần đạt tối thiểu tổng nạp tương đương MAX_USD_DW mới được rút 
const MAX_USD_DW = 5;
// user đặc biệt cần nạp tối thiểu tương đương MAX_USER_USD_DW[userId] mới được rút
const MAX_USER_USD_DW = {
    10: 20 // userId 10 cần nạp tối thiểu tương đương 20 USD mới được rút
}
module.exports = class DepositService {
    static async onOnChainDepositAuthorized(depositOrId) {
        try {
            await onChainDepositLocker.acquireAsync()
            const deposit = _.isObject(depositOrId)
                ? depositOrId
                : await DepositWithdraw.findOne({_id: depositOrId})
            const MARK_KEY = `${deposit.network}_${deposit.txId}`
            if (await Redis.hexists('mark_transaction_hash_proceeded', MARK_KEY)) {
                Logger.warning(`Transaction id=${deposit.txId} is processed`)
                return
            }

            await Redis.hset('mark_transaction_hash_proceeded', MARK_KEY, 1)

            if (+process.env.PENDING_UPGRADE === 1) {
                if (![78, 18, 649895].includes(+deposit.userId)) {
                    console.log('Process unauthorized user id', deposit)
                    return
                }
            }
            // TODO change balance
            const transaction = await WalletService.changeBalanceAsync(
                deposit.userId,
                deposit.assetId,
                deposit.actualReceive,
                null,
                4,
                `Deposit On-chain`,
                {
                    fromUser: {name: 'On-chain Gateway'},
                    toUser: await User.getUserTransactionInfo(deposit.userId),
                    metadata: {
                        source: {
                            collection: 'depositwithdraws',
                            filter: {_id: deposit._id}
                        }
                    }
                }
            )

            Logger.info(`Deposit success, got transaction`, transaction)
            if (transaction) {
                // Update
                const assetValue = await AssetValueMongo.getValue(deposit.assetId)
                await deposit.update({
                    status: DepositWithdraw.Status.Success,
                    transactionId: transaction.transactionId,
                    usdValue: deposit.actualReceive * assetValue
                })
                const assetConfig = await AssetConfig.getOneCached({id: deposit.assetId})
                const user = await User.getOne({_id: deposit.userId})
                SysNoti.notify(` ✅ [Deposit] Nami Payment #${user?._id} (${user.username || '(no username)'} - ${user.email || '(no email)'}) nạp ${deposit.amount.toLocaleString()} ${assetConfig.assetCode} (${deposit.network} | ${deposit.provider})`)
                Promise.all([
                    NotificationService.sendChatBotMessage(
                        {
                            templateName: 'DEPOSIT_SUCCESSFULLY',
                            userId: user.telegramId,
                            params: {
                                amount: deposit.amount.toLocaleString(),
                                currency: assetConfig.assetCode,
                                time: (new Date()).toISOString()
                            }
                        }
                    ),
                    NotificationService.sendChatBotNotify(
                        {
                            template: 'DEPOSIT_NOTI_SUCCESS',
                            userId: deposit.userId,
                            context: {
                                side: "deposit",
                                orderID: deposit._id,
                                txId: deposit.txId,
                                from: deposit.from?.address,
                                to: deposit.to?.address,
                                network: deposit.network,
                                amount: deposit.amount.toLocaleString(),
                                assetId: deposit.assetId,
                                currency: assetConfig?.assetCode,
                                symbol: assetConfig?.assetCode,
                                time: deposit?.createdAt ?? deposit?.created_at,
                            }
                        }
                    )
                ])
            }
            return transaction
        } catch (e) {
            throw e
        } finally {
            onChainDepositLocker.release()
        }
    }

    static async getHistory(
        userId,
        filter,
        pagingOptions = {}
    ) {
        let query
        const criteria = {
            ...filter,
            userId,
            isDeleted: {$ne: true}
        }
        const pageSize = pagingOptions.pageSize || 20

        if (pagingOptions.lastId) {
            criteria._id = {$lt: pagingOptions.lastId}
            query = DepositWithdraw.find(criteria).limit(pageSize)
        } else {
            const page = pagingOptions.page || 0
            query = DepositWithdraw.find(criteria)
                .limit(pageSize)
                .skip(page * pageSize)
        }
        const data = await query.sort({_id: -1}).read('s')

        await Promise.map(data, async value => {
            if (value.type === DepositWithdraw.Type.Withdraw) {
                value.txId = value.txId || value?.metadata?.hash || value?.metadata?.txhash || value?.metadata?.note || ''
            }
            return value
        })
        return data
    }

    static async getHistoryDetails(userId, _id) {
        const record = await DepositWithdraw.findOne({_id, userId})
        return record
    }

    static async sendEmailDepositSuccess(
        deposit,
        locale = 'en'
    ) {
        // get email
        const user = await User.getOne({_id: deposit.userId})
        const {email} = user
        const email_time = new Date().toISOString()
            .replace(/T/, ' ')
            .replace(/\..+/, '')
            .replace(/-/g, '/')
        const assetConfig = await AssetConfig.getOneCached({id: deposit.assetId})
        const namiLocale = 'en'
        const mailResult = await Mail.send('emails.deposit_notice', {
            locale: namiLocale,
            antl: Antl.forLocale(namiLocale),
            amount: deposit.amount,
            currency: assetConfig.assetCode
        }, message => {
            message
                .to(email)
                .from(Env.get('EMAIL_FROM'))
                .subject(`Nami | Deposit Success Notice - ${email_time} (UTC)`)
        })
        Logger.log('Send deposit notice mail result', mailResult)
    }

    static async getTotalDepositUsd(userId) {
        try {
            const key = `total_deposit_usd_${userId}`
            let rs = await Redis.get(key)
            if (rs) return +rs;
            
            rs = await DepositWithdraw.aggregate([
                {
                    $match: {
                        userId: userId,
                        type: DepositWithdraw.Type.Deposit,
                        status: DepositWithdraw.Status.Success
                    }
                },
                {
                    $group: {
                        _id: null, // Không nhóm theo trường nào
                        totalUsdValue: {$sum: '$usdValue'}
                    }
                }
            ])

            rs = rs.length > 0 ? rs[0].totalUsdValue : 0
            await Redis.setex(key, 15, rs) // cache 15s tránh spam thôi ko cache lâu
            return rs;
        } catch (err) {
            Logger.error('Error_fetching_total_usdValue:', err)
            throw err
        }
    }
    
    static async checkMaxDepositUsd(userId) {
        try {
            const totalDepositUsd = await this.getTotalDepositUsd(userId);
            const maxDepositUsdToWithdraw = MAX_USER_USD_DW[userId] ?? MAX_USD_DW;

            return {
                totalDepositUsd,
                maxDepositUsdToWithdraw,
                canWithdraw: totalDepositUsd >= maxDepositUsdToWithdraw
            }
        } catch (err) {
            console.error("Error fetching total usdValue:", err);
            throw err;
        }
    }
}
