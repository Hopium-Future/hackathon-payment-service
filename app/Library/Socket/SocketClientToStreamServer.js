const SocketClient = require('./SocketClient')
const Env = use('Env')
const STREAM_SERVER_SOCKET_URL = Env.get('STREAM_SERVER_SOCKET_URL', 'http://localhost:9328')

class SocketClientToStreamServer extends SocketClient {
    constructor (props) {
        super(props)

        this.Event = {
            UPDATE_SPIN_AMOUNT: 'spin:update_spin_amount',
            UPDATE_SPIN: 'spin:update_spin',
            PUSH_SPIN_ASK_FOR_FEEDBACK: 'spin:ask_for_feedback',
            UPDATE_PRIZE: 'spin:update_prize',
            UPDATE_SPREAD: 'spin:update_spread',
            SET_SPIN_PRIZE_ALL_LEVELS: 'spin:set_spin_prize_all_levels',
            UPDATE_BALANCE: 'user:update_balance',
            UPDATE_OPENING_ORDER_MARKET: 'user:update_opening_order_market',

            UPDATE_DEPOSIT_HISTORY: 'user:update_deposit_history',
            UPDATE_WITHDRAW_HISTORY: 'user:update_withdraw_history',

            PUSH_NEW_CHALLENGE_ROOM: 'challenge:new_room',
            REWARD_CHALLENGE_ROOM: 'challenge:reward',
            PUSH_INVITE_CHALLENGE_ROOM: 'challenge:invite_room',
            UPDATE_CHALLENGE_ROOM_RANK: 'challenge:update_rank',
            UPDATE_CHALLENGE_ROOM_PRIZE: 'challenge:update_prize',
            UPDATE_REMAIN_CONQUEST_SPIN: 'challenge:update_remain_conquest_spin',
            NOTI_WHEN_SURVIVAL_ROOM_REWARDED: 'challenge:noti_when_survival_room_rewarded',
            UPDATE_CHALLENGE_ROOM_DATA: 'challenge:update_room_data',

            EXCHANGE_UPDATE_RATE: 'exchange:update_rate',
            EXCHANGE_UPDATE_RATE_PAIR: 'exchange:update_rate_pair',
            EXCHANGE_UPDATE_INFOR: 'exchange:update_infor',
            EXCHANGE_UPDATE_OPENING_ORDER: 'exchange:update_opening_order',
            EXCHANGE_UPDATE_HISTORY_ORDER: 'exchange:update_history_order',
            EXCHANGE_PLACE_MARKET_ORDER_RESULT: 'exchange:place_market_order_result',
            UPDATE_BUY_BACK_LOAN: 'user:update_loan',

            //Future
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
        console.log('Connect to stream server', STREAM_SERVER_SOCKET_URL)
        super.init('STREAM', STREAM_SERVER_SOCKET_URL, '/spot_service')
    }

    onConnected () {
        super.onConnected()
    }

    async onMessage () {
        // super.onMessage();
        try {
            const [{ data }] = arguments
            const [event, message] = data
            if (event === 'subscribe_socket') {

            }
        } catch (e) {
            console.error('onMessage  error ', e)
        }

    }

    emitToStream (event, message, callback = null) {
        this.emit(event, message, callback)
    }

    emitToUser (userId, event, message, callback = null) {
        this.emit('emit_to_user', {
            userId,
            event,
            message
        }, callback)
    }

    emitOrderBook (options, callback = null) {
        this.emit('emit_order_book', options, callback)
    }

    emitRecentTrade (options, callback = null) {
        this.emit('emit_recent_trade', options, callback)
    }

    pushNotification (notificationData, callback = null) {
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

module.exports = new SocketClientToStreamServer()


