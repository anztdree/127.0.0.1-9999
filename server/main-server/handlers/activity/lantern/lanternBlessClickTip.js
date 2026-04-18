'use strict';

/**
 * =====================================================
 *  activity/lantern/lanternBlessClickTip.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: lanternBlessClickTip
 *  DESC: Claim lantern bless click-tip reward
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"lanternBlessClickTip", userId, actId }
 *
 *  CLIENT SOURCE: ruleDesBtnTap() (line 90788)
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
    logger.info('ACTIVITY', 'lanternBlessClickTip' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
