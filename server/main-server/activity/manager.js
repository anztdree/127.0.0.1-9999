/**
 * =====================================================
 *  activity/manager.js — Activity Manager
 *  Super Warrior Z Game Server — Main Server
 *
 *  Manages the full lifecycle of game activities:
 *    - Open server day tracking (days since server launch)
 *    - Active activity list with open/close times
 *    - Activity reward distribution
 *    - Activity participation tracking
 *
 *  Client reads serverOpenDate from enterGame response:
 *    UserInfoSingleton.setServerOpenDate(e.serverOpenDate)
 *
 *  Many activity configs depend on openServerDay:
 *    - Day 1-3: Beginner activities
 *    - Day 7: First week events
 *    - Day 30: Monthly events
 *    - Day-specific milestone rewards
 *
 *  Usage:
 *    var ActivityManager = require('./activity');
 *    ActivityManager.init();
 *    var days = ActivityManager.getOpenServerDays();
 *    var active = ActivityManager.getActiveActivities();
 * =====================================================
 */

'use strict';

var GameData = require('../../shared/gameData/loader');
var helpers = require('../utils/helpers');

/**
 * Server open date timestamp.
 * Set from config or database on init.
 * @type {number|null}
 */
var _serverOpenDate = null;

/**
 * Open server day cache.
 * Recalculated every hour.
 * @type {number}
 */
var _cachedOpenDays = 0;

/**
 * Last time open days was calculated.
 * @type {number}
 */
var _lastCalcTime = 0;

/**
 * Cache TTL for open days calculation (1 hour).
 * @type {number}
 */
var CALC_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Initialize the activity manager.
 *
 * Sets the server open date and pre-calculates
 * the open server day count.
 *
 * @param {number} [serverOpenDate] - Server open timestamp (ms).
 *   If not provided, reads from GameData or defaults to now.
 */
function init(serverOpenDate) {
    if (serverOpenDate && typeof serverOpenDate === 'number') {
        _serverOpenDate = serverOpenDate;
    } else {
        // Try to read from game data configs
        var serverConfig = GameData.get('serverConfig');
        if (serverConfig && serverConfig.openDate) {
            _serverOpenDate = serverConfig.openDate;
        } else {
            // Default to now (new server)
            _serverOpenDate = Date.now();
            console.log('[ActivityManager] No server open date found, defaulting to now');
        }
    }

    _cachedOpenDays = _calculateOpenDays();
    _lastCalcTime = Date.now();

    console.log('[ActivityManager] Initialized. Server open date: ' +
        new Date(_serverOpenDate).toLocaleString() +
        ', Open days: ' + _cachedOpenDays);
}

/**
 * Calculate the number of days since server opened.
 *
 * A "day" starts at 6:00 AM (matching daily reset time).
 * Day 1 = the day the server opened.
 *
 * @returns {number} Number of open server days (1-based)
 * @private
 */
function _calculateOpenDays() {
    if (!_serverOpenDate) return 0;

    var now = new Date();
    var open = new Date(_serverOpenDate);

    // Both dates' 6:00 AM boundaries
    var nowBoundary = new Date(now);
    nowBoundary.setHours(6, 0, 0, 0);
    if (now < nowBoundary) {
        nowBoundary.setDate(nowBoundary.getDate() - 1);
    }

    var openBoundary = new Date(open);
    openBoundary.setHours(6, 0, 0, 0);
    if (open < openBoundary) {
        openBoundary.setDate(openBoundary.getDate() - 1);
    }

    var diffMs = nowBoundary.getTime() - openBoundary.getTime();
    var diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    return Math.max(diffDays + 1, 1); // 1-based
}

/**
 * Get the current open server day count.
 *
 * Uses cached value if available (recalculates every hour).
 *
 * @returns {number} Open server days (1-based, minimum 1)
 */
function getOpenServerDays() {
    var now = Date.now();
    if (now - _lastCalcTime > CALC_INTERVAL_MS) {
        _cachedOpenDays = _calculateOpenDays();
        _lastCalcTime = now;
    }
    return _cachedOpenDays;
}

/**
 * Get the server open date timestamp.
 *
 * @returns {number|null} Server open date in ms, or null if not initialized
 */
function getServerOpenDate() {
    return _serverOpenDate;
}

/**
 * Check if a specific activity is available based on open server days.
 *
 * Many activity configs define minDay and maxDay requirements:
 *   - minDay: Activity opens on this server day
 *   - maxDay: Activity closes after this server day
 *
 * @param {object} activityConfig - Activity configuration object
 * @param {number} activityConfig.minDay - Minimum open server day
 * @param {number} [activityConfig.maxDay] - Maximum open server day (optional)
 * @returns {boolean} true if activity is within valid day range
 */
function isActivityAvailableByDay(activityConfig) {
    if (!activityConfig) return false;

    var currentDays = getOpenServerDays();
    var minDay = activityConfig.minDay || 1;

    if (currentDays < minDay) return false;

    if (activityConfig.maxDay && currentDays > activityConfig.maxDay) return false;

    return true;
}

/**
 * Get list of active activities based on open server day.
 *
 * Filters activity configs from GameData by open server day
 * and returns the list of currently active activities.
 *
 * @returns {Array<object>} Array of active activity configs
 */
function getActiveActivities() {
    var activityDefine = GameData.get('activityDefine');
    if (!activityDefine || !Array.isArray(activityDefine)) {
        return [];
    }

    var currentDays = getOpenServerDays();
    var active = [];

    for (var i = 0; i < activityDefine.length; i++) {
        var act = activityDefine[i];
        if (isActivityAvailableByDay(act)) {
            active.push({
                id: act.id,
                name: act.name || act.id,
                type: act.type || '',
                minDay: act.minDay || 1,
                maxDay: act.maxDay || null,
                config: act
            });
        }
    }

    return active;
}

/**
 * Get the activity data section for enterGame response.
 *
 * Returns serverOpenDate for the client's UserInfoSingleton.
 *
 * @returns {{ serverOpenDate: number, openDays: number }}
 */
function getEnterGameData() {
    return {
        serverOpenDate: _serverOpenDate || Date.now(),
        openDays: getOpenServerDays()
    };
}

module.exports = {
    init: init,
    getOpenServerDays: getOpenServerDays,
    getServerOpenDate: getServerOpenDate,
    isActivityAvailableByDay: isActivityAvailableByDay,
    getActiveActivities: getActiveActivities,
    getEnterGameData: getEnterGameData
};
