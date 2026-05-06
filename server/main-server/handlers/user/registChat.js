/**
 * handlers/user/registChat.js — registChat Handler
 *
 * Client polling setiap 3 detik, max 15x setelah enterGame.
 * Response berisi chat server URL dan room IDs.
 *
 * Request: { type: 'user', action: 'registChat', userId, version: '1.0' }
 * Response: { _success: true, _chatServerUrl, _worldRoomId, _guildRoomId, _teamDungeonChatRoom, _teamChatRoom }
 */

module.exports = {
    schema: {
        // registChat tidak butuh table baru — semua data sudah ada dari enterGame
        // userId info di table user
    },

    execute: async (request, socket, ctx) => {
        const { responseBuilder, config, socketStates } = ctx;
        const { buildSuccess, buildError } = responseBuilder;
        const { userId } = request;

        if (!userId) {
            return buildError(8);  // ERROR_LACK_PARAM
        }

        // registChat response — berisi info chat server
        // Client menggunakan _chatServerUrl untuk connect ke Chat-Server
        // Guild room ID: hardcode — semua player 1 guild room
        const responseData = {
            _success: true,
            _chatServerUrl: config.chatServerUrl,
            _worldRoomId: config.worldRoomId,
            _guildRoomId: config.guildRoomId,             // Hardcode: 'guild_1'
            _teamDungeonChatRoom: config.teamDungeonChatRoom,
            _teamChatRoom: config.teamChatRoomId
        };

        // Update socket state
        const state = socketStates.get(socket.id);
        if (state) {
            state.chatRegistered = true;
        }

        return buildSuccess(responseData);
    }
};
