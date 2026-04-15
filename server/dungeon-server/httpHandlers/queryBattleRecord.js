/**
 * =====================================================
 *  HTTP Handler: queryBattleRecord — Dungeon Server
 * =====================================================
 *
 *  CLIENT CODE (main.min.js line 143803):
 *    ts.httpReqHandler({
 *        type: "teamDungeonTeam",
 *        action: "queryBattleRecord",
 *        battleId
 *    }, function(e) {
 *        e._record: { _recordData, _leftTeam, _rightTeam,
 *                     _leftSuperSkill, _rightSuperSkill }
 *    })
 *
 *  Response: { _record: { _recordData, _leftTeam, _rightTeam, ... } }
 * =====================================================
 */

'use strict';

var responseBuilder = require('../utils/responseBuilder');

/**
 * @param {object} deps - { battleManager }
 * @param {object} params - { battleId }
 * @returns {object}
 */
function handle(deps, params) {
    var battleId = params.battleId;
    if (!battleId) {
        return responseBuilder.buildHttpError(8, 'Missing battleId');
    }

    var battle = deps.battleManager.getBattle(battleId);
    if (!battle) {
        return responseBuilder.buildHttpError(1, 'Battle not found');
    }

    return responseBuilder.buildHttpResponse({
        _record: {
            _recordData: battle.recordData || [],
            _leftTeam: battle.leftTeam || [],
            _rightTeam: battle.rightTeam || [],
            _leftSuperSkill: battle.leftSuperSkill || [],
            _rightSuperSkill: battle.rightSuperSkill || [],
        },
    });
}

module.exports = { handle: handle };
