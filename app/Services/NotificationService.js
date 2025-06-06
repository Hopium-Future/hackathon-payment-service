const axios = require("axios");

const User = use("App/Models/User");
const Env = use("Env");

const AssetConfig = use("App/Models/Config/AssetConfig");
const Mail = use("Mail");
const socket = use("App/Library/Socket/SocketClientToMainServer");
const Antl = use("Antl");

const NOTIFICATION_URL = Env.get(
    "NOTIFICATION_URL",
    ""
);
const API_NOTIFICATION_PRIVATE_KEY = Env.get(
    "API_NOTIFICATION_PRIVATE_KEY",
    "123456a@"
);

class NotificationService {
    static axiosNotification = axios.create({
        baseURL: NOTIFICATION_URL,
        headers: {"X-API-KEY": API_NOTIFICATION_PRIVATE_KEY},
    });

    static async sendChatBotMessage(_options) {
        const {templateName, userId, params, cbError} = _options;
        try {
            const rs = await this.axiosNotification.post(
                "/notice/send-template", // NOTIFICATION_URL + "/otp",
                {
                    service: "payment", // phải khai báo enum "service" trước ở source "nami-exchange-notification-service"
                    templateName, // tính năng nào đang gửi OTP thì phải qua source Noti khai báo trước nhé, ví dụ feature "transfer-offchain", "sell-by-partner", ...
                    userId: +userId,
                    params,
                    language: "en",
                }
            );
            Logger.info("payment_send_otp", {params, rs: rs.data});

            return rs.data?.data;
        } catch (e) {
            Logger.error("catch_call_otp_to_notification", {
                _options,
                resData: e?.response?.data,
            });
            if (cbError) return cbError();
            throw "OTP_ERROR";
        }
    }

    static async sendChatBotNotify(data) {
        const { template, userId, context } = data;
        try {
            const rs = await this.axiosNotification.post(
                "/push-notification",
                {"notification": [data]},
                {
                    headers: {
                        'x-auth-user': JSON.stringify({"id": userId })
                    }
                }
            );
            Logger.info("payment_send_noti", { data, rs: rs.data });
            return rs.data?.data;
        } catch (e) {
            Logger.error(
                "catch_push_noti_to_notification",
                { data, resData: e?.response?.data }
            );
            throw "NOTI_ERROR";
        }
    }

    static async pushNotificationAsync(
        toUserId,
        category,
        content,
        options = {}
    ) {
        return socket.pushNotification({
            toUserId,
            category,
            content,
            options,
        });
    }

    static async sendWithdrawalNoticeMail(withdraw) {
        const userData = await User.getOne({_id: withdraw.userId});
        if (!userData.email) return;
        // send email
        try {
            const email_time = new Date()
                .toISOString()
                .replace(/T/, " ")
                .replace(/\..+/, "")
                .replace(/-/g, "/");
            const assetConfig = await AssetConfig.getOneCached({
                id: withdraw.assetId,
            });
            const namiLocale = "en";
            const mailResult = await Mail.send(
                "emails.withdrawal_notice",
                {
                    locale: namiLocale,
                    antl: Antl.forLocale(namiLocale),
                    amount: withdraw.amount,
                    currency: assetConfig.assetCode,
                    address: withdraw?.to?.address,
                },
                (message) => {
                    message
                        .to(userData.email)
                        .from(Env.get("EMAIL_FROM"))
                        .subject(
                            `Nami | Withdrawal Request Notice - ${email_time} (UTC)`
                        );
                }
            );
            Logger.info("Send withdrawal notice mail result", mailResult);
        } catch (err) {
            Logger.error("Send withdrawal notice mail error: ", err);
        }
    }

    static async sendMail(options) {
        await axios
            .post(
                NOTIFICATION_URL + "/send-mail",
                {
                    template: options.template,
                    to: options.to,
                    subject: options.subject,
                    lang: options.lang ?? "vi",
                    context: options.context,
                },
                {
                    headers: {
                        "Content-Type": "application/json; charset=UTF-8",
                        "api-private-key": API_NOTIFICATION_PRIVATE_KEY,
                    },
                }
            )
            .catch(async (e) => {
                console.error(
                    "Errow when send mail with payload:",
                    {...options, cbError: null},
                    e?.response?.data
                );
                if (options.cbError) {
                    await options.cbError();
                }
            });
    }

    // Tạo mã OTP và gửi OTP hoặc trong trường hợp gọi lại cùng tham số sau 1 phút, thì chỉ resend OTP qua mail thôi. Nếu
    /**
     * Ví dụ 1 mã OTP TTL 5p, sau 1p cho phép resend. Thì:
     * Lần đầu call: tạo mã OTP mới và gửi mail. Respond status "ok", remaining_time, loại otp
     * Gọi từ lần 2 trở đi:
     *    - trước 1 phút: Respond status TOO_MUCH_REQUEST + remaining_time
     *    - sau 1 phút: Respond status "ok", remaining_time, loại otp (giống lần đầu như ko tạo mã OTP mới mà chỉ gửi lại thôi)
     */
    static async sendOtp(params) {
        const {feature, userId, uniqueParams, emailParams, cbError} = params;
        try {
            const rs = await this.axiosNotification.post(
                "/otp/send", // NOTIFICATION_URL + "/otp",
                {
                    service: "payment", // phải khai báo enum "service" trước ở source "nami-exchange-notification-service"
                    feature, // tính năng nào đang gửi OTP thì phải qua source Noti khai báo trước nhé, ví dụ feature "transfer-offchain", "sell-by-partner", ...
                    userId,
                    uniqueParams,
                    emailParams,
                }
            );
            Logger.info("payment_send_otp", {params, rs: rs.data});

            return rs.data?.data;
        } catch (e) {
            Logger.error("catch_call_otp_to_notification", {
                params,
                resData: e?.response?.data,
            });
            if (cbError) return cbError();
            throw "OTP_ERROR";
        }
    }

    static async checkOtp(params) {
        const {
            feature,
            userId,
            uniqueParams,
            otpCode,
            isRemoveAfterCheckDone,
        } = params;
        try {
            const rs = await this.axiosNotification.post(
                "/otp/check", // NOTIFICATION_URL + "/otp",
                {
                    service: "payment",
                    feature, // tính năng nào đang gửi OTP thì phải qua source Noti khai báo trước nhé, ví dụ feature "transfer-offchain", "sell-by-partner", ...
                    userId,
                    uniqueParams,
                    otpCode,
                    isRemoveAfterCheckDone, // nếu có check 2fa thì phải đợi cho 2fa done ok luôn mới đi xóa OTP của email, khi này truyền isRemoveAfterCheckDone để sau khi check nếu true sẽ ko bị xóa. Nhớ sau khi check 2fa done phải call func removeOtpAfterCheckDone!
                }
            );
            Logger.info("payment_check_otp", {params, rs: rs.data});
            return rs.data?.data;
        } catch (e) {
            Logger.error("catch_call_otp_to_notification", {
                params,
                resData: e?.response?.data,
            });
            if (cbError) return cbError();
            throw "OTP_ERROR";
        }
    }

    static handleRespondOtp(resOtp) {
        const {
            // res cho api sendOtp
            isSend,
            isReSend,
            isMuchRequest,

            // res cho api checkOtp
            isRightOtp,

            // res chung luôn có
            otpBy,
            remaining_time,
        } = resOtp;

        if (isSend || isReSend) {
            return {
                remaining_time,
                otp: [otpBy],
            };
        } else if (isMuchRequest) {
            throw {
                status: "TOO_MUCH_REQUEST",
                data: {
                    remaining_time,
                    otp: [otpBy],
                },
            };
        } else if (!isRightOtp) {
            throw {
                status: "invalid_otp",
                data: {
                    remaining_time,
                    otp: [otpBy],
                },
            };
        }
    }

    static async removeOtpAfterCheckDone(params) {
        const {feature, userId, uniqueParams} = params;
        try {
            const rs = await this.axiosNotification.post(
                "/otp/remove", // NOTIFICATION_URL + "/otp",
                {
                    service: "payment",
                    feature, // tính năng nào đang gửi OTP thì phải qua source Noti khai báo trước nhé, ví dụ feature "transfer-offchain", "sell-by-partner", ...
                    userId,
                    uniqueParams,
                }
            );
            return rs.data?.data;
        } catch (e) {
            Logger.error("catch_removeOtpAfterCheckDone", {
                params,
                resData: e?.response?.data,
            });
            if (cbError) return cbError();
            throw "OTP_ERROR";
        }
    }
}

module.exports = NotificationService;

NotificationService.Category = {
    DEFAULT: 0,
    DEPOSIT_WITHDRAW: 14,
};
