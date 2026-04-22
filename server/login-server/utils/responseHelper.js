/**
 * ============================================================================
 * Login Server — Response Helper  [FIXED v2.1]
 * ============================================================================
 *
 * BUG FIXED: "compress is not a function"
 *
 *   BEFORE (broken):
 *     function compress(str) { ... }          ← function named 'compress'
 *     function success(dataObj, forceCompress) {
 *       let compress = false;                 ← local var SHADOWS the function!
 *       if (compress) {
 *         dataStr = compress(dataStr);        ← compress is now boolean → CRASH
 *       }
 *     }
 *
 *   FIX: Rename the helper function to _lzCompress so it never clashes
 *   with the local boolean variable 'compress'.
 *
 * Client response format (main.min.js):
 *   { ret: 0, data: "JSON_STRING", compress: boolean, serverTime, server0Time }
 *
 * From HAR analysis:
 *   - Small responses (errorCode only) → compress: false, data as plain JSON string
 *   - Large responses (serverList, loginGame) → compress: true (optional)
 *   - GetServerList  → data contains { serverList, history, offlineReason }
 *   - SaveHistory    → data contains { loginToken, todayLoginCount, errorCode }
 *   - LoginAnnounce  → data contains { data: [], errorCode: 0 }
 *   - SaveUserEnterInfo → data contains { errorCode: 0 }
 *   - SaveLanguage   → data contains { errorCode: 0 }
 *
 * ============================================================================
 */

const LZString = require('lz-string');
const CONSTANTS = require('../config/constants');

// =============================================
// COMPRESS (internal — renamed to avoid clash)
// =============================================

/**
 * Compress string to UTF16 format (client-compatible)
 * IMPORTANT: Named _lzCompress (not 'compress') to avoid shadowing
 * the local 'compress' boolean variable inside success().
 *
 * @param {string} str - String to compress
 * @returns {string} Compressed string
 */
function _lzCompress(str) {
  return LZString.compressToUTF16(str);
}

// =============================================
// RESPONSES
// =============================================

/**
 * Build success response
 *
 * HAR-verified format:
 *   { ret: 0, data: "{\"key\":\"val\"}", compress: false, serverTime, server0Time }
 *
 * @param {Object|string} dataObj - Data to return (will be JSON.stringify'd)
 * @param {boolean} [forceCompress] - Force compress (default: auto when >500 chars)
 * @returns {Object} Response object ready for Socket.IO callback
 */
function success(dataObj, forceCompress) {
  const now = Date.now();

  let dataStr = '';
  let shouldCompress = false; // use 'shouldCompress', not 'compress', to avoid function name conflict

  if (dataObj !== undefined && dataObj !== null) {
    dataStr = (typeof dataObj === 'string') ? dataObj : JSON.stringify(dataObj);

    // Determine compression
    if (forceCompress === true) {
      shouldCompress = true;
    } else if (forceCompress === false) {
      shouldCompress = false;
    } else {
      // Auto: only compress if > 500 chars (HAR shows small responses not compressed)
      shouldCompress = dataStr.length > 500;
    }

    if (shouldCompress) {
      dataStr = _lzCompress(dataStr); // ← uses renamed function, safe
    }
  }

  return {
    ret: 0,
    data: dataStr,
    compress: shouldCompress,        // boolean field client checks
    serverTime: now,
    server0Time: CONSTANTS.SERVER_UTC_OFFSET_MS
  };
}

/**
 * Build error response
 *
 * @param {number} code - Error code from ErrorCode
 * @param {string} [msg] - Optional error message
 * @returns {Object} Error response
 */
function error(code, msg) {
  return {
    ret: code,
    data: msg || '',
    compress: false,
    serverTime: Date.now(),
    server0Time: CONSTANTS.SERVER_UTC_OFFSET_MS
  };
}

/**
 * Build push/notify response
 * Client checks: if ("SUCCESS" == t.ret) { ... }
 *
 * @param {Object} dataObj - Data to push
 * @returns {Object} Push response
 */
function push(dataObj) {
  return {
    ret: 'SUCCESS',
    data: JSON.stringify(dataObj || {}),
    compress: false,
    serverTime: Date.now(),
    server0Time: CONSTANTS.SERVER_UTC_OFFSET_MS
  };
}

// =============================================
// ERROR CODES
// =============================================

/**
 * Error codes (from errorDefine.json / main.min.js)
 */
const ErrorCode = {
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
  USER_NOT_REGIST:       57003
};

// =============================================
// EXPORT
// =============================================

module.exports = {
  success,
  error,
  push,
  ErrorCode
};
