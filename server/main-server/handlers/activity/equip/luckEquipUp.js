'use strict';

/**
 * =====================================================
 *  activity/equip/luckEquipUp.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: luckEquipUp
 *  DESC: Upgrade lucky equipment enchantment level
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"luckEquipUp", userId, actId, pos }
 *
 *  CLIENT SOURCE: upBtnTap() (line 95566)
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
    logger.info('ACTIVITY', 'luckEquipUp' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
