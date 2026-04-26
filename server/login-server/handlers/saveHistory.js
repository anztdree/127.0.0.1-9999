/**
 * handlers/saveHistory.js — Generate FINAL Token + Login History
 *
 * Handler PALING KRITIS dalam alur login.
 *
 * Client request fields (exact dari client code line 137904):
 *   type: 'User'
 *   action: 'SaveHistory'
 *   accountToken, channelCode, serverId, securityCode,
 *   subChannel, version
 *
 * Response fields:
 *   loginToken: string      — TOKEN FINAL (overwrite token sementara)
 *   todayLoginCount: number — jumlah login hari ini
 *
 * DB columns = camelCase → langsung pakai.
 */

var crypto = require('crypto');

function localDate() {
    var d = new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' + m : '' + m) + '-' + (day < 10 ? '0' + day : '' + day);
}

function execute(data, socket, ctx) {
    var db = ctx.db;
    var buildResponse = ctx.buildResponse;
    var buildErrorResponse = ctx.buildErrorResponse;

    var accountToken = (data.accountToken || '').trim();
    var channelCode = (data.channelCode || '').trim();
    var serverId = data.serverId;
    var securityCode = (data.securityCode || '').trim();

    // Validasi wajib
    if (!accountToken || !serverId) {
        return Promise.resolve(buildErrorResponse(1));
    }

    // Step 0: Validasi securityCode terhadap DB
    return db.queryOne(
        'SELECT securityCode FROM users WHERE userId = ?',
        [accountToken]
    ).then(function (user) {
        if (!user || !user.securityCode || user.securityCode !== securityCode) {
            return Promise.resolve(buildErrorResponse(5));
        }

        var loginToken = crypto.randomBytes(32).toString('hex');
        var now = Date.now();
        var today = localDate();

        // Step 1: OVERWRITE token + update last login
        return db.query(
            'UPDATE users SET loginToken = ?, lastLoginTime = ?, lastLoginServer = ? ' +
            'WHERE userId = ?',
            [loginToken, now, parseInt(serverId) || 0, accountToken]
        ).then(function () {
            // Step 2: Cek today login count
            return db.queryOne(
                'SELECT todayLoginDate, todayLoginCount FROM users WHERE userId = ?',
                [accountToken]
            );
        }).then(function (user) {
            var todayLoginCount = 1;
            if (user && user.todayLoginDate === today) {
                todayLoginCount = (user.todayLoginCount || 0) + 1;
            }

            // Step 3: Update today login count
            return db.query(
                'UPDATE users SET todayLoginCount = ?, todayLoginDate = ? WHERE userId = ?',
                [todayLoginCount, today, accountToken]
            ).then(function () {
                return todayLoginCount;
            });
        }).then(function (todayLoginCount) {
            // Step 4: Insert login history
            var subChannel = (data.subChannel || '').trim();
            var version = (data.version || '').trim();

            return db.query(
                'INSERT INTO loginHistory (userId, serverId, channelCode, subChannel, version, loginTime) ' +
                'VALUES (?, ?, ?, ?, ?, ?)',
                [accountToken, parseInt(serverId) || 0, channelCode, subChannel, version, now]
            ).then(function () {
                return todayLoginCount;
            });
        }).then(function (todayLoginCount) {
            return buildResponse({
                loginToken: loginToken,
                todayLoginCount: todayLoginCount
            });
        });
    });
}

module.exports = { execute: execute };
