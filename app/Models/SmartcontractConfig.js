const BaseModel = use('App/Models/BaseModelMongo')
const mongoose = require('mongoose')

const { Schema } = mongoose

class SmartcontractConfig extends BaseModel {
    /**
     * Wallet's schema
     */

    static get schema () {
        return {
            address: String,
            decimals: Number,
            networkId: Schema.ObjectId,
            assetId: Number,
            masterAssetId: Number,
            addressExplorerUrl: String,
            txExplorerUrl: String
        }
    }

    static boot ({ schema }) {
        // Hooks:
        // this.addHook('preSave', () => {})
        // Indexes:
        this.index({ assetId: 1 }, { background: true })
        this.index({ networkId: 1 }, { unique: true, background: true })
        // Virtuals, etc:
        // schema.virtual('something').get(.......)
    }
}

module.exports = SmartcontractConfig.buildModel('SmartcontractConfig')
