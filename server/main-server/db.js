/**
 * db.js — Main Server Database
 *
 * 2 SQLite connections:
 *   1. dbMain  — Main server own data (heroes, items, schedule, etc.)
 *   2. dbLogin — Login server DB (READ-ONLY, hanya untuk loginToken validation)
 *
 * Semua kolom camelCase (matching client field names exactly)
 */

var Database = require('better-sqlite3');
var path = require('path');
var fs = require('fs');
var config = require('./config');

var dbMain = null;
var dbLogin = null;

// ============================================================
// INIT: Main Server DB
// ============================================================

function initMainDb() {
    var dbPath = path.resolve(config.dbFile);
    var dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    dbMain = new Database(dbPath);
    dbMain.pragma('journal_mode = WAL');
    dbMain.pragma('foreign_keys = ON');

    // ============================================================
    // SCHEMA: users — user profile
    // ============================================================
    dbMain.exec(`
        CREATE TABLE IF NOT EXISTS users (
            userId       TEXT PRIMARY KEY,
            pwd          TEXT NOT NULL DEFAULT 'game_origin',
            nickName     TEXT NOT NULL,
            headImage    TEXT NOT NULL DEFAULT 'hero_icon_1205',
            lastLoginTime INTEGER NOT NULL,
            createTime   INTEGER NOT NULL,
            oriServerId  INTEGER NOT NULL DEFAULT 1,
            level        INTEGER NOT NULL DEFAULT 1,
            exp          INTEGER NOT NULL DEFAULT 0,
            vipLevel     INTEGER NOT NULL DEFAULT 0,
            vipExp       INTEGER NOT NULL DEFAULT 0,
            currency     TEXT NOT NULL DEFAULT 'USD',
            bulletinVersions TEXT NOT NULL DEFAULT '',
            nickChangeTimes INTEGER DEFAULT 0
        )
    `);

    // ============================================================
    // SCHEMA: heroes — hero instances (keyed by UUID)
    // ============================================================
    dbMain.exec(`
        CREATE TABLE IF NOT EXISTS heroes (
            heroId              TEXT PRIMARY KEY,
            userId              TEXT NOT NULL,
            heroDisplayId       INTEGER NOT NULL,
            heroStar            INTEGER NOT NULL DEFAULT 0,
            fragment            INTEGER NOT NULL DEFAULT 0,
            superSkillResetCount INTEGER NOT NULL DEFAULT 0,
            potentialResetCount  INTEGER NOT NULL DEFAULT 0,
            qigongStage         INTEGER NOT NULL DEFAULT 1,
            qigongTmpPower      INTEGER NOT NULL DEFAULT 0,
            gemstoneSuitId      INTEGER NOT NULL DEFAULT 0,
            expeditionMaxLevel  INTEGER NOT NULL DEFAULT 0,
            heroBaseAttr        TEXT NOT NULL DEFAULT '{}',
            superSkillLevel     TEXT NOT NULL DEFAULT '{}',
            potentialLevel      TEXT NOT NULL DEFAULT '[]',
            qigong              TEXT NOT NULL DEFAULT '{"_items":[]}',
            qigongTmp           TEXT NOT NULL DEFAULT '{"_items":[]}',
            totalCost           TEXT NOT NULL DEFAULT '{}',
            breakInfo           TEXT NOT NULL DEFAULT '{}',
            linkTo              TEXT NOT NULL DEFAULT '[]',
            linkFrom            TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
        )
    `);

    // ============================================================
    // SCHEMA: items — backpack / resources (currency, materials, etc.)
    // ============================================================
    dbMain.exec(`
        CREATE TABLE IF NOT EXISTS items (
            itemId   TEXT NOT NULL,
            userId   TEXT NOT NULL,
            num      INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (itemId, userId),
            FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
        )
    `);

    // ============================================================
    // SCHEMA: teams — team formations (lastTeam, arena, etc.)
    // ============================================================
    dbMain.exec(`
        CREATE TABLE IF NOT EXISTS teams (
            userId    TEXT NOT NULL,
            teamType  INTEGER NOT NULL,
            teamData  TEXT NOT NULL DEFAULT '[]',
            superSkill TEXT NOT NULL DEFAULT '[]',
            PRIMARY KEY (userId, teamType),
            FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
        )
    `);

    // ============================================================
    // SCHEMA: userJson — JSON blob storage per module
    // Untuk data kompleks yang tidak perlu query individual
    // ============================================================
    dbMain.exec(`
        CREATE TABLE IF NOT EXISTS userJson (
            userId   TEXT NOT NULL,
            module   TEXT NOT NULL,
            data     TEXT NOT NULL DEFAULT '{}',
            PRIMARY KEY (userId, module),
            FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
        )
    `);

    console.log('[DB] Main DB ready — ' + dbPath);
    return dbMain;
}

// ============================================================
// INIT: Login Server DB (READ-ONLY)
// ============================================================

function initLoginDb() {
    var dbPath = path.resolve(config.loginDbFile);

    if (!fs.existsSync(dbPath)) {
        console.error('[DB] Login DB not found: ' + dbPath);
        console.error('[DB] Main-server CANNOT run without login DB for token validation');
        console.error('[DB] Ensure login-server is running and has created: ' + dbPath);
        process.exit(1);
    }

    try {
        dbLogin = new Database(dbPath, { readonly: true, fileMustExist: true });
        dbLogin.pragma('journal_mode = WAL');
        console.log('[DB] Login DB connected (READ-ONLY) — ' + dbPath);
        return dbLogin;
    } catch (err) {
        console.error('[DB] Cannot open login DB: ' + err.message);
        console.error('[DB] Main-server CANNOT run without login DB');
        process.exit(1);
    }
}

// ============================================================
// INIT ALL
// ============================================================

function init() {
    initMainDb();
    initLoginDb();
}

// ============================================================
// QUERY HELPERS: Main DB (sync — better-sqlite3)
// ============================================================

function dbQuery(sql, params) {
    return dbMain.prepare(sql).all(params || []);
}

function dbQueryOne(sql, params) {
    return dbMain.prepare(sql).get(params || []) || null;
}

function dbRun(sql, params) {
    return dbMain.prepare(sql).run(params || []);
}

function dbTransaction(fn) {
    return dbMain.transaction(fn)();
}

// ============================================================
// LOGIN TOKEN VALIDATION
// ============================================================

/**
 * Validate loginToken dari login-server DB (READ-ONLY).
 * Returns { userId, password, nickName, channelCode, createTime } atau null.
 *
 * Login-server uses camelCase columns — direct query, no fallback.
 */
function validateLoginToken(loginToken) {
    if (!loginToken) return null;

    var user = dbLogin.prepare(
        'SELECT userId, password, nickName, channelCode, createTime FROM users WHERE loginToken = ?'
    ).get([loginToken]);

    return user || null;
}

/**
 * Get user password dari login DB (untuk _pwd di enterGame response)
 */
function getLoginUserPassword(userId) {
    var user = dbLogin.prepare(
        'SELECT password FROM users WHERE userId = ?'
    ).get([userId]);

    return user ? user.password : 'game_origin';
}

// ============================================================
// USER CRUD: Main DB
// ============================================================

function getUser(userId) {
    return dbQueryOne('SELECT * FROM users WHERE userId = ?', [userId]);
}

function createUser(userId, nickName) {
    var now = Date.now();
    dbRun(
        'INSERT OR IGNORE INTO users (userId, pwd, nickName, headImage, lastLoginTime, createTime, oriServerId, level, exp, vipLevel, vipExp, currency) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, 'game_origin', nickName, 'hero_icon_1205', now, now, config.serverId, 1, 0, 0, 0, config.currency]
    );
    return getUser(userId);
}

function updateUserLastLogin(userId) {
    var now = Date.now();
    dbRun('UPDATE users SET lastLoginTime = ? WHERE userId = ?', [now, userId]);
}

// ============================================================
// HERO CRUD: Main DB
// ============================================================

function getHeroes(userId) {
    return dbQuery('SELECT * FROM heroes WHERE userId = ?', [userId]);
}

function createHero(heroId, userId, heroDisplayId, level) {
    dbRun(
        'INSERT INTO heroes (heroId, userId, heroDisplayId, heroStar, fragment, qigongStage, heroBaseAttr, breakInfo) ' +
        'VALUES (?, ?, ?, 0, 0, 1, ?, ?)',
        [heroId, userId, heroDisplayId, JSON.stringify({ _level: level, _evolveLevel: 0 }),
         JSON.stringify({ _breakLevel: 1, _level: 0, _attr: { _items: [] } })]
    );
}

// ============================================================
// ITEMS CRUD: Main DB
// ============================================================

function getItems(userId) {
    return dbQuery('SELECT * FROM items WHERE userId = ?', [userId]);
}

function setItem(userId, itemId, num) {
    dbRun(
        'INSERT INTO items (itemId, userId, num) VALUES (?, ?, ?) ' +
        'ON CONFLICT(itemId, userId) DO UPDATE SET num = ?',
        [itemId, userId, num, num]
    );
}

// ============================================================
// TEAMS CRUD: Main DB
// ============================================================

function getTeams(userId) {
    return dbQuery('SELECT * FROM teams WHERE userId = ?', [userId]);
}

function setTeam(userId, teamType, teamData, superSkill) {
    dbRun(
        'INSERT INTO teams (userId, teamType, teamData, superSkill) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(userId, teamType) DO UPDATE SET teamData = ?, superSkill = ?',
        [userId, teamType, teamData, superSkill, teamData, superSkill]
    );
}

// ============================================================
// JSON BLOB CRUD: Main DB
// ============================================================

function getJsonModule(userId, module) {
    var row = dbQueryOne('SELECT data FROM userJson WHERE userId = ? AND module = ?', [userId, module]);
    if (row) {
        try { return JSON.parse(row.data); }
        catch (e) { return {}; }
    }
    return null;
}

function setJsonModule(userId, module, data) {
    var json = JSON.stringify(data);
    dbRun(
        'INSERT INTO userJson (userId, module, data) VALUES (?, ?, ?) ' +
        'ON CONFLICT(userId, module) DO UPDATE SET data = ?',
        [userId, module, json, json]
    );
}

// ============================================================
// CLOSE
// ============================================================

function close() {
    if (dbMain) { dbMain.close(); dbMain = null; }
    if (dbLogin) { dbLogin.close(); dbLogin = null; }
}

module.exports = {
    init: init,
    // Query helpers
    dbQuery: dbQuery,
    dbQueryOne: dbQueryOne,
    dbRun: dbRun,
    dbTransaction: dbTransaction,
    // Login token
    validateLoginToken: validateLoginToken,
    getLoginUserPassword: getLoginUserPassword,
    // User
    getUser: getUser,
    createUser: createUser,
    updateUserLastLogin: updateUserLastLogin,
    // Heroes
    getHeroes: getHeroes,
    createHero: createHero,
    // Items
    getItems: getItems,
    setItem: setItem,
    // Teams
    getTeams: getTeams,
    setTeam: setTeam,
    // JSON modules
    getJsonModule: getJsonModule,
    setJsonModule: setJsonModule,
    // Close
    close: close
};
