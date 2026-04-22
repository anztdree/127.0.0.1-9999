/**
 * ============================================================================
 * Response Helper — Chat Server (Standalone)
 * ============================================================================
 *
 * Client response format (main.min.js):
 *   ACK callback : { ret: 0, data: "JSON_STRING", compress: boolean, serverTime, server0Time }
 *   Push/Notify  : { ret: "SUCCESS", data: "JSON_STRING", compress: boolean, serverTime }
 *
 * Success detection : 0 === e.ret
 * Error detection   : else → ErrorHandler.ShowErrorTips(e.ret)
 * Data parsing      : JSON.parse(e.data)
 *                     if (e.compress) → LZString.decompressFromUTF16(e.data)
 *
 * HAR-verified:
 *   compress: true  → data is LZString.compressToUTF16(JSON.stringify(obj))
 *   compress: false → data is plain JSON.stringify(obj)
 *   Auto threshold  → compress when serialised JSON > 200 chars
 *   server0Time     → 25200000 (POSITIVE, UTC+7)
 *
 * CHAT-SERVER NOTIFY FORMAT:
 *   Chat-server Notify wraps message as { _msg: messageObj }
 *   This is different from main-server Notify which uses { action: actionType, ... }
 *
 * ============================================================================
 */

var lzHelper  = require('./lzHelper');
var CONSTANTS = require('../config/constants');

// ============================================
// SUCCESS (ACK callback response)
// ============================================

/**
 * Build success response for ACK callback
 *
 * @param {object}  dataObj       - Data object (will be JSON.stringify'd)
 * @param {boolean} [forceCompress] - true=always, false=never, undefined=auto (>200 chars)
 * @returns {object} { ret:0, data, compress, serverTime, server0Time }
 */
function success(dataObj, forceCompress) {
  var now     = Date.now();
  var dataStr = '';
  var shouldCompress = false;

  if (dataObj !== undefined && dataObj !== null) {
    dataStr = JSON.stringify(dataObj);

    if (forceCompress === true) {
      shouldCompress = true;
    } else if (forceCompress === false) {
      shouldCompress = false;
    } else {
      shouldCompress = dataStr.length > 200;
    }

    if (shouldCompress) {
      dataStr = lzHelper.compress(dataStr);
    }
  }

  return {
    ret:         0,
    data:        dataStr,
    compress:    shouldCompress,
    serverTime:  now,
    server0Time: CONSTANTS.SERVER_UTC_OFFSET_MS,
  };
}

// ============================================
// ERROR
// ============================================

/**
 * Build error response
 *
 * @param {number} code  - Error code
 * @param {string} [msg] - Optional message string
 * @returns {object} { ret:code, data:'', compress:false, serverTime, server0Time }
 */
function error(code, msg) {
  return {
    ret:         code,
    data:        msg || '',
    compress:    false,
    serverTime:  Date.now(),
    server0Time: CONSTANTS.SERVER_UTC_OFFSET_MS,
  };
}

// ============================================
// PUSH / NOTIFY (chat message broadcast)
// ============================================

/**
 * Build chat Notify push response
 *
 * Chat-server Notify format (from main.min.js chatClient.listenNotify):
 *   { ret: "SUCCESS", data: JSON.stringify({ _msg: messageObject }), compress: bool, serverTime }
 *
 * Note: This is DIFFERENT from main-server Notify which uses { action: actionType, ...data }
 * Chat-server wraps the message in { _msg: ... } because the client parses n._msg
 *
 * @param {object} msgObj - Full message object (ChatDataBaseClass fields)
 * @returns {object} { ret:"SUCCESS", data, compress, serverTime }
 */
function pushMessage(msgObj) {
  var payload = { _msg: msgObj };
  var dataStr        = JSON.stringify(payload);
  var shouldCompress = dataStr.length > 200;

  if (shouldCompress) {
    dataStr = lzHelper.compress(dataStr);
  }

  return {
    ret:        'SUCCESS',
    data:       dataStr,
    compress:   shouldCompress,
    serverTime: Date.now(),
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Send response via Socket.IO callback (ACK)
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {string}   event    - Event name (for logging)
 * @param {object}   response - Response object
 * @param {function} callback - Socket.IO acknowledgment callback
 */
function sendResponse(socket, event, response, callback) {
  if (typeof callback === 'function') {
    callback(response);
  }
}

/**
 * Parse and validate incoming handler.process request
 *
 * @param {object} request - Raw Socket.IO payload
 * @returns {object|null}  - Validated request or null
 */
function parseRequest(request) {
  if (!request || typeof request !== 'object') return null;
  if (!request.type || !request.action)        return null;
  return request;
}

// ============================================
// ERROR CODES
// ============================================

var ErrorCode = {
  UNKNOWN:               1,
  STATE_ERROR:           2,
  DATA_ERROR:            3,
  INVALID:               4,
  INVALID_COMMAND:       5,
  SESSION_EXPIRED:       6,
  LACK_PARAM:            8,
  USER_LOGIN_BEFORE:     12,
  USER_NOT_LOGIN_BEFORE: 13,
  USER_NOT_LOGOUT:       14,
  LOGIN_CHECK_FAILED:    38,
  FORBIDDEN_LOGIN:       45,
  NOT_ENABLE_REGIST:     47,
  GAME_SERVER_OFFLINE:   51,
  CLIENT_VERSION_ERR:    62,
  MAINTAIN:              65,
  USER_NOT_REGIST:       57003,
  /** Chat-specific: player is muted/forbidden from chatting */
  ERROR_FORBIDDEN_CHAT:  36001,
};

// ============================================
// EXPORT
// ============================================

module.exports = {
  success:       success,
  error:         error,
  pushMessage:   pushMessage,
  sendResponse:  sendResponse,
  parseRequest:  parseRequest,
  ErrorCode:     ErrorCode,
};
