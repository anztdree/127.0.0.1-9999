/**
 * Login Server - GetServerList Handler
 * 
 * 100% derived from client code analysis.
 * 
 * CLIENT REQUEST (line 77332-77340):
 *   { type:"User", action:"GetServerList", userId, subChannel, channel }
 * 
 * CLIENT RESPONSE HANDLER - selectNewServer (line 88652-88660):
 *   this.filterByWhiteList(t.serverList);
 *   var o = !t.history || t.history.length <= 0;
 *   var a = t.history.length > 0 ? t.history[0] : t.serverList[0].serverId;
 *   var r = n.matchServerUrl(a, t.serverList);
 * 
 * matchServerUrl (line 88666-88678):
 *   for (var i = 0; i < serverList.length; i++) {
 *     if (serverList[i].serverId === serverId) return serverList[i]
 *   }
 * 
 * onLoginSuccess stores: ts.loginInfo.serverItem = serverObj
 * Server object must have: serverId, name, url, dungeonurl, chaturl, online, hot, "new"
 * 
 * changeServerInfo (line 88663-88665):
 *   Copies offlineReason to each server item if present
 */

const { success } = require('../../shared/responseHelper');
const { info } = require('../../shared/utils/logger');
const { getServerList } = require('../../shared/config');

/**
 * Handle GetServerList action
 * 
 * @param {object} payload - Client request
 * @param {function} callback - Socket.IO ack callback
 */
function getServerListHandler(payload, callback) {
    const serverListData = getServerList();
    info('getServerList', `Returning ${serverListData.serverList.length} servers`);

    if (callback) {
        callback(success(serverListData));
    }
}

module.exports = { getServerListHandler };
