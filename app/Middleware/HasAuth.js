'use strict'

const GeneralException = use('App/Exceptions/GeneralException')

class HasAuth {
    async handle ({
        user,
        request,
        response
    }, next) {
        if (!user || !user.id) {
            return response.status(GeneralException.Error.UNAUTHORIZED.status)
                .send({ status: GeneralException.Error.UNAUTHORIZED.message })
        }
        await next()
    }
}

module.exports = HasAuth
