/**
 * ============================================================================
 *  Login Server — Super Warrior Z (Dragon Ball Z)
 *  Port 8000 — Socket.IO v2, NO TEA encryption
 *  Version: 3.0 — ROOT CAUSE FIX: Engine.IO CORS override
 * ============================================================================
 *
 *  ROOT CAUSE (v3.0 — CONFIRMED by reading all source):
 *  ──────────────────────────────────────────────────────
 *  Socket.IO v2 uses Engine.IO v3 internally.
 *  Engine.IO v3 handles polling requests in polling.js:
 *
 *    res.writeHead(200, {
 *      'Access-Control-Allow-Origin': '*',
 *      ...
 *    });
 *
 *  When origins:'*:*' is set, Engine.IO sets ACAO:* on EVERY polling
 *  response (GET/POST data, not just OPTIONS preflight).
 *
 *  Express CORS middleware sets correct headers FIRST, but Engine.IO's
 *  res.writeHead() OVERWRITES them because writeHead replaces headers.
 *
 *  Client bundled code (Engine.IO client) sends:
 *    xhr.withCredentials = true
 *
 *  Browser CORS policy REJECTS response when ACAO:* + credentials:true.
 *  Result: "xhr poll error"
 *
 *  PREVIOUS FIX ATTEMPTS (v1, v2) FAILED because:
 *  - Express CORS middleware runs FIRST but gets OVERWRITTEN by Engine.IO
 *  - handlePreflightRequest only handles OPTIONS, not actual GET/POST
 *  - cookie:false doesn't help — withCredentials is hardcoded in client
 *
 *  V3 FIX:
 *  Monkey-patch http.ServerResponse.prototype.writeHead to intercept
 * ALL responses (including from Engine.IO) and fix CORS headers
 * BEFORE they're sent to the browser.
 *
 *  CLIENT CONNECTION FLOW (from main.min.js):
 *  ─────────────────────────────────────────
 *  1. TSBrowser.executeFunction("getLoginServer") → sdk.js returns null
 *  2. RES.getResByUrl("serversetting.json") → {loginserver:"http://127.0.0.1:8000"}
 *  3. loginClient.connectToServer("http://127.0.0.1:8000")
 *  4. Socket.IO v2 client → EIO=3 → transport=polling → xhr withCredentials:true
 *  5. Server responds → browser checks CORS → MUST have ACAO=origin (not *)
 *  6. NO TEA on login: verifyEnable=false → no "verify" event handshake
 *
 *  SDK LOGIN PATH:
 *     sdk.js → getSdkLoginInfo() → URL params →
 *     sdkLoginSuccess() → ts.loginInfo.userInfo set →
 *     clientRequestServerList → [GetServerList] →
 *     getNotice → [LoginAnnounce] →
 *     startBtnTap → [SaveHistory] →
 *     ts.loginClient.destroy() + ts.clientStartGame(false) → main-server
 *
 *  ACTIONS (6 total):
 *     loginGame          → auto-register + login + token
 *     GetServerList      → server selection screen
 *     SaveHistory        → token refresh + daily login count
 *     LoginAnnounce      → notices (default: empty)
 *     SaveLanguage       → language preference
 *     SaveUserEnterInfo  → analytics (after enterGame)
 *
 *  RESPONSE FORMAT:
 *     { ret: 0, data: "JSON_STRING", compress: boolean, serverTime, server0Time }
 *
 *  ARCHITECTURE:
 *     Fully standalone — NO shared/ dependencies
 *     MariaDB for persistent data (users, login_tokens)
 *     Socket.IO v2 (^2.5.1) with Engine.IO v3
 *
 * ============================================================================
 */

var http = require('http');
var express = require('express');
var socketIo = require('socket.io');
var path = require('path');

// =============================================
// CRITICAL FIX: Monkey-patch writeHead for CORS
// =============================================
// This MUST run before Socket.IO is created.
// Engine.IO v3 internally calls res.writeHead(200, {ACAO: '*', ...}) on
// polling responses, which overwrites any headers set by Express middleware.
//
// By patching writeHead at the prototype level, we intercept ALL responses
// (Express, Engine.IO, static files, everything) and ensure correct CORS
// headers when the request has an Origin header (cross-origin request).
//
// This is the ONLY reliable way to fix CORS when Engine.IO overrides headers.

var _originalWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (statusCode, statusMessage, headers) {
    // Normalize arguments: writeHead(statusCode, headers) or writeHead(statusCode, statusMessage, headers)
    var resHeaders = (typeof statusMessage === 'object' && !headers) ? statusMessage : headers;

    // Only fix CORS for cross-origin requests (has Origin header)
    var origin = this.req && this.req.headers && this.req.headers.origin;
    if (origin) {
        // Check if Engine.IO/Socket.IO set ACAO to wildcard
        var currentOrigin = this.getHeader('Access-Control-Allow-Origin');
        if (currentOrigin === '*' || currentOrigin === null || currentOrigin === undefined) {
            // Fix: echo the requesting origin (required when withCredentials:true)
            if (resHeaders && resHeaders['Access-Control-Allow-Origin'] === '*') {
                resHeaders['Access-Control-Allow-Origin'] = origin;
                resHeaders['Access-Control-Allow-Credentials'] = 'true';
            } else {
                this.setHeader('Access-Control-Allow-Origin', origin);
                this.setHeader('Access-Control-Allow-Credentials', 'true');
            }
        }
        // Ensure credentials header is present
        var credentials = this.getHeader('Access-Control-Allow-Credentials');
        if (credentials !== 'true') {
            if (resHeaders && !resHeaders['Access-Control-Allow-Credentials']) {
                resHeaders['Access-Control-Allow-Credentials'] = 'true';
            } else if (!resHeaders) {
                this.setHeader('Access-Control-Allow-Credentials', 'true');
            }
        }
    }

    return _originalWriteHead.apply(this, arguments);
};

// =============================================
// Load modules AFTER monkey-patch
// =============================================

var CONSTANTS = require('./config/constants');
var { success, error, ErrorCode } = require('./utils/responseHelper');
var logger = require('./utils/logger');
var DB = require('./services/db');

// Handlers
var { loginGame } = require('./handlers/loginGame');
var { getServerList } = require('./handlers/getServerList');
var { saveHistory } = require('./handlers/saveHistory');
var { loginAnnounce } = require('./handlers/loginAnnounce');
var { saveLanguage } = require('./handlers/saveLanguage');
var { saveUserEnterInfo } = require('./handlers/saveUserEnterInfo');

// =============================================
// Express App
// =============================================
var app = express();

// =============================================
// CORS Middleware — Express-level backup
// =============================================
// This handles non-Socket.IO routes (like /health).
// Socket.IO routes are handled by the writeHead patch above.

app.use(function (req, res, next) {
    var origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Login-Token, X-User-Id');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

// =============================================
// Socket.IO — v2 Configuration
// =============================================
var server = http.createServer(app);

var io = socketIo(server, {
    // Transports — polling first (matches client default order)
    transports: ['polling', 'websocket'],

    // CRITICAL: Disable cookie — prevents unnecessary CORS complexity
    // Client sends withCredentials:true but we don't need cookies for game auth
    cookie: false,

    // Timing — generous for private server
    pingInterval: 25000,
    pingTimeout: 60000,

    // Upgrade
    allowUpgrades: true,
    upgradeTimeout: 30000,

    // Engine.IO preflight handler — handles OPTIONS /socket.io/?EIO=3&transport=polling
    // NOTE: The writeHead patch above is the primary CORS fix.
    // This handlePreflightRequest is a secondary safety net.
    handlePreflightRequest: function (req, res) {
        var origin = req.headers.origin || '*';
        var headers = {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
        };
        res.writeHead(200, headers);
        res.end();
    },

    // Always allow connections
    allowRequest: function (req, callback) {
        callback(null, true);
    },
});

// =============================================
// Route handler.process → action handlers
// =============================================

async function handleProcess(socket, payload, callback) {
    var action = payload.action;
    var userId = payload.userId || payload.accountToken || '-';
    logger.info('Request', action + ' | userId=' + userId);

    var clientIp = socket.handshake.address || socket.conn.remoteAddress;

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
                logger.info('Request', 'Unknown action: ' + action + ' → success');
                if (callback) callback(success({}));
                break;
        }
    } catch (err) {
        logger.error('Request', 'Handler error (' + action + '): ' + err.message);
        if (callback) callback(error(ErrorCode.UNKNOWN));
    }
}

// =============================================
// Socket.IO Connection
// =============================================
io.on('connection', function (socket) {
    logger.info('Socket', 'Connected: ' + socket.id + ' | transports=' + (socket.conn.transport ? socket.conn.transport.name : '?'));

    // Log transport upgrades
    socket.conn.on('upgrade', function (transport) {
        logger.info('Socket', 'Upgrade: ' + socket.id + ' → ' + transport.name);
    });

    socket.on('handler.process', function (payload, callback) {
        handleProcess(socket, payload, callback);
    });

    socket.on('disconnect', function (reason) {
        logger.info('Socket', 'Disconnected: ' + socket.id + ' | reason=' + reason);
    });

    socket.on('error', function (err) {
        logger.error('Socket', 'Error: ' + socket.id + ' | ' + err.message);
    });
});

// =============================================
// Health endpoint
// =============================================
app.get('/health', function (req, res) {
    res.json({
        status: 'ok',
        port: CONSTANTS.PORT,
        dbReady: DB.isReady(),
        uptime: process.uptime(),
        corsFix: 'v3-writeHead-patch',
    });
});

// =============================================
// Start
// =============================================
async function start() {
    try {
        // Init database
        await DB.init();

        server.listen(CONSTANTS.PORT, CONSTANTS.HOST, function () {
            console.log('');
            console.log('  =====================================================');
            console.log('    Super Warrior Z — Login Server (Standalone v3.0)');
            console.log('  =====================================================');
            console.log('    Port:           ' + CONSTANTS.PORT);
            console.log('    Host:           ' + CONSTANTS.HOST);
            console.log('    TEA:            OFF (verifyEnable=false)');
            console.log('    CORS FIX:       v3 — writeHead monkey-patch');
            console.log('    Cookie:         DISABLED');
            console.log('    Transports:     polling, websocket');
            console.log('    DB:             ' + CONSTANTS.DB.host + ':' + CONSTANTS.DB.port + '/' + CONSTANTS.DB.database);
            console.log('    server0Time:    ' + CONSTANTS.SERVER_UTC_OFFSET_MS);
            console.log('  ----------------------------------------------------');
            console.log('    Actions:');
            console.log('      loginGame          → Auto-register + token');
            console.log('      GetServerList      → Server selection');
            console.log('      SaveHistory        → Token refresh');
            console.log('      LoginAnnounce      → Notices');
            console.log('      SaveLanguage       → Language preference');
            console.log('      SaveUserEnterInfo  → Analytics');
            console.log('  =====================================================');
            console.log('');
        });

    } catch (err) {
        logger.error('Start', 'Failed: ' + err.message);
        process.exit(1);
    }
}

// =============================================
// Graceful Shutdown
// =============================================
function gracefulShutdown(signal) {
    logger.info('Shutdown', signal + ' received...');
    io.close();
    server.close(function () {
        DB.close().then(function () {
            logger.info('Shutdown', 'Done');
            process.exit(0);
        });
    });
    setTimeout(function () {
        logger.warn('Shutdown', 'Forced exit after timeout');
        process.exit(1);
    }, 5000);
}

process.on('SIGINT', function () { gracefulShutdown('SIGINT'); });
process.on('SIGTERM', function () { gracefulShutdown('SIGTERM'); });
process.on('uncaughtException', function (err) {
    logger.error('Error', 'Uncaught: ' + err.message);
    console.error(err.stack);
});

start();
