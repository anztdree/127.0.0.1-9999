/**
 * handlers/saveUserEnterInfo.js — Log Analitik
 *
 * Client request fields (exact dari client code line 114448):
 *   type: 'User'
 *   action: 'SaveUserEnterInfo'
 *   accountToken, channelCode, subChannel,
 *   createTime, userLevel, version
 *
 * Response: client tidak peduli (socket destroy setelah callback).
 *
 * DB columns = camelCase → langsung pakai.
 */

function execute(data, socket, ctx) {
    var db = ctx.db;
    var buildResponse = ctx.buildResponse;

    var accountToken = (data.accountToken || '').trim();
    var channelCode = (data.channelCode || '').trim();
    var subChannel = (data.subChannel || '').trim();
    var createTime = data.createTime || 0;
    var userLevel = data.userLevel || 1;
    var now = Date.now();

    if (!accountToken) {
        return Promise.resolve(buildResponse({}));
    }

    return db.query(
        'INSERT INTO userLoginLogs (userId, channelCode, subChannel, userLevel, createTime, loginTime) ' +
        'VALUES (?, ?, ?, ?, ?, ?)',
        [accountToken, channelCode, subChannel, userLevel, createTime, now]
    ).then(function () {
        return buildResponse({});
    }).catch(function () {
        return buildResponse({});
    });
}

module.exports = { execute: execute };
