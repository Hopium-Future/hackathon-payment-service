'use strict'

const BaseModel = use('MongooseModel')
const Env = use('Env')
const decryptionKey = Env.get('PRIVATE_WALLET_DECRYPTION_KEY')
if (!decryptionKey) {
    throw new Error('PRIVATE_WALLET_DECRYPTION_KEY not found')
}
const Encryptor = require('simple-encryptor')(decryptionKey)

class UserPrivateWallet extends BaseModel {
    static boot ({ schema }) {
        // Hooks:
        schema.pre('save', async function(next) {
            if (this.privateKey && this.isModified('privateKey')) {
                this.privateKey = Encryptor.encrypt(this.privateKey)
            }
            if (this.address) {
                this.normalizedAddress = this.address.toLowerCase()
            }
        })
        schema.post('find', async function(next) {
            if (this.privateKey) {
                this.privateKey = Encryptor.decrypt(this.privateKey)
            }
        })
        // Indexes:
        this.index({
            type: 1,
            userId: 1,
            assetId: 1,
            network: 1,
            provider: 1
        }, {
            unique: true,
            background: true
        })
        // Virtuals, etc:
        // schema.virtual('something').get(.......)
    }

    static get schema () {
        return {
            type: Number,
            userId: Number,
            assetId: Number,
            network: String,
            lastSeen: Date,

            address: String,
            normalizedAddress: {
                type: String,
                index: true
            },
            addressTag: {
                type: String,
                index: true
            },
            privateKey: {
                type: String,
                select: false
            },
            cryptography: String,
            provider: String,

            lastTimeTransferToRoot: Date,
            transferToRootStatus: Number
        }
    }
}

module.exports = UserPrivateWallet.buildModel('UserPrivateWallet')

module.exports.Type = {
    Deposit: 1
}
