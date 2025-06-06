
'use strict'

const Model = use('Model')
const REDIS_EXCHANGE_PRICE_KEY = "market_watch"
class ExchangePrice extends Model {
    static async boot () {
        super.boot()
    }

    static getExchangeHash (currency) {
        return `${REDIS_EXCHANGE_PRICE_KEY}:${currency}`
    }

    static getExchangeKey (currency) {
        return currency
    }

}

module.exports = ExchangePrice