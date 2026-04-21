/**
 * Login Server — Constants & Configuration
 *
 * Source of truth: main.min.js client analysis
 * NO external shared/ dependencies — fully standalone
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {

    // =============================================
    // SERVER
    // =============================================
    PORT: parseInt(process.env.LOGIN_PORT) || 8000,
    HOST: process.env.LOGIN_HOST || '0.0.0.0',

    // =============================================
    // SDK (from client sdk.js)
    // =============================================
    DEFAULT_SDK_CHANNEL: 'ppgame',
    DEFAULT_APP_ID: '288',
    DEFAULT_PASSWORD: 'game_origin',      // main.min.js line 88641
    CLIENT_VERSION: '1.0',                // client always sends version: "1.0"

    // =============================================
    // SERVER0TIME — CRITICAL for client time calculations
    // =============================================
    // Client formula (main.min.js line 116952-116954):
    //   _offTime = 60 * getTimezoneOffset() * 1000 - server0Time
    //   getServerLocalDate() = new Date(serverTime + _offTime)
    //
    // For correct server time: server0Time = -(server_tz_offset_ms)
    //   UTC+7 = -25200000
    //   UTC+8 = -28800000
    SERVER_UTC_OFFSET_MS: parseInt(process.env.SERVER_UTC_OFFSET_MS) || -25200000,

    // =============================================
    // SERVER LIST — sent to client via GetServerList
    // Client reads: serverList[i].serverId, .name, .url, .dungeonurl, .chaturl
    // =============================================
    SERVER_PUBLIC_HOST: process.env.SERVER_PUBLIC_HOST || '127.0.0.1',
    MAIN_SERVER_PORT: parseInt(process.env.MAIN_SERVER_PORT) || 8001,
    CHAT_SERVER_PORT: parseInt(process.env.CHAT_SERVER_PORT) || 8002,
    DUNGEON_SERVER_PORT: parseInt(process.env.DUNGEON_SERVER_PORT) || 8003,

    // =============================================
    // TOKEN
    // =============================================
    TOKEN_EXPIRY_MS: 24 * 60 * 60 * 1000,   // 24 hours
    TOKEN_RANDOM_LENGTH: 8,

    // =============================================
    // RATE LIMITING
    // =============================================
    RATE_MAX_ATTEMPTS: 5,
    RATE_WINDOW_MS: 60 * 1000,
    RATE_BAN_MS: 5 * 60 * 1000,
    RATE_CLEANUP_MS: 10 * 60 * 1000,

    // =============================================
    // ANNOUNCE
    // =============================================
    ANNOUNCE_ENABLED: false,

    // =============================================
    // DATABASE
    // =============================================
    DB: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'admin',
        password: process.env.DB_PASSWORD || 'admin',
        database: process.env.DB_DATABASE || 'super_warrior_z',
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 5,
    },
};
