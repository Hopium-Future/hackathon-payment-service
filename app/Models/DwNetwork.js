const BaseModel = use('App/Models/BaseModelMongo')
const mongoose = require('mongoose')

const { Schema } = mongoose

module.exports.DwNetworkSchema = mongoose.Schema({
    provider: {
        type: String,
        index: true
    },
    network: { type: "String" },
    coin: { type: "String" },
    withdrawIntegerMultiple: { type: Number },
    isDefault: { type: "Boolean" },
    depositEnable: { type: "Boolean" },
    withdrawEnable: { type: "Boolean" },
    depositDesc: { type: "String" },
    withdrawDesc: { type: "String" },
    specialTips: { type: "String" },
    name: { type: "String" },
    resetAddressStatus: { type: "Boolean" },
    addressRegex: { type: "String" },
    memoRegex: { type: "String" },
    withdrawFee: { type: "String" },
    withdrawMin: { type: "String" },
    withdrawMax: { type: "String" },
    minConfirm: { type: "Number" },
    unLockConfirm: { type: "Number" }
})


class DwNetwork extends BaseModel {
    /**
     * Wallet's schema
     */

    static get schema () {
        return {
            provider: {
                type: String,
                index: true
            },
            network: { type: "String" },
            coin: { type: "String" },
            withdrawIntegerMultiple: { type: Number },
            isDefault: { type: "Boolean" },
            depositEnable: { type: "Boolean" },
            withdrawEnable: { type: "Boolean" },
            depositDesc: { type: "String" },
            withdrawDesc: { type: "String" },
            specialTips: { type: "String" },
            name: { type: "String" },
            resetAddressStatus: { type: "Boolean" },
            addressRegex: { type: "String" },
            memoRegex: { type: "String" },
            withdrawFee: { type: "String" },
            withdrawMin: { type: "String" },
            withdrawMax: { type: "String" },
            minConfirm: { type: "Number" },
            unLockConfirm: { type: "Number" }
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

module.exports = DwNetwork.buildModel('DwNetwork')

module.exports.Network = {
    BSC: 'BSC',
    KAI: 'KAI',
    ETH: 'ETH',
    ONUS: 'ONUS',
    TON: 'TON',
}
