/**
 * handlers/user/registChat.js — Register Chat Server Connection
 *
 * Called by client after enterGame success (line 114438):
 *   ts.chatInterval = setInterval(() => { ts.registChat(broadcastRecord) }, 3000);
 *
 * Client request (line 114462):
 *   type: 'user'
 *   action: 'registChat'
 *   userId: string              — dari UserInfoSingleton.getInstance().userId
 *   version: '1.0'
 *
 * IMPORTANT: This is sent via processHandler (main-server), NOT processHandlerWithChat.
 * Response is decompressed by the same processHandler flow (line 113870):
 *   if (0 === e.ret) {
 *       var o = e.data;
 *       e.compress && (o = LZString.decompressFromUTF16(o));
 *       var a = JSON.parse(o);
 *       t && t(a);   ← callback receives decompressed JSON
 *   }
 *
 * Response fields (line 114470):
 *   _success: true                  — MUST be truthy to stop retry interval
 *   _chatServerUrl: string          → ts.loginInfo.serverItem.chaturl
 *   _worldRoomId: string            → ts.loginInfo.serverItem.worldRoomId
 *   _guildRoomId: string|null       → ts.loginInfo.serverItem.guildRoomId (conditional)
 *   _teamDungeonChatRoom: string|null → ts.loginInfo.serverItem.teamDungeonChatRoom (conditional)
 *   _teamChatRoom: string|null      → ts.loginInfo.serverItem.teamChatRoomId (conditional)
 *
 * After _success=true, client (line 114470):
 *   clearInterval(ts.chatInterval)
 *   t.clientStartChat(false, broadcastRecord)
 *
 * After _success=false, client (line 114470):
 *   ts.chatConnectCount++
 *   ts.chatConnectCount > 15 → clearInterval(ts.chatInterval)  (give up after 45s)
 *
 * Data source: Login server DB → servers table
 *   chatUrl, worldRoomId, guildRoomId, teamDungeonChatRoom
 *
 * For guild/team rooms: currently return null since guild/team data not yet implemented.
 * Client skips joinRoom for null room IDs (line 114568-114599):
 *   if (ts.loginInfo.serverItem.guildRoomId) { join } else { e() }
 */

function execute(data, socket, ctx) {
    var buildResponse = ctx.buildResponse;
    var buildErrorResponse = ctx.buildErrorResponse;
    var config = ctx.config;
    var db = ctx.db;

    var userId = (data.userId || '').trim();

    if (!userId) {
        return Promise.resolve(buildErrorResponse(1));
    }

    // Read server info from login DB (READ-ONLY)
    // Login DB schema (login-server/db.js line 54-69):
    //   servers table: serverId, serverName, url, chatUrl, dungeonUrl,
    //                  worldRoomId, guildRoomId, teamDungeonChatRoom, ...
    //
    // Column names are camelCase in schema definition.
    // better-sqlite3 preserves original case from CREATE TABLE.
    var serverInfo = null;

    try {
        serverInfo = db.loginDbQueryOne(
            'SELECT * FROM servers WHERE serverId = ?',
            [config.serverId]
        );
    } catch (err) {
        console.error('  \u274C registChat: failed to query login DB: ' + err.message);
        return Promise.resolve(buildErrorResponse(1));
    }

    if (!serverInfo) {
        console.error('  \u274C registChat: server not found in login DB, serverId=' + config.serverId);
        return Promise.resolve(buildErrorResponse(1));
    }

    // Build response with chat server connection info
    // Field names match client expectations (line 114470)
    var response = {
        _success: true,
        _chatServerUrl: serverInfo.chatUrl || '',
        _worldRoomId: serverInfo.worldRoomId || '',
        _guildRoomId: null,                // TODO: return guild-specific room when guild system implemented
        _teamDungeonChatRoom: null,        // TODO: return team dungeon room when in team dungeon
        _teamChatRoom: null                // TODO: return team chat room when team system implemented
    };

    // Validate chat URL is not empty
    if (!response._chatServerUrl) {
        console.error('  \u274C registChat: chatUrl is empty for server ' + config.serverId);
        return Promise.resolve(buildErrorResponse(1));
    }

    // Validate world room ID is not empty
    if (!response._worldRoomId) {
        console.error('  \u274C registChat: worldRoomId is empty for server ' + config.serverId);
        return Promise.resolve(buildErrorResponse(1));
    }

    console.log('  \uD83D\uDCAC registChat: userId=' + userId +
        ' → chatUrl=' + response._chatServerUrl +
        ' worldRoom=' + response._worldRoomId);

    return Promise.resolve(buildResponse(response));
}

module.exports = { execute: execute };
