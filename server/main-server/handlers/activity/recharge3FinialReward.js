/**
 * recharge3FinialReward Handler — activity (Placeholder)
 */
var ResponseHelper = require('../../core/responseHelper');
var logger = require('../../utils/logger');

function handle(socket, request, callback) {
  logger.warn('activity', 'Not implemented: recharge3FinialReward');
  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.error(ResponseHelper.ErrorCode.INVALID_COMMAND), callback);
}

module.exports = handle;
