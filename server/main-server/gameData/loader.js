/**
 * ============================================================================
 *  Game Data Loader — Load JSON config files from gameData/data/
 *  These are the same JSON files the client loads via ts.readJsonFile()
 *  (e.g., hero_json, thingsID.json, lesson.json, etc.)
 * ============================================================================
 */

var fs = require('fs');
var path = require('path');
var logger = require('../utils/logger');

var _data = {};
var _loaded = false;
var _stats = { fileCount: 0, loadTimeMs: 0 };

/**
 * Load all JSON files from gameData/data/ directory
 */
async function load() {
    var startTime = Date.now();
    var dataDir = path.join(__dirname, 'data');

    if (!fs.existsSync(dataDir)) {
        logger.warn('GameData', 'Data directory not found: ' + dataDir);
        logger.warn('GameData', 'Server will start but game data will not be available.');
        logger.warn('GameData', 'Copy JSON files from client resource/properties/ to gameData/data/');
        _loaded = false;
        return;
    }

    try {
        var files = fs.readdirSync(dataDir);
        var jsonCount = 0;

        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var ext = path.extname(file);
            if (ext !== '.json') continue;

            var fullPath = path.join(dataDir, file);
            var key = file.replace(ext, '');

            try {
                var content = fs.readFileSync(fullPath, 'utf-8');
                _data[key] = JSON.parse(content);
                jsonCount++;
            } catch (err) {
                logger.error('GameData', 'Failed to load ' + file + ': ' + err.message);
            }
        }

        _stats.fileCount = jsonCount;
        _stats.loadTimeMs = Date.now() - startTime;
        _loaded = true;

        logger.info('GameData', 'Loaded ' + jsonCount + ' files in ' + _stats.loadTimeMs + 'ms');
    } catch (err) {
        logger.error('GameData', 'Load failed: ' + err.message);
        _loaded = false;
    }
}

/**
 * Get a game data JSON by key (without .json extension)
 * @param {string} key - e.g. 'thingsID', 'hero', 'lesson'
 * @returns {object|null}
 */
function get(key) {
    return _data[key] || null;
}

/**
 * Check if game data is loaded
 * @returns {boolean}
 */
function isLoaded() {
    return _loaded;
}

/**
 * Get load statistics
 * @returns {{fileCount: number, loadTimeMs: number}}
 */
function getStats() {
    return _stats;
}

module.exports = {
    load: load,
    get: get,
    isLoaded: isLoaded,
    getStats: getStats,
};
