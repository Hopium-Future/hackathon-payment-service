'use strict'
const Task = use('Task')
const AssetValueMongo = use('App/Models/AssetValue')
const axios = require('axios')
const _ = require('lodash')

class DepositTransferToRoot extends Task {
    static get schedule() {
        return '* * * * *'
    }

    async handle() {
        // Get all asset value
        await this.updateNamiAssetValue()
        await this.updateBitgetAssetValue()

    }

    async bulkUpdateAssetValue(data) {
        const bulkUpdate = Object.keys(data)
            .map(assetId => {
                return {
                    updateOne:
                        {
                            filter: {assetId},
                            update: {$set: {assetId, usdValue: data[assetId]}},
                            upsert: true
                        }
                }
            })
        await AssetValueMongo.bulkWrite(bulkUpdate)
    }

    async updateNamiAssetValue() {
        try {
            const {data} = await axios.get('https://nami.exchange/api/v3/spot/asset_value');
            if (data?.data) await this.bulkUpdateAssetValue(data?.data)
        } catch (error) {
            console.error('Error fetching Nami asset value:', error);
            throw error;
        }
    }

    async updateBitgetAssetValue() {
        try {
            const ListAssetId = {
                // GOATS: 603,
                // HMSTR: 576,
                // CATI: 574,
                // DOGS: 567,
                // TON: 564,
                // USDT: 22,
                // HOPIUM: 3,
            }
            const {data} = await axios.get('https://api.bitget.com/api/v2/spot/market/tickers');
            const updatePrice = {}
            if (data?.data) {
                for (let asset in ListAssetId) {
                    const priceData = _.find(data?.data, {symbol: `${asset}USDT`})
                    if (priceData && priceData?.lastPr) updatePrice[ListAssetId[asset]] = priceData.lastPr
                }
            }
            await this.bulkUpdateAssetValue(updatePrice)
        } catch (error) {
            console.error('Error fetching Nami asset value:', error);
            throw error;
        }
    }
}

module.exports = DepositTransferToRoot
