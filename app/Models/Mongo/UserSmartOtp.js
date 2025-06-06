"use strict";

const BaseModel = use("MongooseModel");
/**
 * @class UserSmartOtp
 */
class UserSmartOtp extends BaseModel {
	static get schema() {
		return {
			userId: { type: Number, unique: true },
			pin: String,
			secret: String,
			device: String,
			status: { type: Number, default: STATUS.DISABLED },
		};
	}
}

const STATUS = {
	DISABLED: 0,
	ENABLED: 1,
	BLOCKED: 2,
};

module.exports = UserSmartOtp.buildModel("UserSmartOtp");

module.exports.STATUS = STATUS
