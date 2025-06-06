'use strict'

const { HttpException } = require('@adonisjs/generic-exceptions')

class GeneralException extends HttpException {
}

module.exports = GeneralException

GeneralException.Error = {
    BAD_REQUEST: { status: 400, message: 'BAD_REQUEST' },
    UNAUTHORIZED: { status: 401, message: 'UNAUTHORIZED' },
    FORBIDDEN: { status: 403, message: 'FORBIDDEN' },
    NOT_FOUND: { status: 404, message: 'NOT_FOUND' },
    IP_BANNED: { status: 418, message: 'IP_BANNED' },
    TOO_MANY_REQUEST: { status: 429, message: 'TOO_MANY_REQUEST' },
    INTERNAL_SERVER_ERROR: { status: 500, message: 'INTERNAL_SERVER_ERROR' },
    SERVICE_UNAVAILABLE: { status: 503, message: 'SERVICE_UNAVAILABLE' }
}
