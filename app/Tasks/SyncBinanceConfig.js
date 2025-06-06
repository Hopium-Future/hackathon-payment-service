'use strict'

const {getConfigAllTokens} = require("../Library/BinanceBroker");
const Task = use('Task')
const bb = require('bluebird')

const DwNetwork = use("App/Models/DwNetwork");
const DwConfig = use('App/Models/DwConfig')
const {
    concat,
    get,
    isEmpty,
    isEqual,
    keyBy,
    map,
    pick,
    toLower,
    uniq,
    without,
} = require('lodash');
const AssetConfig = use('App/Models/Config/AssetConfig')
const Env = use('Env')
const IS_PROD = Env.get('NODE_ENV') === 'production'

class SyncBinanceConfig extends Task {
    static get schedule() {
        return '*/5 * * * *'
    }

    async handle() {
        if(!IS_PROD) return
        this.info('Task SyncBinanceConfig handle')
        this.syncBinance()
    }

    async syncBinance() {
        const binanceConfig = await getConfigAllTokens()
        if (!binanceConfig) {
            console.log('not found data');
            return null;
        }
        const assetConfigs = await AssetConfig.find({});

        await bb.map(assetConfigs, async (assetConfig) => {
            const _bConfig = binanceConfig.find(i => i.coin === assetConfig.assetCode)
            console.log({_bConfig, assetConfig})
            if (!_bConfig) {
                console.log('not found data', assetConfig.assetCode);
                return null;
            }
            try {
                const oldDwConfig = await DwConfig.findOne({
                    assetId: assetConfig.id,
                });

                if (oldDwConfig && oldDwConfig.syncConfig === false) {
                    console.log('turn off sync config', assetConfig.assetCode);
                    return null;
                }

                let upsertNetwork = [];
                let removedNetwork = [];
                if (oldDwConfig) {
                    const currentDwNetwork = await DwNetwork
                        .find({coin: assetConfig.assetCode})
                        .select({network: 1});
                    const currentNetwork = currentDwNetwork.map(i => i.network);
                    const binanceNetwork = get(_bConfig, 'networkList', []).map(i => i.network);
                    removedNetwork = without(currentNetwork, ...binanceNetwork);
                    upsertNetwork = without(binanceNetwork, removedNetwork);
                    console.log({
                        currentNetwork,
                        binanceNetwork,
                        upsertNetwork,
                        removedNetwork,
                    });
                }

                await DwConfig.updateOne(
                    {assetId: assetConfig.id},
                    {
                        ...pick(_bConfig, [
                            'ipoable',
                            'ipoing',
                            'isLegalMoney',
                            'storage',
                            'trading',
                        ]),
                        assetId: assetConfig.id,
                    },
                    {upsert: true},
                );

                await DwNetwork.deleteMany({
                    coin: assetConfig.assetCode,
                    network: {$in: removedNetwork},
                });
                const dwNetworks = await bb.map(
                    get(_bConfig, 'networkList', []),
                    async dwNetwork => {
                        return DwNetwork.findOneAndUpdate(
                            {coin: assetConfig.assetCode, network: dwNetwork.network},
                            {
                                $set: {
                                    ...pick(dwNetwork, [
                                        'addressRegex',
                                        'coin',
                                        'depositDesc',
                                        'depositEnable',
                                        'isDefault',
                                        'memoRegex',
                                        'minConfirm',
                                        'name',
                                        'network',
                                        'resetAddressStatus',
                                        'specialTips',
                                        'unLockConfirm',
                                        'withdrawDesc',
                                        'withdrawEnable',
                                        'withdrawFee',
                                        'withdrawIntegerMultiple',
                                        'withdrawMax',
                                        'withdrawMin',
                                    ]),
                                    provider: 'BINANCE',
                                },
                            },
                            {upsert: true, new: true},
                        );
                    },
                );

                await DwConfig.updateOne(
                    {
                        assetId: assetConfig.id,
                    },
                    {
                        $set: {networkList: map(dwNetworks, '_id')},
                    },
                );

                return true;
            } catch (error) {
                throw error;
            }
        })


    }
}

module.exports = SyncBinanceConfig
