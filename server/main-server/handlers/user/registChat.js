/**
 * ============================================================================
 * registChat — User Handler
 * ============================================================================
 *
 * Returns chat server connection details to client.
 * Called every 3 seconds after enterGame until success (max 15 retries).
 *
 * Client flow (from main.min.js):
 *   1. After enterGame, client polls registChat every 3 seconds
 *   2. On _success: client connects to chat server and joins rooms
 *   3. On failure: retries up to 15 times then stops
 *
 * Client request:
 *   { type: "user", action: "registChat", userId, version: "1.0" }
 *
 * Server response (inside success data):
 *   {
 *     _success:             true,
 *     _chatServerUrl:       "http://HOST:8002",
 *     _worldRoomId:         "world_1",
 *     _guildRoomId:         "guild_123"       | null,
 *     _teamDungeonChatRoom: null               | "dungeon_uuid",
 *     _teamChatRoom:        null               | "team_uuid"
 *   }
 *
 * Client stores these in ts.loginInfo.serverItem:
 *   .chaturl              = _chatServerUrl
 *   .worldRoomId          = _worldRoomId
 *   .guildRoomId          = _guildRoomId
 *   .teamDungeonChatRoom  = _teamDungeonChatRoom
 *   .teamChatRoomId       = _teamChatRoom       (note: client key is teamChatRoomId)
 *
 * Room ID format:
 *   World:        "world_{serverId}"     — always provided
 *   Guild:        "guild_{guildId}"      — from game_guild_members if user in guild
 *   Team Dungeon: null                    — not implemented yet (no team dungeon system)
 *   Team:         null                    — not implemented yet (no team system)
 *
 * Note: userId in registChat is UUID format (UserInfoSingleton.getInstance().userId)
 *       while userId in enterGame is numeric. Both come from the same user but
 *       different client singletons.
 *
 * ============================================================================
 */

var CONSTANTS      = require('../../config/constants');
var ResponseHelper = require('../../core/responseHelper');
var DB             = require('../../services/db');
var logger         = require('../../utils/logger');

/**
 * Handle user.registChat action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function registChat(socket, request, callback) {
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
  // 2. Build chat server URL
  // ------------------------------------------

  var chatServerUrl = 'http://' + CONSTANTS.SERVER_PUBLIC_HOST + ':' + CONSTANTS.CHAT_SERVER_PORT;
  var serverId      = CONSTANTS.DEFAULT_SERVER_ID;

  // ------------------------------------------
  // 3. World room — always provided
  // ------------------------------------------

  var worldRoomId = 'world_' + serverId;

  // ------------------------------------------
  // 4. Guild room — query user's guild membership
  // ------------------------------------------

  var guildRoomId = null;

  try {
    var guildMember = await DB.queryOne(
      'SELECT guild_id FROM game_guild_members WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (guildMember && guildMember.guild_id) {
      guildRoomId = 'guild_' + guildMember.guild_id;
    }
  } catch (err) {
    logger.warn('User', 'registChat: guild lookup failed for user ' + userId + ': ' + err.message);
    // Continue without guild room — not critical
  }

  // ------------------------------------------
  // 5. Team rooms — not available yet
  //     (team dungeon and team handlers are not built)
  //     Client handles null gracefully (just skips joinRoom)
  // ------------------------------------------

  var teamDungeonChatRoom = null;
  var teamChatRoom        = null;

  // ------------------------------------------
  // 6. Build response
  // ------------------------------------------

  var responseData = {
    _success:             true,
    _chatServerUrl:       chatServerUrl,
    _worldRoomId:         worldRoomId,
    _guildRoomId:         guildRoomId,
    _teamDungeonChatRoom: teamDungeonChatRoom,
    _teamChatRoom:        teamChatRoom,
  };

  logger.info('User', 'registChat user=' + userId +
    ' | chatUrl=' + chatServerUrl +
    ' | world=' + worldRoomId +
    ' | guild=' + (guildRoomId || 'none'));

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success(responseData), callback);
}

module.exports = registChat;
