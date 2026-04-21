/**
 * Login Server — saveUserEnterInfo Handler
 *
 * Client code (main.min.js line 77373-77389):
 *   reportToLoginEnterInfo() — called AFTER enterGame succeeds on main-server
 *   Callback: ts.loginClient.destroy() — disconnects login socket
 *
 * Request:
 *   { type:"User", action:"SaveUserEnterInfo",
 *     accountToken: userId, channelCode, subChannel, version:"1.0",
 *     createTime, userLevel, heroLevel }
 *
 * Analytics only — response must succeed to avoid hanging.
 * Note: client sends with processHandlerWithLogin(n, true, null, null) — callback may be null!
 */

var { success } = require('../utils/responseHelper');
var logger = require('../utils/logger');

function saveUserEnterInfo(payload, callback) {
    var accountToken = payload.accountToken;
    var userLevel = payload.userLevel;
    var heroLevel = payload.heroLevel;

    logger.info('saveUserEnterInfo', 'accountToken=' + accountToken + ', level=' + userLevel + ', heroLevel=' + heroLevel);

    if (callback) callback(success({}));
}

module.exports = { saveUserEnterInfo };
