'use strict';

/**
 * =====================================================
 *  activity/feast/whisFeastFoodFeedbackReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: whisFeastFoodFeedbackReward
 *  DESC: Claim Whis Feast food feedback reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"whisFeastFoodFeedbackReward", userId, rankType, actId, version }
 *
 *  CLIENT SOURCE: giveCateBtnTimeTap() (line 94997)
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
    logger.info('ACTIVITY', 'whisFeastFoodFeedbackReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
