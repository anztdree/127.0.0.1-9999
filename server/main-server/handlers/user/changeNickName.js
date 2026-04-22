/**
 * ============================================================================
 * changeNickName — User Handler
 * ============================================================================
 *
 * Changes the player's nickname.
 * First rename is free, subsequent renames cost diamonds.
 * The diamond cost comes from JSON config (changeNameNeeded).
 *
 * Client request:
 *   { type: "user", action: "changeNickName", userId, nickName, version: "1.0" }
 *
 * Client processing:
 *   UserInfoSingleton.getInstance().userNickName = n;
 *   ItemsCommonSingleton.getInstance().resetTtemsCallBack(t);  // processes item changes (diamond cost)
 *   UserInfoSingleton.getInstance().nickChangeTimes += 1;
 *   ts.closeWindow('RechristenPanel');
 *
 * Client pre-validation:
 *   - Text not null/empty
 *   - Not blocked text
 *   - Length <= playerNameLength (from config)
 *   - If not first rename: shows buyTips confirmation for diamond cost
 *
 * Server responsibilities:
 *   1. Validate nickName
 *   2. Check nickChangeTimes (from data_json) — if > 0, deduct diamonds
 *   3. Update game_users.nick_name
 *   4. Update data_json (nickChangeTimes)
 *   5. Return updated currency (diamond change) so client syncs
 *
 * ============================================================================
 */

var CONSTANTS       = require('../../config/constants');
var ResponseHelper  = require('../../core/responseHelper');
var DB              = require('../../services/db');
var UserDataService = require('../../services/userDataService');
var logger          = require('../../utils/logger');
var GameData        = require('../../gameData/loader');

/**
 * Handle user.changeNickName action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function changeNickName(socket, request, callback) {
  var userId   = request.userId;
  var nickName = request.nickName;

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId || !nickName) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // Trim whitespace
  nickName = String(nickName).trim();

  if (nickName.length === 0) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // Name length check (max 12 chars, common in mobile RPGs)
  if (nickName.length > 12) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.DATA_ERROR), callback);
    return;
  }

  // ------------------------------------------
  // 2. Load current user data
  // ------------------------------------------

  var userRow = await DB.queryOne(
    'SELECT nick_name, diamond, data_json FROM game_users WHERE user_id = ? LIMIT 1',
    [userId]
  );

  if (!userRow) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.USER_NOT_REGIST), callback);
    return;
  }

  // ------------------------------------------
  // 3. Check rename cost
  // ------------------------------------------

  var data = {};
  try { data = JSON.parse(userRow.data_json || '{}'); } catch (e) { data = {}; }

  var nickChangeTimes = data.nickChangeTimes || 0;
  var diamondCost = 0;
  var diamondChange = 0;

  if (nickChangeTimes > 0) {
    // Subsequent renames cost diamonds
    // Cost from game config (changeNameNeeded) — default 200 if not found
    var nameCostConfig = GameData.get('changeNameNeeded');
    diamondCost = (nameCostConfig && nameCostConfig.diamond) ? nameCostConfig.diamond : 200;

    if (userRow.diamond < diamondCost) {
      logger.warn('User', 'changeNickName: not enough diamonds user=' + userId);
      ResponseHelper.sendResponse(socket, 'handler.process',
        ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
      return;
    }

    diamondChange = -diamondCost;
  }

  // ------------------------------------------
  // 4. Update DB
  // ------------------------------------------

  try {
    // Update nick_name and deduct diamonds if needed
    if (diamondCost > 0) {
      await DB.query(
        'UPDATE game_users SET nick_name = ?, diamond = diamond - ? WHERE user_id = ?',
        [nickName, diamondCost, userId]
      );
    } else {
      await DB.query(
        'UPDATE game_users SET nick_name = ? WHERE user_id = ?',
        [nickName, userId]
      );
    }

    // Update nickChangeTimes in data_json
    data.nickChangeTimes = nickChangeTimes + 1;
    await UserDataService.setData(userId, data);

  } catch (err) {
    logger.error('User', 'changeNickName: DB update failed for user ' + userId + ': ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  // ------------------------------------------
  // 5. Build response
  // ------------------------------------------

  var responseData = {};

  // If diamonds were spent, return currency change so client syncs
  if (diamondChange !== 0) {
    responseData.currency = {
      _items: {
        '2': { _id: 2, _num: diamondChange }   // diamond id=2
      }
    };
  }

  logger.info('User', 'changeNickName user=' + userId +
    ' newNick=' + nickName +
    ' times=' + (nickChangeTimes + 1) +
    ' cost=' + diamondCost);

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success(responseData), callback);
}

module.exports = changeNickName;
