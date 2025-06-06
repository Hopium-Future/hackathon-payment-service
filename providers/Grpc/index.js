'use strict'

const { ioc } = require('@adonisjs/fold')
const grpc = require('@grpc/grpc-js')
const protoLoader = require("@grpc/proto-loader")
const _ = require('lodash')

const DEFAULT_NAME = 'default'
const CONFIG_PREFIX = 'grpc'

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
        if (!config) throw new Error(`Grpc for config ${name} not found`)
        if (!config.host) throw new Error(`Grpc host for config ${name} not found`)

        /**
         * CREATE INSTANCE
         */
        const proto = protoLoader.loadSync(config.protoPath, {keepCase: true})
        const definition = grpc.loadPackageDefinition(proto)
        const instance = new definition[config.serviceName](config.host, grpc.credentials.createInsecure())
        promisifyAllForClient(instance, proto, config)
        /**
         * END
         */

        this._pool[name] = instance
        return instance
    }
}

function promisifyAllForClient (client, proto, config) {
    const listMethods = proto[config.serviceName]
    for (const key in listMethods) {
        if (!(listMethods.hasOwnProperty(key))) {
            return
        }
        const methodName = listMethods[key].originalName

        const customHandler = buildCustomHandlerForFunction(methodName, client, proto, config)
        if (!customHandler) {
            // Stole from https://github.com/zetogk/node-grpc-client/blob/master/index.js
            client[`${methodName}Async`] = (data, options = {}) => buildPromisify(options, client, methodName, data)
        }
    }
}

function buildCustomHandlerForFunction (methodName, client, proto, config) {
    if (methodName === 'createSubAccount') {
        client[`${methodName}Async`] = (...args) => {
            const dataToPass = {}
            const options = args[0]
            return buildPromisify(options, client, methodName, dataToPass)
        }
        return true
    }
    if (methodName === 'getDepositAddress') {
        client[`${methodName}Async`] = (...args) => {
            const dataToPass = {
                apiKey: args[0],
                apiSecret: args[1],
                coin: args[2],
                network: args[3]
            }
            const options = args[4]
            return buildPromisify(options, client, methodName, dataToPass)
        }
        return true
    }
    if (methodName === 'changeBalance') {
        client[`${methodName}Async`] = (...args) => {
            let _options = args[6]
            if (_options && typeof _options === 'object') {
                _options = JSON.stringify(_options)
            }

            const dataToPass = {
                userId: args[0],
                assetId: args[1],
                valueChange: args[2] || 0,
                lockedValueChange: args[3] || 0,
                category: args[4],
                note: args[5],
                options: _options
            }
            const options = args[7]
            return buildPromisify(options, client, methodName, dataToPass)
        }
        return true
    }
    if (methodName === 'genTransactionId') {
        client[`${methodName}Async`] = (...args) => {
            const dataToPass = { prefix: args[0] }
            const options = args[1]
            return buildPromisify(options, client, methodName, dataToPass)
                .then(data => _.get(data, 'result'))
        }
        return true
    }
    if (methodName === 'sendEmail') {
        client[`${methodName}Async`] = (...args) => {
            const dataToPass = {
                type: args[0],
                data: JSON.stringify(args[1])
            }
            const options = args[2]
            return buildPromisify(options, client, methodName, dataToPass)
        }
        return true
    }
    if (
        methodName === 'getAvailable'
        || methodName === 'getLocked'
        || methodName === 'getBalance'
    ) {
        client[`${methodName}Async`] = (...args) => {
            const dataToPass = {
                userId: args[0],
                assetId: args[1],
                walletType: args[2]
            }
            const options = args[3]
            return buildPromisify(options, client, methodName, dataToPass)
                .then(data => _.get(data, 'result'))
        }
        return true
    }
    if (
        methodName === 'getWallet'
    ) {
        client[`${methodName}Async`] = (...args) => {
            const dataToPass = {
                userId: args[0],
                assetId: args[1],
                walletType: args[2]
            }
            const options = args[3]
            return buildPromisify(options, client, methodName, dataToPass)
        }
        return true
    }
    if (
        methodName === 'rollbackWallet'
    ) {
        client[`${methodName}Async`] = (...args) => {
            const dataToPass = { transactions: args[0] }
            const options = args[1]
            return buildPromisify(options, client, methodName, dataToPass)
        }
        return true
    } else if (
        methodName === 'pushNotification' ||
        methodName === 'newNotification'
    ) {
        client[`${methodName}Async`] = (...args) => {
            const dataToPass = {
                title: args[0] ? JSON.stringify(args[0]) : null,
                message: args[1] ? JSON.stringify(args[1]) : null,
                userId: args[2],
                category: args[3],
                options: args[4] ? JSON.stringify(args[4]) : null,
            };
            const options = args[5];
            return buildPromisify(options, client, methodName, dataToPass);
        }
        return true;
    }
}

function buildPromisify (options, client, methodName, dataToPass) {
    let metadataGrpc = {}
    if (options && ('metadata' in options) && (typeof options.metadata === 'object')) {
        metadataGrpc = generateMetadata(options.metadata)
    }
    return new Promise((resolve, reject) => {
        client[methodName](dataToPass, metadataGrpc, (err, data) => {
            if (err) {
                return reject(err)
            }
            resolve(parseFromRpc(data))
        })
    })
}

function parseFromRpc (data) {
    if (!data || typeof data !== 'object') {
        return data
    }
    if (data.createdAt != null) {
        data.createdAt = parseDateFromRpc(data.createdAt)
    }
    if (data.updatedAt != null) {
        data.updatedAt = parseDateFromRpc(data.updatedAt)
    }
    return data
}

const generateMetadata = metadata => {
    const metadataGrpc = new grpc.Metadata()
    for (const [key, val] of Object.entries(metadata)) {
        metadataGrpc.add(key, val)
    }
    return metadataGrpc
}

function parseDateFromRpc (data) {
    return new Date(+data)
}
