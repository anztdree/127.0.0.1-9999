/**
 * Login Server — saveHistory Handler
 *
 * Client request (main.min.js line 88590-88598 startBtnTap):
 *   {
 *     type: "User",
 *     action: "SaveHistory",
 *     accountToken: ts.loginInfo.userInfo.userId,
 *     channelCode: ts.loginInfo.userInfo.channelCode,
 *     serverId: ts.loginInfo.serverItem.serverId,
 *     securityCode: ts.loginInfo.userInfo.securityCode,
 *     subChannel: string,
 *     version: "1.0"
 *   }
 *
 * Client response handler (line 88605-88611):
 *   e.loginToken → REFRESHES ts.loginInfo.userInfo.loginToken (critical!)
 *   e.todayLoginCount → triggers analytics at count 4 and 6
 *   Then: ts.reportLogToPP("disConnectLoginSocket") + ts.clientStartGame(false)
 *
 * After success: client disconnects login socket, connects to main server.
 * Token MUST be saved to login_tokens DB — main-server enterGame validates it.
 */

var { success, error, ErrorCode } = require('../utils/responseHelper');
var logger = require('../utils/logger');
var TokenManager = require('../services/tokenManager');

var _loginCounts = {}; // "userId_YYYY-MM-DD" → count

async function saveHistory(payload, callback) {
    var accountToken = payload.accountToken;
    var serverId = payload.serverId;

    if (!accountToken) {
        return callback(error(ErrorCode.LACK_PARAM));
    }

    var userId = accountToken;
    var serverIdNum = parseInt(serverId) || 1;

    logger.info('saveHistory', 'userId=' + userId + ', serverId=' + serverIdNum);

    try {
        // Generate fresh loginToken — main-server enterGame will validate this
        var newToken = TokenManager.generate(userId);
        await TokenManager.save(userId, newToken, serverIdNum);

        // Track daily login count
        var today = new Date().toISOString().slice(0, 10);
        var countKey = userId + '_' + today;
        _loginCounts[countKey] = (_loginCounts[countKey] || 0) + 1;

        var responseData = {
            loginToken: newToken,
            todayLoginCount: _loginCounts[countKey],
        };

        logger.info('saveHistory', 'Token refreshed for ' + userId + ', dailyCount=' + _loginCounts[countKey]);
        if (callback) callback(success(responseData));

    } catch (err) {
        logger.error('saveHistory', 'Error: ' + err.message);
        if (callback) callback(error(ErrorCode.UNKNOWN));
    }
}

module.exports = { saveHistory };
