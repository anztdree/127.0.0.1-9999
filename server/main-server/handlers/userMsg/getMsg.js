/**
 * handlers/userMsg/getMsg.js
 *
 * Client request: type: 'userMsg', action: 'getMsg', userId, friendId, time
 * Client response: { _msgs: [{ _time, _isSelf, _context }] }
 */

var db = require('../../db');

module.exports = {
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            var userId = data.userId;
            var friendId = data.friendId;
            if (!userId || !friendId) return resolve(ctx.buildErrorResponse(1));

            var time = data.time || 0;
            var msgs = db.dbAll(
                'SELECT * FROM friend_messages WHERE ((senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)) AND time > ? ORDER BY time ASC',
                [userId, friendId, friendId, userId, time]
            );

            var _msgs = [];
            for (var i = 0; i < msgs.length; i++) {
                _msgs.push({
                    _time: msgs[i].time,
                    _isSelf: msgs[i].senderId === userId,
                    _context: msgs[i].content || ''
                });
            }

            resolve(ctx.buildResponse({ _msgs: _msgs }));
        });
    }
};
