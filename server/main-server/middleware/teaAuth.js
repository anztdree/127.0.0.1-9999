/**
 * =====================================================
 *  teaAuth.js — TEA Authentication Middleware
 *  Super Warrior Z Game Server — Main Server
 *
 *  Middleware untuk memverifikasi bahwa socket connection
 *  telah melewati TEA handshake sebelum request diproses.
 *
 *  Socket dianggap verified ketika socket._verified === true,
 *  yang di-set oleh index.js selama TEA handshake.
 *
 *  Penggunaan:
 *    - verifySocket(socket, next) — untuk Socket.IO middleware
 *    - requireAuth(socket, parsedRequest, callback) — untuk handler wrapper
 *
 *  Error Code:
 *    6 = SESSION_EXPIRED (client harus re-login / re-verify)
 * =====================================================
 */

'use strict';

var ResponseHelper = require('../../shared/responseHelper');

/** @type {number} Error code for session expired / not verified — FIX 7: Now uses defined constant */
var ERROR_SESSION_EXPIRED = ResponseHelper.ErrorCode.SESSION_EXPIRED; // 6

/** @type {number} Error code for unknown/internal errors — FIX 7: Now uses defined constant */
var ERROR_UNKNOWN = ResponseHelper.ErrorCode.UNKNOWN_ERROR; // 1

var TeaAuth = {

    /**
     * Verify socket connection for Socket.IO middleware pattern.
     *
     * Checks if socket._verified is true (set by index.js during TEA handshake).
     * If verified, calls next() to proceed. Otherwise sends an error callback
     * with SESSION_EXPIRED code.
     *
     * @param {object} socket - Socket.IO socket instance
     * @param {function} next - Next middleware function
     * @param {function} [callback] - Optional client callback for error response
     * @returns {void}
     */
    verifySocket: function (socket, next, callback) {
        if (!socket || !socket._verified) {
            // Log warning for debugging
            var socketId = socket ? socket.id : 'unknown';
            console.warn('[TeaAuth] Unverified socket rejected (ID: ' + socketId + ')');

            // Send error response via callback if provided
            if (typeof callback === 'function') {
                var errorResponse = ResponseHelper.error(ERROR_SESSION_EXPIRED,
                    'Session expired or not verified');
                callback(errorResponse);
            }

            // Do NOT call next() — block the request
            return;
        }

        // Socket is verified, proceed to next handler
        next();
    },

    /**
     * Wrapper that checks verification before allowing handler execution.
     *
     * This is a convenience method for handlers that want to enforce
     * authentication before processing a request. It checks socket._verified
     * and calls the handler function only if the socket is authenticated.
     *
     * @param {object} socket - Socket.IO socket instance
     * @param {object} parsedRequest - Parsed request object from ResponseHelper.parseRequest()
     * @param {function} callback - Client callback function
     * @param {function} handlerFn - Handler function to call if verified:
     *                                handlerFn(socket, parsedRequest, callback)
     * @returns {void}
     */
    requireAuth: function (socket, parsedRequest, callback, handlerFn) {
        if (!socket || !socket._verified) {
            // Log warning for debugging
            var socketId = socket ? socket.id : 'unknown';
            var userId = parsedRequest && parsedRequest.userId ? parsedRequest.userId : 'unknown';
            console.warn('[TeaAuth] Auth required but socket not verified (ID: ' +
                socketId + ', userId: ' + userId + ')');

            // Send SESSION_EXPIRED error to client
            if (typeof callback === 'function') {
                var errorResponse = ResponseHelper.error(ERROR_SESSION_EXPIRED,
                    'Session expired or not verified');
                callback(errorResponse);
            }
            return;
        }

        // Socket is verified, execute the handler
        if (typeof handlerFn === 'function') {
            try {
                handlerFn(socket, parsedRequest, callback);
            } catch (err) {
                console.error('[TeaAuth] Handler error after auth check: ' + err.message);
                console.error('[TeaAuth] Stack: ' + err.stack);
                if (typeof callback === 'function') {
                    var errorResponse = ResponseHelper.error(ERROR_UNKNOWN,
                        'Internal server error');
                    callback(errorResponse);
                }
            }
        } else {
            console.error('[TeaAuth] requireAuth called with non-function handler');
                if (typeof callback === 'function') {
                    var errorResponse = ResponseHelper.error(ERROR_UNKNOWN,
                        'Invalid handler configuration');
                callback(errorResponse);
            }
        }
    }
};

module.exports = TeaAuth;
