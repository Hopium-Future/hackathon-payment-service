const {
    WalletNetwork,
    WalletCryptography,
    PlatformProvider
} = use("App/Library/Enum")

const DwConfig = use('App/Models/DwConfig')
const UserPrivateWallet = use('App/Models/UserPrivateWallet')
const AssetConfig = use('App/Models/Config/AssetConfig')
const Web3 = use('Web3')
const _ = require('lodash')
const Promise = require('bluebird')

const BinanceBroker = use('App/Library/BinanceBroker')

const NamiError = use('Config')
    .get('error')
const TonService = use('App/Services/TonService')

class DepositWalletService {
    static async getOrCreateWallet (
        userId,
        assetId,
        network,
        shouldCreate = false,
        updateLastSeen = false
    ) {
        assetId = +assetId
        const dwConfig = await DwConfig.getOne({ assetId })
        if (!dwConfig) {
            throw NamiError.INVALID_INPUT
        }
        const networkConfig = dwConfig.networkList.find(networkItem => networkItem.network === network)
        if (!networkConfig) {
            throw NamiError.INVALID_INPUT
        }
        if (!networkConfig.depositEnable) {
            throw NamiError.INVALID_INPUT
        }
        const assetConfig = await AssetConfig.getOneCached({ id: assetId })

        // Find existing wallet
        let existingWallet
        if (networkConfig.provider === PlatformProvider.NAMI) {
            existingWallet = await UserPrivateWallet.findOne({
                userId,
                cryptography: getWalletCryptographyFromNetwork(network),
                provider: networkConfig.provider
            })
        } else {
            existingWallet = await UserPrivateWallet.findOne({
                userId,
                network,
                assetId,
                provider: networkConfig.provider
            })
        }
        if (existingWallet) {
            if (updateLastSeen) {
                existingWallet.lastSeen = new Date()
                existingWallet.save()
            }
            return existingWallet
        }
        if (!existingWallet && !shouldCreate) {
            return null
        }

        const objectToCreate = {
            type: UserPrivateWallet.Type.Deposit,
            userId,
            assetId: networkConfig.provider === PlatformProvider.NAMI ? 0 : assetId,
            network,
            cryptography: getWalletCryptographyFromNetwork(network),
            provider: networkConfig.provider
        }
        if (updateLastSeen) {
            objectToCreate.lastSeen = new Date()
        }

        if (networkConfig.provider === PlatformProvider.NAMI) {
            const addressInfo = await createUserAddressForNami(userId, assetConfig, network)
            if (!addressInfo) {
                throw new Error('Create address for Nami failed')
            }
            Object.assign(objectToCreate, {
                address: addressInfo.address,
                privateKey: addressInfo.privateKey,
                addressTag: addressInfo.addressTag
            })
        } else if (networkConfig.provider === PlatformProvider.BINANCE) {
            const addressInfo = await createUserAddressForBinance(userId, assetConfig, network, objectToCreate)
            Object.assign(objectToCreate, {
                address: addressInfo.address,
                addressTag: addressInfo.tag
            })
        }

        const createdWallet = await UserPrivateWallet.create(objectToCreate)
        return _.omit(createdWallet.toObject(), 'privateKey')
    }
}

async function createUserAddressForNami (userId, assetConfig, network) {
    const addressCryptography = await getWalletCryptographyFromNetwork(network)
    if (addressCryptography === WalletCryptography.Ethereum) {
        let account
        do {
            account = Web3.eth.accounts.create()

        } while (!!(await UserPrivateWallet.exists({
            address: account.address,
            type: UserPrivateWallet.Type.Deposit,
            network
            // provider: PlatformProvider.NAMI,
        })))

        return {
            address: account.address,
            privateKey: account.privateKey
        }
    } else if (addressCryptography === WalletCryptography.Ton) {
        // lấy địa chỉ ví TON tổng của Nami
        const namiTonAddress = await TonService.createUserTonWallet()

        // lấy địa chỉ ví TON của User là địa chỉ ví tổng của Nami, chỉ khác là user có thêm addressTag = userId (addressTag hay còn gọi là Memo/Comment/Tag trong 1 tx của Ton network),
        // khi có tx deposit vào ví Tổng Nami với memo = userId, sẽ ghi nhận nạp tiền cho user này
        // privateKey chỉ để tượng trưng, ko có ý nghĩa trong mạng TON network
        return { address: namiTonAddress, privateKey: userId, addressTag: userId }
    }

    return null
}

async function createUserAddressForBinance (userId, assetConfig, network) {
    const BinanceService = use('App/Services/BinanceService')
    const userBinanceAccount = await BinanceService.getOrCreateUserBinanceAccount(
        userId,
        false
    )
    // TODO ghep phan nay vao luon ko can tach rieng
    console.log('__ vao day', userBinanceAccount)
    const addressInfo = await BinanceBroker.depositAddress({ id: userId },
        {
            coin: assetConfig.assetCode,
            network
        })
    Logger.info(`Get binance address user=${userId} , address info`, addressInfo)
    if (!addressInfo || !addressInfo.address) {
        throw new Error('Invalid address info')
    }
    return addressInfo
}

const getWalletCryptographyFromNetwork = exports.getWalletCryptographyFromNetwork = function(network) {
    switch (network) {
        case WalletNetwork.TON:
            return WalletCryptography.Ton
        case WalletNetwork.Ethereum:
        case WalletNetwork.BSC:
        case WalletNetwork.KardiaChain:
        case WalletNetwork.FTM:
        case WalletNetwork.ONUS:
            return WalletCryptography.Ethereum
    }
    return null
}

module.exports = DepositWalletService
