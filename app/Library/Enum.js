const ms = require('ms')

exports.User = {
    Role: {
        ROOT_ACCOUNT: 99, // Luu tru cac khoan phi rut/nap

        ADMIN: 1,
        VERIFIER: 2,
        MASTER_IB: 3,
        IB: 4,
        USER: 5,
        LEVEL_1: 6,
        CHAT_SUPPORTER: 10
    },
    RootUser: {
        NAMI_SPOT_FEE: 'nami_spot_fee',
        NAMI_SPOT_COMMISSION: 'nami_spot_commission',
        NAMI_SPOT: 'nami_spot',
        NAMI_SPOT_BINANCE: 'nami_spot_binance',
        NAMI_STAKE: 'nami_stake',
        NAMI_SWAP_FEE: 'nami_swap_fee',
        USDT_VNDC_GATEWAY: 'usdt_vndc_gateway',
        NAMI_SWAP: 'nami_swap',
        NAMI_FEE: 'nami_fee',

        NAMI_GATEWAY_BINANCE: 'nami_gateway_binance',

        NAMI_SWAP_COMMISSION: 'nami_swap_commission',
        NAMI_GATEWAY_VNDC: 'nami_gateway_vndc',
        NAMI_GATEWAY_FEE: 'nami_gateway_fee',
        NAMI_GATEWAY: 'nami_gateway'

    },

    Language: {
        VI: 'vi',
        EN: 'en'
    },
    IbType: {
        NORMAL: 0, // Lv mặc định
        IB_LV1: 1,
        TB_LV2: 2,
        NAMI_SALE: 3, // Nami Sale
        NAMI_SALE_MANAGER_LV_1: 4,
        NAMI_SALE_MANAGER_LV_2: 5, // Head Buisiness

        NAMI_BROKER_USER: 6, // User under nami sale

        OLA_BROKER_MASTER: 7, // 584982
        OLA_BROKER_USER: 8,

        MB_BROKER_MASTER: 9, // 583415
        MB_BROKER_USER: 10
    },
    ReferSource: {
        UNKNOWN: 0,
        LAUNCHPAD: 2
    },
    Gender: {
        UNKNOWN: 0,
        MALE: 1,
        FEMALE: 2
    },
    KycStatus: {
        NO_KYC: 0,
        PENDING_APPROVAL: 1, // chờ kyc bản cũ
        APPROVED: 2, // kyc cơ bản
        ADVANCE_KYC: 3, // kyc nâng cao
        APPROVED_PENDING_APPROVAL_ADVANCE: 4, // đã kyc cập nhật thêm số cmnd + ảnh mặt
        PENDING_APPROVAL_ADVANCE: 5// user kyc từ đầu cập nhật hết
    }
}
const Otp = {
    Type: {
        AUTHEN_SOCKETIO: 1,
        VERIFY_EMAIL: 2,
        RESET_PASSWORD: 3,
        VERIFY_DEVICE_EMAIL: 4
    },
    Status: {
        USED: 1,
        UNUSED: 0
    }
}
Otp.TimeOut = {
    [Otp.Type.AUTHEN_SOCKETIO]: ms('2 day'),
    [Otp.Type.VERIFY_EMAIL]: ms('1 day'),
    [Otp.Type.RESET_PASSWORD]: ms('15 minutes'),
    [Otp.Type.VERIFY_DEVICE_EMAIL]: ms('15 minutes')
}
exports.Otp = Otp

const OAuthUser = {
    Type: {
        GOOGLE: 1,
        FACEBOOK: 2,
        NAMI_ASSISTANT: 3,
        FINANCE_X: 4,
        NAMI: 5,
        VNDC: 6,
        APPLE: 7,
        ONUS: 8,
    },
    Service: ['google', 'facebook', 'nami', 'vndc', 'apple']
}

OAuthUser.UserTableColumnName = {
    [OAuthUser.Type.GOOGLE]: 'googleUserId',
    [OAuthUser.Type.FACEBOOK]: 'fbUserId',
    [OAuthUser.Type.FINANCE_X]: 'financex_user_id',
    [OAuthUser.Type.NAMI]: '',
    [OAuthUser.Type.VNDC]: 'vndcUserId',
    [OAuthUser.Type.APPLE]: 'appleUserId'
}

exports.OAuthUser = OAuthUser

exports.UserDevice = {
    Status: {
        NORMAL: 0, //
        REVOKED: 1, // Force logged out
        BANNED: 2, // Banned
        LOGGED_OUT: 3, // User logged out normally
        WAITING_FOR_AUTHORIZATION: 4 // Wait to be authorized
    },
    // eslint-disable-next-line no-bitwise
    Product: { NamiExchange: 1 << 0 }
}

exports.PlatformProvider = {
    NAMI: 'NAMI',
    VNDC: 'VNDC',
    BINANCE: 'BINANCE',
    BITMEX: 'BITMEX',
    HUOBI: 'HUOBI',
    COINBASE: 'COINBASE'
}

exports.WalletNetwork = {
    Ethereum: "ETH",
    KardiaChain: "KAI",
    BSC: "BSC",
    FTM: "FTM",
    ONUS: "ONUS",
    TON: "TON",
}

exports.WithdrawResult = {
    InvalidAsset: 'invalid_asset',
    WithdrawDisabled: 'withdraw_disabled',
    UnsupportedAddress: 'unsupported_address',
    InvalidAddress: 'invalid_address',
    AmountTooSmall: 'amount_too_small',
    AmountExceeded: 'amount_exceeded',
    NotEnoughBalance: 'not_enough_balance',
    HaveOpenPosition: 'have_open_position',
    DepositNotEnoughToWithdraw: 'deposit_not_enough_to_withdraw',
    MissingOtp: 'missing_otp',
    InvalidOtp: 'invalid_otp',
    InvalidOtpKey: 'invalid_smart_otp_key',
    InvalidSotp: 'invalid_smart_otp',
    NotHaveBankAccount: 'not_have_bank_account',
    Unknown: 'unknown_error',
}

exports.WalletCryptography = {
    Ethereum: 'ethereum',
    Bitcoin: 'bitcoin',
    Ton: 'ton'
}

exports.DwTransactionMethod = {
    OnChain: 'on-chain',
    BankTransfer: 'bank-transfer',
    OffChain: 'off-chain'
}

exports.Wallet = {
    ErrorCode: {
        1: 'NOT_FOUND_WALLET_KEY',
        2: 'NEGATIVE_WALLET_VALUE',
        3: 'MONEY_IS_NOT_ENOUGH'
    },

    MoneyType: {
        MAIN_BALANCE: 'MAIN',
        LOCK_BALANCE: 'LOCK'
    },
    WalletType: {
        SPOT: 0,
        MARGIN: 1,
        FUTURES: 2,
        P2P: 3,
        POOL: 4,
        EARN: 5
    },

    Result: {
        INVALID_USER: 'INVALID_USER',
        INVALID_USER_ROLE: 'INVALID_USER_ROLE',
        INVALID_INPUT: 'INVALID_INPUT',
        NOT_ENOUGH_NAC: 'NOT_ENOUGH_NAC',
        NOT_ENOUGH_ETH: 'NOT_ENOUGH_ETH',
        NOT_ENOUGH_CURRENCY: 'NOT_ENOUGH_CURRENCY',
        UNKNOWN_ERROR: 'UNKNOWN_ERROR',
        INVALID_TIME_BACK_ETH: 'INVALID_TIME_BACK_ETH'
    },
    KeyChangeBalanceRedis: 'redis:wallet:change:balance'
}

exports.ExchangeConfig = {
    FilterType: {
        PRICE_FILTER: 'PRICE_FILTER',
        PERCENT_PRICE: 'PERCENT_PRICE',
        LOT_SIZE: 'LOT_SIZE',
        MIN_NOTIONAL: 'MIN_NOTIONAL',
        MAX_NUM_ORDERS: 'MAX_NUM_ORDERS'
    }
}

exports.ExchangeOrder = {
    StopLimitType: {
        GREATER_OR_EQUAL: 1,
        LESS_OR_EQUAL: 2
    },
    Side: {
        BUY: 'BUY',
        SELL: 'SELL'
    },
    Status: {
        NEW: 'NEW',
        PARTIALLY_FILLED: 'PARTIALLY_FILLED',
        FILLED: 'FILLED',
        CANCELED: 'CANCELED',
        FAILED: 'FAILED'
    },
    Type: {
        MARKET: 'MARKET',
        LIMIT: 'LIMIT',
        STOP_LIMIT: 'STOP_LIMIT'
    },
    NotificationType: {
        PLACE_ORDER: 'PLACE_ORDER',
        CLOSE_ORDER: 'CLOSE_ORDER'
    },
    LiquidityStatus: {
        HOLD: 'HOLD',
        TRANSFERRED: 'TRANSFERRED',
        TRANSFERRED_ERROR: 'TRANSFERRED_ERROR'
    },
    Result: {
        INVALID_USER: 'INVALID_USER',
        INVALID_INPUT: 'INVALID_INPUT',
        INVALID_LIMIT_PRICE: 'INVALID_LIMIT_PRICE',

        NOT_FOUND_ORDER: 'NOT_FOUND_ORDER',
        NOT_ENOUGH_BASE_ASSET: 'NOT_ENOUGH_BASE_ASSET',
        NOT_ENOUGH_QUOTE_ASSET: 'NOT_ENOUGH_QUOTE_ASSET',
        STOP_LIMIT_INVALID_STOP_PRICE: 'STOP_LIMIT_INVALID_STOP_PRICE',
        STOP_LIMIT_UNKNOWN_LAST_PRICE: 'STOP_LIMIT_UNKNOWN_LAST_PRICE',
        STOP_LIMIT_INVALID_MIN_TOTAL: 'STOP_LIMIT_INVALID_MIN_TOTAL',
        BROKER_ERROR: 'BROKER_ERROR',
        ORDER_TYPE_NOT_SUPPORT: 'ORDER_TYPE_NOT_SUPPORT',
        UNKNOWN_ERROR: 'UNKNOWN_ERROR',
        INVALID_SYMBOL: 'INVALID_SYMBOL',
        INVALID_SIDE: 'INVALID_SIDE',
        INVALID_TYPE: 'INVALID_TYPE',
        INVALID_QUANTITY: 'INVALID_QUANTITY',
        TOO_MUCH_ORDERS: 'TOO_MUCH_ORDERS',
        INSTRUMENTS_DO_NOT_MATCH: 'INSTRUMENTS_DO_NOT_MATCH',
        INSTRUMENT_NOT_LISTED_FOR_TRADING_YET: 'INSTRUMENT_NOT_LISTED_FOR_TRADING_YET',
        INVALID_PRICE: 'INVALID_PRICE',
        INVALID_TICK_SIZE: 'INVALID_TICK_SIZE',
        INVALID_STEP_SIZE: 'INVALID_STEP_SIZE',
        INVALID_MIN_NOTIONAL: 'INVALID_MIN_NOTIONAL'
    }
}

exports.ExchangeOrderHistory = {

    Action: {
        MATCH_ORDER: 1,
        CLOSE_ORDER: 2,
        MATCH_MARKET_ORDER: 3,
        UPDATE_ORDER: 4
    },
    Status: { MATCH_ORDER_SUCCESSFULLY: 1 }

}

exports.Platform = {
    WEB_APP: 'WEB_APP',
    IOS_APP: 'IOS_APP',
    ANDROID_APP: 'ANDROID_APP',
    MOBILE_APP: 'MOBILE_APP',
    API: 'API'
}

exports.LiquidityBroker = {
    NAMI_SPOT: 'NAMI_SPOT',
    NAMI_FUTURES: 'NAMI_FUTURES',
    BINANCE_SPOT: 'BINANCE_SPOT',
    BINANCE_FUTURES: 'BINANCE_FUTURES'
}

exports.UserApiKeyEnum = {
    OptionCheck: {
        READ: 0b1,
        EXCHANGE: 0b10,
        FUTURES: 0b100,
        WITHDRAW: 0b1000,
        INTERNAL_TRANSFER: 0b10000
    },
    Permission: {
        READ: 'read',
        EXCHANGE: 'exchange',
        FUTURES: 'futures',
        WITHDRAW: 'withdraw',
        INTERNAL_TRANSFER: 'internalTransfer'
    }
}

exports.CounterEnum = {
    USER_ID: 'USER_ID',
    ASSET_ID: 'ASSET_ID',
    EXCHANGE_CONFIG_ID: 'EXCHANGE_CONFIG_ID',
    EXCHANGE_ORDER_COUNTER: 'EXCHANGE_ORDER_COUNTER',
    EXCHANGE_ORDER_HISTORY_COUNTER: 'EXCHANGE_ORDER_HISTORY_COUNTER',
    STAKE_COUNTER: 'STAKE_COUNTER',
    FUTURE_ORDER_COUNTER: 'FUTURE_ORDER_COUNTER',
    LUCKY_MONEY_2020_COUNTER: 'LUCKY_MONEY_2020_COUNTER',
    SWAP_HISTORY: 'SWAP_HISTORY',
    FUTURE_CONTEST_TICKET: 'FUTURE_CONTEST_TICKET'
}


exports.UserBinanceAccountStatus = {
    INACTIVE: 0,
    ACTIVE: 1,
    BANNED: 2
}
exports.UserBinanceAccountType = {
    NORMAL: 0,
}