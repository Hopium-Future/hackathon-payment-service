"use strict";

const Task = use("Task");

const TonService = use("App/Services/TonService");

let processing = false;
const TAG = "TonTransferInternal";

class TonTransferInternal extends Task {
    static get schedule() {
        return "* * * * *"; // every days
    }

    async handle() {
        if (processing) {
            Logger.info(`${TAG} still processing…`);
            return;
        }

        try {
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
        await TonService.transferAllToken();
    }
}

module.exports = TonTransferInternal;
