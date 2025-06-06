'use strict'

const Env = use('Env')
const { DwTransactionMethod } = require("../../Library/Enum")

const WithdrawService = use('App/Services/WithdrawService')
const WithdrawServiceDev = use('App/Services/WithdrawServiceDev')

class WithdrawController {
    async submitWithdrawalV4({
        request,
        response,
        user,
        isMobileApp,
        deviceInfo,
        locale
    }) {

        const {
            assetId,
            amount,
            network,
            withdrawTo,
            tag,
            otp,
            clientTime,
            clientSecret,
			locale: lang
        } = request.post()
        try {
            const IS_PROD = Env.get('NODE_ENV') === 'production'
            // if (process.env.ENABLE_DEPOSIT_WITHDRAW !== '1' || !IS_PROD) {
            //     if (IS_PROD || process.env.NODE_ENV != 'development') {
            //         throw 'disable_deposit_withdraw'
            //     } else {
            //         const devResult = await WithdrawServiceDev.makeWithdrawalDev(
            //             user?.id || user?._id,
            //             +assetId,
            //             +amount,
            //             network,
            //             withdrawTo,
            //             tag,
            //             otp,
            //             DwTransactionMethod.OnChain,
            //             undefined,
            //             {serviceVersion: 'V4'},
            //             false,
            //             clientTime
            //         )
            //         if (devResult.resType === 'validate') {
            //             return response.sendError(devResult.errStatus, devResult.data)
            //         } else {
            //             return response.sendSuccess(devResult)
            //         }
            //     }
            // }
            const result = await WithdrawService.makeWithdrawal(
                user?.id || user?._id,
                +assetId,
                +amount,
                network,
                withdrawTo,
                tag,
                otp,
                DwTransactionMethod.OnChain,
                undefined,
                { serviceVersion: 'V4' },
                false,
                clientTime, 
                clientSecret,
                deviceInfo?.deviceId,
				isMobileApp,
				lang ?? locale
            )
            if (result.resType === 'validate') {
                return response.sendError(result.errStatus, result.data)
            } else {
                return response.sendSuccess(result)
            }
        } catch (e) {
            Logger.error(`Withdraw user ${user?.id || user?._id} error`, e)
            return response.sendError(undefined, e)
        }
    }

    async submitWithdrawal ({
        request,
        response,
        user
    }) {
        const {
            assetId,
            amount,
            network,
            withdrawTo,
            tag,
            otp
        } = request.post()
        try {
            if (process.env.ENABLE_DEPOSIT_WITHDRAW !== '1') throw 'disable_deposit_withdraw'
            const result = await WithdrawService.makeWithdrawal(
                user?.id || user?._id,
                +assetId,
                +amount,
                network,
                withdrawTo,
                tag,
                otp,
                DwTransactionMethod.OnChain,
                undefined,
                undefined,
                false
            )
            return response.sendSuccess(result)
        } catch (e) {
            Logger.error(`Withdraw user ${user?.id || user?._id} error`, e)
            return response.sendError(undefined, e)
        }
    }
}

module.exports = WithdrawController
