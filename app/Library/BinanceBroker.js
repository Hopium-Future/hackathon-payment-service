const _ = require('lodash')
const Binance = require('./node-binance-api')

const Logger = use('Logger')
const Config = use('Config')
const SysNoti = use('App/Library/SysNoti')
const Big = require('big.js')
async function getApiKey(user) {
    let result = null
    const UserBinanceAccount = use('App/Models/UserBinanceAccount')
    const userData = await UserBinanceAccount.getOne({
        userId: user?.id || user?._id,
        status: UserBinanceAccount.Status.ACTIVE,
        getSecretInformation: 1
    })
    if (userData) {
        result = {
            apiKey: userData.apiKey,
            apiSecret: userData.apiSecret
        }
    }
    return result
}

async function getBinanceClient(user, options = {}) {
    if (!user && options.apiKey && options.apiSecret) {
        return new Binance().options({
            hedgeMode: true,
            useServerTime: true,
            recvWindow: 60000,
            // test: process.env.NODE_ENV !== 'production',
            APIKEY: options.apiKey,
            APISECRET: options.apiSecret
        })
    }
    const {
        apiKey,
        apiSecret
    } = await getApiKey(user)
    return new Binance().options({
        hedgeMode: true,
        useServerTime: true,
        recvWindow: 60000,
        // test: process.env.NODE_ENV !== 'production',
        APIKEY: apiKey,
        APISECRET: apiSecret
    })
}

exports.getPublicBinanceClient = async function () {
    const User = use('App/Models/User')
    const exchangeUser = await User.getExchangeUser()
    await _prepareBinanceAccount(exchangeUser)
    // Get deposit address
    return await getBinanceClient(exchangeUser)
}

exports.postFuturesTransferForSubAccount = async function postFuturesTransferToSubAccount(options = {}) {
    const DEFAULT_VALUE = {
        email: null,
        asset: null,
        amount: null,
        type: null
    }
    const _input = _.defaults(options, DEFAULT_VALUE)
    const binance = await getBinanceClient(null, {
        apiKey: process.env.BINANCE_FUTURE_TRANSFER_API_KEY,
        apiSecret: process.env.BINANCE_FUTURE_TRANSFER_API_SECRET
    })
    return await binance.mFuturesTransferSubAccount(_input)
}
exports.postSubAccountTransfer = async function postSubAccountTransfer(options = {}) {
    const DEFAULT_VALUE = {
        fromEmail: null,
        toEmail: null,
        asset: null,
        amount: null
    }
    const _input = _.defaults(options, DEFAULT_VALUE)
    const binance = await getBinanceClient(null, {
        apiKey: process.env.BINANCE_FUTURE_TRANSFER_API_KEY,
        apiSecret: process.env.BINANCE_FUTURE_TRANSFER_API_SECRET
    })
    return await binance.postSubAccountTransfer(_input)
}

async function getBinanceBrokerClient() {
    return getBinanceClient(null, {
        apiKey: process.env.BINANCE_BROKER_API,
        apiSecret: process.env.BINANCE_BROKER_SECRET
    })
}

async function getNa3MainClient() {
    return getBinanceClient(null, {
        apiKey: process.env.BINANCE_NA3_MAIN_API,
        apiSecret: process.env.BINANCE_NA3_MAIN_SECRET
    })
}

exports.createSubAccount = async function createSubAccount(options = {}) {
    const binance = await getBinanceBrokerClient()
    return binance.promiseRequest('v1/broker/subAccount', {}, {
        base: binance.sapi,
        type: 'SIGNED',
        method: 'POST'
    })
}

exports.getSubAccount = async function createSubAccount(options = {}) {
    const binance = await getBinanceBrokerClient()
    return binance.promiseRequest('v1/broker/subAccount', options, {
        base: binance.sapi,
        type: 'SIGNED',
        method: 'GET'
    })
}

exports.enableFuturesSubAccount = async function enableFuturesSubAccount(params = {
    subAccountId: null,
    futures: true
}) {
    const binance = await getBinanceBrokerClient()
    return await binance.promiseRequest('v1/broker/subAccount/futures', params, {
        base: binance.sapi,
        type: 'SIGNED',
        method: 'POST'
    })
}

exports.createApiSubAccount = async function createApiSubAccount(params = {
    subAccountId: null,
    canTrade: true,
    marginTrade: true,
    futuresTrade: true
}) {
    const binance = await getBinanceBrokerClient()
    return await binance.promiseRequest('v1/broker/subAccountApi', params, {
        base: binance.sapi,
        type: 'SIGNED',
        method: 'POST'
    })
}

async function _prepareBinanceAccount(user) {
    // Get or create user binance account
    const UserBinanceAccount = use('App/Models/UserBinanceAccount')
    const userBinanceAccount = await UserBinanceAccount.getOne({
        userId: user?.id || user?._id,
        status: UserBinanceAccount.Status.ACTIVE
    })
    if (!userBinanceAccount) {
        await UserBinanceAccount.activeUserBinanceAccount(user?.id || user?._id)
    }
}

exports.getConfigAllTokens = async function () {
    // Get deposit address
    const binance = await getBinanceBrokerClient()
    return binance.promiseRequest('v1/capital/config/getall', {}, {
        base: binance.sapi,
        type: 'USER_DATA',
        method: 'GET'
    })
}

exports.depositAddressWithApiKey = async function (options, params = null) {
    const binance = await getBinanceClient(null, options)

    return binance.promiseRequest('v1/capital/deposit/address', params, {
        base: binance.sapi,
        type: 'SIGNED',
        method: 'GET'
    })
}

exports.depositAddress = async function (user, params = null) {
    await _prepareBinanceAccount(user)
    const binance = await getBinanceClient(user)
    return binance.promiseRequest('v1/capital/deposit/address', params, {
        base: binance.sapi,
        type: 'SIGNED',
        method: 'GET'
    })
}
exports.depositHistoryViaApiKey = async function (options, params = null) {
    const binance = await getBinanceClient(null, options)
    const list = await binance.depositHistory()
    return _.castArray(list)
}

exports.depositHistory = async function (user, params = null) {
    await _prepareBinanceAccount(user)
    const binance = await getBinanceClient(user)
    const list = await binance.depositHistory()
    return _.castArray(list)
}


exports.withdrawFromBrokerAccount = async function (
    amount,
    assetId,
    network,
    withdrawTo,
    addressTag,
    binanceFee,
    uniqId
) {
    const binance = await getBinanceBrokerClient()

    const AssetConfig = use('App/Models/Config/AssetConfig')
    const assetConfig = await AssetConfig.getOneCached({id: assetId})
    if (!assetConfig) throw 'invalid_asset'
    const params = {
        coin: assetConfig.assetCode,
        network,
        address: withdrawTo,
        addressTag: addressTag || undefined,
        amount: +Big(amount).plus(+binanceFee),
        withdrawOrderId: uniqId,
        transactionFeeFlag: false
    }
    return binance.promiseRequest('v1/capital/withdraw/apply', params, {
        base: binance.sapi,
        type: 'SIGNED',
        method: 'POST'
    })
}

exports.getBrokerBalance = async function (binanceAsset) {
    const allBalances = await (await getBinanceBrokerClient()).balance()
    const value = allBalances[binanceAsset]
    if (!value) {
        return {
            available: 0,
            locked: 0
        }
    }
    return {
        available: value.available,
        locked: value.onOrder
    }
}

exports.getNa3Balance = async function (binanceAsset) {
    const allBalances = await (await getNa3MainClient()).balance()
    const value = allBalances[binanceAsset]
    if (!value) {
        return {
            available: 0,
            locked: 0
        }
    }
    return {
        available: value.available,
        locked: value.onOrder
    }
}

exports.getBrokerAllBalance = async function () {
    const allBalances = await (await getBinanceBrokerClient()).balance()
    const balance = {}
    for (let asset in allBalances) {
        if (+allBalances[asset]?.available > 0 || +allBalances[asset]?.onOrder > 0) {
            balance[asset] = allBalances[asset]
        }
    }
    return balance
}

exports.getNa3AllBalance = async function () {
    const allBalances = await (await getNa3MainClient()).balance()
    const balance = {}
    for (let asset in allBalances) {
        if (+allBalances[asset]?.available > 0 || +allBalances[asset]?.onOrder > 0) {
            balance[asset] = allBalances[asset]
        }
    }
    return balance
}


exports.getBrokerWithdrawalHistory = async function (startTime, completedOnly = true) {
    const binance = await getBinanceBrokerClient()
    const params = {}
    if (startTime) {
        const inputType = typeof startTime
        if (inputType === 'number') {
            params.startTime = startTime
        } else {
            params.startTime = new Date(startTime).getTime()
        }
    }
    if (completedOnly) {
        params.status = 6
    }
    const result = await binance.withdrawHistory(null, params)
    if (Array.isArray(result)) {
        return result
    }
    Logger.error('Lịch sử rút tiền Binance broker thất bại', result)
    SysNoti.notifyDelayed(
        `⚠️ <@U7TRL8XSQ> Nami Payment Lấy lịch sử rút tiền Binance broker thất bại`,
        'err_binance_getBrokerWithdrawalHistory',
        null,
        3600 * 1000
    )
    return []
}

exports.transferNa3ToBroker = async function (amount, asset) {
    try {
        const binance = await getBinanceBrokerClient()
        const transferData = await binance.promiseRequest('v1/broker/transfer', {
            asset,
            amount,
            fromId: process.env.BINANCE_NA3_MAIN_ACCOUNT_ID
        }, {
            base: binance.sapi,
            type: 'SIGNED',
            method: 'POST'
        })
        Logger.info(`transferSubAccountAmountToNa3 NA3 to Broker: ${amount} ${asset} result`, transferData)
        if (_.get(transferData, 'txnId') == null) {
            Logger.error('transferSubAccountAmountToNa3 not found txnId')
            throw transferData
        } else {
            return transferData
        }
    } catch (e) {
        Logger.error(`transferSubAccountAmountToNa3 error`, e)
        throw e
    }
}

exports.transferSubAccountAmountToNa3 = async function (user, amount, asset) {
    try {
        const UserBinanceAccount = use('App/Models/UserBinanceAccount')
        const [binance, binanceSubAcc] = await Promise.all([
            getBinanceBrokerClient(),
            UserBinanceAccount.getOne({
                userId: user.id,
                status: UserBinanceAccount.Status.ACTIVE
            })
        ])
        const transferData = await binance.promiseRequest('v1/broker/transfer', {
            asset,
            amount,
            fromId: binanceSubAcc.subAccountId,
            toId: process.env.BINANCE_NA3_MAIN_ACCOUNT_ID
        }, {
            base: binance.sapi,
            type: 'SIGNED',
            method: 'POST'
        })
        Logger.info(`transferSubAccountAmountToNa3 user ${user.id}: ${amount} ${asset} result`, transferData)
        if (_.get(transferData, 'txnId') == null) {
            Logger.error('transferSubAccountAmountToNa3 not found txnId')
            throw transferData
        } else {
            return transferData
        }
    } catch (e) {
        Logger.error(`transferSubAccountAmountToNa3 error`, e)
        throw e
    }
}

exports.BinanceStatusCode = {
    CAPITAL_WITHDRAW_USER_ASSET_NOT_ENOUGH: -4026,
    CAPITAL_WITHDRAW_MIN_AMOUNT: -4022
}

