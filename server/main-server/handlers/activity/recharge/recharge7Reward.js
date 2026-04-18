'use strict';

/**
 * =====================================================
 *  activity/recharge/recharge7Reward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: recharge7Reward
 *  DESC: CLAIM 7-day cumulative recharge reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"recharge7Reward", actId, userId, pick, day }
 *
 *  CLIENT SOURCE: ActivitySetReward.recharge7Reward() (line ~79577)
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
    logger.info('ACTIVITY', 'recharge7Reward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
