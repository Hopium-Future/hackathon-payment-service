'use strict'

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| Http routes are entry points to your web application. You can create
| routes for different URLs and bind Controller actions to them.
|
| A complete guide on routing is available here.
| http://adonisjs.com/docs/4.1/routing
|
*/

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')

Route.group(() => {
    Route.get('slack_overflow', 'SlackAdminVerifyController.getOverflowMenu')
    Route.post('on_slack_action', 'SlackAdminVerifyController.handleSlackAction')
}).prefix('api/v3/payment')

Route.group(() => {
    Route.get('config', 'ConfigController.getConfig')
    Route.get('deposit_withdraw_history', 'DepositController.getDepositWithdrawHistory').middleware('session').middleware('auth')
    Route.get('deposit_withdraw_history/:id', 'DepositController.getDepositWithdrawHistoryById').middleware('session').middleware('auth')
    Route.post('withdraw', 'WithdrawController.submitWithdrawal').middleware('session').middleware('auth')
    Route.get('deposit_address', 'DepositController.getDepositAddress').middleware('session').middleware('auth')
    Route.post('list-ton-config', 'DepositController.listTonConfig') // List 1 coin mới mạng TON

    Route.get('check-max-deposit-usd', 'DepositController.checkMaxDepositUsd').middleware('session').middleware('auth')
}).prefix('api/v3/payment')


Route.group(() => {
    // Verify withdraw
    Route.get('/slack/overflow', 'SlackAdminVerifyController.getOverflowMenu')
    Route.post('/slack/on_action', 'SlackAdminVerifyController.handleSlackAction')
}).prefix('api/v3/payment/admin')
