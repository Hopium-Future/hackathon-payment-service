'use strict'
const { ioc } = require('@adonisjs/fold')
const Queue = require('bee-queue');

const DEFAULT_NAME = 'withdraw'
const CONFIG_PREFIX = 'beequeue'

module.exports = class {
    constructor (Config, name) {
        this.Config = Config
        this._pool = {}

        return new Proxy(this, require('./proxyHandler'))
    }

    connection (name) {
        if (!name) name = DEFAULT_NAME

        if (this._pool[name]) {
            return this._pool[name]
        }

        let config = this.Config.get(`${CONFIG_PREFIX}.${name}`)
        if (!config) config = this.Config.get(`${CONFIG_PREFIX}.${DEFAULT_NAME}`)

        /**
         * CREATE INSTANCE
         */
        const queue = new Queue(name, config)
        /**
         * END
         */

        this._pool[name] = queue
        return queue
    }
}
