const SysNoti = use('App/Library/SysNoti')
const {generate} = require('randomstring')
const _ = require('lodash')
const axios = require('axios')

const Redis = use('Redis')
const Redlock = require('redlock')

const Database = use('Database')

const Logger = use('Logger')
const LRU = require('lru-cache')
const ms = require('ms')
const Promise = require('bluebird')

const AssetConfig = use('App/Models/Config/AssetConfig')
const DepositWithdraw = use('App/Models/DepositWithdraw')
const UserLimitMongo = use('App/Models/Mongo/UserLimit')
const UserVipMongo = use('App/Models/Mongo/UserVip')
const ModelWallet = use('App/Models/Wallet')


const SLACK_ADMIN_VERIFY_WITHDRAWAL = process.env.NODE_ENV === 'development'
    ? [
        SysNoti.SlackUserID.DEV_LAMNV,
        SysNoti.SlackUserID.DEV_TRUNGND
    ] : [
        SysNoti.SlackUserID.DEV_TRUNGND
    ]
const User = use('App/Models/User')
const SLACK_BOT = process.env.SLACK_BOT_VERIFY_WITHDRAW
const REDIS_KEY_TOKEN = 'admin_verify_withdraw:token'
const REDIS_KEY_WITHDRAWAL_APPROVAL = 'admin_verify_withdraw:approval_status'
const RedisCache = use('Redis')
    .connection('cache')
const ActionHandlerLocker = new Redlock([RedisCache], {
    retryCount: Math.floor(30000 / 500),
    retryDelay: 500
})

const AssetValueMongo = use('App/Models/AssetValue')
const findRateUsdOfCurrency = async assetId => {
    const assetValue = await AssetValueMongo.getOneCached({assetId})
    return assetValue?.usdValue
}

async function addAdminActionToSlackMessage(slackMessage, slackUserId, slackUsername, action) {
    let approvalBlockSection
    let approvalBlockSectionIndex
    slackMessage.blocks.some((e, i) => {
        if (e.block_id === 'block_admin_action') {
            approvalBlockSection = e
            approvalBlockSectionIndex = i
            return true
        }
    })
    if (!approvalBlockSection || approvalBlockSectionIndex == null) {
        approvalBlockSection = {
            type: "context",
            block_id: 'block_admin_action',
            elements: []
        }
        approvalBlockSectionIndex = null
    }
    // Push approval to block
    const ActionDescription = {
        lock: 'Khóa giao dịch, nạp, rút',
        unlock: 'Mở khóa tài khoản'
    }
    approvalBlockSection.elements.push(
        {
            type: "mrkdwn",
            text: `*${slackUsername}* ${ActionDescription[action]}`
        }
    )
    if (approvalBlockSectionIndex == null) {
        // Insert
        slackMessage.blocks.some((e, i) => {
            if (e.block_id === 'block_action_button') {
                approvalBlockSectionIndex = i
                return true
            }
        })
        slackMessage.blocks.splice(approvalBlockSectionIndex, 0, approvalBlockSection)
    } else {
        slackMessage.blocks[approvalBlockSectionIndex] = approvalBlockSection
    }
}

async function addUserApproveOrRejectToSlackMessage(slackMessage, slackUserId, slackUsername, isApprove, isForceApprove) {
    let approvalBlockSection
    let
        approvalBlockSectionIndex
    slackMessage.blocks.some((e, i) => {
        if (e.block_id === 'block_admin_approval') {
            approvalBlockSection = e
            approvalBlockSectionIndex = i
            return true
        }
    })
    if (!approvalBlockSection || approvalBlockSectionIndex == null) {
        approvalBlockSection = {
            type: "context",
            block_id: 'block_admin_approval',
            elements: []
        }
        approvalBlockSectionIndex = null
    }
    // Push approval to block
    approvalBlockSection.elements.push(
        {
            type: "mrkdwn",
            text: `*${slackUsername}* ${isApprove ? (isForceApprove ? 'force approved ✅' : 'approved ✅') : 'rejected 🔴'}`
        }
    )
    if (approvalBlockSectionIndex == null) {
        // Insert
        slackMessage.blocks.some((e, i) => {
            if (e.block_id === 'block_action_button') {
                approvalBlockSectionIndex = i
                return true
            }
        })
        slackMessage.blocks.splice(approvalBlockSectionIndex, 0, approvalBlockSection)
    } else {
        slackMessage.blocks[approvalBlockSectionIndex] = approvalBlockSection
    }
}

exports.handleSlackAction = async function (
    payload
) {
    if (typeof payload === 'string') {
        payload = JSON.parse(payload)
    }
    let locker
    const slackUserId = _.get(payload, 'user.id') || _.get(payload, 'user._id')
    const slackUsername = _.get(payload, 'user.username', '(no-username)')
    if (!slackUserId) {
        throw 'slack_user_not_found'
    }
    if (!SLACK_ADMIN_VERIFY_WITHDRAWAL.includes(`<@${slackUserId}>`)) {
        throw 'unauthorized'
    }
    const slackMessage = _.get(payload, 'message')
    if (!slackMessage) {
        throw 'slack_message_not_found'
    }
    if (!slackMessage.blocks) {
        throw 'slack_message_blocks_not_found'
    }

    try {
        locker = await ActionHandlerLocker.lock(`lock_slack_admin_verify_withdrawal:${slackUserId}`, 180000)

        const action = _.get(payload, ['actions', 0])
        if (!action) {
            throw 'action_not_found'
        }
        const actionType = _.get(action, 'action_id')
        if (!actionType) {
            throw 'actionType_not_found'
        }

        if (actionType === 'btn_approve_withdrawal' || actionType === 'btn_reject_withdrawal') {
            const isApprove = actionType === 'btn_approve_withdrawal'
            const actionValue = _.get(action, 'value')
            if (!actionValue) {
                throw 'actionValue_not_found'
            }
            Logger.info('Admin verify withdraw received action value', actionValue)

            const actionData = actionValue.split(':')
            const [withdrawalId, withdrawalCode, token] = actionData
            const withdrawal = await DepositWithdraw.findById(withdrawalId)
            if (!withdrawal) {
                throw 'withdrawal not found'
            }
            if (withdrawal.transactionId !== withdrawalCode) {
                throw 'withdrawal code not match'
            }
            const withdrawTokenData = JSON.parse(await Redis.hget(REDIS_KEY_TOKEN, token))
            if (withdrawTokenData.withdrawal._id !== withdrawalId) {
                throw 'withdrawal id not match with the cache'
            }

            const currentApprovedAdmins = _.castArray(safeParseJSON(await Redis.hget(REDIS_KEY_WITHDRAWAL_APPROVAL, withdrawalId), []))
            // Admin đã action thì ko được duyệt lại
            if (currentApprovedAdmins.findIndex(e => e.slackUserId === slackUserId) >= 0) {
                return
            }
            currentApprovedAdmins.push({
                slackUserId,
                slackUsername,
                isApprove
            })

            // Update slack message: mark who has approved the withdrawal
            await addUserApproveOrRejectToSlackMessage(slackMessage, slackUserId, slackUsername, isApprove)
            if (!isApprove) {
                await onWithdrawApprovedOrRejected(false, withdrawalId, token)
                // Remove action buttons
                const blockIndex = slackMessage.blocks.findIndex(block => block.block_id === 'block_action_button')
                if (blockIndex !== -1) {
                    slackMessage.blocks.splice(blockIndex, 1)
                    await axios.post(payload.response_url, slackMessage)
                }
            } else {
                // Check tất cả mn đồng ý thì cho rút
                if (currentApprovedAdmins.length >= SLACK_ADMIN_VERIFY_WITHDRAWAL.length) {
                    const everyOneApproved = SLACK_ADMIN_VERIFY_WITHDRAWAL.every(slackId => currentApprovedAdmins.findIndex(e => {
                        const slackUserIdMentionFormat = `<@${e.slackUserId}>`
                        return slackUserIdMentionFormat === slackId
                    }) >= 0)
                    if (everyOneApproved) {
                        await onWithdrawApprovedOrRejected(true, withdrawalId, token)
                        // Remove action buttons
                        const blockIndex = slackMessage.blocks.findIndex(block => block.block_id === 'block_action_button')
                        if (blockIndex !== -1) {
                            slackMessage.blocks.splice(blockIndex, 1)
                            await axios.post(payload.response_url, slackMessage)
                        }
                    }
                }
            }
            await Redis.hset(REDIS_KEY_WITHDRAWAL_APPROVAL, withdrawalId, JSON.stringify(currentApprovedAdmins))
            // Send update slack message
            await axios.post(payload.response_url, slackMessage)
            Logger.info(`Slack admin ${slackUsername} approved withdrawal id ${withdrawalId} (${withdrawalCode}); current`, currentApprovedAdmins)
        } else if (actionType === 'overflow-action') {
            const actionCode = _.get(action, 'selected_option.value', '')

            if (actionCode.startsWith('option-force-approve')) {
                const [_actionType, withdrawalId, withdrawalCode, token] = actionCode.split(':')
                await onWithdrawApprovedOrRejected(true, withdrawalId, token)
                // Update slack message: mark who has approved the withdrawal
                await addUserApproveOrRejectToSlackMessage(slackMessage, slackUserId, slackUsername, true, true)
                // Remove action buttons
                const blockIndex = slackMessage.blocks.findIndex(block => block.block_id === 'block_action_button')
                if (blockIndex !== -1) {
                    slackMessage.blocks.splice(blockIndex, 1)
                    await axios.post(payload.response_url, slackMessage)
                }
            } else if (actionCode.startsWith('option-lock-account') || actionCode.startsWith('option-unlock-account')) {
                const [_actionType, userId] = actionCode.split(':')

                await addAdminActionToSlackMessage(slackMessage, slackUserId, slackUsername, _actionType === 'option-lock-account' ? 'lock' : 'unlock')
                await axios.post(payload.response_url, slackMessage)
                // Update user
                const user = await User.find({id: userId})
                user.bot_type = _actionType === 'option-lock-account' ? 1 : null
                await user.save()
            } else if (actionCode.startsWith('option-force-refund')) {
                const [_actionType, withdrawalId, withdrawalCode, token] = actionCode.split(':')
                await use('App/Services/WithdrawService').onWithdrawalRejectedAndRollback(withdrawalId, true)
                // Update slack message: mark who has approved the withdrawal
                await addUserApproveOrRejectToSlackMessage(slackMessage, slackUserId, slackUsername, true, true)
                // Remove action buttons
                const blockIndex = slackMessage.blocks.findIndex(block => block.block_id === 'block_action_button')
                if (blockIndex !== -1) {
                    slackMessage.blocks.splice(blockIndex, 1)
                    await axios.post(payload.response_url, slackMessage)
                }
            }
        } else {
            Logger.error(`Unsupported action type: ${actionType}`)
        }
    } catch (e) {
        Logger.error('Admin verify withdraw handleSlackAction', e)
        if (payload.trigger_id) {
            sendSimpleModalMessage(payload.trigger_id, 'Lỗi', `*Lỗi:* ${e.toString()}`)
                .catch(() => {
                })
        }
        throw e
    } finally {
        locker && await locker.unlock()
    }
}

async function sendSimpleModalMessage(triggerId, title, message) {
    try {
        const {data} = await axios.post('https://slack.com/api/views.open', {
            trigger_id: triggerId,
            view: {
                type: "modal",
                close: {
                    type: "plain_text",
                    text: "Đóng",
                    emoji: true
                },
                title: {
                    type: "plain_text",
                    text: title,
                    emoji: true
                },
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: message
                        }
                    }
                ]
            }
        }, {headers: {Authorization: `Bearer ${process.env.SLACK_BOT_VERIFY_WITHDRAW}`}})
    } catch (e) {
        if (!process.env.SLACK_BOT_VERIFY_WITHDRAW) {
            Logger.error(`Withdrawal admin, SLACK_BOT_VERIFY_WITHDRAW not set!`)
        }
        Logger.error(e)
    }
}

async function onWithdrawApprovedOrRejected(isApprove = false, withdrawalId, token) {
    let locker
    try {
        locker = await ActionHandlerLocker.lock(`lock_slack_admin_verify_onWithdrawApprovedOrRejected:${withdrawalId}`, 180000)
        const withdrawal = await DepositWithdraw.findById(withdrawalId)
        Logger.info(`Admin ${isApprove ? 'approving' : 'rejecting'} withdrawal id ${withdrawalId}, amount ${withdrawal.amount}, receive ${withdrawal.actualReceive}, currency ${withdrawal.assetId}`)
        if (withdrawal.adminStatus !== DepositWithdraw.AdminStatus.WaitingForApproval) {
            throw 'withdrawal status is not awaiting for approval'
        }
        // Get withdrawal data
        const withdrawData = safeParseJSON(await Redis.hget(REDIS_KEY_TOKEN, token))
        if (!withdrawData) {
            throw `withdrawData not found for token ${token}`
        }

        if (isApprove) {
            const {
                action,
                ...withdrawalParams
            } = withdrawData
            Logger.info(`Approved Withdrawal ${withdrawalId} withdraw amount ${withdrawal.amount}, receive ${withdrawal.actualReceive}, currency ${withdrawal.assetId}: addToWithdrawQueue`, withdrawalParams)
            if (action === 'WithdrawService.adminVerify') {
                await DepositWithdraw.findOneAndUpdate({_id: withdrawalId}, {adminStatus: DepositWithdraw.AdminStatus.Approved})
                await use('App/Services/WithdrawService')
                    .adminVerify
                    .apply(null, withdrawalParams.params)
            } else if (action === "TransferOffChainService.adminVerify") {
                await use('App/Services/TransferOffChainService')
                    .adminVerify
                    .apply(null, withdrawalParams.params)
            }

        } else {
            await use('App/Services/WithdrawService')
                .onWithdrawalRejectedAndRollback(withdrawalId)
        }
    } catch (e) {
        Logger.error(`Admin ${isApprove ? 'approving' : 'rejecting'} withdrawal id ${withdrawalId} error`, e)
        throw e
    } finally {
        locker && locker.unlock()
    }
}

async function getSlackUserAvatar32(slackUserId) {
    try {
        const {data} = await axios.get('https://slack.com/api/users.profile.get', {
            params: {user: slackUserId},
            headers: {Authorization: `Bearer ${process.env.SLACK_BOT_VERIFY_WITHDRAW}`}
        })
        return _.get(data, ['profile', 'image_32'])
    } catch (e) {
        if (!process.env.SLACK_BOT_VERIFY_WITHDRAW) {
            Logger.error(`Withdrawal admin, SLACK_BOT_VERIFY_WITHDRAW not set!`)
        }
        return null
    }
}

const RateCache = new LRU({maxAge: ms('5min')})

async function checkNegativeWallet(userId) {
    const wallets = await ModelWallet.find({userId, $or: [{lockedValue: {$lt: -0.001}}, {value: {$lt: -0.001}}]})
    if (wallets.length) {
        SysNoti.notify(`🆗 Người dùng: ${userId}, âm tài khoản/lock và đang muốn chuyển tiền`, {toSlackFuture: true}).catch()
    }
    return wallets.length > 0
}

exports.shouldVerifyViaAdmin = async function (userId, amount, currency) {
    const userVipLevel = await UserVipMongo.findOne({userId: userId}, 'level')
        .read('s')
        .then(e => _.get(e, 'level', 0))
    const vipDataLimit = await UserLimitMongo.findOne({
        userVip: userVipLevel,
        type: 'withdraw'
    })
    Logger.info('Check vip limit', {
        userId,
        userVipLevel,
        vipDataLimit
    })

    // Cần xác thực qua admin nếu 1 trong các điều kiện sau thỏa mãn
    // 1. Lệnh rút lớn hơn 2000 USDT
    // 2. Volume rút 6h lớn hơn 4000 USDT
    // 3. Chứa category không trusted

    const result = {
        shouldVerify: true,
        reason: null,
        totalWithdraw6h: 0,
        totalDeposit6h: 0
    }

    if (await checkNegativeWallet(userId)) {
        return {
            ...result,
            shouldVerify: true,
            reason: `Negative balance/lock`
        }
    }

    // Check amount > REDIS_KEY_ADMIN_WITHDRAW_AMOUNT_EACH USDT
    const rateUsd = await findRateUsdOfCurrency(currency)
    Logger.info("shouldVerifyViaAdmin rateUsd: ", {currency, rateUsd});
    
    if (!rateUsd) {
        return {
            ...result,
            shouldVerify: true,
            reason: `Cannot find rate usd of ${currency}`
        }
    }

    const limitAmountEachWithdrawal = vipDataLimit?.transactionLimit || 500
    if (amount * +rateUsd > limitAmountEachWithdrawal) {
        return {
            ...result,
            shouldVerify: true,
            reason: `Equivalent amount (vip ${userVipLevel}) ${(+(amount * +rateUsd).toFixed(2)).toLocaleString()} USD > ${limitAmountEachWithdrawal} USD`
        }
    }

    // Check volume 6h
    const date6h = new Date(Date.now() - 6 * 60 * 60 * 1000)

    const query6h = await DepositWithdraw.find({
        // type: DepositWithdraw.Type.Withdraw,
        // status: DepositWithdraw.Status.Pending,
        // provider: PlatformProvider.BINANCE,
        userId,
        createdAt: {$gt: date6h}
    })
    let totalVolumeWithdraw6h = 0
    let totalVolumeDeposit6h = 0
    const MAX_6H = +vipDataLimit?.limitWithin6h || 2000
    let notFoundRateWithdrawal

    if (query6h && query6h.length) {
        await Promise.some(query6h.map(async dw => {
            const rateUsd = await findRateUsdOfCurrency(dw.assetId)
            if (rateUsd != null) {
                const amountUsd = rateUsd * dw.amount
                if (dw.type === DepositWithdraw.Type.Deposit) {
                    totalVolumeDeposit6h += amountUsd
                } else {
                    totalVolumeWithdraw6h += amountUsd
                }
            } else {
                totalVolumeWithdraw6h = -1
                notFoundRateWithdrawal = dw
                return true
            }
        }), 1)
    }
    Logger.info('DepositWithdraw 6h', {userId, amount, currency, totalVolumeWithdraw6h})

    if (totalVolumeWithdraw6h >= MAX_6H) {
        return {
            shouldVerify: true,
            reason: `Volume withdraw 6h (vip ${userVipLevel}): ${(+totalVolumeWithdraw6h.toFixed(0)).toLocaleString()}$ > Giới hạn ${MAX_6H}$`,
            totalVolumeDeposit6h,
            totalVolumeWithdraw6h
        }
    }
    if (totalVolumeWithdraw6h === -1) {
        return {
            shouldVerify: true,
            reason: notFoundRateWithdrawal
                ? `Không tìm thấy rate của withdraw #${notFoundRateWithdrawal._id}; ${notFoundRateWithdrawal.amount} currency ${notFoundRateWithdrawal.assetId} để tính limit`
                : `Không xác định được rate để tính đc limit withdraw`,
            totalVolumeDeposit6h,
            totalVolumeWithdraw6h
        }
    }
    return {shouldVerify: false, totalVolumeDeposit6h, totalVolumeWithdraw6h}
}

exports.postConfirmationMessage = async function (
    withdrawal,
    metadata,
    reasonWhyNeedToConfirm,
    shouldVerifyViaAdminData
) {
    if (!SLACK_BOT) {
        SysNoti.notifyDelayed(`<@U7TRL8XSQ> Bot xác thực lệnh rút chưa được cài đặt`, 'bot_verify_withdrawal_not_setup')
        return
    }

    const User = use('App/Models/User')
    const assetConfig = await AssetConfig.getOneCached({id: withdrawal.assetId})
    const assetCode = assetConfig?.assetCode
    const user = await User.getOne({_id: withdrawal.userId})
    const token = `${withdrawal._id}_${generate(50)}`
    await Redis.hset(REDIS_KEY_TOKEN, token, JSON.stringify(
        {
            withdrawal,
            ...metadata
        }
    ))

    const message = {
        text: `Xác thực lệnh rút ${withdrawal.amount.toLocaleString()} ${assetCode}`,
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "Xác thực yêu cầu rút",
                    emoji: true
                }
            },

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `${SLACK_ADMIN_VERIFY_WITHDRAWAL.join(' ')}\n*Lý do cần xác thực:*\n${reasonWhyNeedToConfirm || 'không rõ'}`
                },
                accessory: {
                    type: "overflow",
                    options: [
                        {
                            text: {
                                type: "plain_text",
                                text: "⚠️ Force Approve",
                                emoji: true
                            },
                            value: `option-force-approve:${withdrawal._id}:${withdrawal.transactionId}:${token}`
                        },
                        {
                            text: {
                                type: "plain_text",
                                text: ":lock:️ Lock account",
                                emoji: true
                            },
                            value: `option-lock-account:${withdrawal.userId}:${withdrawal.transactionId}:${token}`
                        },
                        {
                            text: {
                                type: "plain_text",
                                text: ":unlock: Unlock account",
                                emoji: true
                            },
                            value: `option-unlock-account:${withdrawal.userId}:${withdrawal.transactionId}:${token}`
                        }
                    ],
                    action_id: "overflow-action"
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text:
                            `*Số lượng:*\n${(+withdrawal.amount).toLocaleString()} ${assetCode} – ${withdrawal.network || '(unknown network)'}\n`
                    }
                ]
            },
            {type: "divider"},
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Rút từ*: ${withdrawal?.from?.type} - ${withdrawal?.from?.name}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Rút tới:* ${withdrawal.provider || 'Nami'} ${withdrawal?.to?.type} - ${withdrawal?.to?.name}`
                    }
                ]
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Tổng nạp 6h:* ${(_.get(shouldVerifyViaAdminData, 'totalVolumeDeposit6h', 0)).toLocaleString()}$`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Tổng rút 6h:* ${(_.get(shouldVerifyViaAdminData, 'totalVolumeWithdraw6h', 0)).toLocaleString()}$`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Thông tin người dùng:*\n#${user._id} (${user.code} - ${user.email || 'no_email'} - ${_.get(user, 'username', user.name) || 'no_name'})`
                }
            },
            {type: "divider"},
            {
                type: "actions",
                block_id: "block_action_button",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            emoji: true,
                            text: "Approve"
                        },
                        style: "primary",
                        value: `${withdrawal._id}:${withdrawal.transactionId}:${token}`,
                        action_id: 'btn_approve_withdrawal'
                    },
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            emoji: true,
                            text: "Reject"
                        },
                        style: "danger",
                        value: `${withdrawal._id}:${withdrawal.transactionId}:${token}`,
                        action_id: 'btn_reject_withdrawal'
                    }
                ]
            }
        ]
    }
    const {data} = await axios.post(SLACK_BOT, message)
    if (process.env.NODE_ENV !== 'production') {
        console.log('Send verify block', JSON.stringify(_.omit(message, 'text')))
    }
    return data
}

exports.postRefundMessage = async function (
    withdrawalId,
    metadata,
    reasonWhyNeedToConfirm
) {
    if (!SLACK_BOT) {
        SysNoti.notifyDelayed(`<@U7TRL8XSQ> Bot xác thực lệnh rút chưa được cài đặt`, 'bot_verify_withdrawal_not_setup')
        return
    }
    const withdrawal = await DepositWithdraw.findById(withdrawalId)
    const User = use('App/Models/User')
    const assetConfig = await AssetConfig.getOneCached({id: withdrawal.assetId})
    const assetCode = assetConfig?.assetCode
    const user = await User.getOne({_id: withdrawal.userId})
    const token = `${withdrawal._id}_${generate(50)}`
    await Redis.hset(REDIS_KEY_TOKEN, token, JSON.stringify(
        {
            withdrawal,
            ...metadata
        }
    ))

    const message = {
        text: `Mở khóa lệnh rút ${withdrawal.amount.toLocaleString()} ${assetCode}`,
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "Mở khóa yêu cầu rút",
                    emoji: true
                }
            },

            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `${SysNoti.SlackUserID.DEV_TRUNGND} *Lý do:* ${reasonWhyNeedToConfirm || 'không rõ'}`
                },
                accessory: {
                    type: "overflow",
                    options: [
                        {
                            text: {
                                type: "plain_text",
                                text: "⚠️ Force Refund",
                                emoji: true
                            },
                            value: `option-force-refund:${withdrawal._id}:${withdrawal.transactionId}:${token}`
                        },
                        {
                            text: {
                                type: "plain_text",
                                text: ":lock:️ Lock account",
                                emoji: true
                            },
                            value: `option-lock-account:${withdrawal.userId}:${withdrawal.transactionId}:${token}`
                        },
                        {
                            text: {
                                type: "plain_text",
                                text: ":unlock: Unlock account",
                                emoji: true
                            },
                            value: `option-unlock-account:${withdrawal.userId}:${withdrawal.transactionId}:${token}`
                        }
                    ],
                    action_id: "overflow-action"
                }
            },
            {type: "divider"},
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Rút từ*: ${withdrawal?.from?.type} - ${withdrawal?.from?.name}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Rút tới:* ${withdrawal.provider || 'Nami'} ${withdrawal?.to?.type} - ${withdrawal?.to?.name}`
                    }
                ]
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text:
                            `*ID*: ${withdrawal._id}\n*Số lượng:* ${(+withdrawal.amount).toLocaleString()} ${assetCode} – ${withdrawal.network || '(unknown network)'}\n`
                    }
                ]
            },
        ]
    }
    const {data} = await axios.post(SLACK_BOT, message)
    if (process.env.NODE_ENV !== 'production') {
        console.log('Send verify block', JSON.stringify(_.omit(message, 'text')))
    }
    return data
}

exports.slack_overflowMenu = {
    blocks: [
        {
            type: "section",
            block_id: "section 890",
            text: {
                type: "mrkdwn",
                text: "This is a section block with an overflow menu."
            },
            accessory: {
                type: "overflow",
                options: [
                    {
                        text: {
                            type: "plain_text",
                            text: "*this is plain_text text*"
                        },
                        value: "value-0"
                    },
                    {
                        text: {
                            type: "plain_text",
                            text: "*this is plain_text text*"
                        },
                        value: "value-1"
                    },
                    {
                        text: {
                            type: "plain_text",
                            text: "*this is plain_text text*"
                        },
                        value: "value-2"
                    },
                    {
                        text: {
                            type: "plain_text",
                            text: "*this is plain_text text*"
                        },
                        value: "value-3"
                    },
                    {
                        text: {
                            type: "plain_text",
                            text: "*this is plain_text text*"
                        },
                        value: "value-4"
                    }
                ],
                action_id: "overflow"
            }
        }
    ]
}

function safeParseJSON(data, fallbackValue) {
    try {
        const result = JSON.parse(data)
        if (!result) {
            return fallbackValue
        }
        return result
    } catch (e) {
        return fallbackValue
    }
}
