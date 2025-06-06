const BaseModel = use('App/Models/BaseModelMongo')
const mongoose = require('mongoose')
const {DwNetworkSchema} = require('./DwNetwork')

const {Schema} = mongoose
const MemoryCache = use('App/Models/MemoryCache')
const cache = new MemoryCache(5) // Create a new cache service instance

/**
 * {
 "coin": "ETH",
 "depositAllEnable": true,
 "withdrawAllEnable": true,
 "name": "Ethereum",
 "free": "8.67626217",
 "locked": "0.88176",
 "freeze": "0",
 "withdrawing": "0",
 "ipoing": "0",
 "ipoable": "0",
 "storage": "0",
 "isLegalMoney": false,
 "trading": true,
 "networkList": [
 {
 "network": "BNB",
 "coin": "ETH",
 "withdrawIntegerMultiple": "0.00000001",
 "isDefault": false,
 "depositEnable": true,
 "withdrawEnable": true,
 "depositDesc": "",
 "withdrawDesc": "",
 "specialTips": "Both a MEMO and an Address are required to successfully deposit your ETH BEP2 tokens to Binance.",
 "name": "BEP2",
 "resetAddressStatus": false,
 "addressRegex": "^(bnb1)[0-9a-z]{38}$",
 "memoRegex": "^[0-9A-Za-z\\-_]{1,120}$",
 "withdrawFee": "0.000076",
 "withdrawMin": "0.00015",
 "withdrawMax": "9999999999.99999999",
 "minConfirm": 1,
 "unLockConfirm": 0
 },
 ]
 }
 */

class DwConfig extends BaseModel {
    /**
     * Wallet's schema
     */

    static get schema() {
        return {
            assetId: {type: "Number"},
            ipoing: {type: "String"},
            ipoable: {type: "String"},
            storage: {type: "String"},
            isLegalMoney: {type: "Boolean"},
            trading: {type: "Boolean"},
            syncConfig: {type: "Boolean", default: true},
            // networkList: {
            //     type: [
            //         DwNetworkSchema
            //     ]
            // }

            networkList: {type: [Schema.Types.ObjectId], ref: 'DwNetwork'}
        }
    }

    static boot({schema}) {
        // Hooks:
        // this.addHook('preSave', () => {})
        // Indexes:
        // this.index({ assetId: 1 }, {
        //     unique: true,
        //     background: true
        // })
        // Virtuals, etc:
        // schema.virtual('something').get(.......)
    }

    static async clearMemoryCache() {
        const pattern = this.getModelName()
        cache.delKeys(pattern)
        await this.resetCache()
    }

    static async getOneCached(options = {}) {
        const _key = this.buildCacheKey("getOneCached", arguments)// tạo key redis
        return cache.get(_key, async () => this.getOne(options))
    }

    static async getListCached(options = {}) {
        const _key = this.buildCacheKey("getListCached", arguments)// tạo key redis
        return cache.get(_key, async () => this.getList(options))
    }

    static async getOne(options = {}) {
        const [item] = await this.getList(options, 1, 1)
        return item
    }

    static async getList(filter = {}, options = {}) {
        // eslint-disable-next-line prefer-rest-params
        const _key = this.buildCacheKey("getList", arguments)// tạo key redis
        const _cData = await this.getCacheData(_key)
        if (_cData) {
            return _cData
        }

        const pipeline = []
        pipeline.push({$match: filter})
        if (options?.sort) pipeline.push({$sort: options?.sort})
        if (options?.limit) pipeline.push({$limit: options?.limit})
        if (options?.project) pipeline.push({$project: options?.project})
        let records = await this.aggregate(pipeline).read('s')
        records = await this.populate(records, 'networkList')
        const result = records
        await this.setCacheData(_key, result, 60 * 1000)
        return result
    }
}

module.exports = DwConfig.buildModel('DwConfig')
