/**
 * ============================================================================
 * saveFastTeam — User Handler
 * ============================================================================
 *
 * Saves a quick-setup/fast team configuration (hero lineup + super skills).
 * Called from two places:
 *   1. FastTeamListItem editBtnTap — edit existing team
 *   2. HeroList addFastTeamItemBtnTap — create new empty slot
 *
 * Client request (edit):
 *   { type: "user", action: "saveFastTeam", userId, teams, superSkill, teamId }
 *
 * Client request (create new):
 *   { type: "user", action: "saveFastTeam", userId, teams: [], superSkill: [], teamId: length+1 }
 *
 * Client processing:
 *   HerosManager.getInstance().saveFastTeam(teamId, response);
 *
 * ============================================================================
 */

var ResponseHelper  = require('../../core/responseHelper');
var UserDataService = require('../../services/userDataService');
var logger          = require('../../utils/logger');

/**
 * Handle user.saveFastTeam action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function saveFastTeam(socket, request, callback) {
  var userId     = request.userId;
  var teams      = request.teams;       // array of team hero data
  var superSkill = request.superSkill;  // array of super skill data
  var teamId     = request.teamId;

  // ------------------------------------------
  // 1. Validate
  // ------------------------------------------

  if (!userId || teamId === undefined) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Save fast team data in data_json
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

      // Update the team slot
      data.fastTeam[teamId].teams = teams || [];
      data.fastTeam[teamId].superSkill = superSkill || [];

      return data;
    });
  } catch (err) {
    logger.error('User', 'saveFastTeam: failed for user ' + userId + ': ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  logger.info('User', 'saveFastTeam user=' + userId +
    ' teamId=' + teamId +
    ' heroes=' + (teams ? teams.length : 0));

  // Return the saved data so client can update HerosManager
  var responseData = {
    teamId:     teamId,
    teams:      teams || [],
    superSkill: superSkill || []
  };

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success(responseData), callback);
}

module.exports = saveFastTeam;
