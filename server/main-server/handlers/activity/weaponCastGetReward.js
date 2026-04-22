/**
 * weaponCastGetReward Handler — activity (Placeholder)
 */
var ResponseHelper = require('../../core/responseHelper');
var logger = require('../../utils/logger');

function handle(socket, request, callback) {
  logger.warn('activity', 'Not implemented: weaponCastGetReward');
  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.error(ResponseHelper.ErrorCode.INVALID_COMMAND), callback);
}

module.exports = handle;
