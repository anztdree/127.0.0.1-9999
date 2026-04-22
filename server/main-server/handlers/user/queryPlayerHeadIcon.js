/**
 * ============================================================================
 * queryPlayerHeadIcon — User Handler
 * ============================================================================
 *
 * Called when user opens the ChangeHeadIcon panel from Settings.
 * Returns current player info and available head icon items.
 *
 * Client request:
 *   { type: "user", action: "queryPlayerHeadIcon", userId, version: "1.0" }
 *
 * Client processing:
 *   ItemsCommonSingleton.getInstance().resetTtemsCallBack(response);
 *   ts.openWindow('ChangeHeadIcon', {
 *     parent: 'Setting',
 *     updataUIFunc: callback
 *   });
 *
 * Error: Logger.serverDebugLog('失败!!')
 *
 * The response is passed to resetTtemsCallBack() which processes item changes.
 * The panel then displays available head icons for the player to select.
 *
 * Server should return the player's current head-related state:
 *   - Current head image ID
 *   - Available head icons (from items/gifts)
 *   - Head effect/box data
 *
 * ============================================================================
 */

var ResponseHelper  = require('../../core/responseHelper');
var DB              = require('../../services/db');
var UserDataService = require('../../services/userDataService');
var logger          = require('../../utils/logger');

/**
 * Handle user.queryPlayerHeadIcon action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function queryPlayerHeadIcon(socket, request, callback) {
  var userId = request.userId;

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Load user data
  // ------------------------------------------

  var userRow = await DB.queryOne(
    'SELECT head_image, data_json FROM game_users WHERE user_id = ? LIMIT 1',
    [userId]
  );

  if (!userRow) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.USER_NOT_REGIST), callback);
    return;
  }

  var data = {};
  try { data = JSON.parse(userRow.data_json || '{}'); } catch (e) { data = {}; }

  // ------------------------------------------
  // 3. Build response
  // ------------------------------------------

  var responseData = {
    // Current head image
    headImage: userRow.head_image || '',

    // Head effect data (if available)
    headEffect: data.headEffect || null
  };

  logger.info('User', 'queryPlayerHeadIcon user=' + userId +
    ' headImage=' + (userRow.head_image || 'none'));

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success(responseData), callback);
}

module.exports = queryPlayerHeadIcon;
