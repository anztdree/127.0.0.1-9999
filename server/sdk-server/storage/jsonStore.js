/**
 * ============================================================================
 *  SDK Server v3 — JSON File Storage with In-Memory Cache
 *  ============================================================================
 *
 *  File-based persistence — NO database dependency.
 *  Atomic writes (write .tmp → rename) prevent corruption.
 *  In-memory cache with mtime-based stale detection.
 *
 *  Single-threaded Node.js → no race conditions on cache.
 *
 * ============================================================================
 */

var fs = require('fs');
var path = require('path');
var CONSTANTS = require('../config/constants');
var logger = require('../utils/logger');

/** Cache store: { absolutePath: { data, mtime } } */
var _cache = {};

function _getCache(filepath) {
    var entry = _cache[filepath];
    if (!entry) return null;

    try {
        var stat = fs.statSync(filepath);
        if (stat.mtimeMs !== entry.mtime) {
            delete _cache[filepath];
            return null;
        }
    } catch (e) {
        delete _cache[filepath];
        return null;
    }
    return entry;
}

function _setCache(filepath, data, mtime) {
    _cache[filepath] = { data: data, mtime: mtime };
}

// =============================================
// PUBLIC API
// =============================================

/**
 * Ensure data directory exists. Called once at startup.
 */
function ensureDataDir() {
    if (!fs.existsSync(CONSTANTS.DATA_DIR)) {
        fs.mkdirSync(CONSTANTS.DATA_DIR, { recursive: true });
        logger.info('Storage', 'Created data directory: ' + CONSTANTS.DATA_DIR);
    }
}

/**
 * Load JSON file with cache support.
 * @param {string} filepath - Full path
 * @param {*} defaultValue - Fallback if file missing
 * @returns {*} Parsed JSON or defaultValue
 */
function load(filepath, defaultValue) {
    var cached = _getCache(filepath);
    if (cached) return cached.data;

    try {
        if (fs.existsSync(filepath)) {
            var stat = fs.statSync(filepath);
            var raw = fs.readFileSync(filepath, 'utf8');
            var data = JSON.parse(raw);
            _setCache(filepath, data, stat.mtimeMs);
            return data;
        }
    } catch (e) {
        logger.error('Storage', 'Error loading ' + filepath + ': ' + e.message);
        delete _cache[filepath];
    }
    return (defaultValue !== undefined) ? defaultValue : null;
}

/**
 * Save JSON file — atomic write.
 * Write to .tmp → rename (POSIX atomic).
 * Updates cache after successful save.
 * @param {string} filepath - Full path
 * @param {*} data - Data to save
 * @returns {boolean}
 */
function save(filepath, data) {
    try {
        ensureDataDir();
        var tmpPath = filepath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmpPath, filepath);

        try {
            var stat = fs.statSync(filepath);
            _setCache(filepath, data, stat.mtimeMs);
        } catch (e) { /* cache update not critical */ }

        return true;
    } catch (e) {
        logger.error('Storage', 'Error saving ' + filepath + ': ' + e.message);
        return false;
    }
}

/**
 * Invalidate cache for a file.
 */
function invalidate(filepath) {
    delete _cache[filepath];
}

/**
 * Build full path for a data filename.
 * @param {string} filename - e.g. 'users.json'
 * @returns {string} Full absolute path
 */
function buildPath(filename) {
    return path.join(CONSTANTS.DATA_DIR, filename);
}

/**
 * Get cache stats (debug/admin).
 */
function getCacheStats() {
    var files = Object.keys(_cache);
    return {
        entries: files.length,
        files: files.map(function (f) {
            return { path: f, mtime: _cache[f].mtime };
        })
    };
}

/**
 * Clear all cache (debug/admin).
 */
function clearAllCache() {
    _cache = {};
    logger.info('Storage', 'All cache cleared');
}

module.exports = {
    ensureDataDir: ensureDataDir,
    load: load,
    save: save,
    invalidate: invalidate,
    buildPath: buildPath,
    getCacheStats: getCacheStats,
    clearAllCache: clearAllCache
};
