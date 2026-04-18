'use strict';

/**
 * =====================================================
 *  activity/equip/luckEquipGetEquip.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: luckEquipGetEquip
 *  DESC: Retrieve lucky equipment draw result
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"luckEquipGetEquip", userId, actId, pos }
 *
 *  CLIENT SOURCE: receiveBtnTap() (line 95541)
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
    logger.info('ACTIVITY', 'luckEquipGetEquip' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
