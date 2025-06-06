'use strict'
const Env = use('Env')

module.exports = {
    eth: Env.get('ETHEREUM_NODE_DEPOSIT'),
    etc: Env.get('ETC_DEPOSIT_NODE'),
    bsc: Env.get('BSC_DEPOSIT_NODE'),
    ftm: Env.get('FTM_DEPOSIT_NODE'),
    onus: Env.get('ONUS_DEPOSIT_NODE'),
}
