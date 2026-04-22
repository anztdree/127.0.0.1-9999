/**
 * getDailyReward Handler — user (Placeholder)
 */
var ResponseHelper = require('../../core/responseHelper');
var logger = require('../../utils/logger');

function handle(socket, request, callback) {
  logger.warn('User', 'Not implemented: getDailyReward');
  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.error(ResponseHelper.ErrorCode.INVALID_COMMAND), callback);
}

module.exports = handle;
