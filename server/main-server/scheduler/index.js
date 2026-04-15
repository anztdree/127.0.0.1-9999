/**
 * =====================================================
 *  scheduler/index.js — Scheduler Bundle Export
 *  Super Warrior Z Game Server — Main Server
 *
 *  Mengexport semua scheduler modules sebagai satu bundle.
 *  index.js cukup require('./scheduler') untuk mengakses semua.
 *
 *  Components:
 *    - dailyReset: Daily counter reset at 6:00 AM (36 fields)
 *    - recovery: Resource recovery calculations (stamina, hangup)
 *    - activityScheduler: Activity lifecycle management (open/close)
 *
 *  Usage:
 *    var Scheduler = require('./scheduler');
 *    Scheduler.dailyReset.performDailyReset();
 *    Scheduler.recovery.calculateStaminaRecovery(50, timestamp);
 *    Scheduler.activityScheduler.init(connectedClients);
 * =====================================================
 */

'use strict';

var dailyReset = require('./dailyReset');
var recovery = require('./recovery');
var activityScheduler = require('./activityScheduler');

/**
 * Initialize all scheduler systems.
 *
 * Called by main-server/index.js after server startup.
 * Sets up daily reset timer and activity scheduler.
 *
 * @param {object} connectedClients - Map of userId -> socket (from index.js)
 */
function initAll(connectedClients) {
    console.log('[Scheduler] Initializing all scheduler systems...');

    // 1. Initialize activity scheduler (checks every 30s)
    activityScheduler.init(connectedClients);

    // 2. Set up daily reset timer
    _scheduleNextDailyReset(connectedClients);

    // 3. Set up periodic battle cleanup (every 5 minutes)
    _scheduleBattleCleanup();

    console.log('[Scheduler] All scheduler systems initialized');
}

/**
 * Schedule the next daily reset at 6:00 AM.
 *
 * Calculates time until next 6:00 AM and sets a timeout.
 * After each reset, schedules the next one.
 *
 * @param {object} connectedClients - Map of userId -> socket
 * @private
 */
function _scheduleNextDailyReset(connectedClients) {
    var timeUntil = dailyReset.getTimeUntilNextReset();
    var nextReset = new Date(Date.now() + timeUntil);

    console.log('[Scheduler] Next daily reset at: ' + nextReset.toLocaleString() +
        ' (in ' + Math.round(timeUntil / 60000) + ' minutes)');

    setTimeout(function () {
        dailyReset.performDailyReset().then(function (result) {
            console.log('[Scheduler] Daily reset completed: ' +
                result.processed + ' processed, ' + result.failed + ' failed');

            // Notify all connected users about the reset
            if (connectedClients && result.processed > 0) {
                var Notifications = require('../notifications');
                Notifications.broadcastNotify(connectedClients, 'signInRefresh', {
                    message: 'Daily reset complete'
                });
            }

            // Schedule next reset (24 hours later)
            _scheduleNextDailyReset(connectedClients);
        }).catch(function (err) {
            console.error('[Scheduler] Daily reset failed: ' + err.message);
            // Retry in 1 minute on failure
            setTimeout(function () {
                _scheduleNextDailyReset(connectedClients);
            }, 60000);
        });
    }, timeUntil);
}

/**
 * Schedule periodic battle cleanup.
 * Cleans up expired battles every 5 minutes to prevent memory leaks.
 * @private
 */
function _scheduleBattleCleanup() {
    setInterval(function () {
        try {
            var BattleService = require('../services/battleService');
            var stats = BattleService.cleanupExpiredBattles();
            if (stats.removed > 0) {
                console.log('[Scheduler] Battle cleanup: removed ' + stats.removed + ' expired');
            }
        } catch (err) {
            // BattleService may not be fully loaded yet, ignore
        }
    }, 5 * 60 * 1000); // Every 5 minutes
}

/**
 * Gracefully shut down all scheduler systems.
 * Clears all timers and intervals.
 */
function shutdown() {
    console.log('[Scheduler] Shutting down all scheduler systems...');
    activityScheduler.shutdown();
    console.log('[Scheduler] All scheduler systems shut down');
}

module.exports = {
    dailyReset: dailyReset,
    recovery: recovery,
    activityScheduler: activityScheduler,
    initAll: initAll,
    shutdown: shutdown
};
