'use strict'

const {PlatformProvider, TransferNetwork} = use("App/Library/Enum")

const BaseModel = use('MongooseModel')

class DepositWithdraw extends BaseModel {
    static boot({schema}) {
        // Hooks:
        schema.pre('save', async function (next) {
            if (!this.metadata) {
                this.metadata = {}
            }
            if (!this.executeAt) {
                this.executeAt = new Date()
            }
        })
        // Indexes:
        this.index({userId: 1}, {background: true})
        this.index({type: 1}, {background: true})
        this.index({transactionId: 1}, {unique: true, background: true})
        this.index({ txId: 1, type: 1 }, { unique: true, background: true, partialFilterExpression: { txId: { $exists: true } } })
        // Virtuals, etc:
        // schema.virtual('something').get(.......)
    }

    static get schemaOptions() {
        return {timestamps: {createdAt: 'createdAt', updatedAt: 'createdAt'}}
    }

    static get schema() {
        return {
            executeAt: Date,
            type: Number,
            userId: Number,
            transactionId: String,
            transactionType: String,
            provider: String,
            assetId: Number,
            network: String,
            amount: Number,
            actualReceive: Number,
            fee: Object,
            from: Object,
            to: Object,
            status: Number,
            adminStatus: {type: Number, default: 1},
            txId: String,
            metadata: Object,
            isDeleted: Boolean,
            transferToRootStatus: {type: Boolean, default: false},
            transferToRootStatusAt: Date,
            createdAt: { type: Date, default: Date.now },
            updatedAt: Date,
            oldId: Number,
            usdValue: Number,
            code: String
        }
    }
}

module.exports = DepositWithdraw.buildModel('DepositWithdraw')

module.exports.Type = {
    Deposit: 1,
    Withdraw: 2
}
module.exports.Status = {
    Pending: 1,
    Success: 2,
    Declined: 3,
    DepositedWaitingForConfirmation: 4,
    TransferredWaitingForConfirmation: 5,
    WithdrawWaitingForBalance: 6, // When user withdraws, switches to this status when Nami's withdrawal wallet is not enough money
    WithdrawWaitingForApproval: 7 // Admin verify
}

module.exports.AdminStatus = {
    WaitingForApproval: 1,
    Approved: 2,
    Rejected: 3
}
module.exports.Provider = PlatformProvider
module.exports.Network = TransferNetwork
