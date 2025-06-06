'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */

/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */

const Logger = use('Logger')
const jwt = require('jsonwebtoken')
const SysNoti = use('App/Library/SysNoti')


class CheckBearer {
    /**
     * @param {object} ctx
     * @param {Request} ctx.request
     * @param {Function} next
     */
    async handle({request, response}, next, [alType, secret, issuer]) {
        try {
            const authToken = request.header('Authorization');
            if (!authToken) {
                return response.status(401).send({
                    status: 'Unauthorized',
                });
            }

            const authSpaceIndex = authToken.indexOf(' ');
            const authPrefix = authToken.substring(0, authSpaceIndex);
            if (authPrefix !== 'Bearer') {
                return response.status(401).send({
                    status: 'Unauthorized',
                });
            }
            const token = authToken.substring(authSpaceIndex + 1);

            if (alType === 'jwt') {
                const jwtOptions = {
                    maxAge: '30s',
                };
                if (issuer) {
                    jwtOptions.issuer = issuer;
                }
                try {
                    const verify = jwt.verify(token, secret, jwtOptions)
                } catch (e) {
                    Logger.error('Check bearer ' + issuer, e.message);
                    SysNoti.notify(`<@U7TRL8XSQ> ${issuer} check bearer error: ${e.message}`);
                    return response.status(401).send({
                        status: 'Unauthorized',
                    });
                }
            } else if (alType === 'fixed') {
                if (token !== secret) {
                    return response.status(401).send({
                        status: 'Unauthorized',
                    });
                }
            }
            await next()
        } catch (e) {
            Logger.error(e);
            return response.sendError();
        }
    }
}

module.exports = CheckBearer
