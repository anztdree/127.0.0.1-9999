/**
 * handlers/getServerList.js — Daftar Server + History
 *
 * Client request fields (exact dari client code line 114402):
 *   type: 'User'
 *   action: 'GetServerList'
 *   userId, subChannel, channel
 *
 * Response fields:
 *   serverList: Array<{serverId, name, url, chaturl, dungeonurl,
 *     worldRoomId, guildRoomId, teamDungeonChatRoom,
 *     online, hot, new, offlineReason}>
 *   history: Array<string>    — max 5 serverId terakhir
 *   offlineReason: string
 *
 * DB columns = camelCase → langsung pakai.
 * Mapping minimal: serverName→name, chatUrl→chaturl, dungeonUrl→dungeonurl,
 * status→online (boolean), isHot→hot (boolean), isNew→new (boolean).
 */

function execute(data, socket, ctx) {
    var db = ctx.db;
    var buildResponse = ctx.buildResponse;

    var userId = (data.userId || '').trim();

    return db.query(
        'SELECT serverId, serverName, url, chatUrl, dungeonUrl, ' +
        'worldRoomId, guildRoomId, teamDungeonChatRoom, ' +
        'sortOrder, status, isHot, isNew, offlineReason ' +
        'FROM servers ORDER BY sortOrder ASC, serverId ASC'
    ).then(function (servers) {
        var serverList = servers.map(function (s) {
            return {
                serverId: String(s.serverId),
                name: s.serverName,
                url: s.url,
                chaturl: s.chatUrl,
                dungeonurl: s.dungeonUrl,
                worldRoomId: s.worldRoomId,
                guildRoomId: s.guildRoomId,
                teamDungeonChatRoom: s.teamDungeonChatRoom,
                online: !!s.status,
                hot: !!s.isHot,
                new: !!s.isNew,
                offlineReason: s.offlineReason || ''
            };
        });

        if (!userId) {
            return buildResponse({
                serverList: serverList,
                history: [],
                offlineReason: ''
            });
        }

        return db.query(
            'SELECT DISTINCT serverId FROM loginHistory ' +
            'WHERE userId = ? ORDER BY loginTime DESC LIMIT 5',
            [userId]
        ).then(function (histRows) {
            var history = histRows.map(function (r) {
                return String(r.serverId);
            });

            return buildResponse({
                serverList: serverList,
                history: history,
                offlineReason: ''
            });
        });
    });
}

module.exports = { execute: execute };
