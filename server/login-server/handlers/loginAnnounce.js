/**
 * handlers/loginAnnounce.js — Login Announcements / Bulletin
 *
 * Verified dari original minified main.min.js.
 *
 * Response: { data: [] } — kosong, tidak ada announcement.
 */

function execute(data, socket, ctx) {
    var buildResponse = ctx.buildResponse;

    return Promise.resolve(buildResponse({ data: [] }));
}

module.exports = { execute: execute };
