'use strict'

const DwConfig = use('App/Models/DwConfig')
const LRU = require('lru-cache')
const _ = require('lodash')

const ConfigCache = new LRU({ maxAge: 60 * 1000 })
class ConfigController {
    async getConfig ({ request, response }) {
        const { assetId } = request.get()

        const allConfig = await this.getAllConfig()
        if (!assetId) {
            return response.sendSuccess(allConfig)
        }
        return response.sendSuccess(allConfig[assetId])
    }

    async getAllConfig () {
        const cached = ConfigCache.get('*')
        if (cached) {
            return cached
        }
        const result = await DwConfig.getListCached()
        const keyResult = _.keyBy(result, 'assetId')
        ConfigCache.set('*', keyResult)
        return keyResult
    }
}

module.exports = ConfigController
