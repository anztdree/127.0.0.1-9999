'use strict';

/**
 * =====================================================
 *  activity/misc/userCertification.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: userCertification
 *  DESC: Submit user real-name certification
 *  TYPE: WRITE
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"userCertification", actId, userId }
 *
 *  CLIENT SOURCE: identificationBtnTap() (line 93999)
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
    logger.info('ACTIVITY', 'userCertification' + ' userId=' + userId);

    // TODO: Implement business logic

    callback(RH.success({}));
}

module.exports = { handle: handle };
