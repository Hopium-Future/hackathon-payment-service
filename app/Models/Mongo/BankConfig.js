'use strict';

const BaseModel = use('MongooseModel');

/**
 * @class UserVip
 */
class BankConfig extends BaseModel {
    /**
     * BankConfig's schema
     */

    static get schema() {
        return {
            bank_name: String,
            bank_key: String,
            bank_code: String,
            logo: String,
            status: {type: String, default: "enable"},
        };
    }
}

module.exports = BankConfig.buildModel('BankConfig');


