/**
 * Login Server — loginGame Handler
 *
 * Client request (main.min.js line 77304-77314):
 *   { type:"User", action:"loginGame", userId, password, fromChannel,
 *     channelName, headImageUrl, nickName, subChannel, version:"1.0" }
 *
 * TWO paths in client:
 *   1. ORIGIN PATH — doOriginLoginRequest() → sends loginGame → response stored in ts.loginInfo.userInfo
 *   2. SDK PATH — getSdkLoginInfo() → sets userInfo directly (our private server uses this)
 *
 * loginGame still exists as fallback AND is used when main.min.js calls it.
 *
 * AUTO-REGISTER: Client has NO register action. If userId not found, auto-create.
 *
 * Response fields (read by sdkLoginSuccess line 88719-88731):
 *   loginToken  → ts.loginInfo.userInfo.loginToken
 *   userId      → ts.loginInfo.userInfo.userId
 *   nickName    → ts.loginInfo.userInfo.nickName
 *   sdk         → ts.loginInfo.userInfo.channelCode  (MAPPING!)
 *   security    → ts.loginInfo.userInfo.securityCode
 *   newUser     → loginSuccessCallBack checks e.newUser (line 77433)
 */

var { success, error, ErrorCode } = require('../utils/responseHelper');
var logger = require('../utils/logger');
var UserManager = require('../services/userManager');
var TokenManager = require('../services/tokenManager');
var RateLimiter = require('../middleware/rateLimiter');
var CONSTANTS = require('../config/constants');

async function loginGame(socket, payload, callback, clientIp) {
    var userId = payload.userId;
    var password = payload.password;
    var fromChannel = payload.fromChannel;
    var nickName = payload.nickName;
    var headImageUrl = payload.headImageUrl;
    var channelName = payload.channelName;
    var subChannel = payload.subChannel;

    // Validate
    if (!userId) {
        return callback(error(ErrorCode.LACK_PARAM));
    }

    // Rate limit
    if (!RateLimiter.check(clientIp)) {
        logger.warn('loginGame', 'Rate limited: ' + clientIp);
        return callback(error(ErrorCode.FORBIDDEN_LOGIN));
    }

    try {
        var userData = await UserManager.findByUserId(userId);
        var isNewUser = false;

        if (!userData) {
            // AUTO-REGISTER
            isNewUser = true;
            userData = await UserManager.create({
                userId: userId,
                password: password,
                nickName: nickName,
                headImageUrl: headImageUrl,
                fromChannel: fromChannel,
                channelName: channelName,
                subChannel: subChannel,
            });
        } else {
            // Existing user — verify password (plaintext)
            if (userData.password !== (password || CONSTANTS.DEFAULT_PASSWORD)) {
                RateLimiter.recordFail(clientIp);
                return callback(error(ErrorCode.LOGIN_CHECK_FAILED));
            }
            await UserManager.updateLoginTime(userId);
            isNewUser = await UserManager.consumeNewFlag(userId);
        }

        RateLimiter.recordSuccess(clientIp);

        // Generate loginToken
        var loginToken = TokenManager.generate(userId);
        await TokenManager.save(userId, loginToken);

        // Build response — client reads "sdk" field for channelCode, "security" for securityCode
        var responseData = {
            loginToken: loginToken,
            userId: userId,
            nickName: userData.nick_name || nickName || userId,
            newUser: isNewUser,
            sdk: fromChannel || CONSTANTS.DEFAULT_SDK_CHANNEL,
            security: '',
        };

        logger.info('loginGame', 'Login OK: ' + userId + ', newUser=' + isNewUser);
        if (callback) callback(success(responseData));

    } catch (err) {
        logger.error('loginGame', 'Error: ' + err.message);
        if (callback) callback(error(ErrorCode.UNKNOWN));
    }
}

module.exports = { loginGame };
