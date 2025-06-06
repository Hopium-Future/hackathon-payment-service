'use strict'

const BaseModel = use('MongooseModel')

/**
 * @class UserVip
 */
class UserVip extends BaseModel {
    /**
     * UserVip's schema
     */

    static get schema () {
        return {
            userId: Number,
            level: { type: Number, default: 0 },
            metadata: Object
        }
    }

    static boot ({ schema }) {
        // Hooks:
        // this.addHook('preSave', () => {})
        // this.addHook('preSave', 'UserVip.method')
        // Indexes:
        // this.index({userId: 1}, {unique: true, background: true})
    }
}

module.exports = UserVip.buildModel('UserVip')
