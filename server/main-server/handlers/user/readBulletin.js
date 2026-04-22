/**
 * ============================================================================
 * readBulletin — User Handler
 * ============================================================================
 *
 * Returns full content of a specific bulletin and marks it as read for the user.
 * Client calls this when user taps on a bulletin in the notice list.
 *
 * Client request:
 *   { type: "user", action: "readBulletin", userId, id, version: "1.0" }
 *
 * Client processing (NoticeBoradListItem):
 *   e.data.noticeInfo = MailInfoManager.getInstance().saveBulletin(a, t);
 *   ts.refreshNodeRed();   // refresh red dot indicators
 *   n();                   // callback to refresh notice list
 *
 * Server response:
 *   {
 *     bulletin: "Full content of the bulletin here...",
 *     bulletinId: "bulletin_1",
 *     bulletinTitle: "Welcome!",
 *     bulletinVersion: "1.0"
 *   }
 *
 * ============================================================================
 */

var ResponseHelper = require('../../core/responseHelper');
var DB             = require('../../services/db');
var logger         = require('../../utils/logger');

/**
 * Handle user.readBulletin action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function readBulletin(socket, request, callback) {
  var userId     = request.userId;
  var bulletinId = request.id;   // client sends as 'id', not 'bulletinId'

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId || !bulletinId) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Fetch bulletin content
  // ------------------------------------------

  var bulletin;
  try {
    bulletin = await DB.queryOne(
      'SELECT bulletin_id, title, content, version FROM game_bulletins ' +
      'WHERE bulletin_id = ? AND is_active = 1 LIMIT 1',
      [bulletinId]
    );
  } catch (err) {
    logger.error('User', 'readBulletin query failed: ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  if (!bulletin) {
    logger.warn('User', 'readBulletin: bulletin not found: ' + bulletinId);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.DATA_ERROR), callback);
    return;
  }

  // ------------------------------------------
  // 3. Mark as read (INSERT IGNORE — idempotent)
  // ------------------------------------------

  try {
    await DB.query(
      'INSERT IGNORE INTO game_user_bulletins (user_id, bulletin_id, read_time) VALUES (?, ?, ?)',
      [userId, bulletinId, Date.now()]
    );
  } catch (err) {
    logger.warn('User', 'readBulletin: failed to mark read for user ' + userId + ': ' + err.message);
    // Non-critical — bulletin content still returned
  }

  // ------------------------------------------
  // 4. Build response
  // ------------------------------------------

  var responseData = {
    bulletin:        bulletin.content || '',
    bulletinId:      bulletin.bulletin_id,
    bulletinTitle:   bulletin.title || '',
    bulletinVersion: bulletin.version || ''
  };

  logger.info('User', 'readBulletin user=' + userId + ' bulletin=' + bulletinId);

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success(responseData), callback);
}

module.exports = readBulletin;
