/**
 * handlers/saveLanguage.js — Simpan Language Preference
 *
 * Client request fields (exact dari client code line 114279):
 *   type: 'User'
 *   action: 'SaveLanguage'
 *   userid: string    — ⚠️ LOWERCASE 'userid'! (client code line 114285)
 *   sdk, appid, language
 *
 * Response fields:
 *   errorCode: number — 0 = sukses
 *
 * DB columns = camelCase → WHERE userId = ?
 */

function execute(data, socket, ctx) {
    var db = ctx.db;
    var buildResponse = ctx.buildResponse;

    // ⚠️ LOWERCASE 'userid' — dari client, bukan typo
    var userid = (data.userid || '').trim();
    var language = (data.language || 'en').trim();

    if (!userid) {
        return Promise.resolve(buildResponse({ errorCode: 0 }));
    }

    return db.query(
        'UPDATE users SET language = ? WHERE userId = ?',
        [language, userid]
    ).then(function () {
        return buildResponse({ errorCode: 0 });
    }).catch(function () {
        return buildResponse({ errorCode: 0 });
    });
}

module.exports = { execute: execute };
