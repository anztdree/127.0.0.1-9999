'use strict';

/**
 * =====================================================
 *  activity/farm/gleaningBuyTicket.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: gleaningBuyTicket
 *  DESC: Purchase extra gleaning tickets
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"gleaningBuyTicket", actId, userId, num }
 *
 *  CLIENT SOURCE: buyGleaningCost() (line 93039)
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
    logger.info('ACTIVITY', 'gleaningBuyTicket' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
