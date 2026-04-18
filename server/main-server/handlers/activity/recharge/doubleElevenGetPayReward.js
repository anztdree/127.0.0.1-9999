'use strict';

/**
 * =====================================================
 *  activity/recharge/doubleElevenGetPayReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: doubleElevenGetPayReward
 *  DESC: CLAIM Double Eleven (11.11) special pay reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"doubleElevenGetPayReward", userId, actId, rewardId, version }
 *
 *  CLIENT SOURCE: receiveBtn1TimeTap/2TimeTap() (line 92366, 92379)
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
    logger.info('ACTIVITY', 'doubleElevenGetPayReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
