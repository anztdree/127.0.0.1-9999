/**
 * ============================================================================
 * clickSystem — User Handler
 * ============================================================================
 *
 * Records that a user has clicked/interacted with a specific click system.
 * Used for tracking fund buttons and other one-time interactions.
 *
 * Client request:
 *   { type: "user", action: "clickSystem", sysType, userId }
 *
 * Client processing:
 *   UserClickSingleton.getInstance().setClickSys(sysType, true);
 *
 * Two known sysType values:
 *   - CLICK_SYSTEM.TEMPLE_FUND  — Temple fund button (TempleTrial)
 *   - CLICK_SYSTEM.LESSON_FUND  — Campaign fund button (chapterMain)
 *
 * Server stores the click state in data_json.clickSystem._clickSys
 *
 * ============================================================================
 */

var ResponseHelper  = require('../../core/responseHelper');
var UserDataService = require('../../services/userDataService');
var logger          = require('../../utils/logger');

/**
 * Handle user.clickSystem action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function clickSystem(socket, request, callback) {
  var userId  = request.userId;
  var sysType = request.sysType;

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId || sysType === undefined || sysType === null) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Update clickSystem in data_json
  // ------------------------------------------

  try {
    await UserDataService.updateFields(userId, function (data) {
      // Ensure clickSystem structure exists
      if (!data.clickSystem) {
        data.clickSystem = {};
      }
      if (!data.clickSystem._clickSys) {
        data.clickSystem._clickSys = {};
      }

      // Mark this sysType as clicked
      data.clickSystem._clickSys[String(sysType)] = true;

      return data;
    });
  } catch (err) {
    logger.error('User', 'clickSystem: failed for user ' + userId + ': ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  logger.info('User', 'clickSystem user=' + userId + ' sysType=' + sysType);

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success({}), callback);
}

module.exports = clickSystem;
