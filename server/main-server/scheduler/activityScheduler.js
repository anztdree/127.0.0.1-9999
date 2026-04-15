/**
 * =====================================================
 *  activityScheduler.js — Activity Lifecycle Scheduler
 *  Super Warrior Z Game Server — Main Server
 *
 *  Manages time-based activity open/close cycles.
 *  Activities have defined start/end times and the scheduler
 *  triggers open/close events at the right moments.
 *
 *  Client expects activities to be open/close based on:
 *    - Open server day count (days since server launch)
 *    - Day of week (weekly activities)
 *    - Fixed date ranges (limited-time events)
 *    - Configuration from resource/json/activity*.json files
 *
 *  Activity lifecycle:
 *    CLOSED → (trigger open) → OPEN → (trigger close) → CLOSED
 *
 *  The scheduler checks activity configs periodically and
 *  notifies connected users when activities change state.
 * =====================================================
 */

'use strict';

var GameData = require('../../shared/gameData/loader');

/**
 * Activity states
 * @enum {string}
 */
var ACTIVITY_STATE = {
    CLOSED: 'closed',
    OPEN: 'open',
    UPCOMING: 'upcoming'
};

/**
 * In-memory store of current activity states.
 * Key: activity ID, Value: { state, openTime, closeTime, config }
 *
 * @type {Object.<string, object>}
 */
var _activities = {};

/**
 * Timer reference for the periodic check interval.
 * @type {number|null}
 */
var _checkInterval = null;

/**
 * Default check interval in milliseconds (every 30 seconds).
 * @type {number}
 */
var CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Initialize the activity scheduler.
 *
 * Loads activity configurations from game data JSON files
 * and starts the periodic check timer.
 *
 * @param {object} connectedClients - Map of userId -> socket (from index.js)
 */
function init(connectedClients) {
    console.log('[ActivityScheduler] Initializing...');

    // Load activity configs from game data
    _loadActivityConfigs();

    // Start periodic check
    if (_checkInterval) {
        clearInterval(_checkInterval);
    }

    _checkInterval = setInterval(function () {
        _checkActivityStates(connectedClients);
    }, CHECK_INTERVAL_MS);

    console.log('[ActivityScheduler] Initialized. Check interval: ' +
        CHECK_INTERVAL_MS + 'ms, Activities loaded: ' +
        Object.keys(_activities).length);
}

/**
 * Load activity configurations from game data JSON files.
 *
 * Reads from GameData (loaded on server startup from resource/json/):
 *   - activityDefine.json
 *   - activityTime.json
 *   - costFeedback.json
 *   - etc.
 *
 * @private
 */
function _loadActivityConfigs() {
    var activityDefine = GameData.get('activityDefine');
    var activityTime = GameData.get('activityTime');

    if (activityDefine && Array.isArray(activityDefine)) {
        for (var i = 0; i < activityDefine.length; i++) {
            var act = activityDefine[i];
            if (act && act.id) {
                _activities[act.id] = {
                    state: ACTIVITY_STATE.CLOSED,
                    config: act,
                    openTime: null,
                    closeTime: null
                };
            }
        }
    }

    // Apply time configs if available
    if (activityTime && typeof activityTime === 'object') {
        var actKeys = Object.keys(activityTime);
        for (var j = 0; j < actKeys.length; j++) {
            var actId = actKeys[j];
            var timeConfig = activityTime[actId];
            if (_activities[actId] && timeConfig) {
                _activities[actId].openTime = timeConfig.startTime || null;
                _activities[actId].closeTime = timeConfig.endTime || null;
            }
        }
    }
}

/**
 * Check all activity states and trigger state transitions.
 *
 * Called periodically by the check interval timer.
 * Compares current time against each activity's open/close times
 * and transitions states as needed.
 *
 * @param {object} connectedClients - Map of userId -> socket
 * @private
 */
function _checkActivityStates(connectedClients) {
    var now = Date.now();
    var actIds = Object.keys(_activities);

    for (var i = 0; i < actIds.length; i++) {
        var actId = actIds[i];
        var activity = _activities[actId];
        var oldState = activity.state;

        // Determine new state based on times
        var newState = _calculateState(activity, now);

        // State transition
        if (newState !== oldState) {
            activity.state = newState;
            console.log('[ActivityScheduler] Activity ' + actId +
                ' changed: ' + oldState + ' -> ' + newState);

            // Notify all connected users of the state change
            if (connectedClients && typeof connectedClients === 'object') {
                _notifyActivityChange(connectedClients, actId, newState);
            }
        }
    }
}

/**
 * Calculate the current state of an activity based on times.
 *
 * @param {object} activity - Activity object with openTime/closeTime
 * @param {number} now - Current timestamp
 * @returns {string} Activity state (open/closed/upcoming)
 * @private
 */
function _calculateState(activity, now) {
    // No time config — always closed
    if (!activity.openTime && !activity.closeTime) {
        return ACTIVITY_STATE.CLOSED;
    }

    // Has open time but no close time — open if past open time
    if (activity.openTime && !activity.closeTime) {
        return now >= activity.openTime ? ACTIVITY_STATE.OPEN : ACTIVITY_STATE.UPCOMING;
    }

    // Both times set
    if (now < activity.openTime) {
        return ACTIVITY_STATE.UPCOMING;
    } else if (now >= activity.openTime && now < activity.closeTime) {
        return ACTIVITY_STATE.OPEN;
    } else {
        return ACTIVITY_STATE.CLOSED;
    }
}

/**
 * Notify connected users about activity state change.
 *
 * @param {object} connectedClients - Map of userId -> socket
 * @param {string} actId - Activity ID
 * @param {string} newState - New activity state
 * @private
 */
function _notifyActivityChange(connectedClients, actId, newState) {
    var Notifications = require('../notifications');
    var action = newState === ACTIVITY_STATE.OPEN ? 'activityOpen' : 'activityClose';

    Notifications.broadcastNotify(connectedClients, action, {
        activityId: actId,
        state: newState
    });
}

/**
 * Get the current state of a specific activity.
 *
 * @param {string} activityId - Activity ID
 * @returns {string|null} Activity state or null if not found
 */
function getActivityState(activityId) {
    if (_activities[activityId]) {
        return _activities[activityId].state;
    }
    return null;
}

/**
 * Get all current activity states.
 *
 * @returns {Object.<string, string>} Map of activityId -> state
 */
function getAllActivityStates() {
    var states = {};
    var actIds = Object.keys(_activities);
    for (var i = 0; i < actIds.length; i++) {
        states[actIds[i]] = _activities[actIds[i]].state;
    }
    return states;
}

/**
 * Force-set an activity state (admin/debug use).
 *
 * @param {string} activityId - Activity ID
 * @param {string} state - New state ('open', 'closed', 'upcoming')
 * @param {object} [times] - Optional { openTime, closeTime } overrides
 * @returns {boolean} true if successful
 */
function setActivityState(activityId, state, times) {
    if (!_activities[activityId]) {
        return false;
    }

    _activities[activityId].state = state;
    if (times) {
        if (times.openTime) _activities[activityId].openTime = times.openTime;
        if (times.closeTime) _activities[activityId].closeTime = times.closeTime;
    }

    return true;
}

/**
 * Stop the scheduler (for graceful shutdown).
 * Clears the periodic check interval.
 */
function shutdown() {
    if (_checkInterval) {
        clearInterval(_checkInterval);
        _checkInterval = null;
        console.log('[ActivityScheduler] Shutdown complete');
    }
}

module.exports = {
    ACTIVITY_STATE: ACTIVITY_STATE,
    init: init,
    getActivityState: getActivityState,
    getAllActivityStates: getAllActivityStates,
    setActivityState: setActivityState,
    shutdown: shutdown
};
