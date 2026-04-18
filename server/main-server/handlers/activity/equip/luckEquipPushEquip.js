'use strict';

/**
 * =====================================================
 *  activity/equip/luckEquipPushEquip.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: luckEquipPushEquip
 *  DESC: Push/store equipment into lucky equip slot
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"luckEquipPushEquip", userId, actId, pos, equipId }
 *
 *  CLIENT SOURCE: addButtonTap() (line 95450)
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
    logger.info('ACTIVITY', 'luckEquipPushEquip' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
