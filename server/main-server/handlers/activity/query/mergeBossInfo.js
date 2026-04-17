'use strict';

/**
 * =====================================================
 *  activity/query/mergeBossInfo.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: mergeBossInfo
 *  DESC: Get merge boss event info for current user
 *  TYPE: READ
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"mergeBossInfo", userId, guildUUID, version }
 *
 *  CLIENT SOURCE: mergeBossInfo() (line 95631) — ActivityMergeBoss panel
 *
 *  STATUS: TODO
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');

function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    logger.info('ACTIVITY', 'mergeBossInfo userId=' + userId);

    callback(RH.success({}));
}

module.exports = { handle: handle };
