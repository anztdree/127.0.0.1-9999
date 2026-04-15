/**
 * Login Server - SaveLanguage Handler
 * 
 * 100% derived from client code analysis.
 * 
 * CLIENT CODE (line 77240-77254):
 *   ts.saveLanguage() sends:
 *   {
 *     type: "User",
 *     action: "SaveLanguage",
 *     userid: ts.loginUserInfo.userId,
 *     sdk: ts.loginUserInfo.sdk,
 *     appid: t,                    // from getAppId() || ""
 *     language: e                  // language code string
 *   }
 *   via processHandlerWithLogin(r, true, successCallback, failCallback)
 * 
 * RESPONSE CHECK:
 *   t.errorCode === 0  → close LanguageList UI
 *   otherwise → close LanguageList UI anyway (both success and fail close it)
 * 
 * NOTE: Response envelope already has ret:0 on success.
 * Client checks "errorCode" but the responseHelper uses "ret".
 * Since client checks t.errorCode === 0 and we send ret:0,
 * the callback receives the full response object.
 * The client-side code actually ignores the error in practice
 * (both branches call the same close function).
 * 
 * Non-critical: just save language preference, always return success.
 */

const { success, error, ErrorCode } = require('../../shared/responseHelper');
const { info } = require('../../shared/utils/logger');
const UserManager = require('../services/userManager');

/**
 * Handle SaveLanguage action
 * 
 * @param {object} payload - Client request {userid, sdk, appid, language}
 * @param {function} callback - Socket.IO ack callback
 */
async function saveLanguage(payload, callback) {
    const { userid, sdk, appid, language } = payload;

    info('saveLanguage', `userid=${userid}, language=${language}`);

    // Save preference (non-blocking, don't fail if DB issue)
    if (userid && language) {
        await UserManager.saveLanguage(userid, language, sdk || '', appid || '');
    }

    if (callback) {
        callback(success({}));
    }
}

module.exports = { saveLanguage };
