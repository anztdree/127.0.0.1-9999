/**
 * ============================================================
 * FRIENDSERVERACTION.JS - Mock Handler for friend.friendServerAction
 * ============================================================
 * 
 * Purpose: Relay handler for friend server actions
 * Called during login sequence to query friend list and blacklist
 * This is a proxy/relay action that wraps multiple sub-actions
 * 
 * HAR Reference: s398-zd.pksilo.com_2026_04_01_01_08_04.har
 * 
 * Flow (from game code main.min.js):
 *   1. Game calls: ts.processHandler({type:"friend", action:"friendServerAction", 
 *      relayAction:"queryFriends", userId:"...", version:"1.0"})
 *   2. Server processes based on relayAction and returns result
 *   3. Game also calls with relayAction:"queryBlackList"
 * 
 * HAR Data (2 sessions, identical response):
 *   Request (queryFriends):
 *     {"type":"friend","action":"friendServerAction","relayAction":"queryFriends",
 *      "userId":"f443c70a-...","version":"1.0"}
 *   Response: {ret:0, compress:false, serverTime:..., server0Time:14400000, 
 *              data:"{\"users\":[]}"}
 * 
 *   Request (queryBlackList):
 *     {"type":"friend","action":"friendServerAction","relayAction":"queryBlackList",
 *      "userId":"f443c70a-...","version":"1.0"}
 *   Response: {ret:0, compress:false, serverTime:..., server0Time:14400000, 
 *              data:"{\"users\":[]}"}
 * 
 * Other relayActions from HAR uniqueActions list (not seen in new player flow):
 *   - applyFriend
 *   - recommendFriend
 *   - getFriends
 * 
 * Author: Local SDK Bridge
 * Version: 1.0.0
 * ============================================================
 */

(function(window) {
    'use strict';

    var LOG = {
        prefix: '👥 [FRIEND]',
        _log: function(level, icon, message, data) {
            var timestamp = new Date().toISOString().substr(11, 12);
            var styles = {
                success: 'color: #22c55e; font-weight: bold;',
                info: 'color: #6b7280;',
                warn: 'color: #f59e0b; font-weight: bold;',
                error: 'color: #ef4444; font-weight: bold;'
            };
            var style = styles[level] || styles.info;
            var format = '%c' + this.prefix + ' ' + icon + ' [' + timestamp + '] ' + message;
            if (data !== undefined) {
                console.log(format + ' %o', style, data);
            } else {
                console.log(format, style);
            }
        },
        success: function(msg, data) { this._log('success', '✅', msg, data); },
        info: function(msg, data) { this._log('info', 'ℹ️', msg, data); },
        warn: function(msg, data) { this._log('warn', '⚠️', msg, data); },
        error: function(msg, data) { this._log('error', '❌', msg, data); }
    };

    /**
     * Handler for friend.friendServerAction
     * Registered via window.MAIN_SERVER_HANDLERS
     * 
     * relayAction determines the sub-handler:
     *   - queryFriends   → {users:[]} (no friends for new player)
     *   - queryBlackList → {users:[]} (no blacklist for new player)
     *   - applyFriend    → {users:[]} (no pending requests)
     *   - recommendFriend → {users:[]} (no recommendations on local)
     *   - getFriends      → {users:[]} (same as queryFriends)
     *   - default         → {users:[]} (safe fallback)
     */
    function handleFriendServerAction(request, playerData) {
        var relayAction = request.relayAction || 'unknown';
        LOG.info('Handling friend.friendServerAction');
        LOG.info('relayAction: ' + relayAction);
        LOG.info('UserId: ' + request.userId);

        // HAR: All responses for new player return {users:[]}
        // No friends, no blacklist, no pending requests, no recommendations
        var responseData = {
            type: 'friend',
            action: 'friendServerAction',
            relayAction: relayAction,
            userId: request.userId,
            version: request.version || '1.0',
            users: []
        };

        LOG.success(relayAction + ' → ' + responseData.users.length + ' users');

        return responseData;
    }

    // ========================================================
    // REGISTER HANDLER
    // ========================================================
    function register() {
        if (typeof window === 'undefined') {
            console.error('[FRIEND] window not available');
            return;
        }

        window.MAIN_SERVER_HANDLERS = window.MAIN_SERVER_HANDLERS || {};
        window.MAIN_SERVER_HANDLERS['friend.friendServerAction'] = handleFriendServerAction;

        LOG.success('Handler registered: friend.friendServerAction');
    }

    // Auto-register
    if (typeof window !== 'undefined') {
        register();
    } else {
        var _check = setInterval(function() {
            if (typeof window !== 'undefined') {
                clearInterval(_check);
                register();
            }
        }, 50);
        setTimeout(function() { clearInterval(_check); }, 10000);
    }

})(window);
