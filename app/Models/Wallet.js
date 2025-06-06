const BaseModel = use('MongooseModel')

/**
 * @class Wallet
 */
class Wallet extends BaseModel {
    /**
     * Wallet's schema
     */

    static get schema () {
        return {
            userId: Number,
            assetId: Number,
            walletType: String,
            value: { type: Number, default: 0 },
            lockedValue: { type: Number, default: 0 }
        }
    }

    static boot ({ schema }) {
        // Hooks:
        // this.addHook('preSave', () => {})
        // Indexes:
        // Virtuals, etc:
        // schema.virtual('something').get(.......)
    }
}

module.exports = Wallet.buildModel('Wallet')
