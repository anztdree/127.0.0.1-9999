'use strict';

/**
 * =====================================================
 *  activity/equip/luckEquipGetReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: luckEquipGetReward
 *  DESC: Claim lucky equipment accumulated reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"luckEquipGetReward", actId, userId, itemId, pick }
 *
 *  CLIENT SOURCE: ActivitySetReward.luckyEquip() (line ~79577)
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
    logger.info('ACTIVITY', 'luckEquipGetReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
