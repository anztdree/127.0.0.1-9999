'use strict';

/**
 * =====================================================
 *  activity/query/getActivityBrief.js — Get Activity Brief List
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: getActivityBrief — Return brief list of all active activities.
 *
 *  STATUS: IMPLEMENTED (verified against HAR decompressed data)
 *
 *  CLIENT REQUEST:
 *    { type:"activity", action:"getActivityBrief", userId, version:"1.0" }
 *
 *  CLIENT CALLBACKS:
 *    1. Home.setActs (line 168087) — main entry, populates activity bar
 *    2. backToActivityPage (line 57528) — returning from activity detail
 *
 *  RESPONSE FORMAT (verified from HAR):
 *    {
 *      type: "activity",
 *      action: "getActivityBrief",
 *      userId: "...",
 *      version: "1.0",
 *      _acts: {
 *        "<uuid>": { id, templateName, name, icon, displayIndex,
 *                    showRed, actCycle, actType, [haveExReward] }
 *      }
 *    }
 *
 *  Client iterates: for(var a in t._acts) → reads r.id, r.actType, etc.
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');
var activityConfig = require('../_config');

function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    logger.info('ACTIVITY', 'getActivityBrief userId=' + userId);

    callback(RH.success({
        type: parsed.type || 'activity',
        action: parsed.action || 'getActivityBrief',
        userId: userId || '',
        version: parsed.version || '1.0',
        _acts: activityConfig.ACTS_MAP
    }));
}

module.exports = { handle: handle };
