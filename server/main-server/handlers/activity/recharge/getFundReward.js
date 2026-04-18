'use strict';

/**
 * =====================================================
 *  activity/recharge/getFundReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: getFundReward
 *  DESC: CLAIM daily/level fund reward from purchased fund
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"getFundReward", actId, userId, day }
 *
 *  CLIENT SOURCE: clickRewardItem() (line 91183)
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
    logger.info('ACTIVITY', 'getFundReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
