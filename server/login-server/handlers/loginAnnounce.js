/**
 * Login Server — loginAnnounce Handler
 *
 * Client request (main.min.js line 88769-88772):
 *   { type: "User", action: "LoginAnnounce" }
 *
 * Client response handler (line 88773-88790):
 *   t.data = parsed response.data → array of notices
 *   Each notice: { text: {lang: string}, title: {lang: string}, version, orderNo, alwaysPopup }
 *
 * CRITICAL: Response data MUST be { data: [] }, NOT [] directly.
 *   t.data = parsed.data → needs wrapped object
 */

var { success } = require('../utils/responseHelper');
var logger = require('../utils/logger');
var CONSTANTS = require('../config/constants');

function loginAnnounce(callback) {
    if (!CONSTANTS.ANNOUNCE_ENABLED) {
        logger.info('loginAnnounce', 'Disabled, returning empty');
        if (callback) callback(success({ data: [] }));
        return;
    }

    // If enabled, return empty for now (can load from JSON file later)
    logger.info('loginAnnounce', 'Returning empty notices');
    if (callback) callback(success({ data: [] }));
}

module.exports = { loginAnnounce };
