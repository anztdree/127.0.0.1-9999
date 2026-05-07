/**
 * index.js — MAIN-SERVER Entry Point
 *
 * Port: 8001
 * Transport: Socket.IO 2.5.1
 * TEA: ON (XXTEA, password: "verification")
 * Storage: In-memory (user.js)
 * Protocol: handler.process (single event for all actions)
 *
 * Flow:
 *   1. Client connects via Socket.IO
 *   2. Server sends verify challenge
 *   3. Client XXTEA-encrypts challenge with "verification"
 *   4. Client sends encrypted response
 *   5. Server verifies → marks socket as verified
 *   6. Client sends handler.process → server dispatches to registered handler
 */

const path = require('path');
const chalk = require('chalk');
const logger = require('./logger');
const config = require('./config');
const user = require('./user');

// ─── XXTEA Implementation ───
// Matches client-side TEA class in main.min.js
// Key: "verification" → [0x69726576, 0x61636966, 0x6E6F6974, 0x00000000]

const TEA_DELTA = 0x9E3779B9;

/**
 * XXTEA Decrypt — matches main.min.js TEA.prototype.decrypt
 * @param {string} base64Str - Base64 encoded ciphertext
 * @param {string} password - Encryption password
 * @returns {string} Decrypted plaintext
 */
function xxteaDecrypt(base64Str, password) {
    if (!base64Str || base64Str.length === 0) return '';

    const v = strToLongs(Buffer.from(base64Str, 'base64').toString('binary'));
    const k = strToLongs(Buffer.from(password, 'utf8').slice(0, 16).toString('binary'));

    if (v.length === 0) return '';

    const n = v.length;
    const rounds = Math.floor(6 + 52 / n);
    let sum = (rounds * TEA_DELTA) >>> 0;
    let y = v[0];

    while (sum !== 0) {
        const e = (sum >>> 2) & 3;
        for (let p = n - 1; p >= 0; p--) {
            const z = v[p > 0 ? p - 1 : n - 1];
            const mx = (((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (k[(p & 3) ^ e] ^ z))) >>> 0;
            y = v[p] = (v[p] - mx) >>> 0;
        }
        sum = (sum - TEA_DELTA) >>> 0;
    }

    let result = longsToStr(v);
    // Remove null padding
    result = result.replace(/\0+$/, '');
    return result;
}

/**
 * XXTEA Encrypt — matches main.min.js TEA.prototype.encrypt
 * @param {string} plaintext - Text to encrypt
 * @param {string} password - Encryption password
 * @returns {string} Base64 encoded ciphertext
 */
function xxteaEncrypt(plaintext, password) {
    if (!plaintext || plaintext.length === 0) return '';

    let v = strToLongs(Buffer.from(plaintext, 'utf8').toString('binary'));
    if (v.length <= 1) v[1] = 0;

    const k = strToLongs(Buffer.from(password, 'utf8').slice(0, 16).toString('binary'));
    const n = v.length;
    let z = v[n - 1];
    let y = v[0];
    const rounds = Math.floor(6 + 52 / n);
    let sum = 0;

    for (let i = 0; i < rounds; i++) {
        sum = (sum + TEA_DELTA) >>> 0;
        const e = (sum >>> 2) & 3;
        for (let p = 0; p < n; p++) {
            y = v[(p + 1) % n];
            const mx = (((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (k[(p & 3) ^ e] ^ z))) >>> 0;
            z = v[p] = (v[p] + mx) >>> 0;
        }
    }

    return Buffer.from(longsToStr(v), 'binary').toString('base64');
}

/**
 * Convert string to uint32 array (little-endian) — matches client strToLongs
 */
function strToLongs(s) {
    const result = new Array(Math.ceil(s.length / 4));
    for (let i = 0; i < result.length; i++) {
        result[i] = (s.charCodeAt(i * 4) & 0xFF)
                  | ((s.charCodeAt(i * 4 + 1) & 0xFF) << 8)
                  | ((s.charCodeAt(i * 4 + 2) & 0xFF) << 16)
                  | ((s.charCodeAt(i * 4 + 3) & 0xFF) << 24);
        result[i] = result[i] >>> 0;  // Ensure unsigned
    }
    return result;
}

/**
 * Convert uint32 array to string (little-endian) — matches client longsToStr
 */
function longsToStr(arr) {
    const result = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        result[i] = String.fromCharCode(
            arr[i] & 0xFF,
            (arr[i] >>> 8) & 0xFF,
            (arr[i] >>> 16) & 0xFF,
            (arr[i] >>> 24) & 0xFF
        );
    }
    return result.join('');
}

// ─── Socket.IO 2.5.1 Setup ───
const io = require('socket.io')(config.port, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
});

// ─── Handler Registry ───
// Format: { "type.action": handlerFunction }
const handlers = new Map();

/**
 * Register a handler
 * @param {string} type - Handler type (e.g., "user", "hero", "summon")
 * @param {string} action - Handler action (e.g., "enterGame", "levelUp")
 * @param {function} handler - Handler function
 */
function registerHandler(type, action, handler) {
    const key = `${type}.${action}`;
    handlers.set(key, handler);
    logger.log('INFO', 'HANDLER', `Registered: ${key}`);
}

/**
 * Get handler by type and action
 */
function getHandler(type, action) {
    return handlers.get(`${type}.${action}`) || null;
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Build standard response envelope
 * @param {number} ret - 0 for success, error code for failure
 * @param {object|string} data - Data object (will be JSON.stringified) or string
 * @param {boolean} compress - LZString compression flag
 * @returns {object}
 */
function buildResponse(ret, data, compress) {
    return {
        ret: ret,
        data: typeof data === 'string' ? data : JSON.stringify(data),
        compress: compress || false,
        serverTime: Date.now(),
        server0Time: config.server0Time
    };
}

/**
 * Build error response
 */
function buildErrorResponse(errorCode) {
    return buildResponse(errorCode, '', false);
}

// ═══════════════════════════════════════════════════════════════
// LOAD HANDLERS
// ═══════════════════════════════════════════════════════════════

// Load enterGame handler
const enterGame = require('./handlers/user/enterGame');
registerHandler('user', 'enterGame', enterGame);

// Future: register more handlers here
// registerHandler('user', 'gain', require('./handlers/user/gain'));
// registerHandler('summon', 'summonOne', require('./handlers/summon/summonOne'));

// ═══════════════════════════════════════════════════════════════
// VERIFY CHALLENGE GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a random verify challenge string
 * @returns {string} Random 16-char string
 */
function generateChallenge() {
    return crypto.randomBytes(8).toString('hex');
}

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// ACTION COUNTER (per socket)
// ═══════════════════════════════════════════════════════════════

const actionCounters = new Map();

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO CONNECTION HANDLER
// ═══════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
    const socketId = socket.id;
    const clientIp = socket.handshake.address || 'unknown';
    const transport = socket.handshake.query.transport || socket.conn.transport.name || 'websocket';

    // Create session
    user.createSession(socketId, {
        ip: clientIp,
        transport: transport,
        verified: false
    });
    actionCounters.set(socketId, 0);

    logger.log('INFO', 'SOCKET', `Client connected`);
    logger.socketEvent('connect', socketId, clientIp, transport);

    // ─── TEA Verification ───
    // Server sends challenge → client encrypts → client responds → server verifies
    if (config.verifyEnable) {
        const challenge = generateChallenge();
        // Store expected encrypted response
        const expectedResponse = xxteaEncrypt(challenge, config.teaPassword);

        // Store challenge on session for verification
        user.updateSession(socketId, {
            challenge: challenge,
            expectedResponse: expectedResponse
        });

        // Send challenge to client
        socket.emit('verify', challenge);
        logger.log('DEBUG', 'TEA', `Challenge sent to ${socketId.substring(0, 8)}`);
    }

    // ─── Handle verify response from client ───
    socket.on('verify', (encryptedResponse, callback) => {
        const session = user.getSession(socketId);

        if (!session) {
            if (typeof callback === 'function') callback({ ret: 1 });
            return;
        }

        // If verification already passed
        if (session.verified) {
            if (typeof callback === 'function') callback({ ret: 0 });
            return;
        }

        // Decrypt client's response and compare with challenge
        try {
            const decrypted = xxteaDecrypt(encryptedResponse, config.teaPassword);
            const challenge = session.challenge;

            if (decrypted === challenge) {
                user.updateSession(socketId, { verified: true });
                logger.log('INFO', 'TEA', `Verify success — ${socketId.substring(0, 8)}`);
                if (typeof callback === 'function') callback({ ret: 0 });
            } else {
                logger.log('WARN', 'TEA', `Verify failed — response mismatch`);
                logger.details('important',
                    ['expected', challenge],
                    ['got', decrypted],
                    ['socketId', socketId.substring(0, 8)]
                );
                if (typeof callback === 'function') callback({ ret: 55 });
            }
        } catch (err) {
            logger.log('ERROR', 'TEA', `Verify error: ${err.message}`);
            if (typeof callback === 'function') callback({ ret: 1 });
        }
    });

    // ─── Handle handler.process ───
    socket.on('handler.process', async (request, callback) => {
        const actionCounter = (actionCounters.get(socketId) || 0) + 1;
        actionCounters.set(socketId, actionCounter);

        const action = request.action || 'UNKNOWN';
        const actionType = request.type || '';

        // Log request
        logger.log('INFO', 'HANDLER', `[${actionCounter}] handler.process → ${actionType}.${action}`);
        logger.actionLog('req', `${actionType}.${action}`, 'REQ', null,
            `uid=${(request.userId || request.accountToken || '?').substring(0, 12)}`);

        // Verify TEA
        if (config.verifyEnable) {
            const session = user.getSession(socketId);
            if (!session || !session.verified) {
                logger.log('WARN', 'HANDLER', `Unverified socket → ret=38`);
                if (typeof callback === 'function') {
                    callback(buildErrorResponse(38));  // ERROR_LOGIN_CHECK_FAILED
                }
                return;
            }
        }

        // Find handler
        const handler = getHandler(actionType, action);
        if (!handler) {
            logger.log('WARN', 'HANDLER', `Unknown action: ${actionType}.${action}`);
            if (typeof callback === 'function') {
                callback(buildErrorResponse(4));  // ERROR_INVALID
            }
            return;
        }

        try {
            // Execute handler
            const response = await handler(request, socket, { buildResponse, buildErrorResponse, user, config, logger });

            // Log response
            const status = response.ret === 0 ? 'OK' : `ERR=${response.ret}`;
            logger.actionLog('res', `${actionType}.${action}`, response.ret === 0 ? 'OK' : 'ERR',
                null, `ret=${response.ret}`);

            if (typeof callback === 'function') {
                callback(response);
            }
        } catch (err) {
            logger.log('ERROR', 'HANDLER', `Action "${actionType}.${action}" threw error`);
            logger.details('important',
                ['error', err.message],
                ['stack', err.stack ? err.stack.split('\n')[1] : '']
            );

            if (typeof callback === 'function') {
                callback(buildErrorResponse(1));  // ERROR_UNKNOWN
            }
        }
    });

    // ─── Socket Disconnect ───
    socket.on('disconnect', (reason) => {
        const session = user.getSession(socketId);
        const userId = session ? session.userId : 'unknown';
        const aliveMs = session ? Date.now() - session.connectedAt : 0;

        logger.log('INFO', 'SOCKET', `Client disconnected`);
        logger.socketEvent('disconnect', socketId, session ? session.ip : '?', session ? session.transport : '?',
            `uid=${userId.substring(0, 12)} alive=${aliveMs}ms reason=${reason}`);

        // Update offline time
        if (session && session.userId) {
            const gameState = user.get(session.userId);
            if (gameState && gameState.user) {
                gameState.user._offlineTime = Date.now();
            }
        }

        // Cleanup
        user.deleteSession(socketId);
        actionCounters.delete(socketId);
    });

    // ─── Transport upgrade ───
    socket.conn.on('upgrade', (transport) => {
        const session = user.getSession(socketId);
        if (session) {
            session.transport = transport.name;
        }
        logger.log('DEBUG', 'SOCKET', `Transport upgraded → ${transport.name}`);
        logger.detail('data', ['socketId', socketId.substring(0, 8)], ['transport', transport.name]);
    });
});

// ═══════════════════════════════════════════════════════════════
// SERVER STARTUP
// ═══════════════════════════════════════════════════════════════

logger.boundary('🚀', 'SUPER WARRIOR Z — MAIN SERVER');
logger.details('location',
    ['Port', config.port],
    ['Socket.IO', '2.5.1'],
    ['TEA', config.verifyEnable ? 'ON' : 'OFF'],
    ['Storage', 'In-Memory (localStorage)'],
    ['Resources', config.resourcePath],
    ['server0Time', String(config.server0Time)]
);
logger.boundaryEnd('🚀');

// Load resource JSON files
console.log('');
logger.log('INFO', 'RESOURCE', 'Loading resource files...');
const resourceCount = user.loadAllResources();

// Try to load backup data
console.log('');
logger.log('INFO', 'STORAGE', 'Checking for backup data...');
const backupCount = user.loadAll();

// Show registered handlers
console.log('');
logger.log('INFO', 'HANDLER', 'Handlers registered');
const handlerList = Array.from(handlers.keys());
handlerList.forEach((key, i) => {
    const connector = i < handlerList.length - 1 ? '├' : '└';
    console.log(`  ${connector} ⚙️ ${chalk.cyan('handler.process')} → ${chalk.white(key)}`);
});

console.log('');
logger.log('INFO', 'SERVER', `Ready — listening on http://127.0.0.1:${config.port}`);
logger.details('data',
    ['resources', String(resourceCount)],
    ['backupUsers', String(backupCount)],
    ['waiting', 'Socket.IO connections...']
);
