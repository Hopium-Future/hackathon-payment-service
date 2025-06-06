'use strict'

const GeneralException = use('App/Exceptions/GeneralException')
// const sentry = use('Sentry')
/**
 * This class handles all exceptions thrown during
 * the HTTP request lifecycle.
 *
 * @class ExceptionHandler
 */
class ExceptionHandler {
    /**
     * Handle exception thrown during the HTTP lifecycle
     *
     * @method handle
     *
     * @param  {Object} error
     * @param  {Object} options.request
     * @param  {Object} options.response
     *
     * @return {void}
     */
    async handle (error, { request, response }) {
        try {
            if (error instanceof OwnError) {
                console.error(`OwnError on ${request.originalUrl()} :`, error.message)
                response.sendDetailedError(error)
            } else {
                console.error(`Unknown error on ${request.originalUrl()}`, error)
                response.sendError()
            }
        } catch (err) {
            console.error('Error in error handler', error)
        }
    }

    /**
     * Report exception for logging or debugging.
     *
     * @method report
     *
     * @param  {Object} error
     * @param  {Object} options.request
     *
     * @return {void}
     */
    async report (error, { request }) {
        // console.error('Adonis handle', error)
        // sentry.captureException(error)
    }
}

module.exports = ExceptionHandler
