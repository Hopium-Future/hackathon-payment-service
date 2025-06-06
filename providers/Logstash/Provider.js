'use strict'

const { ServiceProvider } = require('@adonisjs/fold')

class LogstashProvider extends ServiceProvider {
    register () {
        this.app.extend('Adonis/Src/Logger', 'logstash', () => {
            const Logstash = require('./index')
            return new Logstash()
        })
    }
}

module.exports = LogstashProvider
