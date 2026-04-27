/**
 * index.js — Main Server Entry Point
 *
 * Super Warrior Z Main Game Server
 * Port: 8001 | Socket.IO 2.5.1 | TEA: ON (key='verification')
 *
 * Flow:
 *   1. Client connects
 *   2. Server emits 'verify' challenge (32-hex)
 *   3. Client encrypts with TEA + Base64 → emits 'verify' back
 *   4. Server decrypts → validates → callback({ret:0})
 *   5. Client sends enterGame via handler.process
 *
 * Session-based table logging with emoji indicators (v3)
 */

var http = require('http');
var path = require('path');
var crypto = require('crypto');
var LZString = require('lz-string');

var config = require('./config');
var db = require('./db');
var tea = require('./tea');
var resources = require('./utils/resources');

// ============================================================
// TABLE LAYOUT (v3 — same as login-server)
// ============================================================

var TW = 100;
var COL = {
    TIME: 14, IDX: 3, DIR: 4, ACT: 18, STS: 10, MS: 6, DET: 0
};
COL.DET = TW - 8 - COL.TIME - COL.IDX - COL.DIR - COL.ACT - COL.STS - COL.MS;

var ALL_ACTIONS = ['enterGame'];

// ============================================================
// VISUAL STRING UTILITIES (same as login-server)
// ============================================================

function vLen(s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF) { w += 2; i++; }
        else if (c === 0xFE0F || c === 0x200D) { }
        else if ((c >= 0x2600 && c <= 0x27BF) || (c >= 0x2B00 && c <= 0x2BFF) ||
                 (c >= 0x231A && c <= 0x231B) || (c >= 0x23F0 && c <= 0x23F3)) { w += 2; }
        else { w += 1; }
    }
    return w;
}

function vPad(s, w) { var d = w - vLen(s); return d > 0 ? s + '\u0020'.repeat(d) : s; }

function vTrunc(s, maxW) {
    if (vLen(s) <= maxW) return s;
    var r = '', w = 0;
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF) {
            if (w + 2 > maxW) break; r += s[i] + (s[i+1]||''); w += 2; i++;
        } else if (c === 0xFE0F || c === 0x200D) { r += s[i]; }
        else if ((c >= 0x2600 && c <= 0x27BF) || (c >= 0x2B00 && c <= 0x2BFF) ||
                 (c >= 0x231A && c <= 0x231B) || (c >= 0x23F0 && c <= 0x23F3)) {
            if (w + 2 > maxW) break; r += s[i]; w += 2;
        } else { if (w + 1 > maxW) break; r += s[i]; w += 1; }
    }
    return r;
}

function vCell(s, w) { return vPad(vTrunc(s, w), w); }

// ============================================================
// SIMPLE HELPERS
// ============================================================

function p2(n) { return n < 10 ? '0' + n : '' + n; }
function p3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n; }

function tNow() {
    var d = new Date();
    return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + p3(d.getMilliseconds());
}

function fmtDur(ms) { return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'; }
function fmtSize(b) { return b < 1024 ? b + 'B' : (b / 1024).toFixed(1) + 'KB'; }

function trunc(s, n) {
    if (!s) return '(none)';
    if (s.length <= n) return s;
    var half = Math.floor((n - 2) / 2);
    return s.substring(0, half) + '..' + s.slice(-(n - half));
}

// ============================================================
// TABLE ROW BUILDERS
// ============================================================

function dashes(n) { return '\u2500'.repeat(n); }

function tTop() {
    return '\u250C' + dashes(COL.TIME) + '\u252C' + dashes(COL.IDX) + '\u252C' +
        dashes(COL.DIR) + '\u252C' + dashes(COL.ACT) + '\u252C' +
        dashes(COL.STS) + '\u252C' + dashes(COL.MS) + '\u252C' +
        dashes(COL.DET) + '\u2510';
}
function tMid() {
    return '\u251C' + dashes(COL.TIME) + '\u253C' + dashes(COL.IDX) + '\u253C' +
        dashes(COL.DIR) + '\u253C' + dashes(COL.ACT) + '\u253C' +
        dashes(COL.STS) + '\u253C' + dashes(COL.MS) + '\u253C' +
        dashes(COL.DET) + '\u2524';
}
function tBot() {
    return '\u2514' + dashes(COL.TIME) + '\u2534' + dashes(COL.IDX) + '\u2534' +
        dashes(COL.DIR) + '\u2534' + dashes(COL.ACT) + '\u2534' +
        dashes(COL.STS) + '\u2534' + dashes(COL.MS) + '\u2534' +
        dashes(COL.DET) + '\u2518';
}
function tRow(cells) {
    var ws = [COL.TIME, COL.IDX, COL.DIR, COL.ACT, COL.STS, COL.MS, COL.DET];
    var parts = [];
    for (var i = 0; i < cells.length; i++) {
        var s = cells[i] == null ? '' : String(cells[i]);
        parts.push(vCell('\u0020' + s, ws[i]));
    }
    return '\u2502' + parts.join('\u2502') + '\u2502';
}

// ============================================================
// SESSION TRACKER
// ============================================================

var sessions = {};

function sessCreate(socketId, ip, transport) {
    var s = {
        id: crypto.randomBytes(3).toString('hex').toUpperCase(),
        ip: ip,
        transport: transport || '?',
        connectTime: Date.now(),
        disconnectTime: null,
        disconnectReason: null,
        userId: null,
        nickName: null,
        verified: false,
        actions: {},
        actionOrder: [],
        counter: 0,
        dbTime: 0,
        printedHeader: false
    };
    sessions[socketId] = s;
    return s;
}

// ============================================================
// RESPONSE BUILDERS
// ============================================================

function buildResponse(data) {
    return {
        ret: 0,
        data: LZString.compressToUTF16(JSON.stringify(data)),
        compress: true,
        serverTime: Date.now(),
        server0Time: new Date().getTimezoneOffset() * 60 * 1000
    };
}

function buildErrorResponse(errorCode) {
    return {
        ret: errorCode || 1,
        data: '',
        compress: false,
        serverTime: Date.now(),
        server0Time: new Date().getTimezoneOffset() * 60 * 1000
    };
}

// ============================================================
// HANDLER MAP & LOADER
// ============================================================

var actionMap = {
    'enterGame': path.join(__dirname, 'handlers', 'user', 'enterGame')
};

var handlerCache = {};

function loadHandler(action) {
    if (handlerCache[action]) return handlerCache[action];
    var modPath = actionMap[action];
    if (!modPath) return null;
    try {
        handlerCache[action] = require(modPath);
        return handlerCache[action];
    } catch (err) {
        console.error(tNow() + ' \u274C Handler "' + action + '": ' + err.message);
        return null;
    }
}

// ============================================================
// ACTION ICONS
// ============================================================

var ICON = {
    'CONNECT': '\uD83D\uDFE2',
    'DISCONNECT': '\uD83D\uDD34',
    'VERIFY_OK': '\uD83D\uDD13',
    'VERIFY_FAIL': '\uD83D\uDD12',
    'enterGame': '\uD83C\uDFAE'
};

function icon(a) { return ICON[a] || '\u2753'; }

// ============================================================
// DETAIL BUILDERS
// ============================================================

function reqDetail(action, data) {
    if (!data) return '\u2500\u2500';
    switch (action) {
        case 'enterGame': {
            var p = [];
            if (data.userId) p.push('\uD83D\uDC64 ' + data.userId);
            p.push('\uD83C\uDFAB ' + trunc(data.loginToken, 12));
            if (data.serverId) p.push('\uD83D\uDDA5 s' + data.serverId);
            if (data.language) p.push('\uD83C\uDF10 ' + data.language);
            if (data.gameVersion) p.push('v' + data.gameVersion);
            return p.join('  ');
        }
        default: return '\u2500\u2500';
    }
}

function resDetailMain(action, d) {
    if (!d) return '\u2500\u2500';
    switch (action) {
        case 'enterGame': {
            var p = [];
            if (d.newUser) p.push('\uD83C\uDD95 NEW USER');
            else p.push('\uD83D\uDC64 RETURNING');
            if (d.user && d.user._nickName) p.push('\uD83D\uDC64 ' + d.user._nickName);
            if (d.currency) p.push('\uD83D\uDCB5 ' + d.currency);
            if (d.heros && d.heros._heros) p.push('\u2B50 ' + Object.keys(d.heros._heros).length + ' heroes');
            if (d.lastTeam && d.lastTeam._lastTeamInfo) {
                var teamKeys = Object.keys(d.lastTeam._lastTeamInfo);
                p.push('\uD83D\uDC65 ' + teamKeys.length + ' teams');
            }
            return p.join('  ');
        }
        default: return '\u2500\u2500';
    }
}

function fieldSubRows(action, req, res) {
    var rows = [];
    switch (action) {
        case 'enterGame': {
            if (res) {
                var l1 = [];
                if (res.user) {
                    l1.push('name=' + (res.user._nickName || '?'));
                    l1.push('head=' + (res.user._headImage || '?'));
                    l1.push('level=' + (res.user._level || '?'));
                }
                if (l1.length) rows.push(l1.join('  '));

                // Hero list (_heros is OBJECT keyed by heroId, NOT array)
                if (res.heros && res.heros._heros && typeof res.heros._heros === 'object') {
                    var heroKeys = Object.keys(res.heros._heros);
                    for (var hi = 0; hi < heroKeys.length; hi++) {
                        var hObj = res.heros._heros[heroKeys[hi]];
                        if (hObj) {
                            rows.push('\u2B50[' + (hi+1) + '] ' + hObj._heroDisplayId +
                                ' \u2192 ' + trunc(hObj._heroId, 22) +
                                ' \u2728Lv.' + ((hObj._heroBaseAttr && hObj._heroBaseAttr._level) || '?'));
                        }
                    }
                }

                // Team
                if (res.lastTeam && res.lastTeam._lastTeamInfo) {
                    var teamKeys = Object.keys(res.lastTeam._lastTeamInfo);
                    teamKeys.forEach(function (key) {
                        var team = res.lastTeam._lastTeamInfo[key];
                        var members = team._team || [];
                        var heroIds = members.map(function (m) { return trunc(m._heroId, 10); });
                        rows.push('\uD83D\uDC65 team[' + key + '] ' + members.length + ' slots: ' + (heroIds.join(', ') || '(empty)'));
                    });
                }

                // Counts
                var l2 = [];
                var items = res.totalProps && res.totalProps._items;
                if (items) l2.push('items=' + Object.keys(items).length);
                if (res.scheduleInfo) l2.push('schedule=' + Object.keys(res.scheduleInfo).length + ' fields');
                if (res.timesInfo) l2.push('times=' + Object.keys(res.timesInfo).length + ' fields');
                if (l2.length) rows.push(l2.join('  '));
            }
            break;
        }
    }
    return rows;
}

function perfSubRow(dbT, compSize) {
    var p = [];
    p.push('db ' + dbT + 'ms');
    if (compSize > 0) p.push('\uD83D\uDCE6 ' + fmtSize(compSize));
    return p.join('  ');
}

// ============================================================
// LOG FUNCTIONS
// ============================================================

function ensureHeader(sess) {
    if (sess.printedHeader) return;
    sess.printedHeader = true;
    console.log('');
    console.log('\uD83C\uDFAE SESSION ' + sess.id + '  \u2502  \uD83C\uDF10 ' + sess.ip + '  \u2502  \uD83D\uDCE1 ' + sess.transport);
    console.log('');
    console.log(tTop());
    console.log(tRow([
        '\u23F0 TIME', '#', '\u27A1\uFE0F',
        '\uD83D\uDD27 ACTION', '\uD83D\uDCCA STATUS',
        '\u23F1 MS', '\uD83D\uDCCB DETAILS'
    ]));
    console.log(tMid());
}

function logUpgrade(sess, from, to) {
    ensureHeader(sess);
    console.log(tRow([tNow(), '', '\u2195', '', '\u2B06\uFE0F upgrade', '', from + ' \u2192 ' + to]));
    sess.transport = to;
}

function logReq(sess, idx, action, data) {
    ensureHeader(sess);
    console.log(tRow([tNow(), idx, '\u27A1\uFE0F', icon(action) + ' ' + action, '\uD83D\uDCE4 REQ', '\u2500\u2500\u2500', reqDetail(action, data)]));
}

function logResOk(sess, idx, action, elapsed, decompressed, compSize, reqData, dbT) {
    ensureHeader(sess);
    console.log(tRow([tNow(), idx, '\u2B05\uFE0F', icon(action) + ' ' + action, '\u2705 OK', String(elapsed), resDetailMain(action, decompressed)]));

    var fRows = fieldSubRows(action, reqData, decompressed);
    for (var i = 0; i < fRows.length; i++) {
        console.log(tRow(['', '', '\uD83D\uDD0E', '', '\uD83D\uDCDD fields', '', fRows[i]]));
    }

    if (dbT > 0 || compSize > 0) {
        console.log(tRow(['', '', '\uD83D\uDCCA', '', '\u26A1 perf', '', perfSubRow(dbT, compSize)]));
    }
}

function logResErr(sess, idx, action, elapsed, ret) {
    ensureHeader(sess);
    console.log(tRow([tNow(), idx, '\u2B05\uFE0F', icon(action) + ' ' + action, '\u274C ERR=' + ret, String(elapsed), 'error code ' + ret]));
}

function logConn(sess) {
    ensureHeader(sess);
    console.log(tRow([tNow(), '\u25C9', '\u2500\u2500', icon('CONNECT') + ' CONNECT', '\u2500\u2500\u2500', '\u2500\u2500\u2500', '\uD83C\uDF10 ' + sess.ip + '  \uD83D\uDCE1 ' + sess.transport]));
}

function logVerify(sess, success, elapsed) {
    ensureHeader(sess);
    if (success) {
        console.log(tRow([tNow(), '', '\uD83D\uDD13', icon('VERIFY_OK') + ' TEA VERIFY', '\u2705 OK', String(elapsed), 'challenge-response matched']));
    } else {
        console.log(tRow([tNow(), '', '\uD83D\uDD12', icon('VERIFY_FAIL') + ' TEA VERIFY', '\u274C FAIL', String(elapsed), 'decrypt mismatch or error']));
    }
}

function logDisc(sess) {
    ensureHeader(sess);
    var dur = sess.disconnectTime - sess.connectTime;
    var nAct = sess.actionOrder.length;

    console.log(tMid());
    console.log(tRow([tNow(), '\u25C9', '\u2500\u2500', icon('DISCONNECT') + ' DISCONNECT', '\u2500\u2500\u2500', '\u2500\u2500\u2500', sess.disconnectReason || 'unknown']));
    console.log(tRow(['', '', '', '\uD83D\uDCCB SESSION LOG', '', '', nAct + '\u2705  \u23F1' + fmtDur(dur) + '  verified=' + (sess.verified ? '\u2705' : '\u274C')]));
    console.log(tBot());

    var skipped = [];
    for (var i = 0; i < ALL_ACTIONS.length; i++) {
        if (!sess.actions[ALL_ACTIONS[i]]) skipped.push(ALL_ACTIONS[i]);
    }
    if (skipped.length > 0) {
        console.log('  \u23ED Not triggered: ' + skipped.join(', '));
    }

    console.log('');
    var mem = process.memoryUsage();
    console.log('  \uD83D\uDCBE RSS: ' + (mem.rss / 1024 / 1024).toFixed(1) + 'MB' +
        '  \u2502  \uD83E\uDDE0 Heap: ' + (mem.heapUsed / 1024 / 1024).toFixed(1) + '/' + (mem.heapTotal / 1024 / 1024).toFixed(1) + 'MB' +
        '  \u2502  \uD83D\uDC65 Sessions: ' + Object.keys(sessions).length);
    console.log('');
}

// ============================================================
// SOCKET.IO SERVER
// ============================================================

var server = http.createServer();

var io = require('socket.io')(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling']
});

io.on('connection', function (socket) {
    var ip = socket.handshake
        ? (socket.handshake.address || socket.handshake.headers['x-forwarded-for'] || '?')
        : '?';
    var transport = (socket.conn && socket.conn.transport) ? socket.conn.transport.name : '?';

    var sess = sessCreate(socket.id, ip, transport);
    var challenge = null;

    logConn(sess);

    // Track transport upgrade
    if (socket.conn) {
        socket.conn.on('upgrade', function (newTransport) {
            if (sess.transport !== newTransport.name) {
                logUpgrade(sess, sess.transport, newTransport.name);
            }
        });
    }

    // ============================================================
    // TEA VERIFY HANDSHAKE
    // ============================================================
    //
    // Flow (exact dari client code line 82579-82587):
    //   Server → Client: socket.emit('verify', challenge)
    //   Client → Server: socket.emit('verify', TEA.encrypt(challenge, 'verification'), callback)
    //   Server: TEA.decrypt(response, 'verification') → compare → callback({ret: 0/1})
    //

    challenge = crypto.randomBytes(16).toString('hex');  // 32 hex chars

    // Send challenge to client
    socket.emit('verify', challenge);

    // Listen for client's encrypted response
    socket.on('verify', function (encrypted, callback) {
        var vStart = Date.now();
        var vElapsed = Date.now() - vStart;

        if (!callback || typeof callback !== 'function') {
            logVerify(sess, false, 0);
            socket.disconnect();
            return;
        }

        try {
            var decrypted = tea.decrypt(encrypted, tea.TEA_KEY);
            vElapsed = Date.now() - vStart;

            if (decrypted && decrypted.length > 0 && decrypted === challenge) {
                // VERIFY SUCCESS
                sess.verified = true;
                logVerify(sess, true, vElapsed);
                callback({ ret: 0 });
            } else {
                // VERIFY FAILED — mismatch
                logVerify(sess, false, vElapsed);
                callback({ ret: 1 });
                setTimeout(function () { socket.disconnect(); }, 100);
            }
        } catch (err) {
            vElapsed = Date.now() - vStart;
            console.error(tNow() + ' \u274C TEA decrypt error: ' + err.message);
            logVerify(sess, false, vElapsed);
            callback({ ret: 1 });
            setTimeout(function () { socket.disconnect(); }, 100);
        }
    });

    // ============================================================
    // HANDLER.PROCESS — main request/response channel
    // ============================================================

    socket.on('handler.process', function (data, callback) {
        if (!callback || typeof callback !== 'function') return;

        // Only accept requests after TEA verification
        if (!sess.verified) {
            console.log(tNow() + ' \u26A0\uFE0F Rejected unverified request');
            return callback(buildErrorResponse(1));
        }

        var action = data ? data.action : null;
        var type = data ? data.type : null;

        if (!action || !actionMap[action]) {
            sess.counter++;
            ensureHeader(sess);
            console.log(tRow([tNow(), sess.counter, '\u27A1\uFE0F', icon('UNKNOWN') + ' ' + (action || '?') + ' [' + (type||'?') + ']', '\u274C UNKNOWN', '\u2500\u2500\u2500', 'action not found']));
            return callback(buildErrorResponse(1));
        }

        // Verify type = 'user' (lowercase)
        if (type !== 'user') {
            sess.counter++;
            ensureHeader(sess);
            console.log(tRow([tNow(), sess.counter, '\u27A1\uFE0F', icon('UNKNOWN') + ' type=' + type, '\u274C TYPE', '\u2500\u2500\u2500', 'expected type=user']));
            return callback(buildErrorResponse(1));
        }

        sess.counter++;
        var idx = sess.counter;
        var dbTBefore = Date.now();

        logReq(sess, idx, action, data);

        var handler = loadHandler(action);
        if (!handler || typeof handler.execute !== 'function') {
            logResErr(sess, idx, action, 0, 1);
            sess.actions[action] = { idx: idx, status: 'error' };
            if (sess.actionOrder.indexOf(action) === -1) sess.actionOrder.push(action);
            return callback(buildErrorResponse(1));
        }

        var ctx = {
            db: db,
            buildResponse: buildResponse,
            buildErrorResponse: buildErrorResponse,
            crypto: crypto,
            config: config,
            _logNickName: null
        };

        var startTime = Date.now();

        handler.execute(data, socket, ctx)
            .then(function (result) {
                var elapsed = Date.now() - startTime;
                var dbT = Date.now() - dbTBefore;
                var ret = result.ret;
                var decompressed = null;
                var compSize = 0;

                if (ret === 0 && result.compress && result.data) {
                    try { decompressed = JSON.parse(LZString.decompressFromUTF16(result.data)); }
                    catch (e) { decompressed = null; }
                    compSize = Buffer.byteLength(result.data, 'utf8');
                }

                if (ret === 0) {
                    logResOk(sess, idx, action, elapsed, decompressed, compSize, data, dbT);
                } else {
                    logResErr(sess, idx, action, elapsed, ret);
                }

                sess.actions[action] = { idx: idx, status: ret === 0 ? 'ok' : 'error', time: elapsed };
                if (sess.actionOrder.indexOf(action) === -1) sess.actionOrder.push(action);

                // Track userId/nickName from enterGame
                if (action === 'enterGame' && ret === 0 && decompressed) {
                    sess.userId = decompressed.user ? decompressed.user._id : null;
                    sess.nickName = decompressed.user ? decompressed.user._nickName : null;
                }

                callback(result);
            })
            .catch(function (err) {
                var elapsed = Date.now() - startTime;
                var dbT = Date.now() - dbTBefore;
                console.error(tNow() + ' \u274C Handler error: ' + err.message);
                console.error(err.stack);
                logResErr(sess, idx, action, elapsed, err.code || 1);
                sess.actions[action] = { idx: idx, status: 'error', time: elapsed };
                if (sess.actionOrder.indexOf(action) === -1) sess.actionOrder.push(action);
                callback(buildErrorResponse(err.code || 1));
            });
    });

    // ============================================================
    // DISCONNECT
    // ============================================================

    socket.on('disconnect', function (reason) {
        sess.disconnectTime = Date.now();
        sess.disconnectReason = reason;
        logDisc(sess);
        setTimeout(function () { delete sessions[socket.id]; }, 2000);
    });
});

// ============================================================
// START SERVER
// ============================================================

db.init();
resources.init();

server.listen(config.port, function () {
    console.log('');
    console.log('\uD83C\uDFAE SUPER WARRIOR Z \u2014 MAIN SERVER');
    console.log('\u2550'.repeat(TW));
    console.log('  \u26A1 Port: ' + config.port + '  \u2502  \uD83D\uDD0C Socket.IO 2.5.1  \u2502  \uD83D\uDD13 TEA: ON (verification)  \u2502  \uD83D\uDDC4 DB: ' + config.dbFile);
    console.log('  \uD83D\uDDA5 Server ID: ' + config.serverId + '  \u2502  \uD83D\uDCB5 Currency: ' + config.currency + '  \u2502  \uD83D\uDCC5 Open: ' + config.serverOpenDate);
    console.log('  \uD83D\uDD0D Login DB: ' + config.loginDbFile);
    console.log('  \u2705 Server Ready  \u2502  \uD83E\uDDE0 Node ' + process.version + '  \u2502  \uD83D\uDCC5 ' + new Date().toISOString().slice(0, 10));
    console.log('\u2550'.repeat(TW));
    console.log('');
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

process.on('SIGINT', function () {
    console.log('\n' + tNow() + ' \uD83D\uDEAB Shutting down...');
    io.close();
    db.close();
    process.exit(0);
});

process.on('SIGTERM', function () {
    console.log('\n' + tNow() + ' \uD83D\uDEAB SIGTERM, shutting down...');
    io.close();
    db.close();
    process.exit(0);
});
