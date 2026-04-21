/**
 * ============================================================================
 *  SDK Server v3 — User Manager
 *  ============================================================================
 *
 *  CRUD for user data in data/users.json.
 *  Independent — NO dependency on shared/ folder.
 *
 *  Data format:
 *  {
 *    "users": {
 *      "guest_guest-{deviceId}": { id, username, passwordHash, salt, nickname, ... },
 *      "zplayer1": { id, username, passwordHash, salt, nickname, ... }
 *    },
 *    "nextId": 16
 *  }
 *
 *  Key scheme:
 *    Guest:      "guest_" + deviceId.toLowerCase()
 *    Registered: username.toLowerCase()
 *
 * ============================================================================
 */

var store = require('../storage/jsonStore');
var CONSTANTS = require('../config/constants');
var cryptoUtil = require('../utils/crypto');
var logger = require('../utils/logger');

var USERS_FILE = store.buildPath('users.json');

// =============================================
// DATA ACCESS
// =============================================

function loadUsers() {
    return store.load(USERS_FILE, { users: {}, nextId: 1 });
}

function saveUsers(data) {
    return store.save(USERS_FILE, data);
}

// =============================================
// FIND
// =============================================

/**
 * Find user by userId (numeric string). Linear scan.
 * @returns {{ key, user, data } | null}
 */
function findById(userId) {
    var data = loadUsers();
    var keys = Object.keys(data.users);
    var target = String(userId);

    for (var i = 0; i < keys.length; i++) {
        if (data.users[keys[i]].id === target) {
            return { key: keys[i], user: data.users[keys[i]], data: data };
        }
    }
    return null;
}

/**
 * Find user by deviceId.
 * @returns {{ key, user, data } | null}
 */
function findByDeviceId(deviceId) {
    var data = loadUsers();
    var keys = Object.keys(data.users);

    for (var i = 0; i < keys.length; i++) {
        if (data.users[keys[i]].deviceId === deviceId) {
            return { key: keys[i], user: data.users[keys[i]], data: data };
        }
    }
    return null;
}

/**
 * Find user by username (case-insensitive).
 * @returns {{ key, user, data } | null}
 */
function findByUsername(username) {
    var data = loadUsers();
    var key = username.toLowerCase();

    if (data.users[key]) {
        return { key: key, user: data.users[key], data: data };
    }
    return null;
}

/**
 * Find ALL sessions for a userId (user may have multiple old tokens).
 * Returns array of keys in sessions data.
 */
function findSessionsByUserId(userId) {
    var data = loadUsers();
    var target = String(userId);
    var tokens = [];
    var keys = Object.keys(data.users);

    for (var i = 0; i < keys.length; i++) {
        if (data.users[keys[i]].id === target && data.users[keys[i]].lastToken) {
            tokens.push(data.users[keys[i]].lastToken);
        }
    }
    return tokens;
}

// =============================================
// CREATE
// =============================================

function generateId(data) {
    var id = data.nextId || 1;
    data.nextId = id + 1;
    return String(id);
}

/**
 * Create guest user.
 * @param {string} deviceId - from sdk.js generateGuestDeviceId()
 * @returns {{ key, user } | null}
 */
function createGuest(deviceId) {
    var data = loadUsers();
    var userId = generateId(data);
    var username = 'GUEST_' + userId;
    var key = 'guest_' + deviceId.toLowerCase();

    // Already exists?
    if (data.users[key]) {
        return null;
    }

    var salt = cryptoUtil.generateSalt();
    var randomPw = cryptoUtil.generateLoginToken(); // random, guest never uses it
    var loginToken = cryptoUtil.generateLoginToken();
    var sign = cryptoUtil.generateSign(userId, loginToken);
    var security = cryptoUtil.generateSecurity();
    var now = new Date().toISOString();

    var user = {
        id: userId,
        username: username,
        passwordHash: cryptoUtil.hashPassword(randomPw, salt),
        salt: salt,
        nickname: username,
        sdk: CONSTANTS.DEFAULT_SDK_CHANNEL,
        deviceId: deviceId,
        isGuest: true,
        appId: CONSTANTS.DEFAULT_APP_ID,
        createdAt: now,
        lastLogin: now,
        lastToken: loginToken,
        sign: sign,
        security: security
    };

    data.users[key] = user;

    if (!saveUsers(data)) return null;

    logger.info('UserManager', 'Created guest: ' + username + ' (ID: ' + userId + ')');
    return { key: key, user: user };
}

/**
 * Create registered user.
 * @returns {{ key, user } | { error: string }}
 */
function createRegistered(username, password) {
    var data = loadUsers();
    var userKey = username.toLowerCase();

    if (data.users[userKey]) {
        return { error: 'Username "' + username + '" sudah digunakan' };
    }

    var userId = generateId(data);
    var salt = cryptoUtil.generateSalt();
    var loginToken = cryptoUtil.generateLoginToken();
    var sign = cryptoUtil.generateSign(userId, loginToken);
    var security = cryptoUtil.generateSecurity();
    var now = new Date().toISOString();

    var user = {
        id: userId,
        username: username,
        passwordHash: cryptoUtil.hashPassword(password, salt),
        salt: salt,
        nickname: username,
        sdk: CONSTANTS.DEFAULT_SDK_CHANNEL,
        isGuest: false,
        appId: CONSTANTS.DEFAULT_APP_ID,
        createdAt: now,
        lastLogin: now,
        lastToken: loginToken,
        sign: sign,
        security: security
    };

    data.users[userKey] = user;

    if (!saveUsers(data)) {
        return { error: 'Storage error — gagal menyimpan user' };
    }

    logger.info('UserManager', 'Registered: ' + username + ' (ID: ' + userId + ')');
    return { key: userKey, user: user };
}

// =============================================
// UPDATE
// =============================================

/**
 * Update user after successful login.
 * Refreshes: lastLogin, lastToken, sign, security.
 * @returns {Object|null} Updated user object
 */
function updateAfterLogin(userKey, loginToken) {
    var data = loadUsers();
    var user = data.users[userKey];
    if (!user) return null;

    user.lastLogin = new Date().toISOString();
    user.lastToken = loginToken;
    user.sign = cryptoUtil.generateSign(user.id, loginToken);
    user.security = cryptoUtil.generateSecurity();

    if (!saveUsers(data)) return null;

    return user;
}

/**
 * Update nickname.
 */
function updateNickname(userKey, nickname) {
    var data = loadUsers();
    if (!data.users[userKey]) return false;
    data.users[userKey].nickname = nickname;
    return saveUsers(data);
}

// =============================================
// LIST / DETAIL
// =============================================

/**
 * List users with optional search filter.
 */
function listUsers(search, limit) {
    var data = loadUsers();
    limit = limit || 100;
    search = (search || '').toLowerCase();
    var result = [];
    var keys = Object.keys(data.users);

    for (var i = 0; i < keys.length && result.length < limit; i++) {
        var u = data.users[keys[i]];
        if (search && keys[i].indexOf(search) === -1 &&
            (u.nickname || '').toLowerCase().indexOf(search) === -1) {
            continue;
        }
        result.push({
            id: u.id,
            username: u.username,
            nickname: u.nickname || u.username,
            sdk: u.sdk || CONSTANTS.DEFAULT_SDK_CHANNEL,
            isGuest: !!u.isGuest,
            appId: u.appId || CONSTANTS.DEFAULT_APP_ID,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin
        });
    }

    return { users: result, count: result.length, total: keys.length };
}

/**
 * Get user detail (no passwordHash/salt).
 */
function getUserDetail(userId) {
    var found = findById(userId);
    if (!found) return null;

    var u = found.user;
    return {
        id: u.id,
        username: u.username,
        nickname: u.nickname || u.username,
        sdk: u.sdk || CONSTANTS.DEFAULT_SDK_CHANNEL,
        isGuest: !!u.isGuest,
        appId: u.appId || CONSTANTS.DEFAULT_APP_ID,
        deviceId: u.deviceId || null,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
        lastToken: u.lastToken ? u.lastToken.substring(0, 16) + '...' : null
    };
}

function getUserCount() {
    return Object.keys(loadUsers().users).length;
}

module.exports = {
    findById: findById,
    findByDeviceId: findByDeviceId,
    findByUsername: findByUsername,
    findSessionsByUserId: findSessionsByUserId,
    createGuest: createGuest,
    createRegistered: createRegistered,
    updateAfterLogin: updateAfterLogin,
    updateNickname: updateNickname,
    listUsers: listUsers,
    getUserDetail: getUserDetail,
    getUserCount: getUserCount
};
