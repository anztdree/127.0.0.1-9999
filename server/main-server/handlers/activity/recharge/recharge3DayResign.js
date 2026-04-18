'use strict';

/**
 * =====================================================
 *  activity/recharge/recharge3DayResign.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: recharge3DayResign
 *  DESC: RESIGN from 3-day recharge event (abandon progress)
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"recharge3DayResign", actId, userId, pick, day }
 *
 *  CLIENT SOURCE: ActivitySetReward.recharge3DayRewardResign() (line ~79577)
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
    logger.info('ACTIVITY', 'recharge3DayResign' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
