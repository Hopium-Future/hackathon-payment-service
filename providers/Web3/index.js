'use strict'
const { ioc } = require('@adonisjs/fold')
const web3 = require('web3');
const axios = require('axios')
const DEFAULT_NAME = 'eth'
const CONFIG_PREFIX = 'web3-eth'
const Erc20MinimalAbi = require('./_erc20_minimal_abi.json')
const Env = use('Env')
const PrivateKeyDecryptor = require('simple-encryptor')(Env.get('PRIVATE_WALLET_DECRYPTION_KEY', 'aaaaaaaaaaaaaaaaaaaa')).decrypt
const Logger = use('Logger')
const {generate} = require('randomstring')
const Big = require('bignumber.js')
const LRU = require('lru-cache')
const {default: AwaitLock} = require('await-lock');


module.exports = class {
    constructor (Config, name) {
        this.Config = Config
        this._pool = {}

        return new Proxy(this, require('./proxyHandler'))
    }

    connection (name) {
        if (!name) name = DEFAULT_NAME

        if (this._pool[name]) {
            return this._pool[name]
        }

        let config = this.Config.get(`${CONFIG_PREFIX}.${name}`)
        if (!config) config = this.Config.get(`${CONFIG_PREFIX}.${DEFAULT_NAME}`)

        /**
         * CREATE INSTANCE
         */
        const instance = new web3(config)
        instance.eth.getDepositLogs = getDepositLogs
        instance.custom = {};
        instance.custom.getErc20Balance = getErc20Balance.bind(instance);
        instance.custom.transferBep20 = transferBep20.bind(instance);
        instance.custom.estimateTransferErc20Gas = estimateTransferErc20Gas.bind(instance);
        /**
         * END
         */

        this._pool[name] = instance
        return instance
    }
}

async function getErc20Balance(address, contractAddress, decimalsToConvertToReadable = null) {
    const tokenContract = new this.eth.Contract(Erc20MinimalAbi, contractAddress);
    const tokenBalance = await tokenContract.methods.balanceOf(address).call()
    if (decimalsToConvertToReadable != null) {
        return +Big(tokenBalance).div(Big(10).pow(decimalsToConvertToReadable));
    } else {
        return tokenBalance;
    }
}

async function estimateTransferErc20Gas(amount, contractAddress, fromAddress, toAddress, gasLimit = 1e5) {
    const tokenContract = new this.eth.Contract(Erc20MinimalAbi, contractAddress);
    return await tokenContract.methods.transfer(toAddress, amount).estimateGas({from: fromAddress, gas: '100000000000000000'});
}

const nonceBep20 = new LRU({ maxAge: 10000 });
const transferLock = new AwaitLock();
async function transferBep20(amountRaw, contractAddress, toAddress, fromPrivateKey, gasPrice, gasLimit = 10e5, nonce = null) {
    try {
        await transferLock.acquireAsync();

        const tokenContract = new this.eth.Contract(Erc20MinimalAbi, contractAddress);
        const txData = tokenContract.methods.transfer(toAddress, amountRaw).encodeABI()
        if (!gasPrice) {
            gasPrice = await this.eth.getGasPrice();
        }
        const tx = {
            to: contractAddress,
            data: txData,
            gas: gasLimit,
            gasPrice,
        };
        const privateKey = (fromPrivateKey.startsWith('0x') || fromPrivateKey.length === 64) ?
            fromPrivateKey :
            PrivateKeyDecryptor(fromPrivateKey);
        // Get account just for logging
        const account = this.eth.accounts.privateKeyToAccount(privateKey);
        if (!nonce) {
            const lastNonce = nonceBep20.get(account.address);
            if (lastNonce != null) {
                nonce = lastNonce + 1;
            } else {
                nonce = await this.eth.getTransactionCount(account.address);
            }
        }
        if (nonce != null) {
            tx.nonce = nonce;
            nonceBep20.set(account.address, nonce);
        }
        const uniqId = generate(20);
        Logger.info(`Start transferring bep20 (uid ${uniqId})`, {
            amount: amountRaw,
            contractAddress,
            fromAddress: account.address,
            toAddress,
            gasPrice,
            gasLimit,
            nonce,
        })
        const rawTx = await this.eth.accounts.signTransaction(tx, privateKey)
        const transactionResult = await this.eth.sendSignedTransaction(rawTx.rawTransaction);
        Logger.info(`Sent Bep20 transaction (uid ${uniqId})`, transactionResult);
        return transactionResult;
    } catch (e) {
        throw e;
    } finally {
        await transferLock.release();
    }
}

async function getDepositLogs(tokenAddressOrAddresses, fromBlock, toBlock) {
    if (!tokenAddressOrAddresses) return null

    return await this.getPastLogs({
        address: tokenAddressOrAddresses,
        fromBlock,
        toBlock,
        topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Deposit event, see @link https://ropsten.etherscan.io/tx/0x721c2e8fe1c45e986ad265517f7294cc017b71d8e499731cc2e4e8fd769ffcb7#eventlog
        ]
    })
}


async function getErc20GasPrice(profile = 'fast') {
    const {data} = await axios.get('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=' + process.env.ETHERSCAN_API_KEY)
    const fast = +data.result.FastGasPrice
    const safeLow = +data.result.SafeGasPrice
    if (profile === 'fast') {
        return web3.utils.toWei(((fast*1 + safeLow*0) / 1).toFixed(3), 'gwei')
    } else if (profile === 'normal') {
        return web3.utils.toWei(((fast*1 + safeLow*1) / 2).toFixed(3), 'gwei')
    } else {
        return web3.utils.toWei(((fast*1 + safeLow*2) / 3).toFixed(3), 'gwei')
    }
}
