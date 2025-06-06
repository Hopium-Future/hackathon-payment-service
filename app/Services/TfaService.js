const User = use('App/Models/User')
const speakeasy = require('speakeasy')

const Env = use('Env')

const AUTHENTICATOR_SECRET_KEY = Env.get('AUTHENTICATOR_SECRET_KEY')
if (!AUTHENTICATOR_SECRET_KEY) throw 'AUTHENTICATOR_SECRET_KEY not found!'
const Encryptor = require('simple-encryptor')(AUTHENTICATOR_SECRET_KEY)

exports.checkOtp = async function(options = { userId: '', secret: '' }, otp) {
    let authenticatorSecret
    if (options.secret) authenticatorSecret = options.secret
    else if (options.userId) {
        const user = await User.find(options.userId)
        if (!user.authenticator_secret) throw 'tfa is not enabled'
        authenticatorSecret = user.authenticator_secret
    } else {
        throw 'no user id is specified'
    }

    return speakeasy.totp.verify({
        secret: Encryptor.decrypt(authenticatorSecret),
        encoding: 'base32',
        token: otp,
        window: 1
    })
}

exports.encryptAuthenticatorSecret = function(secret) {
    return Encryptor.encrypt(secret)
}
