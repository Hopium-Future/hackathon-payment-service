'use strict'
const Task = use('Task')
const AssetValueMongo = use('App/Models/AssetValue')
const axios = require('axios')
const _ = require('lodash')
const DwConfig = use('App/Models/DwConfig')
const DepositWithdraw = use('App/Models/DepositWithdraw')
const Env = use('Env')
const IS_PROD = Env.get('NODE_ENV') === 'production'
class DepositTransferToRoot extends Task {
    static get schedule() {
        if (IS_PROD) return '* * * * *'

        const currentSeconds = new Date().getSeconds()
        return `${(currentSeconds + 3) % 60} * * * * *`
    }

    async handle() {
        await this.updateDw()
    }

    async updateDw() {
        try{
            const dwConfigs = await DwConfig.find({}).select({assetId: 1})
            console.log(dwConfigs)
            for (let i = 0; i < dwConfigs.length; i++) {
                const assetId = dwConfigs[i]?.assetId
                const assetValue = await AssetValueMongo.getValue(assetId)
                if(!assetValue) continue
                console.log('Update asset value:', {assetId, assetValue})
                await DepositWithdraw.updateMany({assetId, usdValue: null},
                    [
                        {
                            $set: { usdValue: { $multiply: ["$amount",   assetValue] } }
                        }
                    ]
                )
            }
        }catch (e) {
            console.error('Update asset value error', e)
        }

    }
}

module.exports = DepositTransferToRoot
