/**
 * =====================================================
 *  recovery.js — Resource Recovery System
 *  Super Warrior Z Game Server — Main Server
 *
 *  Handles time-based resource recovery:
 *    - Stamina regeneration (1 per X minutes)
 *    - Training completion
 *    - Hangup/AFK reward accumulation
 *    - Expedition completion
 *
 *  IMPORTANT: The CLIENT calculates most recovery locally.
 *  The server stores timestamps and validates client-submitted
 *  recovery claims. Server does NOT simulate recovery ticks.
 *
 *  Client flow:
 *    1. On login, client reads staminaTime from game_data
 *    2. Client calculates: currentStamina = stored + floor((now - staminaTime) / recoveryRate)
 *    3. Client sends recovered resources via handler.process
 *    4. Server validates timestamps are reasonable
 *
 *  Recovery rates are defined in resource/json/constant.json
 * =====================================================
 */

'use strict';

var helpers = require('../utils/helpers');

/**
 * Default recovery configuration.
 * These values should ideally come from resource/json/constant.json
 * but are hardcoded here as sensible defaults.
 *
 * @type {object}
 */
var RECOVERY_CONFIG = {
    /** Stamina recovery rate: 1 stamina per STAMINA_INTERVAL_MS milliseconds */
    STAMINA_INTERVAL_MS: 5 * 60 * 1000,  // 5 minutes per stamina point
    /** Maximum stamina a player can have */
    STAMINA_MAX: 120,
    /** Maximum hangup hours before rewards cap */
    HANGUP_MAX_HOURS: 8,
    /** Hangup max time in milliseconds */
    HANGUP_MAX_MS: 8 * 60 * 60 * 1000,  // 8 hours
    /** Training speed multiplier */
    TRAINING_SPEED_MULTIPLIER: 1
};

/**
 * Calculate recovered stamina based on time elapsed.
 *
 * Client formula (simplified):
 *   recovered = floor((currentTime - staminaTime) / STAMINA_INTERVAL_MS)
 *   currentStamina = min(storedStamina + recovered, STAMINA_MAX)
 *
 * @param {number} storedStamina - Stamina value stored in game_data
 * @param {number} staminaTime - Timestamp when stamina was last updated (ms)
 * @param {number} [currentTime] - Current timestamp (defaults to Date.now())
 * @param {object} [config] - Override recovery config
 * @returns {{ stamina: number, recovered: number, capped: boolean }}
 */
function calculateStaminaRecovery(storedStamina, staminaTime, currentTime, config) {
    config = config || RECOVERY_CONFIG;
    currentTime = currentTime || Date.now();

    var recovered = 0;
    var capped = false;

    if (staminaTime > 0 && currentTime > staminaTime) {
        var elapsed = currentTime - staminaTime;
        recovered = Math.floor(elapsed / config.STAMINA_INTERVAL_MS);

        if (recovered > 0) {
            var total = storedStamina + recovered;
            if (total >= config.STAMINA_MAX) {
                capped = true;
                total = config.STAMINA_MAX;
                // Recalculate actual recovery (don't over-recover)
                var actualRecovery = config.STAMINA_MAX - storedStamina;
                if (actualRecovery < 0) actualRecovery = 0;
                recovered = actualRecovery;
            }
            return { stamina: total, recovered: recovered, capped: capped };
        }
    }

    return { stamina: storedStamina, recovered: 0, capped: false };
}

/**
 * Calculate hangup/AFK rewards based on time elapsed.
 *
 * Client calculates hangup rewards locally based on:
 *   - hangupStartTime (when user assigned heroes)
 *   - Current time
 *   - hangupId (which stage/lesson)
 *
 * Max hangup time is 8 hours (constant.json: idle = 28800 seconds).
 *
 * @param {number} hangupStartTime - Timestamp when hangup started (ms)
 * @param {number} [currentTime] - Current timestamp (defaults to Date.now())
 * @param {object} [config] - Override recovery config
 * @returns {{ elapsed: number, elapsedSeconds: number, capped: boolean, effectiveMs: number }}
 */
function calculateHangupReward(hangupStartTime, currentTime, config) {
    config = config || RECOVERY_CONFIG;
    currentTime = currentTime || Date.now();

    if (!hangupStartTime || hangupStartTime <= 0) {
        return { elapsed: 0, elapsedSeconds: 0, capped: false, effectiveMs: 0 };
    }

    var elapsed = currentTime - hangupStartTime;
    var capped = false;

    if (elapsed >= config.HANGUP_MAX_MS) {
        elapsed = config.HANGUP_MAX_MS;
        capped = true;
    }

    return {
        elapsed: elapsed,
        elapsedSeconds: Math.floor(elapsed / 1000),
        capped: capped,
        effectiveMs: elapsed
    };
}

/**
 * Validate that a client-submitted recovery claim is reasonable.
 *
 * Server validates:
 *   1. startTime is not in the future
 *   2. elapsed time is not negative
 *   3. elapsed time doesn't exceed maximum cap
 *   4. claimed amount is within expected range (+/- 10% tolerance)
 *
 * @param {number} startTime - Recovery start timestamp
 * @param {number} claimedElapsed - Client's claimed elapsed time (ms)
 * @param {number} maxElapsed - Maximum allowed elapsed time (ms)
 * @param {number} [currentTime] - Current timestamp
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateRecoveryClaim(startTime, claimedElapsed, maxElapsed, currentTime) {
    currentTime = currentTime || Date.now();

    if (!startTime || startTime <= 0) {
        return { valid: false, reason: 'Invalid start time' };
    }

    if (startTime > currentTime) {
        return { valid: false, reason: 'Start time is in the future' };
    }

    var actualElapsed = currentTime - startTime;
    if (actualElapsed < 0) {
        return { valid: false, reason: 'Negative elapsed time' };
    }

    if (claimedElapsed > maxElapsed) {
        return { valid: false, reason: 'Claimed time exceeds maximum cap' };
    }

    // Allow 10% tolerance for client-server clock difference
    var tolerance = Math.max(actualElapsed * 0.1, 60000); // min 1 minute tolerance
    if (claimedElapsed > actualElapsed + tolerance) {
        return { valid: false, reason: 'Claimed time exceeds actual elapsed + tolerance' };
    }

    return { valid: true, reason: null };
}

module.exports = {
    RECOVERY_CONFIG: RECOVERY_CONFIG,
    calculateStaminaRecovery: calculateStaminaRecovery,
    calculateHangupReward: calculateHangupReward,
    validateRecoveryClaim: validateRecoveryClaim
};
