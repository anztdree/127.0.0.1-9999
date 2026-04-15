/**
 * =====================================================
 *  HTTP Handler: queryRobot — Dungeon Server
 * =====================================================
 *
 *  CLIENT CODE (main.min.js line 87617):
 *    ts.httpReqHandler({
 *        type: "teamDungeonTeam",
 *        action: "queryRobot"
 *    }, function(e) { e._robots })
 *
 *  Response: { _robots: {...} }
 * =====================================================
 */

'use strict';

var responseBuilder = require('../utils/responseBuilder');

/**
 * @param {object} deps - { robotService }
 * @param {object} params
 * @returns {object}
 */
function handle(deps, params) {
    return responseBuilder.buildHttpResponse({
        _robots: deps.robotService.getRobots(),
    });
}

module.exports = { handle: handle };
