'use strict'

/** @type {import('@adonisjs/framework/src/Env')} */
const Env = use('Env')
module.exports = {
    /*
    |--------------------------------------------------------------------------
    | Default Connection
    |--------------------------------------------------------------------------
    |
    | Connection defines the default connection settings to be used while
    | interacting with SQL databases.
    |
    */
    connection: Env.get('DB_CONNECTION', 'mongodb'),
    mongodb: {
        connectionString: Env.get("MONGO_CONNECTION_STRING", null),
        connection: {
            host: Env.get("MONGO_HOST", "localhost"),
            port: Env.get("MONGO_PORT", 27017),
            user: Env.get("MONGO_USER", ""),
            pass: Env.get("MONGO_PASSWORD", ""),
            database: Env.get("MONGO_DATABASE", "adonis"),
            options: {
                replicaSet: Env.get("MONGO_REPLICA_SET", ""),
                useNewUrlParser: true,
                useCreateIndex: true,
                useFindAndModify: false
                // All options can be found at http://mongoosejs.com/docs/connections.html
            },
            debug: Env.get("MONGO_DEBUG", false) == "true",
        },
    },
}
