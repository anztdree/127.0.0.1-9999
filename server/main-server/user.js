/**
 * user.js — MAIN-SERVER In-Memory Game Data Store ("localStorage")
 *
 * Philosophy: File = Response. Apa yang ada di memory = apa yang dikirim ke client.
 * Zero transformation, zero mapping, zero schema.
 *
 * Storage:
 *   - gameData: Map<userId, gameState> — full 79-key game state per user
 *   - sessions: Map<socketId, sessionInfo> — socket → user mapping
 *   - accountIndex: Map<"account:serverId", userId> — lookup by login account
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY STORAGE
// ═══════════════════════════════════════════════════════════════

/** Full game state per user — the "localStorage" */
const gameData = new Map();

/** Socket sessions */
const sessions = new Map();

/** Account → userId index for fast lookup */
const accountIndex = new Map();

// ═══════════════════════════════════════════════════════════════
// RESOURCE JSON CACHE
// ═══════════════════════════════════════════════════════════════

const resourceCache = new Map();

/**
 * Load a resource JSON file (cached)
 * @param {string} name - File name without .json extension
 * @returns {object|null}
 */
function loadResource(name) {
    if (resourceCache.has(name)) {
        return resourceCache.get(name);
    }
    try {
        const filePath = path.join(config.resourcePath, name + '.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        resourceCache.set(name, data);
        return data;
    } catch (err) {
        logger.log('ERROR', 'RESOURCE', `Failed to load ${name}.json: ${err.message}`);
        return null;
    }
}

/**
 * Load all resource JSON files at startup
 * @returns {number} Count of loaded files
 */
function loadAllResources() {
    const dir = config.resourcePath;
    let count = 0;
    try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        files.forEach(file => {
            const name = file.replace('.json', '');
            const data = loadResource(name);
            if (data) count++;
        });
        logger.log('INFO', 'RESOURCE', `Loaded ${count}/${files.length} resource files`);
    } catch (err) {
        logger.log('ERROR', 'RESOURCE', `Failed to read resource directory: ${err.message}`);
    }
    return count;
}

// ═══════════════════════════════════════════════════════════════
// UUID GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * Generate UUID v4 (replaces the 'uuid' module)
 * @returns {string} e.g., "33cabb81-987d-4712-81c8-0d88b4c63132"
 */
function generateUUID() {
    return crypto.randomUUID();
}

// ═══════════════════════════════════════════════════════════════
// NEW USER TEMPLATE BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Build initial game state for a new user
 * Based on: constant.json values + HAR confirmed structure
 *
 * @param {object} params - { account, serverId, loginToken }
 * @returns {object} Complete game state with all 79 required top-level keys
 */
function createNewUser(params) {
    const now = Date.now();
    const userId = generateUUID();
    const heroId = generateUUID();

    // Starting hero from constant.json
    const startHero = config.startHero;        // 1205
    const startHeroLevel = config.startHeroLevel;  // 3
    const startLesson = config.startLesson;    // 10101
    const startChapter = config.startChapter;  // 801

    const shortId = userId.substring(0, 4);

    // ─── Build the full game state ───
    // Every field here is what the client (main.min.js) expects in enterGame response
    // REQUIRED fields = accessed without null check in UserDataParser.saveUserData()
    // Optional fields = checked with if/void 0!= before access

    const gameState = {
        // ═══════════════════════════════════════════════════
        // REQUIRED FIELDS (client crash if missing)
        // ═══════════════════════════════════════════════════

        currency: 'CNY',
        newUser: true,

        // ─── user: player profile ───
        user: {
            _id: userId,
            _pwd: '1111',
            _nickName: `New User${shortId}`,
            _oldName: '',
            _headImage: config.playerIcon,       // "hero_icon_1205"
            _account: params.account,            // login account (e.g., "28178141")
            _channelId: 'BSNative',
            _privilege: 0,
            _attribute: {
                _items: {
                    '101': { _id: 101, _num: 0 },    // Gold
                    '102': { _id: 102, _num: 0 },    // Hero EXP
                    '103': { _id: 103, _num: 0 },    // Player EXP
                    '104': { _id: 104, _num: 0 },    // Diamond
                    '105': { _id: 105, _num: 0 },    // VIP EXP
                    '106': { _id: 106, _num: 0 },
                    '111': { _id: 111, _num: 0 },    // Soul Stone
                    '112': { _id: 112, _num: 0 },    // Arena Coin
                    '113': { _id: 113, _num: 0 },    // Snake Coin
                    '114': { _id: 114, _num: 0 },    // Guild Coin
                }
            },
            _lastLoginTime: now,
            _offlineTime: 0,
            _nickChangeTimes: 0,
            _levelChangeTime: now,
            _createTime: now,
            _oriServerId: params.serverId,
            _vipLevelVersion: '201912301726',
            _os: '',
            _bulletinVersions: {},
            _oldUserBackTime: 0,
            _channelParam: {}
        },

        // ─── hangup: AFK/idle rewards state ───
        hangup: {
            _id: userId,
            _lastGainTime: now,
            _waitGain: { _items: {} },
            _waitRand: { _items: {} },
            _actReward: { _items: {} },
            _curLess: startLesson,               // 10101
            _maxPassLesson: 0,
            _passLessonTime: 0,
            _maxPassChapter: 0,
            _lastNormalGainTime: now,
            _lastRandGainTime: now,
            _haveGotChapterReward: {},
            _firstGain: true,
            _clickGlobalWarBuffTag: '',
            _buyFund: false,
            _haveGotFundReward: {}
        },

        // ─── summon: gacha state ───
        summon: {
            _id: userId,
            _energy: 0,
            _haveCommonGuide: true,
            _haveSuperGuide: true,
            _canCommonFreeTime: now + 86400000,      // 24h from now
            _canSuperFreeTime: now + 172800000,       // 48h from now
            _summonTimes: {},
            _logicInfo: {},
            _firstDiamond10: false,
            _wishList: [],
            _wishVersion: 0
        },

        // ─── totalProps: inventory ───
        totalProps: {
            _items: []
        },

        backpackLevel: 0,

        // ─── imprint: sign/rune data ───
        imprint: {
            _items: []
        },

        // ─── heros: hero collection ───
        heros: {
            _id: userId,
            _maxPower: 0,
            _maxPowerChangeTime: now,
            _heros: {}
        },

        // ─── equip: equipment per hero ───
        equip: {
            _suits: {}
        },

        // ─── dungeon: dungeon progress ───
        dungeon: {
            _dungeons: []
        },

        // ─── scheduleInfo: daily refresh counters ───
        scheduleInfo: {
            _marketDiamondRefreshCount: 0,
            _vipMarketDiamondRefreshCount: 0,
            _arenaAttackTimes: 5,
            _arenaBuyTimesCount: 0,
            _snakeResetTimes: 0,
            _snakeSweepCount: 0,
            _cellGameHaveGotReward: false,
            _cellGameHaveTimes: 0,
            _cellgameHaveSetHero: false,
            _strongEnemyTimes: 0,
            _strongEnemyBuyCount: 0,
            _mergeBossBuyCount: 0,
            _dungeonTimes: 0,
            _dungeonBuyTimesCount: 0,
            _karinBattleTimes: 0,
            _karinBuyBattleTimesCount: 0,
            _karinBuyFeetCount: 0,
            _entrustResetTimes: 0,
            _dragonExchangeSSPoolId: 0,
            _dragonExchangeSSSPoolId: 0,
            _teamDugeonUsedRobots: [],
            _timeTrialBuyTimesCount: 0,
            _monthCardHaveGotReward: {},
            _goldBuyCount: 0,
            _likeRank: null,
            _mahaAttackTimes: 0,
            _mahaBuyTimesCount: 0,
            _mineResetTimes: 0,
            _mineBuyResetTimesCount: 0,
            _mineBuyStepCount: 0,
            _guildBossTimes: 0,
            _guildBossTimesBuyCount: 0,
            _treasureTimes: 0,
            _guildCheckInType: 0,
            _templeBuyCount: 0,
            _trainingBuyCount: 0,
            _bossCptTimes: 0,
            _bossCptBuyCount: 0,
            _ballWarBuyCount: 0,
            _expeditionEvents: null,
            _clickExpedition: null,
            _expeditionSpeedUpCost: null,
            _templeDailyReward: null,
            _templeYesterdayLess: null,
            _topBattleTimes: 0,
            _topBattleBuyCount: 0,
            _gravityTrialBuyTimesCount: 0
        },

        superSkill: {},
        curMainTask: {},

        // ─── channelSpecial ───
        channelSpecial: {},

        // ─── dragonEquiped ───
        dragonEquiped: {},

        retrieve: null,
        _arenaTeam: null,
        _arenaSuper: null,
        karinStartTime: 0,
        karinEndTime: 0,

        enableShowQQ: false,
        showQQVip: null,
        showQQ: null,
        showQQImg1: null,
        showQQImg2: null,
        showQQUrl: null,

        // ─── broadcastRecord ───
        broadcastRecord: [],

        globalWarBuffTag: null,
        globalWarLastRank: null,
        globalWarBuff: null,
        globalWarBuffEndTime: null,

        // ═══════════════════════════════════════════════════
        // OPTIONAL FIELDS (safe to omit, client checks before access)
        // Included here with defaults for completeness
        // ═══════════════════════════════════════════════════

        summonLog: [],
        blacklist: [],

        giftInfo: {
            _fristRecharge: { canGetReward: false, haveGotReward: false },
            _haveGotVipRewrd: null,
            _buyVipGiftCount: null,
            _onlineGift: null,
            _gotBSAddToHomeReward: false,
            _clickHonghuUrlTime: 0,
            _isBuyFund: false
        },

        training: {
            _id: userId,
            _type: 0,
            _times: 10,
            _timesStartRecover: now,
            _surpriseReward: null,
            _questionId: null,
            _enemyId: null,
            _cfgId: null
        },

        expedition: {
            _id: userId,
            _times: 10,
            _passLesson: { '1': 0, '2': 0, '3': 0 }
        },

        battleMedal: {
            _id: userId,
            _level: 0,
            _cycle: 1,
            _openSuper: false
        },

        checkin: {
            _curCycle: 1,
            _maxActiveDay: 1
        },

        teamTraining: {
            _unlock: false
        },

        userGuildPub: {
            _guildId: ''
        },

        userWar: {
            _session: 0,
            _areaId: 0
        },

        vipLog: [],
        cardLog: [],
        onlineBulletin: []
    };

    // ─── Add starting hero ───
    gameState.heros._heros[heroId] = {
        _heroId: heroId,
        _heroDisplayId: startHero,                // 1205
        _heroBaseAttr: {
            _level: startHeroLevel,               // 3
            _evolveLevel: 0
        },
        _heroStar: 0,
        _superSkillLevel: 0,
        _potentialLevel: {},
        _superSkillResetCount: 0,
        _potentialResetCount: 0,
        _qigong: { _items: {} },
        _qigongTmp: { _items: {} },
        _qigongTmpPower: 0,
        _qigongStage: 1,
        _breakInfo: {
            _breakLevel: 1,
            _level: 0,
            _attr: { _items: {} },
            _version: ''
        },
        _totalCost: {
            _wakeUp: { _items: {} },
            _earring: { _items: {} },
            _levelUp: { _items: {} },
            _evolve: { _items: {} },
            _skill: { _items: {} },
            _qigong: { _items: {} },
            _heroBreak: { _items: {} }
        },
        _expeditionMaxLevel: 0,
        _gemstoneSuitId: 0,
        _linkTo: [],
        _linkFrom: '',
        _resonanceType: 0,
        _version: '202010131125'
    };

    // ─── Create equipment slot for starting hero ───
    gameState.equip._suits[heroId] = {
        _suitItems: [],
        _suitAttrs: [],
        _equipAttrs: []
    };

    // ─── Store in gameData ───
    gameData.set(userId, gameState);
    accountIndex.set(`${params.account}:${params.serverId}`, userId);

    logger.log('INFO', 'STORAGE', `New user created`);
    logger.details('data',
        ['userId', userId.substring(0, 12) + '...'],
        ['account', params.account],
        ['serverId', String(params.serverId)],
        ['startHero', String(startHero)]
    );

    return gameState;
}

// ═══════════════════════════════════════════════════════════════
// GAME DATA OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get game state by userId
 */
function get(userId) {
    return gameData.get(userId) || null;
}

/**
 * Set game state for userId
 */
function set(userId, data) {
    gameData.set(userId, data);
}

/**
 * Check if user exists
 */
function has(userId) {
    return gameData.has(userId);
}

/**
 * Find userId by account + serverId
 */
function findByAccount(account, serverId) {
    const key = `${account}:${serverId}`;
    const userId = accountIndex.get(key);
    if (userId && gameData.has(userId)) {
        return userId;
    }
    return null;
}

/**
 * Delete user data
 */
function deleteUser(userId) {
    const data = gameData.get(userId);
    if (data && data.user) {
        const key = `${data.user._account}:${data.user._oriServerId}`;
        accountIndex.delete(key);
    }
    gameData.delete(userId);
}

/**
 * Get total user count
 */
function size() {
    return gameData.size;
}

// ═══════════════════════════════════════════════════════════════
// SESSION OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create session for socket
 */
function createSession(socketId, info) {
    sessions.set(socketId, {
        userId: info.userId || null,
        account: info.account || '',
        serverId: info.serverId || 0,
        loginToken: info.loginToken || '',
        connectedAt: Date.now(),
        ip: info.ip || 'unknown',
        transport: info.transport || 'websocket',
        verified: info.verified || false
    });
}

/**
 * Get session by socketId
 */
function getSession(socketId) {
    return sessions.get(socketId) || null;
}

/**
 * Update session
 */
function updateSession(socketId, updates) {
    const session = sessions.get(socketId);
    if (session) {
        Object.assign(session, updates);
    }
}

/**
 * Delete session
 */
function deleteSession(socketId) {
    sessions.delete(socketId);
}

/**
 * Find session by userId
 */
function findSessionByUserId(userId) {
    for (const [socketId, session] of sessions) {
        if (session.userId === userId) {
            return { socketId, ...session };
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE (Future — auto-save/load to JSON file)
// ═══════════════════════════════════════════════════════════════

/**
 * Save all game data to file
 */
function saveAll() {
    try {
        const dir = path.dirname(config.autoSavePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const data = {};
        for (const [userId, gameState] of gameData) {
            data[userId] = gameState;
        }

        fs.writeFileSync(config.autoSavePath, JSON.stringify(data, null, 2), 'utf8');
        logger.log('INFO', 'STORAGE', `Saved ${gameData.size} users to ${config.autoSavePath}`);
    } catch (err) {
        logger.log('ERROR', 'STORAGE', `Save failed: ${err.message}`);
    }
}

/**
 * Load all game data from file
 */
function loadAll() {
    try {
        if (!fs.existsSync(config.autoSavePath)) {
            logger.log('WARN', 'STORAGE', `No backup file found at ${config.autoSavePath}`);
            return 0;
        }

        const raw = fs.readFileSync(config.autoSavePath, 'utf8');
        const data = JSON.parse(raw);
        let count = 0;

        for (const [userId, gameState] of Object.entries(data)) {
            gameData.set(userId, gameState);
            // Rebuild account index
            if (gameState.user && gameState.user._account && gameState.user._oriServerId) {
                const key = `${gameState.user._account}:${gameState.user._oriServerId}`;
                accountIndex.set(key, userId);
            }
            count++;
        }

        logger.log('INFO', 'STORAGE', `Loaded ${count} users from backup`);
        return count;
    } catch (err) {
        logger.log('ERROR', 'STORAGE', `Load failed: ${err.message}`);
        return 0;
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
    // Game data
    get,
    set,
    has,
    findByAccount,
    deleteUser,
    size,
    createNewUser,

    // Sessions
    createSession,
    getSession,
    updateSession,
    deleteSession,
    findSessionByUserId,

    // Resources
    loadResource,
    loadAllResources,

    // Persistence
    saveAll,
    loadAll,

    // UUID
    generateUUID
};
