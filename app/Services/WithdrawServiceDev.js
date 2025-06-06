const Redlock = require('redlock')

const { DwTransactionMethod } = use("App/Library/Enum")
const { WalletNetwork } = use("App/Library/Enum")
const { WithdrawResult } = use("App/Library/Enum")
const Antl = use('Antl')
const RedisLocker = use('Redis')
    .connection('locker')
const DwConfig = use('App/Models/DwConfig')
const WalletService = use('Grpc')
    .connection('wallet')
const AssetConfig = use('App/Models/Config/AssetConfig')
const configError = use("Adonis/Src/Config").get('error')
const DepositWithdraw = use('App/Models/DepositWithdraw')
const Redis = use('Redis')
const Mail = use('Mail')
const ms = require('ms')
const { default: AwaitLock } = require('await-lock')
const Promise = require('bluebird')
const NotificationService = use('App/Services/NotificationService')
const TfaService = use('App/Services/TfaService')
const dateFormat = require('dateformat')

const { PlatformProvider } = use("App/Library/Enum")
const SmartOtpService = use("App/Services/SmartOtpService")

const User = use('App/Models/User')
const { generate } = require('randomstring')

const Env = use('Env')

const IS_PROD = Env.get('NODE_ENV') === 'production'

const WithdrawalLocker = new Redlock([RedisLocker], {
    retryCount: Math.floor(8000 / 500),
    retryDelay: 500
})

module.exports = class WithdrawServiceDev {
    static async makeWithdrawalDev (
        userId,
        assetId,
        amount,
        network,
        withdrawToAddress,
        tag,
        otp,
        method = DwTransactionMethod.OnChain,
        confirmationCodes = {},
        metadata = {},
        justCreate = false,
        clientTime
    ) {
        if(IS_PROD || process.env.NODE_ENV !=='development') throw (WithdrawResult.WithdrawDisabled)
        const TAG = `DEVELOPER [${generate(6)}] (withdraw) make Withdrawal user=${userId}`
        let locker
        try {
            console.info(`${TAG} before lock New withdrawal user=${userId}, amount=${amount}, asset=${assetId}, network=${network}, to=${withdrawToAddress}, tag=${tag}, method=${method}, confirmationCode=${confirmationCodes}`)
            locker = await WithdrawalLocker.lock(`withdrawal_lock::${userId}`, 150000)
            amount = +amount
            console.info(`${TAG} after lock New withdrawal user=${userId}, amount=${amount}, asset=${assetId}, network=${network}`)

            // Get config
            const dwConfig = await DwConfig.findOne({ assetId })
                .populate('networkList')
                .lean()
            if (!dwConfig) {
                console.warn(`${TAG} invalid asset config not found`)
                throw (WithdrawResult.InvalidAsset)
            }
            const networkConfig = dwConfig.networkList.find(e => e.network === network)
        
            if (!networkConfig) {
                console.warn(`${TAG} network config not found`)
                throw (WithdrawResult.InvalidAsset)
            }
            if (!networkConfig.withdrawEnable) {
                console.warn(`${TAG} withdrawEnable = false`)
                throw (WithdrawResult.WithdrawDisabled)
            }

            // Verify target
            if (method === DwTransactionMethod.OnChain) {
                const addressValid = await isAddressValid(withdrawToAddress, network, networkConfig)
                console.info(`${TAG} address valid = ${addressValid}`)
                if (!addressValid) {
                    throw (WithdrawResult.InvalidAddress)
                }
            }

            // Check account
            const userModel = await User.find(userId)
            // Verify amount
            let feeWithdraw = 0
            if (method === DwTransactionMethod.BankTransfer) {
                feeWithdraw = +metadata.feeWithdraw || 0
                console.info(`${TAG} fee`, feeWithdraw)
            } else {
                feeWithdraw = (networkConfig.withdrawFee || 0)
                console.info(`${TAG} fee`, feeWithdraw)
                if (amount < Math.max(networkConfig.withdrawMin, feeWithdraw)) {
                    console.info(`${TAG} amount too small, amount=${amount}, min=${networkConfig.withdrawMin}, fee=${feeWithdraw}`)
                    throw (WithdrawResult.AmountTooSmall)
                }
                if (amount > networkConfig.withdrawMax) {
                    console.info(`${TAG} amount Exceeded`)
                    throw (WithdrawResult.AmountExceeded)
                }
            }
            const assetConfig = await AssetConfig.getOneCached({ id: assetId })
            if (!assetConfig) {
                console.warn(`${TAG} assetConfig not found`)
                throw ('invalid_input')
            }
            const assetName = assetConfig.assetCode
            // Check balance
            const available = await WalletService.getAvailableAsync(userId, assetId)
            Logger.info(`${TAG} available`, available)
            if (available < amount) {
                throw (WithdrawResult.NotEnoughBalance)
            } 

           // Start: Xử lý Smart OTP lúc Rút Onchain:
			const canUseSmartOtp = await SmartOtpService.canUseSmartOtp({ userId });
			let canUseEmailOtp = userModel.email;
            let canUse2FA = (userModel.authenticator_secret || userModel.isTfaEnabled)
            const mustUseHighSecureMethod = await SmartOtpService.isUseOtherOtpMethod({amount, assetId, email: userModel.email})

            // End: Xử lý Smart OTP lúc Rút Onchain.

            const Otp = use('App/Models/Otp')

            if(canUseSmartOtp && !mustUseHighSecureMethod){
                console.log("_____use Smart OTP");
                if(otp?.smartOtp) {
                    // call to auth.bitbattle to verify pin
                    const isValidSmartOTP = await SmartOtpService.verifySotp({userId, smart_otp: otp.smartOtp, clientTime})
                    if (_.isObject(isValidSmartOTP))  {
                        return {
                            resType: 'validate',
                            errStatus: WithdrawResult.InvalidSotp,
                            data: isValidSmartOTP.data
                        }
                    }

                    console.log("__here");

                } else if(!otp || _.isEmpty(otp)) {
                    return { use_smart_otp: true }
                }
            }else{
                console.log("_____use other methods");
                let otpEmailAwaits
                if (canUseEmailOtp) {
                    const OTP_TARGET = `${userId}_${amount}_${assetId}_${network}_${withdrawToAddress}_${tag || 'no_memo'}`
                    otpEmailAwaits = await Otp.getOrCreate(userModel, Otp.Type.WITHDRAWAL_CONFIRM_EMAIL, OTP_TARGET)
                    const validate = await Otp.checkResendEmail(otpEmailAwaits)
                    if ((metadata?.serviceVersion === 'V4' && (!otp || !otp?.email) && (!validate || !validate.status))) {
                        return {
                            resType: 'validate',
                            errStatus: configError.TOO_MUCH_REQUEST,
                            data: { remaining_time: validate.remaining_time, otp: ['email'] }
                        }
                    }

                    if (!otp || !otp.email) {
                        // if (process.env.NODE_ENV === 'production') {
                        if (!validate || validate.status) {
                            const namiLocale = 'en'
                            Mail.send(
                                'emails.withdrawal_confirmation',
                                {
                                    locale: namiLocale,
                                    antl: Antl.forLocale(namiLocale),
                                    appUrl: Env.get('APP_URL'),
                                    email: userModel.email,
                                    amount: `${amount.toLocaleString()} ${assetConfig.assetCode}`,
                                    to: withdrawToAddress,
                                    time: dateFormat(new Date(), 'HH:MM – dd/mmm/yyyy (Z)', true),
                                    code: otpEmailAwaits.code
                                },
                                message => {
                                    message.to(userModel.email)
                                        .from(Env.get('EMAIL_FROM'))
                                        .subject(Antl.forLocale(namiLocale)
                                            .formatMessage('email.withdrawal_confirmation.title'))
                                }
                            )
                                .then(mailResult => {
                                    Logger.info(`Withdrawal confirmation mail sent user #${userId}, ${amount} currency ${assetConfig.assetCode}, result`, mailResult)
                                })
                            await Otp.setSendTime(otpEmailAwaits)
                        } else {
                            Logger.info(`Withdrawal code is ${otpEmailAwaits.code}`)
                        }
                        if (metadata?.serviceVersion === 'V4') {
                            return {
                                remaining_time: validate.remaining_time,
                                otp: ['email']
                            }
                        }
                        throw (WithdrawResult.MissingOtp)
                    }
                    Logger.info(`Withdrawal withdraw user #${userId}, ${amount} currency ${assetConfig.assetCode}, OTP check: correct OTP ${otpEmailAwaits.code} - target ${OTP_TARGET}, user entered`, otp)
                    const emailOtp = otp.email
                    if (Env.get('NODE_ENV') === 'development' && emailOtp === '000000') {
                        // Test environment, allow
                    } else if (!emailOtp || emailOtp !== otpEmailAwaits.code) {
                        throw WithdrawResult.InvalidOtp
                    }
                }

                // Check 2fa
                if (canUse2FA) {
                    const otpVerification = await TfaService.checkOtp({ secret: userModel.authenticator_secret }, otp.tfa)
                    if (!otpVerification) {
                        Logger.info(`Withdrawal withdraw user #${userId}, ${amount} ${assetName}, INVALID_OTP, user entered`, otp.tfa)
                        throw WithdrawResult.InvalidOtp
                    }
                }
                if (otpEmailAwaits) {
                    await otpEmailAwaits.markAsUsed()
                }
            }

            const actualReceive = amount - feeWithdraw
            console.info(`${TAG} actual receive`, actualReceive)
            if (actualReceive <= 0) {
                console.warn(`${TAG} actual receive negative`, actualReceive)
                throw (WithdrawResult.AmountTooSmall)
            }

            let from
            let to
            let status = DepositWithdraw.Status.Pending
            const
                dwMetadata = {}
            if (method === DwTransactionMethod.OnChain) {
                from = {
                    type: 'Blockchain',
                    name: networkConfig.provider
                }
                to = {
                    type: 'Blockchain',
                    name: withdrawToAddress,
                    address: withdrawToAddress,
                    tag
                }
                status = DepositWithdraw.Status.Pending
            }
            console.info(`${TAG} from, to, status, metadata`, {
                from,
                to,
                status,
                dwMetadata
            })

            const transactionId = (Math.random() + 1).toString(2)
            //await WalletService.genTransactionIdAsync(assetConfig.assetCode)
            console.info(`${TAG} transaction id=${transactionId}`, networkConfig)
            const dw = await DepositWithdraw.create({
                type: DepositWithdraw.Type.Withdraw,
                transactionId,
                userId,
                provider: networkConfig.provider,
                assetId,
                transactionType: method,
                network: networkConfig.network,
                amount: +amount,
                actualReceive: +actualReceive,
                fee: { value: feeWithdraw },
                from,
                to,
                status,
                // txId: txhash,
                metadata: {
                    networkConfigId: networkConfig._id.toString(),
                    ...dwMetadata
                }
            })
            console.info(`${TAG} created withdraw`, dw.toObject())
            let toUserName
            if (method === DwTransactionMethod.OnChain) {
                toUserName = 'On-chain Gateway'
            } else if (method === DwTransactionMethod.BankTransfer) {
                toUserName = 'Bank Gateway'
            } else {
                toUserName = 'Nami Gateway'
            }
            console.info(`${TAG} before change balance, to user name=${toUserName}`)
            const deductTx = [//await WalletService.changeBalanceAsync(
                userId,
                assetId,
                status === DepositWithdraw.Status.Success ? -amount : 0,
                status === DepositWithdraw.Status.Success ? 0 : amount,
                5,
                status === DepositWithdraw.Status.Success ? `Withdraw, method ${method}` : `On submit withdraw, lock, method ${method}`,
                {
                    transactionId,
                    fromUser: await User.getUserTransactionInfo(userId),
                    toUser: { name: toUserName },
                    source: {
                        collection: 'depositwithdraws',
                        filter: { _id: dw._id }
                    }
                }
            ]
            console.info(`${TAG} deduct tx`, deductTx)
            if (!deductTx) {
                throw (WithdrawResult.Unknown)
            }

            if (justCreate) {
                return dw
            }

            // Submit withdraw
            // Add to queue
            const backoffDelay = IS_PROD ? ms('15 min') : ms('1 min')
            const job = Math.random()
            /*await use('BeeQueue')
                .connection('withdraw')
                .createJob()
                .setId(dw._id.toString())
                .retries(Math.floor(ms('1 hour') / backoffDelay))
                .backoff('fixed', backoffDelay)
                .save()
            */

            console.info(`${TAG} withdraw via Binance, job id=${job?.id}, dwId=${dw._id.toString()}`)
            return dw
        } catch (e) {
            console.error(e)
            throw e
        } finally {
            locker && await locker.unlock()
        }
    }
}

async function isAddressValid (address, network, networkConfig) {
    if (
        network === WalletNetwork.Ethereum
        || network === WalletNetwork.BSC
        || network === WalletNetwork.KardiaChain
        || network === WalletNetwork.FTM
    ) {
        const web3 = use('Web3')
        return web3.utils.isAddress(address)
    }

    if (networkConfig && networkConfig.addressRegex) {
        return new RegExp(networkConfig.addressRegex).test(address)
    }
    throw (WithdrawResult.UnsupportedAddress)
}