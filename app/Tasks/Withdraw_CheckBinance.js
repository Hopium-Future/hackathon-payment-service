'use strict'

const { PlatformProvider } = use("App/Library/Enum")
const Task = use('Task')

const BinanceService = use('App/Services/BinanceService')
const Env = use('Env')
const DepositWithdraw = use('App/Models/DepositWithdraw')
const SysNoti = use('App/Library/SysNoti')
const ms = require('ms')

const BinanceBroker = use('App/Library/BinanceBroker')
const AssetConfig = use('App/Models/Config/AssetConfig')
const _ = require('lodash')

let processing = false
let lastCompletedTime = 0
const TAG = 'Withdraw_CheckBinance'
const IS_PROD = Env.get('NODE_ENV') === 'production'

const RedisLocker = use('Redis')
    .connection('locker')
const Redlock = require('redlock')

const ScanLocker = new Redlock([RedisLocker], {
    retryCount: Math.floor(8000 / 500),
    retryDelay: 500
})

class Withdraw_CheckBinance extends Task {
    static get schedule () {
        if (IS_PROD) return '11 */1 * * * *'

        // return '25 * * * * *'
        const currentSeconds = new Date().getSeconds()
        return `${(currentSeconds + 3) % 60} * * * * *`
    }

    async run () {
        const dateMinScan = new Date()
        dateMinScan.setHours(dateMinScan.getHours() - 48)
        const allWithdrawals = await DepositWithdraw.find({
            type: DepositWithdraw.Type.Withdraw,
            status: DepositWithdraw.Status.Pending,
            provider: PlatformProvider.BINANCE,
            executeAt: { $gt: dateMinScan }
        })
            .sort({ executeAt: -1 })
            .limit(200)
            .lean()
        if (!allWithdrawals || !allWithdrawals.length) {
            Logger.info(`${TAG} allWithdrawals is empty`)
            return
        }

        const withdrawalHistory = await BinanceBroker.getBrokerWithdrawalHistory(
            dateMinScan.getTime(),
            false
        )
        if (!withdrawalHistory) {
            SysNoti.notifyDelayed(
                `🔴 <@trungnd> Rút tiền binance còn đang pending nhưng không tìm thấy trong lịch sử rút của broker`,
                'err_binance_pending_not_found_history',
                null,
                ms('2h')
            )
            return
        }
        const N0W = Date.now()
        for (let i = 0; i < allWithdrawals.length; i++) {
            const withdrawal = await DepositWithdraw.findById(allWithdrawals[i]._id)
            const assetConfig = await AssetConfig.getOneCached({ id: withdrawal.assetId })
            const W_TAG = `Withdraw Binance Checker _id=${withdrawal._id} (${withdrawal.amount.toLocaleString()} ${assetConfig.assetCode})):`
            let locker

            try {
                Logger.info(`${W_TAG} before lock`)
                locker = await ScanLocker.lock(`scan_binance_withdrawal::${withdrawal._id}`, 150000)

                if (N0W - withdrawal.createdAt.getTime() > ms('1 hour')) {
                    // Task này quá lâu rồi, báo noti check
                    SysNoti.notifyDelayed(
                        `🔴 <@trungnd> ${W_TAG} pending quá lâu`,
                        'err_binance_pending_too_long',
                        null,
                        ms('0.5 day')
                    )
                }

                const _id = withdrawal._id.toString()
                const withdrawalBinanceData = withdrawalHistory.find(e => e.withdrawOrderId === _id)
                Logger.info(`${W_TAG} found withdraw data from binance that matches`, withdrawalBinanceData)
                if (!withdrawalBinanceData) {
                    Logger.info(`${W_TAG} not found withdraw data from binance that matches, skipping ⏹`)
                    continue
                }
                /**
                 * @withdrawalBinanceData
                 * {
                  "amount": 1.009,
                  "transactionFee": 0,
                  "address": "TPwPEnrL1o3wRsQWnMLm8W3i4VjcAY9rrM",
                  "withdrawOrderId": "zwStBnflpRwPmqaFURb9bMwkDAPfeh",
                  "txId": "e97dbc4c6537836de5761aa5b872fc76b3545ee07b56fa8c09c5ddb647ce58e2",
                  "id": "1ab0983c824048ff86f00cbbd1c1af2d",
                  "asset": "USDT",
                  "applyTime": 1612776401000,
                  "status": 6,
                  "network": "TRX"
                }
                 */
                const currentMetadata = safeParseJson(withdrawal.metadata)
                const objToUpdate = {}
                const
                    metaDataToUpdate = {}
                let pendingApprove = false
                let pendingDeclined = false

                // Update status
                if (withdrawalBinanceData.status === 6) { // Completed
                    Object.assign(metaDataToUpdate, {
                        amountToSend: withdrawalBinanceData.amount,
                        id: withdrawalBinanceData.id
                    })
                    pendingApprove = withdrawal.status !== DepositWithdraw.Status.Success
                    Logger.info(`${W_TAG} update completed, pendingApprove=${pendingApprove}`, withdrawalBinanceData)
                } else if (
                    withdrawalBinanceData.status === 5
                ) { // Failure
                    objToUpdate.status = DepositWithdraw.Status.Declined
                    Object.assign(metaDataToUpdate, { providerId: withdrawalBinanceData.id })
                    pendingDeclined = withdrawal.status !== DepositWithdraw.Status.Declined
                    Logger.info(`${W_TAG} update failure, pendingDeclined=${pendingDeclined}`, withdrawalBinanceData)
                } else if (
                    withdrawalBinanceData.status === 3
                ) { // Rejected
                    objToUpdate.status = DepositWithdraw.Status.Declined
                    Object.assign(metaDataToUpdate, { providerId: withdrawalBinanceData.id })
                    pendingDeclined = withdrawal.status !== DepositWithdraw.Status.Declined
                    Logger.info(`${W_TAG} update rejected, pendingDeclined=${pendingDeclined}`, withdrawalBinanceData)
                }

                // Update txId
                if (withdrawalBinanceData.txId) {
                    Object.assign(metaDataToUpdate, { rawTxIdProvider: withdrawalBinanceData.txId })
                    if (withdrawalBinanceData.txId.includes('transfer')) {
                        objToUpdate.txId = `Nami ${withdrawalBinanceData.txId}`
                    }else{
                        objToUpdate.txId = withdrawalBinanceData.txId
                    }
                }

                Logger.info(`${W_TAG} begin update, has objToUpdate=${!!objToUpdate}, has metaDataToUpdate=${!!metaDataToUpdate}`, objToUpdate, metaDataToUpdate)
                if (!_.isEmpty(objToUpdate) || !_.isEmpty(metaDataToUpdate)) {
                    const newMetadata = {
                        ...currentMetadata,
                        ...metaDataToUpdate
                    }
                    Object.assign(withdrawal, objToUpdate)
                    withdrawal.metadata = newMetadata
                    await withdrawal.save()
                    Logger.info(`${W_TAG} Update withdrawal id ${withdrawal.id}, data`, withdrawalBinanceData)
                }

                if (pendingApprove) {
                    const keyToCheck = withdrawalBinanceData.txId ? withdrawalBinanceData.txId : _id
                    if (await isTxIdProcessed(keyToCheck)) {
                        Logger.info(`${W_TAG} going to approve withdrawal but processed, key=${keyToCheck}`)
                        return
                    }
                    await markTxIdProcessed(keyToCheck)
                    const WithdrawService = use('App/Services/WithdrawService')
                    Logger.info(`${W_TAG} start approve withdrawal`)
                    await WithdrawService.onWithdrawalSuccess(_id)
                    Logger.info(`${W_TAG} approved withdrawal`)
                } else if (pendingDeclined) {
                    SysNoti.notify(`🔴 <@trungnd> ${W_TAG}status rejected, chưa hoàn tiền`)
                    await use("App/Services/WithdrawAdminVerify").postRefundMessage(withdrawal._id, {}, 'Binance Reject')
                }
            } catch (e) {
                Logger.error(e)
            } finally {
                locker && await locker.unlock()
            }
        }
    }

    async handle () {
        if (process.env.ENABLE_DEPOSIT_WITHDRAW !== '1') return
        if (process.env.Withdraw_CheckBinance_Enable === '0') {
            return
        }

        if (processing) {
            Logger.info(`${TAG} still processing…`)
            return
        }

        try {
            processing = true
            Logger.info(`Starting ${TAG}`)
            await this.run()
        } catch (e) {
            Logger.error(e)
        } finally {
            Logger.info(`Finished ${TAG}`)
            processing = false
            lastCompletedTime = Date.now()
        }
    }
}

module.exports = Withdraw_CheckBinance

function safeParseJson (s) {
    try {
        return JSON.parse(s)
    } catch (e) {
        return {}
    }
}

const Redis = use('Redis')

async function isTxIdProcessed (txid) {
    return Redis.hexists('mark_withdraw_binance_processed', txid.toLowerCase())
}

async function markTxIdProcessed (txid) {
    await Redis.hset('mark_withdraw_binance_processed', txid.toLowerCase(), 1)
}
