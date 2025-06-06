"use strict";

const { PlatformProvider } = use("App/Library/Enum");
const Task = use("Task");
const UserPrivateWallet = use("App/Models/UserPrivateWallet");
const {
    WalletNetwork,
    WalletCryptography,
    DwTransactionMethod,
} = require("../Library/Enum");

const TonService = use("App/Services/TonService");
const Env = use("Env");
const DepositWithdraw = use("App/Models/DepositWithdraw");
const WithdrawService = use("App/Services/WithdrawService");
const User = use("App/Models/User");

let processing = false;
const TAG = "Deposit_CheckTonChain";
const IS_PROD = Env.get("NODE_ENV") === "production";

const Redis = use("Redis").connection("cache");
const KEY_CACHE_PREV_DEPOSIT_SCAN_BLOCK_TON_CHAIN =
    "ton-network:prev-scan-deposit-block";
const KEY_CACHE_PREV_WITHDRAW_SCAN_BLOCK_TON_CHAIN =
    "ton-network:prev-scan-withdraw-block";

class Deposit_CheckTonChain extends Task {
    static get schedule() {
        return "*/30 * * * * *"; // every 25 seconds
    }

    async handle() {
        if (process.env.ENABLE_DEPOSIT_WITHDRAW !== "1") return;
        if (process.env.CheckTonDeposit_Enable !== "1") {
            return;
        }

        if (processing) {
            Logger.info(`${TAG} still processing…`);
            return;
        }

        try {
            processing = true;
            Logger.info(`Starting ${TAG}`);
            await this.run();
        } catch (e) {
            Logger.error(e);
        } finally {
            Logger.info(`Finished ${TAG}`);
            processing = false;
        }
    }

    async run() {
        try {
            await this.handleDeposit();
        } catch (error) {
            Logger.error(`${TAG} handleDeposit error`, error);
        }

        try {
            await this.handleWithdraw();
        } catch (error) {
            Logger.error(`${TAG} handleWithdraw error`, error);
        }
        // Lưu "lt" của transaction cuối trong lần check này, lần sau scan từ lt này trở đi
    }

    async handleDeposit() {
        let prevLtDeposit = await Redis.get(
            KEY_CACHE_PREV_DEPOSIT_SCAN_BLOCK_TON_CHAIN
        );

        const rsScanDeposit = await TonService.scanDeposit(
            prevLtDeposit ? +prevLtDeposit : 0
        );
        if (!rsScanDeposit) {
            Logger.info("No deposit tx founded!", rsScanDeposit);
            return;
        }

        Logger.info(`${TAG} scanDeposit`, { prevLtDeposit, rsScanDeposit });
        const {
            listFormattedTx: listTxDeposit,
            saveLt: saveLtDeposit,
        } = rsScanDeposit;
        await this.handleTxReceived(listTxDeposit);
        await Redis.set(
            KEY_CACHE_PREV_DEPOSIT_SCAN_BLOCK_TON_CHAIN,
            saveLtDeposit
        );
    }

    async handleWithdraw() {
        let prevLtWithdraw = await Redis.get(
            KEY_CACHE_PREV_WITHDRAW_SCAN_BLOCK_TON_CHAIN
        );

        const rsScanWithdraw = await TonService.scanWithdraw(
            prevLtWithdraw ? +prevLtWithdraw : 0
        );
        if (!rsScanWithdraw) {
            Logger.info(
                "No withdrawal tx founded!",
                rsScanWithdraw,
                prevLtWithdraw
            );
            return;
        }

        Logger.info(`${TAG} scanWithdraw`, { prevLtWithdraw, rsScanWithdraw });
        const {
            listFormattedTx: listTxWithdraw,
            saveLt: saveLtWithdraw,
        } = rsScanWithdraw;
        await this.handleTxSent(listTxWithdraw);
        await Redis.set(
            KEY_CACHE_PREV_WITHDRAW_SCAN_BLOCK_TON_CHAIN,
            saveLtWithdraw
        );
    }

    async handleTxReceived(transactions = []) {
        if (transactions.length === 0) return;

        const network = WalletNetwork.TON;
        // Note: chỗ này ko cần check trước là user đã tạo ví Nạp cho token này hay chưa, vì nạp qua GOATS cũng chỉ cần memo là UserId thôi
        // const userPrivateWallets = await UserPrivateWallet.find({
        //     provider: PlatformProvider.NAMI,
        //     network,
        //     cryptography: WalletCryptography.Ton,
        // });

        // const existUser = {};
        // userPrivateWallets.forEach((userWallet) => {
        //     const { userId } = userWallet;
        //     existUser[userId] = true;
        // });

        // Nếu có Transaction thì xử lý update Deposit History
        for (const tx of transactions) {
            Logger.info(`${TAG} handleTxReceived tx:`, tx);

            try {
                const {
                    sender,
                    value,
                    assetId,
                    memo: userId,
                    txHash,
                    time,
                } = tx;

                // if (!existUser[memo]) {
                //     Logger.error(`${TAG} Deposit to Nami wallet but wrong memo`);
                //     continue;
                // }

                // nếu memo đúng là 1 userId thì lưu vào DB
                const existUser = await User.getOne({ _id: userId });

                if (!existUser) {
                    // Trường hợp này có người nạp vào ví tổng của Nami nhưng ko nhập Memo đúng (Memo ko phải là 1 userId của Nami)
                    Logger.error(
                        `${TAG} Deposit to Nami wallet but wrong memo, memo = ${userId}`
                    );
                    continue;
                }

                const type = DepositWithdraw.Type.Deposit;
                const isDuplicate = await DepositWithdraw.findOne({
                    type,
                    txId: txHash,
                    userId,
                });

                if (isDuplicate) {
                    Logger.error(`${TAG} Duplicate deposit track TON wallet`, {
                        tx,
                        prevRecord: isDuplicate,
                    });
                    continue;
                }

                const deposit = await DepositWithdraw.create({
                    type,
                    userId,
                    provider: DepositWithdraw.Provider.NAMI,
                    assetId,
                    transactionType: DwTransactionMethod.OnChain,
                    network,
                    amount: +value,
                    actualReceive: +value,
                    fee: null,
                    from: {
                        type: "Blockchain",
                        name: network,
                    },
                    to: {
                        type: "User",
                        name: userId,
                    },
                    status: DepositWithdraw.Status.Success,
                    txId: txHash,
                    metadata: { ...tx, address: sender },
                    transactionId: txHash,
                });

                Logger.info(`${TAG} created deposit`, deposit.toObject());
                const DepositService = use("App/Services/DepositService");
                // Cong tien o day
                const txDepositWallet = await DepositService.onOnChainDepositAuthorized(
                    deposit
                );
                Logger.info(`${TAG} deposit authorized`, txDepositWallet);
            } catch (error) {
                Logger.error(`${TAG} catch_handleTxReceived error`, error);
            }
        }
    }

    async handleTxSent(transactions = []) {
        for (const tx of transactions) {
            Logger.info(`${TAG} handleTxSent tx:`, tx);
            try {
                const { txHash, inMsgHash, lt, time, isSuccess } = tx;
                const network = WalletNetwork.TON;

                const filters = {
                    "metadata.txhash": inMsgHash,
                    network,
                    type: DepositWithdraw.Type.Withdraw,
                    provider: DepositWithdraw.Provider.NAMI,
                };

                const mapOrder = await DepositWithdraw.findOne(filters);
                Logger.info(`${TAG} handleTxSent filter:`, {
                    filters,
                    mapOrder,
                });

                if (!mapOrder) {
                    Logger.info(`${TAG} transaction sent not found`, tx);
                    continue;
                }

                if (isSuccess) {
                    const rs = await WithdrawService.onWithdrawalSuccess(
                        mapOrder._id.toString()
                    );
                    Logger.info(
                        `${TAG} withdrawal success`,
                        JSON.stringify({ tx, rs })
                    );
                } else {
                    const rs = await WithdrawService.onWithdrawalRejectedAndRollback(
                        mapOrder._id.toString()
                    );
                    Logger.info(
                        `${TAG} withdrawal failed`,
                        JSON.stringify({ tx, rs })
                    );
                }

                mapOrder.txId = txHash;
                mapOrder.metadata.txhash = txHash;
                mapOrder.metadata.lt = lt;

                mapOrder.markModified("metadata");
                await mapOrder.save();
            } catch (error) {
                Logger.error(`${TAG} catch_handleTxSent error`, error);
            }
        }
    }
}

module.exports = Deposit_CheckTonChain;
