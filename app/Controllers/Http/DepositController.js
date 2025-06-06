"use strict";

const DwService = use("App/Services/DepositService");
const DepositWalletService = use("App/Services/DepositWalletService");

class DepositController {
    async checkMaxDepositUsd({ request, response, user }) {
        const rs = await DwService.checkMaxDepositUsd(user?.id || user?._id);
        return response.sendSuccess(rs);
    }

    async listTonConfig({ request, response }) {
        const body = request.post();
        console.log("body", body);
        const rs = await use("App/Services/TonService").listTonNetwork(body);
        return response.sendSuccess(rs);
    }

    async getDepositWithdrawHistory({ request, response, user }) {
        const {
            type,
            status,
            lastId,
            page,
            pageSize = 20,
            network,
            assetId,
            transactionType,
            time = "all",
        } = request.get();
        try {
            const filter = {};
            const pagingOptions = {};

            if (type) {
                filter.type = type;
            }
            if (status) {
                filter.status = status;
            }
            if (network) {
                filter.network = network;
            }
            if (assetId) {
                filter.assetId = assetId;
            }
            if (transactionType) {
                filter.transactionType = transactionType;
            }

            pagingOptions.pageSize = +pageSize + 1;
            if (lastId) {
                pagingOptions.lastId = lastId;
            } else if (page) {
                pagingOptions.page = +page >= 1 ? page - 1 : 0;
            }

            switch (time) {
                case "1d":
                    filter.createdAt = {
                        $gte: new Date(Date.now() - 86400000),
                    };
                    break;
                case "3d":
                    filter.createdAt = {
                        $gte: new Date(Date.now() - 3 * 86400000),
                    };
                    break;
                case "7d":
                    filter.createdAt = {
                        $gte: new Date(Date.now() - 7 * 86400000),
                    };
                    break;
                case "30d":
                    filter.createdAt = {
                        $gte: new Date(Date.now() - 30 * 86400000),
                    };
                    break;
                default:
                    break;
            }

            const orders = await DwService.getHistory(
                user?.id || user?._id,
                filter,
                pagingOptions
            );

            return response.sendSuccess({
                orders: orders.slice(0, pageSize),
                hasNext: orders.length > pageSize,
            });
        } catch (e) {
            Logger.error("getDepositWithdrawHistory", e);
            return response.sendError();
        }
    }

    async getDepositWithdrawHistoryById({ response, params, user }) {
        try {
            const _id = params.id;
            if (!_id) throw "error";

            const data = await DwService.getHistoryDetails(user?.id || user?._id, _id);
            if (!data) throw "not found";

            return response.sendSuccess(data);
        } catch (e) {
            Logger.error("getDepositWithdrawHistoryById", { params, user, e });
            return response.status(404).send({
                data: { params },
                msg: "Deposit withdraw order not found!",
            });
        }
    }

    async getDepositAddress({ request, response, user }) {
        try {
            const { assetId, network, shouldCreate } = request.get();
            const addressInfo = await DepositWalletService.getOrCreateWallet(
                user?.id || user?._id,
                +assetId,
                network,
                shouldCreate === "true",
                true
            );
            return response.sendSuccess(addressInfo);
        } catch (e) {
            console.log(e);
            return response.sendError();
        }
    }
}

module.exports = DepositController;
