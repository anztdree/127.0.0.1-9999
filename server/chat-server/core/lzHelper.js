/**
 * ============================================================================
 *  LZ-String UTF16 Compression Helper — Chat Server (Standalone)
 *  Used for response compression when data > 200 chars
 *
 *  Client: if (e.compress) { n = LZString.decompressFromUTF16(e.data) }
 *  Server: compress(JSON.stringify(dataObj)) → LZ-String UTF16 encoded string
 * ============================================================================
 */

var LZString = require('lz-string');

/**
 * Compress a string using LZ-String UTF16 encoding
 * @param {string} str - Input string (typically JSON.stringify'd data)
 * @returns {string} Compressed string
 */
function compress(str) {
    return LZString.compressToUTF16(str);
}

/**
 * Decompress a LZ-String UTF16 encoded string
 * @param {string} str - Compressed string
 * @returns {string} Original string
 */
function decompress(str) {
    return LZString.decompressFromUTF16(str);
}

module.exports = {
    compress: compress,
    decompress: decompress,
};
