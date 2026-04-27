/**
 * tea.js — TEA Encryption / Decryption
 *
 * EXACT match dengan client implementation di main.min(unminfy).js lines 117041-117091
 *
 * Key:           'verification' (12 chars)
 * Endianness:    LITTLE-ENDIAN per 4-byte chunk
 * Delta:         0x9E3779B9 (golden ratio constant)
 * Output:        Base64 encoded
 * Min blocks:    2 (jika input <= 1 block, n[1] = 0)
 * Rounds:        Math.floor(6 + 52 / n)  where n = jumlah uint32 blocks
 *
 * Client flow:
 *   Server emit 'verify' → challenge (32-hex string)
 *   Client: TEA.encrypt(challenge, 'verification') → Base64 → emit 'verify'
 *   Server: TEA.decrypt(response, 'verification') → compare with challenge
 */

var TEA_KEY = 'verification';
var DELTA = 0x9E3779B9;

// ============================================================
// LITTLE-ENDIAN conversions (EXACT match client)
// ============================================================

/**
 * Convert string → array of uint32 (LITTLE-ENDIAN per 4-char chunk)
 * Client line 117081-117087:
 *   t[n] = e.charCodeAt(4*n) + (e.charCodeAt(4*n+1) << 8) +
 *          (e.charCodeAt(4*n+2) << 16) + (e.charCodeAt(4*n+3) << 24)
 */
function strToLongs(str) {
    var len = Math.ceil(str.length / 4);
    var result = new Array(len);
    for (var i = 0; i < len; i++) {
        result[i] = str.charCodeAt(4 * i) +
            (str.charCodeAt(4 * i + 1) << 8) +
            (str.charCodeAt(4 * i + 2) << 16) +
            (str.charCodeAt(4 * i + 3) << 24);
    }
    return result;
}

/**
 * Convert array of uint32 → string (LITTLE-ENDIAN per 4-byte chunk)
 * Client line 117089-117095:
 *   String.fromCharCode(255 & e[n], e[n] >>> 8 & 255,
 *                       e[n] >>> 16 & 255, e[n] >>> 24 & 255)
 */
function longsToStr(longs) {
    var parts = [];
    for (var i = 0; i < longs.length; i++) {
        parts.push(
            String.fromCharCode(
                longs[i] & 0xFF,
                (longs[i] >>> 8) & 0xFF,
                (longs[i] >>> 16) & 0xFF,
                (longs[i] >>> 24) & 0xFF
            )
        );
    }
    return parts.join('');
}

// ============================================================
// Base64 encode/decode (match client implementation)
// ============================================================

var B64CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function base64Encode(str) {
    var buf = Buffer.alloc(str.length, 'binary');
    for (var i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i);
    }
    return buf.toString('base64');
}

function base64Decode(b64) {
    var buf = Buffer.from(b64, 'base64');
    var str = '';
    for (var i = 0; i < buf.length; i++) {
        str += String.fromCharCode(buf[i]);
    }
    return str;
}

// ============================================================
// TEA Encrypt (for testing — server mainly needs decrypt)
// ============================================================

function encrypt(plaintext, key) {
    if (!plaintext || plaintext.length === 0) return '';

    var n = strToLongs(plaintext);
    // Client: n.length <= 1 && (n[1] = 0)
    if (n.length <= 1) {
        n[1] = 0;
    }

    var k = strToLongs(key.slice(0, 16));
    var numBlocks = n.length;
    var s = n[numBlocks - 1];  // last element
    var l = n[0];              // first element
    var rounds = Math.floor(6 + 52 / numBlocks);
    var sum = 0;

    while (rounds-- > 0) {
        sum = (sum + DELTA) | 0;
        var a = (sum >>> 2) & 3;

        for (var d = 0; d < numBlocks; d++) {
            l = n[(d + 1) % numBlocks];
            // Client line 117055-117056:
            // o = (s >>> 5 ^ l << 2) + (l >>> 3 ^ s << 4) ^ (p ^ l) + (r[3 & d ^ a] ^ s)
            var o = ((s >>> 5 ^ l << 2)) +
                    ((l >>> 3 ^ s << 4)) ^
                    ((sum ^ l) + (k[(3 & d) ^ a] ^ s));
            s = n[d] = (n[d] + o) | 0;
        }
    }

    // Client: return Base64.encode(longsToStr(n))
    return base64Encode(longsToStr(n));
}

// ============================================================
// TEA Decrypt (used for verify handshake)
// ============================================================

function decrypt(ciphertext, key) {
    if (!ciphertext || ciphertext.length === 0) return '';

    // Client: var n, o, a = this.strToLongs(Base64.decode(e))
    var n = strToLongs(base64Decode(ciphertext));
    var k = strToLongs(key.slice(0, 16));
    var numBlocks = n.length;
    var s = n[numBlocks - 1];
    var l = n[0];
    var rounds = Math.floor(6 + 52 / numBlocks);
    var sum = (rounds * DELTA) | 0;

    while (sum !== 0) {
        var a = (sum >>> 2) & 3;

        for (var d = numBlocks - 1; d >= 0; d--) {
            s = n[d > 0 ? d - 1 : numBlocks - 1];
            // Client line 117069-117070:
            // n = (s >>> 5 ^ l << 2) + (l >>> 3 ^ s << 4) ^ (p ^ l) + (r[3 & d ^ o] ^ s)
            var o = ((s >>> 5 ^ l << 2)) +
                    ((l >>> 3 ^ s << 4)) ^
                    ((sum ^ l) + (k[(3 & d) ^ a] ^ s));
            l = n[d] = (n[d] - o) | 0;
        }

        sum = (sum - DELTA) | 0;
    }

    // Client: g = g.replace(/\0+$/, ''), Utf8.decode(g)
    var result = longsToStr(n);
    // Trim trailing null bytes
    result = result.replace(/\0+$/, '');
    return result;
}

// ============================================================
// Self-test (run on require)
// ============================================================

(function selfTest() {
    try {
        var testMsg = 'HelloTEA1234';  // 12 chars = 3 blocks
        var encrypted = encrypt(testMsg, TEA_KEY);
        var decrypted = decrypt(encrypted, TEA_KEY);
        if (decrypted === testMsg) {
            console.log('[TEA] Self-test PASSED (encrypt→decrypt roundtrip OK)');
        } else {
            console.error('[TEA] Self-test FAILED: expected "' + testMsg + '", got "' + decrypted + '"');
        }
    } catch (e) {
        console.error('[TEA] Self-test ERROR: ' + e.message);
    }
})();

module.exports = {
    TEA_KEY: TEA_KEY,
    encrypt: encrypt,
    decrypt: decrypt
};
