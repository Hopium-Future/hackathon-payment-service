"use strict"

const UserSotpMongo = use("App/Models/Mongo/UserSmartOtp")
const axios = require("axios")
const { generate } = require("randomstring")
const WalletCurrencies = use("Config")
    .get("walletCurrencies")
const AssetValueMongo = use('App/Models/AssetValue')
const Redis = use('Redis')
const BASE_URL = process.env.EXCHANGE_AUTH_BITBATTLE_URL
const API = {
    VERIFY_SMART_OTP: BASE_URL + "/api/v3/smart-otp/verify-sotp"
}

class SmartOtpService {
    static async getSetSmartOtpKey (withdrawal) {
        const key = `${generate(50)}`
        await Redis.setex(key, 15 * 60, JSON.stringify(withdrawal))
        return key
    }

    static async validSmartOtpKey (key) {
        return await Redis.get(key)
    }

    static async invalidSmartOtpKey (key) {
        // Check is valid
        return await Redis.del(key)
    }

    static async verifySotp ({
        userId,
        smart_otp,
        clientTime,
        locale
    }) {
        try {
            const response = await axios.post(API.VERIFY_SMART_OTP, {
                userId,
                otp: smart_otp,
                clientTime,
                locale
            }, {
                headers: {
                    appKey: process.env.SERVER_TO_SERVER_KEY
                }
            })

            console.log('_______VERIFY SMART OTP FROM AUTH.BITBATTLE RES: ', response?.data)
            if (response?.data?.status === 'ok') return true
            return response?.data
        } catch (error) {
            console.log('_______EXCEPTION VERIFY SMART OTP BITBATLE: ', error)
            return false
        }
    }

    static async isUseOtherOtpMethod ({
        amount,
        assetId,
        email
    }) {
        let markUseEmailOtpVndc = 50e6
        if (assetId === WalletCurrencies.VNDC || assetId === WalletCurrencies.VNST) return amount > markUseEmailOtpVndc

        const assetValue = await AssetValueMongo.getOneCached({ assetId })
        if (!(assetValue && assetValue?.usdValue > 0)) {
            return true
        }
        return amount * assetValue?.usdValue * 25600 > markUseEmailOtpVndc
    }

    static async canUseSmartOtp ({
        userId,
        deviceId,
        isMobileApp
    }) {
        try {
            const user = await UserSotpMongo.findOne({ userId })
            const isEnableSotp = user?.status === UserSotpMongo.STATUS.ENABLED && !!user?.pin && user?.device
            if (isMobileApp) {
                return isEnableSotp && user.device === deviceId
            } else {
                return isEnableSotp
            }
        } catch (error) {
            console.log("____ERROR CHECK SMART OTP: ", error)
            return false
        }
    }
}

module.exports = SmartOtpService
