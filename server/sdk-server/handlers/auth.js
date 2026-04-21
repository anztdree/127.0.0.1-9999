/**
 * ============================================================================
 * SDK Server — Auth Handlers (Natural Implementation)
 * ============================================================================
 *
 * Endpoints:
 * POST /api/auth/register — Register new user
 * POST /api/auth/login — Login registered user
 * POST /api/auth/guest — Auto-login / create guest
 * POST /api/auth/logout — Destroy session
 * GET /api/auth/check — Validate session
 *
 * Natural approach:
 * - Clean error handling without exposing internals
 * - Timing-safe password comparison
 * - Proper session management
 *
 * CRITICAL: Response field names MUST match main.min.js expectations:
 * - "userId" — main.min.js line 88556
 * - "sign" — main.min.js line 88557
 * - "sdk" — main.min.js line 88564 (NOT "channelCode")
 * - "loginToken" — main.min.js line 88723 (camelCase)
 * - "nickName" — main.min.js line 88725 (camelCase N)
 * - "security" — main.min.js line 88728
 *
 * ============================================================================
 */

const userManager = require('../services/userManager');
const sessionManager = require('../services/sessionManager');
const cryptoUtil = require('../utils/crypto');
const CONSTANTS = require('../config/constants');
const logger = require('../utils/logger');

// =============================================
// RESPONSE BUILDER
// =============================================

/**
 * Build standard login response with exact field names for main.min.js
 * 
 * @param {Object} user - User object from userManager
 * @param {string} loginToken - Current login token
 * @returns {Object} Login response data
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

/**
 * Send success response
 * 
 * @param {Object} res - Express response
 * @param {Object} data - Response data
 * @param {Object} extra - Extra fields to merge
 */
function sendSuccess(res, data, extra = {}) {
    res.json({
        success: true,
        ...extra,
        data
    });
}

/**
 * Send error response (doesn't reveal internal details)
 * 
 * @param {Object} res - Express response
 * @param {string} message - User-friendly error message
 * @param {number} statusCode - HTTP status code (default 400)
 */
function sendError(res, message, statusCode = 400) {
    res.status(statusCode).json({
        success: false,
        message
    });
}

// =============================================
// POST /api/auth/register
// =============================================

/**
 * Register new user
 * 
 * Flow:
 * 1. Validate input
 * 2. Check username availability
 * 3. Create user
 * 4. Create session
 * 5. Return login response
 */
function register(req, res) {
    const { username, password } = req.body;

    // Validate username
    const usernameValidation = cryptoUtil.validateUsername(username);
    if (!usernameValidation.valid) {
        return sendError(res, usernameValidation.message);
    }

    // Validate password
    const passwordValidation = cryptoUtil.validatePassword(password);
    if (!passwordValidation.valid) {
        return sendError(res, passwordValidation.message);
    }

    // Check if username exists
    if (userManager.usernameExists(usernameValidation.username)) {
        return sendError(res, `Username "${usernameValidation.username}" sudah digunakan`);
    }

    // Create user
    const result = userManager.createRegistered(
        usernameValidation.username,
        password
    );

    if (result.error) {
        return sendError(res, result.error);
    }

    const user = result.user;

    // Create session
    sessionManager.create(user.id, user.lastToken);

    logger.info('Auth', `Registered: ${user.username} (ID: ${user.id})`);

    return sendSuccess(res, buildLoginResponse(user, user.lastToken));
}

// =============================================
// POST /api/auth/login
// =============================================

/**
 * Login registered user
 * 
 * Flow:
 * 1. Validate input
 * 2. Find user by username
 * 3. Verify password (timing-safe)
 * 4. Generate new token
 * 5. Update user
 * 6. Destroy old sessions (prevent orphans)
 * 7. Create new session
 * 8. Return login response
 */
function login(req, res) {
    const { username, password } = req.body;

    // Validate input exists
    if (!username || !password) {
        return sendError(res, 'Username dan password diperlukan');
    }

    // Sanitize and find user
    const sanitizedUsername = cryptoUtil.sanitizeUsername(username);
    if (sanitizedUsername.length < CONSTANTS.USERNAME_MIN_LENGTH) {
        return sendError(res, 'Username minimal ' + CONSTANTS.USERNAME_MIN_LENGTH + ' karakter');
    }

    // Find user
    const found = userManager.findByUsername(sanitizedUsername);
    if (!found) {
        // Don't reveal if username exists - generic error
        return sendError(res, 'Username atau password salah');
    }

    // Verify password (timing-safe)
    if (!cryptoUtil.verifyPassword(password, found.user.salt, found.user.passwordHash)) {
        logger.warn('Auth', `Failed login attempt: ${sanitizedUsername}`);
        return sendError(res, 'Username atau password salah');
    }

    // Generate new token
    const loginToken = cryptoUtil.generateLoginToken();

    // Update user with new token
    const updatedUser = userManager.updateAfterLogin(found.key, loginToken);
    if (!updatedUser) {
        return sendError(res, 'Gagal mengupdate session. Silakan coba lagi.', 500);
    }

    // Clean up old sessions BEFORE creating new one (atomic approach)
    const destroyed = sessionManager.destroyAllByUserId(updatedUser.id);
    if (destroyed > 0) {
        logger.info('Auth', `Cleaned ${destroyed} old sessions for ${updatedUser.username}`);
    }

    // Create new session
    sessionManager.create(updatedUser.id, loginToken);

    logger.info('Auth', `Login: ${updatedUser.username} (ID: ${updatedUser.id})`);

    return sendSuccess(res, buildLoginResponse(updatedUser, loginToken));
}

// =============================================
// POST /api/auth/guest
// =============================================

/**
 * Guest login - auto create or return existing
 * 
 * Flow:
 * 1. Validate deviceId
 * 2. Check if device already has guest account
 * 3a. If exists: update token, clean old sessions
 * 3b. If not: create new guest user
 * 4. Create session
 * 5. Return login response with returning flag
 */
function guest(req, res) {
    const { deviceId } = req.body;

    // Validate deviceId
    if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 3) {
        return sendError(res, 'Device ID diperlukan (minimal 3 karakter)');
    }

    // Sanitize deviceId
    const sanitizedDeviceId = deviceId.trim().substring(0, 64);

    // Check if device already has guest account
    const existing = userManager.findByDeviceId(sanitizedDeviceId);

    if (existing) {
        // Returning guest - generate new token
        const loginToken = cryptoUtil.generateLoginToken();
        const updatedUser = userManager.updateAfterLogin(existing.key, loginToken);

        if (!updatedUser) {
            return sendError(res, 'Gagal mengupdate session. Silakan coba lagi.', 500);
        }

        // Clean old sessions
        sessionManager.destroyAllByUserId(updatedUser.id);

        // Create new session
        sessionManager.create(updatedUser.id, loginToken);

        logger.info('Auth', `Guest returning: ${updatedUser.username} (ID: ${updatedUser.id})`);

        return sendSuccess(res, buildLoginResponse(updatedUser, loginToken), {
            returning: true
        });
    }

    // New guest user
    const user = userManager.createGuest(sanitizedDeviceId);
    if (!user) {
        return sendError(res, 'Gagal membuat guest account. Silakan coba lagi.', 500);
    }

    // Create session
    sessionManager.create(user.user.id, user.user.lastToken);

    logger.info('Auth', `Guest created: ${user.user.username} (ID: ${user.user.id})`);

    return sendSuccess(res, buildLoginResponse(user.user, user.user.lastToken), {
        returning: false
    });
}

// =============================================
// POST /api/auth/logout
// =============================================

/**
 * Logout user
 * 
 * Flow:
 * 1. Extract loginToken from body
 * 2. Destroy session
 * 3. Return success (always, even if session didn't exist)
 */
function logout(req, res) {
    const { loginToken } = req.body;

    if (loginToken) {
        const destroyed = sessionManager.destroy(loginToken);
        if (destroyed) {
            logger.info('Auth', `Logout: ${loginToken.substring(0, 16)}...`);
        }
    }

    // Always return success (idempotent)
    return res.json({
        success: true,
        message: 'Logout berhasil'
    });
}

// =============================================
// GET /api/auth/check
// =============================================

/**
 * Check if session is valid
 * 
 * Flow:
 * 1. Extract userId and loginToken from query
 * 2. Validate session
 * 3. Return status
 */
function check(req, res) {
    const { userId, loginToken } = req.query;

    // Validate parameters
    if (!userId || !loginToken) {
        return res.json({
            success: false,
            valid: false,
            message: 'userId dan loginToken diperlukan'
        });
    }

    // Validate session
    const valid = sessionManager.validate(userId, loginToken);

    if (valid) {
        return res.json({
            success: true,
            valid: true,
            message: 'Session valid'
        });
    }

    // Get session to determine if expired or just invalid
    const session = sessionManager.get(loginToken);

    return res.json({
        success: true,
        valid: false,
        expired: session ? Date.now() > session.expiresAt : true,
        message: session ? 'Session expired' : 'Session tidak valid'
    });
}

// =============================================
// POST /api/auth/refresh
// =============================================

/**
 * Refresh session (extend expiration)
 * 
 * Flow:
 * 1. Validate session
 * 2. Extend session
 * 3. Return success
 */
function refresh(req, res) {
    const { userId, loginToken } = req.body;

    if (!userId || !loginToken) {
        return sendError(res, 'userId dan loginToken diperlukan');
    }

    // Validate first
    if (!sessionManager.validate(userId, loginToken)) {
        return sendError(res, 'Session tidak valid atau expired', 401);
    }

    // Extend session
    const extended = sessionManager.extend(loginToken);
    if (!extended) {
        return sendError(res, 'Gagal memperbarui session', 500);
    }

    logger.info('Auth', `Session refreshed: ${userId}`);

    return res.json({
        success: true,
        message: 'Session diperbarui'
    });
}

// =============================================
// POST /api/auth/convert-guest
// =============================================

/**
 * Convert guest account to registered account
 * 
 * Flow:
 * 1. Validate session (must be guest)
 * 2. Validate new username/password
 * 3. Convert account
 * 4. Update session
 * 5. Return login response
 */
function convertGuest(req, res) {
    const { userId, loginToken, username, password } = req.body;

    // Validate session first
    if (!userId || !loginToken) {
        return sendError(res, 'userId dan loginToken diperlukan');
    }

    if (!sessionManager.validate(userId, loginToken)) {
        return sendError(res, 'Session tidak valid', 401);
    }

    // Find user
    const userData = userManager.findById(userId);
    if (!userData) {
        return sendError(res, 'User tidak ditemukan', 404);
    }

    if (!userData.user.isGuest) {
        return sendError(res, 'Akun sudah terdaftar');
    }

    // Validate new credentials
    const usernameValidation = cryptoUtil.validateUsername(username);
    if (!usernameValidation.valid) {
        return sendError(res, usernameValidation.message);
    }

    const passwordValidation = cryptoUtil.validatePassword(password);
    if (!passwordValidation.valid) {
        return sendError(res, passwordValidation.message);
    }

    // Convert
    const result = userManager.convertGuestToRegistered(
        userData.key,
        usernameValidation.username,
        password
    );

    if (result.error) {
        return sendError(res, result.error);
    }

    // Update session with new token
    const newToken = cryptoUtil.generateLoginToken();
    sessionManager.destroy(loginToken);
    sessionManager.create(userId, newToken);

    logger.info('Auth', `Guest converted: ${usernameValidation.username} (ID: ${userId})`);

    return sendSuccess(res, buildLoginResponse(result.user, newToken));
}

// =============================================
// EXPORT
// =============================================

module.exports = {
    register,
    login,
    guest,
    logout,
    check,
    refresh,
    convertGuest
};