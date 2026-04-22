/**
 * ============================================================================
 *  Helpers — Chat Server (Standalone)
 *  Utility functions
 * ============================================================================
 */

/**
 * Generate random hex string (for TEA challenge)
 * @param {number} [length] - Byte length (default: 16 → 32 hex chars)
 * @returns {string} Random hex string
 */
function randomHex(length) {
    length = length || 16;
    var chars = '0123456789abcdef';
    var result = '';
    for (var i = 0; i < length * 2; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Get current timestamp in seconds
 * @returns {number}
 */
function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

/**
 * Deep clone an object (JSON-based, no functions)
 * @param {*} obj
 * @returns {*}
 */
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

module.exports = {
    randomHex: randomHex,
    nowSeconds: nowSeconds,
    clone: clone,
};
