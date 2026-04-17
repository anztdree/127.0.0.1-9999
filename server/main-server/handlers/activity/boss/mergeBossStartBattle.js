'use strict';

/**
 * =====================================================
 *  activity/boss/mergeBossStartBattle.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: mergeBossStartBattle
 *  DESC: Start a merge boss battle
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"mergeBossStartBattle", userId, guildUUID, actId, version, team, super, battleField }
 *
 *  CLIENT SOURCE: mergeBossBattle() (line 64109)
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
    logger.info('ACTIVITY', 'mergeBossStartBattle' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
