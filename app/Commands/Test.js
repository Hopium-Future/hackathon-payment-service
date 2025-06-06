'use strict'

const {Command} = require('@adonisjs/ace')
const {getConfigAllTokens} = require("../Library/BinanceBroker");
const bb = require("bluebird");
const {get, without, pick, map} = require("lodash");

const BinanceBroker = use('App/Library/BinanceBroker')

class Test extends Command {
    static get signature() {
        return 'test'
    }

    static get description() {
        return 'Tell something helpful about this command'
    }

    async handle(args, options) {
        this.info('Dummy implementation for test command')


        const binanceConfig = await getConfigAllTokens()
        console.log('__ biance', binanceConfig)
        // const WalletService = use('Grpc').connection('wallet')
        // const userIds = [
        //     78,
        //     79,
        //     80,81,82,83
        //
        // ]
        // const assetIds = [
        //     604,
        //     603,
        //     576,
        //     574,
        //     567,
        //     564,
        //     22,
        //     33,
        //
        // ]
        // for (let i = 0; i < userIds.length; i++) {
            // const userId = userIds[i]
            // console.log('__ add user', userId)
            // assetIds.map(async assetId=> {
            //     console.log('__ ass', assetId)
            //     console.log(await WalletService.changeBalanceAsync(
            //         userId,
            //         assetId,
            //         1000*Math.random(),
            //         null,
            //         4,
            //         `Deposit On-chain`,
            //         {}
            //     ))
            // })

            // console.log('__ traáans', transaction)

            // const DepositWalletService = use('App/Services/DepositWalletService')
            // console.log(await DepositWalletService.getOrCreateWallet(
            //     -1,
            //     22,
            //     'BSC',
            //     true,
            //     true
            // ))

            // const User = use('App/Models/User')
            // console.log(await User.find({_id: 37}))
            // const BinanceService = use('App/Services/BinanceService')
            // BinanceService.scanDeposit(37)
            // const transaction2 = await WalletService.changeBalanceAsync(
            //     37,
            //     22,
            //     1000,
            //     null,
            //     4,
            //     `Deposit On-chain`,
            //     {}
            // )
            // console.log('__ traáans', transaction2)
        }


    // }

}

module.exports = Test
