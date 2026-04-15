/**
 * =====================================================
 *  activity/index.js — Activity Module Export
 *  Super Warrior Z Game Server — Main Server
 *
 *  Re-exports activity manager for convenient access.
 *
 *  Usage:
 *    var Activity = require('./activity');
 *    Activity.init(serverOpenDate);
 *    var days = Activity.getOpenServerDays();
 * =====================================================
 */

'use strict';

module.exports = require('./manager');
