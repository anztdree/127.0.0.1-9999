/**
 * ============================================================================
 *  Daily Reset — 6 AM server time
 *  Resets: dungeon counts, sign-in, tasks, arena, etc.
 * ============================================================================
 */

var logger = require('../utils/logger');

function run() {
    // TODO: implement daily reset
    logger.info('DailyReset', 'Running daily reset...');
}

function schedule(intervalMs) {
    // TODO: calculate ms until next 6AM, then setInterval
}

module.exports = { run: run, schedule: schedule };
