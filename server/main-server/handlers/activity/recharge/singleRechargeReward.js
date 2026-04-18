'use strict';

/**
 * =====================================================
 *  activity/recharge/singleRechargeReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: singleRechargeReward
 *  DESC: CLAIM single-recharge milestone reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"singleRechargeReward", actId, userId, day, itemId, pick }
 *
 *  CLIENT SOURCE: ActivitySetReward.SingleRechargeReward() (line ~79577)
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
    logger.info('ACTIVITY', 'singleRechargeReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
