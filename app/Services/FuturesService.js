const axios = require("axios");

const User = use("App/Models/User");
const Env = use("Env");

const AssetConfig = use("App/Models/Config/AssetConfig");
const Mail = use("Mail");
const socket = use("App/Library/Socket/SocketClientToMainServer");
const Antl = use("Antl");

const FUTURES_URL = Env.get(
    "FUTURES_URL",
    ""
);
const API_FUTURES_PRIVATE_KEY = Env.get(
    "API_FUTURES_PRIVATE_KEY",
    "123456"
);

class NotificationService {
    static axiosNotification = axios.create({
        baseURL: FUTURES_URL,
        headers: {"api-private-key": API_FUTURES_PRIVATE_KEY},
    });

    static async haveOpeningOrder(userId) {
        try {
            const {data} = await this.axiosNotification.get(
                "/futures/vndc/count-open-order", // NOTIFICATION_URL + "/otp",
                {
                    params: {userId: +userId}
                }
            );
            return !(data && data?.data === 0)
        } catch (e) {
            Logger.error("haveOpeningOrder", {
                userId,
                resData: e?.response?.data,
            });
            return false
        }
    }
}

module.exports = NotificationService;

NotificationService.Category = {
    DEFAULT: 0,
    DEPOSIT_WITHDRAW: 14,
};
