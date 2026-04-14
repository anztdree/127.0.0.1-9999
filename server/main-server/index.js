/**
 * =====================================================
 *  Main Server — Super Warrior Z Game Server
 *  Port 8001
 *
 *  Main server adalah game server utama yang menangani
 *  seluruh gameplay logic client setelah login.
 *
 *  Fungsi:
 *    1. TEA handshake verification sebelum processing
 *    2. Routing 60+ type handlers (hero, arena, guild, dll)
 *    3. Connection tracking per userId
 *    4. Health check endpoint
 *
 *  Perbedaan dengan Login Server:
 *    - Wajib TEA verification sebelum request diproses
 *    - Dynamic handler loading dari ./handlers/
 *    - 60 type handler routes
 *
 *  TEA Verification Protocol:
 *    1. Server emit "verify" dengan random challenge string
 *    2. Client encrypt challenge dengan TEA key "verification"
 *    3. Client emit "verify" dengan encrypted result
 *    4. Server decrypt dan cek kecocokan
 *    5. Jika cocok, socket._verified = true
 *    6. Jika tidak, disconnect setelah timeout
 *
 *  Handler Routing:
 *    Client mengirim: { type, action, userId, ...params }
 *    Server route ke handler: handlers/<type>.js
 *    Handler method: handler.handle(socket, parsedRequest, callback)
 *
 *  Usage:
 *    npm run main
 *    node main-server/index.js
 * =====================================================
 */

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

// =============================================
// 1. LOAD CONFIGURATION
// =============================================
var config = require('../shared/config');
config.validateConfig();

var SERVER_PORT = config.config.servers.main.port;
var SERVER_HOST = config.config.servers.main.host;
var TEA_KEY = config.config.security.teaKey || 'verification';

console.log('');
console.log('================================================');
console.log('  Super Warrior Z — Main Server');
console.log('================================================');

// =============================================
// 2. INITIALIZE DATABASE
// =============================================
var DB = require('../database/connection');

// =============================================
// 3. LOAD GAME DATA
// =============================================
var GameData = require('../shared/gameData/loader');

// =============================================
// 4. LOAD SHARED UTILITIES
// =============================================
var ResponseHelper = require('../shared/responseHelper');
var TEA = require('../shared/tea');

// =============================================
// 5. LOAD ALL HANDLERS DYNAMICALLY
// =============================================

/**
 * Handler registry — maps type names to handler modules.
 * Key: lowercase type string (e.g. 'hero', 'arena')
 * Value: handler module with .handle(socket, parsed, callback) method
 *
 * Handlers are loaded from ./handlers/ directory:
 *   - All .js files in ./handlers/ (except 'activity' which is a subfolder)
 *   - ./handlers/activity/index.js loaded as special sub-routing handler
 *
 * @type {Object.<string, *>}
 */
var handlers = {};

(function loadHandlers() {
    var handlersDir = path.join(__dirname, 'handlers');

    // Ensure handlers directory exists
    if (!fs.existsSync(handlersDir)) {
        console.warn('[Handlers] WARNING: handlers directory not found: ' + handlersDir);
        console.warn('[Handlers] Server will start but no handlers will be loaded.');
        return;
    }

    // Read all entries in the handlers directory
    var entries = fs.readdirSync(handlersDir);
    var loadedCount = 0;
    var failedLoads = [];

    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var fullPath = path.join(handlersDir, entry);
        var stat = fs.statSync(fullPath);

        // Skip non-files and non-.js files
        if (!stat.isFile() || !entry.endsWith('.js')) {
            continue;
        }

        // Extract handler name from filename (without .js)
        var handlerName = entry.replace('.js', '');

        try {
            handlers[handlerName.toLowerCase()] = require(fullPath);
            loadedCount++;
        } catch (err) {
            console.error('[Handlers] Failed to load handler "' + handlerName + '": ' + err.message);
            failedLoads.push(handlerName);
        }
    }

    // Special handling: load activity subfolder handler
    var activityPath = path.join(handlersDir, 'activity', 'index.js');
    if (fs.existsSync(activityPath)) {
        try {
            handlers['activity'] = require(activityPath);
            loadedCount++;
        } catch (err) {
            console.error('[Handlers] Failed to load activity handler: ' + err.message);
            failedLoads.push('activity');
        }
    } else {
        console.warn('[Handlers] WARNING: activity handler not found at ' + activityPath);
    }

    console.log('[Handlers] Loaded ' + loadedCount + ' handlers');
    if (failedLoads.length > 0) {
        console.warn('[Handlers] Failed to load: ' + failedLoads.join(', '));
    }
})();

// =============================================
// 6. CREATE HTTP SERVER & Socket.IO
// =============================================

/**
 * Create HTTP server with health check endpoint
 */
var server = http.createServer(function (req, res) {
    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
        var clientCount = Object.keys(connectedClients).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            server: 'main',
            port: SERVER_PORT,
            uptime: process.uptime(),
            dbReady: DB.isReady(),
            dataLoaded: GameData.isLoaded(),
            connectedClients: clientCount,
            totalConnections: totalConnections,
            activeConnections: activeConnections,
            handlersLoaded: Object.keys(handlers).length,
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

/**
 * Socket.IO instance with production-ready configuration
 */
var io = require('socket.io')(server, {
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 5000,
    cookie: false,
    transports: ['websocket', 'polling']
});

// =============================================
// 7. CONNECTION TRACKING
// =============================================

/**
 * Map of connected clients keyed by userId.
 * Used for:
 *   - Tracking online users
 *   - Push notifications to specific users
 *   - Disconnecting users on duplicate login
 *
 * @type {Object.<number, Object>}
 */
var connectedClients = {};

/** @type {number} Total connections since server start */
var totalConnections = 0;

/** @type {number} Currently active connections */
var activeConnections = 0;

// =============================================
// 8. TEA VERIFICATION CONFIGURATION
// =============================================

/** @type {number} Verification timeout in ms (15 seconds) */
var VERIFY_TIMEOUT = 15000;

/**
 * Max verification attempts per connection.
 * After exceeding, socket is disconnected.
 * @type {number}
 */
var VERIFY_MAX_ATTEMPTS = 3;

// =============================================
// 9. CONNECTION HANDLING
// =============================================

/**
 * Handle new Socket.IO connection.
 *
 * Flow:
 *   1. Increment connection counters
 *   2. Log client info (ID, IP)
 *   3. Start TEA verification handshake
 *   4. If verified, listen for "handler.process" events
 *   5. Handle disconnect and errors
 */
io.on('connection', function (socket) {
    totalConnections++;
    activeConnections++;

    var clientIp = socket.handshake.address ||
        socket.handshake.headers['x-forwarded-for'] ||
        'unknown';

    console.log('[Connection] New client connected (ID: ' + socket.id +
        ', IP: ' + clientIp + ')');

    // Log total connections periodically
    if (totalConnections % 100 === 0) {
        console.log('[Stats] Total connections: ' + totalConnections);
    }

    // Initialize socket state
    socket._verified = false;
    socket._userId = null;
    socket._verifyAttempts = 0;

    // =============================================
    // 9.1 TEA VERIFICATION HANDSHAKE
    // =============================================

    /**
     * Generate and send a random challenge to the client.
     * Client must encrypt this challenge with TEA and send it back.
     */
    var challenge = TEA.generateChallenge();
    socket._challenge = challenge;

    console.log('[Verify] Sending challenge to socket ' + socket.id);
    socket.emit('verify', challenge);

    /**
     * Verification timeout — disconnect if not verified in time.
     */
    var verifyTimer = setTimeout(function () {
        if (!socket._verified && socket.connected) {
            console.warn('[Verify] Timeout for socket ' + socket.id +
                ' — disconnecting');
            socket.emit('verifyFailed', 'Verification timeout');
            socket.disconnect(true);
        }
    }, VERIFY_TIMEOUT);

    /**
     * Handle "verify" event from client.
     *
     * CLIENT CODE (line 52006-52013):
     *   socket.on("verify", function(n) {           // receive challenge
     *       var o = (new TEA).encrypt(n, "verification");
     *       socket.emit("verify", o, function(n) {   // send encrypted + CALLBACK
     *           0 == n.ret ? e() : ErrorHandler.ShowErrorTips(n.ret)
     *       })
     *   })
     *
     * Protocol:
     *   1. Server sends challenge string via "verify"
     *   2. Client encrypts challenge with TEA key
     *   3. Client emits "verify" with encrypted + ACK callback
     *   4. Server decrypts and compares
     *   5. If match → callback({ ret: 0 }) → client proceeds
     *   6. If no match → callback({ ret: errorCode }) → client shows error
     *
     * CRITICAL: The callback is Socket.IO acknowledgment.
     * Client sends: socket.emit("verify", encrypted, function(n) { ... })
     * Server MUST call callback({ ret: 0 }) or client HANGS FOREVER.
     *
     * @param {string} encryptedResponse - TEA-encrypted (Base64) string from client
     * @param {function} callback - Socket.IO acknowledgment callback from client
     */
    socket.on('verify', function (encryptedResponse, callback) {
        socket._verifyAttempts++;

        // Helper: send verify result to client via callback
        function sendVerifyResult(code) {
            if (typeof callback === 'function') {
                callback({ ret: code, compress: false, serverTime: Date.now(), server0Time: Date.now() });
            }
        }

        if (socket._verified) {
            // Already verified, respond success (re-verify scenario)
            sendVerifyResult(0);
            return;
        }

        if (!encryptedResponse) {
            console.warn('[Verify] Empty response from socket ' + socket.id);
            if (socket._verifyAttempts >= VERIFY_MAX_ATTEMPTS) {
                console.warn('[Verify] Max attempts exceeded for socket ' + socket.id);
                clearTimeout(verifyTimer);
                sendVerifyResult(38);
                socket.disconnect(true);
            } else {
                sendVerifyResult(4);
            }
            return;
        }

        var isValid = TEA.verifyChallenge(challenge, encryptedResponse, TEA_KEY);

        if (isValid) {
            socket._verified = true;
            clearTimeout(verifyTimer);
            console.log('[Verify] Socket ' + socket.id + ' verified successfully' +
                ' (attempt ' + socket._verifyAttempts + ')');
            // CRITICAL: Tell client verification succeeded
            // Client: 0 == n.ret ? e() → proceed to game
            sendVerifyResult(0);
        } else {
            console.warn('[Verify] Invalid response from socket ' + socket.id +
                ' (attempt ' + socket._verifyAttempts + '/' + VERIFY_MAX_ATTEMPTS + ')');

            if (socket._verifyAttempts >= VERIFY_MAX_ATTEMPTS) {
                console.warn('[Verify] Max attempts exceeded for socket ' + socket.id +
                    ' — disconnecting');
                clearTimeout(verifyTimer);
                // ret=38 triggers TSBrowser.executeFunction("reload") on client
                sendVerifyResult(38);
                socket.disconnect(true);
            } else {
                // Report failure but allow retry
                sendVerifyResult(38);
            }
        }
    });

    // =============================================
    // 9.2 MAIN REQUEST HANDLER — "handler.process"
    // =============================================
    // Client mengirim SEMUA request melalui event ini:
    //   socket.emit("handler.process", { type, action, userId, ...params }, callback)
    //
    // Response dikirim via callback:
    //   callback({ ret: 0, data: "...", compress: true, serverTime: ... })
    //
    // IMPORTANT: Request is only processed if socket._verified === true
    // =============================================
    socket.on('handler.process', function (request, callback) {
        // Reject unverified connections
        if (!socket._verified) {
            ResponseHelper.sendResponse(socket, 'handler.process',
                ResponseHelper.error(6, 'Not verified'), callback);
            return;
        }

        if (!request) {
            console.warn('[Handler] Received empty request');
            ResponseHelper.sendResponse(socket, 'handler.process',
                ResponseHelper.error(2, 'Empty request'), callback);
            return;
        }

        // Parse request
        var parsed = ResponseHelper.parseRequest(request);
        if (!parsed) {
            ResponseHelper.sendResponse(socket, 'handler.process',
                ResponseHelper.error(2, 'Invalid request format'), callback);
            return;
        }

        var type = parsed.type;
        var action = parsed.action;

        console.log('[Handler] type=' + type +
            ' action=' + action +
            ' userId=' + parsed.userId);

        // Track user connection
        if (parsed.userId) {
            // Disconnect previous connection for same userId (single-session enforcement)
            if (connectedClients[parsed.userId] &&
                connectedClients[parsed.userId] !== socket &&
                connectedClients[parsed.userId].connected) {
                console.log('[Connection] Duplicate login detected for userId=' +
                    parsed.userId + ' — disconnecting old session');
                connectedClients[parsed.userId].emit('kicked',
                    'Logged in from another device');
                connectedClients[parsed.userId].disconnect(true);
            }

            connectedClients[parsed.userId] = socket;
            socket._userId = parsed.userId;
        }

        // Route to handler based on type (case-insensitive)
        var handler = handlers[type.toLowerCase()];

        if (handler && typeof handler.handle === 'function') {
            try {
                handler.handle(socket, parsed, callback);
            } catch (err) {
                console.error('[Handler] Error in ' + type + ' handler: ' + err.message);
                console.error('[Handler] Stack: ' + err.stack);
                ResponseHelper.sendResponse(socket, 'handler.process',
                    ResponseHelper.error(1, 'Internal server error'), callback);
            }
        } else {
            console.warn('[Handler] Unknown type: ' + type +
                ' (action=' + action + ')');
            ResponseHelper.sendResponse(socket, 'handler.process',
                ResponseHelper.error(1, 'Unknown type: ' + type), callback);
        }
    });

    // =============================================
    // 9.3 DISCONNECT HANDLER
    // =============================================
    socket.on('disconnect', function (reason) {
        activeConnections--;

        // Clean up verification timer
        clearTimeout(verifyTimer);

        // Remove from connected clients
        if (socket._userId) {
            // Only delete if this socket is still the active one
            if (connectedClients[socket._userId] === socket) {
                delete connectedClients[socket._userId];
            }
        }

        console.log('[Connection] Client disconnected (ID: ' + socket.id +
            ', Reason: ' + reason +
            ', Verified: ' + (socket._verified ? 'yes' : 'no') +
            ', Active: ' + activeConnections + ')');
    });

    // =============================================
    // 9.4 ERROR HANDLER
    // =============================================
    socket.on('error', function (err) {
        console.error('[Connection] Socket error (ID: ' + socket.id + '):', err.message);
    });
});

// =============================================
// 10. GRACEFUL SHUTDOWN
// =============================================

/**
 * Gracefully shut down the server.
 *
 * Order of operations:
 *   1. Log shutdown signal
 *   2. Disconnect all connected clients
 *   3. Close Socket.IO
 *   4. Close database pool
 *   5. Close HTTP server
 *   6. Force exit after timeout (10s)
 *
 * @param {string} signal - The signal that triggered shutdown ('SIGTERM' or 'SIGINT')
 */
function gracefulShutdown(signal) {
    console.log('');
    console.log('[Shutdown] Received ' + signal + '. Shutting down gracefully...');

    // 1. Close all client connections
    var keys = Object.keys(connectedClients);
    for (var i = 0; i < keys.length; i++) {
        try {
            connectedClients[keys[i]].disconnect(true);
        } catch (e) {
            // Ignore disconnection errors during shutdown
        }
    }
    console.log('[Shutdown] Disconnected ' + keys.length + ' client(s)');

    // 2. Close Socket.IO, then DB, then HTTP server
    io.close(function () {
        console.log('[Shutdown] Socket.IO closed');

        // 3. Close database pool
        DB.closePool()
            .then(function () {
                console.log('[Shutdown] Database pool closed');

                // 4. Close HTTP server
                server.close(function () {
                    console.log('[Shutdown] HTTP server closed');
                    console.log('[Shutdown] Goodbye!');
                    process.exit(0);
                });
            })
            .catch(function (err) {
                console.error('[Shutdown] Error closing DB:', err.message);

                // Still close HTTP server even if DB close fails
                server.close(function () {
                    console.log('[Shutdown] HTTP server closed');
                    process.exit(0);
                });
            });
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(function () {
        console.error('[Shutdown] Forced exit after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', function () { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', function () { gracefulShutdown('SIGINT'); });

// =============================================
// 11. START SERVER
// =============================================

/**
 * Async startup sequence.
 *
 * Steps:
 *   1. Initialize database connection pool
 *   2. Load game data JSON files
 *   3. Bind HTTP server to port
 *   4. Log startup summary
 */
async function startServer() {
    // Step 1: Database
    console.log('[Startup] Initializing database...');
    try {
        await DB.initPool();
        console.log('[Startup] Database connected');
    } catch (err) {
        console.error('[Startup] FATAL: Database connection failed!');
        console.error('[Startup] ' + err.message);
        console.error('');
        console.error('Please ensure MariaDB/MySQL is running and .env is configured.');
        console.error('Run: npm run init-db  (to initialize database)');
        process.exit(1);
    }

    // Step 2: Game data
    console.log('[Startup] Loading game data...');
    try {
        await GameData.load();
    } catch (err) {
        console.error('[Startup] WARNING: Game data load failed!');
        console.error('[Startup] ' + err.message);
        console.error('[Startup] Server will start but game data will not be available.');
    }

    // Step 3: Start HTTP server
    server.listen(SERVER_PORT, SERVER_HOST, function () {
        console.log('');
        console.log('================================================');
        console.log('  Main Server is RUNNING!');
        console.log('================================================');
        console.log('  Address:     http://' + SERVER_HOST + ':' + SERVER_PORT);
        console.log('  Socket.IO:   http://' + SERVER_HOST + ':' + SERVER_PORT);
        console.log('  Health:      http://' + SERVER_HOST + ':' + SERVER_PORT + '/health');
        console.log('  TEA Key:     ' + TEA_KEY);
        console.log('================================================');
        console.log('  Endpoints:');
        console.log('    handler.process → type=User, action=... (user data)');
        console.log('    handler.process → type=Hero, action=... (hero management)');
        console.log('    handler.process → type=Arena, action=... (PvP arena)');
        console.log('    handler.process → type=Guild, action=... (guild system)');
        console.log('    handler.process → type=Dungeon, action=... (dungeon runs)');
        console.log('    handler.process → type=Shop, action=... (shop/purchase)');
        console.log('    ... and 54 more type handlers');
        console.log('================================================');
        console.log('  Status:');
        console.log('    Database:      ' + (DB.isReady() ? 'CONNECTED' : 'NOT CONNECTED'));
        console.log('    Game Data:     ' + (GameData.isLoaded() ? 'LOADED' : 'NOT LOADED'));
        console.log('    TEA Security:  ENABLED');

        var stats = GameData.getStats();
        if (GameData.isLoaded()) {
            console.log('    Data Files:    ' + stats.fileCount);
            console.log('    Load Time:     ' + stats.loadTimeMs + 'ms');
        }

        console.log('    Handlers:      ' + Object.keys(handlers).length + ' loaded');
        console.log('================================================');
        console.log('');
        console.log('  Waiting for client connections...');
        console.log('');
    });
}

// Handle server startup errors (e.g. port in use)
server.on('error', function (err) {
    if (err.code === 'EADDRINUSE') {
        console.error('[Startup] FATAL: Port ' + SERVER_PORT + ' is already in use!');
        console.error('[Startup] Please stop the other process or change MAIN_PORT in .env');
    } else {
        console.error('[Startup] FATAL: Server error:', err.message);
    }
    process.exit(1);
});

// Start!
startServer();
