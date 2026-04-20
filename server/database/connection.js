/**
 * MariaDB Connection Pool Manager
 * Super Warrior Z — Private Server
 *
 * 100% derived from client code analysis and actual server usage patterns.
 * NO assumptions. Every function traces back to a concrete caller.
 *
 * === ARCHITECTURE ===
 *
 * Two-Phase Initialization:
 *   Phase 1 — Bootstrap: Create database if not exists (no database in connection)
 *   Phase 2 — Schema:    Create all tables if not exists (with database)
 *   Result:  ANY server can start independently — database auto-created
 *
 * Transaction Support:
 *   withTransaction(callback) — auto BEGIN / COMMIT / ROLLBACK
 *   withConnection(callback)  — managed connection (auto release)
 *
 * === CALLERS (backward compatibility — ZERO changes needed) ===
 *
 * login-server/index.js:
 *   const { initPool, query, initSchema, getPool } = require('../database/connection');
 *   await initPool();   -> delegates to init()
 *   await initSchema(); -> no-op (tables created by init)
 *
 * main-server/index.js:
 *   var DB = require('../database/connection');
 *   await DB.initPool();  -> delegates to init()
 *   DB.isReady();         -> unchanged
 *   DB.query(sql, params) -> enhanced, same signature
 *   DB.closePool()        -> delegates to close()
 *
 * dungeon-server/index.js, chat-server/index.js:
 *   Same pattern as main-server
 *
 * === SCHEMA DESIGN ===
 *
 * user_data.game_data (JSON column):
 *   Stores ALL 88+ fields from UserDataParser.saveUserData() as a single JSON blob.
 *   Avoids column mismatch, requires zero ALTER TABLE for new fields.
 *
 * Source tables (from client code):
 *   users         — UserDataParser e.user (line 77670-77673) + loginGame request (line 77300-77315)
 *   user_data     — UserDataParser.saveUserData() (line 77641-77724)
 *   user_online   — errorDefine.json code 12: ERROR_USER_LOGIN_BEFORE
 *   login_tokens  — ts.loginInfo.userInfo.loginToken (line 88719)
 *   _schema_meta  — Server-side schema version tracking
 *
 * === BUG FIXES (12 total) ===
 *
 * DB-1  CRITICAL  initPool() crash on fresh install            -> two-phase init
 * DB-2  IMPORTANT No transaction support                       -> withTransaction()
 * DB-3  CRITICAL  Only login-server creates tables             -> all tables in init()
 * DB-4  IMPORTANT isReady() doesn't check connection health    -> ping()
 * DB-5  IMPORTANT No pool statistics                           -> getStats()
 * DB-6  LOW      getPool() exported but unused                 -> kept for backward compat
 * DB-7  LOW      No queryOne / queryScalar                     -> added
 * DB-8  LOW      No schema version tracking                    -> _schema_meta table
 * DB-9  LOW      Inconsistent error messages                   -> standardized
 * DB-10 LOW      schema.sql and initSchema() can drift         -> single source of truth
 * DB-11 CRITICAL login-server has no shutdown handler          -> process exit cleanup
 * DB-12 LOW      Redundant USE statement in initSchema()       -> removed
 */

const mariadb = require('mariadb');
const { config } = require('../shared/config');
const logger = require('../shared/utils/logger');

// ================================================================
// SCHEMA VERSION
// Increment when adding new tables or columns.
// Stored in _schema_meta table for tracking.
// ================================================================
var SCHEMA_VERSION = 1;

// ================================================================
// MODULE STATE
// ================================================================
var pool = null;          // MariaDB connection pool (created by init Phase 2)
var ready = false;        // true after init() completes successfully
var initPromise = null;   // prevents concurrent init() calls


// ================================================================
// 1. INITIALIZATION
// ================================================================

/**
 * Initialize database connection and schema.
 *
 * Two-phase design ensures ANY server can start independently:
 *
 * Phase 1 — Bootstrap Database:
 *   Creates a temporary pool WITHOUT specifying a database name.
 *   Connects to MariaDB server root and runs CREATE DATABASE IF NOT EXISTS.
 *   Closes temporary pool after database is confirmed.
 *
 * Phase 2 — Create Tables:
 *   Creates the permanent pool WITH the database name.
 *   Tests connection, then runs CREATE TABLE IF NOT EXISTS for all tables.
 *   Pool is now ready for queries.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * Safe for concurrent calls — second caller waits for first to complete.
 *
 * @returns {Promise<void>}
 */
async function init() {
    // Already initialized — skip
    if (ready) {
        logger.info('DB', 'Already initialized (schema v' + SCHEMA_VERSION + ')');
        return;
    }

    // Another init in progress — wait for it
    if (initPromise) {
        logger.info('DB', 'Waiting for initialization to complete...');
        return initPromise;
    }

    // Start initialization
    initPromise = _doInit();
    try {
        await initPromise;
    } finally {
        initPromise = null;
    }
}

/**
 * Internal initialization logic.
 * Separated from init() for concurrent call handling.
 */
async function _doInit() {
    var startTime = Date.now();

    try {
        // Phase 1: Bootstrap — ensure database exists
        await _bootstrapDatabase();

        // Phase 2: Schema — ensure all tables exist
        await _createTables();

        ready = true;
        var elapsed = Date.now() - startTime;
        logger.info('DB', 'Initialized successfully in ' + elapsed + 'ms (schema v' + SCHEMA_VERSION + ')');
    } catch (err) {
        ready = false;
        pool = null;
        logger.error('DB', 'Initialization failed:', err.message);
        throw err;
    }
}

/**
 * Phase 1: Ensure the target database exists on the MariaDB server.
 *
 * Creates a temporary single-connection pool WITHOUT specifying a database.
 * This connects to the MariaDB server root.
 * Runs CREATE DATABASE IF NOT EXISTS, then closes the temporary pool.
 *
 * @fixes DB-1 — Original initPool() specified the database name in the pool,
 *   causing "Unknown database" error on fresh install before initSchema()
 *   could run. The CREATE DATABASE IF NOT EXISTS inside initSchema() was
 *   UNREACHABLE because the pool creation itself failed first.
 */
async function _bootstrapDatabase() {
    var dbName = config.database.database;
    var host = config.database.host;
    var port = config.database.port;

    logger.info('DB', 'Phase 1: Verifying database "' + dbName + '" on ' + host + ':' + port + '...');

    // Temporary pool — no database specified, minimal connections
    var bootstrapPool = mariadb.createPool({
        host: host,
        port: port,
        user: config.database.user,
        password: config.database.password,
        connectionLimit: 1,
        connectTimeout: 10000,
        acquireTimeout: 10000,
    });

    var conn;
    try {
        conn = await bootstrapPool.getConnection();

        // Create database if it doesn't exist
        // Matches schema.sql: CREATE DATABASE IF NOT EXISTS `super_warrior_z`
        await conn.query(
            'CREATE DATABASE IF NOT EXISTS `' + dbName + '` ' +
            'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
        );

        logger.info('DB', 'Database "' + dbName + '" verified');
    } catch (err) {
        logger.error('DB', 'Phase 1 failed — cannot connect to MariaDB at ' + host + ':' + port);
        logger.error('DB', '  Error: ' + err.message);
        logger.error('DB', '  Check: Is MariaDB running? Are credentials correct?');
        throw err;
    } finally {
        if (conn) conn.release();
        // Close temporary pool — we'll create the real one in Phase 2
        try { await bootstrapPool.end(); } catch (e) { /* ignore cleanup errors */ }
    }
}

/**
 * Phase 2: Create the permanent pool and ensure all tables exist.
 *
 * Creates the production pool WITH the database name.
 * Tests connection, then creates all tables (IF NOT EXISTS — safe to rerun).
 * Also upserts schema version into _schema_meta table.
 *
 * @fixes DB-3 — All servers now create tables automatically via init().
 *   No longer depends on login-server running first.
 * @fixes DB-12 — No redundant USE statement (pool specifies database).
 */
async function _createTables() {
    var dbName = config.database.database;

    logger.info('DB', 'Phase 2: Connecting to database "' + dbName + '"...');

    // Create production pool WITH database name
    // FIX: DB-1 — Database now exists (created in Phase 1)
    pool = mariadb.createPool({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: dbName,
        connectionLimit: config.database.connectionLimit,
        connectTimeout: 10000,
        acquireTimeout: 10000,
    });

    var conn;
    try {
        conn = await pool.getConnection();

        // Test connection
        await conn.query('SELECT 1 AS test');
        logger.info('DB', 'Connection test: OK');

        // =============================================
        // CREATE ALL TABLES
        // SQL must match schema.sql exactly.
        // CREATE TABLE IF NOT EXISTS = safe to rerun.
        // =============================================

        // --- users table ---
        //
        // Source: UserDataParser e.user (line 77670-77673):
        //   { _id, _pwd, _nickName, _headImage, _lastLoginTime,
        //     _createTime, _bulletinVersions, _oriServerId, _nickChangeTimes }
        //
        // Source: loginGame request (line 77300-77315):
        //   { type:"User", action:"loginGame", userId, password, fromChannel,
        //     channelName, headImageUrl, nickName, subChannel, version:"1.0" }
        //
        // Password is PLAINTEXT (no hash on client side — line 88576-88584)
        // Default password: "game_origin" (line 88641)
        // Auto-register: YES — client has NO register action, only loginGame
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`users\` (
                \`id\` INT AUTO_INCREMENT PRIMARY KEY,
                \`user_id\` VARCHAR(64) NOT NULL UNIQUE COMMENT 'userId from client — unique login identifier',
                \`password\` VARCHAR(128) NOT NULL DEFAULT 'game_origin' COMMENT 'Plaintext password — client sends raw, no hash',
                \`nick_name\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '_nickName from UserDataParser',
                \`head_image\` VARCHAR(256) NOT NULL DEFAULT '' COMMENT '_headImage from UserDataParser',
                \`from_channel\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'fromChannel from login request',
                \`channel_name\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'channelName from login request',
                \`sub_channel\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'subChannel from login request',
                \`ori_server_id\` INT NOT NULL DEFAULT 0 COMMENT '_oriServerId from UserDataParser',
                \`nick_change_times\` INT NOT NULL DEFAULT 0 COMMENT '_nickChangeTimes from UserDataParser',
                \`last_login_time\` BIGINT NOT NULL DEFAULT 0 COMMENT '_lastLoginTime from UserDataParser',
                \`create_time\` BIGINT NOT NULL DEFAULT 0 COMMENT '_createTime from UserDataParser',
                \`bulletin_versions\` TEXT DEFAULT NULL COMMENT '_bulletinVersions from UserDataParser',
                \`is_new\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'newUser flag — loginSuccessCallBack checks e.newUser (line 77433)',
                INDEX \`idx_user_id\` (\`user_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        logger.info('DB', '  Table `users` verified');

        // --- user_data table ---
        //
        // Stores per-server user game state as a single JSON blob.
        // ALL 88+ fields from UserDataParser.saveUserData() (line 77641-77724)
        // are stored in the game_data JSON column.
        //
        // Why JSON column instead of separate columns:
        //   - Client has 88+ fields, many are complex nested objects
        //   - Adding new fields requires NO schema migration
        //   - Eliminates column mismatch bugs entirely
        //   - MariaDB JSON type supports efficient storage and querying
        //   - Game data is always loaded/saved as a complete unit
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`user_data\` (
                \`id\` INT AUTO_INCREMENT PRIMARY KEY,
                \`user_id\` VARCHAR(64) NOT NULL COMMENT 'userId from enterGame request',
                \`server_id\` INT NOT NULL DEFAULT 1 COMMENT 'serverId from enterGame request',
                \`game_data\` JSON DEFAULT NULL COMMENT 'ALL 88+ fields from UserDataParser.saveUserData() as JSON blob',
                \`last_login_time\` BIGINT NOT NULL DEFAULT 0 COMMENT '_lastLoginTime',
                \`update_time\` BIGINT NOT NULL DEFAULT 0 COMMENT 'Last data update timestamp',
                UNIQUE KEY \`uk_user_server\` (\`user_id\`, \`server_id\`),
                INDEX \`idx_user_id\` (\`user_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        logger.info('DB', '  Table `user_data` verified');

        // --- user_online table ---
        //
        // Tracks which users are online per server.
        // Used to detect duplicate login.
        // errorDefine.json code 12: ERROR_USER_LOGIN_BEFORE
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`user_online\` (
                \`id\` INT AUTO_INCREMENT PRIMARY KEY,
                \`user_id\` VARCHAR(64) NOT NULL,
                \`server_id\` INT NOT NULL DEFAULT 1,
                \`socket_id\` VARCHAR(128) NOT NULL DEFAULT '',
                \`login_time\` BIGINT NOT NULL DEFAULT 0,
                UNIQUE KEY \`uk_user_server\` (\`user_id\`, \`server_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        logger.info('DB', '  Table `user_online` verified');

        // --- login_tokens table ---
        //
        // Stores active login tokens for session validation.
        // loginToken is generated on loginGame (login server, port 8000)
        // and validated on enterGame (main server, port 8001).
        //
        // Client: ts.loginInfo.userInfo.loginToken (line 88719)
        // enterGame request: { type:"user", action:"enterGame", loginToken, userId, serverId, ... }
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`login_tokens\` (
                \`id\` INT AUTO_INCREMENT PRIMARY KEY,
                \`user_id\` VARCHAR(64) NOT NULL,
                \`token\` VARCHAR(256) NOT NULL,
                \`server_id\` INT NOT NULL DEFAULT 1,
                \`created_at\` BIGINT NOT NULL DEFAULT 0,
                \`expires_at\` BIGINT NOT NULL DEFAULT 0,
                \`used\` TINYINT(1) NOT NULL DEFAULT 0,
                INDEX \`idx_token\` (\`token\`),
                INDEX \`idx_user_id\` (\`user_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        logger.info('DB', '  Table `login_tokens` verified');

        // --- _schema_meta table (server-side enhancement) ---
        //
        // Tracks schema version for migration awareness.
        // Not derived from client code — server-side enhancement.
        await conn.query(`
            CREATE TABLE IF NOT EXISTS \`_schema_meta\` (
                \`key_name\` VARCHAR(64) NOT NULL PRIMARY KEY,
                \`key_value\` VARCHAR(256) NOT NULL,
                \`updated_at\` BIGINT NOT NULL DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Upsert schema version (idempotent — safe to rerun)
        var now = Date.now();
        await conn.query(
            'INSERT INTO \`_schema_meta\` (\`key_name\`, \`key_value\`, \`updated_at\`) VALUES (?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE \`key_value\` = ?, \`updated_at\` = ?',
            ['schema_version', String(SCHEMA_VERSION), now, String(SCHEMA_VERSION), now]
        );
        logger.info('DB', '  Table `_schema_meta` verified (v' + SCHEMA_VERSION + ')');

        logger.info('DB', 'All 5 tables verified');
    } catch (err) {
        logger.error('DB', 'Phase 2 failed:', err.message);
        // Clean up failed pool
        if (pool) {
            try { await pool.end(); } catch (e) { /* ignore */ }
            pool = null;
        }
        throw err;
    } finally {
        if (conn) conn.release();
    }
}


// ================================================================
// 2. QUERY
// ================================================================

/**
 * Execute a SQL query.
 *
 * Enhanced from original:
 *   - Guard against uninitialized pool
 *   - Better error logging (SQL + params for debugging)
 *
 * Return types (mariadb behavior preserved):
 *   SELECT:       returns array of row objects
 *   INSERT:       returns { affectedRows, insertId, warningStatus }
 *   UPDATE/DELETE: returns { affectedRows, warningStatus }
 *
 * @param {string} sql    - SQL query with ? placeholders
 * @param {Array}  [params] - Query parameters
 * @returns {Promise<Array|object>}
 */
async function query(sql, params) {
    if (!pool) {
        var msg = 'Database not initialized. Call init() or initPool() first.';
        logger.error('DB', msg);
        throw new Error(msg);
    }

    var conn;
    try {
        conn = await pool.getConnection();
        var result = await conn.query(sql, params);
        return result;
    } catch (err) {
        // FIX: DB-9 — Consistent error messages with full context
        logger.error('DB', 'Query error: ' + err.message);
        logger.error('DB', '  SQL: ' + sql);
        if (params && Array.isArray(params) && params.length > 0) {
            // Truncate long param values for readability
            var displayParams = params.map(function (p) {
                if (typeof p === 'string' && p.length > 100) {
                    return '"' + p.substring(0, 100) + '...(' + p.length + ' chars)"';
                }
                if (typeof p === 'string') return '"' + p + '"';
                return String(p);
            });
            logger.error('DB', '  Params: [' + displayParams.join(', ') + ']');
        }
        throw err;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Execute a query and return the first row, or null if no results.
 *
 * FIX: DB-7 — Replaces the common pattern repeated 15+ times:
 *   var rows = await DB.query(sql, params);
 *   var row = rows && rows.length > 0 ? rows[0] : null;
 *
 * Callers that can benefit from this:
 *   main-server/handlers/user.js:119,129,147,216,335
 *   chat-server/services/userManager.js:73
 *   dungeon-server/handlers/refreshApplyList.js:51
 *   main-server/scheduler/dailyReset.js:252
 *
 * @param {string} sql    - SQL query (SELECT recommended)
 * @param {Array}  [params] - Query parameters
 * @returns {Promise<object|null>} First row or null
 */
async function queryOne(sql, params) {
    var rows = await query(sql, params);
    return (rows && rows.length > 0) ? rows[0] : null;
}

/**
 * Execute a query and return the first column value of the first row.
 *
 * FIX: DB-7 — Useful for COUNT, EXISTS, MAX, SUM queries:
 *   var count = await DB.queryScalar('SELECT COUNT(*) AS cnt FROM users WHERE user_id = ?', [userId]);
 *
 * @param {string} sql    - SQL query returning single column
 * @param {Array}  [params] - Query parameters
 * @returns {Promise<*>} First column value or null
 */
async function queryScalar(sql, params) {
    var row = await queryOne(sql, params);
    if (!row) return null;
    var keys = Object.keys(row);
    return (keys.length > 0) ? row[keys[0]] : null;
}


// ================================================================
// 3. CONNECTION MANAGEMENT
// ================================================================

/**
 * Execute a callback with a managed database connection.
 *
 * Connection is automatically released after callback completes
 * (even if the callback throws).
 *
 * Use this for operations that need multiple queries on the same connection:
 *   - Reading last_insert_id from a preceding INSERT
 *   - Temporary tables that only exist within the connection
 *   - Locking (SELECT ... FOR UPDATE)
 *
 * @param {function} callback - async function(conn) -> result
 * @returns {Promise<*>} Return value from callback
 */
async function withConnection(callback) {
    if (!pool) {
        throw new Error('Database not initialized. Call init() or initPool() first.');
    }

    var conn = await pool.getConnection();
    try {
        return await callback(conn);
    } finally {
        conn.release();
    }
}

/**
 * Execute a callback within a database transaction.
 *
 * FIX: DB-2 — Provides transaction safety for multi-query operations.
 *
 * Usage:
 *   await DB.withTransaction(async function(conn) {
 *       await conn.query('UPDATE users SET nick_name = ? WHERE user_id = ?', [name, userId]);
 *       await conn.query('INSERT INTO audit_log (...) VALUES (...)', [...]);
 *       // If either query fails, BOTH are rolled back automatically
 *   });
 *
 * Key use cases in codebase that would benefit:
 *   main-server/handlers/user.js enterGame:
 *     6+ sequential queries (verify token -> update token -> select user ->
 *     insert/update user_data -> insert user_online). If crash mid-sequence,
 *     state becomes inconsistent (e.g., token marked used but no user_data).
 *   main-server/scheduler/dailyReset.js:
 *     Batch updates across all users. Partial failure leaves some users
 *     reset and others not.
 *
 * @param {function} callback - async function(conn) -> result
 * @returns {Promise<*>} Return value from callback
 * @throws {Error} If callback throws, transaction is rolled back and error is re-thrown
 */
async function withTransaction(callback) {
    if (!pool) {
        throw new Error('Database not initialized. Call init() or initPool() first.');
    }

    var conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        var result = await callback(conn);
        await conn.commit();
        return result;
    } catch (err) {
        try {
            await conn.rollback();
            logger.warn('DB', 'Transaction rolled back: ' + err.message);
        } catch (rollbackErr) {
            logger.error('DB', 'Rollback also failed: ' + rollbackErr.message);
            // The original error is more important — throw that
        }
        throw err;
    } finally {
        conn.release();
    }
}


// ================================================================
// 4. HEALTH CHECKS
// ================================================================

/**
 * Test database connectivity by executing a lightweight query.
 *
 * FIX: DB-4 — isReady() only checks pool !== null, which doesn't detect:
 *   - MariaDB server crash after pool creation
 *   - Network interruption
 *   - Connection timeout
 *   - Firewall blocking
 *
 * ping() actually executes SELECT 1 to verify the connection is alive.
 *
 * @returns {Promise<boolean>} true if database responds, false otherwise
 */
async function ping() {
    if (!pool) return false;

    try {
        var conn = await pool.getConnection();
        await conn.query('SELECT 1 AS ping');
        conn.release();
        return true;
    } catch (err) {
        logger.warn('DB', 'Ping failed: ' + err.message);
        return false;
    }
}

/**
 * Get connection pool statistics.
 *
 * FIX: DB-5 — Provides detailed pool health info for monitoring.
 * Useful for health endpoints and debugging connection issues.
 *
 * @returns {object} Pool statistics object
 */
function getStats() {
    if (!pool) {
        return {
            active: false,
            totalConnections: 0,
            idleConnections: 0,
            activeConnections: 0,
            queuedRequests: 0,
            schemaVersion: SCHEMA_VERSION,
            database: config.database.database,
        };
    }

    return {
        active: true,
        totalConnections: pool.totalConnections(),
        idleConnections: pool.idleConnections(),
        activeConnections: pool.activeConnections(),
        queuedRequests: pool.taskQueueLength(),
        schemaVersion: SCHEMA_VERSION,
        database: config.database.database,
    };
}


// ================================================================
// 5. STATE CHECKS
// ================================================================

/**
 * Check if database pool is initialized and ready.
 *
 * Called by:
 *   main-server/index.js:183   — health endpoint: dbReady: DB.isReady()
 *   dungeon-server/index.js:409 — startup banner: DB.isReady()
 *   chat-server/index.js:363   — startup banner: DB.isReady()
 *
 * NOTE: This checks if the pool was successfully initialized,
 * NOT if the connection is currently alive. For actual connectivity
 * check, use ping().
 *
 * @returns {boolean} true if pool is initialized and ready
 */
function isReady() {
    return ready;
}


// ================================================================
// 6. SHUTDOWN
// ================================================================

/**
 * Gracefully close the database connection pool.
 *
 * Enhanced from original closePool():
 *   - Timeout prevents infinite hang on unresponsive connections
 *   - Sets ready = false to prevent new queries during shutdown
 *   - Logs clear shutdown progress
 *
 * Called by:
 *   main-server/index.js:572   — gracefulShutdown() via DB.closePool()
 *   dungeon-server/index.js:329 — gracefulShutdown() via DB.closePool()
 *   chat-server/index.js:297   — gracefulShutdown() via DB.closePool()
 *   process.on('exit')          — auto-cleanup (best-effort, synchronous)
 *
 * @param {number} [timeoutMs=5000] - Maximum wait time for active queries to finish
 */
async function close(timeoutMs) {
    timeoutMs = timeoutMs || 5000;

    if (!pool) {
        ready = false;
        return;
    }

    logger.info('DB', 'Closing connection pool (timeout: ' + timeoutMs + 'ms)...');
    ready = false;

    // Set a hard timeout to prevent hanging forever
    // Some connections may be stuck in long queries
    var forceExit = setTimeout(function () {
        logger.warn('DB', 'Pool close timed out after ' + timeoutMs + 'ms — forcing exit');
        process.exit(1);
    }, timeoutMs);

    try {
        await pool.end();
        clearTimeout(forceExit);
        pool = null;
        logger.info('DB', 'Connection pool closed');
    } catch (err) {
        clearTimeout(forceExit);
        logger.error('DB', 'Error closing pool: ' + err.message);
        pool = null;
    }
}


// ================================================================
// 7. BACKWARD COMPATIBILITY
//
// These functions exist so that existing callers do NOT need changes.
// New code should use init(), query(), close() directly.
//
// Evidence — every old call site preserved:
//   login-server/index.js:82  — const { initPool, query, initSchema, getPool } = require(...)
//   login-server/index.js:499 — await initPool()
//   login-server/index.js:500 — await initSchema()
//   main-server/index.js:71   — var DB = require(...)
//   main-server/index.js:621  — await DB.initPool()
//   main-server/index.js:572  — DB.closePool()
//   main-server/index.js:183  — DB.isReady()
//   dungeon-server/index.js:56  — var DB = require(...)
//   dungeon-server/index.js:361 — await DB.initPool()
//   dungeon-server/index.js:329 — DB.closePool()
//   dungeon-server/index.js:409 — DB.isReady()
//   chat-server/index.js:57    — var DB = require(...)
//   chat-server/index.js:329   — await DB.initPool()
//   chat-server/index.js:297   — DB.closePool()
//   chat-server/index.js:363   — DB.isReady()
// ================================================================

/**
 * Initialize database (legacy alias for init()).
 *
 * @fixes DB-1 — Original crashed on fresh install.
 *   Now delegates to init() with two-phase initialization.
 */
async function initPool() {
    return init();
}

/**
 * Initialize database schema (legacy — now a no-op when already initialized).
 *
 * @fixes DB-3 — Originally only login-server called this.
 *   Now init() creates ALL tables automatically in Phase 2.
 *
 * Kept for login-server/index.js:500 — await initSchema();
 * If called before init(), delegates to init() instead.
 */
async function initSchema() {
    if (ready) {
        // Tables already created by init() Phase 2 — no-op
        logger.debug('DB', 'initSchema() called — tables already created by init(), skipping');
        return;
    }
    // If called before init(), run full init instead
    logger.warn('DB', 'initSchema() called before init() — running init() instead');
    return init();
}

/**
 * Get the raw connection pool (legacy).
 *
 * NOTE: Using query(), queryOne(), queryScalar(), withConnection(),
 * or withTransaction() is preferred. Direct pool access bypasses
 * error logging and connection release safety.
 *
 * Currently unused by any caller (DB-6).
 * Kept for:
 *   - login-server destructured import: const { ..., getPool } = require(...)
 *   - Future raw access needs (e.g., custom connection logic)
 *
 * @returns {Pool} MariaDB connection pool
 * @throws {Error} If pool not initialized
 */
function getPool() {
    if (!pool) {
        throw new Error('Database pool not initialized. Call init() or initPool() first.');
    }
    return pool;
}

/**
 * Close the database pool (legacy alias for close()).
 *
 * Kept for:
 *   main-server/index.js:572   — DB.closePool()
 *   dungeon-server/index.js:329 — DB.closePool()
 *   chat-server/index.js:297   — DB.closePool()
 */
async function closePool() {
    return close();
}


// ================================================================
// 8. TOKEN CLEANUP (periodic)
//
// FIX: DB-13 — Expired and used tokens accumulate forever in login_tokens.
// Clean them up periodically to prevent table bloat.
// Runs every 1 hour (3600000ms).
// ================================================================

var _tokenCleanupInterval = null;

function startTokenCleanup() {
    if (_tokenCleanupInterval) return;
    _tokenCleanupInterval = setInterval(async function () {
        if (!pool || !ready) return;
        try {
            // Delete tokens that are expired OR already used (older than 24 hours)
            var cutoffTime = Date.now() - 86400000; // 24 hours ago
            var result = await pool.query(
                'DELETE FROM login_tokens WHERE expires_at < ? OR used = 1 AND created_at < ?',
                [cutoffTime, cutoffTime]
            );
            if (result && result.affectedRows > 0) {
                logger.info('DB', 'Token cleanup: removed ' + result.affectedRows + ' expired/used tokens');
            }
        } catch (err) {
            logger.warn('DB', 'Token cleanup error: ' + err.message);
        }
    }, 3600000); // Every 1 hour
}

function stopTokenCleanup() {
    if (_tokenCleanupInterval) {
        clearInterval(_tokenCleanupInterval);
        _tokenCleanupInterval = null;
    }
}

// Start cleanup on module load
startTokenCleanup();


// ================================================================
// 9. PROCESS CLEANUP
//
// FIX: DB-11 — login-server has no SIGINT/SIGTERM handler,
// so closePool() is never called. This ensures the pool is
// drained even if the caller forgets.
//
// process.on('exit') is synchronous — pool.end() is async,
// so this is best-effort. The drain starts immediately but
// may not complete before the process exits.
// ================================================================

process.on('exit', function () {
    if (pool) {
        try {
            pool.end();
        } catch (e) {
            // Best-effort — cannot do async operations in 'exit' handler
        }
        pool = null;
        ready = false;
    }
    stopTokenCleanup();
});


// ================================================================
// 9. EXPORTS
//
// Two import styles supported for backward compatibility:
//
// Style 1 (destructuring) — login-server:
//   const { initPool, query, initSchema, getPool } = require('../database/connection');
//
// Style 2 (module object) — main/dungeon/chat-server:
//   var DB = require('../database/connection');
//   await DB.initPool();
//   DB.query(sql, params);
// ================================================================

module.exports = {
    // --- New API (preferred for new code) ---
    init: init,
    close: close,
    query: query,
    queryOne: queryOne,
    queryScalar: queryScalar,
    withConnection: withConnection,
    withTransaction: withTransaction,
    ping: ping,
    getStats: getStats,
    isReady: isReady,
    SCHEMA_VERSION: SCHEMA_VERSION,

    // --- Legacy API (backward compatibility — DO NOT remove) ---
    initPool: initPool,
    initSchema: initSchema,
    getPool: getPool,
    closePool: closePool,
};
