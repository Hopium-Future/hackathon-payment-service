'use strict'

const BaseModel = use('MongooseModel')

/**
 * @class UserLimit
 */
class UserLimit extends BaseModel {
    /**
     * UserLimit's schema
     */

    static get schema () {
        return {
            limitWithin6h: Number,
            transactionLimit: Number,
            type: String,
            userVip: Number
        }
    }

    static boot ({ schema }) {
        // Hooks:
        // this.addHook('preSave', () => {})
        // this.addHook('preSave', 'UserLimit.method')
        // Indexes:
        // this.index({userId: 1}, {unique: true, background: true})
    }
}

module.exports = UserLimit.buildModel('UserLimit')
