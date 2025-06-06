'use strict'

const ms = require('ms')
const _ = require('lodash')

class Hook {
    async handle ({
        request,
        response
    }, next) {
        if (response) {
            response.sendSuccess = data => {
                response.send({
                    status: 'ok',
                    data
                })
            }

            response.sendError = (errStatus, data, errMessage = null) => {
                response.send({
                    status: (errStatus && errStatus !== 'ok' && (typeof errStatus === 'string' || typeof errStatus === 'number'))
                        ? errStatus
                        : 'error',
                    data,
                    message: errMessage
                })
            }

            response.sendDetailedError = (obj = {}) => {
                const _error = _.defaults(obj, {
                    status: 400,
                    code: null,
                    data: null,
                    message: null
                })
                const {
                    code,
                    message,
                    status,
                    data
                } = _error
                response.send({
                    status,
                    code,
                    data,
                    message
                })
            }
        }

        await next()
    }

    async wsHandle ({ socket }, next) {
        socket.emitSuccess = (event, data) => {
            socket.emit(event || socket.topic, {
                status: 'ok',
                data
            })
        }
        socket.emitError = (event, errMessage, data) => {
            socket.emit(event || socket.topic, {
                status: (errMessage && errMessage !== 'ok' && (typeof errMessage === 'string' || typeof errMessage === 'number'))
                    ? errMessage
                    : 'error',
                data
            })
        }

        await next()
    }
}

module.exports = Hook
