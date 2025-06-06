const axios = require('axios')
const Promise = require('bluebird')

const Logger = use('Logger')
const Redis = use('Redis')
const _ = require('lodash')
const ms = require('ms')

const SysNoti = use('App/Library/SysNoti')

const SlackUserID = {
    ADMIN_TUNA: '<@UMFAXL342>',
    DEV_TRUNGND: '<@U7TRL8XSQ>',
    DEV_NGOCDV: '<@U8ER3TV2S>',
    DEV_HIEPTH: '<@U8G1VN56X>',
    DEV_CHAUMN: '<@U8XRKS493>',
    ADMIN_LONGLD: '<@U7TQGU4E6>',
    ADMIN_MAIHB: '<@U8KRKKD9V>',
    CEO_DAIGV: '<@U7TMPA4JX>',
    CHANNEL_CURRENT: '<!channel>',
    CHANNEL_SOLUTION: '<!solutions>',
    DEV_LAMNV: '<@U03SS5R0LG4>'
}

exports.SlackUserID = SlackUserID

exports.notify = async function notify (message, _options = {}) {
    try {
        const options = _.defaults(_options, {
            toSlack: true,
            toSlackExchange: false,
            toSlackFuture: false,
            toSlackMention: []
        })

        const promises = []
        let mentionText = ''
        if (options.toSlackMention && options.toSlackMention.length) {
            mentionText = options.toSlackMention.join(' ')
            mentionText += ' '
        }

        if (options.toSlackExchange && process.env.EXCHANGE_NOTIFY_SLACK_URL) {
            promises.push(axios.post(process.env.EXCHANGE_NOTIFY_SLACK_URL, { text: mentionText + message }))
        } else if (options.toSlackFuture && process.env.SLACK_NAMI_FUTURE_NOTI) {
            promises.push(axios.post(process.env.SLACK_NAMI_FUTURE_NOTI, { text: mentionText + message }))
        } else if (options.toSlack && process.env.NOTIFY_SLACK_URL) {
            promises.push(axios.post(process.env.NOTIFY_SLACK_URL, { text: mentionText + message }))
        }
        Logger.info('SysNoti', mentionText + message)
        await Promise.all(promises)
    } catch (e) {
        const status = _.get(e, 'response.status')
        const responseData = _.get(e, 'response.data', e.response || '(no response)') || e
        Logger.error(`SysNoti error - status ${status}`, responseData)
    }
}

exports.notifyDelayed = async function(message, key, options, delayed = ms('15 min')) {
    const NOW = Date.now()
    if (key) {
        let lastTimeNotify = await Redis.hget('sysnoti_last_time_notify', key)
        if (!lastTimeNotify) {
            lastTimeNotify = 0
        }
        if (NOW - (+lastTimeNotify) < delayed) {
            Logger.info('SysNoti delayed', message)
            return
        }
    }
    await Promise.all([
        exports.notify(message, options),
        Redis.hset('sysnoti_last_time_notify', key, NOW)
    ])
}

exports.notifyDelayed = async function(message, key, options, delayed = ms('15 min')) {
    const NOW = Date.now()
    if (key) {
        let lastTimeNotify = await Redis.hget('sysnoti_last_time_notify', key)
        if (!lastTimeNotify) {
            lastTimeNotify = 0
        }

        if (NOW - (+lastTimeNotify) < delayed) {
            Logger.info('SysNoti delayed', message)
            return
        }
    }
    await Promise.all([
        exports.notify(message, options),
        Redis.hset('sysnoti_last_time_notify', key, NOW)
    ])
}

// eslint-disable-next-line consistent-return
exports.markTime = async function lastTimeNotify (category, value) {
    if (value != null) {
        await Redis.hset('deposit::transfer_to_root_notify_time', category, value)
    } else {
        const val = await Redis.hget('deposit::transfer_to_root_notify_time', category)
        if (val == null) return 0
        return +val
    }
}
