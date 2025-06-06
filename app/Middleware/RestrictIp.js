'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */
const Logger = use('Logger')
class RestrictIp {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request, response }, next, allowIps) {
    // call next to advance the request

    if (allowIps && allowIps.length) {
      const reqIp = request.header('cf-connecting-ip') || request.ip() || request.header('x-forwarded-for') ||
          request.request.connection.remoteAddress;
      if (!allowIps.includes(reqIp)) {
        Logger.error(`Request ${request.url()} blocked due to restricted ip: ${reqIp} not in ${allowIps.join(', ')}`);
        return response.status(401).send({
          status: 'Unauthorized',
        });
      }
    }

    await next()
  }
}

module.exports = RestrictIp
