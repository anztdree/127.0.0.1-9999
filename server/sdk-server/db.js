/**
 * db.js — SDK-SERVER Database Module
 * Referensi: sdk.md Section 17
 *
 * Database: better-sqlite3 WAL mode
 * File: ./data/sdk.db
 * Tables: users, sessions, payments, events
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'sdk.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// ─── Initialize Database ───
const db = new Database(DB_PATH);

// WAL mode for performance
db.pragma('journal_mode = WAL');

// ─── Create Tables ───
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        userId TEXT PRIMARY KEY,
        loginToken TEXT NOT NULL,
        sign TEXT NOT NULL,
        securityCode TEXT NOT NULL,
        nickName TEXT NOT NULL DEFAULT 'Guest',
        sdk TEXT NOT NULL DEFAULT 'ppgame',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        lastLoginAt INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_users_loginToken ON users(loginToken);
    CREATE INDEX IF NOT EXISTS idx_users_sdk ON users(sdk);
    CREATE INDEX IF NOT EXISTS idx_users_lastLoginAt ON users(lastLoginAt);

    CREATE TABLE IF NOT EXISTS sessions (
        sessionId TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        loginToken TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        lastActivityAt INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(userId)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
    CREATE INDEX IF NOT EXISTS idx_sessions_loginToken ON sessions(loginToken);

    CREATE TABLE IF NOT EXISTS payments (
        paymentId TEXT PRIMARY KEY,
        orderId TEXT NOT NULL,
        userId TEXT NOT NULL,
        productId TEXT,
        productName TEXT,
        price REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'pending',
        serverId TEXT,
        roleId TEXT,
        roleName TEXT,
        extra TEXT,
        createdAt INTEGER NOT NULL,
        confirmedAt INTEGER,
        FOREIGN KEY (userId) REFERENCES users(userId)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_userId ON payments(userId);
    CREATE INDEX IF NOT EXISTS idx_payments_orderId ON payments(orderId);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        eventType TEXT NOT NULL,
        eventData TEXT,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(userId)
    );

    CREATE INDEX IF NOT EXISTS idx_events_userId ON events(userId);
    CREATE INDEX IF NOT EXISTS idx_events_eventType ON events(eventType);
`);

logger.log('INFO', 'DB', 'Database initialized');
logger.detail('data', ['tables', 'users, sessions, payments, events'], ['mode', 'WAL'], ['path', DB_PATH]);

// ═══════════════════════════════════════════════════════════════
// USER OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new user
 * @param {object} params - { userId, loginToken, sign, securityCode, nickName, sdk }
 * @returns {object} The created user row
 */
function createUser(params) {
    const now = Date.now();
    const stmt = db.prepare(`
        INSERT INTO users (userId, loginToken, sign, securityCode, nickName, sdk, createdAt, updatedAt, lastLoginAt)
        VALUES (@userId, @loginToken, @sign, @securityCode, @nickName, @sdk, @createdAt, @updatedAt, @lastLoginAt)
    `);
    stmt.run({
        userId: params.userId,
        loginToken: params.loginToken,
        sign: params.sign,
        securityCode: params.securityCode,
        nickName: params.nickName,
        sdk: params.sdk || 'ppgame',
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
    });
    return getUser(params.userId);
}

/**
 * Get user by userId
 * @param {string} userId
 * @returns {object|null}
 */
function getUser(userId) {
    const stmt = db.prepare('SELECT * FROM users WHERE userId = ?');
    return stmt.get(userId);
}

/**
 * Update user login data (token, sign, securityCode, lastLoginAt)
 * @param {string} userId
 * @param {object} params - { loginToken, sign, securityCode, nickName? }
 */
function updateUserLogin(userId, params) {
    const now = Date.now();
    const fields = ['loginToken = @loginToken', 'sign = @sign', 'securityCode = @securityCode', 'updatedAt = @updatedAt', 'lastLoginAt = @lastLoginAt'];
    const values = {
        userId: userId,
        loginToken: params.loginToken,
        sign: params.sign,
        securityCode: params.securityCode,
        updatedAt: now,
        lastLoginAt: now
    };

    if (params.nickName) {
        fields.push('nickName = @nickName');
        values.nickName = params.nickName;
    }

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE userId = @userId`;
    db.prepare(sql).run(values);
}

/**
 * Find user by loginToken
 * @param {string} loginToken
 * @returns {object|null}
 */
function getUserByToken(loginToken) {
    const stmt = db.prepare('SELECT * FROM users WHERE loginToken = ?');
    return stmt.get(loginToken);
}

// ═══════════════════════════════════════════════════════════════
// SESSION OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new session
 * @param {object} params - { sessionId, userId, loginToken }
 */
function createSession(params) {
    const now = Date.now();
    const stmt = db.prepare(`
        INSERT INTO sessions (sessionId, userId, loginToken, createdAt, lastActivityAt)
        VALUES (@sessionId, @userId, @loginToken, @createdAt, @lastActivityAt)
    `);
    stmt.run({
        sessionId: params.sessionId,
        userId: params.userId,
        loginToken: params.loginToken,
        createdAt: now,
        lastActivityAt: now
    });
}

/**
 * Validate session by loginToken and userId
 * @param {string} loginToken
 * @param {string} userId
 * @returns {object|null} User data if valid
 */
function validateSession(loginToken, userId) {
    const stmt = db.prepare(`
        SELECT u.* FROM users u
        WHERE u.userId = ? AND u.loginToken = ?
    `);
    return stmt.get(userId, loginToken);
}

// ═══════════════════════════════════════════════════════════════
// PAYMENT OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a payment order
 * @param {object} params - Payment data from prePayRet
 * @returns {object} The created payment row
 */
function createPayment(params) {
    const now = Date.now();
    const stmt = db.prepare(`
        INSERT INTO payments (paymentId, orderId, userId, productId, productName, price, currency, status, serverId, roleId, roleName, extra, createdAt)
        VALUES (@paymentId, @orderId, @userId, @productId, @productName, @price, @currency, @status, @serverId, @roleId, @roleName, @extra, @createdAt)
    `);
    stmt.run({
        paymentId: params.paymentId,
        orderId: params.orderId || '',
        userId: params.userId || '',
        productId: params.productId || '',
        productName: params.productName || '',
        price: params.price || 0,
        currency: params.currency || 'USD',
        status: 'pending',
        serverId: params.serverId || '',
        roleId: params.roleId || '',
        roleName: params.roleName || '',
        extra: params.extra || '',
        createdAt: now
    });
    return getPayment(params.paymentId);
}

/**
 * Get payment by paymentId
 * @param {string} paymentId
 * @returns {object|null}
 */
function getPayment(paymentId) {
    const stmt = db.prepare('SELECT * FROM payments WHERE paymentId = ?');
    return stmt.get(paymentId);
}

/**
 * Confirm payment — update status to 'success'
 * @param {string} paymentId
 * @returns {object|null} Updated payment row
 */
function confirmPayment(paymentId) {
    const now = Date.now();
    const stmt = db.prepare(`
        UPDATE payments SET status = 'success', confirmedAt = ? WHERE paymentId = ?
    `);
    stmt.run(now, paymentId);
    return getPayment(paymentId);
}

/**
 * Cancel payment — update status to 'cancelled'
 * @param {string} paymentId
 * @returns {object|null} Updated payment row
 */
function cancelPayment(paymentId) {
    const stmt = db.prepare(`
        UPDATE payments SET status = 'cancelled' WHERE paymentId = ?
    `);
    stmt.run(paymentId);
    return getPayment(paymentId);
}

/**
 * Get payments by userId
 * @param {string} userId
 * @returns {array}
 */
function getPaymentsByUser(userId) {
    const stmt = db.prepare('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC');
    return stmt.all(userId);
}

// ═══════════════════════════════════════════════════════════════
// EVENT OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Record an event (HANYA log ke DB + console, tidak kirim ke external)
 * @param {object} params - { userId, eventType, eventData }
 */
function recordEvent(params) {
    const now = Date.now();
    const stmt = db.prepare(`
        INSERT INTO events (userId, eventType, eventData, createdAt)
        VALUES (@userId, @eventType, @eventData, @createdAt)
    `);
    stmt.run({
        userId: params.userId || '',
        eventType: params.eventType,
        eventData: params.eventData || null,
        createdAt: now
    });

    logger.log('INFO', 'SERVER', `📊 EVENT ▸ ${params.eventType}`, params.eventData || '');
}

module.exports = {
    db,
    // User operations
    createUser,
    getUser,
    updateUserLogin,
    getUserByToken,
    // Session operations
    createSession,
    validateSession,
    // Payment operations
    createPayment,
    getPayment,
    confirmPayment,
    cancelPayment,
    getPaymentsByUser,
    // Event operations
    recordEvent
};
