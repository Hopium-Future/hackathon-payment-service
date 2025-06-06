'use strict'

const { PlatformProvider } = use("App/Library/Enum")
const Task = use('Task')
const UserPrivateWallet = use('App/Models/UserPrivateWallet')
const Promise = require('bluebird')
const throat = require('throat')

const BinanceService = use('App/Services/BinanceService')
const Env = use('Env')

let processing = false
let lastCompletedTime = 0
const TAG = 'Deposit_CheckBinance'
const IS_PROD = Env.get('NODE_ENV') === 'production'

class Deposit_CheckBinance extends Task {
    static get schedule () {
        if (IS_PROD) return '25 * * * * *'

        // return '25 * * * * *'
        const currentSeconds = new Date().getSeconds()
        return `${(currentSeconds + 3) % 60} * * * * *`
    }

    async run () {
        const minutes = new Date().getMinutes()
        const minutesMod = minutes % 3

        const dateMinScan = new Date()
        dateMinScan.setHours(dateMinScan.getHours() - 3)
        // Change to mysql

        const allPrivateWallets = await UserPrivateWallet.aggregate([
            {
                $match: {
                    provider: PlatformProvider.BINANCE,
                    userId: { $mod: [3, minutesMod] },
                    lastSeen: { $gt: dateMinScan }
                }
            },
            {
                $group: {
                    _id: '$userId',
                    lastSeen: { $max: '$lastSeen' }
                }
            },
            { $sort: { lastSeen: -1 } },
            { $limit: 500 }
        ])

        // Use throat to maintain the execution order
        await Promise.all(allPrivateWallets.map(throat(3, async privateWallet => {
            const { _id: userId } = privateWallet
            Logger.info(`${TAG} Start scan deposit binance user ${userId}`)
            await BinanceService.scanDeposit(userId)
            Logger.info(`${TAG} Finish scan deposit binance user ${userId}`)
        })))
    }

    async handle () {
        if (process.env.ENABLE_DEPOSIT_WITHDRAW !== '1') return
        if (process.env.CheckBinanceDeposit_Enable === '0') {
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

module.exports = Deposit_CheckBinance
