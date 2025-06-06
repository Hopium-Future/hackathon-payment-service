'use strict'

const {
    PlatformProvider,
    TransferNetwork
} = use("App/Library/Enum")
// const BaseModel = use('App/Models/BaseModelMongo')
const BaseModel = use('MongooseModel')
const Env = use('Env')
const decryptionKey = Env.get('BINANCE_SECRET_DECRYPTION_KEY')
if (!decryptionKey) {
    throw new Error('PRIVATE_WALLET_DECRYPTION_KEY not found')
}
const _ = require('lodash')
const Encryptor = require('simple-encryptor')(decryptionKey)

const {
    UserBinanceAccountStatus,
} = use("App/Library/Enum")
class UserBinanceAccount extends BaseModel {
    static boot ({ schema }) {
        // Hooks:
        schema.pre('save', async function(next) {
            if (this.apiKey && this.isModified('apiKey')) this.apiKey = Encryptor.encrypt(this.apiKey)
            if (this.apiSecret && this.isModified('apiSecret')) this.apiSecret = Encryptor.encrypt(this.apiSecret)
            if (this.tfaSecret && this.isModified('tfaSecret')) this.tfaSecret = Encryptor.encrypt(this.tfaSecret)

        })
    }

    static get schema () {
        return {
                    accountId: String,
                    apiKey: String,
                    apiSecret: String,
                    email: String,
                    status: Number,
                    subAccountId: String,
                    type: Number,
                    userId: Number,
                }

    }
    static async getOne (options = {}) {
        const [item] = await this.getList(options, 1, 1)
        return item
    }

    // eslint-disable-next-line no-unused-vars
    static async getList (options = {}, pageIndex = 1, pageSize = 10) {
        // eslint-disable-next-line prefer-rest-params
        const records = await this.find(_.pick(options, ['id', 'status', 'userId', 'accountId', 'type'])).read('s')
        const result = []

        if (records.length > 0) {
            // eslint-disable-next-line no-restricted-syntax
            for (const item of records) {
                const returnItem = {
                    userId: item.userId,
                    depositAddess: item.depositAddess,
                    status: item.status,
                    type: item.type,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    masterAccountId: item.masterAccountId,
                    subAccountId: item.subAccountId,
                }
                if (options.getSecretInformation === 1) {
                    returnItem.apiKey = Encryptor.decrypt(item.apiKey)
                    returnItem.apiSecret = Encryptor.decrypt(item.apiSecret)
                    returnItem.tfaSecret = Encryptor.decrypt(item.tfaSecret)
                    returnItem.accountId = item.accountId
                }
                result.push(returnItem)
            }
        }
        return result
    }
    static async activeUserBinanceAccount (userId) {
        // Transaction
        try {
            // Check if having binance account already
            const exitingAccount = await this.findOne({ status: UserBinanceAccountStatus.ACTIVE, userId: userId, type: this.Type.NORMAL })
            console.log({ status: UserBinanceAccountStatus.ACTIVE, userId: userId, type: this.Type.NORMAL }, exitingAccount)
            if (exitingAccount) {
                // await this.addSocketSubcribe(exitingAccount.id);
                return {
                    userId: exitingAccount.userId,
                    status: exitingAccount.status
                }
            }

            let inActiveAccount = await this.findOne({
                status: UserBinanceAccountStatus.INACTIVE,
                userId: null,
            }).sort({createdAt: -1}).limit(1)
            if (!inActiveAccount) {
                Logger.info(`Activating user binance account for user #${userId} but no account is available, creating new one…`)
                throw 'SUB_ACCOUNT_ID_NOT_EXIST'
            }

            if (inActiveAccount.userId == null) {
                inActiveAccount.userId = userId
            }
            inActiveAccount.status = UserBinanceAccountStatus.ACTIVE
            await this.findOneAndUpdate({_id: inActiveAccount._id}, {$set: {userId, status: UserBinanceAccountStatus.ACTIVE}})
            Logger.notice('FUTURE_ACTIVE_ACCOUNT', { log_type: 'FUTURE_ACTIVE_ACCOUNT', userId: userId, account_id: inActiveAccount.accountId })
            return {
                userId: inActiveAccount.userId,
                status: inActiveAccount.status
            }
        } catch (e) {
            Logger.error('activeUserBinanceAccount ERROR :   ', e)
            throw e
        } finally {
        }
    }
}

module.exports = UserBinanceAccount.buildModel('UserBinanceAccount')

module.exports.Provider = PlatformProvider
module.exports.Network = TransferNetwork

module.exports.Status = {
    INACTIVE: 0,
    ACTIVE: 1,
    BANNED: 2
}
module.exports.Type = {
    NORMAL: 0,
    FUTURE_50_PROMOTE: 1 // Chuong trinh khuyen mai cho 50 user
}


