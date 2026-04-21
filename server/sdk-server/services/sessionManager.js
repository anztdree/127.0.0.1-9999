/**
 * ============================================================================
 *  SDK Server v3 — Session Manager
 *  ============================================================================
 *
 *  Session CRUD in data/sessions.json.
 *  Key = loginToken, Value = { userId, createdAt, expiresAt }.
 *
 *  CRITICAL FIX (v3): On re-login, DESTROY old session first.
 *  Previous versions left orphan sessions in sessions.json.
 *
 * ============================================================================
 */

var store = require('../storage/jsonStore');
var CONSTANTS = require('../config/constants');
var logger = require('../utils/logger');

var SESSIONS_FILE = store.buildPath('sessions.json');

// =============================================
// DATA ACCESS
// =============================================

function loadSessions() {
    return store.load(SESSIONS_FILE, { sessions: {} });
}

function saveSessions(data) {
    return store.save(SESSIONS_FILE, data);
}

// =============================================
// OPERATIONS
// =============================================

/**
 * Create session.
 */
function create(userId, loginToken) {
    var data = loadSessions();

    data.sessions[loginToken] = {
        userId: String(userId),
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + CONSTANTS.SESSION_DURATION_MS
    };

    return saveSessions(data);
}

/**
 * Validate session — checks token, userId match, and expiry.
 * If expired → auto-delete.
 */
function validate(userId, loginToken) {
    var data = loadSessions();
    var session = data.sessions[loginToken];

    if (!session) return false;
    if (session.userId !== String(userId)) return false;

    // Expired → cleanup
    if (Date.now() > session.expiresAt) {
        delete data.sessions[loginToken];
        saveSessions(data);
        return false;
    }

    return true;
}

/**
 * Destroy session by token.
 */
function destroy(loginToken) {
    var data = loadSessions();
    if (data.sessions[loginToken]) {
        delete data.sessions[loginToken];
        return saveSessions(data);
    }
    return true;
}

/**
 * Destroy ALL sessions for a userId.
 * Called during re-login to prevent orphan sessions.
 * @returns {number} Sessions destroyed
 */
function destroyAllByUserId(userId) {
    var data = loadSessions();
    var target = String(userId);
    var keys = Object.keys(data.sessions);
    var destroyed = 0;

    for (var i = 0; i < keys.length; i++) {
        if (data.sessions[keys[i]].userId === target) {
            delete data.sessions[keys[i]];
            destroyed++;
        }
    }

    if (destroyed > 0) {
        saveSessions(data);
    }

    return destroyed;
}

/**
 * Get session (no validation).
 */
function get(loginToken) {
    var data = loadSessions();
    return data.sessions[loginToken] || null;
}

// =============================================
// CLEANUP
// =============================================

/**
 * Remove expired sessions. Called periodically.
 * @returns {number} Removed count
 */
function cleanupExpired() {
    var data = loadSessions();
    var keys = Object.keys(data.sessions);
    var now = Date.now();
    var removed = 0;

    for (var i = 0; i < keys.length; i++) {
        if (now > data.sessions[keys[i]].expiresAt) {
            delete data.sessions[keys[i]];
            removed++;
        }
    }

    if (removed > 0) {
        saveSessions(data);
        logger.info('Session', 'Cleaned ' + removed + ' expired sessions');
    }

    return removed;
}

/**
 * Start periodic cleanup interval.
 */
function startCleanupInterval() {
    return setInterval(function () {
        cleanupExpired();
    }, CONSTANTS.SESSION_CLEANUP_INTERVAL_MS);
}

/**
 * Get active session count.
 */
function getActiveCount() {
    return Object.keys(loadSessions().sessions).length;
}

module.exports = {
    create: create,
    validate: validate,
    destroy: destroy,
    destroyAllByUserId: destroyAllByUserId,
    get: get,
    cleanupExpired: cleanupExpired,
    startCleanupInterval: startCleanupInterval,
    getActiveCount: getActiveCount
};
