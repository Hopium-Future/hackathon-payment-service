const NodeCache = require('node-cache')

class MemoryCache {
    constructor (ttlSeconds) {
        this.cache = new NodeCache({
            stdTTL: ttlSeconds,
            checkperiod: ttlSeconds * 0.2,
            useClones: false
        })
    }

    get (key, storeFunction) {
        const value = this.cache.get(key)
        if (value) {
            return Promise.resolve(value)
        }

        return storeFunction()
            .then(result => {
                this.cache.set(key, result)
                return result
            })
    }

    del (keys) {
        this.cache.del(keys)
    }

    delKeys (pattern) {
        if (!pattern) {
            return
        }
        const keys = this.cache.keys()
        // eslint-disable-next-line no-restricted-syntax
        for (const key of keys) {
            if (key.indexOf(pattern) >= 0) {
                this.del(key)
            }
        }
    }

    delStartWith (startStr = '') {
        if (!startStr) {
            return
        }

        const keys = this.cache.keys()
        // eslint-disable-next-line no-restricted-syntax
        for (const key of keys) {
            if (key.indexOf(startStr) === 0) {
                this.del(key)
            }
        }
    }

    flush () {
        this.cache.flushAll()
    }
}

module.exports = MemoryCache
