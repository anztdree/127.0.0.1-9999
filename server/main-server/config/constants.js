/**
 * ============================================================================
 * Main Server — Configuration Constants
 * Port 8001 — Socket.IO v2, TEA verification ENABLED
 * ============================================================================
 *
 * HAR-verified values:
 *   server0Time → 25200000 (POSITIF, bukan negatif)
 *   TEA_KEY     → "verification"
 *   PORT        → 8001
 * ============================================================================
 */

require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env')
});

module.exports = {

  // ==========================================
  // SERVER
  // ==========================================

  /** Port main server — client connects here after login */
  PORT: parseInt(process.env.MAIN_PORT) || 8001,

  /** Host binding */
  HOST: process.env.MAIN_HOST || '0.0.0.0',

  // ==========================================
  // TEA ENCRYPTION
  // ==========================================

  /**
   * TEA verification key
   * MUST match client exactly:
   *   socket.on("verify", function(n) {
   *     var o = (new TEA).encrypt(n, "verification");
   *   })
   */
  TEA_KEY: 'verification',

  /**
   * Verify timeout — client HANGS FOREVER if no callback sent
   * Keep reasonable (15s) to handle slow connections
   */
  VERIFY_TIMEOUT_MS: 15000,

  /**
   * Max verify attempts before hard disconnect
   * Attempt 1..(n-1) → ret:4 (INVALID, client can retry)
   * Attempt n        → ret:38 (LOGIN_CHECK_FAILED, disconnect)
   */
  VERIFY_MAX_ATTEMPTS: 3,

  // ==========================================
  // SOCKET.IO
  // ==========================================

  PING_INTERVAL:   25000,
  PING_TIMEOUT:    60000,
  UPGRADE_TIMEOUT: 30000,

  // ==========================================
  // TIME
  // ==========================================

  /**
   * server0Time — HAR-verified: 25200000 (POSITIF, UTC+7)
   *
   * HAR evidence (3 different responses):
   *   "server0Time":25200000
   *
   * Client formula:
   *   _offTime = 60 * getTimezoneOffset() * 1000 - server0Time
   *   getServerLocalDate() = new Date(serverTime + _offTime)
   *
   * UTC+7  (Jakarta/WIB) = +25200000
   * UTC+8  (Singapore)   = +28800000
   *
   * NOTE: Login-server uses -25200000 — that is a separate field
   * and different client formula. Main-server MUST use +25200000.
   */
  SERVER_UTC_OFFSET_MS: parseInt(process.env.SERVER_UTC_OFFSET_MS) || 25200000,

  // ==========================================
  // DATABASE — same DB as login-server
  // ==========================================

  DB: {
    host:             process.env.DB_HOST     || '127.0.0.1',
    port:             parseInt(process.env.DB_PORT) || 3306,
    user:             process.env.DB_USER     || 'admin',
    password:         process.env.DB_PASSWORD || 'admin',
    database:         process.env.DB_DATABASE || 'super_warrior_z',
    connectionLimit:  parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    connectTimeout:   10000,
    acquireTimeout:   10000,
  },

  // ==========================================
  // SCHEDULER
  // ==========================================

  SCHEDULER: {
    /** Daily reset hour (server local time) */
    DAILY_RESET_HOUR:   6,
    DAILY_RESET_MINUTE: 0,

    /** Stamina recovery: 1 point per 5 minutes */
    STAMINA_RECOVERY_MS: 5 * 60 * 1000,

    /** Activity/online check interval */
    ACTIVITY_CHECK_MS: 30 * 1000,
  },

  // ==========================================
  // GAME LIMITS
  // ==========================================

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
    STAMINA_RECOVERY_PER_TICK: 1,
  },

  // ==========================================
  // LOGGING
  // ==========================================

  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toUpperCase(),
};
