"use strict"

const WithdrawAdminVerify = use("App/Services/WithdrawAdminVerify")

class SlackAdminVerifyController {
    async getOverflowMenu () {
        return WithdrawAdminVerify.slack_overflowMenu
    }

    async handleSlackAction ({ request, response }) {
        try {
            const data = request.post()
            return await WithdrawAdminVerify.handleSlackAction(data?.payload ?? JSON.parse(request?._raw).payload)
        } catch (e) {
            const s = e.toString()
            Logger.error('SlackAdminVerifyController.handleSlackAction', e)
            return response.status(500).send(s)
        }
    }
}

module.exports = SlackAdminVerifyController
