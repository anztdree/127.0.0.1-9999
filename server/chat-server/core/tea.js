/**
 * ============================================================================
 *  XXTEA Encryption/Decryption — Chat Server (Standalone)
 *  100% match with client TEA class (main.min.js)
 *
 *  Client flow:
 *    Server emits "verify" with challenge string
 *    Client: (new TEA).encrypt(challenge, "verification") → Base64 string
 *    Client emits "verify" with encrypted Base64 + callback
 *    Server decrypts and compares with original challenge
 *
 *  Algorithm (from client TEA class):
 *    1. UTF-8 encode plaintext and key (key truncated to 16 chars)
 *    2. Convert strings to uint32 array (little-endian via charCodeAt)
 *    3. XXTEA encrypt/decrypt using delta=2654435769, rounds=6+52/n
 *    4. Convert uint32 array back to string
 *    5. Base64 encode/decode for transmission
 * ============================================================================
 */

var CONSTANTS = require('../config/constants');

// =============================================
// UTF-8 encode/decode (matches client Utf8 class)
// =============================================

function utf8Encode(str) {
    var encoded = '';
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 0x80) {
            encoded += String.fromCharCode(code);
        } else if (code < 0x800) {
            encoded += String.fromCharCode(192 | (code >> 6), 128 | (code & 63));
        } else if (code < 0xD800 || code >= 0xE000) {
            encoded += String.fromCharCode(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
        } else {
            var hi = code - 0xD800;
            var lo = str.charCodeAt(++i) - 0xDC00;
            var cp = (hi << 10) + lo + 0x10000;
            encoded += String.fromCharCode(240 | (cp >> 18), 128 | ((cp >> 12) & 63), 128 | ((cp >> 6) & 63), 128 | (cp & 63));
        }
    }
    return encoded;
}

function utf8Decode(str) {
    var result = '';
    var i = 0;
    while (i < str.length) {
        var code = str.charCodeAt(i);
        if (code < 128) {
            result += String.fromCharCode(code);
            i++;
        } else if (code >= 224 && code < 240) {
            var cp = ((code & 15) << 12) | ((str.charCodeAt(i + 1) & 63) << 6) | (str.charCodeAt(i + 2) & 63);
            result += String.fromCharCode(cp);
            i += 3;
        } else {
            var cp = ((code & 31) << 6) | (str.charCodeAt(i + 1) & 63);
            result += String.fromCharCode(cp);
            i += 2;
        }
    }
    return result;
}

// =============================================
// Base64 encode/decode (matches client Base64 class)
// =============================================

var BASE64_CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function base64Encode(input) {
    var result = '';
    var padding = '';
    var len = input.length % 3;
    if (len > 0) {
        for (var i = 0; i < 3 - len; i++) padding += '=';
        input += '\x00';
    }
    for (var i = 0; i < input.length; i += 3) {
        var n = input.charCodeAt(i);
        var o = input.charCodeAt(i + 1);
        var a = input.charCodeAt(i + 2);
        var combined = (n << 16) | (o << 8) | a;
        result += BASE64_CODE.charAt((combined >> 18) & 63);
        result += BASE64_CODE.charAt((combined >> 12) & 63);
        result += BASE64_CODE.charAt((combined >> 6) & 63);
        result += BASE64_CODE.charAt(combined & 63);
    }
    return result.slice(0, result.length - padding.length) + padding;
}

function base64Decode(input) {
    var result = [];
    for (var i = 0; i < input.length; i += 4) {
        var r = BASE64_CODE.indexOf(input.charAt(i));
        var s = BASE64_CODE.indexOf(input.charAt(i + 1));
        var l = BASE64_CODE.indexOf(input.charAt(i + 2));
        var u = BASE64_CODE.indexOf(input.charAt(i + 3));
        var combined = (r << 18) | (s << 12) | (l << 6) | u;
        result[Math.floor(i / 4)] = String.fromCharCode(
            (combined >>> 16) & 255,
            (combined >>> 8) & 255,
            255 & combined
        );
        if (u === 64) result[Math.floor(i / 4)] = String.fromCharCode((combined >>> 16) & 255, (combined >>> 8) & 255);
        if (l === 64) result[Math.floor(i / 4)] = String.fromCharCode((combined >>> 16) & 255);
    }
    return result.join('');
}

// =============================================
// String ↔ Uint32 Array conversion (matches client strToLongs/longsToStr)
// =============================================

function strToLongs(str) {
    var arr = new Array(Math.ceil(str.length / 4));
    for (var i = 0; i < arr.length; i++) {
        arr[i] =
            str.charCodeAt(4 * i) +
            (str.charCodeAt(4 * i + 1) << 8) +
            (str.charCodeAt(4 * i + 2) << 16) +
            (str.charCodeAt(4 * i + 3) << 24);
    }
    return arr;
}

function longsToStr(arr) {
    var parts = new Array(arr.length);
    for (var i = 0; i < arr.length; i++) {
        parts[i] = String.fromCharCode(
            arr[i] & 255,
            (arr[i] >>> 8) & 255,
            (arr[i] >>> 16) & 255,
            (arr[i] >>> 24) & 255
        );
    }
    return parts.join('');
}

// =============================================
// XXTEA Encrypt (matches client TEA.prototype.encrypt)
// =============================================

function encrypt(plaintext, key) {
    if (plaintext.length === 0) return '';

    var data = strToLongs(utf8Encode(plaintext));
    if (data.length <= 1) data[1] = 0;

    var k = strToLongs(utf8Encode(key).slice(0, 16));
    var n = data.length;
    var p = 0;
    var rounds = Math.floor(6 + 52 / n);
    var delta = 2654435769;
    var z = data[n - 1];
    var y = data[0];

    while (rounds-- > 0) {
        p = (p + delta) & 0xFFFFFFFF;
        var e = (p >>> 2) & 3;
        for (var i = 0; i < n; i++) {
            y = data[(i + 1) % n];
            var mx = ((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((p ^ y) + (k[3 & i ^ e] ^ z));
            z = data[i] = (data[i] + mx) & 0xFFFFFFFF;
        }
    }

    return base64Encode(longsToStr(data));
}

// =============================================
// XXTEA Decrypt (matches client TEA.prototype.decrypt)
// =============================================

function decrypt(ciphertext, key) {
    if (ciphertext.length === 0) return '';

    var data = strToLongs(base64Decode(ciphertext));
    var k = strToLongs(utf8Encode(key).slice(0, 16));
    var n = data.length;
    var rounds = Math.floor(6 + 52 / n);
    var delta = 2654435769;
    var p = (rounds * delta) & 0xFFFFFFFF;
    var z = data[n - 1];
    var y = data[0];

    while (p !== 0) {
        var e = (p >>> 2) & 3;
        for (var i = n - 1; i >= 0; i--) {
            z = data[i > 0 ? i - 1 : n - 1];
            var mx = ((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((p ^ y) + (k[3 & i ^ e] ^ z));
            y = data[i] = (data[i] - mx) & 0xFFFFFFFF;
        }
        p = (p - delta) & 0xFFFFFFFF;
    }

    var result = longsToStr(data);
    result = result.replace(/\0+$/, '');
    return utf8Decode(result);
}

// =============================================
// Public API
// =============================================

module.exports = {
    encrypt: encrypt,
    decrypt: decrypt,
    utf8Encode: utf8Encode,
    utf8Decode: utf8Decode,
    base64Encode: base64Encode,
    base64Decode: base64Decode,
    strToLongs: strToLongs,
    longsToStr: longsToStr,
};
