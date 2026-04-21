/**
 * ============================================================================
 *  SDK Server v3 — Analytics Service
 *  ============================================================================
 *
 *  Event logging & aggregation in data/analytics.json.
 *  Accepts events from both /api/report/* and /api/analytics/* endpoints.
 *  Normalizes different input formats into one standard format.
 *
 *  Fire-and-forget: endpoints ALWAYS return success to client.
 *  Analytics failure should never block gameplay.
 *
 * ============================================================================
 */

var fs = require('fs');
var path = require('path');
var store = require('../storage/jsonStore');
var CONSTANTS = require('../config/constants');
var logger = require('../utils/logger');

var ANALYTICS_FILE = store.buildPath('analytics.json');
var ARCHIVE_DIR = path.join(CONSTANTS.DATA_DIR, CONSTANTS.ANALYTICS_ARCHIVE_DIR);

// =============================================
// DATA ACCESS
// =============================================

function loadAnalytics() {
    var data = store.load(ANALYTICS_FILE, {
        events: [],
        meta: { totalEvents: 0, lastFlush: '' }
    });
    if (!data.events) data.events = [];
    if (!data.meta) data.meta = { totalEvents: 0, lastFlush: '' };
    return data;
}

function saveAnalytics(data) {
    return store.save(ANALYTICS_FILE, data);
}

// =============================================
// NORMALIZE & APPEND
// =============================================

/**
 * Normalize raw event to standard format.
 * Handles 2 input formats:
 *   1. Analytics: { category, action, data, userId, ... }
 *   2. Report:    { category, eventType, eventData, userId, sessionId, ... }
 */
function normalizeEvent(event) {
    return {
        id: event.id || null,
        category: event.category || 'unknown',
        action: event.action || event.eventType || 'unknown',
        data: event.data || event.eventData || {},
        userId: event.userId || null,
        sessionId: event.sessionId || null,
        serverId: event.serverId || null,
        serverName: event.serverName || null,
        characterId: event.characterId || null,
        characterName: event.characterName || null,
        characterLevel: event.characterLevel || null,
        sdk: event.sdk || event.sdkChannel || 'unknown',
        appId: event.appId || null,
        pageUrl: event.pageUrl || null,
        timestamp: event.timestamp || new Date().toISOString(),
        receivedAt: new Date().toISOString()
    };
}

/**
 * Append single event.
 */
function appendEvent(event) {
    try {
        var data = loadAnalytics();
        data.events.push(normalizeEvent(event));
        data.meta.totalEvents = (data.meta.totalEvents || 0) + 1;
        data.meta.lastFlush = new Date().toISOString();
        saveAnalytics(data);
    } catch (e) {
        logger.error('Analytics', 'appendEvent failed: ' + e.message);
    }
}

/**
 * Append multiple events (batch).
 * @returns {number} Count appended
 */
function appendEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return 0;

    try {
        var data = loadAnalytics();
        for (var i = 0; i < events.length; i++) {
            data.events.push(normalizeEvent(events[i]));
        }
        data.meta.totalEvents = (data.meta.totalEvents || 0) + events.length;
        data.meta.lastFlush = new Date().toISOString();

        if (saveAnalytics(data)) {
            return events.length;
        }
        return 0;
    } catch (e) {
        logger.error('Analytics', 'appendEvents failed: ' + e.message);
        return 0;
    }
}

// =============================================
// DASHBOARD
// =============================================

/**
 * Get analytics dashboard summary.
 * @param {string} [category] - Optional filter
 * @param {number} [limit] - Max recent events (default 50)
 */
function getDashboard(category, limit) {
    var data = loadAnalytics();
    var events = data.events || [];

    if (category) {
        events = events.filter(function (e) { return e.category === category; });
    }

    var categoryStats = {};
    for (var i = 0; i < events.length; i++) {
        var cat = events[i].category;
        if (!categoryStats[cat]) categoryStats[cat] = { count: 0, actions: {} };
        categoryStats[cat].count++;
        var action = events[i].action;
        if (!categoryStats[cat].actions[action]) categoryStats[cat].actions[action] = 0;
        categoryStats[cat].actions[action]++;
    }

    return {
        meta: data.meta,
        totalEvents: events.length,
        categoryStats: categoryStats,
        recentEvents: events.slice(-(limit || 50))
    };
}

// =============================================
// ROTATION
// =============================================

/**
 * Archive 80% oldest events when > MAX_ANALYTICS_EVENTS.
 */
function rotateIfNeeded() {
    try {
        var data = loadAnalytics();
        var events = data.events || [];

        if (events.length <= CONSTANTS.MAX_ANALYTICS_EVENTS) return;

        if (!fs.existsSync(ARCHIVE_DIR)) {
            fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
        }

        var archiveCount = Math.floor(events.length * CONSTANTS.ANALYTICS_ARCHIVE_PERCENT);
        var archived = events.splice(0, archiveCount);

        var archiveFile = path.join(
            ARCHIVE_DIR,
            'analytics_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'
        );

        store.save(archiveFile, {
            archivedAt: new Date().toISOString(),
            eventCount: archived.length,
            events: archived
        });

        data.events = events;
        saveAnalytics(data);

        logger.info('Analytics', 'Rotated ' + archiveCount + ' events (remaining: ' + events.length + ')');
    } catch (e) {
        logger.error('Analytics', 'Rotation error: ' + e.message);
    }
}

function startRotationInterval() {
    return setInterval(rotateIfNeeded, CONSTANTS.ANALYTICS_ROTATION_INTERVAL_MS);
}

function getTotalEventCount() {
    var data = loadAnalytics();
    return data.meta ? data.meta.totalEvents || 0 : 0;
}

module.exports = {
    appendEvent: appendEvent,
    appendEvents: appendEvents,
    getDashboard: getDashboard,
    rotateIfNeeded: rotateIfNeeded,
    startRotationInterval: startRotationInterval,
    getTotalEventCount: getTotalEventCount
};
