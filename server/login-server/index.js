/**
 * ============================================================================
 * Login Server — Entry Point (Natural Implementation v2.0)
 * Port 8000 — Socket.IO v2, NO TEA encryption
 * ============================================================================
 *
 * NATURAL IMPLEMENTATION:
 * - Removed monkey-patch writeHead for CORS
 * - Using Socket.IO built-in CORS configuration
 * - Clean, maintainable code
 *
 * ============================================================================
 */

const http = require('http');
const express = require('express');
const socketIo = require('socket.io');

const CONSTANTS = require('./config/constants');
const { success, error, ErrorCode } = require('./utils/responseHelper');
const logger = require('./utils/logger');
const DB = require('./services/db');

// Handlers
const { loginGame } = require('./handlers/loginGame');
const { getServerList } = require('./handlers/getServerList');
const { saveHistory } = require('./handlers/saveHistory');
const { loginAnnounce } = require('./handlers/loginAnnounce');
const { saveLanguage } = require('./handlers/saveLanguage');
const { saveUserEnterInfo } = require('./handlers/saveUserEnterInfo');

// Rate Limiter
const RateLimiter = require('./middleware/rateLimiter');

// =============================================
// EXPRESS APP
// =============================================

const app = express();

// CORS Middleware for non-Socket.IO routes (like /health)
app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'login-server',
        version: '2.0.0',
        port: CONSTANTS.PORT,
        host: CONSTANTS.HOST,
        dbReady: DB.isReady(),
        uptime: process.uptime(),
        corsFix: 'natural-socket-io-cors',
        timestamp: new Date().toISOString()
    });
});

// =============================================
// HTTP SERVER + SOCKET.IO
// =============================================

const server = http.createServer(app);

/**
 * Socket.IO v2 CORS Configuration
 * 
 * Natural approach using built-in Socket.IO CORS handling.
 * No monkey-patch required.
 * 
 * For Socket.IO v2, the cors option is available.
 * If using older version, we set origins: '*' with handlePreflightRequest.
 */
const ioOptions = {
    // Serve client library - disabled for API-only server
    serveClient: false,

    // Transports - polling first matches client default
    transports: ['polling', 'websocket'],

    // Disable cookies to avoid CORS complexity
    cookie: false,

    // Ping/pong timing
    pingInterval: CONSTANTS.PING_INTERVAL || 25000,
    pingTimeout: CONSTANTS.PING_TIMEOUT || 60000,

    // Allow transport upgrades
    allowUpgrades: true,
    upgradeTimeout: 30000,

    // CORS configuration for Socket.IO
    // Using handlePreflightRequest for Engine.IO v3 compatibility
    handlePreflightRequest: function(req, res) {
        const origin = req.headers.origin || '*';
        res.writeHead(200, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
        });
        res.end();
    },

    // Allow all connections (auth happens in handlers)
    allowRequest: function(req, callback) {
        callback(null, true);
    }
};

// Apply CORS via origins configuration as backup
// Socket.IO v2 uses 'origins' option
try {
    // Try newer Socket.IO v3/v4 style CORS first
    if (typeof ioOptions.cors === 'undefined') {
        // Set origins for Socket.IO v2
        ioOptions.origins = '*';
    }
} catch (e) {
    // Ignore - we'll use handlePreflightRequest as primary
}

const io = socketIo(server, ioOptions);

// =============================================
// SOCKET.IO CONNECTION
// =============================================

io.on('connection', function(socket) {
    const transport = socket.conn && socket.conn.transport ? socket.conn.transport.name : 'unknown';
    logger.info('Socket', `Connected: ${socket.id} | transport=${transport}`);

    // Log transport upgrades
    if (socket.conn) {
        socket.conn.on('upgrade', function(transport) {
            logger.info('Socket', `Upgrade: ${socket.id} → ${transport.name}`);
        });
    }

    // Handle incoming requests
    socket.on('handler.process', function(payload, callback) {
        handleProcess(socket, payload, callback);
    });

    // Handle disconnect
    socket.on('disconnect', function(reason) {
        logger.info('Socket', `Disconnected: ${socket.id} | reason=${reason}`);
    });

    // Handle errors
    socket.on('error', function(err) {
        logger.error('Socket', `Error: ${socket.id} | ${err.message}`);
    });
});

// =============================================
// REQUEST HANDLER
// =============================================

/**
 * Route handler.process → action handlers
 * 
 * Client sends: { type: "User", action: "loginGame", ... }
 * Server responds: { ret: 0, data: "JSON_STRING", compress: bool, serverTime, server0Time }
 */
async function handleProcess(socket, payload, callback) {
    const action = payload.action;
    const userId = payload.userId || payload.accountToken || '-';
    const clientIp = socket.handshake && socket.handshake.address 
        ? socket.handshake.address 
        : (socket.conn && socket.conn.remoteAddress);

    logger.info('Request', `${action} | userId=${userId} | ip=${clientIp}`);

    try {
        switch (action) {
            case 'loginGame':
                await loginGame(socket, payload, callback, clientIp);
                break;

            case 'GetServerList':
                getServerList(payload, callback);
                break;

            case 'SaveHistory':
                await saveHistory(payload, callback);
                break;

            case 'LoginAnnounce':
                loginAnnounce(callback);
                break;

            case 'SaveLanguage':
                await saveLanguage(payload, callback);
                break;

            case 'SaveUserEnterInfo':
                saveUserEnterInfo(payload, callback);
                break;

            default:
                logger.warn('Request', `Unknown action: ${action}`);
                if (callback) {
                    callback(success({}));
                }
                break;
        }
    } catch (err) {
        logger.error('Request', `Handler error (${action}): ${err.message}`);
        if (callback) {
            callback(error(ErrorCode.UNKNOWN));
        }
    }
}

// =============================================
// GRACEFUL SHUTDOWN
// =============================================

function gracefulShutdown(signal) {
    logger.info('Shutdown', `${signal} received...`);

    io.close();
    server.close(function() {
        DB.close().then(function() {
            logger.info('Shutdown', 'Done');
            process.exit(0);
        }).catch(function() {
            process.exit(0);
        });
    });

    setTimeout(function() {
        logger.warn('Shutdown', 'Forced exit after timeout');
        process.exit(1);
    }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', function(err) {
    logger.error('Error', `Uncaught: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});

// =============================================
// START
// =============================================

async function start() {
    logger.info('Server', 'Starting Login Server v2.0...');

    try {
        // Initialize database
        await DB.init();
        logger.info('Server', 'Database initialized');

        // Start HTTP server
        server.listen(CONSTANTS.PORT, CONSTANTS.HOST, function() {
            printBanner();
            logger.info('Server', `Listening on ${CONSTANTS.HOST}:${CONSTANTS.PORT}`);
        });

    } catch (err) {
        logger.error('Server', `Failed to start: ${err.message}`);
        process.exit(1);
    }
}

// =============================================
// BANNER
// =============================================

function printBanner() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          Super Warrior Z — Login Server v2.0              ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ Port:        ${String(CONSTANTS.PORT).padEnd(41)}║`);
    console.log(`║ Host:        ${String(CONSTANTS.HOST).padEnd(41)}║`);
    console.log(`║ TEA:         OFF (verifyEnable=false)`.padEnd(56) + '║');
    console.log(`║ CORS:        Natural Socket.IO configuration`.padEnd(56) + '║');
    console.log(`║ Transports:  polling, websocket`.padEnd(56) + '║');
    console.log(`║ DB:          ${CONSTANTS.DB.host}:${CONSTANTS.DB.port}/${CONSTANTS.DB.database}`.substring(0, 56).padEnd(56) + '║');
    console.log(`║ server0Time: ${String(CONSTANTS.SERVER_UTC_OFFSET_MS).padEnd(41)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║ Actions:                                                    ║');
    console.log('║   loginGame      → Auto-register + token'.padEnd(56) + '║');
    console.log('║   GetServerList   → Server selection'.padEnd(56) + '║');
    console.log('║   SaveHistory     → Token refresh + daily count'.padEnd(56) + '║');
    console.log('║   LoginAnnounce   → Notices'.padEnd(56) + '║');
    console.log('║   SaveLanguage    → Language preference'.padEnd(56) + '║');
    console.log('║   SaveUserEnterInfo → Analytics'.padEnd(56) + '║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
}

// Start server
start();

module.exports = { server, io };