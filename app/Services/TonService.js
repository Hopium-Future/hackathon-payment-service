const Env = use("Env");
const SmcConfig = use("App/Models/SmartcontractConfig");
const User = use("App/Models/User");
const WalletService = use("Grpc").connection("wallet");

const DwNetwork = use("App/Models/DwNetwork");
const _ = require("lodash");

const Redis = use("Redis");
const Utils = use("App/Library/Utils");
const Promise = require("bluebird");
const {
    WalletNetwork,
    PlatformProvider,
    DwTransactionMethod,
} = require("../Library/Enum");

const AssetConfig = use("App/Models/Config/AssetConfig");
const PrivateKeyDecryptor = require("simple-encryptor")(
    Env.get("PRIVATE_WALLET_DECRYPTION_KEY")
        ? Env.get("PRIVATE_WALLET_DECRYPTION_KEY")
        : "aaaaaaaaaaaaaaaaaaaa"
).decrypt;

const UserPrivateWallet = use("App/Models/UserPrivateWallet");
const WalletCurrencies = use("Config").get("walletCurrencies");

const { mnemonicNew, mnemonicToWalletKey } = require("@ton/crypto");
const { WalletContractV5R1, TonClient, JettonMaster } = require("@ton/ton");
const {
    Address,
    beginCell,
    fromNano,
    internal,
    SendMode,
    toNano,
    external,
    storeMessage,
} = require("@ton/core");
const { getHttpEndpoint } = require("@orbs-network/ton-access");
const TAG = "TON_SERVICE";

const IS_TEST = Env.get("NODE_ENV") === "development";
console.log("___IS_TEST: ", IS_TEST);

// Địa chỉ ví TON dùng để Nạp của Nami (ví Tổng nạp)
const NAMI_TON_DEPOSIT_ADDRESS = parseAddress(
    Env.get("NAMI_TON_DEPOSIT_ADDRESS")
);
const NAMI_TON_DEPOSIT_MNEMONIC = PrivateKeyDecryptor(
    Env.get("NAMI_TON_DEPOSIT_MNEMONIC")
);

// Địa chỉ ví TON dùng để Rút của Nami (ví Tổng rút)
const NAMI_TON_WITHDRAW_ADDRESS = parseAddress(
    Env.get("NAMI_TON_WITHDRAW_ADDRESS")
);

const NAMI_TON_WITHDRAW_MNEMONIC = PrivateKeyDecryptor(
    Env.get("NAMI_TON_WITHDRAW_MNEMONIC")
);

const DEFAULT_FEE_WITHDRAW = "0.05"; // đơn vị TON, phí rút tối thiểu này phải bằng field withdrawFee trong collection "dwnetworks" (chỉ tính network: "TON")
const DEFAULT_FEE_NOTIFY_JETTON = "0.001"; // đơn vị TON

// Key redis này chứa thông tin Jetton Wallet Address của ví TON Tổng của Nami.
const KEY_JETTON_DEPOSIT = `ton:jetton_wallet:${NAMI_TON_DEPOSIT_ADDRESS}`;
const KEY_JETTON_WITHDRAW = `ton:jetton_wallet:${NAMI_TON_WITHDRAW_ADDRESS}`;
const buildKeyJettonCache = (address) => `ton:jetton_wallet:${address}`;
const buildKeySeqno = (address) => `ton:seqno:${address}`;

async function init() {
    const keys = await Redis.keys("*ton:jetton_wallet*");
    for (const key of keys) {
        console.log("KEYS: ", key);

        await Redis.del(key);
    }

    const seqnoKeys = await Redis.keys("*ton:seqno*");
    for (const key of seqnoKeys) {
        console.log("KEYS: ", key);
        await Redis.del(key);
    }
}

init();

let TonRpcClient = new TonClient({
    // endpoint này không bị rate limit, copy from https://stackoverflow.com/questions/78560361/how-to-parse-incoming-messages-on-the-ton-blockchain
    endpoint: IS_TEST
        ? "https://testnet.tonhubapi.com/jsonRPC"
        : "https://toncenter.com/api/v2/jsonRPC",
    apiKey: IS_TEST
        ? undefined
        : "1b312c91c3b691255130350a49ac5a0742454725f910756aff94dfe44858388e",
});

async function getTonClient() {
    if (TonRpcClient) return TonRpcClient;

    const endpoint = await getHttpEndpoint({
        network: IS_TEST ? "testnet" : "mainnet",
    });
    TonRpcClient = new TonClient({ endpoint });
    return TonRpcClient;
}

// Tất cả address hệ TON chúng ta sẽ sử dụng format Bounceable address
// Version của tất cả các ví TON của Nami sẽ là V5R1
/**
 * @returns { address: string, privateKey: string }
 * @description Tạo ví mới cho user (privateKey là mnemonic 24 words)
 */
// async function createTonWallet(assetId = WalletCurrencies.TON) {
//     let account;
//     do {
//         let mnemonic = await mnemonicNew(); // array 24 words
//         const key = await mnemonicToWalletKey(mnemonic);
//         const generatedWallet = WalletContractV5R1.create({
//             publicKey: key.publicKey,
//             workchain: 0,
//         });

//         account = {
//             address: parseAddress(generatedWallet.address),
//             privateKey: mnemonic.join(" "),
//         };
//     } while (
//         !!(await UserPrivateWallet.exists({
//             address: account.address,
//             type: UserPrivateWallet.Type.Deposit,
//             network: WalletNetwork.TON,
//         }))
//     );

//     // Nếu ko phải native token TON mà là fungible Token, thì lưu sẵn jettonWalletAddress luôn, sau này có nạp/rút token này thì nhanh hơn, chứ hàm getJettonWalletAddress rất lâu
//     if (assetId !== WalletCurrencies.TON) {
//         cacheJettonWalletAddress(assetId);
//     }

//     return account;
// }

// Tất cả user của Nami chỉ nạp vào 1 ví Tổng của Nami, dựa trên memo (memo = userId) để xác nhận transaction của address này là của userId nào
async function createUserTonWallet() {
    return NAMI_TON_DEPOSIT_ADDRESS;
}

// Hàm này lấy địa chỉ 1 Asset của 1 ví TON (nếu ko có cache thì sẽ đi lấy địa chỉ Asset đó dựa trên assetId và địa chỉ ví TON)
async function cacheJettonWalletAddress(
    tonAddress = NAMI_TON_DEPOSIT_ADDRESS,
    assetId
) {
    const jettonCacheKey = buildKeyJettonCache(tonAddress);
    let jettonWalletAddress = await Redis.hget(jettonCacheKey, assetId);

    if (!jettonWalletAddress) {
        // case này hiếm khi xảy ra
        const dwNetwork = await DwNetwork.find({
            provider: PlatformProvider.NAMI,
            network: DwNetwork.Network.TON,
            depositEnable: true,
        });

        const smartContractConfig = await SmcConfig.findOne({
            networkId: { $in: dwNetwork.map((obj) => obj._id) },
            assetId,
        });

        if (!smartContractConfig) {
            Logger.error(
                `${TAG} cacheJettonWalletAddress NotFoundSmcConfig assetId=${assetId}`
            );
            throw "NOT FOUND SMART CONTRACT CONFIG";
        }

        const jettonMasterAddress = smartContractConfig.address;
        jettonWalletAddress = await getJettonWalletAddress(
            jettonMasterAddress,
            tonAddress
        );
        await Redis.hset(jettonCacheKey, assetId, jettonWalletAddress);
    }

    return jettonWalletAddress;
}

async function test() {
    return WalletService.getAvailableAsync(10, WalletCurrencies.GOATS);

    
    // return scanDeposit(28699688000001);
    // return scanWithdraw(28697343000004);
    // return await scanDeposit();

    // await init();
    // return getBalance(WalletCurrencies.GOATS, NAMI_TON_WITHDRAW_ADDRESS);
    // transferAllToken();
    // return "oke";
    const NotificationService = use("App/Services/NotificationService");

    const user = await User.getOne({ id: 10 });
    console.log("user: ", user);

    await NotificationService.sendChatBotMessage({
        templateName: "NAO_FUTURES",
        userId: 6694660655,
        params: {},
    });
    // return "oke";

    return mockBalance(10, WalletCurrencies.USDT, 176, -176);
    // return getBalance(39);
    // return PrivateKeyDecryptor("8a8657d6a8154f55891963b5eb8959de6cee7699a16e7e30ac484c040abf62c0e89c541b6b55bc4c432cf95e40dd8044hvtoQwx/0Uds/KQpLCPS4G1Uy9xjuqxzbvM9R5GIgExcP//7rG/6Vo1XH8qTKfE4pHJxoyV7f4F119GPtV7tcxoP+J6SkYtx76LPc/3PlK9qhi1gXig9jDke1+Ae22iGhZw99EVkr9X7ErmsLCMpO3Ry57lQurGNl1SYcCteovr7NMRUbSu8LK/KFYSBw9s+uPlTQ07ALtvW3DsCwNo1yA==")
    // return encrypoMnemonic("orange pave next lizard ill autumn short common reject tourist circle predict flavor rough toilet chaos team throw sister road volume ozone post smile");
    // return getBalance(39);

    // return User.getUserTransactionInfo(6);

    // const ModelWallet = use("App/Models/Wallet");
    // const x = await ModelWallet.find({
    //     userId: 6,
    //     $or: [
    //         {
    //             lockedValue: { $lt: -0.001 },
    //         },
    //         { value: { $lt: -0.001 } },
    //     ],
    // });
    // return x;

    // // return fakeDWhistory();
    // const client = await getTonClient(); // Get the client

    // console.log("____client", client);

    return await scanDeposit(
        28693812000001,
        NAMI_TON_DEPOSIT_ADDRESS,
        "received"
    );

    const toAddress = "0QC6GT0mel0o88nzm_EkjoP2_0ck0xDnQT8_Vincn7nq5Rm_"; // Testnet 1

    const smartContractConfig = await getScmConfigFromAssetId(
        WalletCurrencies.TON
    );

    const amountVnst = Math.floor(Date.now() / 100000000);
    const sendVnst = await transferExternalFromNami(
        toAddress,
        0.5, //amountVnst,
        `Test withdraw ${amountVnst} TON`,
        smartContractConfig,
        "vital cost situate manual sting rotate state sauce ugly swallow parade breeze version news purchase quit feature shift nose genre plug foil identify napkin",
        "0QCh_Lpr_jAH5eHbyL6wU9YdSqSBGDUhS0QiIn6DVV4zU7CW"
    );

    // const tonSmartContractConfig = await getScmConfigFromAssetId(
    //     WalletCurrencies.TON
    // );

    // const amountTon = (Date.now() % 1000) / 1000;
    // const sendTon = await transferExternalFromNami(
    //     toAddress,
    //     amountTon,
    //     `Test withdraw ${amountTon} TON`,
    //     tonSmartContractConfig
    // );

    return "oke";

    // const sendTon2 = await transferExternalFromNami(
    //     toAddress,
    //     amountTon,
    //     `Test withdraw ${amountTon} TON`,
    //     tonSmartContractConfig
    // );

    // return { sendVnst, sendTon, sendTon2 };

    // await Utils.sleep(1000);
    // return await scanDeposit(28444561000001);

    // const allBalance = await getAllBalance();
    // return allBalance;

    return "test";
}

async function mockBalance(
    userId = 10,
    assetId = WalletCurrencies.TON,
    available = 0,
    lock = 0
) {
    if (!IS_TEST) return;
    return await WalletService.changeBalanceAsync(
        userId, // string userId = 1;
        assetId, // uint32 assetId = 2;
        available, // double valueChange = 3;
        lock, // double lockedValueChange = 4;
        5, // uint32 category = 5;
        "Mock balance", // string note = 6;
        null,
        {} //string options = 7;
    );
}
function generateRandomTxHash(network) {
    if (network === WalletNetwork.TON) {
        const hexChars = "0123456789abcdef"; // Valid hexadecimal characters
        let hash = "";

        // Generate 64 random hexadecimal characters
        for (let i = 0; i < 64; i++) {
            const randomIndex = Math.floor(Math.random() * hexChars.length);
            hash += hexChars[randomIndex];
        }

        return hash;
    } else if (network === WalletNetwork.BSC) {
        const prefix = "0x"; // BSC transaction hash starts with 0x
        const hexChars = "0123456789abcdef"; // Valid hexadecimal characters
        let hash = prefix;

        // Generate 64 random hexadecimal characters
        for (let i = 0; i < 64; i++) {
            const randomIndex = Math.floor(Math.random() * hexChars.length);
            hash += hexChars[randomIndex];
        }

        return hash;
    }
}

function generateRandomFloat(min = 0, max = 50, precision = 9) {
    // Generate a random float in the range [min, max]
    const randomFloat = Math.random() * (max - min) + min;

    // Limit the precision to the specified number of decimal places
    return parseFloat(randomFloat.toFixed(precision));
}

async function fakeDWhistory(params) {
    const mockNetwork = [WalletNetwork.TON, WalletNetwork.BSC];
    for (let i = 0; i < 20; i++) {
        const userId = 6;
        const assetId = 22;
        const value = generateRandomFloat();
        const network = mockNetwork[i % mockNetwork.length];
        const txHash = generateRandomTxHash(network);
        const sender =
            network === WalletNetwork.TON
                ? "UQAM8PA9ZqR4rD33mviy0WrjAsDH4q3DW1ebxTm9Q3icwWsK"
                : "0x5009317FD4F6F8FeEa9dAe41E5F0a4737BB7A7D5";

        const DepositWithdraw = use("App/Models/DepositWithdraw");
        if (i % 7 === 0) {
            await DepositWithdraw.create({
                type: DepositWithdraw.Type.Withdraw,
                transactionId: txHash,
                userId,
                provider: DepositWithdraw.Provider.NAMI,
                assetId,
                transactionType: DwTransactionMethod.OnChain,
                network,
                amount: +value,
                actualReceive: +value,
                fee: { value: 0.01 },
                from: sender,
                to: sender,
                status: [
                    DepositWithdraw.Status.Declined,
                    DepositWithdraw.Status.Success,
                ][i % 2],
                adminStatus: 2,
                txId: txHash,
                // metadata: { txhash: txHash, address: sender },
                // metadata: {
                //     networkConfigId: networkConfig._id.toString(),
                //     ...dwMetadata
                // }
            });
        } else {
            const deposit = await DepositWithdraw.create({
                type: DepositWithdraw.Type.Deposit,
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
                metadata: { txhash: txHash, address: sender },
                transactionId: txHash,
            });
        }

        const DepositService = use("App/Services/DepositService");
        // Cong tien o day
        // const txDepositWallet = await DepositService.onOnChainDepositAuthorized(
        //     deposit
        // );
    }
}

async function getScmConfigFromAssetId(assetId) {
    const assetCode = await AssetConfig.getAssetCode(assetId);
    const dwNetwork = await DwNetwork.findOne({
        coin: assetCode,
        network: DwNetwork.Network.TON,
        provider: PlatformProvider.NAMI,
    });
    if (!dwNetwork) return;
    const smartContractConfig = await SmcConfig.findOne({
        networkId: dwNetwork._id,
    });
    return smartContractConfig;
}

function encrypoMnemonic(mnemonic) {
    const PrivateKeyEncryptor = require("simple-encryptor")(
        Env.get("PRIVATE_WALLET_DECRYPTION_KEY")
            ? Env.get("PRIVATE_WALLET_DECRYPTION_KEY")
            : "aaaaaaaaaaaaaaaaaaaa"
    ).encrypt;
    return PrivateKeyEncryptor(mnemonic);
}

async function getBalance(
    assetId = WalletCurrencies.TON,
    tonAddress = NAMI_TON_WITHDRAW_ADDRESS,
    jettonWalletAddress = null
) {
    // console.log("getBalance", { assetId, tonAddress, jettonWalletAddress });

    const client = await getTonClient();

    // Handle TON native token balance
    if (assetId === WalletCurrencies.TON) {
        const balance = await client.getBalance(tonAddress);
        return +fromNano(balance);
    }

    try {
        // Fetch Jetton configuration
        const smcConfig = await getScmConfigFromAssetId(assetId);
        if (!smcConfig) {
            Logger.warn(
                `${TAG} No smart contract config found for assetId=${assetId}`
            );
            return 0;
        }

        if (!jettonWalletAddress) {
            // Get Jetton wallet address
            jettonWalletAddress = await cacheJettonWalletAddress(
                tonAddress,
                assetId
            );
        }

        // Fetch Jetton balance
        const balanceResult = await client.runMethod(
            jettonWalletAddress,
            "get_wallet_data"
        );

        const jettonBalance = balanceResult?.stack?.readBigNumber() || 0n;
        return +fromCustomNano(jettonBalance, smcConfig.decimals);
    } catch (error) {
        // Trong trường hợp mà ví TON này ko có token, thì việc runMethod get_wallet_data sẽ quăng lỗi, vì vậy catch trả về balance của nó là 0
        Logger.error(
            `${TAG} Error fetching balance for assetId=${assetId}, tonAddress=${tonAddress}: ${error.message}`
        );
        return 0;
    }
}

async function getAllBalance() {
    const client = await getTonClient();
    const rs = {};

    const tonBalance = await getBalance();
    rs[WalletCurrencies.TON] = tonBalance;

    let allJettonWallet = await Redis.hgetall(KEY_JETTON_DEPOSIT);

    for (const assetId of Object.keys(allJettonWallet)) {
        if (+assetId === WalletCurrencies.TON) continue;
        const jettonWalletAddress = allJettonWallet[assetId];
        const balanceResult = await client.runMethod(
            jettonWalletAddress,
            "get_wallet_data"
        );
        const jettonBalance = fromNano(balanceResult.stack.readBigNumber()); // Số dư Jetton trả về ở dạng BigInt

        rs[assetId] = jettonBalance;
    }
    return rs;
}

/**
 * @description Hàm này để track transaction của 1 TON address. Trả ra những transaction Nạp token vào ví này (chỉ những token được Nami config có network TON mới nhận, transaction nhầm thì bỏ qua)
 * @param {*} userAddress : địa chỉ ví TON (ko phải ví Jetton) muốn track transaction.
 * @param {*} to_lt : Nếu truyền sẽ lấy tất cả Transactions mới, sau (transaction có lt = to_lt) này, nếu không truyền thì sẽ lấy tất cả tới thời điểm Address mới tạo
 * @returns { listValidTxReceived: [ { sender: string, value: string, assetId: number, memo?: string | Buffer }, ... ], saveLt: string of BigInt }
 * @license https://ton-community.github.io/ton/classes/HttpApi.html#getTransactions
 */
async function trackTransactions(
    userAddress = NAMI_TON_DEPOSIT_ADDRESS,
    to_lt,
    smartContractConfig,
    txType = "received"
) {
    if (!_.isNumber(to_lt)) to_lt = undefined;

    try {
        const transactions = await getFullTransactionsToLt(userAddress, to_lt);

        console.log("Total transactions: ", transactions.length);

        if (transactions.length === 0) return;

        // Lưu lại lt để lần sau check từ lt này trở đi
        const saveLt = transactions[0].lt.toString();
        const listFormattedTx = [];

        for (const tx of transactions) {
            console.log("------------------------------");
            // Scan transaction hash này bằng https://toncenter.com/transaction/{txHashHex} để xem chi tiết
            const txHashHex = tx.hash().toString("hex");
            const txHashBase64 = tx.hash().toString("base64");
            const lt = tx.lt.toString();

            const totalFees = fromNano(tx?.totalFees?.coins);
            // console.log("Tx: ", { txHashHex, totalFees, lt });

            // console.log("Each transaction: ", {
            //     time: dateFormat(
            //         new Date(tx.now * 1000),
            //         "hh:MM:ss dd/mm/yyyy"
            //     ),
            //     txHashHex,
            //     txHashBase64,
            //     lt,
            // });

            // await Utils.sleep(2000); // Đợi 10 giây để tạo tạm 1 cây nến mới (nến 10 giây)

            try {
                const rs = await parseTransaction(
                    userAddress,
                    tx,
                    smartContractConfig,
                    txType
                );
                console.log("Result parsed:", rs);

                if (!rs) continue;

                if (rs.type === "sent") {
                    listFormattedTx.push(rs);
                } else {
                    rs.sender = parseAddress(rs.sender);
                    rs.value = +rs.value;
                    rs.txHash = txHashHex;
                    rs.time = tx.now;

                    listFormattedTx.push(rs);
                }
                Logger.info(`${TAG} Parsed transaction: `, JSON.stringify(rs));
            } catch (error) {
                console.log("error trackTransactions", error);
                Logger.error(`${TAG} Error parse transaction`, { error, tx });
                continue;
            }

            console.log("------------------------------");
        }

        return {
            listFormattedTx,
            saveLt,
        };
    } catch (error) {
        console.error("Error fetching transactions:", error);
        throw "error";
    }
}

function isTransactionSuccessful(transaction) {
    const { outMessagesCount, description } = transaction;

    const actionPhase = description?.actionPhase || {};
    const computePhase = description?.computePhase || {};

    return (
        outMessagesCount > 0 && // Có thông điệp nội bộ
        actionPhase.success === true && // Action phase thành công
        actionPhase.valid === true && // Action phase hợp lệ
        actionPhase.skippedActions === 0 && // Không bỏ qua hành động
        computePhase.success === true // VM xử lý thành công
    );
}

// Hàm này tìm Jetton config từ 1 jettonAddress hoặc từ 1 assetId
async function getJettonConfig(smartContractConfig, assetId, jettonAddress) {
    console.log("getJettonConfig", {
        smartContractConfig,
        assetId,
        jettonAddress,
    });

    if (!jettonAddress && !assetId) return undefined;

    if (jettonAddress) {
        const bounceAddr = jettonAddress.toString({
            testOnly: IS_TEST,
            bounceable: true,
        });
        const nonBounceAddr = jettonAddress.toString({
            testOnly: IS_TEST,
            bounceable: false,
        });

        return smartContractConfig.find(
            (obj) =>
                obj.masterAddress === bounceAddr ||
                obj.masterAddress === nonBounceAddr
        );
    }

    return smartContractConfig.find((obj) => obj.assetId === assetId);
}

/**
 * 
 * @returns array SmartcontractConfig [
    [
        {
            masterAddress: Jetton master address của token đó trên mạng TON blockchain,
            walletAddress: Jetton wallet address của tonAddress đó trong jetton contract,
            assetId: id của Jetton đó trong sàn Nami (ví dụ Jetton USDT có assetId = 22),
            decimals: số thập phân hiển thị của Jetton đó (mỗi Jetton có 1 số thập phân khác nhau, xem chi tiết trong details smart contract của Jetton đó trên Ton Viewer), thường thì đa số Jetton có decimals = 9 nên có thể sử dụng hàm fromNano, với Jetton khác thì phải nhân lại số lượng decimals để ra số, người dùng nhìn thấy,
        }
    ]
 */
async function getConfigJetton(tonAddress = NAMI_TON_DEPOSIT_ADDRESS) {
    const dwNetwork = await DwNetwork.find({
        provider: PlatformProvider.NAMI,
        network: DwNetwork.Network.TON,
        depositEnable: true,
    });

    const smartContractConfig = await SmcConfig.find({
        networkId: { $in: dwNetwork.map((obj) => obj._id) },
    });

    const key = buildKeyJettonCache(tonAddress);
    const allJettonWalletAddress = await Redis.hgetall(key);

    const formattedJettonConfigs = [];
    for (const jettonConfig of smartContractConfig) {
        const {
            assetId,
            address: jettonMasterAddress,
            decimals,
        } = jettonConfig;

        if (!assetId && !jettonMasterAddress && !decimals) continue; // case record smart contract config bị thêm lỗi

        let jettonWalletAddress = allJettonWalletAddress[`${assetId}`];
        if (!jettonWalletAddress && assetId !== WalletCurrencies.TON) {
            await Utils.sleep(1000);
            jettonWalletAddress = await getJettonWalletAddress(
                jettonMasterAddress,
                tonAddress
            );
        }

        await Redis.hset(key, assetId, jettonWalletAddress);

        formattedJettonConfigs.push({
            assetId,
            decimals,
            masterAddress: jettonMasterAddress,
            walletAddress: jettonWalletAddress,
        });
    }

    return formattedJettonConfigs;
}

async function scanDeposit(prevLt, tonAddress = NAMI_TON_DEPOSIT_ADDRESS) {
    const smartContractConfig = await getConfigJetton(tonAddress);

    const listReceiveTxs = await trackTransactions(
        tonAddress,
        prevLt,
        smartContractConfig,
        "received"
    );
    return listReceiveTxs;
}

async function scanWithdraw(prevLt, tonAddress = NAMI_TON_WITHDRAW_ADDRESS) {
    const smartContractConfig = await getConfigJetton(tonAddress);

    const listReceiveTxs = await trackTransactions(
        tonAddress,
        prevLt,
        smartContractConfig,
        "sent"
    );
    return listReceiveTxs;
}

// Hàm này lấy tất cả Transaction được tạo sau Tx có lt=to_lt, transaction này có thể là Gửi/Nhận, Phí, bla bla
async function getFullTransactionsToLt(userAddress, to_lt) {
    const client = await getTonClient();
    const LIMIT_PER_BATCH = 100;
    /**
     * lt: prevTransaction.lt.toString()
     * hash: prevTransaction.hash().toString('base64') hoặc Buffer.from(prevTransaction.hash().toString('hex'), 'hex')
     * to_lt: cái này mới đúng là filter from (bắt đầu lấy tx xảy ra sau tx có lt = to_lt này)
     */
    const opts = {
        limit: LIMIT_PER_BATCH, // Luôn luôn phải truyền limit
        to_lt, // get từ lt tới to_lt, nếu số lượng TX từ lt -> to_lt lớn hơn limit, thì vẫn ưu tiên lấy đủ limit thôi
        inclusive: false, // nếu true thì lấy luôn TX có lt & hash đã truyền, nếu false thì lấy TX kế tiếp từ TX hash đó.
        archival: true, // méo hiểu làm gì mà thấy hopium để true thì mình cũng để
        // lt: "", // lt và hash phải truyền cả 2 hoặc không truyền cả 2, bắt đầu get transaction từ
        // hash: "GfszNUsXOZkL/DZM9Zq1iwgTW+CLusxXo7FKMINUb5o=", // kết quả sẽ trả ra {limit} transaction xảy ra trước tx hash này (thời gian cũ hơn, ko phải xảy ra sau tx hash này đâu nhé)
    };

    let fullTransactions = [];

    let isFull = false;
    let lt = null;
    let hash = null;
    while (!isFull) {
        if (lt && hash) {
            opts.lt = lt;
            opts.hash = hash;
        }

        await Utils.sleep(200);
        const transactions = await client.getTransactions(
            Address.parse(userAddress),
            opts
        );

        fullTransactions = [...fullTransactions, ...transactions];
        if (transactions.length === LIMIT_PER_BATCH) {
            lt = transactions[LIMIT_PER_BATCH - 1].lt.toString();
            hash = transactions[LIMIT_PER_BATCH - 1].hash().toString("base64");
        } else {
            isFull = true;
        }
    }

    return fullTransactions;
}

/**
 * @description Hàm này để parse transaction từ TON network
 * @param {*} toAddress
 * @param {*} tx
 * @returns
 * - false: nếu transaction không phải là TON/Jetton transfer
 * - { sender: string, value: string, assetId: number, memo?: string | Buffer }: nếu transaction là TON/Jetton transfer
 */
async function parseTransaction(
    toAddress,
    tx,
    smartContractConfig,
    type = "received"
) {
    const client = await getTonClient();
    const inMsg = tx.inMessage;

    let assetId = WalletCurrencies.TON;
    console.log("Message Type:", inMsg?.info.type);

    if (inMsg?.info.type == "internal") {
        if (type !== "received") return false;
        // we only process internal messages here because they are used the most
        // for external messages some of the fields are empty, but the main structure is similar
        const sender = inMsg?.info.src;
        const value = fromNano(inMsg?.info.value.coins);

        // if (fromNano(value) === "2") return false;

        const originalBody = inMsg?.body.beginParse();
        let body = originalBody.clone();

        if (body.remainingBits < 32) {
            // if body doesn't have opcode: Gửi nhận token TON mà không có comment (memo)
            return { sender, value, assetId };
        } else {
            const op = body.loadUint(32);

            console.log(
                "op: ",
                op,
                op === OP_CODE.TRANSFER_JETTON_NOTIFICATION
            );

            if (op == 0) {
                // if opcode is 0: Gửi nhận token TON có comment (memo)
                const memo = body.loadStringTail();
                return { sender, value, assetId, memo };
            } else if (op == OP_CODE.TRANSFER_JETTON_NOTIFICATION) {
                // if opcode is 0x7362d09c: Gửi nhận fungible token (token khác token TON)

                body.skip(64); // skip query_id
                const jettonAmount = body.loadCoins();
                const jettonSender = body.loadAddressAny();
                const originalForwardPayload = body.loadBit()
                    ? body.loadRef().beginParse()
                    : body;
                let forwardPayload = originalForwardPayload.clone();

                // IMPORTANT: we have to verify the source of this message because it can be faked
                // Khúc này nếu JETTON ko theo chuẩn smart contract thì hay throw error vì bản thân contract ko có method get_wallet_data
                const runStack = (
                    await client.runMethod(sender, "get_wallet_data")
                ).stack;
                runStack.skip(2);
                const jettonMaster = runStack.readAddress();

                const myAddress = Address.parse(toAddress); // address that you want to fetch transactions from
                console.log("myAddress", myAddress.toString());

                const jettonWallet = (
                    await client.runMethod(jettonMaster, "get_wallet_address", [
                        {
                            type: "slice",
                            cell: beginCell().storeAddress(myAddress).endCell(),
                        },
                    ])
                ).stack.readAddress();
                if (!jettonWallet.equals(sender)) {
                    // if sender is not our real JettonWallet: this message was faked
                    Logger.error(`${TAG} FAKE Jetton transfer`);
                    return false;
                }

                /**
                 * Nếu là jetton transfer thì:
                 * - jettonSender: là address của người gửi token (địa chỉ ví TON)
                 * - sender: Jetton address của Sender (1 TON wallet + 1 Jetton contract = 1 Jetton address)
                 * - jettonMaster: là address của Jetton Master (địa chỉ của contract quản lý token)
                 */
                // Kiểm tra xem đây là fungible token nào? nếu mà token vớ vẩn thì bỏ qua transaction này
                const jettonConfig = await getJettonConfig(
                    smartContractConfig,
                    null,
                    jettonMaster
                );

                assetId = jettonConfig?.assetId;
                console.log("____assetId", assetId);

                if (!assetId) return false;

                if (forwardPayload.remainingBits < 32) {
                    // if forward payload doesn't have opcode: it's a simple Jetton transfer
                    return {
                        sender: jettonSender,
                        value: fromCustomNano(
                            jettonAmount,
                            jettonConfig.decimals
                        ),
                        assetId,
                    };
                } else {
                    const forwardOp = forwardPayload.loadUint(32);
                    if (forwardOp == 0) {
                        // if forward payload opcode is 0: it's a simple Jetton transfer with comment
                        const memo = forwardPayload.loadStringTail();
                        return {
                            sender: jettonSender,
                            value: fromCustomNano(
                                jettonAmount,
                                jettonConfig.decimals
                            ),
                            assetId,
                            memo,
                        };
                    } else {
                        // if forward payload opcode is something else: it's some message with arbitrary structure
                        // you may parse it manually if you know other opcodes or just print it as hex

                        // TODO: parse other opcodes of this memo
                        return {
                            sender: jettonSender,
                            value: jettonAmount,
                            assetId,
                            memo: originalForwardPayload,
                        };
                    }
                }
            } else if (op == 0x05138d91) {
                // if opcode is 0x05138d91: it's a NFT transfer notification
            } else if (op == OP_CODE.EXCESSES) {
                // Hoàn trả phí khi sent Jetton
            } else {
                // Nếu opcode lạ, thì tùy vào smart contract của token đó mà parse, thường thì JETTON sẽ có standard riêng, lạ lắm mới đi custom opcode
            }
        }
    } else {
        if (type !== "sent") return false;

        console.log("Đây là transactino send (gửi đi)");
        const txHashHex = tx.hash().toString("hex");
        const txHashBase64 = tx.hash().toString("base64");
        const lt = tx.lt.toString();

        const msgCell = beginCell().store(storeMessage(tx.inMessage)).endCell();
        const inMsgHash = msgCell.hash().toString("hex");

        const dateFormat = require("dateformat");
        return {
            type,
            txHash: txHashHex,
            inMsgHash,
            lt,
            time: tx.now,
            timeStr: dateFormat(new Date(tx.now * 1000), "hh:MM:ss dd/mm/yyyy"),
            isSuccess: isTransactionSuccessful(tx),
        };
    }
}

// Hàm gửi token từ ví Tổng của Nami onchain tới 1 ví khác mạng TON net
async function transferExternalFromNami(
    toAddress = "", // Địa chỉ ví nhận
    value = 0, // Số lượng TON/Jetton muốn chuyển
    memo = "", // comment,
    smartContractConfig,
    fromMnemonic = NAMI_TON_WITHDRAW_MNEMONIC,
    fromAddress = NAMI_TON_WITHDRAW_ADDRESS
) {
    memo = memo?.trim() || null;
    toAddress = Address.parse(parseAddress(toAddress));

    const assetId = smartContractConfig.assetId;

    Logger.info(`✅ ${TAG} transferExternalFromNami:`, {
        assetId,
        fromAddress,
        toAddress,
        value,
        memo,
        smartContractConfig,
    });

    try {
        const available = await getBalance(assetId, fromAddress);
        Logger.info(`${TAG} transferExternalFromNami available`, available);

       
        if (available < value) {
            return {
                isSuccess: false,
                msg: "NOT_ENOUGH_ROOT_BALANCE",
                available
            }
        }

        // send {amount} TON to {toAddress}

        let txHash;
        if (assetId === WalletCurrencies.TON) {
            // Gửi native token TON
            txHash = await internalMessage(
                {
                    to: toAddress,
                    value: toNano(value),
                    body: memo,
                },
                fromMnemonic
            );
        } else {
            // Gủi fungible token (Jetton) như USDT, VNST, NOT, ...
            // Ref: https://docs.ton.org/v3/guidelines/dapps/cookbook#how-to-construct-a-message-for-a-jetton-transfer-with-a-comment
            const {
                decimals,
                address: jettonMasterAddress,
            } = smartContractConfig;

            if (!jettonMasterAddress) throw "Asset ID not supported";

            // Với các Jetton có decimals = 9 thì chỉ cần sử dụng hàm toNano trong messageBody storeCoins(toNano(value)) thôi
            // Tuy nhiên các Jetton ko theo chuẩn thì decimals != 9 => phải tự đi nhân lại số lượng người dùng nhìn thấy
            const indivisibleAmount = toCustomNano(value, decimals);

            let jettonWalletAddress = await cacheJettonWalletAddress(
                fromAddress,
                assetId
            );

            jettonWalletAddress = Address.parse(jettonWalletAddress);
            Logger.info(`${TAG} transfer Jetton`, {
                assetId,
                fromAddress,
                toAddress,
                jettonWalletAddress,
            });

            const hasMemo = !!memo;
            const forwardPayload = hasMemo
                ? beginCell()
                      .storeUint(0, 32) // 0 opcode means we have a comment
                      .storeStringTail(memo)
                      .endCell()
                : null; // Không tạo payload nếu không có memo

            const messageBody = beginCell()
                .storeUint(OP_CODE.TRANSFER_JETTON, 32) // opcode for jetton transfer
                .storeUint(0, 64) // query id
                .storeCoins(indivisibleAmount) // jetton amount, amount * 10^(decimals)
                .storeAddress(toAddress)
                .storeAddress(Address.parse(fromAddress)) // response destination
                .storeBit(0) // no custom payload
                .storeCoins(toNano(DEFAULT_FEE_NOTIFY_JETTON)) //// phí forward, forward amount - if >0, will send notification message
                .storeBit(hasMemo ? 1 : 0); // Nếu có memo thì lưu payload, nếu không thì bỏ qua

            if (hasMemo) messageBody.storeRef(forwardPayload);

            txHash = await internalMessage(
                {
                    to: jettonWalletAddress,
                    value: toNano(DEFAULT_FEE_WITHDRAW),
                    body: messageBody.endCell(),
                },
                fromMnemonic
            );
        }
        return { isSuccess: true, txHash };
    } catch (error) {
        Logger.error(`${TAG} Error sending transaction from Nami`, error)
        return {
            isSuccess: false,
            msg: "UNKNOWN_ERROR",
            error
        }
    }
}

function toCustomNano(value, decimals) {
    if (typeof value !== "number") {
        throw new TypeError("Value must be a number");
    }
    if (typeof decimals !== "number") {
        throw new TypeError("Decimals must be a number");
    }

    const rawValue = value * Math.pow(10, decimals);
    return BigInt(Math.floor(rawValue));
}

function fromCustomNano(value, decimals) {
    // Ensure value is BigInt and decimals is a number
    if (typeof value !== "bigint") {
        throw new Error("Value must be a BigInt");
    }
    if (typeof decimals !== "number") {
        throw new Error("Decimals must be a number");
    }

    // Perform division using BigInt, then convert to string for precision
    const divisor = BigInt(Math.pow(10, decimals));
    const realValue = Number(value) / Number(divisor);

    return realValue; // Returns the balance as a number
}

async function internalMessage(
    { to, value, body },
    mnemonic = NAMI_TON_WITHDRAW_MNEMONIC
) {
    const key = await mnemonicToWalletKey(mnemonic.split(" "));

    const { publicKey, secretKey } = key;
    const wallet = WalletContractV5R1.create({
        publicKey,
        workchain: 0,
    });

    const client = await getTonClient();

    // make sure wallet is deployed
    if (!(await client.isContractDeployed(wallet.address))) {
        Logger.error(`${TAG} Wallet is not deployed`, {
            address: wallet.address,
        });
        return false;
    }
    const walletContract = client.open(wallet);
    let seqno = await walletContract.getSeqno();
    console.log("___seqno", seqno);

    const keySeqno = buildKeySeqno(wallet.address);
    const prevSeqno = (await Redis.get(keySeqno)) || 0;

    // Khi có nhiều transaction cùng 1 lúc, seqno sẽ bị trùng, nên phải đợi cho seqno mới hơn seqno trước đó
    if (seqno <= prevSeqno) {
        // await function to wait for next seqno sao cho newSeqno > prevSeqno
        seqno = await waitForNextSeqno(walletContract, prevSeqno);
        Logger.info(`New seqno obtained: ${seqno}`);
    }

    const transferMessage = walletContract.createTransfer({
        secretKey,
        seqno,
        messages: [
            internal({
                to,
                value,
                body, // optional comment
                bounce: false,
            }),
        ],
        sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY, // SendMode này tham khảo từ /hopium-payment-service/src/ton/ton.service.ts
    });

    // // Khúc này là đã gửi Lệnh lên Blockchain, đang đợi các node confirm, lệnh vẫn pending
    const transactionHash = await send(transferMessage, wallet.address);

    // Set lại prevSeqno
    await Redis.set(keySeqno, seqno);
    return transactionHash;
}

// Hàm này lấy TxHash sau khi transfer, tham khảo từ https://github.com/ton-org/ton/issues/30#issuecomment-2121156213
// Tuy nhiên với Jetton transfer, txHash lại là của "B", ko phải của "A" (A là ví TON sender, B là ví Jetton của Sender)
async function send(message, address) {
    const client = await getTonClient();
    let neededInit = null;
    // if (init && !await client.isContractDeployed(address)) {
    //     neededInit = init;
    // }
    const ext = (0, external)({
        to: address,
        init: neededInit,
        body: message,
    });
    let boc = (0, beginCell)()
        .store((0, storeMessage)(ext))
        .endCell();
    await client.sendFile(boc.toBoc());
    const tx = boc.hash().toString("hex"); // hash này là hash của inMessage (lõi của Transaction này, nếu transaction confirm thì cả 1 Transaction sẽ có 1 hash chính thức khác)
    Logger.info(`${TAG} send transfer success`, { address, txHash: tx });

    return tx;
}

async function waitForNextSeqno(walletContract, currentSeqno) {
    return new Promise((resolve, reject) => {
        const maxRetries = 100; // Giới hạn số lần kiểm tra
        const intervalMs = 2000; // Thời gian chờ giữa mỗi lần kiểm tra
        let attempts = 0;

        const interval = setInterval(async () => {
            try {
                const newSeqno = await walletContract.getSeqno();
                Logger.debug(
                    `${TAG} Checking seqno: ${newSeqno}, Attempts: ${attempts}`
                );

                if (newSeqno > currentSeqno) {
                    clearInterval(interval);
                    resolve(newSeqno); // Trả về seqno mới
                } else if (++attempts >= maxRetries) {
                    clearInterval(interval);
                    Logger.error(
                        `${TAG} Timeout waiting for next seqno, currentSeqno = ${newSeqno}, newSeqno = ${newSeqno}`
                    );
                    reject(new Error("Timeout waiting for next seqno."));
                }
            } catch (error) {
                clearInterval(interval);
                reject(error);
            }
        }, intervalMs);
    });
}

function parseAddress(address = "") {
    const addr = Address.parse(address.toString());

    const bounceAddr = addr.toString({
        testOnly: IS_TEST,
        bounceable: false,
    });

    return bounceAddr;

    // const unBounceAddr = addr.toString({ bounceable: false });
    // return unBounceAddr;

    // const hexAddr = addr.toRawString();
    // return hexAddr;
}

/**
 * @description Hàm này để lấy địa chỉ ví Jetton của 1 user, mỗi user sẽ có 1 địa chỉ ví Jetton riêng để nhận Jetton, khác với địa chỉ ví TON nhé. 1 ví TON sẽ có nhiều ví Jetton, ví dụ 1 ví TON A sẽ có nhiều tài sản như USDT, VNST, NOT, ... thì mỗi tài sản này là 1 địa chỉ ví Jetton riêng của ví A.
 * @param {*} client TonClient
 * @param {*} ownerAddress String
 * @param {*} jettonMasterAddress String
 * @returns String
 */
// Hạn chế gọi hàm này vì rất lâu, nên gọi hàm cacheJettonWalletAddress thôi
// Lưu ý TON là native token, ko phải Jetton (fungible token) nên ko có gọi hàm này nhé
async function getJettonWalletAddress(
    jettonMasterAddress = "",
    tonAddress = NAMI_TON_DEPOSIT_ADDRESS
) {
    const client = await getTonClient();
    const result = await client.runMethod(
        Address.parse(parseAddress(jettonMasterAddress)),
        "get_wallet_address",
        [
            {
                type: "slice",
                cell: beginCell()
                    .storeAddress(Address.parse(parseAddress(tonAddress)))
                    .endCell(),
            },
        ]
    );
    return result.stack.readAddress().toString();
}

async function listTonNetwork({
    assetId,
    assetCode,
    jettonAddress, // Địa chỉ ví Jetton Master của token đó trên TON chain, riêng token TON thì ko cần vì nó là native token của TON network
    jettonDecimals = 9, // lấy từ token smartcontract metadata trên TON viewer, đa số là 9 nhưng check lại cho chắc
    withdrawIntegerMultiple = "0.00000001",
    depositEnable = true,
    withdrawEnable = true,
    withdrawFee = DEFAULT_FEE_WITHDRAW,
    withdrawMin = "0.05",
    withdrawMax = "10000",
    depositDesc = "",
    withdrawDesc = "The network you chose supports MEMO. If the deposit platform requires you to fill in MEMO, please fill it in correctly. Missing or wrong filling of MEMO may cause loss of your assets.",
    specialTips = "The network you chose supports MEMO. If the deposit platform requires you to fill in MEMO, please fill it in correctly. Missing or wrong filling of MEMO may cause loss of your assets.",
}) {
    if (!assetId || !assetCode) return "BODY_MISSING";
    let dwNetworkTon = await DwNetwork.findOne({
        network: DwNetwork.Network.TON,
        provider: PlatformProvider.NAMI,
        coin: assetCode,
    });

    if (!dwNetworkTon) {
        dwNetworkTon = await DwNetwork.create({
            provider: PlatformProvider.NAMI,
            network: DwNetwork.Network.TON,
            coin: assetCode,
            withdrawIntegerMultiple,
            isDefault: false,
            depositEnable,
            withdrawEnable,
            depositDesc,
            withdrawDesc,
            specialTips,
            name: "Toncoin",
            resetAddressStatus: false,
            addressRegex: "^([A-Za-z0-9+/_-]{48}|(-1|0):[0-9A-Fa-f]{64})$", // Bounceable || Non-Bounceable || Hex (Raw)
            memoRegex: "^[0-9a-zA-Z]{0,20}$",
            withdrawFee,
            withdrawMin,
            withdrawMax,
            minConfirm: 1,
            unLockConfirm: 1,
        });
    }
    // dwconfigs
    const ModelDwConfig = use("App/Models/DwConfig");
    let dwConfig = await ModelDwConfig.findOne({ assetId });

    if (!dwConfig) {
        dwConfig = await ModelDwConfig.create({
            assetId,
            ipoable: "0",
            ipoing: "0",
            isLegalMoney: false,
            networkList: [dwNetworkTon._id],
            storage: "0",
            trading: true,
            transferable: true,
        });
    } else if (dwConfig.networkList.indexOf(dwNetworkTon._id) === -1) {
        await ModelDwConfig.updateOne(
            { assetId },
            { $addToSet: { networkList: dwNetworkTon._id } }
        );
    }

    let smartContractConfig = await SmcConfig.findOne({
        assetId,
        networkId: dwNetworkTon._id,
    });

    if (!smartContractConfig) {
        smartContractConfig = await SmcConfig.create({
            assetId,
            address:
                assetId === WalletCurrencies.TON
                    ? NAMI_TON_DEPOSIT_ADDRESS
                    : jettonAddress,
            decimals: jettonDecimals,
            networkId: dwNetworkTon._id,
        });
    }

    if (assetId !== WalletCurrencies.TON) {
        if (smartContractConfig.address !== jettonAddress)
            smartContractConfig.address = jettonAddress;
        if (smartContractConfig.decimals !== jettonDecimals)
            smartContractConfig.decimals = jettonDecimals;
    }

    if (smartContractConfig.networkId !== dwNetworkTon._id)
        smartContractConfig.networkId = dwNetworkTon._id;

    await smartContractConfig.save();

    return true;
}

// ngoại trừ Token TON (là native token của TON network), thì tất cả token còn lại đêu có 1 contract riêng, và mỗi contract đều có 1 master contract (được gọi là Jetton Master) để quản lý.
// Vì vậy với mỗi asset (được gọi là fungible token trong TON network), mình phải có 1 bảng config giữa token đó và jetton master của nó.
// Trước khi thêm thì vào https://testnet.tonviewer.com/ check lại cho chắc
// Lưu ý trong Testnet: sender khi track transaction luôn ở dạng Bounceble mainet, khi copy paste vào https://testnet.tonviewer.com/ sẽ ra 1 master address khác, kệ cái này đi mình chỉ check master address mainet của nó
const JETTON_TO_ASSET_TESTNET = [
    {
        assetId: 39, // id VNST trong bảng asset_config
        assetCode: "VNST",
        decimals: 9, // Lấy từ metadata của constract jetton này, vào https://testnet.tonviewer.com/${jettonAddress} sẽ thấy metadata, bấm vào metadata sẽ thấy có thông tin decimals
        jettonAddress: "kQAnLvifiFzfhrYtOPVbqJMFiEa4LIr6wPFmYwDqk58Z-9qQ", // jetton master address
    },
    {
        assetId: 22,
        assetCode: "USDT",
        decimals: 6,
        jettonAddress: "kQDOFd6Eq8Y7f2xof8Y_FFB5mY2C_4ZvyO7gBjvz9MosefL-",
    },
];

// Config địa chỉ ví của các TOKEN mainet trên TON network, kiểm tra tại https://tonviewer.com/
// Address lấy từ https://tonviewer.com/EQAJ8uWd7EBqsmpSWaRdf_I-8R8-XHwh3gsNKhy-UrdrPcUo?section=tokens
// Riêng VNST lấy từ https://vnst.io/en?network=TON
const JETTON_TO_ASSET_MAINNET = [
    {
        assetId: 22, // USDT
        assetCode: "USDT",
        decimals: 6, // https://tonviewer.com/EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs
        jettonAddress: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
    },
    {
        assetId: 39, // VNST
        assetCode: "VNST",
        decimals: 6, // https://tonviewer.com/EQDwNX_Fs4t_PuUjy3rZZXccoHC4ZyFqAjnz0vyyhfijkMk0
        jettonAddress: "EQDwNX_Fs4t_PuUjy3rZZXccoHC4ZyFqAjnz0vyyhfijkMk0", // https://tonviewer.com/EQDwNX_Fs4t_PuUjy3rZZXccoHC4ZyFqAjnz0vyyhfijkMk0
    },
    {
        assetId: 555, // NOT
        assetCode: "NOT",
        decimals: 9, // https://tonviewer.com/EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT
        jettonAddress: "EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT",
    },
    {
        assetId: 567, // DOGS
        assetCode: "DOGS",
        decimals: 9, // https://tonviewer.com/EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS
        jettonAddress: "EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS",
    },
    {
        assetId: 574, // CATI (Catizen)
        assetCode: "CATI",
        decimals: 9, // https://tonviewer.com/EQD-cvR0Nz6XAyRBvbhz-abTrRC6sI5tvHvvpeQraV9UAAD7
        jettonAddress: "EQD-cvR0Nz6XAyRBvbhz-abTrRC6sI5tvHvvpeQraV9UAAD7",
    },
    {
        assetId: 576, // HMSTR
        assetCode: "HMSTR",
        decimals: 9, // https://tonviewer.com/EQAJ8uWd7EBqsmpSWaRdf_I-8R8-XHwh3gsNKhy-UrdrPcUo
        jettonAddress: "EQAJ8uWd7EBqsmpSWaRdf_I-8R8-XHwh3gsNKhy-UrdrPcUo",
    },
];

// https://github.com/ton-blockchain/token-contract/blob/main/ft/op-codes.fc
const OP_CODE = {
    TRANSFER_JETTON: 0xf8a7ea5, // 260734629: Chuyển Jetton từ ví này sang ví khác
    TRANSFER_JETTON_NOTIFICATION: 0x7362d09c, // 1935855772: Thông báo tới người nhận rằng họ đã nhận được Jetton
    TRANSFER_JETTON_INTERNAL: 0x178d4519, // 395134233
    TRANSFER_NFT: 0x05138d91, // 85167505: Chuyển NFT từ ví này sang ví khác
    EXCESSES: 0xd53276db, // 3576854235
};

function buildExplorerUrl(txHash) {
    if (IS_TEST) return `https://testnet.tonviewer.com/transaction/${txHash}`;
    return `https://tonviewer.com/transaction/${txHash}`;
}

async function transferAllToken(
    fromAddress = NAMI_TON_DEPOSIT_ADDRESS,
    fromMnemonic = NAMI_TON_DEPOSIT_MNEMONIC,
    toAddress = NAMI_TON_WITHDRAW_ADDRESS
) {
    console.log("Start transferAllToken");

    const smartContractConfig = await getConfigJetton(fromAddress);

    for (const scm of smartContractConfig) {
        const { assetId, decimals, walletAddress: jettonWalletAddress } = scm;
        // B1: Lấy số dư ví Nạp
        const available = await getBalance(
            assetId,
            fromAddress,
            jettonWalletAddress
        );

        if (available <= 1 / decimals) continue;
        const value = toCustomNano(available, decimals);

        Logger.info(`${TAG} transferAllToken`, {
            assetId,
            available,
            jettonWalletAddress,
            valueFormated: value,
        });

        // B2: chuẩn bị data để transfer token từ ví Nạp sang ví Rút
        let msgRelaxed;

        if (assetId === WalletCurrencies.TON) {
            const valueTon = value - toNano(3);
            if (valueTon <= 0.05) continue;
            msgRelaxed = {
                to: toAddress,
                value: valueTon, // trừ 3 TON còn trong Ví Nap để làm phí
            };
        } else {
            // Nếu là asset là Jetton (ko phải native token TON)
            const messageBody = beginCell()
                .storeUint(OP_CODE.TRANSFER_JETTON, 32) // opcode for jetton transfer
                .storeUint(0, 64) // query id
                .storeCoins(value) // jetton amount, amount * 10^(decimals)
                .storeAddress(Address.parse(toAddress))
                .storeAddress(Address.parse(fromAddress)) // response destination
                .storeBit(0) // no custom payload
                .storeCoins(toNano(DEFAULT_FEE_NOTIFY_JETTON)) //// phí forward, forward amount - if >0, will send notification message
                .storeBit(0) // Nếu có memo thì lưu payload, nếu không thì bỏ qua
                .endCell();

            msgRelaxed = {
                to: jettonWalletAddress,
                value: toNano(DEFAULT_FEE_WITHDRAW),
                body: messageBody,
            };
        }
        // transfer token từ ví Nạp sang ví Rút
        await internalMessage(msgRelaxed, fromMnemonic);
    }
    return smartContractConfig;
}

module.exports = {
    test,
    trackTransactions,
    transferExternalFromNami,
    createUserTonWallet,
    scanDeposit,
    scanWithdraw,
    buildExplorerUrl,
    listTonNetwork,
    transferAllToken,
};
