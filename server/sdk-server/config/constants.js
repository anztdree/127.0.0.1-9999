/**
 * ============================================================================
 *  SDK Server v3 — Constants & Configuration
 *  ============================================================================
 *
 *  Standalone config — NO dependency on shared/ folder.
 *  All values verified against:
 *    - sdk.js (client): APP_ID '288', CHANNEL 'ppgame'
 *    - index.html: getSdkLoginInfo() expects exact field names
 *    - main.min.js: sdkLoginSuccess() flow expects exact values
 *    - Existing data/users.json: all 15 users have sdk='ppgame', appId='288'
 *
 * ============================================================================
 */

var path = require('path');

module.exports = {

    // =============================================
    // SERVER
    // =============================================

    /** Port — Express HTTP server */
    PORT: parseInt(process.env.SDK_PORT) || 9999,

    /** Host — 0.0.0.0 for LAN access, 127.0.0.1 for local only */
    HOST: process.env.SDK_HOST || '0.0.0.0',

    /** Data directory — absolute path */
    DATA_DIR: path.join(__dirname, '..', 'data'),

    /** Dev mode — verbose logging */
    IS_DEV: process.argv.indexOf('--dev') !== -1,

    // =============================================
    // SDK — Must match sdk.js SDK_CONFIG exactly
    // =============================================

    /**
     * SDK channel.
     * HARUS 'ppgame' — sdk.js hardcodes this, main.min.js uses it.
     * index.html line 53: window["sdkChannel"] = "ppgame"
     * main.min.js line 88564: o.sdk
     * main.min.js: ts.loginUserInfo.sdk = o.sdk
     */
    DEFAULT_SDK_CHANNEL: 'ppgame',

    /**
     * App ID.
     * HARUS '288' — sdk.js hardcodes this.
     * sdk.js: SDK_CONFIG.APP_ID = '288'
     * main.min.js line 52484: ReportSdkInfoXX uses appId
     */
    DEFAULT_APP_ID: '288',

    // =============================================
    // CRYPTO
    // =============================================

    /** Sign secret — sha256(userId + loginToken + SIGN_SECRET).substring(0, 32) */
    SIGN_SECRET: 'sdk_sign_secret_2024',

    /** PBKDF2-SHA512 config */
    HASH_ITERATIONS: 10000,
    HASH_KEY_LENGTH: 64,
    HASH_ALGORITHM: 'sha512',

    /** Salt: 32 bytes → 64-char hex */
    SALT_LENGTH: 32,

    /** Security: 16 bytes → 32-char hex */
    SECURITY_LENGTH: 16,

    /** Token random: 24 bytes → 48-char hex (token total = 57 chars) */
    TOKEN_RANDOM_BYTES: 24,

    /** Order random: 4 bytes → 8-char hex */
    ORDER_RANDOM_BYTES: 4,

    // =============================================
    // SESSION
    // =============================================

    /** Session duration: 7 days */
    SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,

    /** Cleanup interval: every 30 min */
    SESSION_CLEANUP_INTERVAL_MS: 30 * 60 * 1000,

    // =============================================
    // RATE LIMITING
    // =============================================

    RATE_LIMITS: {
        LOGIN:    { maxRequests: 10, windowMs: 60000 },
        REGISTER: { maxRequests: 5,  windowMs: 60000 },
        GUEST:    { maxRequests: 10, windowMs: 60000 },
        PAYMENT:  { maxRequests: 20, windowMs: 60000 },
        REPORT:   { maxRequests: 60, windowMs: 60000 },
        GENERAL:  { maxRequests: 30, windowMs: 60000 }
    },

    RATE_LIMIT_CLEANUP_MS: 5 * 60 * 1000,
    RATE_LIMIT_STALE_MS: 10 * 60 * 1000,

    // =============================================
    // ANALYTICS
    // =============================================

    MAX_ANALYTICS_EVENTS: 50000,
    ANALYTICS_ARCHIVE_PERCENT: 0.8,
    ANALYTICS_ROTATION_INTERVAL_MS: 30 * 60 * 1000,
    ANALYTICS_ARCHIVE_DIR: 'archive',

    // =============================================
    // USER VALIDATION
    // =============================================

    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 20,
    PASSWORD_MIN_LENGTH: 4,
    PASSWORD_MAX_LENGTH: 32,
    USERNAME_PATTERN: /^[a-zA-Z0-9_]+$/,

    // =============================================
    // CORS & EXPRESS
    // =============================================

    CORS: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'X-SDK-Channel',
            'X-Session-ID',
            'X-SDK-AppId',
            'X-SDK-Version',
            'X-Request-ID'
        ],
        exposedHeaders: ['Content-Type', 'X-SDK-Channel', 'X-RateLimit-Remaining'],
        credentials: false,
        maxAge: 86400,
        preflightContinue: false,
        optionsSuccessStatus: 204
    },

    BODY_LIMIT: '5mb'
};
