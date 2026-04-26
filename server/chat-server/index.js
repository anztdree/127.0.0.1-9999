/**
 * chat-server/index.js — Entry Point
 *
 * Super Warrior Z Chat Server
 * Port: 8200 | Socket.IO 2.5.1 | TEA verify ON
 *
 * DB: MariaDB (1 database global, shared semua server)
 * Auto-create tables dari init.sql saat startup.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

var http = require('http');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var LZString = require('lz-string');
var mysql = require('mysql2/promise');

var PORT = process.env.CHAT_PORT || 8200;

// === MariaDB Connection Config ===
var dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'root',
    database: process.env.DB_NAME || 'super_warrior_z',
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0,
    charset: 'utf8mb4'
};

// === DB Pool ===
var pool = mysql.createPool(dbConfig);

var db = {
    query: function (sql, params) {
        return pool.execute(sql, params).then(function (r) { return r[0]; });
    },
    queryOne: function (sql, params) {
        return pool.execute(sql, params).then(function (r) {
            var rows = r[0];
            return Array.isArray(rows) ? rows[0] : rows;
        });
    }
};

// === TEA Implementation (key="verification") ===
var TEA = (function () {
    var DELTA = 0x9E3779B9;

    function toUint32Array(str) {
        var arr = [];
        for (var i = 0; i < str.length; i++) arr.push(str.charCodeAt(i));
        while (arr.length % 4 !== 0) arr.push(0);
        var result = [];
        for (var j = 0; j < arr.length; j += 4) {
            result.push(
                ((arr[j] & 0xFF) << 24) | ((arr[j+1] & 0xFF) << 16) |
                ((arr[j+2] & 0xFF) << 8) | (arr[j+3] & 0xFF)
            );
        }
        return result;
    }

    function toUint32ArrayFromHex(hex) {
        var arr = [];
        for (var i = 0; i < hex.length; i += 8) arr.push(parseInt(hex.substr(i, 8), 16));
        return arr;
    }

    function toHex(uint32Arr) {
        var hex = '';
        for (var i = 0; i < uint32Arr.length; i++) {
            hex += ('00000000' + (uint32Arr[i] >>> 0).toString(16)).slice(-8);
        }
        return hex;
    }

    function encrypt(data, key) {
        var v = toUint32Array(data), k = toUint32Array(key);
        if (v.length < 2) return toHex(v);
        var n = v.length, z = v[n-1], y, p, q = Math.floor(6 + 52/n), sum = 0, e;
        while (q-- > 0) {
            sum = (sum + DELTA) >>> 0;
            e = (sum >>> 2) & 3;
            for (p = 0; p < n-1; p++) {
                y = v[p+1];
                z = (v[p] + (((z>>>5)^(y<<2))+((y>>>3)^(z<<4)))^((sum^y)+(k[(p&3)^e]^z))) >>> 0;
            }
            y = v[0];
            z = (v[n-1] + (((z>>>5)^(y<<2))+((y>>>3)^(z<<4)))^((sum^y)+(k[(n-1)&3^e]^z))) >>> 0;
        }
        return toHex(v);
    }

    function decrypt(hexStr, key) {
        var v = toUint32ArrayFromHex(hexStr), k = toUint32Array(key);
        if (v.length < 2) return '';
        var n = v.length, z = v[n-1], y = v[0], p, q = Math.floor(6 + 52/n), sum = (q * DELTA) >>> 0, e;
        while (q-- > 0) {
            e = (sum >>> 2) & 3;
            for (p = n-1; p > 0; p--) {
                z = v[p-1];
                v[p] = (v[p] - (((z>>>5)^(y<<2))+((y>>>3)^(z<<4)))^((sum^y)+(k[(p&3)^e]^z))) >>> 0;
                y = v[p];
            }
            z = v[n-1];
            v[0] = (v[0] - (((z>>>5)^(y<<2))+((y>>>3)^(z<<4)))^((sum^y)+(k[0^e]^z))) >>> 0;
            y = v[0];
            sum = (sum - DELTA) >>> 0;
        }
        var str = '';
        for (var i = 0; i < v.length; i++) {
            str += String.fromCharCode((v[i]>>>24)&0xFF) + String.fromCharCode((v[i]>>>16)&0xFF) +
                   String.fromCharCode((v[i]>>>8)&0xFF) + String.fromCharCode(v[i]&0xFF);
        }
        return str.replace(/\0+$/, '');
    }

    return { encrypt: encrypt, decrypt: decrypt };
})();

// === Response Builders ===
function buildResponse(data) {
    return {
        ret: 0,
        data: LZString.compressToUTF16(JSON.stringify(data)),
        compress: true,
        serverTime: Date.now(),
        server0Time: Date.now()
    };
}

function buildErrorResponse(errorCode) {
    return {
        ret: errorCode || 1,
        data: '',
        compress: false,
        serverTime: Date.now(),
        server0Time: Date.now()
    };
}

// === Handler Mapping ===
var actionMap = {
    'login':     path.join(__dirname, 'handlers', 'login'),
    'sendMsg':   path.join(__dirname, 'handlers', 'sendMsg'),
    'joinRoom':  path.join(__dirname, 'handlers', 'joinRoom'),
    'leaveRoom': path.join(__dirname, 'handlers', 'leaveRoom'),
    'getRecord': path.join(__dirname, 'handlers', 'getRecord')
};

var handlers = {};
function loadHandler(action) {
    if (handlers[action]) return handlers[action];
    var modPath = actionMap[action];
    if (!modPath) return null;
    handlers[action] = require(modPath);
    return handlers[action];
}

// === Socket.IO Server ===
var server = http.createServer();
var io = require('socket.io')(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling']
});

// === TEA Verify Key ===
var TEA_KEY = 'verification';

// === Connection Handler ===
io.on('connection', function (socket) {
    console.log('[CHAT] Connected: ' + socket.id);

    // === TEA Verify Handshake ===
    socket.on('verify', function (encrypted, callback) {
        if (!callback || typeof callback !== 'function') return;
        try {
            var decrypted = TEA.decrypt(encrypted, TEA_KEY);
            if (decrypted && decrypted.length > 0) {
                console.log('[CHAT] TEA verify OK: ' + socket.id);
                return callback({ ret: 0 });
            }
        } catch (e) {
            console.error('[CHAT] TEA decrypt error:', e.message);
        }
        console.warn('[CHAT] TEA verify FAILED: ' + socket.id);
        callback({ ret: 1 });
        socket.disconnect();
    });

    // === Send Verify Challenge ===
    var challenge = crypto.randomBytes(16).toString('hex');
    socket.emit('verify', challenge);

    // === Handler Process ===
    socket.on('handler.process', function (data, callback) {
        if (!callback || typeof callback !== 'function') return;

        var action = data.action;
        if (!action || !actionMap[action]) {
            console.warn('[CHAT] Unknown action: ' + action);
            return callback(buildErrorResponse(1));
        }

        var handler = loadHandler(action);
        if (!handler) return callback(buildErrorResponse(1));

        var ctx = {
            db: db,
            buildResponse: buildResponse,
            buildErrorResponse: buildErrorResponse,
            io: io,
            socket: socket
        };

        handler.execute(data, socket, ctx)
            .then(function (result) { callback(result); })
            .catch(function (err) {
                console.error('[CHAT] Handler error [' + action + ']:', err.message);
                callback(buildErrorResponse(err.code || 1));
            });
    });

    socket.on('disconnect', function () {
        console.log('[CHAT] Disconnected: ' + socket.id);
    });
});

// === Init Database ===
function initDatabase() {
    return pool.execute('CREATE DATABASE IF NOT EXISTS `' + dbConfig.database + '` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci')
        .then(function () { return pool.execute('USE `' + dbConfig.database + '`'); })
        .then(function () {
            var initSqlPath = path.join(__dirname, 'init.sql');
            if (!fs.existsSync(initSqlPath)) return;
            var initSql = fs.readFileSync(initSqlPath, 'utf8');
            var cleaned = initSql.split('\n').filter(function (line) { return line.trim().indexOf('--') !== 0; }).join('\n');
            var statements = cleaned.split(';').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
            var chain = Promise.resolve();
            statements.forEach(function (stmt) {
                chain = chain.then(function () {
                    return pool.execute(stmt).catch(function (err) {
                        if (err.message.indexOf('Duplicate') === -1 && err.message.indexOf('already exists') === -1) {
                            console.warn('[DB] Init warning:', err.message);
                        }
                    });
                });
            });
            return chain;
        })
        .then(function () { console.log('[DB] Chat schema initialized'); return true; })
        .catch(function (err) { console.error('[DB] Init failed:', err.message); return false; });
}

// === Start ===
initDatabase().then(function () {
    server.listen(PORT, function () {
        console.log('========================================');
        console.log('  Super Warrior Z — Chat Server');
        console.log('  Port: ' + PORT);
        console.log('  Socket.IO: 2.5.1 | TEA: ON');
        console.log('  DB: ' + dbConfig.host + ':' + dbConfig.port + '/' + dbConfig.database);
        console.log('========================================');
    });
}).catch(function () {
    server.listen(PORT, function () {
        console.log('[CHAT] Started on port ' + PORT + ' (DB not ready)');
    });
});
