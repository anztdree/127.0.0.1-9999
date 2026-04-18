'use strict';

/**
 * =====================================================
 *  activity/feast/whisFeastGetRankReward.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: whisFeastGetRankReward
 *  DESC: Claim Whis Feast rank-based reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"whisFeastGetRankReward", actId, userId, day, taskId, pick }
 *
 *  CLIENT SOURCE: ActivitySetReward.whisFeastRankReward() (line ~79577)
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
    logger.info('ACTIVITY', 'whisFeastGetRankReward' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
