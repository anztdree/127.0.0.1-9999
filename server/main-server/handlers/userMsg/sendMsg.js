/**
 * handlers/userMsg/sendMsg.js
 *
 * Client request: type: 'userMsg', action: 'sendMsg', userId, friendId, msg
 * Client response: { ret: 0 } (fire-and-forget on client side)
 */

var db = require('../../db');

module.exports = {
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            var userId = data.userId;
            var friendId = data.friendId;
            var msg = data.msg || '';
            if (!userId || !friendId) return resolve(ctx.buildErrorResponse(1));

            var now = Date.now();

            db.dbRun(
                'INSERT INTO friend_messages (senderId, receiverId, content, time) VALUES (?, ?, ?, ?)',
                [userId, friendId, msg, now]
            );

            resolve(ctx.buildResponse({}));
        });
    }
};
