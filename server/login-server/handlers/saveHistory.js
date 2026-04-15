/**
 * Login Server - SaveHistory Handler
 * 
 * 100% derived from client code analysis.
 * 
 * CLIENT REQUEST (line 88590-88598 startBtnTap):
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
 * CLIENT RESPONSE HANDLER (line 88605-88611):
 *   var o = function(e) {
 *     e && e.loginToken && (ts.loginInfo.userInfo.loginToken = e.loginToken),
 *     ts.reportLogToPP("disConnectLoginSocket", null),
 *     ts.clientStartGame(!1);
 *     var t = e.todayLoginCount;
 *     4 === t && ToolCommon.ReportToSdkCommon(ReportDataType.blackStoneLoginCount4),
 *     6 === t && ToolCommon.ReportToSdkCommon(ReportDataType.blackStoneLoginCount6)
 *   };
 * 
 * RESPONSE MUST include:
 *   - loginToken: REFRESHES ts.loginInfo.userInfo.loginToken (critical!)
 *   - todayLoginCount: number, triggers analytics at count 4 and 6
 * 
 * After success: client disconnects login socket, connects to main server
 * 
 * FIX: loginToken refresh MUST be saved to login_tokens DB,
 *      otherwise main-server enterGame will reject the new token.
 */

const { success, error, ErrorCode } = require('../../shared/responseHelper');
const { info, warn, error: logError } = require('../../shared/utils/logger');
const TokenManager = require('../services/tokenManager');

// In-memory login count tracker (per user per day)
// Format: "userId_YYYY-MM-DD" → count
const _loginCounts = {};

/**
 * Handle SaveHistory action
 * 
 * @param {object} payload - Client request
 * @param {function} callback - Socket.IO ack callback
 */
async function saveHistory(payload, callback) {
    const { accountToken, channelCode, serverId, securityCode, subChannel } = payload;

    // Validate required fields (ERROR_LACK_PARAM = 8)
    if (!accountToken) {
        return callback(error(ErrorCode.LACK_PARAM));
    }

    // accountToken = ts.loginInfo.userInfo.userId (line 88591)
    const userId = accountToken;
    const serverIdNum = parseInt(serverId) || 1;

    info('saveHistory', `userId=${userId}, serverId=${serverIdNum}`);

    try {
        // ============================================
        // Generate fresh loginToken & save to DB
        // This token will be used by enterGame on main-server
        // ============================================
        const newToken = TokenManager.generate(userId);
        await TokenManager.save(userId, newToken, serverIdNum);

        // ============================================
        // Track daily login count (in-memory, resets on server restart)
        // Client checks todayLoginCount === 4 (line 88609) and === 6 (line 88610)
        // to fire analytics events via ToolCommon.ReportToSdkCommon()
        // ============================================
        const today = new Date().toISOString().slice(0, 10);
        const countKey = `${userId}_${today}`;
        _loginCounts[countKey] = (_loginCounts[countKey] || 0) + 1;

        const responseData = {
            loginToken: newToken,
            todayLoginCount: _loginCounts[countKey],
        };

        info('saveHistory', `Token refreshed for ${userId}, dailyCount=${_loginCounts[countKey]}`);

        if (callback) {
            callback(success(responseData));
        }
    } catch (err) {
        logError('saveHistory', `Error: ${err.message}`);
        if (callback) {
            callback(error(ErrorCode.UNKNOWN));
        }
    }
}

module.exports = { saveHistory };
