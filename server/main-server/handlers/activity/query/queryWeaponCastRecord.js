'use strict';

/**
 * =====================================================
 *  activity/query/queryWeaponCastRecord.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: queryWeaponCastRecord
 *  DESC: Query user's weapon cast lottery history
 *  TYPE: READ
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"queryWeaponCastRecord", userId, actId, time }
 *
 *  CLIENT SOURCE: queryBtnTap() (line 90018)
 *
 *  STATUS: TODO
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');

function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    var actId = parsed.actId;
    logger.info('ACTIVITY', 'queryWeaponCastRecord userId=' + userId + ' actId=' + actId);

    callback(RH.success({}));
}

module.exports = { handle: handle };
