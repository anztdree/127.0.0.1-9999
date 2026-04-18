'use strict';

/**
 * =====================================================
 *  activity/feast/whisFeastBlessExchange.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: whisFeastBlessExchange
 *  DESC: Exchange blessings at Whis Feast
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"whisFeastBlessExchange", userId, actId, num, propId, version }
 *
 *  CLIENT SOURCE: exchange btn tap (line 99590)
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
    logger.info('ACTIVITY', 'whisFeastBlessExchange' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
