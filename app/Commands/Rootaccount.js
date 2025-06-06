'use strict'

const {Command} = require('@adonisjs/ace')
const {getBrokerBalance, getBrokerAllBalance, getNa3AllBalance, getConfigAllTokens} = require("../Library/BinanceBroker");

class Rootaccount extends Command {
    static get signature() {
        return 'rootaccount'
    }

    static get description() {
        return 'Tell something helpful about this command'
    }

    async handle(args, options) {
        this.info('Dummy implementation for rootaccount command')
        // Get all balance
        // console.log(await getBrokerAllBalance())
        console.log(await getNa3AllBalance())
    }
}

module.exports = Rootaccount
