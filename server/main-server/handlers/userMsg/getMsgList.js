/**
 * handlers/userMsg/getMsgList.js
 *
 * Client request (line 186588-186594):
 *   type: 'userMsg', action: 'getMsgList', userId, version: '1.0'
 *
 * Client response (line 121134-121145):
 *   { _brief: { "<friendUserId>": { lastMsgTime, lastReadTime, msg, userInfo } } }
 */

var db = require('../../db');

module.exports = {
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            var userId = data.userId;
            if (!userId) return resolve(ctx.buildErrorResponse(1));

            // Get friend list
            var friends = db.dbAll('SELECT friendId FROM friends WHERE userId = ?', [userId]);
            var brief = {};

            for (var i = 0; i < friends.length; i++) {
                var friendId = friends[i].friendId;
                var friendUser = db.getUser(friendId);
                if (!friendUser) continue;

                // Get last message with this friend
                var msgs = db.dbAll(
                    'SELECT * FROM friend_messages WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?) ORDER BY time DESC LIMIT 1',
                    [userId, friendId, friendId, userId]
                );

                var lastMsg = msgs.length > 0 ? msgs[0] : null;
                var readRow = db.dbGet(
                    'SELECT readTime FROM friend_read_time WHERE userId = ? AND friendId = ?',
                    [userId, friendId]
                );

                var lastMsgTime = lastMsg ? lastMsg.time : 0;
                var lastReadTime = readRow ? readRow.readTime : 0;
                var msgText = '';
                if (lastMsg) {
                    msgText = (lastMsg.content || '').substring(0, 10);
                }

                brief[friendId] = {
                    lastMsgTime: lastMsgTime,
                    lastReadTime: lastReadTime,
                    msg: msgText,
                    userInfo: {
                        _serverId: parseInt(friendUser.oriServerId) || parseInt(ctx.config.serverId) || 1,
                        _oriServerId: parseInt(friendUser.oriServerId) || parseInt(ctx.config.serverId) || 1,
                        _userId: friendId,
                        _nickName: friendUser.nickName || '',
                        _headImage: friendUser.headImage || 'hero_icon_1205',
                        _headEffect: 0,
                        _headBox: 0,
                        _guildName: '',
                        _level: friendUser.level || 1,
                        _vip: friendUser.vipLevel || 0,
                        _superSkill: [],
                        _totalPower: 0
                    }
                };
            }

            resolve(ctx.buildResponse({ _brief: brief }));
        });
    }
};
