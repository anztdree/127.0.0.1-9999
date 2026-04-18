'use strict';

/**
 * =====================================================
 *  activity/recharge/rechargeGiftReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: rechargeGiftReward
 *  DESC: CLAIM recharge gift pack reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"rechargeGiftReward", actId, userId, pick, itemId }
 *
 *  CLIENT SOURCE: ActivitySetReward.rechargeGiftReward() (line ~79577)
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
    logger.info('ACTIVITY', 'rechargeGiftReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
