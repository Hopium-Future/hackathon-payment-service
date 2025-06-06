const SocketClient = require('./SocketClient')

const Env = use('Env')
const MAIN_SERVER_SOCKET_URL = Env.get('MAIN_SERVER_SOCKET_URL', 'http://localhost:9328')

class SocketClientToMainServer extends SocketClient {
    constructor (props) {
        super(props)

        this.Event = {
            UPDATE_BALANCE: 'user:update_balance',
            UPDATE_OPENING_ORDER_MARKET: 'user:update_opening_order_market',

            UPDATE_DEPOSIT_HISTORY: 'user:update_deposit_history',
            UPDATE_WITHDRAW_HISTORY: 'user:update_withdraw_history',

            EXCHANGE_UPDATE_RATE: 'exchange:update_rate',
            EXCHANGE_UPDATE_RATE_PAIR: 'exchange:update_rate_pair',
            EXCHANGE_UPDATE_INFOR: 'exchange:update_infor',
            EXCHANGE_UPDATE_OPENING_ORDER: 'exchange:update_opening_order',
            EXCHANGE_UPDATE_HISTORY_ORDER: 'exchange:update_history_order',
            EXCHANGE_UPDATE_ORDER: 'exchange:update_order',
            EXCHANGE_PLACE_MARKET_ORDER_RESULT: 'exchange:place_market_order_result',

            UPDATE_BUY_BACK_LOAN: 'user:update_loan',

            // Future
            FUTURE_UDPATE_PRICE: 'future:update_price',
            FUTURE_UDPATE_MARKET_WATCH: 'future:update_market_watch',
            FUTURE_UPDATE_OPENING_ORDER: 'future:update_opening_order',
            FUTURE_UDPATE_HISTORY_ORDER: 'future:update_history_order',
            FUTURE_UDPATE_PLACE_ORDER_RESULT: 'future:place_order_result',
            FUTURE_UPDATE_RECENT_TRADE: 'future:update_recent_trade',
            FUTURE_UPDATE_LIQUIDATION_PRICE: 'future:update_liquidation_price'
        }
    }

    init () {
        try {
            super.init('MAIN', MAIN_SERVER_SOCKET_URL, '/spot_service')
        } catch (e) {
            console.error('__ init socket error', e)
        }
    }

    onConnected () {
        super.onConnected()
    }

    async onMessage () {
        // super.onMessage();
        try {
            const [{ data }] = arguments
            console.log('onMessage', data)
        } catch (e) {
            console.error('onMessage  error ', e)
        }
    }

    emitToUser (userId, event, message, callback = null) {
        this.emit('emit_to_user', {
            userId,
            event,
            message
        }, callback)
    }

    emitOrderBook (exchange_currency, base_currency, callback = null) {
        this.emit('emit_order_book', {
            exchange_currency,
            base_currency
        }, callback)
    }

    emitRecentTrade (exchange_currency, base_currency, callback = null) {
        this.emit('emit_recent_trade', {
            exchange_currency,
            base_currency
        }, callback)
    }

    pushNotification (notificationData, callback = null) {
        console.log('spot push noti', notificationData)
        this.emit('push_notification', notificationData, callback)
    }

    pushNotificationMobile (userId, type, data, cb) {
        this.emit('push_notification', {
            targetDevice: 'mobile',
            toUserId: userId,
            type,
            data
        }, cb)
    }
}

module.exports = new SocketClientToMainServer()
