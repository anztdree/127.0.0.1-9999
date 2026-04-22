/**
 * ============================================================================
 * changeHeadBox — User Handler
 * ============================================================================
 *
 * Changes the player's head frame/avatar frame.
 *
 * Client request:
 *   { type: "user", action: "changeHeadBox", userId, boxId, version: "1.0" }
 *
 * Client processing:
 *   UserInfoSingleton.getInstance().headEffect.curBox = e;
 *   t.myData.executeUpdataUIFunc();
 *
 * Error: Logger.serverDebugLog('失败!!')
 *
 * ============================================================================
 */

var ResponseHelper  = require('../../core/responseHelper');
var UserDataService = require('../../services/userDataService');
var logger          = require('../../utils/logger');

/**
 * Handle user.changeHeadBox action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function changeHeadBox(socket, request, callback) {
  var userId = request.userId;
  var boxId  = request.boxId;

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId || boxId === undefined || boxId === null) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Update headEffect.curBox in data_json
  // ------------------------------------------

  try {
    await UserDataService.setField(userId, 'headEffect.curBox', boxId);
  } catch (err) {
    logger.error('User', 'changeHeadBox: failed for user ' + userId + ': ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  logger.info('User', 'changeHeadBox user=' + userId + ' boxId=' + boxId);

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success({}), callback);
}

module.exports = changeHeadBox;
