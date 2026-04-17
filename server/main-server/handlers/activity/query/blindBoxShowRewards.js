'use strict';

/**
 * =====================================================
 *  activity/query/blindBoxShowRewards.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: blindBoxShowRewards
 *  DESC: Show the list of possible blind box rewards
 *  TYPE: READ
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"blindBoxShowRewards", actId, userId }
 *
 *  CLIENT SOURCE: childrenCreated() (line 89455) — ActivityBlindBox panel
 *
 *  STATUS: TODO
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');

function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    var actId = parsed.actId;
    logger.info('ACTIVITY', 'blindBoxShowRewards userId=' + userId + ' actId=' + actId);

    callback(RH.success({}));
}

module.exports = { handle: handle };
