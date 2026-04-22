/**
 * ============================================================================
 * changeHeadImage — User Handler
 * ============================================================================
 *
 * Changes the player's avatar/head image.
 * Called from two places in client:
 *   1. HeroSkin panel — enableBtnTap (equip hero skin as avatar)
 *   2. ChangeHeadIcon panel — changeHeroImage (pick from available icons)
 *
 * Client request:
 *   { type: "user", action: "changeHeadImage", userId, headImageId, version: "1.0" }
 *
 * Client processing:
 *   UserInfoSingleton.getInstance().userHeadImage = e;  // (hero icon from skin data)
 *   t.myData.executeUpdataUIFunc();                     // refresh UI
 *
 * Error: Logger.serverDebugLog('失败!!')
 *
 * ============================================================================
 */

var ResponseHelper  = require('../../core/responseHelper');
var DB              = require('../../services/db');
var UserDataService = require('../../services/userDataService');
var logger          = require('../../utils/logger');

/**
 * Handle user.changeHeadImage action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function changeHeadImage(socket, request, callback) {
  var userId      = request.userId;
  var headImageId = request.headImageId;

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId || headImageId === undefined || headImageId === null) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Update game_users.head_image
  // ------------------------------------------

  try {
    await DB.query(
      'UPDATE game_users SET head_image = ? WHERE user_id = ?',
      [String(headImageId), userId]
    );
  } catch (err) {
    logger.error('User', 'changeHeadImage: DB update failed for user ' + userId + ': ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  // ------------------------------------------
  // 3. Update headEffect in data_json (if exists)
  // ------------------------------------------

  try {
    await UserDataService.setField(userId, 'headEffect.curImage', String(headImageId));
  } catch (err) {
    // Non-critical
    logger.warn('User', 'changeHeadImage: data_json update failed: ' + err.message);
  }

  logger.info('User', 'changeHeadImage user=' + userId + ' headImageId=' + headImageId);

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success({}), callback);
}

module.exports = changeHeadImage;
