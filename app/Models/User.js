'use strict'

const BaseModel = use('App/Models/BaseModelMongo')

const MemoryCache = use('App/Models/MemoryCache')
const cache = new MemoryCache(24 * 60 * 60) // Create a new cache service instance
/**
 * @class User
 */
class User extends BaseModel {
    /**
     * Asset's schema
     */
    static get schema() {
        return {
            _id: Number,
            id: {
                type: Number,
                default: function () {
                    return this._id;
                }
            },
            telegramId: String,
            username: String,
            firstName: String,
            lastName: String,
            avatar: String,
            email: String,
            normalizedEmail: String,
            phone: String,
            gender: String,
            password: String,
            roleId: Number,
            status: String,
            referralId: Number,
            referralCode: String,
            referralDate: Date,
            authenticatorSecret: String,
            partnerType: String,
            dateOfBirth: Date,
            countryCode: String,
            permissions: Object,
        }
    }

    static boot({schema}) {
        // Hooks:
        this.addHook('preSave', () => {
        })
        // Indexes:
        this.index({telegramId: 1}, {unique: true, background: true})
        // this.index({ assetCode: 1 }, { unique: true, background: true })
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

    static async getOne (options = {}) {
        if (options.id) {
            options._id = options.id
            delete options.id;
        }
        const [item] = await this.getList(options, 1, 1)

        if (!item.username) { item.username = item.firstName + " " + item.lastName }
        return item
    }

    static async getUserTransactionInfo(userId) {
        const user = await this.getOne({_id: userId})
        return {
            _id: user?._id,
            name: user?.name || user?.username,
            username: user?.username
        }
    }

    // eslint-disable-next-line no-unused-vars
    static async getList(options = {}, pageIndex = 1, pageSize = 10) {
        // eslint-disable-next-line prefer-rest-params
        const _key = this.buildCacheKey("getList", arguments)// tạo key redis
        const _cData = await this.getCacheData(_key)
        if (_cData) {
            return _cData
        }

        const result = await this.find(options).read('s')
        await this.setCacheData(_key, result)
        return result
    }

    static async getUserTransactionInfo (userId) {
        const user = await this.getOne({ _id: userId })
        return {
            id: user?._id,
            username: user?.username,
            telegramId: user.telegramId,
        }
    }

}

module.exports = User.buildModel('User')
