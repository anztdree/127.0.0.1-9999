'use strict';

/**
 * =====================================================
 *  activity/query/queryLanternBlessRecord.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: queryLanternBlessRecord
 *  DESC: Query user's lantern bless history record
 *  TYPE: READ
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"queryLanternBlessRecord", userId, actId, time }
 *
 *  CLIENT SOURCE: rewardHistoryBtnTap() (line 90801)
 *
 *  STATUS: TODO
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');

function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    var actId = parsed.actId;
    logger.info('ACTIVITY', 'queryLanternBlessRecord userId=' + userId + ' actId=' + actId);

    callback(RH.success({}));
}

module.exports = { handle: handle };
