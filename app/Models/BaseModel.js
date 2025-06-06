'use strict'

const Model = use('Model')
// Hien tai chi moi Symbol su dung Model nay
const RedisCache = use('Redis').connection('cache')
const Logger = use('Logger')
const Promise = require('bluebird')
const _ = require('lodash')

const REDIS_PREFIX = _.get(RedisCache, '_config.keyPrefix', '')
const prefix = 'cache:model'
let cacheActive = false
if (REDIS_PREFIX) {
    Logger.warn('CACHE REDIS PREFIX must not be set!')
}

class BaseModel extends Model {
    static _bootIfNotBooted () {
        if (this.name !== "BaseModel") {
            super._bootIfNotBooted()
        }
    }

    constructor (props) {
        super(props)
    }

    static buildCacheKey (fnName, args) {
        return `${this.name}.${fnName}.${JSON.stringify(args)}`
    }

    static async setCacheData (key, data, ttl = 1000000) {
        if (!data) return

        key = `${prefix}.${key}`
        if (ttl) {
            await RedisCache.setex(key, ttl / 1000, JSON.stringify(data))
        } else {
            await RedisCache.set(key, JSON.stringify(data))
        }
    }

    static async getCacheData (key) {
        if (!cacheActive) return null
        key = `${prefix}.${key}`
        const result = await RedisCache.get(key)

        if (!result) return null

        try {
            const obj = JSON.parse(result)
            if (obj.__meta__) obj.$sideLoaded = obj.__meta__
            return obj
        } catch (ignored) {
            return result
        }
    }

    static setCacheActive (active = true) {
        cacheActive = active
    }

    static async resetCache (type, ...filters) {
        const MAX_CACHES_ON_RESET = 150

        const filterTexts = []
        if (filters) {
            filters.forEach(filter => {
                switch (typeof filter) {
                case 'string':
                    filterTexts.push(filter)
                    break
                case 'number':
                    filterTexts.push(filter)
                    break
                case 'object':
                    filterTexts.push(JSON.stringify(filter).slice(1, -1))
                    break
                }
            })
        }

        let functionsList
        switch (type) {
        case BaseModel.CacheType.MODEL_SYMBOL:
            functionsList = [
                'Symbol.getList'
            ]
            break
        case BaseModel.CacheType.MODEL_USER_BITMEX_ACCOUNT:
            functionsList = [
                'UserBitmexAccount.getList'
            ]
            break
        case BaseModel.CacheType.MODEL_USER_BINANCE_ACCOUNT:
            functionsList = [
                'UserBinanceAccount.getList'
            ]
            break
        case BaseModel.CacheType.MODEL_USER_API_KEY:
            functionsList = [
                'UserApiKey.getList'
            ]
            break
        case BaseModel.CacheType.MODEL_USER:
            functionsList = [
                'User.getUser'
            ]
            break
        case BaseModel.CacheType.MODEL_CODE:
            functionsList = [
                "Code.getCode"
            ]
            break
        case BaseModel.CacheType.MODEL_STAKE:
            functionsList = [
                'Stake.getPoolUsers',
                'Stake.getStakeInterestHistory',
                'Stake.getStakeRevenueHistory',
                'Stake.getPoolCandidateUsers'
            ]
            break
        case BaseModel.CacheType.MODEL_CODE_CATEGORY:
            functionsList = [
                "CodeCategory.getCodeCategory"
            ]
            break
        case BaseModel.CacheType.MODEL_TASK_LOG:
            functionsList = [
                "TaskLog.getTaskLog"
            ]
            break
        case BaseModel.CacheType.HOMEPAGE:
            functionsList = [
                "Home.get24hSpinAmount",
                "Home.getSpinValuePercentage",
                "Home.get24hReward",
                "Home.getDepositHistory",
                "Home.getWithdrawHistory"
            ]
            break
        case BaseModel.CacheType.MODEL_NEWS:
            functionsList = [
                "News.getNews"
            ]
            break
        case BaseModel.CacheType.MODEL_USER_METAMASK:
            functionsList = [
                "UserMetamask.getUserMetamask"
            ]
            break
        case BaseModel.CacheType.MODEL_CAMPAIGN_HISTORY:
            functionsList = [
                "CampaignHistory.getBuyBackHistory"
            ]
            break
        default:
            break
        }

        Logger.debug('CACHE reset', functionsList)
        Logger.debug('CACHE reset', filterTexts)
        if (functionsList && functionsList.length) {
            // Tìm và invoke hết lại đám hàm cache
            await Promise.map(functionsList, async (func, index) => {
                // 1. Tìm cache tương ứng với hàm
                const startsWith = `${prefix}.${func}.`
                let cacheKeys
                if (filterTexts.length) {
                    const data = await Promise.map(filterTexts, async filterText => {
                        const pattern = `${startsWith}*${filterText}*`
                        const { keys: allKeys, fullReceived } = await getExistingKeyWithPattern(pattern)
                        if (!fullReceived) {
                            Logger.debug(`Cache cannot scan all keys ${pattern} in time, remove all`)
                            await removeAllKeysWithPattern(pattern)
                            return []
                        }
                        return allKeys
                    })
                    cacheKeys = []
                    data.forEach(p => {
                        cacheKeys.push(...p)
                    })
                    cacheKeys = _.uniq(cacheKeys)
                } else {
                    const pattern = `${startsWith}*`
                    const { keys: allKeys, fullReceived } = await getExistingKeyWithPattern(pattern)
                    if (!fullReceived) {
                        Logger.debug(`Cache cannot scan all keys ${pattern} in time, remove all`)
                        await removeAllKeysWithPattern(pattern)
                        cacheKeys = []
                    } else {
                        cacheKeys = allKeys
                    }
                }
                Logger.debug(`CACHE keys to reinvoke, index=${index}`, `length=${cacheKeys.length}`)

                // 2. Giữ lại N thằng đầu trong list, xóa hết những thằng khác
                const toDeleteKeys = cacheKeys.splice(MAX_CACHES_ON_RESET)

                // 3. Xóa + re-invoke
                async function reinvoke (cacheKey) {
                    try {
                        Logger.debug('CACHE reinvoke', cacheKey)
                        const args = JSON.parse(cacheKey.substring(startsWith.length))
                        const [model, fnName] = func.split('.')

                        const M = use(`App/Models/${model}`)
                        M.setCacheActive(false)
                        await M[fnName](..._.map(args, arg => arg)) // Convert args to array and re-invoke
                        M.setCacheActive(true)
                    } catch (err) {
                        Logger.warning('CACHE REINVOKE ERROR', err)
                        await RedisCache.del(cacheKey)
                    }
                }

                await Promise.all([
                    toDeleteKeys.length ? RedisCache.del(toDeleteKeys) : Promise.resolve(),
                    Promise.map(cacheKeys, reinvoke)
                ])
            })
        }
    }
}

async function getExistingKeyWithPattern (pattern, countMax = 10 ** 3, TIMEOUT = 5000) {
    let cursor = 0; const
        keys = []
    let count = 0
    const COUNT_MAX = countMax
    const DATE_START = Date.now()
    const timeFromStart = 0
    do {
        const [_cursor, scannedKeys] = await RedisCache.scan(cursor, 'match', pattern, 'count', 1)
        cursor = _cursor
        if (scannedKeys) {
            keys.push(...scannedKeys)
        }

        ++count
    } while (cursor !== '0' && count < COUNT_MAX && (Date.now() - DATE_START < TIMEOUT))
    return {
        keys,
        fullReceived: cursor === '0'
    }
}

async function removeAllKeysWithPattern (pattern) {
    try {
        await RedisCache.eval(
            `return redis.call('del', unpack(redis.call('keys', ARGV[1])))`,
            0,
            pattern
        )
    } catch (e) {
        if (_.get(e, 'message', '').includes('Wrong number of args calling Redis command From Lua script')) {
            // No keys found error, just ignore this
            return
        }
        Logger.error('Cache remove all keys err removeAllKeysWithPattern', e)
    }
}

module.exports = BaseModel

BaseModel.CacheType = {
    MODEL_SYMBOL: 'MODEL_SYMBOL',
    MODEL_USER: 'MODEL_USER',
    MODEL_CODE: 'MODEL_CODE',
    MODEL_CODE_CATEGORY: 'MODEL_CODE_CATEGORY',
    MODEL_TASK_LOG: 'MODEL_TASK_LOG',
    MODEL_CHALLENGE_ROOM: 'MODEL_CHALLENGE_ROOM',
    HOMEPAGE: 'HOMEPAGE',
    MODEL_USER_METAMASK: 'MODEL_USER_METAMASK',
    MODEL_NEWS: 'MODEL_NEWS',
    MODEL_CAMPAIGN_HISTORY: 'MODEL_CAMPAIGN_HISTORY',
    MODEL_USER_BITMEX_ACCOUNT: 'MODEL_USER_BITMEX_ACCOUNT',
    MODEL_USER_BINANCE_ACCOUNT: 'MODEL_USER_BINANCE_ACCOUNT',
    MODEL_USER_API_KEY: 'MODEL_USER_API_KEY',
    MODEL_STAKE: 'MODEL_STAKE'
}
