/* eslint-disable no-multi-assign, no-use-before-define, no-unused-vars */
const Env = use('Env')
const OneSignal = require('onesignal-node')
const _ = require('lodash')
const Promise = require('bluebird')

const Logger = use('Logger')
const Redis = use('Redis').connection('fcm')
const { generate } = require('randomstring')

// Client
const OneSignalClient = new OneSignal.Client(Env.get('ONE_SIGNAL_APP_ID'), Env.get('ONE_SIGNAL_APP_AUTH_KEY'))
exports.OneSignalClient = OneSignalClient
exports.bindUserIdToDeviceId = async function(deviceId, userId, language) {
    console.log('-----, bind', deviceId, userId)
    if (!deviceId) {
        return
    }

    let currentTags
    try {
        const currentDevice = await OneSignalClient.viewDevice(deviceId)
        currentTags = _.get(currentDevice, 'body.tags', {})
    } catch (e) {
        currentTags = {}
    }
    const externalUserId = userId ? await getCustomExternalUserId(userId) : ''
    const bindData = {
        tags: { namiUserId: externalUserId },
        external_user_id: externalUserId
    }
    if (language) {
        bindData.language = language
    }
    const bindDeviceResult = await OneSignalClient.editDevice(deviceId, bindData)
    Logger.info(`Bind to userId=${userId}, deviceId=${deviceId}, language=${language}, result =`)
    // eslint-disable-next-line consistent-return
    return bindDeviceResult
}

exports.pushMobileNotification = async function(userId, title, content, options = {}) {
    return sendToUser(userId, content, {
        headings: typeof title === 'object' ? title : { en: title },
        // included_segments: [ 'Mobile' ] // Cannot use segments along with externalUserIds
        ...options
    })
}

const sendToUser = exports.sendToUser = async function(userId, content, _options = {}) {
    const userIdArrChunk = _.chain(userId).castArray().uniq().chunk(2000)
        .value() // Max 2000 external_user_id per request

    let result = await Promise.map(userIdArrChunk, async chunk => {
        const externalUserIds = await getCustomExternalUserIds(chunk)
        try {
            const notificationObject = {
                contents: typeof content === 'object' ? content : { en: content },
                include_external_user_ids: externalUserIds
            }
            if (_options.silent) {
                notificationObject.ios_sound = 'nil'
                notificationObject.android_channel_id = Env.get('ONE_SIGNAL_ANDROID_SILENT_CHANNEL_ID')
            }
            return await OneSignalClient.createNotification(_.assign(notificationObject, _options))
        } catch (e) {
            Logger.error('Send onesignal notification err, content', content)
            throw e
        }
    }, { concurrency: 1 })

    result = result.map(e => _.get(e, 'body'))
    Logger.info('OneSignal Push result', userId, result)
    return result
}

// Prevent security flaw: OneSignal allows client side to set external user id
async function getCustomExternalUserId (userId) {
    const KEY = 'hash_table_user_id_to_one_signal'
    const HASH_KEY = `user_${userId}`
    let externalUserId = await Redis.hget(KEY, HASH_KEY)
    if (!externalUserId) {
        externalUserId = `${userId}_${generate(50)}`
        await Redis.hset(KEY, HASH_KEY, externalUserId)
    }
    return externalUserId
}

async function getCustomExternalUserIds (userIds) {
    const KEY = 'hash_table_user_id_to_one_signal'

    const externalUserIds = await Redis.hmget(KEY, ...userIds.map(id => `user_${id}`))
    const dataToSet = {}
    for (let i = 0; i < externalUserIds.length; ++i) {
        const extId = externalUserIds[i]
        if (!extId) {
            externalUserIds[i] = `${userIds[i]}_${generate(50)}`
            dataToSet[`user_${userIds[i]}`] = externalUserIds[i]
        }
    }
    if (Object.keys(dataToSet).length) {
        await Redis.hmset(KEY, dataToSet)
    }
    return externalUserIds
}
