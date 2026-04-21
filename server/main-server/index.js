/**
 * ============================================================================
 *  Main Server — Super Warrior Z Game Server (Standalone v1)
 *  Port 8001 — Socket.IO v2, TEA verification ENABLED
 *
 *  ARCHITECTURE:
 *    Fully standalone — NO shared/ dependencies
 *    MariaDB for persistent data (same DB as login-server)
 *    Socket.IO v2 (^2.5.1) with Engine.IO v3
 *
 *  CLIENT CONNECTION FLOW (from main.min.js):
 *  ─────────────────────────────────────────
 *  1. After login, client calls ts.clientStartGame()
 *  2. mainClient.connectToServer(serverUrl, successCb, errorCb)
 *  3. TSSocketClient: verifyEnable=true → waits for "verify" event
 *  4. Server emits "verify" with random challenge string
 *  5. Client: (new TEA).encrypt(challenge, "verification") → Base64
 *  6. Client emits "verify" with encrypted Base64 + callback
 *  7. Server decrypts → compares → callback({ret:0}) on success
 *  8. Client sends "handler.process" {type:"user", action:"enterGame", ...}
 *  9. Server responds with full game state
 *  10. Client: UserDataParser.saveUserData() → runScene("OverScene")
 *  11. Client: registChat → connect chat/dungeon servers
 *  12. Server: listenNotify → receive "Notify" pushes
 *
 *  TEA VERIFICATION:
 *  ────────────────────
 *  Key: "verification" (literal string)
 *  Algorithm: XXTEA — 100% ported from client TEA class
 *  Encoding: UTF-8 → strToLongs → XXTEA → longsToStr → Base64
 *
 *  RESPONSE FORMAT:
 *  ──────────────────
 *  { ret: 0, data: "JSON_STRING", compress: boolean, serverTime, server0Time }
 *  Push: { ret: "SUCCESS", data: "JSON_STRING", compress: false, serverTime }
 *
 *  HANDLER ROUTING:
 *  ──────────────────
 *  54 type handlers loaded from handlers/ directory
 *  Single-file handlers: handlers/arena.js, handlers/snake.js, etc.
 *  Folder handlers: handlers/hero/index.js, handlers/guild/index.js, etc.
 *  Each handler exports: { handle: function(socket, parsed, callback) }
 *
 *  CORS FIX:
 *  ─────────
 *  Same writeHead monkey-patch as login-server v3.0
 *  Engine.IO v3 overwrites CORS headers → must intercept at prototype level
 * ============================================================================
 */

var http = require('http');
var fs = require('fs');
var path = require('path');

// =============================================
// 1. CORS FIX — writeHead monkey-patch (BEFORE Socket.IO)
// =============================================
var _originalWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (statusCode, statusMessage, headers) {
    var resHeaders = (typeof statusMessage === 'object' && !headers) ? statusMessage : headers;
    var origin = this.req && this.req.headers && this.req.headers.origin;
    if (origin) {
        var currentOrigin = this.getHeader('Access-Control-Allow-Origin');
        if (currentOrigin === '*' || currentOrigin === null || currentOrigin === undefined) {
            if (resHeaders && resHeaders['Access-Control-Allow-Origin'] === '*') {
                resHeaders['Access-Control-Allow-Origin'] = origin;
                resHeaders['Access-Control-Allow-Credentials'] = 'true';
            } else {
                this.setHeader('Access-Control-Allow-Origin', origin);
                this.setHeader('Access-Control-Allow-Credentials', 'true');
            }
        }
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
// 2. LOAD MODULES
// =============================================
var CONSTANTS = require('./config/constants');
var ResponseHelper = require('./core/responseHelper');
var TEA = require('./core/tea');
var logger = require('./utils/logger');
var DB = require('./services/db');
var NotifyService = require('./services/notifyService');
var Notifications = require('./notifications');
var Scheduler = require('./scheduler');
var GameData = require('./gameData/loader');
var helpers = require('./utils/helpers');

// =============================================
// 3. LOAD HANDLERS DYNAMICALLY
// =============================================
var handlers = {};

(function loadHandlers() {
    var handlersDir = path.join(__dirname, 'handlers');
    if (!fs.existsSync(handlersDir)) {
        logger.warn('Handler', 'handlers/ directory not found');
        return;
    }

    var entries = fs.readdirSync(handlersDir);
    var loaded = 0;
    var failed = [];

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var fullPath = path.join(handlersDir, entry);
        var stat;

        try {
            stat = fs.statSync(fullPath);
        } catch (e) {
            continue;
        }

        if (stat.isDirectory()) {
            // Folder handler (≥11 actions): handlers/hero/index.js
            var indexPath = path.join(fullPath, 'index.js');
            if (fs.existsSync(indexPath)) {
                try {
                    var mod = require(indexPath);
                    if (typeof mod.handle === 'function') {
                        handlers[entry.toLowerCase()] = mod;
                        loaded++;
                    } else {
                        // Placeholder — not yet implemented, skip silently
                    }
                } catch (err) {
                    logger.error('Handler', 'Failed to load ' + entry + '/index.js: ' + err.message);
                    failed.push(entry);
                }
            }
        } else if (stat.isFile() && entry.endsWith('.js')) {
            // Single-file handler: handlers/arena.js
            var handlerName = entry.replace('.js', '');
            try {
                var mod = require(fullPath);
                if (typeof mod.handle === 'function') {
                    handlers[handlerName.toLowerCase()] = mod;
                    loaded++;
                }
            } catch (err) {
                // Placeholder file with no handle() — skip silently
            }
        }
    }

    logger.info('Handler', 'Loaded ' + loaded + ' handlers');
    if (failed.length > 0) {
        logger.warn('Handler', 'Failed: ' + failed.join(', '));
    }
})();

// =============================================
// 4. CONNECTION TRACKING
// =============================================
var connectedClients = {};
var totalConnections = 0;
var activeConnections = 0;

// =============================================
// 5. HTTP SERVER + Socket.IO
// =============================================
var app = function (req, res) {
    if (req.method === 'GET' && req.url === '/health') {
        var clientCount = Object.keys(connectedClients).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            server: 'main',
            port: CONSTANTS.PORT,
            uptime: process.uptime(),
            dbReady: DB.isReady(),
            dataLoaded: GameData.isLoaded(),
            connectedClients: clientCount,
            totalConnections: totalConnections,
            activeConnections: activeConnections,
            handlersLoaded: Object.keys(handlers).length,
            timestamp: new Date().toISOString(),
        }));
        return;
    }
    res.writeHead(404);
    res.end('Not found');
};

var server = http.createServer(app);

var io = require('socket.io')(server, {
    serveClient: false,
    transports: ['polling', 'websocket'],
    cookie: false,
    pingInterval: CONSTANTS.PING_INTERVAL,
    pingTimeout: CONSTANTS.PING_TIMEOUT,
    allowUpgrades: true,
    upgradeTimeout: CONSTANTS.UPGRADE_TIMEOUT,
    handlePreflightRequest: function (req, res) {
        var origin = req.headers.origin || '*';
        res.writeHead(200, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Credentials': 'true',
        });
        res.end();
    },
    allowRequest: function (req, callback) {
        callback(null, true);
    },
});

// =============================================
// 6. SOCKET.IO CONNECTION
// =============================================
io.on('connection', function (socket) {
    totalConnections++;
    activeConnections++;

    var clientIp = socket.handshake.address || 'unknown';
    logger.info('Socket', 'Connected: ' + socket.id + ' | IP=' + clientIp);

    socket._verified = false;
    socket._userId = null;
    socket._verifyAttempts = 0;

    // ─────────────────────────────────────────
    // 6.1 TEA VERIFICATION HANDSHAKE
    // ─────────────────────────────────────────
    //
    // Client code (main.min.js):
    //   socket.on("verify", function(n) {
    //       var o = (new TEA).encrypt(n, "verification");
    //       socket.emit("verify", o, function(n) {
    //           0 == n.ret ? e() : ErrorHandler.ShowErrorTips(n.ret)
    //       })
    //   })
    //
    // Protocol:
    //   1. Server emits "verify" with random challenge
    //   2. Client encrypts with TEA key "verification"
    //   3. Client emits "verify" with Base64 encrypted + ACK callback
    //   4. Server decrypts and compares
    //   5. If match → callback({ret:0, ...}) → client proceeds
    //   6. If fail → callback({ret:38}) → client reloads
    //
    // CRITICAL: callback is Socket.IO acknowledgment.
    // Server MUST call callback() or client HANGS FOREVER.
    // ─────────────────────────────────────────

    var challenge = helpers.randomHex(16);
    logger.info('Verify', 'Challenge sent to ' + socket.id + ': ' + challenge.substring(0, 8) + '...');
    socket.emit('verify', challenge);

    var verifyTimer = setTimeout(function () {
        if (!socket._verified && socket.connected) {
            logger.warn('Verify', 'Timeout for ' + socket.id + ' — disconnecting');
            if (typeof socket._verifyCallback === 'function') {
                socket._verifyCallback(ResponseHelper.error(38, 'Verification timeout'));
            }
            socket.disconnect(true);
        }
    }, CONSTANTS.VERIFY_TIMEOUT_MS);

    function sendVerifyResult(code) {
        if (typeof socket._verifyCallback === 'function') {
            socket._verifyCallback({
                ret: code,
                compress: false,
                serverTime: Date.now(),
                server0Time: CONSTANTS.SERVER_UTC_OFFSET_MS,
            });
            socket._verifyCallback = null;
        }
    }

    socket.on('verify', function (encryptedResponse, callback) {
        socket._verifyCallback = callback;
        socket._verifyAttempts++;

        if (socket._verified) {
            sendVerifyResult(0);
            return;
        }

        if (!encryptedResponse) {
            logger.warn('Verify', 'Empty response from ' + socket.id);
            if (socket._verifyAttempts >= CONSTANTS.VERIFY_MAX_ATTEMPTS) {
                clearTimeout(verifyTimer);
                sendVerifyResult(38);
                socket.disconnect(true);
            } else {
                sendVerifyResult(4);
            }
            return;
        }

        // Decrypt the response and compare with original challenge
        var decrypted;
        try {
            decrypted = TEA.decrypt(encryptedResponse, CONSTANTS.TEA_KEY);
        } catch (err) {
            logger.error('Verify', 'Decrypt error from ' + socket.id + ': ' + err.message);
            if (socket._verifyAttempts >= CONSTANTS.VERIFY_MAX_ATTEMPTS) {
                clearTimeout(verifyTimer);
                sendVerifyResult(38);
                socket.disconnect(true);
            } else {
                sendVerifyResult(4);
            }
            return;
        }

        if (decrypted === challenge) {
            socket._verified = true;
            clearTimeout(verifyTimer);
            logger.info('Verify', socket.id + ' verified (attempt ' + socket._verifyAttempts + ')');
            sendVerifyResult(0);
        } else {
            logger.warn('Verify', 'Invalid from ' + socket.id + ' (attempt ' + socket._verifyAttempts + '/' + CONSTANTS.VERIFY_MAX_ATTEMPTS + ')');
            if (socket._verifyAttempts >= CONSTANTS.VERIFY_MAX_ATTEMPTS) {
                clearTimeout(verifyTimer);
                sendVerifyResult(38);
                socket.disconnect(true);
            } else {
                sendVerifyResult(38);
            }
        }
    });

    // ─────────────────────────────────────────
    // 6.2 MAIN REQUEST HANDLER — "handler.process"
    // ─────────────────────────────────────────
    socket.on('handler.process', function (request, callback) {
        if (!socket._verified) {
            ResponseHelper.sendResponse(socket, 'handler.process',
                ResponseHelper.error(ResponseHelper.ErrorCode.SESSION_EXPIRED), callback);
            return;
        }

        if (!request) {
            ResponseHelper.sendResponse(socket, 'handler.process',
                ResponseHelper.error(ResponseHelper.ErrorCode.DATA_ERROR), callback);
            return;
        }

        var parsed = ResponseHelper.parseRequest(request);
        if (!parsed) {
            ResponseHelper.sendResponse(socket, 'handler.process',
                ResponseHelper.error(ResponseHelper.ErrorCode.INVALID), callback);
            return;
        }

        var type = parsed.type;
        var action = parsed.action;
        var userId = parsed.userId || '-';

        logger.info('Request', type + '.' + action + ' | userId=' + userId);

        // Track user connection (single-session enforcement)
        if (parsed.userId) {
            if (connectedClients[parsed.userId] &&
                connectedClients[parsed.userId] !== socket &&
                connectedClients[parsed.userId].connected) {
                logger.info('Connection', 'Duplicate login userId=' + parsed.userId + ' — kicking old session');
                Notifications.kickUser(connectedClients[parsed.userId], 'Logged in from another device');
            }
            connectedClients[parsed.userId] = socket;
            socket._userId = parsed.userId;
        }

        // Route to handler
        var handler = handlers[type.toLowerCase()];

        if (handler && typeof handler.handle === 'function') {
            try {
                handler.handle(socket, parsed, callback);
            } catch (err) {
                logger.error('Request', 'Handler error (' + type + '.' + action + '): ' + err.message);
                ResponseHelper.sendResponse(socket, 'handler.process',
                    ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
            }
        } else {
            logger.info('Request', 'Unknown type: ' + type + ' (action=' + action + ')');
            ResponseHelper.sendResponse(socket, 'handler.process',
                ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
        }
    });

    // ─────────────────────────────────────────
    // 6.3 DISCONNECT
    // ─────────────────────────────────────────
    socket.on('disconnect', function (reason) {
        activeConnections--;
        clearTimeout(verifyTimer);

        if (socket._userId && connectedClients[socket._userId] === socket) {
            delete connectedClients[socket._userId];
        }

        logger.info('Socket', 'Disconnected: ' + socket.id + ' | reason=' + reason +
            ' | verified=' + (socket._verified ? 'yes' : 'no') + ' | active=' + activeConnections);
    });

    socket.on('error', function (err) {
        logger.error('Socket', 'Error ' + socket.id + ': ' + err.message);
    });
});

// =============================================
// 7. GRACEFUL SHUTDOWN
// =============================================
function gracefulShutdown(signal) {
    logger.info('Shutdown', signal + ' received...');

    Scheduler.shutdown();

    var keys = Object.keys(connectedClients);
    for (var i = 0; i < keys.length; i++) {
        try { connectedClients[keys[i]].disconnect(true); } catch (e) {}
    }

    io.close(function () {
        DB.close().then(function () {
            server.close(function () {
                process.exit(0);
            });
        }).catch(function () {
            server.close(function () {
                process.exit(0);
            });
        });
    });

    setTimeout(function () {
        logger.error('Shutdown', 'Forced exit');
        process.exit(1);
    }, 10000);
}

process.on('SIGINT', function () { gracefulShutdown('SIGINT'); });
process.on('SIGTERM', function () { gracefulShutdown('SIGTERM'); });
process.on('uncaughtException', function (err) {
    logger.error('Error', 'Uncaught: ' + err.message);
    console.error(err.stack);
});

// =============================================
// 8. START
// =============================================
async function start() {
    try {
        await DB.init();
    } catch (err) {
        logger.error('Start', 'DB failed: ' + err.message);
        process.exit(1);
    }

    try {
        await GameData.load();
    } catch (err) {
        logger.warn('Start', 'GameData load failed: ' + err.message);
    }

    // Init notification system with client map
    Notifications.init(connectedClients);
    Scheduler.initAll(connectedClients);

    server.listen(CONSTANTS.PORT, CONSTANTS.HOST, function () {
        console.log('');
        console.log('  =====================================================');
        console.log('    Super Warrior Z — Main Server (Standalone v1)');
        console.log('  =====================================================');
        console.log('    Port:           ' + CONSTANTS.PORT);
        console.log('    Host:           ' + CONSTANTS.HOST);
        console.log('    TEA:            ON (key: "' + CONSTANTS.TEA_KEY + '")');
        console.log('    CORS FIX:       v3 — writeHead monkey-patch');
        console.log('    Cookie:         DISABLED');
        console.log('    Transports:     polling, websocket');
        console.log('    DB:             ' + CONSTANTS.DB.host + ':' + CONSTANTS.DB.port + '/' + CONSTANTS.DB.database);
        console.log('    server0Time:    ' + CONSTANTS.SERVER_UTC_OFFSET_MS);
        console.log('  ----------------------------------------------------');
        console.log('    Handlers:       ' + Object.keys(handlers).length + ' loaded');
        console.log('    Notify actions: ' + Object.keys(Notifications.ActionTypes).length + ' types');
        console.log('    DB:             ' + (DB.isReady() ? 'CONNECTED' : 'NOT CONNECTED'));
        console.log('    Game Data:      ' + (GameData.isLoaded() ? GameData.getStats().fileCount + ' files' : 'NOT LOADED'));

        var stats = GameData.getStats();
        if (GameData.isLoaded()) {
            console.log('    Load Time:      ' + stats.loadTimeMs + 'ms');
        }

        console.log('  =====================================================');
        console.log('');
        console.log('  Waiting for client connections...');
        console.log('');
    });
}

server.on('error', function (err) {
    if (err.code === 'EADDRINUSE') {
        logger.error('Start', 'Port ' + CONSTANTS.PORT + ' already in use!');
    } else {
        logger.error('Start', err.message);
    }
    process.exit(1);
});

start();
