/**
 * handlers/loginGame.js — Register + Login
 *
 * Client request fields (exact dari client code line 114369):
 *   type: 'User'
 *   action: 'loginGame'
 *   userId, password, fromChannel, channelName, headImageUrl,
 *   nickName, subChannel, version
 *
 * Response fields yang client baca:
 *   userId, channelCode, loginToken, nickName,
 *   securityCode, createTime, language
 *
 * DB columns = camelCase → langsung pakai, tidak ada mapping.
 */

var crypto = require('crypto');

function randomHex(bytes) {
    return crypto.randomBytes(bytes).toString('hex');
}

function execute(data, socket, ctx) {
    var db = ctx.db;
    var buildResponse = ctx.buildResponse;
    var buildErrorResponse = ctx.buildErrorResponse;

    var userId = (data.userId || '').trim();
    var password = (data.password || '').trim();
    var fromChannel = (data.fromChannel || password || '').trim();

    // Default password (client code line 137980)
    if (!password) password = 'game_origin';
    if (!fromChannel) fromChannel = password;

    if (!userId) {
        return Promise.resolve(buildErrorResponse(2));
    }

    var now = Date.now();
    var loginToken = randomHex(32);    // 64 hex chars — TOKEN SEMENTARA
    var securityCode = randomHex(16);  // 32 hex chars

    return db.queryOne(
        'SELECT userId, password, nickName, createTime, channelCode, language ' +
        'FROM users WHERE userId = ?',
        [userId]
    ).then(function (existingUser) {
        if (existingUser) {
            // User sudah ada → cek password (PLAINTEXT)
            if (existingUser.password !== password) {
                return Promise.resolve(buildErrorResponse(3));
            }

            // Update token dan security code
            return db.query(
                'UPDATE users SET lastLoginTime = ?, loginToken = ?, securityCode = ?, channelCode = ? ' +
                'WHERE userId = ?',
                [now, loginToken, securityCode, fromChannel, userId]
            ).then(function () {
                return buildResponse({
                    userId: existingUser.userId,
                    channelCode: fromChannel,
                    loginToken: loginToken,
                    nickName: existingUser.nickName || existingUser.userId,
                    securityCode: securityCode,
                    createTime: existingUser.createTime,
                    language: existingUser.language || 'en'
                });
            });

        } else {
            // Auto-register
            return db.query(
                'INSERT INTO users (userId, password, channelCode, nickName, securityCode, createTime, lastLoginTime, loginToken) ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, password, fromChannel, userId, securityCode, now, now, loginToken]
            ).then(function () {
                return buildResponse({
                    userId: userId,
                    channelCode: fromChannel,
                    loginToken: loginToken,
                    nickName: userId,
                    securityCode: securityCode,
                    createTime: now,
                    language: 'en'
                });
            });
        }
    });
}

module.exports = { execute: execute };
