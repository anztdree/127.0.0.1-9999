/**
 * handlers/userMsg/readMsg.js
 *
 * Client request: type: 'userMsg', action: 'readMsg', userId, friendId
 * Client response: { _readTime: timestamp }
 */

var db = require('../../db');

module.exports = {
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            var userId = data.userId;
            var friendId = data.friendId;
            if (!userId || !friendId) return resolve(ctx.buildErrorResponse(1));

            var now = Date.now();

            // Upsert read time
            db.dbRun(
                'INSERT OR REPLACE INTO friend_read_time (userId, friendId, readTime) VALUES (?, ?, ?)',
                [userId, friendId, now]
            );

            resolve(ctx.buildResponse({ _readTime: now }));
        });
    }
};
