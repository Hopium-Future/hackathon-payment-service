'use strict'
const Env = use('Env')
const Decryptor = require('simple-encryptor')(Env.get('PRIVATE_WALLET_DECRYPTION_KEY') ? Env.get('PRIVATE_WALLET_DECRYPTION_KEY') : 'abcabcabcabcabcabcabc').decrypt

module.exports = {
    default: {
        apiHost: Env.get('DEPOSIT_KARDIA_NETWORK') !== 'mainnet' ? 'https://kai-ecosystem-1.kardiachain.io/' : 'https://kai-ecosystem-1.kardiachain.io/',
        network: Env.get('DEPOSIT_KARDIA_NETWORK'),
        withdrawPrivateKey: Env.get('WITHDRAW_KARDIA_PRIV_KEY') ? Decryptor(Env.get('WITHDRAW_KARDIA_PRIV_KEY')) : undefined,
    }
}
