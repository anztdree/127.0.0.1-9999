/**
 * =====================================================
 *  HTTP Handler: queryTodayMap — Dungeon Server
 * =====================================================
 *
 *  Client queries today's team dungeon map via HTTP GET.
 *
 *  CLIENT CODE (main.min.js line 87611):
 *    ts.httpReqHandler({
 *        type: "teamDungeonTeam",
 *        action: "queryTodayMap"
 *    }, function(e) { e._maps })
 *
 *  Response: { _maps: [...] }
 * =====================================================
 */

'use strict';

var GameData = require('../../server/shared/gameData/loader');
var responseBuilder = require('../utils/responseBuilder');

/**
 * @param {object} deps - { robotService }
 * @param {object} params - Query parameters
 * @returns {object} HTTP response
 */
function handle(deps, params) {
    try {
        var maps = GameData.get('teamDungeon') || {};
        return responseBuilder.buildHttpResponse({ _maps: maps });
    } catch (err) {
        return responseBuilder.buildHttpError(1, 'Failed to load map data');
    }
}

module.exports = { handle: handle };
