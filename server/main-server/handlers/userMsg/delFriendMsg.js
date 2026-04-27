/**
 * handlers/userMsg/delFriendMsg.js
 *
 * Client request: type: 'userMsg', action: 'delFriendMsg', userId, friendId
 * Client response: { ret: 0 }
 */

var db = require('../../db');

module.exports = {
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            var userId = data.userId;
            var friendId = data.friendId;
            if (!userId || !friendId) return resolve(ctx.buildErrorResponse(1));

            db.dbRun(
                'DELETE FROM friend_messages WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)',
                [userId, friendId, friendId, userId]
            );
            db.dbRun(
                'DELETE FROM friend_read_time WHERE userId = ? AND friendId = ?',
                [userId, friendId]
            );

            resolve(ctx.buildResponse({}));
        });
    }
};
