'use strict';

/**
 * =====================================================
 *  activity/equip/equipUp.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: equipUp
 *  DESC: Upgrade equipment item via activity
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"equipUp", userId, actId, equipId }
 *
 *  CLIENT SOURCE: confirmBtnTap() (line 98625)
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
    logger.info('ACTIVITY', 'equipUp' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
