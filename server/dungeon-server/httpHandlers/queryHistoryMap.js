/**
 * =====================================================
 *  HTTP Handler: queryHistoryMap — Dungeon Server
 * =====================================================
 *
 *  CLIENT CODE (main.min.js line 143192):
 *    ts.httpReqHandler({
 *        type: "teamDungeonTeam",
 *        action: "queryHistoryMap",
 *        mapId, dungeonId
 *    }, function(e) { e._map: { map, items } })
 *
 *  Response: { _map: { map: {...}, items: [...] } }
 * =====================================================
 */

'use strict';

var GameData = require('../../server/shared/gameData/loader');
var responseBuilder = require('../utils/responseBuilder');

/**
 * @param {object} deps
 * @param {object} params - { mapId, dungeonId }
 * @returns {object}
 */
function handle(deps, params) {
    try {
        var mapId = params.mapId;
        var dungeonId = params.dungeonId;

        // Try to load specific map data
        var mapData = null;
        if (mapId) {
            var mapKey = 'teamDungeon' + mapId;
            try { mapData = GameData.get(mapKey); } catch (e) {}
        }

        // Try to load dungeon data
        var dungeonData = null;
        if (dungeonId) {
            try {
                var dungeonConfig = GameData.get('teamDungeon');
                if (dungeonConfig) dungeonData = dungeonConfig[String(dungeonId)];
            } catch (e) {}
        }

        return responseBuilder.buildHttpResponse({
            _map: {
                map: mapData || {},
                items: [],
            },
        });
    } catch (err) {
        return responseBuilder.buildHttpError(1, 'Failed to load history map');
    }
}

module.exports = { handle: handle };
