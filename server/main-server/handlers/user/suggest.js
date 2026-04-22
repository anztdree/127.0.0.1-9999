/**
 * ============================================================================
 * suggest — User Handler
 * ============================================================================
 *
 * Submits user feedback/suggestion.
 * Client opens FeedbackPanel, user types message, taps submit.
 *
 * Client request:
 *   { type: "user", action: "suggest", userId, info, version: "1.0" }
 *
 * Client processing:
 *   ts.closeWindow('FeedbackPanel');
 *   ts.openWindow('BarTypeTips', {
 *     parent: 'Tips',
 *     value: ToolCommon.getLanguageWithEditor('FeedbackPanel', 'id2')  // "submitted successfully"
 *   });
 *
 * Error: Logger.serverDebugLog('提交反馈失败!!')
 *
 * ============================================================================
 */

var ResponseHelper  = require('../../core/responseHelper');
var DB              = require('../../services/db');
var logger          = require('../../utils/logger');

/**
 * Handle user.suggest action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function suggest(socket, request, callback) {
  var userId = request.userId;
  var info   = request.info;

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId || !info) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  var feedbackText = String(info).trim();

  if (feedbackText.length === 0) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Get user nick_name for context
  // ------------------------------------------

  var nickName = '';
  try {
    var userRow = await DB.queryOne(
      'SELECT nick_name FROM game_users WHERE user_id = ? LIMIT 1',
      [userId]
    );
    if (userRow) nickName = userRow.nick_name || '';
  } catch (e) {
    // Non-critical — proceed without nick_name
  }

  // ------------------------------------------
  // 3. Save to game_suggestions
  // ------------------------------------------

  try {
    await DB.query(
      'INSERT INTO game_suggestions (user_id, nick_name, content, create_time) VALUES (?, ?, ?, ?)',
      [userId, nickName, feedbackText, Date.now()]
    );
  } catch (err) {
    logger.error('User', 'suggest: failed to save for user ' + userId + ': ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  logger.info('User', 'suggest user=' + userId + ' nick=' + nickName +
    ' len=' + feedbackText.length);

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success({}), callback);
}

module.exports = suggest;
