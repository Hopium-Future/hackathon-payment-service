'use strict'

const BaseModel = use('App/Models/BaseModelMongo')

const MemoryCache = use('App/Models/MemoryCache')
const cache = new MemoryCache(24 * 60 * 60) // Create a new cache service instance
/**
 * @class AssetConfig
 */
class AssetConfig extends BaseModel {
    /**
     * Asset's schema
     */
    static get schema () {
        return {
            id: Number,
            status: Boolean,
            assetCode: String,
            assetDigit: Number,
            assetName: String,
            commissionRate: Number,
            feeDigit: Number,
            feeRate: Number,
            feeReferenceAsset: String,
            fullLogoUrl: String,
            gas: Number,
            isLegalMoney: Boolean,
            logoUrl: String,
            s3LogoUrl: String,
            s3LogoUrls: Object,
            tags: Object,
            walletTypes: Object, // {SPOT: true, FUTURES: true},
            coinMarketCapData: Object,
            coinGeckoData: Object
        }
    }

    static boot ({ schema }) {
        // Hooks:
        this.addHook('preSave', () => {
        })
        // Indexes:
        // this.index({ id: 1 }, { unique: true, background: true })
        // this.index({ assetCode: 1 }, { unique: true, background: true })
        // Virtuals, etc:
        // schema.virtual('something').get(.......)
    }

    static async clearMemoryCache () {
        const pattern = this.getModelName()
        cache.delKeys(pattern)
        await this.resetCache()
    }

    static async getOneCached (options = {}) {
        const _key = this.buildCacheKey("getOneCached", arguments)// tạo key redis
        return cache.get(_key, async () => this.getOne(options))
    }

    static async getListCached (options = {}) {
        const _key = this.buildCacheKey("getListCached", arguments)// tạo key redis
        return cache.get(_key, async () => this.getList(options))
    }

    static async getOne (options = {}) {
        const [item] = await this.getList(options, 1, 1)
        return item
    }

    // Get asset code to text

    static async getAssetCode (assetId) {
        const config = await this.getOneCached({ id: assetId })
        return config?.assetCode
    }

    // eslint-disable-next-line no-unused-vars
    static async getList (options = {}, pageIndex = 1, pageSize = 10) {
        // eslint-disable-next-line prefer-rest-params
        const _key = this.buildCacheKey("getList", arguments)// tạo key redis
        const _cData = await this.getCacheData(_key)
        if (_cData) {
            return _cData
        }

        const records = await this.find(options).read('s')
        const result = []

        if (records.length > 0) {
            // eslint-disable-next-line no-restricted-syntax
            for (const item of records) {
                result.push(item)
            }
        }
        await this.setCacheData(_key, result)
        return result
    }
}

module.exports = AssetConfig.buildModel('AssetConfig')
