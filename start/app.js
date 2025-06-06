'use strict'
const path = require('path')
/*
|--------------------------------------------------------------------------
| Providers
|--------------------------------------------------------------------------
|
| Providers are building blocks for your Adonis app. Anytime you install
| a new Adonis specific package, chances are you will register the
| provider here.
|
*/
const providers = [
    '@adonisjs/framework/providers/AppProvider',
    '@adonisjs/auth/providers/AuthProvider',
    '@adonisjs/bodyparser/providers/BodyParserProvider',
    '@adonisjs/antl/providers/AntlProvider',
    '@adonisjs/cors/providers/CorsProvider',
    '@adonisjs/lucid/providers/LucidProvider',
    '@adonisjs/redis/providers/RedisProvider',
    '@adonisjs/mail/providers/MailProvider',
    '@adonisjs/framework/providers/ViewProvider',
    'adonis-mongoose-model/providers/MongooseProvider',
    '@adonisjs/http-logger/providers/LoggerProvider',
    'adonis-scheduler/providers/SchedulerProvider',
    path.join(__dirname, '..', 'providers', 'Grpc/Provider'),
    path.join(__dirname, '..', 'providers', 'Web3/Provider'),
    path.join(__dirname, '..', 'providers', 'BeeQueue/Provider'),
    path.join(__dirname, '..', 'providers', 'Logstash/Provider')
]

/*
|--------------------------------------------------------------------------
| Ace Providers
|--------------------------------------------------------------------------
|
| Ace providers are required only when running ace commands. For example
| Providers for migrations, tests etc.
|
*/
const aceProviders = [
    '@adonisjs/lucid/providers/MigrationsProvider',
    'adonis-scheduler/providers/CommandsProvider'
]

/*
|--------------------------------------------------------------------------
| Aliases
|--------------------------------------------------------------------------
|
| Aliases are short unique names for IoC container bindings. You are free
| to create your own aliases.
|
| For example:
|   { Route: 'Adonis/Src/Route' }
|
*/
const aliases = { Scheduler: 'Adonis/Addons/Scheduler' }

/*
|--------------------------------------------------------------------------
| Commands
|--------------------------------------------------------------------------
|
| Here you store ace commands for your package
|
*/
const commands = [
	'App/Commands/Test',
    'App/Commands/EncryptTonPrivateKey',
    'App/Commands/Rootaccount',
]

module.exports = {
    providers,
    aceProviders,
    aliases,
    commands
}
