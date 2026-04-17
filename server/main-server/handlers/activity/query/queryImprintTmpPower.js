'use strict';

/**
 * =====================================================
 *  activity/query/queryImprintTmpPower.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: queryImprintTmpPower
 *  DESC: Query the temporary power bonus from current imprint
 *  TYPE: READ
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"queryImprintTmpPower", userId, actId, imprintId }
 *
 *  CLIENT SOURCE: sign wash check (line 98677)
 *
 *  STATUS: TODO
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');

function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    var actId = parsed.actId;
    logger.info('ACTIVITY', 'queryImprintTmpPower userId=' + userId + ' actId=' + actId);

    callback(RH.success({}));
}

module.exports = { handle: handle };
