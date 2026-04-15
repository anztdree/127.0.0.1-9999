/**
 * Login Server - SaveUserEnterInfo Handler
 * 
 * 100% derived from client code analysis.
 * 
 * CLIENT CODE (line 77373-77389):
 *   reportToLoginEnterInfo() — called AFTER enterGame succeeds on main-server
 *   Callback: ts.loginClient.destroy() — disconnects login socket after response
 * 
 * CLIENT REQUEST:
 *   {
 *     type: "User",
 *     action: "SaveUserEnterInfo",
 *     accountToken: ts.loginInfo.userInfo.userId,
 *     channelCode: ts.loginInfo.userInfo.channelCode,
 *     subChannel: string,
 *     version: "1.0",
 *     createTime: number,
 *     userLevel: number,
 *     heroLevel: number
 *   }
 * 
 * CRITICAL:
 *   - No userId field! Uses accountToken instead.
 *   - Callback destroys loginClient socket — response MUST succeed.
 *   - This is an analytics/tracking action, no game data in response.
 *   - Client sends with processHandlerWithLogin(n, true, null, null) — NO callbacks!
 *     Actually re-reading: the destroy happens regardless.
 */

const { success } = require('../../shared/responseHelper');
const { info } = require('../../shared/utils/logger');

/**
 * Handle SaveUserEnterInfo action
 * 
 * Analytics only — client destroys login socket after this.
 * Response must succeed to avoid hanging.
 * 
 * @param {object} payload - Client request
 * @param {function} callback - Socket.IO ack callback (may be null)
 */
function saveUserEnterInfo(payload, callback) {
    const { accountToken, channelCode, subChannel, createTime, userLevel, heroLevel } = payload;

    info('saveUserEnterInfo', `accountToken=${accountToken}, level=${userLevel}, heroLevel=${heroLevel}`);

    // Analytics/tracking — no game data needed in response
    // Could log to analytics table in the future

    if (callback) {
        callback(success({}));
    }
}

module.exports = { saveUserEnterInfo };
