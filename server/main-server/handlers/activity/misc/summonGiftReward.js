'use strict';

/**
 * =====================================================
 *  activity/misc/summonGiftReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: summonGiftReward
 *  DESC: Claim summon gift pack reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"summonGiftReward", actId, userId, itemId, pick }
 *
 *  CLIENT SOURCE: ActivitySetReward.SummonGiftReward() (line ~79577)
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
    logger.info('ACTIVITY', 'summonGiftReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
