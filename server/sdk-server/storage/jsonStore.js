/**
 * ============================================================================
 * SDK Server — JSON File Storage (Natural Implementation)
 * ============================================================================
 *
 * File-based persistence with atomic writes and in-memory cache.
 * 
 * Natural approach:
 * - No database dependency
 * - Atomic file operations (write .tmp → rename)
 * - mtime-based cache invalidation
 * - Safe for single-instance Node.js
 *
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// =============================================
// CACHE
// =============================================

/** In-memory cache: { absolutePath: { data, mtime } } */
const _cache = {};

/**
 * Get cached data if still valid (mtime match)
 * @param {string} filepath - Absolute path
 * @returns {Object|null} Cached data or null if stale
 */
function _getCache(filepath) {
    const entry = _cache[filepath];
    if (!entry) return null;

    try {
        const stat = fs.statSync(filepath);
        if (stat.mtimeMs !== entry.mtime) {
            delete _cache[filepath];
            return null;
        }
        return entry.data;
    } catch (error) {
        delete _cache[filepath];
        return null;
    }
}

/**
 * Set cache with mtime
 * @param {string} filepath - Absolute path
 * @param {Object} data - Data to cache
 * @param {number} mtime - File mtime
 */
function _setCache(filepath, data, mtime) {
    _cache[filepath] = { data, mtime };
}

// =============================================
// DATA DIRECTORY
// =============================================

/**
 * Get data directory path
 * @returns {string} Data directory absolute path
 */
function getDataDir() {
    return path.join(__dirname, '..', 'data');
}

/**
 * Ensure data directory exists
 * Safe to call multiple times
 */
function ensureDataDir() {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info('Storage', `Created data directory: ${dataDir}`);
    }
}

// =============================================
// LOAD
// =============================================

/**
 * Load JSON file with cache support
 * 
 * @param {string} filepath - Full path (absolute)
 * @param {*} defaultValue - Fallback if file missing
 * @returns {*} Parsed JSON or defaultValue
 */
function load(filepath, defaultValue = null) {
    // Check cache first
    const cached = _getCache(filepath);
    if (cached !== null) {
        return cached;
    }

    try {
        // Check if file exists
        if (fs.existsSync(filepath)) {
            const stat = fs.statSync(filepath);
            const raw = fs.readFileSync(filepath, 'utf8');
            const data = JSON.parse(raw);
            
            // Update cache
            _setCache(filepath, data, stat.mtimeMs);
            
            return data;
        }
    } catch (error) {
        logger.error('Storage', `Load error ${filepath}: ${error.message}`);
        delete _cache[filepath];
    }

    // Return default if file missing or error
    return defaultValue !== undefined ? defaultValue : null;
}

/**
 * Load file, creating with default if missing
 * 
 * @param {string} filename - Filename (not full path)
 * @param {Object} defaultValue - Default content if file missing
 * @returns {Object} Loaded or created data
 */
function loadOrCreate(filename, defaultValue) {
    const filepath = path.join(getDataDir(), filename);
    const data = load(filepath, null);
    
    if (data === null) {
        // File doesn't exist, create it
        ensureDataDir();
        save(filepath, defaultValue);
        return defaultValue;
    }
    
    return data;
}

// =============================================
// SAVE
// =============================================

/**
 * Save JSON file with atomic write
 * 
 * Algorithm:
 * 1. Ensure directory exists
 * 2. Write to .tmp file
 * 3. Rename to target (POSIX atomic)
 * 4. Update cache
 * 
 * @param {string} filepath - Full path (absolute)
 * @param {Object} data - Data to save
 * @returns {boolean} Success
 */
function save(filepath, data) {
    try {
        // Ensure directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write to temp file
        const tmpPath = filepath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');

        // Atomic rename
        fs.renameSync(tmpPath, filepath);

        // Update cache (use current mtime)
        try {
            const stat = fs.statSync(filepath);
            _setCache(filepath, data, stat.mtimeMs);
        } catch (e) {
            // Cache update not critical
        }

        return true;
    } catch (error) {
        logger.error('Storage', `Save error ${filepath}: ${error.message}`);
        
        // Clean up temp file if exists
        try {
            const tmpPath = filepath + '.tmp';
            if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
        
        return false;
    }
}

/**
 * Save file by filename (in data directory)
 * 
 * @param {string} filename - Filename only
 * @param {Object} data - Data to save
 * @returns {boolean} Success
 */
function saveByName(filename, data) {
    const filepath = path.join(getDataDir(), filename);
    return save(filepath, data);
}

// =============================================
// CACHE MANAGEMENT
// =============================================

/**
 * Invalidate cache for specific file
 * 
 * @param {string} filepath - Full path
 */
function invalidate(filepath) {
    delete _cache[filepath];
}

/**
 * Invalidate cache by filename
 * 
 * @param {string} filename - Filename only
 */
function invalidateByName(filename) {
    const filepath = path.join(getDataDir(), filename);
    delete _cache[filepath];
}

/**
 * Clear all cache
 * Useful for testing or memory management
 */
function clearAllCache() {
    _cache = {};
    logger.info('Storage', 'All cache cleared');
}

// =============================================
// UTILITY
// =============================================

/**
 * Build full path for data filename
 * 
 * @param {string} filename - e.g. 'users.json'
 * @returns {string} Full absolute path
 */
function buildPath(filename) {
    return path.join(getDataDir(), filename);
}

/**
 * Check if file exists
 * 
 * @param {string} filepath - Full path
 * @returns {boolean}
 */
function exists(filepath) {
    return fs.existsSync(filepath);
}

/**
 * Delete file
 * 
 * @param {string} filepath - Full path
 * @returns {boolean} Success
 */
function deleteFile(filepath) {
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            invalidate(filepath);
            return true;
        }
        return true; // File didn't exist (idempotent)
    } catch (error) {
        logger.error('Storage', `Delete error ${filepath}: ${error.message}`);
        return false;
    }
}

// =============================================
// STATS
// =============================================

/**
 * Get cache statistics
 * 
 * @returns {Object} Cache stats
 */
function getCacheStats() {
    const files = Object.keys(_cache);
    return {
        entries: files.length,
        files: files.map(f => ({
            path: f,
            mtime: _cache[f].mtime
        }))
    };
}

/**
 * Get storage statistics
 * 
 * @returns {Object} Storage stats including cache
 */
function getStats() {
    ensureDataDir();
    
    const files = fs.readdirSync(getDataDir());
    const fileStats = [];
    
    for (const file of files) {
        if (file.endsWith('.json')) {
            const filepath = path.join(getDataDir(), file);
            try {
                const stat = fs.statSync(filepath);
                fileStats.push({
                    name: file,
                    size: stat.size,
                    mtime: stat.mtime
                });
            } catch (e) {
                // Ignore
            }
        }
    }
    
    return {
        cache: getCacheStats(),
        files: fileStats,
        dataDir: getDataDir()
    };
}

// =============================================
// EXPORT
// =============================================

module.exports = {
    // Directory
    getDataDir,
    ensureDataDir,
    
    // Load/Save
    load,
    loadOrCreate,
    save,
    saveByName,
    
    // Cache
    invalidate,
    invalidateByName,
    clearAllCache,
    
    // Utility
    buildPath,
    exists,
    deleteFile,
    
    // Stats
    getCacheStats,
    getStats
};