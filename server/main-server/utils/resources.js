/**
 * utils/resources.js — Game Resource Loader
 *
 * Loads JSON resource files from /resource/json/ at server startup.
 * All values are cached in memory for fast access by handlers.
 *
 * Resource files loaded:
 *   - constant.json      → Game constants (startHero, startHeroLevel, etc.)
 *   - hero.json           → Hero definitions (speed, energyMax, talent, quality, etc.)
 *   - heroLevelAttr.json  → Hero base stats per level (_hp, _attack, _armor)
 *   - bagPlus.json        → Backpack expansion levels (max capacity, diamond cost)
 *
 * Path resolution order:
 *   1. ENV: RESOURCE_DIR (absolute or relative to main-server/)
 *   2. ../github-repo/resource/json/   (development)
 *   3. ../resource/json/               (production)
 *
 * Usage in handlers:
 *   var resources = require('../utils/resources');
 *   var constant = resources.getConstantByKey('1');
 *   var hero1205 = resources.getHero(1205);
 *   var level3attr = resources.getHeroLevelAttr(3);
 */

var fs = require('fs');
var path = require('path');

// ============================================================
// INTERNAL CACHE
// ============================================================

var _resourceDir = null;

// Loaded JSON objects (keyed by filename without extension)
var _cache = {};

// ============================================================
// PATH RESOLUTION
// ============================================================

/**
 * Find the resource/json directory.
 * Checks multiple possible locations in order of priority.
 *
 * Returns absolute path string or null if not found.
 */
function findResourceDir() {
    // 1. Environment variable override
    if (process.env.RESOURCE_DIR) {
        var envPath = path.resolve(__dirname, '..', process.env.RESOURCE_DIR);
        if (fs.existsSync(envPath)) return envPath;
        // Try as absolute path
        if (fs.existsSync(process.env.RESOURCE_DIR)) return process.env.RESOURCE_DIR;
    }

    // 2. Candidate paths (in priority order)
    var candidates = [
        // Development: github-repo sibling
        path.resolve(__dirname, '..', '..', 'github-repo', 'resource', 'json'),
        // Production: direct sibling
        path.resolve(__dirname, '..', '..', 'resource', 'json'),
        // Alternative: inside server directory
        path.resolve(__dirname, '..', '..', 'server', 'resource', 'json'),
    ];

    for (var i = 0; i < candidates.length; i++) {
        if (fs.existsSync(candidates[i])) {
            return candidates[i];
        }
    }

    return null;
}

// ============================================================
// JSON LOADING
// ============================================================

/**
 * Load and parse a single JSON file.
 * Returns parsed object or null on failure.
 *
 * @param {string} filePath - Absolute path to JSON file
 * @returns {object|null}
 */
function loadJsonFile(filePath) {
    try {
        var content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error('[Resources] Failed to load: ' + filePath + ' — ' + e.message);
        return null;
    }
}

/**
 * Load a specific resource file by name.
 * Caches the result for subsequent calls.
 *
 * @param {string} name - Filename without .json extension (e.g. 'constant')
 * @returns {object|null}
 */
function loadResource(name) {
    if (_cache[name] !== undefined) return _cache[name];

    if (!_resourceDir) {
        console.error('[Resources] Resource directory not set. Call init() first.');
        return null;
    }

    var filePath = path.join(_resourceDir, name + '.json');
    var data = loadJsonFile(filePath);

    _cache[name] = data;
    return data;
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the resource loader.
 * Finds the resource directory and preloads critical JSON files.
 * Should be called once at server startup (index.js).
 *
 * Returns true if critical files loaded successfully, false otherwise.
 */
function init() {
    _resourceDir = findResourceDir();

    if (!_resourceDir) {
        console.error('[Resources] ERROR: resource/json directory not found!');
        console.error('[Resources] Checked:');
        console.error('[Resources]   $RESOURCE_DIR env var');
        console.error('[Resources]   ../github-repo/resource/json/');
        console.error('[Resources]   ../resource/json/');
        console.error('[Resources]   ../server/resource/json/');
        return false;
    }

    console.log('[Resources] Directory: ' + _resourceDir);

    // Preload critical files needed by enterGame and other handlers
    var criticalFiles = ['constant', 'hero', 'heroLevelAttr', 'bagPlus'];
    var allLoaded = true;

    for (var i = 0; i < criticalFiles.length; i++) {
        var name = criticalFiles[i];
        var data = loadResource(name);

        if (data) {
            var count = Object.keys(data).length;
            console.log('[Resources] ' + name + '.json — OK (' + count + ' entries)');
        } else {
            console.error('[Resources] ' + name + '.json — FAILED TO LOAD');
            allLoaded = false;
        }
    }

    if (allLoaded) {
        console.log('[Resources] All critical files loaded successfully');
    } else {
        console.error('[Resources] Some critical files failed to load');
    }

    return allLoaded;
}

// ============================================================
// GETTER FUNCTIONS — constant.json
// ============================================================

/**
 * Get the entire constant.json object.
 * @returns {object|null}
 */
function getConstant() {
    return loadResource('constant');
}

/**
 * Get a specific key from constant.json.
 * constant.json is keyed by string IDs ("1", "2", etc.)
 * Key "1" contains the main server configuration.
 *
 * @param {string} key - The key to look up (e.g. '1')
 * @returns {object|null}
 */
function getConstantByKey(key) {
    var constant = loadResource('constant');
    if (!constant) return null;
    return constant[key] || null;
}

/**
 * Get a specific field from constant.json key "1".
 * Convenience function for the most common use case.
 *
 * Proven values from constant.json key "1":
 *   startHero: "1205"
 *   startHeroLevel: "3"
 *   startChapter: 801
 *   startLesson: 10101
 *   playerIcon: "hero_icon_1205"
 *   startUserLevel: 1
 *   startUserExp: 0
 *   startDiamond: 0
 *   startGold: 0
 *   maxUserLevel: 300
 *   maxMana: 100
 *   startMana: 50
 *   superMaxMana: 100
 *   superStartMana: 0
 *
 * @param {string} field - Field name (e.g. 'startHero')
 * @returns {*} Value or undefined if not found
 */
function getConstantField(field) {
    var key1 = getConstantByKey('1');
    if (!key1) return undefined;
    return key1[field];
}

// ============================================================
// GETTER FUNCTIONS — hero.json
// ============================================================

/**
 * Get the entire hero.json object.
 * @returns {object|null}
 */
function getAllHeroes() {
    return loadResource('hero');
}

/**
 * Get a specific hero's configuration by displayId.
 *
 * Example — Hero 1205 (Kid Goku):
 *   id: 1205
 *   quality: "purple"
 *   type: "strength"
 *   heroType: "critical"
 *   talent: 0.4        → Server stores as _talent = talent * 100 = 40
 *   energyMax: 100     → Server stores as _energy = 100
 *   speed: 376         → Server stores as _speed = 376
 *   tag: "tortoise,saiyan,child"
 *   potential1: 120541
 *   potential2: 120542
 *   super: 120561
 *   defaultSkin: 1205000
 *
 * @param {number} heroDisplayId - Hero template ID (e.g. 1205)
 * @returns {object|null}
 */
function getHero(heroDisplayId) {
    var heroes = loadResource('hero');
    if (!heroes) return null;
    return heroes[String(heroDisplayId)] || null;
}

// ============================================================
// GETTER FUNCTIONS — heroLevelAttr.json
// ============================================================

/**
 * Get the entire heroLevelAttr.json object.
 * @returns {object|null}
 */
function getAllHeroLevelAttrs() {
    return loadResource('heroLevelAttr');
}

/**
 * Get hero base stats for a specific level.
 *
 * Example — Level 3:
 *   level: 3
 *   hp: 1576
 *   attack: 158
 *   armor: 307
 *
 * NOTE: speed, energy, talent are NOT in this file.
 *       They come from hero.json per-hero.
 *
 * @param {number} level - Hero level (e.g. 3)
 * @returns {object|null}
 */
function getHeroLevelAttr(level) {
    var attrs = loadResource('heroLevelAttr');
    if (!attrs) return null;
    return attrs[String(level)] || null;
}

// ============================================================
// GETTER FUNCTIONS — bagPlus.json
// ============================================================

/**
 * Get the entire bagPlus.json object.
 * @returns {object|null}
 */
function getAllBagPlus() {
    return loadResource('bagPlus');
}

/**
 * Get backpack configuration for a specific level.
 *
 * Example — Level 1:
 *   id: 1
 *   max: 90
 *   diamond: 0
 *
 * @param {number} level - Backpack level (e.g. 1)
 * @returns {object|null}
 */
function getBagPlus(level) {
    var bags = loadResource('bagPlus');
    if (!bags) return null;
    return bags[String(level)] || null;
}

// ============================================================
// DYNAMIC LOADER — for future handler needs
// ============================================================

/**
 * Load any resource JSON file by name.
 * Useful for handlers that need additional resource files.
 *
 * Usage:
 *   var dungeonData = resources.load('dungeon');
 *   var shopData = resources.load('shop');
 *
 * @param {string} name - Filename without .json extension
 * @returns {object|null}
 */
function load(name) {
    return loadResource(name);
}

/**
 * Reload a specific resource file from disk.
 * Useful for hot-reloading during development.
 *
 * @param {string} name - Filename without .json extension
 * @returns {object|null} The reloaded data, or null on failure
 */
function reload(name) {
    delete _cache[name];
    return loadResource(name);
}

/**
 * Get the resource directory path.
 * @returns {string|null}
 */
function getResourceDir() {
    return _resourceDir;
}

// ============================================================
// MODULE EXPORTS
// ============================================================

module.exports = {
    // Initialization
    init: init,

    // constant.json
    getConstant: getConstant,
    getConstantByKey: getConstantByKey,
    getConstantField: getConstantField,

    // hero.json
    getAllHeroes: getAllHeroes,
    getHero: getHero,

    // heroLevelAttr.json
    getAllHeroLevelAttrs: getAllHeroLevelAttrs,
    getHeroLevelAttr: getHeroLevelAttr,

    // bagPlus.json
    getAllBagPlus: getAllBagPlus,
    getBagPlus: getBagPlus,

    // Dynamic loader
    load: load,
    reload: reload,
    getResourceDir: getResourceDir
};
