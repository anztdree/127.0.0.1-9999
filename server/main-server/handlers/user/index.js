/**
 * ============================================================================
 * User Handler — Main Server (Router)
 * ============================================================================
 *
 * Routes all "user" type actions from handler.process.
 *
 * All 24 user-type actions (from client main.min.js analysis):
 * ──────────────────────────────────────────────────────────────
 *   Core game flow:
 *     enterGame            — validate loginToken, load/assemble full game state
 *     registChat           — return chat server URL + room IDs
 *     exitGame             — cleanup on logout (fire-and-forget)
 *
 *   Bulletin / notice system:
 *     getBulletinBrief     — return list of active bulletins (title/version)
 *     readBulletin         — return full bulletin content + mark read
 *
 *   Player customization:
 *     changeHeadImage      — change player avatar (from hero skin or icon picker)
 *     changeHeadBox        — change player avatar frame
 *     changeNickName       — change nickname (first free, then costs diamonds)
 *     queryPlayerHeadIcon  — query current head icon state (opens picker panel)
 *
 *   Fast team (quick lineup):
 *     saveFastTeam         — save quick-setup team lineup + super skills
 *     setFastTeamName      — rename a quick-setup team slot
 *
 *   System interaction tracking:
 *     clickSystem          — track one-time click interactions (fund buttons)
 *
 *   User feedback:
 *     suggest              — submit user feedback/suggestion
 *
 *   Additional actions (placeholder):
 *     GetServerList        — get server list
 *     SaveUserEnterInfo    — save user enter info
 *     checkBattleRecord    — check battle record
 *     getDailyReward       — get daily reward
 *     getRank              — get rank
 *     guideBattle          — guide battle
 *     readHeroVersion      — read hero version
 *     sendMsg              — send message
 *     takeOff              — take off equipment
 *     useActiveCode        — use active code
 *     useSkin              — use skin
 * ──────────────────────────────────────────────────────────────
 */

var ResponseHelper = require('../../core/responseHelper');
var logger         = require('../../utils/logger');

// ============================================
// ACTION HANDLERS — Implemented
// ============================================

var enterGame            = require('./enterGame');
var registChat           = require('./registChat');
var exitGame             = require('./exitGame');
var getBulletinBrief     = require('./getBulletinBrief');
var readBulletin         = require('./readBulletin');
var changeHeadImage      = require('./changeHeadImage');
var changeHeadBox        = require('./changeHeadBox');
var changeNickName       = require('./changeNickName');
var queryPlayerHeadIcon  = require('./queryPlayerHeadIcon');
var saveFastTeam         = require('./saveFastTeam');
var setFastTeamName      = require('./setFastTeamName');
var clickSystem          = require('./clickSystem');
var suggest              = require('./suggest');

// ============================================
// ACTION HANDLERS — Placeholder
// ============================================

var GetServerList        = require('./GetServerList');
var SaveUserEnterInfo    = require('./SaveUserEnterInfo');
var checkBattleRecord    = require('./checkBattleRecord');
var getDailyReward       = require('./getDailyReward');
var getRank              = require('./getRank');
var guideBattle          = require('./guideBattle');
var readHeroVersion      = require('./readHeroVersion');
var sendMsg              = require('./sendMsg');
var takeOff              = require('./takeOff');
var useActiveCode        = require('./useActiveCode');
var useSkin              = require('./useSkin');

var actions = {
  // Core game flow (implemented)
  enterGame:            enterGame,
  registChat:           registChat,
  exitGame:             exitGame,

  // Bulletin / notice system (implemented)
  getBulletinBrief:     getBulletinBrief,
  readBulletin:         readBulletin,

  // Player customization (implemented)
  changeHeadImage:      changeHeadImage,
  changeHeadBox:        changeHeadBox,
  changeNickName:       changeNickName,
  queryPlayerHeadIcon:  queryPlayerHeadIcon,

  // Fast team (implemented)
  saveFastTeam:         saveFastTeam,
  setFastTeamName:      setFastTeamName,

  // System interaction tracking (implemented)
  clickSystem:          clickSystem,

  // User feedback (implemented)
  suggest:              suggest,

  // Placeholder actions
  GetServerList:        GetServerList,
  SaveUserEnterInfo:    SaveUserEnterInfo,
  checkBattleRecord:    checkBattleRecord,
  getDailyReward:       getDailyReward,
  getRank:              getRank,
  guideBattle:          guideBattle,
  readHeroVersion:      readHeroVersion,
  sendMsg:              sendMsg,
  takeOff:              takeOff,
  useActiveCode:        useActiveCode,
  useSkin:              useSkin,
};

// ============================================
// ROUTER
// ============================================

/**
 * Main handler entry point — called by main-server on type="user"
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request { type, action, userId, version, ... }
 * @param {function} callback - Socket.IO ACK callback
 */
function handle(socket, request, callback) {
  var action = request.action;

  if (!action) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  var handler = actions[action];

  if (handler && typeof handler === 'function') {
    handler(socket, request, callback);
  } else {
    logger.warn('User', 'Unknown action: ' + action);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.INVALID_COMMAND), callback);
  }
}

// ============================================
// EXPORT
// ============================================

module.exports = {
  handle: handle,
};
