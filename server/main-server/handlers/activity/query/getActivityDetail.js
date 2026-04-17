'use strict';

/**
 * =====================================================
 *  activity/query/getActivityDetail.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: getActivityDetail
 *  DESC: Get full config and user state for a specific activity
 *  TYPE: READ
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"getActivityDetail", userId, actId, cycleType, poolId }
 *
 *  CLIENT SOURCE: BaseActivity.changeDetalActivityView() (line 96437)
 *    Called when user taps an activity in the list.
 *
 *  RESPONSE (Custom):
 *    {
 *      act: { _id, _url, _hideos, _reward, _activityType, ... },  // activity config
 *      uact: { _gotReward, _startTime, _endTime, ... }             // user state
 *    }
 *
 *  STATUS: TODO
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');

function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    var actId = parsed.actId;
    logger.info('ACTIVITY', 'getActivityDetail userId=' + userId + ' actId=' + actId);

    // TODO: Load activity config by actId
    // TODO: Load user activity state
    // TODO: Return { act: {...}, uact: {...} }

    callback(RH.success({}));
}

module.exports = { handle: handle };
