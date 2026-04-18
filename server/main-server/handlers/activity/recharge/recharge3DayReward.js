'use strict';

/**
 * =====================================================
 *  activity/recharge/recharge3DayReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: recharge3DayReward
 *  DESC: CLAIM 3-day cumulative recharge reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"recharge3DayReward", actId, userId, day, pick }
 *
 *  CLIENT SOURCE: ActivitySetReward.recharge3DayReward() (line ~79577)
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
    logger.info('ACTIVITY', 'recharge3DayReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
