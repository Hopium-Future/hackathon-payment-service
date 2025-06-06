'use strict'

const Model = use('MongooseModel')
const RedisCache = use('Redis')
    .connection('cache')
const Logger = use('Logger')
const Promise = require('bluebird')
const _ = require('lodash')
const glob = require("glob")
const path = require('path')

const Helpers = use('Helpers')
const prefix = 'cache_model::'
let cacheActive = true
// let cacheActive = process.env.NODE_ENV === 'production'
const REDIS_PREFIX = _.get(RedisCache, '_config.keyPrefix', '')
if (REDIS_PREFIX) {
    console.error('CACHE REDIS PREFIX must not be set!')
}

async function getExistingKeyWithPattern (pattern, countMax = 10 ** 3, TIMEOUT = 5000) {
    let cursor = 0
    const
        keys = []
    let count = 0
    const COUNT_MAX = countMax
    const DATE_START = Date.now()
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
        if (_.get(e, 'message', '')
            .includes('Wrong number of args')) {
            // No keys found error, just ignore this
            return
        }
        console.error('Cache remove all keys err removeAllKeysWithPattern', e)
    }
}

class BaseModel extends Model {
    static buildCacheKey (fnName, args) {
        return `${this.modelName || this.name}.${fnName}.${JSON.stringify(args)}`
    }

    static getModelName () {
        return this.modelName
    }

    static async setCacheData (key, data, ttl = 1000000) {
        if (!data) return
        const _key = `${prefix}.${key}`
        if (ttl) {
            await RedisCache.setex(_key, ttl / 1000, JSON.stringify(data))
        } else {
            await RedisCache.set(_key, JSON.stringify(data))
        }
    }

    static async getCacheData (key) {
        if (!cacheActive) return null
        const _key = `${prefix}.${key}`
        const result = await RedisCache.get(_key)

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
                    filterTexts.push(JSON.stringify(filter)
                        .slice(1, -1))
                    break
                default:
                    break
                }
            })
        }

        const functionsList = [
            `${this.modelName}.getList`
        ]
        switch (type) {
        case BaseModel.CacheType.MODEL_USER:
            functionsList.push('User.getList')
            break
        default:
            break
        }

        console.log('CACHE reset', functionsList)
        console.log('CACHE reset', filterTexts)
        if (functionsList && functionsList.length) {
            // Tìm và invoke hết lại đám hàm cache
            await Promise.map(functionsList, async (func, index) => {
                // 1. Tìm cache tương ứng với hàm
                const startsWith = `${prefix}.${func}.`
                let cacheKeys
                if (filterTexts.length) {
                    const data = await Promise.map(filterTexts, async filterText => {
                        const pattern = `${startsWith}*${filterText}*`
                        const {
                            keys: allKeys,
                            fullReceived
                        } = await getExistingKeyWithPattern(pattern)
                        if (!fullReceived) {
                            console.log(`Cache cannot scan all keys ${pattern} in time, remove all`)
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
                    const {
                        keys: allKeys,
                        fullReceived
                    } = await getExistingKeyWithPattern(pattern)
                    if (!fullReceived) {
                        console.log(`Cache cannot scan all keys ${pattern} in time, remove all`)
                        await removeAllKeysWithPattern(pattern)
                        cacheKeys = []
                    } else {
                        cacheKeys = allKeys
                    }
                }
                console.log(`CACHE keys to reinvoke, index=${index}`, `length=${cacheKeys.length}`)

                // 2. Giữ lại N thằng đầu trong list, xóa hết những thằng khác
                const toDeleteKeys = cacheKeys.splice(MAX_CACHES_ON_RESET)

                // 3. Xóa + re-invoke
                async function reinvoke (cacheKey) {
                    try {
                        console.log('CACHE reinvoke', cacheKey)
                        const args = JSON.parse(cacheKey.substring(startsWith.length))
                        const [model, fnName] = func.split('.')
                        const root = `${Helpers.appRoot()}/app/Models`
                        const mp = await new Promise((resolve, reject) => {
                            glob(`${root}/**/${model}.js`, { absolute: false }, (error, files) => {
                                if (error) resolve(null)
                                const [file] = files
                                if (!file) resolve(null)
                                resolve(path.relative(root, file)
                                    .replace('.js', ''))
                            })
                        })

                        if (!mp) return

                        const M = use(`App/Models/${mp}`)
                        M.setCacheActive(false)
                        await M[fnName](..._.map(args, arg => arg)) // Convert args to array and re-invoke
                        M.setCacheActive(true)
                    } catch (err) {
                        console.error('CACHE REINVOKE ERROR', err)
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

module.exports = BaseModel

BaseModel.CacheType = { MODEL_USER: 'MODEL_USER' }
