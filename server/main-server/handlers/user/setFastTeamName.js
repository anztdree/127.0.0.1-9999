/**
 * ============================================================================
 * setFastTeamName — User Handler
 * ============================================================================
 *
 * Changes the name of a quick-setup/fast team slot.
 *
 * Client request:
 *   { type: "user", action: "setFastTeamName", userId, name, teamId }
 *
 * Client processing:
 *   HerosManager.getInstance().setFastTeamName(teamId, name);
 *
 * Error: reverts input to old name (e.data.fastTeamInfo.name)
 *
 * ============================================================================
 */

var ResponseHelper  = require('../../core/responseHelper');
var UserDataService = require('../../services/userDataService');
var logger          = require('../../utils/logger');

/**
 * Handle user.setFastTeamName action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function setFastTeamName(socket, request, callback) {
  var userId = request.userId;
  var name   = request.name;
  var teamId = request.teamId;

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId || name === undefined || teamId === undefined) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Update fast team name in data_json
  // ------------------------------------------

  try {
    await UserDataService.updateFields(userId, function (data) {
      // Ensure fastTeam structure exists
      if (!data.fastTeam) {
        data.fastTeam = [];
      }

      // Ensure array is large enough
      while (data.fastTeam.length <= teamId) {
        data.fastTeam.push({ name: '', teams: [], superSkill: [] });
      }

      data.fastTeam[teamId].name = String(name);

      return data;
    });
  } catch (err) {
    logger.error('User', 'setFastTeamName: failed for user ' + userId + ': ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  logger.info('User', 'setFastTeamName user=' + userId + ' teamId=' + teamId + ' name=' + name);

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success({}), callback);
}

module.exports = setFastTeamName;
