/**
 * luckyWheelLottery Handler — activity (Placeholder)
 */
var ResponseHelper = require('../../core/responseHelper');
var logger = require('../../utils/logger');

function handle(socket, request, callback) {
  logger.warn('activity', 'Not implemented: luckyWheelLottery');
  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.error(ResponseHelper.ErrorCode.INVALID_COMMAND), callback);
}

module.exports = handle;
