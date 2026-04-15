/**
 * =====================================================
 *  HTTP Handler: queryTeamRecord — Dungeon Server
 * =====================================================
 *
 *  CLIENT CODE (main.min.js line 143371):
 *    ts.httpReqHandler({
 *        type: "teamDungeonTeam",
 *        action: "queryTeamRecord",
 *        teamId
 *    }, function(e) { e._record: { captain, state, initMap, ... } })
 *
 *  Response: { _record: { captain, state, initMap, ... } }
 * =====================================================
 */

'use strict';

var responseBuilder = require('../utils/responseBuilder');

/**
 * @param {object} deps - { teamManager }
 * @param {object} params - { teamId }
 * @returns {object}
 */
function handle(deps, params) {
    var teamId = params.teamId;
    if (!teamId) {
        return responseBuilder.buildHttpError(8, 'Missing teamId');
    }

    var team = deps.teamManager.getTeam(teamId);
    if (!team) {
        return responseBuilder.buildHttpError(1, 'Team not found');
    }

    var membersInfo = deps.teamManager.getMembersInfo(teamId);
    var captainInfo = membersInfo.find(function(m) { return m.userId === team.owner; });

    return responseBuilder.buildHttpResponse({
        _record: {
            captain: captainInfo || null,
            state: team.state,
            initMap: null,
            members: membersInfo,
            createdAt: team.createdAt,
        },
    });
}

module.exports = { handle: handle };
