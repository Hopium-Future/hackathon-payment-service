'use strict'

/*
|--------------------------------------------------------------------------
| Redis Configuaration
|--------------------------------------------------------------------------
|
| Here we define the configuration for redis server. A single application
| can make use of multiple redis connections using the redis provider.
|
*/

const Env = use('Env')

module.exports = {
    connection: Env.get('REDIS_CONNECTION', 'cache'),
    cache: Env.get('REDIS_CACHE_URL', "redis://default:123456@127.0.0.1:6379/0?allowUsernameInURI=true"),
    locker: Env.get('REDIS_CACHE_URL', "redis://default:123456@127.0.0.1:6379/15?allowUsernameInURI=true"),
    beequeue: {
        host: Env.get('REDIS_BEEQUEUE_HOST', '127.0.0.1'),
        port: Env.get('REDIS_BEEQUEUE_PORT', 6379),
        password: Env.get('REDIS_BEEQUEUE_PASSWORD') || undefined,
        db: Env.get('REDIS_BEEQUEUE_DB', 0),
    },
}
