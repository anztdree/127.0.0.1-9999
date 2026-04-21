/**
 * ============================================================================
 *  Main Server — Configuration Constants (Standalone v1)
 * ============================================================================
 */

module.exports = {
    // Server
    PORT: process.env.MAIN_PORT || 8001,
    HOST: process.env.MAIN_HOST || '0.0.0.0',

    // TEA encryption key — MUST match client: (new TEA).encrypt(n, "verification")
    TEA_KEY: 'verification',

    // CORS — same writeHead monkey-patch as login-server
    CORS_FIX: 'v3-writeHead-patch',

    // Socket.IO
    PING_INTERVAL: 25000,
    PING_TIMEOUT: 60000,
    UPGRADE_TIMEOUT: 30000,

    // TEA verify
    VERIFY_TIMEOUT_MS: 15000,
    VERIFY_MAX_ATTEMPTS: 3,

    // Database — same DB as login-server
    DB: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'super_warrior_z',
        connectionLimit: 10,
        connectTimeout: 10000,
    },

    // Server time offset (milliseconds) — same as login-server
    // Used by client: ServerTime.updateServerTime(serverTime, server0Time)
    SERVER_UTC_OFFSET_MS: -25200000,

    // Scheduler
    SCHEDULER: {
        DAILY_RESET_HOUR: 6,
        DAILY_RESET_MINUTE: 0,
        STAMINA_RECOVERY_MS: 5 * 60 * 1000,   // 5 minutes
        ACTIVITY_CHECK_MS: 30 * 1000,
        BATTLE_CLEANUP_MS: 5 * 60 * 1000,
    },

    // Game limits
    MAX_LIMITS: {
        MAX_ARENA_RANK: 9999,
        MAX_TOWER_LEVEL: 999,
        MAX_USER_LEVEL: 300,
        MAX_HERO_LEVEL: 200,
        MAX_VIP_LEVEL: 15,
        MAX_FRIENDS: 50,
        MAX_MAILS: 100,
        MAX_HEROES: 200,
        MAX_EQUIPS: 300,
        MAX_ITEMS: 200,
        MAX_TEAM_SIZE: 6,
        STAMINA_MAX: 120,
    },
};
