/**
 * ============================================================================
 *  Auth Handlers — Login, Register, Guest, Logout, Check
 *  ============================================================================
 *
 *  Endpoints:
 *    POST /api/auth/register  — Registrasi user baru
 *    POST /api/auth/login     — Login user terdaftar
 *    POST /api/auth/guest     — Auto-login / buat guest user
 *    POST /api/auth/logout    — Hapus session
 *    GET  /api/auth/check     — Validasi session
 *
 *  Response format (untuk login/register/guest):
 *    {
 *      "success": true,
 *      "data": {
 *        "userId": "1",
 *        "sign": "869ade36f9de1b26...",
 *        "sdk": "ppgame",
 *        "loginToken": "mnvwij4q_7b367e2d...",
 *        "nickName": "GUEST_1",
 *        "security": "4929977724e50a71..."
 *      }
 *    }
 *
 *  Flow:
 *    1. sdk.js UI → POST /api/auth/login (or /register or /guest)
 *    2. sdk-server return { userId, sign, sdk, loginToken, nickName, security }
 *    3. sdk.js redirect: ?sdk=ppgame&logintoken=X&nickname=X&userid=X&sign=X&security=X
 *    4. index.html getSdkLoginInfo() baca URL params
 *    5. main.min.js sdkLoginSuccess(o):
 *       - ts.loginUserInfo = { userId, sign, sdk, serverId, serverName }
 *       - ts.loginInfo.userInfo = { loginToken, userId, nickName, channelCode: o.sdk, securityCode: o.security }
 *       - ts.clientRequestServerList(userId, sdk, callback)
 *
 *  CRITICAL: Response field names HARUS exact match:
 *    - "sdk" (bukan "channelCode") — karena main.min.js line 88564: o.sdk
 *    - "loginToken" (camelCase) — karena main.min.js line 88723: e.loginToken
 *    - "nickName" (camelCase N) — karena main.min.js line 88725: e.nickName
 *    - "sign" — karena main.min.js line 88557: o.sign
 *    - "security" — karena main.min.js line 88728: e.security
 *    - "userId" — karena main.min.js line 88556: o.userId
 *
 * ============================================================================
 */

var userManager = require('../services/userManager');
var sessionManager = require('../services/sessionManager');
var cryptoUtil = require('../utils/crypto');
var CONSTANTS = require('../config/constants');

// =============================================
// HELPER: Build Login Response Data
// =============================================

/**
 * Build standard login response data object.
 * Field names HARUS exact match dengan main.min.js expectations.
 *
 * @param {Object} user - User object dari userManager
 * @param {string} loginToken - Login token
 * @returns {{ userId: string, sign: string, sdk: string, loginToken: string, nickName: string, security: string }}
 */
function buildLoginResponse(user, loginToken) {
    return {
        userId: user.id,
        sign: user.sign,
        sdk: user.sdk || CONSTANTS.DEFAULT_SDK_CHANNEL,
        loginToken: loginToken,
        nickName: user.nickname || user.username,
        security: user.security
    };
}

// =============================================
// POST /api/auth/register
// =============================================

/**
 * Handler: Registrasi user baru.
 *
 * Request: { username: string, password: string }
 * Response: { success: true, data: { userId, sign, sdk, loginToken, nickName, security } }
 *           { success: false, message: string }
 */
function register(req, res) {
    var username = cryptoUtil.sanitizeUsername(req.body.username);
    var password = req.body.password;

    // Validasi username
    if (!username || username.length < CONSTANTS.USERNAME_MIN_LENGTH) {
        return res.json({
            success: false,
            message: 'Username minimal ' + CONSTANTS.USERNAME_MIN_LENGTH + ' karakter (huruf, angka, underscore)'
        });
    }

    if (username.length > CONSTANTS.USERNAME_MAX_LENGTH) {
        return res.json({
            success: false,
            message: 'Username maksimal ' + CONSTANTS.USERNAME_MAX_LENGTH + ' karakter'
        });
    }

    if (!CONSTANTS.USERNAME_PATTERN.test(username)) {
        return res.json({
            success: false,
            message: 'Username hanya boleh huruf, angka, dan underscore'
        });
    }

    // Validasi password
    if (!password || password.length < CONSTANTS.PASSWORD_MIN_LENGTH) {
        return res.json({
            success: false,
            message: 'Password minimal ' + CONSTANTS.PASSWORD_MIN_LENGTH + ' karakter'
        });
    }

    if (password.length > CONSTANTS.PASSWORD_MAX_LENGTH) {
        return res.json({
            success: false,
            message: 'Password maksimal ' + CONSTANTS.PASSWORD_MAX_LENGTH + ' karakter'
        });
    }

    // Cek username sudah ada
    var existing = userManager.findByUsername(username);
    if (existing) {
        return res.json({
            success: false,
            message: 'Username "' + username + '" sudah digunakan, pilih username lain'
        });
    }

    // Buat user baru
    var result = userManager.createRegistered(username, password);

    if (result.error) {
        return res.json({ success: false, message: result.error });
    }

    var user = result.user;

    // Buat session
    sessionManager.create(user.id, user.lastToken);

    console.log('[Auth] User registered: ' + username + ' (ID: ' + user.id + ')');

    // Return login response
    return res.json({
        success: true,
        data: buildLoginResponse(user, user.lastToken)
    });
}

// =============================================
// POST /api/auth/login
// =============================================

/**
 * Handler: Login user terdaftar.
 *
 * Request: { username: string, password: string }
 * Response: { success: true, data: { userId, sign, sdk, loginToken, nickName, security } }
 *           { success: false, message: string }
 */
function login(req, res) {
    var username = cryptoUtil.sanitizeUsername(req.body.username);
    var password = req.body.password;

    // Validasi input
    if (!username || username.length < CONSTANTS.USERNAME_MIN_LENGTH) {
        return res.json({
            success: false,
            message: 'Username minimal ' + CONSTANTS.USERNAME_MIN_LENGTH + ' karakter'
        });
    }

    if (!password) {
        return res.json({
            success: false,
            message: 'Password diperlukan'
        });
    }

    // Cari user
    var found = userManager.findByUsername(username);
    if (!found) {
        return res.json({
            success: false,
            message: 'Username "' + username + '" tidak ditemukan'
        });
    }

    var user = found.user;

    // Verifikasi password (timing-safe)
    var passwordMatch = false;
    try {
        passwordMatch = cryptoUtil.verifyPassword(password, user.salt, user.passwordHash);
    } catch (e) {
        // Fallback ke plain comparison jika timingSafeEqual gagal (invalid hash length)
        passwordMatch = cryptoUtil.hashPassword(password, user.salt) === user.passwordHash;
    }

    if (!passwordMatch) {
        console.log('[Auth] Failed login attempt: ' + username);
        return res.json({
            success: false,
            message: 'Password salah'
        });
    }

    // Generate token baru dan update user
    var loginToken = cryptoUtil.generateLoginToken();
    var updatedUser = userManager.updateAfterLogin(found.key, loginToken);

    if (!updatedUser) {
        return res.json({
            success: false,
            message: 'Gagal menyimpan data login (storage error)'
        });
    }

    // Buat session baru (token lama auto-invalidated karena kita generate baru)
    sessionManager.create(updatedUser.id, loginToken);

    console.log('[Auth] User logged in: ' + username + ' (ID: ' + updatedUser.id + ')');

    return res.json({
        success: true,
        data: buildLoginResponse(updatedUser, loginToken)
    });
}

// =============================================
// POST /api/auth/guest
// =============================================

/**
 * Handler: Auto-login atau buat guest user.
 *
 * Logic:
 *   1. Terima deviceId dari client (sdk.js generate unique ID)
 *   2. Cek apakah user dengan deviceId ini sudah ada
 *   3. Jika ada → generate token baru, update login data, return session
 *   4. Jika tidak → buat guest user baru, return session
 *
 * Request: { deviceId: string }
 * Response: { success: true, data: { userId, sign, sdk, loginToken, nickName, security } }
 *           { success: false, message: string }
 *
 * Contoh dari existing data:
 *   deviceId: "GUEST-mnvwiiyf-h06mq1ii-1-33d1dc70"
 *   username: "GUEST_1"
 *   key: "guest_guest-mnvwiiyf-h06mq1ii-1-33d1dc70"
 */
function guest(req, res) {
    var deviceId = req.body.deviceId;

    if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 3) {
        return res.json({
            success: false,
            message: 'Device ID diperlukan'
        });
    }

    // Cek user dengan deviceId ini sudah ada
    var existing = userManager.findByDeviceId(deviceId);

    if (existing) {
        // User sudah ada → generate token baru
        var loginToken = cryptoUtil.generateLoginToken();
        var updatedUser = userManager.updateAfterLogin(existing.key, loginToken);

        if (!updatedUser) {
            return res.json({
                success: false,
                message: 'Gagal update data login (storage error)'
            });
        }

        // Buat session baru
        sessionManager.create(updatedUser.id, loginToken);

        console.log('[Auth] Guest returning: ' + updatedUser.username + ' (ID: ' + updatedUser.id + ')');

        return res.json({
            success: true,
            data: buildLoginResponse(updatedUser, loginToken),
            returning: true
        });
    }

    // User belum ada → buat guest baru
    var result = userManager.createGuest(deviceId);

    if (!result) {
        return res.json({
            success: false,
            message: 'Gagal membuat guest user (storage error)'
        });
    }

    var user = result.user;

    // Buat session
    sessionManager.create(user.id, user.lastToken);

    console.log('[Auth] Guest created: ' + user.username + ' (ID: ' + user.id + ', deviceId: ' + deviceId + ')');

    return res.json({
        success: true,
        data: buildLoginResponse(user, user.lastToken),
        returning: false
    });
}

// =============================================
// POST /api/auth/logout
// =============================================

/**
 * Handler: Logout — hapus session.
 *
 * Request: { loginToken: string }
 * Response: { success: true }
 */
function logout(req, res) {
    var loginToken = req.body.loginToken;

    if (loginToken) {
        sessionManager.destroy(loginToken);
        console.log('[Auth] User logged out (token: ' + loginToken.substring(0, 16) + '...)');
    }

    return res.json({ success: true });
}

// =============================================
// GET /api/auth/check
// =============================================

/**
 * Handler: Validasi apakah session masih aktif.
 *
 * Query: ?userId=xxx&loginToken=xxx
 * Response: { success: true, valid: boolean }
 *           { success: false, message: string }
 */
function check(req, res) {
    var userId = req.query.userId;
    var loginToken = req.query.loginToken;

    if (!userId || !loginToken) {
        return res.json({
            success: false,
            message: 'userId dan loginToken diperlukan'
        });
    }

    var valid = sessionManager.validate(userId, loginToken);

    return res.json({
        success: true,
        valid: valid
    });
}

module.exports = {
    register: register,
    login: login,
    guest: guest,
    logout: logout,
    check: check
};
