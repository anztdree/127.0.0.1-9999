/**
 * ============================================================================
 * getBulletinBrief — User Handler
 * ============================================================================
 *
 * Returns brief info for all active bulletins (title, version, order).
 * Client uses this to show red dots on bulletin icon and list available notices.
 *
 * Client request:
 *   { type: "user", action: "getBulletinBrief", userId, version: "1.0" }
 *
 * Client processing (MailInfoManager.prototype.getBulletinBrief):
 *   t.bulletinList = {};
 *   for (var o in n._brief) {
 *     t.bulletinList[o] = {
 *       bulletin: '',
 *       bulletinTitle: n._brief[o].title,
 *       bulletinVersion: n._brief[o].version,
 *       order: n._brief[o].order
 *     };
 *   }
 *
 * Server response:
 *   {
 *     _brief: {
 *       "bulletin_1": { title: "Welcome!", version: "1.0", order: 1 },
 *       "bulletin_2": { title: "Event News", version: "1.1", order: 2 }
 *     }
 *   }
 *
 * ============================================================================
 */

var ResponseHelper = require('../../core/responseHelper');
var DB             = require('../../services/db');
var logger         = require('../../utils/logger');

/**
 * Handle user.getBulletinBrief action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function getBulletinBrief(socket, request, callback) {
  // ------------------------------------------
  // 1. Query all active bulletins
  // ------------------------------------------

  var rows;
  try {
    rows = await DB.query(
      'SELECT bulletin_id, title, version, sort_order FROM game_bulletins ' +
      'WHERE is_active = 1 ORDER BY sort_order ASC',
      []
    );
  } catch (err) {
    logger.error('User', 'getBulletinBrief query failed: ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  // ------------------------------------------
  // 2. Build _brief map keyed by bulletin_id
  // ------------------------------------------

  var brief = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    brief[row.bulletin_id] = {
      title:  row.title || '',
      version: row.version || '',
      order:  row.sort_order || 0
    };
  }

  logger.info('User', 'getBulletinBrief — returned ' + rows.length + ' bulletin(s)');

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success({ _brief: brief }), callback);
}

module.exports = getBulletinBrief;
