'use strict';

/**
 * =====================================================
 *  activity/lantern/resetLanternBless.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: resetLanternBless
 *  DESC: Reset lantern bless progress
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"resetLanternBless", actId, userId }
 *
 *  CLIENT SOURCE: reset btn tap (line 90682)
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
    logger.info('ACTIVITY', 'resetLanternBless' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
