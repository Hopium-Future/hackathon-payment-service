'use strict'

const proxyHandler = exports = module.exports = {
    get: (target, name) => {
        if (typeof (name) === 'symbol' || name === 'inspect') {
            return target[name]
        }

        if (typeof (target[name]) !== 'undefined') {
            return target[name]
        }

        const targetConnection = target.connection()
        if (typeof (targetConnection[name]) === 'function') {
            return targetConnection[name].bind(targetConnection)
        } if (targetConnection[name] !== undefined) {
            return targetConnection[name]
        }

        return target.connection(name)
    }
}
