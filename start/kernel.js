'use strict'

/** @type {import('@adonisjs/framework/src/Server')} */
const Server = use('Server')

/*
|--------------------------------------------------------------------------
| Global Middleware
|--------------------------------------------------------------------------
|
| Global middleware are executed on each http request only when the routes
| match.
|
*/
const globalMiddleware = [
    'Adonis/Middleware/BodyParser',
    'App/Middleware/ConvertEmptyStringsToNull',
    'App/Middleware/Hook',
]

/*
|--------------------------------------------------------------------------
| Named Middleware
|--------------------------------------------------------------------------
|
| Named middleware is key/value object to conditionally add middleware on
| specific routes or group of routes.
|
| // define
| {
|   auth: 'Adonis/Middleware/Auth'
| }
|
| // use
| Route.get().middleware('auth')
|
*/

const namedMiddleware = {
  session: 'App/Middleware/SessionUser',
  auth: 'App/Middleware/HasAuth',
  restrictIp: 'App/Middleware/RestrictIp',
  checkBearer: 'App/Middleware/CheckBearer',
  parseDeviceTag: 'App/Middleware/ParseDeviceTag',
  throttle: 'App/Middleware/Throttle',
}
/*
|--------------------------------------------------------------------------
| Server Middleware
|--------------------------------------------------------------------------
|
| Server level middleware are executed even when route for a given URL is
| not registered. Features like `static assets` and `cors` needs better
| control over request lifecycle.
|
*/
const serverMiddleware = [
]

Server
    .registerNamed(namedMiddleware)
    .registerGlobal(globalMiddleware)
    .use(serverMiddleware)

if (!use('Helpers').isAceCommand()) {
    const Scheduler = use('Adonis/Addons/Scheduler')
    Scheduler.run()
}
