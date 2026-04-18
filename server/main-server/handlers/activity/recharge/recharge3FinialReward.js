'use strict';

/**
 * =====================================================
 *  activity/recharge/recharge3FinialReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: recharge3FinialReward
 *  DESC: CLAIM final reward after completing 3-day recharge
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"recharge3FinialReward", actId, userId, pick }
 *
 *  CLIENT SOURCE: ActivitySetReward.recharge3DayRewardFinish() (line ~79577)
 *
 *  RESPONSE (Universal):
 *    { _changeInfo: { _items: {...} },
 *      _addHeroes: {...}, _addSigns: {...},
 *      _addWeapons: {...}, _addStones: {...}, _addGenkis: {...} }
 *
 *  STATUS: TODO
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');

function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    logger.info('ACTIVITY', 'recharge3FinialReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
