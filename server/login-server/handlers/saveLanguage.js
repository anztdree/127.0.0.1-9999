/**
 * Login Server — saveLanguage Handler
 *
 * Client code (main.min.js line 77240-77254):
 *   ts.saveLanguage() sends:
 *   { type:"User", action:"SaveLanguage", userid, sdk, appid, language }
 *
 * Non-critical: always return success. Both success and failure paths close LanguageList UI.
 */

var { success } = require('../utils/responseHelper');
var logger = require('../utils/logger');
var UserManager = require('../services/userManager');

async function saveLanguage(payload, callback) {
    var userid = payload.userid;
    var sdk = payload.sdk;
    var appid = payload.appid;
    var language = payload.language;

    logger.info('saveLanguage', 'userid=' + userid + ', language=' + language);

    if (userid && language) {
        await UserManager.saveLanguage(userid, language, sdk || '', appid || '');
    }

    if (callback) callback(success({}));
}

module.exports = { saveLanguage };
