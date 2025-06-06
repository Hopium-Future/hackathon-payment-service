const path = require('path')

const Helpers = use('Helpers')

module.exports = {
    wallet: {
        host: process.env.GRPC_WALLET_HOST,
        protoPath: path.join(Helpers.appRoot(), '../na3-interface/proto', 'wallet.proto'),
        serviceName: 'Wallet'
    },
}
