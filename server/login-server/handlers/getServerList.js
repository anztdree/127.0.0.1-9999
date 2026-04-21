/**
 * Login Server — getServerList Handler
 *
 * Client request (main.min.js line 77332-77340):
 *   { type:"User", action:"GetServerList", userId, subChannel, channel }
 *
 * Client response handler selectNewServer (line 88652-88660):
 *   t.serverList → matchServerUrl → onLoginSuccess
 *   Server object must have: serverId, name, url, dungeonurl, chaturl, online, hot, "new"
 *
 * Response:
 *   { serverList: [...], history: [serverId, ...], offlineReason: "" }
 */

var { success } = require('../utils/responseHelper');
var logger = require('../utils/logger');
var CONSTANTS = require('../config/constants');

function getServerList(payload, callback) {
    var host = CONSTANTS.SERVER_PUBLIC_HOST;

    var data = {
        serverList: [
            {
                serverId: 1,
                name: 'Server 1',
                url: 'http://' + host + ':' + CONSTANTS.MAIN_SERVER_PORT,
                dungeonurl: 'http://' + host + ':' + CONSTANTS.DUNGEON_SERVER_PORT,
                chaturl: 'http://' + host + ':' + CONSTANTS.CHAT_SERVER_PORT,
                online: true,
                hot: false,
                "new": true,
            },
        ],
        history: [],
        offlineReason: '',
    };

    logger.info('getServerList', 'Returning 1 server (' + host + ')');
    if (callback) callback(success(data));
}

module.exports = { getServerList };
