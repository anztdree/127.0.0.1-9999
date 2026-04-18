'use strict';

/**
 * =====================================================
 *  activity/recharge/cumulativeRechargeReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: cumulativeRechargeReward
 *  DESC: CLAIM cumulative recharge total milestone reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"cumulativeRechargeReward", actId, userId, itemId }
 *
 *  CLIENT SOURCE: ActivitySetReward.cumulativeRechargeReward() (line ~79577)
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
    logger.info('ACTIVITY', 'cumulativeRechargeReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
