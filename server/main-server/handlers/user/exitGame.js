/**
 * ============================================================================
 * exitGame — User Handler
 * ============================================================================
 *
 * Client calls this when leaving the game (logout).
 * Used as fire-and-forget cleanup before disconnect.
 *
 * Client request:
 *   { type: "user", action: "exitGame", userId }
 *
 * Client flow (from main.min.js):
 *   1. User taps logout → outRequest()
 *   2. Sends exitGame → same callback for success/error (fire-and-forget)
 *   3. ts.DisConnect() → disconnect main-server socket
 *   4. deleteAllSingleTon() → clear all client singletons
 *   5. runScene('Login') → back to login screen
 *
 * Server responsibility:
 *   - Update user's last_login_time in game_users
 *   - Clean up any temporary state
 *   - Return success (client doesn't care about response content)
 *
 * ============================================================================
 */

var ResponseHelper = require('../../core/responseHelper');
var DB             = require('../../services/db');
var logger         = require('../../utils/logger');

/**
 * Handle user.exitGame action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function exitGame(socket, request, callback) {
  var userId = request.userId;

  if (!userId) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // Update last login time (same field, just records latest activity)
  try {
    await DB.query(
      'UPDATE game_users SET last_login_time = ? WHERE user_id = ?',
      [Date.now(), userId]
    );
  } catch (err) {
    logger.warn('User', 'exitGame: failed to update time for user ' + userId + ': ' + err.message);
  }

  logger.info('User', 'exitGame user=' + userId);

  // Client doesn't check response content — just return success
  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success({}), callback);
}

module.exports = exitGame;
