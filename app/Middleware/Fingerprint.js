'use strict'

const Env = use('Env')
const Logger = use('Logger')

class Fingerprint {
    async handle (ctx, next) {
        const { request } = ctx
        try {
            const fingerprint = request.header('AppFingerprint')
            if (fingerprint) {
                switch (fingerprint) {
                case Env.get('APP_FINGERPRINT'): {
                    ctx.deviceType = 'mobile_app'
                    ctx.isMobileApp = true
                } break
                }
            }
        } catch (err) {
            Logger.error(err)
        } finally {
            // call next to advance the request
            await next()
        }
    }
}

module.exports = Fingerprint
