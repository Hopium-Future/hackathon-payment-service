'use strict'

const Model = use('Model')
const randomstring = require('randomstring')
const ms = require('ms')

class Otp extends Model {
    static async getOrCreate (user, type, target, metaData) {
        // Tìm otp gần nhất, chưa expire thì gửi lại
        const recentOtp = await this.getOtp(user, type, null, target)
        if (recentOtp) return recentOtp

        // Create new Otp
		return await this.createOtp(user, type, target, metaData)
	}

	static async createOtp(user, type, target, metaData) {
        const otp = new Otp()
        otp.userId = user ? user._id : null
        otp.target = target
        otp.type = type
        otp.expired_at = new Date(Date.now() + Otp.Timeout[type])
        otp.status = Otp.Status.UNUSED
        if (metaData != null) {
            try {
                if (typeof metaData === 'string') otp.meta_data = metaData
                else if (typeof metaData === 'object') otp.meta_data = JSON.stringify(metaData)
            } catch (err) {
                console.error('Create otp', err)
            }
        }

        switch (type) {
        case Otp.Type.AUTHEN_SOCKETIO: {
            otp.code = randomstring.generate(20)
        } break
        case Otp.Type.VERIFY_EMAIL: {
            otp.code = randomstring.generate(30)
        } break
        case Otp.Type.RESET_PASSWORD: {
            otp.code = randomstring.generate(60)
        } break
        case Otp.Type.VERIFY_DEVICE_EMAIL: {
            otp.code = randomstring.generate({ length: 6, charset: 'numeric' })
        } break
        case Otp.Type.WITHDRAWAL_CONFIRM_EMAIL: {
            otp.code = randomstring.generate({ length: 6, charset: 'numeric' })
        } break
        case Otp.Type.TRANSFER_OFF_CHAIN: {
            otp.code = randomstring.generate({ length: 6, charset: 'numeric' })
        } break
        
        default: {
            otp.code = randomstring.generate(10)
        }
        }
        await otp.save()
        return otp
    }

    static async getOtp(user, type, otpCode, target) {
		const chain = this.query()
			.where('type', type)
			.where('status', Otp.Status.UNUSED)
			.orderBy('created_at', 'desc');

		if (user) chain.where('userId', user._id)
		if (otpCode) {
			chain.where('code', otpCode)
			chain.where('expired_at', '>', new Date())
		} else {
			chain.where('expired_at', '>', new Date(new Date() - (this.ResendTime[type]??this.ResendTime[Otp.Type.WITHDRAWAL_CONFIRM_EMAIL])))
		}
		if (target) chain.where('target', target.toString())

		return await chain.first()
	}

    async markAsUsed () {
        this.status = Otp.Status.USED
        await this.save()
        return this
    }

    static async setSendTime(otp, mailSendAt = Date.now()) {
		try {
			let otpMetadata = {};
			if (otp.meta_data && typeof otp.meta_data === 'string') {
				otpMetadata = JSON.parse(otp.meta_data);
			}
			if(otpMetadata?.mailSentDate) {
				otpMetadata.resend = [...(otpMetadata?.resend ? otpMetadata.resend : []), otpMetadata.mailSentDate]
				otpMetadata.mailSentDate
			}
			otp.meta_data = JSON.stringify({
				...otpMetadata,
				mailSentDate: mailSendAt,
			})
			await otp.save();
		} catch(e) {
			return e.message()
		}
	}

	// return otp object if valid
	static async checkResendEmail(otp) {
		let status = false //true is email can send
		let otpMetadata = {}
		const currentTime = new Date().getTime()
		if (otp.meta_data && typeof otp.meta_data === 'string') {
			otpMetadata = JSON.parse(otp.meta_data);
		}
		let remaining_time = (this.ResendTime[otp.type]??this.ResendTime[Otp.Type.WITHDRAWAL_CONFIRM_EMAIL])
		if(otpMetadata?.mailSentDate) {
			const limitRight = new Date(otp.expired_at).getTime() - remaining_time
			const limitLeft = new Date(otpMetadata.mailSentDate).getTime() + remaining_time

			console.log('TIME RANGE: ', remaining_time, (limitLeft), (currentTime), (limitRight))
			if(limitLeft <= currentTime && currentTime <= limitRight || limitLeft - currentTime < 0) {
				status = true
			} else {
				remaining_time = limitLeft - currentTime
			}
		} else {
			status = true
		}
		return {
			otp,
			status,
			remaining_time
		}
	}
}

Otp.Type = {
    AUTHEN_SOCKETIO: 1,
    VERIFY_EMAIL: 2,
    RESET_PASSWORD: 3,
    VERIFY_DEVICE_EMAIL: 4,
    WITHDRAWAL_CONFIRM_EMAIL: 5,
    TRANSFER_OFF_CHAIN: 6
}

Otp.ResendTime = {
	[Otp.Type.WITHDRAWAL_CONFIRM_EMAIL]: ms('1 minutes'),
}

Otp.Timeout = {
    [Otp.Type.AUTHEN_SOCKETIO]: ms('2 day'),
    [Otp.Type.VERIFY_EMAIL]: ms('1 day'),
    [Otp.Type.RESET_PASSWORD]: ms('15 minutes'),
    [Otp.Type.VERIFY_DEVICE_EMAIL]: ms('15 minutes'),
    [Otp.Type.WITHDRAWAL_CONFIRM_EMAIL]: ms('10 minutes'),
    [Otp.Type.TRANSFER_OFF_CHAIN]: ms('10s')
}

Otp.Status = {
    USED: 1,
    UNUSED: 0
}
module.exports = Otp
