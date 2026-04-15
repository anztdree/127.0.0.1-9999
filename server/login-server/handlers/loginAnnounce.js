/**
 * Login Server - LoginAnnounce Handler
 * 
 * 100% derived from client code analysis.
 * 
 * CLIENT REQUEST (line 88769-88772):
 *   { type: "User", action: "LoginAnnounce" }
 * 
 * CLIENT RESPONSE HANDLER (line 88773-88790):
 *   Reads e.data as array of notice objects with fields:
 *     text: { lang_code: text_string }   (line 88780: t.text[n.language])
 *     title: { lang_code: title_string }  (line 88781: t.title[n.language])
 *     version: string                      (line 88782)
 *     orderNo: number                      (line 88783)
 *     alwaysPopup: boolean                 (line 88784)
 * 
 * Language keys: "en", "cn", "tw", "kr", "de", "fr", "pt", "vi"
 * 
 * If noticeContent.json has entries, they are loaded.
 * If disabled or file missing, returns empty array (no notices).
 * 
 * noticeContent.json structure (61 entries):
 *   Map of IDs "1"-"61", each with {id, system, name, content}
 *   content = localization key like "noticeContent_content_33"
 * 
 * NOTE: In private server, announcements are typically disabled.
 * Set ANNOUNCE.enabled = true in loginConstants.js to enable.
 */

const { success } = require('../../shared/responseHelper');
const { info, warn } = require('../../shared/utils/logger');
const { ANNOUNCE } = require('../utils/loginConstants');
const path = require('path');

/**
 * Handle LoginAnnounce action
 * 
 * @param {function} callback - Socket.IO ack callback
 */
function loginAnnounce(callback) {
    if (!ANNOUNCE.enabled) {
        info('loginAnnounce', 'Announcements disabled, returning empty');
        if (callback) callback(success([]));
        return;
    }

    try {
        // Try to load noticeContent.json
        const noticePath = path.resolve(__dirname, ANNOUNCE.filePath);
        const noticeData = require(noticePath);

        // Transform to client format
        const notices = Object.values(noticeData).map(entry => ({
            text: { en: entry.content || '', cn: entry.content || '' },
            title: { en: entry.name || '', cn: entry.name || '' },
            version: '1.0.0',
            orderNo: entry.id || 0,
            alwaysPopup: false,
        }));

        info('loginAnnounce', `Returning ${notices.length} announcements`);
        if (callback) callback(success(notices));
    } catch (err) {
        warn('loginAnnounce', `Failed to load notices: ${err.message}, returning empty`);
        if (callback) callback(success([]));
    }
}

module.exports = { loginAnnounce };
