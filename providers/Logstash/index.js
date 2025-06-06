'use strict'

const util = require('util')
const _ = require('lodash')
const { format, createLogger, transports } = require('winston')
const { ElasticsearchTransport } = require('winston-elasticsearch')

const { timestamp, prettyPrint, errors } = format
const transformer = function transformer (logData) {
    const transformed = {}
    transformed['@timestamp'] = logData.timestamp ? logData.timestamp : new Date().toISOString()
    transformed.message = logData.message
    transformed.severity = logData.level
    transformed.fields = logData.meta
    transformed.service = process.env.LOGSTASH_SERVICE || 'adonis-app'
    return transformed
}
const mappingTemplate = require('./mappingTemplate')

class WinstonLogstash {
    /**
     * A list of available log levels
     *
     * @attribute levels
     *
     * @return {Object}
     */
    get levels () {
        return {
            emerg: 0,
            alert: 1,
            crit: 2,
            error: 3,
            warning: 4,
            notice: 5,
            info: 6,
            debug: 7
        }
    }

    /**
     * Returns the current level for the driver
     *
     * @attribute level
     *
     * @return {String}
     */
    get level () {
        return this.logger.transports[0].level
    }

    /**
     * Update driver log level at runtime
     *
     * @param  {String} level
     *
     * @return {void}
     */
    set level (level) {
        this.logger.transports[0].level = level
    }

    setConfig (config) {
        /**
         * Merging user config with defaults.
         */
        this.config = {
            name: 'adonis-app',
            level: 'info',
            indexPrefix: 'adonis-app',
            transformer,
            ...config
        }

        if (this.config.indexPrefix && this.config.mappingTemplate) {
            this.config.mappingTemplate.index_patterns = [`${this.config.indexPrefix}-*`]
        }
        const customFormat = this.config.format || format.combine(
            errors({ stack: true }),
            timestamp(),
            prettyPrint()
        )
        delete this.config.format
        /**
         * Creating new instance of winston with file transport
         */

        this.logger = createLogger({
            name: config.name,
            level: config.level,
            colorize: 'all',
            timestamp: new Date().toLocaleTimeString(),
            exitOnError: false,
            format: customFormat,
            levels: this.levels,
            transports: [
                new transports.Console(
                    {
                        level: 'debug',
                        format: format.combine(
                            format.label({ label: process.env.APP_NAME || 'adonis-app' }),
                            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                            format.colorize({ all: true }),
                            format.printf(info => `${info.timestamp} ${info.level} [${info.label}]: ${info.message}`)
                        )
                    }
                ),
                new ElasticsearchTransport(this.config)
            ]
        })
        /**
         * Updating winston levels with syslog standard levels.
         */
        this.logger.setLevels(this.levels)
    }

    /**
     * Log message for a given level.
     *
     * @method log
     *
     * @param  {Number}    level
     * @param  {String}    msg
     * @param  {...Spread} meta
     *
     * @return {void}
     */
    log (level, msg, ...meta) {
        const levelName = _.findKey(this.levels, num => num === level)
        if (levelName === 'notice') {
            this.logger.log(levelName, argumentsToString(arguments), ...meta)
        } else {
            this.logger.log(levelName, argumentsToString(arguments))
        }
    }
}

function argumentsToString (v) {
    // convert arguments object to real array
    const args = Array.prototype.slice.call(v)
    for (const k in args) {
        if (typeof args[k] === "object") {
            args[k] = util.inspect(args[k], false, null, false)
        }
    }
    return args.slice(1).join(" ")
}

module.exports = WinstonLogstash
