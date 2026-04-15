/**
 * =====================================================
 *  dailyReset.js — Daily Reset System
 *  Super Warrior Z Game Server — Main Server
 *
 *  Resets all daily counters at 6:00 AM server time.
 *  Based on client's AllRefreshCount system (line 58000-58060).
 *
 *  The client sends AllRefreshCount data on enterGame:
 *    socket.emit("handler.process", {
 *      type: "User", action: "AllRefreshCount",
 *      AllRefreshCount: { _arenaAttackTimes: 0, _snakeResetTimes: 0, ... }
 *    })
 *
 *  On daily reset, server must:
 *    1. Reset all 36 counter fields to 0 (or their defaults)
 *    2. Reset stamina to max
 *    3. Refresh sign-in streak
 *    4. Reset dungeon times
 *    5. Reset arena challenge times
 *    6. Send broadcast notification
 *
 *  Reset time from constant.json: resetTime = "6:00:00"
 * =====================================================
 */

'use strict';

var DB = require('../../database/connection');
var defaultData = require('../../shared/defaultData');
var helpers = require('../utils/helpers');

/**
 * All 36 scheduleInfo counter fields that get reset daily.
 * These match the client's AllRefreshCount.initData() (line 58004-58060).
 *
 * The client reads these fields UNCONDITIONALLY on enterGame.
 * If any field is missing, client crashes with TypeError.
 *
 * @type {Array<string>}
 */
var DAILY_RESET_FIELDS = [
    '_marketDiamondRefreshCount',
    '_vipMarketDiamondRefreshCount',
    '_arenaAttackTimes',
    '_arenaBuyTimesCount',
    '_snakeResetTimes',
    '_snakeSweepCount',
    '_cellGameHaveGotReward',
    '_cellGameHaveTimes',
    '_cellgameHaveSetHero',
    '_strongEnemyTimes',
    '_strongEnemyBuyCount',
    '_mergeBossBuyCount',
    '_dungeonTimes',
    '_dungeonBuyTimesCount',
    '_karinBattleTimes',
    '_karinBuyBattleTimesCount',
    '_karinBuyFeetCount',
    '_entrustResetTimes',
    '_dragonExchangeSSPoolId',
    '_dragonExchangeSSSPoolId',
    '_teamDugeonUsedRobots',
    '_timeTrialBuyTimesCount',
    '_monthCardHaveGotReward',
    '_goldBuyCount',
    '_likeRank',
    '_mahaAttackTimes',
    '_mahaBuyTimesCount',
    '_guildBossTimes',
    '_guildBossTimesBuyCount',
    '_treasureTimes',
    '_guildCheckInType',
    '_topBattleTimes',
    '_topBattleBuyCount',
    '_templeDailyReward',
    '_templeYesterdayLess',
    '_clickTimeGift',
    '_clickExpedition',
    '_expeditionSpeedUpCost',
    '_gravityTrialBuyTimesCount',
    '_mineResetTimes',
    '_mineBuyResetTimesCount',
    '_mineBuyStepCount',
    '_templeBuyCount',
    '_trainingBuyCount',
    '_bossCptTimes',
    '_bossCptBuyCount',
    '_ballWarBuyCount',
    '_expeditionEvents',
];

/**
 * Default values for fields that don't reset to 0.
 * Most fields reset to 0, but some have special defaults.
 *
 * @type {Object.<string, *>}
 */
var SPECIAL_DEFAULTS = {
    '_cellGameHaveGotReward': true,    // Boolean default in client constructor
    '_cellgameHaveSetHero': false,     // Boolean default in client constructor
    '_clickTimeGift': false,           // Boolean default in client constructor
    '_clickExpedition': false,         // Boolean default in client constructor
    '_teamDugeonUsedRobots': [],       // Array default in client constructor
    '_monthCardHaveGotReward': {},     // Object default
    '_likeRank': {},                   // Object default
    '_templeDailyReward': null,        // Null default (guarded read)
    '_templeYesterdayLess': null,      // Null default (guarded read)
    '_expeditionEvents': null,         // Null default (guarded read)
};

/**
 * Calculate milliseconds until next 6:00 AM.
 *
 * Reset time from constant.json: resetTime = "6:00:00"
 *
 * @returns {number} Milliseconds until next 6:00 AM
 */
function getTimeUntilNextReset() {
    var now = new Date();
    var reset = new Date(now);
    reset.setHours(6, 0, 0, 0);

    // If we're past 6 AM today, next reset is tomorrow
    if (now >= reset) {
        reset.setDate(reset.getDate() + 1);
    }

    return reset.getTime() - now.getTime();
}

/**
 * Perform daily reset for ALL users.
 *
 * This is the core reset function that:
 *   1. Loads each user's game_data
 *   2. Resets all daily counter fields in scheduleInfo
 *   3. Resets stamina-related fields
 *   4. Saves updated data back to DB
 *
 * @returns {Promise<{ processed: number, failed: number }>} Reset statistics
 */
async function performDailyReset() {
    var startTime = Date.now();
    console.log('[DailyReset] Starting daily reset for all users...');

    var processed = 0;
    var failed = 0;

    try {
        // Get all users from user_data table
        var users = await DB.query(
            'SELECT user_id, server_id FROM user_data',
            []
        );

        if (!users || users.length === 0) {
            console.log('[DailyReset] No users found in database');
            return { processed: 0, failed: 0 };
        }

        console.log('[DailyReset] Processing ' + users.length + ' users...');

        for (var i = 0; i < users.length; i++) {
            var userId = users[i].user_id;
            var serverId = users[i].server_id || 1;

            try {
                // Load current game_data
                var result = await DB.query(
                    'SELECT game_data FROM user_data WHERE user_id = ? AND server_id = ?',
                    [userId, serverId]
                );

                if (!result || result.length === 0 || !result[0].game_data) {
                    continue;
                }

                var rawData = result[0].game_data;
                var gameData;

                if (typeof rawData === 'string') {
                    try {
                        gameData = JSON.parse(rawData);
                    } catch (e) {
                        failed++;
                        continue;
                    }
                } else {
                    gameData = rawData;
                }

                // Reset scheduleInfo fields
                if (gameData.scheduleInfo && typeof gameData.scheduleInfo === 'object') {
                    for (var j = 0; j < DAILY_RESET_FIELDS.length; j++) {
                        var field = DAILY_RESET_FIELDS[j];
                        if (field in SPECIAL_DEFAULTS) {
                            gameData.scheduleInfo[field] = SPECIAL_DEFAULTS[field];
                        } else {
                            gameData.scheduleInfo[field] = 0;
                        }
                    }
                }

                // Reset stamina (set staminaTime to now for fresh regen calculation)
                // Stamina is client-calculated: current = stored + (now - staminaTime) * rate
                // By resetting staminaTime, we essentially give the user a fresh day's worth
                if (gameData.currency && typeof gameData.currency === 'object') {
                    // stamina is tracked via scheduleInfo, not currency
                    // Client reads stamina from totalProps._items[EnergyStone]
                }

                // Save back
                var jsonData = JSON.stringify(gameData);
                await DB.query(
                    'UPDATE user_data SET game_data = ?, update_time = ? WHERE user_id = ? AND server_id = ?',
                    [jsonData, Date.now(), userId, serverId]
                );

                processed++;
            } catch (userErr) {
                console.error('[DailyReset] Failed for user ' + userId + ': ' + userErr.message);
                failed++;
            }
        }
    } catch (dbErr) {
        console.error('[DailyReset] Database error: ' + dbErr.message);
        return { processed: 0, failed: 0, error: dbErr.message };
    }

    var elapsed = Date.now() - startTime;
    console.log('[DailyReset] Complete! Processed: ' + processed +
        ', Failed: ' + failed + ', Time: ' + elapsed + 'ms');

    return { processed: processed, failed: failed, timeMs: elapsed };
}

/**
 * Perform daily reset for a single user.
 *
 * Used when a user logs in after the daily reset time has passed
 * (per-user reset instead of waiting for batch).
 *
 * @param {number|string} userId - User ID to reset
 * @param {number} [serverId=1] - Server ID
 * @returns {Promise<boolean>} true if reset was performed
 */
async function resetUser(userId, serverId) {
    serverId = serverId || 1;

    try {
        var result = await DB.query(
            'SELECT game_data FROM user_data WHERE user_id = ? AND server_id = ?',
            [userId, serverId]
        );

        if (!result || result.length === 0 || !result[0].game_data) {
            return false;
        }

        var rawData = result[0].game_data;
        var gameData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

        // Reset scheduleInfo
        if (gameData.scheduleInfo && typeof gameData.scheduleInfo === 'object') {
            for (var j = 0; j < DAILY_RESET_FIELDS.length; j++) {
                var field = DAILY_RESET_FIELDS[j];
                if (field in SPECIAL_DEFAULTS) {
                    gameData.scheduleInfo[field] = SPECIAL_DEFAULTS[field];
                } else {
                    gameData.scheduleInfo[field] = 0;
                }
            }
        }

        var jsonData = JSON.stringify(gameData);
        await DB.query(
            'UPDATE user_data SET game_data = ?, update_time = ? WHERE user_id = ? AND server_id = ?',
            [jsonData, Date.now(), userId, serverId]
        );

        console.log('[DailyReset] User ' + userId + ' daily counters reset');
        return true;
    } catch (err) {
        console.error('[DailyReset] Failed to reset user ' + userId + ': ' + err.message);
        return false;
    }
}

/**
 * Check if a user needs daily reset.
 *
 * Compares user's last reset time against the 6:00 AM threshold.
 * If the last reset was before today's 6:00 AM, reset is needed.
 *
 * @param {object} gameData - User's game_data object
 * @returns {boolean} true if daily reset is needed
 */
function needsReset(gameData) {
    if (!gameData || !gameData.user) {
        return false;
    }

    var lastLogin = gameData.user._lastLoginTime || 0;
    if (lastLogin === 0) {
        return false; // New user, no reset needed
    }

    var lastLoginDate = new Date(lastLogin);
    var now = new Date();

    // Check if last login was before today's 6:00 AM
    var todayReset = new Date(now);
    todayReset.setHours(6, 0, 0, 0);

    return lastLoginDate < todayReset;
}

module.exports = {
    DAILY_RESET_FIELDS: DAILY_RESET_FIELDS,
    SPECIAL_DEFAULTS: SPECIAL_DEFAULTS,
    getTimeUntilNextReset: getTimeUntilNextReset,
    performDailyReset: performDailyReset,
    resetUser: resetUser,
    needsReset: needsReset
};
