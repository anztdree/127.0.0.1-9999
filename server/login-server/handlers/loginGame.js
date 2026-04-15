/**
 * Login Server - loginGame Handler (SDK Path)
 * 
 * 100% derived from client code analysis.
 * 
 * TWO login paths in client:
 * 
 * 1. ORIGIN PATH (line 88641-88651):
 *    doOriginLoginRequest() → clientLoginUser() → sends loginGame to login-server
 *    Response → stored in ts.loginInfo.userInfo
 * 
 * 2. SDK PATH (line 88553-88734):
 *    getSdkLoginInfo() → window.getSdkLoginInfo() → {userId, sign, sdk}
 *    sdkLoginSuccess(o) → sets ts.loginInfo.userInfo directly from SDK response
 *    Does NOT send loginGame — SDK server already authenticated
 * 
 * PRIVATE SERVER: SDK PATH
 *    sdk.js injects window.getSdkLoginInfo() → calls sdk-server → returns auth
 *    loginGame handler still exists as fallback AND is used when SDK wraps it
 * 
 * Response fields (SDK-compatible, read by sdkLoginSuccess line 88719-88731):
 *   loginToken  → ts.loginInfo.userInfo.loginToken
 *   userId      → ts.loginInfo.userInfo.userId
 *   nickName    → ts.loginInfo.userInfo.nickName
 *   sdk         → ts.loginInfo.userInfo.channelCode  (MAPPING: sdk → channelCode!)
 *   security    → ts.loginInfo.userInfo.securityCode
 * 
 * AUTO-REGISTER:
 *   Client has NO register action. Only loginGame.
 *   If userId not found, server auto-creates account.
 *   loginSuccessCallBack checks e.newUser for first-time events.
 * 
 * CLIENT REQUEST (line 77304-77314):
 *   { type:"User", action:"loginGame", userId, password, fromChannel,
 *     channelName, headImageUrl, nickName, subChannel, version:"1.0" }
 */

const { success, error, ErrorCode } = require('../../shared/responseHelper');
const { info, warn, error: logError } = require('../../shared/utils/logger');
const UserManager = require('../services/userManager');
const TokenManager = require('../services/tokenManager');
const RateLimiter = require('../middleware/rateLimiter');

/**
 * Handle loginGame action
 * 
 * @param {object} socket - Socket.IO socket
 * @param {object} payload - Client request
 * @param {function} callback - Socket.IO ack callback
 * @param {string} clientIp - Client IP for rate limiting
 */
async function loginGame(socket, payload, callback, clientIp) {
    const {
        userId,
        password,
        fromChannel,
        channelName,
        headImageUrl,
        nickName,
        subChannel,
    } = payload;

    // ============================================
    // Validate required fields (ERROR_LACK_PARAM = 8)
    // ============================================
    if (!userId) {
        return callback(error(ErrorCode.LACK_PARAM));
    }

    // ============================================
    // Rate limiting check
    // ============================================
    if (!RateLimiter.check(clientIp)) {
        warn('loginGame', `Rate limited IP: ${clientIp}`);
        return callback(error(ErrorCode.FORBIDDEN_LOGIN));
    }

    const now = Date.now();

    try {
        // ============================================
        // Check if user exists → auto-register if not
        // ============================================
        let userData = await UserManager.findByUserId(userId);
        let isNewUser = false;

        if (!userData) {
            // AUTO-REGISTER
            // Client has NO register action (confirmed from code analysis)
            isNewUser = true;

            userData = await UserManager.create({
                userId,
                password,
                nickName,
                headImageUrl,
                fromChannel,
                channelName,
                subChannel,
            });
        } else {
            // Existing user — verify password (plaintext comparison)
            if (userData.password !== (password || 'game_origin')) {
                RateLimiter.recordFail(clientIp);
                return callback(error(ErrorCode.LOGIN_CHECK_FAILED));
            }

            // Update last login time
            await UserManager.updateLoginTime(userId);

            // Consume isNew flag
            isNewUser = await UserManager.consumeNewFlag(userId);
        }

        // Reset rate limit on success
        RateLimiter.recordSuccess(clientIp);

        // ============================================
        // Generate & save login token
        // enterGame on main-server validates this against login_tokens DB
        // ============================================
        const loginToken = TokenManager.generate(userId);
        await TokenManager.save(userId, loginToken);

        // ============================================
        // Build SDK-compatible response
        // 
        // Client sdkLoginSuccess (line 88719-88731):
        //   ts.loginInfo.userInfo = {
        //     loginToken: e.loginToken,
        //     userId: e.userId,
        //     nickName: e.nickName,
        //     channelCode: e.sdk,      ← reads "sdk" field!
        //     securityCode: e.security  ← reads "security" field!
        //   }
        // ============================================
        const responseData = {
            loginToken: loginToken,
            userId: userId,
            nickName: userData.nick_name || nickName || userId,
            newUser: isNewUser,
            // CRITICAL FIX: Client reads "sdk" NOT "channelCode"
            // Line 88727: channelCode: e.sdk
            sdk: fromChannel || '',
            // CRITICAL FIX: Client reads "security" for securityCode
            // Line 88728: securityCode: e.security
            security: '',
        };

        info('loginGame', `Login success: ${userId}, newUser=${isNewUser}`);

        if (callback) {
            callback(success(responseData));
        }
    } catch (err) {
        logError('loginGame', `Error: ${err.message}`);
        if (callback) {
            callback(error(ErrorCode.UNKNOWN));
        }
    }
}

module.exports = { loginGame };
