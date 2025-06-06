'use strict'

const Config = use('Config')
const RedisConfig = Config.get('redis')

module.exports = {
    default: { redis: { ...RedisConfig[RedisConfig.beequeue] } },
    deposit: {
        prefix: 'na3_payment:deposit:::bq:',
        redis: { ...RedisConfig.beequeue },
        removeOnSuccess: true,
        removeOnFailure: true
    },
    withdraw: {
        prefix: 'na3_payment:withdraw:::bq:',
        redis: { ...RedisConfig.beequeue },
        activateDelayedJobs: true,
        removeOnSuccess: true,
        removeOnFailure: true
    }
}
