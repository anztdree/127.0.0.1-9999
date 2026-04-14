/**
 * =====================================================
 *  requestValidator.js — Request Validation Middleware
 *  Super Warrior Z Game Server — Main Server
 *
 *  Middleware untuk memvalidasi request dari client
 *  sebelum diproses oleh handler.
 *
 *  Validasi yang dilakukan:
 *    1. type dan action wajib ada dan non-empty string
 *    2. userId harus valid (number atau string)
 *    3. Required params harus ada di request
 *
 *  Penggunaan:
 *    var result = RequestValidator.validate(parsed);
 *    if (!result.valid) { ... }
 *
 *    var result = RequestValidator.validateUserId(parsed);
 *    var result = RequestValidator.validateRequiredParams(parsed, ['heroId']);
 * =====================================================
 */

'use strict';

/** @type {number} Error code untuk parameter tidak valid */
var ERROR_INVALID_PARAMS = 2;

var RequestValidator = {

    /**
     * Validate that type and action are present and non-empty strings.
     *
     * Client request harus memiliki type (module name) dan action (method name)
     * untuk bisa di-route ke handler yang benar.
     *
     * @param {object} parsedRequest - Parsed request object from ResponseHelper.parseRequest()
     * @returns {object} Validation result:
     *   - {valid: true} jika valid
     *   - {valid: false, error: string, code: number} jika tidak valid
     */
    validate: function (parsedRequest) {
        // Check if parsedRequest exists and is an object
        if (!parsedRequest || typeof parsedRequest !== 'object') {
            return {
                valid: false,
                error: 'Request is null or not an object',
                code: ERROR_INVALID_PARAMS
            };
        }

        // Validate type field
        if (!parsedRequest.type || typeof parsedRequest.type !== 'string' ||
            parsedRequest.type.trim() === '') {
            return {
                valid: false,
                error: 'Missing or invalid "type" field',
                code: ERROR_INVALID_PARAMS
            };
        }

        // Validate action field
        if (!parsedRequest.action || typeof parsedRequest.action !== 'string' ||
            parsedRequest.action.trim() === '') {
            return {
                valid: false,
                error: 'Missing or invalid "action" field',
                code: ERROR_INVALID_PARAMS
            };
        }

        return { valid: true };
    },

    /**
     * Validate that userId is present and is a valid number or string.
     *
     * userId harus ada dan bisa di-convert ke number.
     * Accepts both numeric and string userId values.
     *
     * @param {object} parsedRequest - Parsed request object
     * @returns {object} Validation result:
     *   - {valid: true, userId: number} jika valid
     *   - {valid: false, error: string, code: number} jika tidak valid
     */
    validateUserId: function (parsedRequest) {
        // Check if parsedRequest exists
        if (!parsedRequest || typeof parsedRequest !== 'object') {
            return {
                valid: false,
                error: 'Request is null or not an object',
                code: ERROR_INVALID_PARAMS
            };
        }

        var userId = parsedRequest.userId;

        // Check if userId exists
        if (userId === undefined || userId === null) {
            return {
                valid: false,
                error: 'Missing "userId" field',
                code: ERROR_INVALID_PARAMS
            };
        }

        // Convert string userId to number if needed
        var numericId;
        if (typeof userId === 'string') {
            numericId = parseInt(userId, 10);
        } else if (typeof userId === 'number') {
            numericId = userId;
        } else {
            return {
                valid: false,
                error: '"userId" must be a number or string',
                code: ERROR_INVALID_PARAMS
            };
        }

        // Check if it's a valid number (not NaN and positive)
        if (isNaN(numericId) || numericId <= 0) {
            return {
                valid: false,
                error: '"userId" must be a positive number',
                code: ERROR_INVALID_PARAMS
            };
        }

        return { valid: true, userId: numericId };
    },

    /**
     * Validate that all required parameter keys exist in the parsed request.
     *
     * FIX 5: Client sends params at top level of request object, NOT nested in .params.
     * Client request: { type, action, userId, heroId, ... }
     * This function now checks parsedRequest directly instead of parsedRequest.params.
     *
     * @param {object} parsedRequest - Parsed request object from ResponseHelper.parseRequest()
     * @param {Array<string>} requiredParams - Array of required parameter key names
     * @returns {object} Validation result:
     *   - {valid: true} jika semua params ada
     *   - {valid: false, error: string, code: number, missing: string[]} jika ada yang hilang
     */
    validateRequiredParams: function (parsedRequest, requiredParams) {
        // Validate inputs
        if (!parsedRequest || typeof parsedRequest !== 'object') {
            return {
                valid: false,
                error: 'Request is null or not an object',
                code: ERROR_INVALID_PARAMS
            };
        }

        if (!Array.isArray(requiredParams) || requiredParams.length === 0) {
            // No params required — always valid
            return { valid: true };
        }

        // FIX 5: Check params directly on parsedRequest, NOT parsedRequest.params
        // Client sends: { type, action, userId, heroId, ... } — all at top level
        var missing = [];
        for (var i = 0; i < requiredParams.length; i++) {
            var key = requiredParams[i];
            if (parsedRequest[key] === undefined || parsedRequest[key] === null) {
                missing.push(key);
            }
        }

        if (missing.length > 0) {
            return {
                valid: false,
                error: 'Missing required parameter(s): ' + missing.join(', '),
                code: ERROR_INVALID_PARAMS,
                missing: missing
            };
        }

        return { valid: true };
    }
};

module.exports = RequestValidator;
