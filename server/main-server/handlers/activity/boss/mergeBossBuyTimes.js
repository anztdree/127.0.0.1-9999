'use strict';

/**
 * =====================================================
 *  activity/boss/mergeBossBuyTimes.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: mergeBossBuyTimes
 *  DESC: Purchase extra merge boss challenge attempts
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"mergeBossBuyTimes", userId, actId, times, version }
 *
 *  CLIENT SOURCE: mergeBossBuyRequest() (line 150696)
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
    logger.info('ACTIVITY', 'mergeBossBuyTimes' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
