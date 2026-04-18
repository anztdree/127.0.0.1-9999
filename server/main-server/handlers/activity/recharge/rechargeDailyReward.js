'use strict';

/**
 * =====================================================
 *  activity/recharge/rechargeDailyReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: rechargeDailyReward
 *  DESC: CLAIM daily recharge cumulative reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"rechargeDailyReward", actId, userId, pick, day, itemId }
 *
 *  CLIENT SOURCE: ActivitySetReward.rechargeDailyReward() (line ~79577)
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
    logger.info('ACTIVITY', 'rechargeDailyReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
