const { hooks } = require('@adonisjs/ignitor')
const _ = require('lodash')

hooks.after.providersBooted(() => {
    global.Logger = use('Logger')
    global._ = _
    global.OwnError = use('App/Exceptions/OwnError')
    _.mixin({
        memoizeDebounce (func, wait = 0, options = {}) {
            const mem = _.memoize(() => _.debounce(func, wait, options), options.resolver)
            return function() {
                mem.apply(this, arguments)
                    .apply(this, arguments)
            }
        },
        memoizeThrottle (func, wait = 0, options = {}) {
            const mem = _.memoize(() => _.throttle(func, wait, options), options.resolver)
            return function() {
                mem.apply(this, arguments)
                    .apply(this, arguments)
            }
        }
    })
    bindResponse()
})

hooks.after.httpServer(async () => {
    use('App/Services/OnchainWithdrawService').initWithdrawalQueue()
    use('App/Services/CacheService').subscribeChange()
    const socket = use('App/Library/Socket/SocketClientToMainServer')
    socket.init()
    Logger.info('server start nami-exchange-payment')
})

function bindResponse () {
    const Response = use('Adonis/Src/Response')

    Response.prototype.sendSuccess = function(data) {
        this.send({
            status: 'ok',
            data
        })
    }
    Response.prototype.sendError = function(status = null) {
        const responseData = { status: 'error' }
        if (status) responseData.status = status
        this.status(status)
            .send(responseData)
    }
    Response.prototype.sendDetailedError = function(obj = {}, contextCode) {
        const _error = _.defaults(obj, {
            status: 400,
            code: 400,
            data: null,
            message: null
        })
        const {
            code,
            data,
            message,
            status
        } = _error
        this.send({
            status: (typeof message === 'string' || typeof message === 'number') ? message : undefined,
            code,
            data,
            message: (typeof message === 'string' || typeof message === 'number') ? message : undefined
        })
    }
}
