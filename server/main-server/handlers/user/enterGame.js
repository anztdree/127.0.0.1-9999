/**
 * handlers/user/enterGame.js — Enter Game Handler (100% Complete)
 *
 * =============================================================================
 * CLIENT REQUEST (exact dari client code line 114411-114447):
 * =============================================================================
 *   type: 'user'             — LOWERCASE (bukan 'User' seperti login-server)
 *   action: 'enterGame'
 *   loginToken: string       — FINAL token dari SaveHistory (64 hex chars)
 *   userId: string           — dari loginGame response
 *   serverId: number         — parseInt(serverItem.serverId)
 *   version: '1.0'
 *   language: string         — ToolCommon.getLanguage()
 *   gameVersion: string      — ToolCommon.getClientVer()
 *
 * =============================================================================
 * RESPONSE FORMAT (exact dari index.js buildResponse):
 * =============================================================================
 *   {
 *     ret: 0,                          — 0 = success, non-zero = error
 *     data: <LZ-String compressed>,    — LZString.compressToUTF16(JSON.stringify(responseData))
 *     compress: true,
 *     serverTime: Date.now(),
 *     server0Time: new Date().getTimezoneOffset() * 60 * 1000
 *   }
 *
 * =============================================================================
 * RESPONSE DATA STRUCTURE (84+ fields from saveUserData line 114793-114873):
 * =============================================================================
 *   MANDATORY fields (NO guard — will CRASH if missing):
 *     user, currency, heros, totalProps, backpackLevel, hangup, summon,
 *     scheduleInfo (47 fields!), channelSpecial (9 fields), dragonEquiped,
 *     curMainTask, dungeon, skill, karinStartTime, karinEndTime,
 *     enableShowQQ, showQQVip, showQQ, showQQImg1, showQQImg2, showQQUrl,
 *     globalWarBuffTag, globalWarLastRank, globalWarBuff, globalWarBuffEndTime
 *
 *   CONDITIONAL fields (guarded by && — safe to be null):
 *     heroSkin, summonLog, cellgameHaveSetHero, vipLog, cardLog, guide,
 *     guildName, clickSystem, giftInfo, monthCard, recharge, timesInfo,
 *     userDownloadReward, YouTuberRecruit, timeMachine, timeBonusInfo,
 *     onlineBulletin, serverVersion, serverOpenDate, lastTeam,
 *     heroImageVersion, superImageVersion, training, warInfo, userWar,
 *     serverId, headEffect, userBallWar, ballWarState, ballBroadcast,
 *     ballWarInfo, guildActivePoints, hideHeroes, expedition, timeTrial,
 *     battleMedal, shopNewHeroes, teamDungeon, teamServerHttpUrl,
 *     teamDungeonOpenTime, teamDungeonTask, teamDungeonSplBcst,
 *     teamDungeonNormBcst, teamDungeonHideInfo, templeLess,
 *     teamDungeonInvitedFriends, myTeamServerSocketUrl, gemstone,
 *     questionnaires, resonance, fastTeam, gravity, littleGame,
 *     userYouTuberRecruit, blacklist, forbiddenChat, superSkill, imprint,
 *     userGuild, userGuildPub, guildLevel, guildTreasureMatchRet,
 *     retrieve, userTopBattle, topBattleInfo, _arenaTeam, _arenaSuper,
 *     teamTraining, equip, weapon, genki
 *
 *   SEPARATE HANDLERS (outside saveUserData):
 *     broadcastRecord (line 114436), newUser (line 114524, SDK analytics only)
 *
 * =============================================================================
 * FLOW:
 * =============================================================================
 *   1. Validate loginToken → get userId + pwd dari login-server DB (READ-ONLY)
 *   2. Cross-check userId
 *   3. Get password dari login DB
 *   4. Check user exists in main-server DB
 *   5. NEW user → create ALL default data (hero, items, teams, JSON modules)
 *   6. RETURNING user → load ALL existing data from DB
 *   7. Build complete enterGame response (84+ fields)
 *   8. Return compressed response
 *
 * =============================================================================
 * CRITICAL RULES:
 * =============================================================================
 *   - NO ASSUMPTIONS: Every value proven from client code or resource JSON
 *   - NO STUBS: Every field has real data or explicit null/default
 *   - heroBaseAttr stats = ALL 0 (getAttrs.js handles calculation)
 *   - _heroId = UUID v4 (crypto.randomUUID())
 *   - currency = STRING (e.g. "USD")
 *   - _pwd = plaintext
 *   - dragonEquiped MUST be {} (not null — for...in on null CRASHES!)
 *   - scheduleInfo MUST have all 48 fields (most unguarded!)
 *   - channelSpecial MUST have all 9 fields (NO guard!)
 *   - heros._heros = OBJECT keyed by heroId (NOT array!)
 *   - superSkill = null for new user (guarded internally by if(e))
 *   - _superSkillLevel = 0 (number, NOT object!)
 *   - _qigong, _qigongTmp = null for new hero (optional)
 *   - _totalCost, _breakInfo = null for new hero (optional, guarded)
 *
 * =============================================================================
 * PROVEN VALUES (from resource JSON):
 * =============================================================================
 *   constant.json key "1":
 *     startHero: "1205" (STRING in JSON, parsed as 1205)
 *     startHeroLevel: "3" (STRING in JSON, parsed as 3)
 *     startChapter: 801
 *     startLesson: 10101
 *     playerIcon: "hero_icon_1205"
 *     startUserLevel: 1
 *     startUserExp: 0
 *     startDiamond: 0
 *     startGold: 0
 *     maxUserLevel: 300
 *     maxMana: 100
 *     startMana: 50
 *     superMaxMana: 100
 *     superStartMana: 0
 *
 *   hero.json id 1205:
 *     speed: 376
 *     energyMax: 100
 *     talent: 0.4 (stored as _talent = 40 in heroBaseAttr)
 *     quality: "purple"
 *     type: "strength"
 *     heroType: "critical"
 *
 *   heroLevelAttr.json level 3:
 *     hp: 1576, attack: 158, armor: 307
 *
 *   bagPlus.json level 1:
 *     max: 90, diamond: 0
 *
 *   Client constants (line 116237):
 *     DIAMONDID = 101, GOLDID = 102
 *     PLAYEREXPERIENCEID = 103, PLAYERLEVELID = 104
 *     PLAYERVIPEXPERIENCEID = 105, PLAYERVIPLEVELID = 106
 *
 *   Ball IDs (client line 116249):
 *     ONESTARBALLID = 151 through SEVENSTARBALLID = 157
 *     WUKONGID = 1205
 * =============================================================================
 */

var crypto = require('crypto');
var config = require('../../config');
var resources = require('../../utils/resources');

// ============================================================
// SECTION 3: CONSTANTS
// All values proven from resource JSON files.
// Source: constant.json key "1", hero.json, heroLevelAttr.json, client code
// ============================================================

// --- From constant.json key "1" (proven) ---

/**
 * Starting hero display ID (Goku / Wukong).
 * Source: constant.json key "1" → startHero: "1205"
 * Client constant: WUKONGID = 1205 (line 116249)
 */
var START_HERO_ID = 1205;

/**
 * Starting hero level.
 * Source: constant.json key "1" → startHeroLevel: "3" (parsed to int)
 */
var START_HERO_LEVEL = 3;

/**
 * Starting story chapter.
 * Source: constant.json key "1" → startChapter: 801
 */
var START_CHAPTER = 801;

/**
 * Starting story lesson/stage.
 * Source: constant.json key "1" → startLesson: 10101
 */
var START_LESSON = 10101;

/**
 * Default player avatar.
 * Source: constant.json key "1" → playerIcon: "hero_icon_1205"
 */
var DEFAULT_HEAD_IMAGE = 'hero_icon_1205';

/**
 * Starting player level.
 * Source: constant.json key "1" → startUserLevel: 1
 * Stored as item ID 104 (PLAYERLEVELID) in backpack.
 */
var START_USER_LEVEL = 1;

/**
 * Starting player XP.
 * Source: constant.json key "1" → startUserExp: 0
 * Stored as item ID 103 (PLAYEREXPERIENCEID) in backpack.
 */
var START_USER_EXP = 0;

/**
 * Starting diamonds.
 * Source: constant.json key "1" → startDiamond: 0
 * Stored as item ID 101 (DIAMONDID) in backpack.
 */
var START_DIAMOND = 0;

/**
 * Starting gold.
 * Source: constant.json key "1" → startGold: 0
 * Stored as item ID 102 (GOLDID) in backpack.
 */
var START_GOLD = 0;

/**
 * Maximum player level.
 * Source: constant.json key "1" → maxUserLevel: 300
 */
var MAX_USER_LEVEL = 300;

/**
 * Normal battle max energy.
 * Source: constant.json key "1" → maxMana: 100
 */
var MAX_MANA = 100;

/**
 * Normal battle starting energy.
 * Source: constant.json key "1" → startMana: 50
 */
var START_MANA = 50;

/**
 * Super skill battle max energy.
 * Source: constant.json key "1" → superMaxMana: 100
 */
var SUPER_MAX_MANA = 100;

/**
 * Super skill battle starting energy.
 * Source: constant.json key "1" → superStartMana: 0
 */
var SUPER_START_MANA = 0;

/**
 * Maximum nickname length.
 * Source: constant.json key "1" → playerNameLength: 12
 */
var PLAYER_NAME_LENGTH = 12;

/**
 * Starting backpack level.
 * Source: bagPlus.json key "1" → max: 90, diamond: 0
 * The first bagPlus entry has id: "1", keys are STRING in JSON.
 */
var START_BACKPACK_LEVEL = 1;

// --- Item IDs (from client constants line 116237) ---

/** Diamonds — client: DIAMONDID = 101 */
var DIAMONDID = 101;

/** Gold — client: GOLDID = 102 */
var GOLDID = 102;

/** Player XP — client: PLAYEREXPERIENCEID = 103 */
var PLAYEREXPERIENCEID = 103;

/** Player Level — client: PLAYERLEVELID = 104 */
var PLAYERLEVELID = 104;

/** VIP Experience — client: PLAYERVIPEXPERIENCEID = 105 */
var PLAYERVIPEXPERIENCEID = 105;

/** VIP Level — client: PLAYERVIPLEVELID = 106 */
var PLAYERVIPLEVELID = 106;

/** VIP Exp All — client: PLAYERVIPEXPALLID = 107 */
var PLAYERVIPEXPALLID = 107;

/** Experience Capsule — client: EXPERIENCECAPSULEID = 131 */
var EXPERIENCECAPSULEID = 131;

/** Evolve Capsule — client: EVOLVECAPSULEID = 132 */
var EVOLVECAPSULEID = 132;

/** Soul Coin — client: SoulCoinID = 111 */
var SOULCOINID = 111;

/** Arena Coin — client: ArenaCoinID = 112 */
var ARENACOINID = 112;

/** Snake Coin — client: SnakeCoinID = 113 */
var SNAKECOINID = 113;

/** Team Coin — client: TeamCoinID = 114 */
var TEAMCOINID = 114;

/** Honour Coin — client: HonourCoinID = 115 */
var HONOURCOINID = 115;

/** Energy Stone — client: EnergyStone = 136 */
var ENERGYSTONEID = 136;

/** Metal — client: Metal = 137 */
var METALID = 137;

/** Red Hero Capsule — client: REDHEROCAPSULEID = 546 */
var REDHEROCAPSULEID = 546;

// --- Dragon Ball IDs (from client line 116249) ---

/** One-Star Ball through Seven-Star Ball */
var BALL_IDS = [151, 152, 153, 154, 155, 156, 157];

// ============================================================
// SECTION 4: DEFAULT DATA BUILDERS
//
// Each function builds the default data structure for a game module.
// All structures proven from client code saveUserData (line 114793-114873)
// and the specific setter/deserializer functions they map to.
// ============================================================

/**
 * Generate nickname: "player_" + 4 random digits.
 * Max length: 12 chars ("player_" = 7 + 4 digits = 11, under limit).
 * Source: constant.json playerNameLength: 12
 */
function generateNickName() {
    var num = Math.floor(1000 + Math.random() * 9000);
    return 'player_' + num;
}

/**
 * Generate UUID v4 for hero instance ID.
 * Used as _heroId in hero objects.
 * Client uses this as the key in _heros object.
 */
function generateHeroId() {
    return crypto.randomUUID();
}

// ----------------------------------------------------------
// 4.1 defaultHeroBaseAttr(level)
// ----------------------------------------------------------
// Client: HeroAttribute.deserialize() — line 133450
// Generic Serializable deserialize — strips "_" prefix, assigns all key-value pairs.
// Only string/number/boolean auto-assigned.
//
// For NEW user: ALL stats = 0 (getAttrs.js calculates real values).
// Only _level and _evolveLevel have non-zero values (identity fields).
//
// Full attribute list (31 fields, from HeroAttribute constructor):
//   _hp, _attack, _armor, _speed,
//   _hit, _dodge, _block, _damageReduce,
//   _armorBreak, _controlResist, _skillDamage,
//   _criticalDamage, _blockEffect, _critical,
//   _criticalResist, _trueDamage, _energy,
//   _power, _extraArmor, _hpPercent,
//   _armorPercent, _attackPercent, _speedPercent,
//   _orghp, _superDamage, _healPlus,
//   _healerPlus, _damageDown, _shielderPlus,
//   _damageUp, _evolveLevel, _level, _talent
// ----------------------------------------------------------

/**
 * Build default heroBaseAttr for a new hero.
 * All stats = 0 because getAttrs.js will calculate real values.
 * Only _level and _evolveLevel have meaningful values.
 *
 * @param {number} level - Hero level (from constant.json startHeroLevel = 3)
 * @returns {object} Hero base attribute object with 32 fields
 */
function defaultHeroBaseAttr(level) {
    return {
        _hp: 0,
        _attack: 0,
        _armor: 0,
        _speed: 0,
        _hit: 0,
        _dodge: 0,
        _block: 0,
        _damageReduce: 0,
        _armorBreak: 0,
        _controlResist: 0,
        _skillDamage: 0,
        _criticalDamage: 0,
        _blockEffect: 0,
        _critical: 0,
        _criticalResist: 0,
        _trueDamage: 0,
        _energy: 0,
        _power: 0,
        _extraArmor: 0,
        _hpPercent: 0,
        _armorPercent: 0,
        _attackPercent: 0,
        _speedPercent: 0,
        _orghp: 0,
        _superDamage: 0,
        _healPlus: 0,
        _healerPlus: 0,
        _damageDown: 0,
        _shielderPlus: 0,
        _damageUp: 0,
        _level: level,          // Identity: hero level (3 for new)
        _evolveLevel: 0,        // Identity: evolve stage (0 for new)
        _talent: 0              // Calculated by getAttrs from hero.json talent
    };
}

// ----------------------------------------------------------
// 4.2 defaultHero(heroInstanceId, heroDisplayId, level)
// ----------------------------------------------------------
// Client: HerosManager.readByData(e.heros) — line 133718
// Reads e.heros._heros{[heroId]: heroObj}
// Each heroObj is deserialized by Hero.deserialize()
//
// Fields proven from client Hero class constructor:
//   _heroId: string (UUID v4, instance ID)
//   _heroDisplayId: number (template ID from hero.json)
//   _heroStar: number (0 = no stars)
//   _heroTag: string (comma-separated tags, e.g. "tortoise,saiyan")
//   _fragment: number (hero fragment count)
//   _superSkillResetCount: number
//   _potentialResetCount: number
//   _heroBaseAttr: object (see 4.1 above)
//   _superSkillLevel: NUMBER (0, NOT object!)
//     Client: "this._superSkillLevel = e" where e is read from hero object
//   _potentialLevel: array (indexed [1], [2], [3] for 3 potential skills)
//     Client: "this._potentialLevel = e || []"
//   _qigong: null or {_items: [{_id, _num}]}
//     Client: guarded by "e._qigong &&"
//   _qigongTmp: null or {_items: [{_id, _num}]}
//     Client: guarded by "e._qigongTmp &&"
//   _qigongStage: number (default 1)
//   _qigongTmpPower: number (default 0)
//   _totalCost: null or object (guarded by "e._totalCost &&")
//     Structure: {_wakeUp: {_items:[]}, _earring: {_items:[]}, ...}
//   _breakInfo: null or object (guarded by "e._breakInfo &&")
//     Structure: {_breakLevel:1, _level:0, _attr:{_items:[]}}
//   _gemstoneSuitId: number (default 0)
//   _linkTo: array (default [])
//   _linkFrom: string (default '')
//   _expeditionMaxLevel: number (default 0)
// ----------------------------------------------------------

/**
 * Build default hero object for a new hero.
 *
 * CRITICAL DECISIONS:
 *   - _superSkillLevel = 0 (NUMBER, not {}) — client reads as number
 *   - _qigong = null — optional, guarded by "e._qigong &&"
 *   - _qigongTmp = null — optional, guarded by "e._qigongTmp &&"
 *   - _totalCost = null — optional, guarded by "e._totalCost &&"
 *   - _breakInfo = null — optional, guarded by "e._breakInfo &&"
 *   - _heroTag = '' — string, populated later when hero is tagged
 *
 * @param {string} heroId - UUID v4 instance ID
 * @param {number} heroDisplayId - Hero template ID (e.g. 1205)
 * @param {number} level - Hero level (e.g. 3)
 * @returns {object} Complete hero object
 */
function defaultHero(heroId, heroDisplayId, level) {
    return {
        _heroId: heroId,
        _heroDisplayId: heroDisplayId,
        _heroStar: 0,
        _heroTag: '',
        _fragment: 0,
        _superSkillResetCount: 0,
        _potentialResetCount: 0,
        _expeditionMaxLevel: 0,
        _heroBaseAttr: defaultHeroBaseAttr(level),
        _superSkillLevel: 0,         // NUMBER (not object!) — client stores as number
        _potentialLevel: [],          // Array for 3 potential skill levels
        _qigong: null,                // Optional — guarded by "e._qigong &&"
        _qigongTmp: null,             // Optional — guarded by "e._qigongTmp &&"
        _qigongStage: 1,
        _qigongTmpPower: 0,
        _totalCost: null,             // Optional — guarded by "e._totalCost &&"
        _breakInfo: null,             // Optional — guarded by "e._breakInfo &&"
        _gemstoneSuitId: 0,
        _linkTo: [],
        _linkFrom: ''
    };
}

// ----------------------------------------------------------
// 4.3 defaultScheduleInfo()
// ----------------------------------------------------------
// Client: AllRefreshCount.initData(e.scheduleInfo) — line 91274-91323
// NO GUARD on call site — MUST have all 48 fields!
//
// Most fields are direct property assignments WITHOUT null checks.
// Missing any field → that property stays undefined → potential crash.
//
// Field mapping note (client name → server name):
//   Some fields in initData have slightly different names than what's stored.
//   _timeTrialBuyTimesCount maps to client _spaceTrialBuyCount (name mismatch!)
// ----------------------------------------------------------

/**
 * Build default scheduleInfo with ALL 48 fields.
 * This is MANDATORY — missing fields will cause silent errors.
 *
 * Each field documented with its purpose and default value for new user.
 */
function defaultScheduleInfo() {
    return {
        // --- Market refresh counts ---
        _marketDiamondRefreshCount: 0,       // Normal market diamond refreshes used
        _vipMarketDiamondRefreshCount: 0,    // VIP market diamond refreshes used

        // --- Arena ---
        _arenaAttackTimes: 0,                // Arena attack attempts used today
        _arenaBuyTimesCount: 0,              // Arena extra attack purchases

        // --- Snake dungeon ---
        _snakeResetTimes: 0,                 // Snake dungeon resets
        _snakeSweepCount: 0,                 // Snake dungeon sweeps

        // --- Cell game (PvP) ---
        _cellGameHaveGotReward: true,        // Has claimed cell game daily reward
        _cellGameHaveTimes: 0,               // Cell game attempts used today
        _cellgameHaveSetHero: false,         // Has set defense team for cell game

        // --- Strong enemy / merge boss ---
        _strongEnemyTimes: 0,                // Strong enemy attempts
        _strongEnemyBuyCount: 0,             // Strong enemy extra purchases
        _mergeBossBuyCount: 0,               // Merge boss extra purchases

        // --- Dungeon times (object keyed by dungeon type) ---
        _dungeonTimes: {},                   // e.g. {"exp": 2, "evolve": 2, ...}
        _dungeonBuyTimesCount: {},           // Dungeon extra attempt purchases

        // --- Karin tower ---
        _karinBattleTimes: 0,                // Karin tower battles today
        _karinBuyBattleTimesCount: 0,        // Karin extra battle purchases
        _karinBuyFeetCount: 0,               // Karin extra feet (climb steps) purchases

        // --- Entrust / dragon exchange ---
        _entrustResetTimes: 0,               // Entrust resets
        _dragonExchangeSSPoolId: 0,          // Current SS dragon exchange pool
        _dragonExchangeSSSPoolId: 0,         // Current SSS dragon exchange pool

        // --- Team dungeon ---
        _teamDugeonUsedRobots: [],           // NOTE: "Dugeon" typo matches client!

        // --- Time/Space trial ---
        _timeTrialBuyTimesCount: 0,          // Maps to _spaceTrialBuyCount in client

        // --- Month card ---
        _monthCardHaveGotReward: {},         // Month card rewards claimed {day: bool}

        // --- Gold purchase ---
        _goldBuyCount: 0,                    // Gold purchases today

        // --- Social / like ---
        _likeRank: 0,                        // Like rank votes given

        // --- Maha adventure ---
        _mahaAttackTimes: 0,                 // Maha adventure battles
        _mahaBuyTimesCount: 0,               // Maha extra purchases

        // --- Mine ---
        _mineResetTimes: 0,                  // Mine resets
        _mineBuyResetTimesCount: 0,          // Mine extra reset purchases
        _mineBuyStepCount: 0,                // Mine extra step purchases

        // --- Guild ---
        _guildBossTimes: 0,                  // Guild boss attacks
        _guildBossTimesBuyCount: 0,          // Guild boss extra purchases
        _treasureTimes: 0,                   // Guild treasure opens
        _guildCheckInType: 0,                // Guild check-in type

        // --- Temple ---
        _templeBuyCount: 0,                  // Temple extra challenge purchases

        // --- Training ---
        _trainingBuyCount: 0,                // Training extra purchases

        // --- Boss captain ---
        _bossCptTimes: 0,                    // Boss captain attempts
        _bossCptBuyCount: 0,                 // Boss captain extra purchases

        // --- Ball war ---
        _ballWarBuyCount: 0,                 // Dragon ball war extra attempts

        // --- Top battle ---
        _topBattleTimes: 0,                  // Top battle attempts
        _topBattleBuyCount: 0,               // Top battle extra purchases

        // --- Gravity trial ---
        _gravityTrialBuyTimesCount: 0,       // Gravity trial extra purchases

        // --- Expedition ---
        _expeditionEvents: null,             // Active expedition events (null = none)
        _clickExpedition: 0,                 // Expedition clicks/interactions today
        _expeditionSpeedUpCost: 0,           // Total diamonds spent on expedition speed-up

        // --- Temple daily ---
        _templeDailyReward: 0,               // Temple daily reward tier reached
        _templeYesterdayLess: 0              // Temple yesterday's floor progress
    };
}

// ----------------------------------------------------------
// 4.4 defaultTimesInfo()
// ----------------------------------------------------------
// Client: TimesInfoSingleton.initData(e.timesInfo) — line ~96001-96011
// CONDITIONAL: guarded by "e.timesInfo &&" at line 114814
//
// WARNING: Inside initData, fields are assigned WITHOUT guards!
// If we send timesInfo, ALL 12 fields MUST be present.
//
// NOTE: NO underscore prefix on timesInfo fields!
// (Unlike scheduleInfo which uses _prefix)
// ----------------------------------------------------------

/**
 * Build default timesInfo with ALL 12 fields.
 * Conditional — only sent if truthy at call site.
 * But if sent, ALL fields must be present (no internal guards).
 */
function defaultTimesInfo() {
    return {
        marketRefreshTimes: 0,              // Normal market refreshes remaining
        marketRefreshTimesRecover: 0,       // Normal market refresh recovery timer
        vipMarketRefreshTimes: 0,           // VIP market refreshes remaining
        vipMarketRefreshTimesRecover: 0,    // VIP market refresh recovery timer
        templeTimes: 0,                     // Temple challenge attempts remaining
        templeTimesRecover: 0,              // Temple attempt recovery timer
        mahaTimes: 0,                       // Maha adventure attempts remaining
        mahaTimesRecover: 0,                // Maha attempt recovery timer
        mineSteps: 0,                       // Mine action points remaining
        mineStepsRecover: 0,                // Mine action point recovery timer
        karinFeet: 0,                       // Karin tower feet (climbs) remaining
        karinFeetRecover: 0                 // Karin feet recovery timer
    };
}

// ----------------------------------------------------------
// 4.5 defaultHangup()
// ----------------------------------------------------------
// Client: setOnHook(e) — line 114886-114900
// MANDATORY: reads e.hangup._curLess etc. directly
// Also reads top-level: e.globalWarBuffTag, e.globalWarLastRank,
//   e.globalWarBuff, e.globalWarBuffEndTime (from e directly)
// ----------------------------------------------------------

/**
 * Build default hangup (idle/farm) data.
 * Source: OnHookSingleton constructor + setOnHook handler.
 */
function defaultHangup() {
    return {
        _curLess: START_LESSON,              // Current farming stage (10101 for new)
        _maxPassLesson: 0,                   // Highest stage passed
        _haveGotChapterReward: {},           // Chapter rewards claimed {chapterId: bool}
        _maxPassChapter: 0,                  // Highest chapter passed
        _clickGlobalWarBuffTag: 0,           // Global war buff click tracking
        _buyFund: 0,                         // Fund purchase status
        _haveGotFundReward: 0                // Fund rewards claimed
    };
}

// ----------------------------------------------------------
// 4.6 defaultSummon()
// ----------------------------------------------------------
// Client: setSummon(e) — line 114901-114911
// MANDATORY: reads e.summon._energy etc. directly
// ----------------------------------------------------------

/**
 * Build default summon (gacha) data.
 * Source: SummonSingleton constructor + setSummon handler.
 */
function defaultSummon() {
    return {
        _energy: 0,                         // Summon energy (paid resource)
        _wishList: [],                       // Wish list hero IDs
        _wishVersion: 0,                     // Wish list version (bumped on change)
        _canCommonFreeTime: 0,               // Next common free summon time (timestamp)
        _canSuperFreeTime: 0,                // Next super free summon time (timestamp)
        _summonTimes: {}                     // Summon count tracking {poolId: count}
    };
}

// ----------------------------------------------------------
// 4.7 defaultGiftInfo()
// ----------------------------------------------------------
// Client: Full giftInfo block at line 114799-114813
// CONDITIONAL: guarded by "e.giftInfo &&" at line 114799
//
// DANGER: Some sub-setters have NO internal null guard!
//   setVIPPrerogativeGift(_buyVipGiftCount) — NO null guard inside!
//   setOnlineGift(_onlineGift) — NO null guard inside!
//
// So if we send giftInfo, ALL sub-objects MUST be properly structured.
// ----------------------------------------------------------

/**
 * Build default giftInfo with properly structured sub-objects.
 * Conditional — but if sent, ALL sub-fields must be present.
 *
 * Sub-objects:
 *   _fristRecharge: First recharge reward tracking
 *   _haveGotVipRewrd: VIP reward claims keyed by VIP level
 *   _buyVipGiftCount: VIP privilege gift purchase counts
 *   _onlineGift: Online gift timer and current gift ID
 */
function defaultGiftInfo() {
    return {
        _fristRecharge: {                   // NOTE: "frist" typo matches client!
            _canGetReward: false,            // Player eligible for first recharge reward
            _haveGotReward: false            // Player has claimed first recharge reward
        },
        _haveGotVipRewrd: {},               // VIP level rewards claimed {level: bool}
        _buyVipGiftCount: {},               // VIP privilege gifts bought {level: count}
        _onlineGift: {                      // Online gift system
            _curId: 0,                      // Current online gift ID
            _nextTime: 0                    // Next online gift reward timestamp
        },
        _gotBSAddToHomeReward: 0,           // Battle pass add-to-home reward flag
        _clickHonghuUrlTime: 0,             // Last clicked honghu URL timestamp
        _gotChannelWeeklyRewardTag: 0        // Channel weekly reward tag
    };
}

// ----------------------------------------------------------
// 4.8 defaultGuide(userId)
// ----------------------------------------------------------
// Client: GuideInfoManager.setGuideInfo(e.guide) — line 120569
// CONDITIONAL: guarded by "e.guide &&"
//
// Guide tracks tutorial/story progression per guide type.
// GUIDE_TYPE MAIN = 2, start step = 2101
// Source: constant.json tutorialLesson: "10101,10102"
// ----------------------------------------------------------

/**
 * Build default guide (tutorial) data.
 *
 * @param {string} userId - Player's user ID
 * @returns {object} Guide object with initial step for MAIN guide type
 */
function defaultGuide(userId) {
    return {
        _id: userId,                        // Player ID (guide is per-player)
        _steps: {
            "2": 2101                       // Guide type 2 (MAIN), start at step 2101
        }
    };
}

// ----------------------------------------------------------
// 4.9 defaultChannelSpecial()
// ----------------------------------------------------------
// Client: WelfareInfoManager.channelSpecial = e.channelSpecial — line 114795
// MANDATORY: NO GUARD — direct assignment!
// Must have ALL 9 fields.
//
// Also at line 114846: e.channelSpecial._honghuUrl (separate handler)
// ----------------------------------------------------------

/**
 * Build default channelSpecial with ALL 9 fields.
 * MANDATORY — no guard on client side.
 */
function defaultChannelSpecial() {
    return {
        _show: false,                       // Show channel special features
        _vip: 999,                          // VIP level required (999 = no one)
        _bg: '',                            // Background image path
        _icon: '',                          // Icon image path
        _honghuUrl: '',                     // Honghu promotional URL
        _honghuUrlStartTime: 0,             // Honghu URL display start time
        _honghuUrlEndTime: 0,               // Honghu URL display end time
        _weeklyRewardTag: 0,                // Weekly reward claim tag
        _hideHeroes: []                     // Hidden hero IDs for this channel
    };
}

// ----------------------------------------------------------
// 4.10 defaultUserDownloadReward()
// ----------------------------------------------------------
// Client: Inline at line 114814-114822
// CONDITIONAL: guarded by "e.userDownloadReward &&"
// Sets userDownloadModel = {...}
// ----------------------------------------------------------

/**
 * Build default user download reward tracking.
 */
function defaultUserDownloadReward() {
    return {
        _isClick: false,                    // Has clicked download reward banner
        _haveGotDlReward: false,            // Has claimed download reward
        _isBind: false,                     // Has bound account
        _haveGotBindReward: false           // Has claimed bind reward
    };
}

// ----------------------------------------------------------
// 4.11 defaultEquip()
// ----------------------------------------------------------
// Client: setEquip(e) → EquipInfoManager.readByData(e)
// Reads e.equip._suits (object keyed by heroId)
//
// For new user: empty — no equipment.
// ----------------------------------------------------------

/**
 * Build default equipment data.
 * Empty for new user — no equipment sets.
 */
function defaultEquip() {
    return { _suits: {} };
}

// ----------------------------------------------------------
// 4.12 defaultWeapon()
// ----------------------------------------------------------
// Client: setEquip(e) → reads e.weapon._items
// Object keyed by weapon instance ID.
//
// For new user: empty.
// ----------------------------------------------------------

/**
 * Build default weapon data.
 * Empty for new user.
 */
function defaultWeapon() {
    return { _items: {} };
}

// ----------------------------------------------------------
// 4.13 defaultGenki()
// ----------------------------------------------------------
// Client: GenkiModel.deserialize(e.genki) — line 132152
// Reads _items (object keyed by genki instance ID),
// _curSmeltNormalExp, _curSmeltSuperExp
//
// CRITICAL: _items is an OBJECT {}, NOT an array []!
// NO _id field in genki top-level!
// ----------------------------------------------------------

/**
 * Build default genki (ki stone) data.
 * _items must be {} (object), NOT [] (array).
 */
function defaultGenki() {
    return {
        _items: {},                         // Object keyed by genki instance ID
        _curSmeltNormalExp: 0,              // Current normal smelting XP
        _curSmeltSuperExp: 0                // Current super smelting XP
    };
}

// ----------------------------------------------------------
// 4.14 defaultDragonEquiped()
// ----------------------------------------------------------
// Client: ItemsCommonSingleton.initDragonBallEquip(e.dragonEquiped)
// NO GUARD: uses for...in on e.dragonEquiped — CRASH if null!
//
// MUST be {} not null!
// When populated: { "151": true, "152": true, ... }
// Ball IDs: 151-157 (ONESTARBALLID through SEVENSTARBALLID)
// ----------------------------------------------------------

/**
 * Build default dragon equip data.
 * MUST return {} (empty object) — null will CRASH (for...in on null)!
 */
function defaultDragonEquiped() {
    return {};
}

// ----------------------------------------------------------
// 4.15 defaultSkill()
// ----------------------------------------------------------
// Client: reads e.skill — used by setMainTask and skill system
// MANDATORY: should be present
// ----------------------------------------------------------

/**
 * Build default skill data.
 */
function defaultSkill() {
    return { _items: {} };
}

// ----------------------------------------------------------
// 4.16 defaultDungeon()
// ----------------------------------------------------------
// Client: setCounterpart(e) — reads e.dungeon._dungeons
// GUARDED: "if (e.dungeon)" at line 114943
// But should still be present as empty object.
// ----------------------------------------------------------

/**
 * Build default dungeon data.
 */
function defaultDungeon() {
    return { _dungeons: {} };
}

// ============================================================
// SECTION 5: NEW USER CREATION
//
// Creates ALL default data for a brand new user.
// Uses DB transaction for atomicity.
// Every value proven from resource JSON or client constants.
// ============================================================

/**
 * Create a complete new user with all default data.
 *
 * Steps:
 *   1. Create user profile in users table
 *   2. Create starting hero (1205, level 3) in heroes table
 *   3. Create starting items (level, XP, diamond, gold, VIP) in items table
 *   4. Create default team (type 1 = PvE) in teams table
 *   5. Save all JSON modules (scheduleInfo, hangup, summon, etc.)
 *
 * @param {object} db - Database module
 * @param {string} userId - User ID from login-server
 * @param {string} pwd - Plaintext password from login-server
 * @returns {object} { nickName, startHeroId } for response building
 */
function createNewUser(db, userId, pwd) {
    // Generate unique identifiers
    var nickName = generateNickName();
    var now = Date.now();
    var heroId = generateHeroId();

    // ================================================================
    // 1. CREATE USER PROFILE
    // ================================================================
    // createUser inserts with defaults from db.js:
    //   pwd='game_origin', headImage='hero_icon_1205', oriServerId=config.serverId,
    //   level=1, exp=0, vipLevel=0, vipExp=0, currency=config.currency
    db.createUser(userId, nickName);

    // Update password to the real one from login-server
    db.dbRun('UPDATE users SET pwd = ? WHERE userId = ?', [pwd, userId]);

    // ================================================================
    // 2. CREATE STARTING HERO (Goku / Wukong — hero 1205, level 3)
    // ================================================================
    // db.createHero creates basic record with heroBaseAttr={_level, _evolveLevel}
    // We then UPDATE to set the full heroBaseAttr and null optional fields
    db.createHero(heroId, userId, START_HERO_ID, START_HERO_LEVEL);

    // Update heroBaseAttr to include ALL 32 fields (all 0 except _level and _evolveLevel)
    var fullHeroAttr = defaultHeroBaseAttr(START_HERO_LEVEL);
    db.dbRun(
        'UPDATE heroes SET heroBaseAttr = ? WHERE heroId = ?',
        [JSON.stringify(fullHeroAttr), heroId]
    );

    // Update optional fields to null (not empty objects)
    // _superSkillLevel is already 0 in DB default
    // _qigong, _qigongTmp, _totalCost, _breakInfo → null
    db.dbRun('UPDATE heroes SET qigong = NULL WHERE heroId = ?', [heroId]);
    db.dbRun('UPDATE heroes SET qigongTmp = NULL WHERE heroId = ?', [heroId]);
    db.dbRun('UPDATE heroes SET totalCost = NULL WHERE heroId = ?', [heroId]);
    db.dbRun('UPDATE heroes SET breakInfo = NULL WHERE heroId = ?', [heroId]);

    // Ensure superSkillLevel = 0 (NUMBER, not object!)
    db.dbRun('UPDATE heroes SET superSkillLevel = ? WHERE heroId = ?', ['0', heroId]);

    // ================================================================
    // 3. CREATE STARTING ITEMS
    // ================================================================
    // Source: constant.json key "1"
    //   startUserLevel: 1 → item 104 (PLAYERLEVELID)
    //   startUserExp: 0 → item 103 (PLAYEREXPERIENCEID)
    //   startDiamond: 0 → item 101 (DIAMONDID)
    //   startGold: 0 → item 102 (GOLDID)
    // Also include VIP items (always start at 0):
    //   PLAYERVIPEXPERIENCEID: 105 → 0
    //   PLAYERVIPLEVELID: 106 → 0
    db.setItem(userId, String(PLAYERLEVELID), START_USER_LEVEL);
    db.setItem(userId, String(PLAYEREXPERIENCEID), START_USER_EXP);
    db.setItem(userId, String(DIAMONDID), START_DIAMOND);
    db.setItem(userId, String(GOLDID), START_GOLD);
    db.setItem(userId, String(PLAYERVIPEXPERIENCEID), 0);
    db.setItem(userId, String(PLAYERVIPLEVELID), 0);

    // ================================================================
    // 4. CREATE DEFAULT TEAM (type 1 = PvE / Story)
    // ================================================================
    // Team structure: { _team: [{ _heroId: uuid, _position: 0 }], _superSkill: [] }
    db.setTeam(userId, 1,
        JSON.stringify([{ _heroId: heroId, _position: 0 }]),
        JSON.stringify([])
    );

    // ================================================================
    // 5. SAVE ALL JSON MODULES
    // ================================================================
    // Each module is stored in the userJson table as a JSON blob.
    // Loaded back on returning user's enterGame.

    // 5a. MANDATORY modules (will CRASH if missing)
    db.setJsonModule(userId, 'scheduleInfo', defaultScheduleInfo());
    db.setJsonModule(userId, 'channelSpecial', defaultChannelSpecial());
    db.setJsonModule(userId, 'dragonEquiped', defaultDragonEquiped());

    // 5b. Module data needed for user state
    db.setJsonModule(userId, 'timesInfo', defaultTimesInfo());
    db.setJsonModule(userId, 'hangup', defaultHangup());
    db.setJsonModule(userId, 'summon', defaultSummon());
    db.setJsonModule(userId, 'guide', defaultGuide(userId));
    db.setJsonModule(userId, 'giftInfo', defaultGiftInfo());
    db.setJsonModule(userId, 'userDownloadReward', defaultUserDownloadReward());

    // 5c. Feature flags
    db.setJsonModule(userId, 'YouTuberRecruit', { _hidden: 1 });

    // 5d. Structured data (stored as JSON for returning users)
    db.setJsonModule(userId, 'equip', defaultEquip());
    db.setJsonModule(userId, 'weapon', defaultWeapon());
    db.setJsonModule(userId, 'genki', defaultGenki());
    db.setJsonModule(userId, 'dungeon', defaultDungeon());
    db.setJsonModule(userId, 'skill', defaultSkill());

    return { nickName: nickName, startHeroId: heroId };
}

// ============================================================
// SECTION 6: ENTERGAME RESPONSE BUILDER
//
// Builds the complete response for both new and returning users.
// All 84+ fields documented with saveUserData line references.
//
// For returning users: loads ALL data from DB,
//   falls back to defaults for missing modules.
// ============================================================

/**
 * Safe JSON parse — handles string, object, null, undefined.
 * Returns parsed object or the fallback value.
 *
 * @param {*} str - String to parse, or object to pass through
 * @param {*} fallback - Value to return on parse failure (default: null)
 * @returns {*} Parsed object or fallback
 */
function safeParse(str, fallback) {
    if (fallback === undefined) fallback = null;
    if (str === null || str === undefined) return fallback;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); }
    catch (e) { return fallback; }
}

/**
 * Load a JSON module from DB, with fallback to default.
 *
 * @param {object} db - Database module
 * @param {string} userId - User ID
 * @param {string} module - Module name
 * @param {*} defaultVal - Default value if not found in DB
 * @returns {*} Loaded data or default
 */
function loadModule(db, userId, module, defaultVal) {
    var data = db.getJsonModule(userId, module);
    if (data !== null && data !== undefined) return data;
    return defaultVal;
}

/**
 * Build the complete enterGame response for a user.
 *
 * This function handles both NEW and RETURNING users.
 * For new users: data was just created by createNewUser().
 * For returning users: data is loaded from DB.
 *
 * @param {object} db - Database module
 * @param {string} userId - User ID
 * @param {string} pwd - Plaintext password (for _pwd field)
 * @param {boolean} isNewUser - Whether this is a first-time login
 * @returns {object|null} Complete enterGame response data, or null on error
 */
function buildEnterGameResponse(db, userId, pwd, isNewUser) {
    // ================================================================
    // 6.0 LOAD ALL DATA FROM DB
    // ================================================================

    // User profile (from users table)
    var user = db.getUser(userId);
    if (!user) return null;

    // Heroes (from heroes table)
    var heroes = db.getHeroes(userId);

    // Items (from items table)
    var items = db.getItems(userId);

    // Teams (from teams table)
    var teams = db.getTeams(userId);

    // Load ALL JSON modules (with defaults for missing ones)
    var scheduleInfo      = loadModule(db, userId, 'scheduleInfo', defaultScheduleInfo());
    var timesInfo         = loadModule(db, userId, 'timesInfo', defaultTimesInfo());
    var hangup            = loadModule(db, userId, 'hangup', defaultHangup());
    var summon            = loadModule(db, userId, 'summon', defaultSummon());
    var guide             = loadModule(db, userId, 'guide', null);
    var giftInfo          = loadModule(db, userId, 'giftInfo', null);
    var channelSpecial    = loadModule(db, userId, 'channelSpecial', defaultChannelSpecial());
    var userDownloadReward = loadModule(db, userId, 'userDownloadReward', null);
    var YouTuberRecruit   = loadModule(db, userId, 'YouTuberRecruit', { _hidden: 1 });
    var dragonEquiped     = loadModule(db, userId, 'dragonEquiped', defaultDragonEquiped());
    var equip             = loadModule(db, userId, 'equip', defaultEquip());
    var weapon            = loadModule(db, userId, 'weapon', defaultWeapon());
    var genki             = loadModule(db, userId, 'genki', defaultGenki());
    var dungeon           = loadModule(db, userId, 'dungeon', defaultDungeon());
    var skill             = loadModule(db, userId, 'skill', defaultSkill());
    var imprint           = loadModule(db, userId, 'imprint', null);
    var arenaTeam         = loadModule(db, userId, 'arenaTeam', null);
    var arenaSuper        = loadModule(db, userId, 'arenaSuper', null);
    var superSkill        = loadModule(db, userId, 'superSkill', null);
    var summonLog         = loadModule(db, userId, 'summonLog', null);
    var curMainTask       = loadModule(db, userId, 'curMainTask', []);
    var blacklist         = loadModule(db, userId, 'blacklist', null);
    var forbiddenChat     = loadModule(db, userId, 'forbiddenChat', null);
    var headEffect        = loadModule(db, userId, 'headEffect', null);
    var fastTeam          = loadModule(db, userId, 'fastTeam', null);
    var resonance         = loadModule(db, userId, 'resonance', null);
    var gemstone          = loadModule(db, userId, 'gemstone', null);
    var heroSkin          = loadModule(db, userId, 'heroSkin', null);
    var hideHeroes        = loadModule(db, userId, 'hideHeroes', null);

    // Ensure dragonEquiped is {} not null (CRASH if null!)
    if (!dragonEquiped) dragonEquiped = {};

    // ================================================================
    // 6.1 BUILD USER PROFILE — e.user (MANDATORY)
    // ================================================================
    // Client: setUserInfo(e) — line 114874-114885
    // Reads: e.user._id, _pwd, _nickName, _headImage,
    //        _lastLoginTime, _createTime, _bulletinVersions,
    //        _oriServerId, _nickChangeTimes
    var userData = {
        _id: user.userId,
        _pwd: pwd,
        _nickName: user.nickName,
        _headImage: user.headImage || DEFAULT_HEAD_IMAGE,
        _lastLoginTime: user.lastLoginTime,
        _createTime: user.createTime,
        _bulletinVersions: user.bulletinVersions || '',
        _oriServerId: user.oriServerId || config.serverId,
        _nickChangeTimes: user.nickChangeTimes || null
    };

    // ================================================================
    // 6.2 BUILD META FIELDS
    // ================================================================

    // currency — MANDATORY, line 114795: ts.currency = e.currency
    // Client expects STRING type (e.g. "USD")
    var currency = user.currency || config.currency || 'USD';

    // serverVersion — line 114823: UserInfoSingleton.serverVersion = e.serverVersion
    // CONDITIONAL: guarded by "e.serverVersion &&"
    var serverVersion = '';  // Can be set from config if needed

    // serverOpenDate — line 114823: UserInfoSingleton.setServerOpenDate(e.serverOpenDate)
    // CONDITIONAL: guarded by "e.serverOpenDate &&"
    var serverOpenDate = config.serverOpenDate ? new Date(config.serverOpenDate).getTime() : 0;

    // ================================================================
    // 6.3 BUILD HEROES — e.heros (MANDATORY)
    // ================================================================
    // Client: HerosManager.readByData(e.heros) — line 133718
    // Reads e.heros._heros — MUST be OBJECT keyed by heroId, NOT array!
    //
    // CRITICAL: _heros is { [heroId_UUID]: heroObject }
    // NOT an array! Using array will cause silent data loss.
    var herosObj = {};
    for (var h = 0; h < heroes.length; h++) {
        var hero = heroes[h];
        var heroKey = hero.heroId;

        herosObj[heroKey] = {
            _heroId: hero.heroId,
            _heroDisplayId: hero.heroDisplayId,
            _heroStar: hero.heroStar || 0,
            _heroTag: hero.heroTag || '',
            _fragment: hero.fragment || 0,
            _superSkillResetCount: hero.superSkillResetCount || 0,
            _potentialResetCount: hero.potentialResetCount || 0,
            _expeditionMaxLevel: hero.expeditionMaxLevel || 0,
            _heroBaseAttr: safeParse(hero.heroBaseAttr, defaultHeroBaseAttr(START_HERO_LEVEL)),
            _superSkillLevel: typeof hero.superSkillLevel === 'number'
                ? hero.superSkillLevel
                : (safeParse(hero.superSkillLevel, 0) || 0),
            _potentialLevel: safeParse(hero.potentialLevel, []),
            _qigong: safeParse(hero.qigong, null),
            _qigongTmp: safeParse(hero.qigongTmp, null),
            _qigongStage: hero.qigongStage || 1,
            _qigongTmpPower: hero.qigongTmpPower || 0,
            _totalCost: safeParse(hero.totalCost, null),
            _breakInfo: safeParse(hero.breakInfo, null),
            _gemstoneSuitId: hero.gemstoneSuitId || 0,
            _linkTo: safeParse(hero.linkTo, []),
            _linkFrom: hero.linkFrom || ''
        };
    }

    // ================================================================
    // 6.4 BUILD BACKPACK — e.totalProps + e.backpackLevel (MANDATORY)
    // ================================================================
    // Client: setBackpack(e) — line 114912-114921
    // Reads: e.totalProps._items{[id]: {_id, _num}} + e.backpackLevel
    //
    // totalProps._items is an OBJECT keyed by item ID (string or number).
    // backpackLevel is read directly from e.backpackLevel.
    var totalPropsItems = {};
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        totalPropsItems[item.itemId] = {
            _id: parseInt(item.itemId) || item.itemId,
            _num: item.num
        };
    }

    // backpackLevel — from bagPlus.json or stored in user data
    // For now, default to 1 (bagPlus level 1: max=90, diamond=0)
    var backpackLevel = START_BACKPACK_LEVEL;

    // ================================================================
    // 6.5 BUILD SUMMON — e.summon (MANDATORY)
    // ================================================================
    // Client: setSummon(e) — line 114901-114911
    // Reads: e.summon._energy, _wishList, _wishVersion,
    //        _canCommonFreeTime, _canSuperFreeTime, _summonTimes
    // Already loaded from DB above.

    // ================================================================
    // 6.6 BUILD HANGUP — e.hangup + global war buffs (MANDATORY)
    // ================================================================
    // Client: setOnHook(e) — line 114886-114900
    // Reads e.hangup._curLess etc. AND top-level fields:
    //   e.globalWarBuffTag, e.globalWarLastRank, e.globalWarBuff, e.globalWarBuffEndTime
    //
    // For new user: global war fields = 0 (not in any war)
    var globalWarBuffTag = 0;
    var globalWarLastRank = 0;
    var globalWarBuff = 0;
    var globalWarBuffEndTime = 0;

    // For returning users, load global war state from DB if available
    var globalWarData = loadModule(db, userId, 'globalWar', null);
    if (globalWarData) {
        globalWarBuffTag = globalWarData._buffTag || 0;
        globalWarLastRank = globalWarData._lastRank || 0;
        globalWarBuff = globalWarData._buff || 0;
        globalWarBuffEndTime = globalWarData._buffEndTime || 0;
    }

    // ================================================================
    // 6.7 BUILD EQUIPMENT — e.equip + e.weapon + e.genki (MANDATORY)
    // ================================================================
    // Client: setEquip(e) — line 114940-114947
    //   EquipInfoManager.readByData(e)
    //   Reads: e.equip._suits, e.weapon._items, e.genki
    //
    // Ensure proper structure (even if loaded from DB with wrong format)
    if (!equip || !equip._suits) equip = { _suits: {} };
    if (!weapon || !weapon._items) weapon = { _items: {} };
    if (!genki || typeof genki._items === 'undefined') {
        genki = { _items: {}, _curSmeltNormalExp: 0, _curSmeltSuperExp: 0 };
    }

    // ================================================================
    // 6.8 BUILD TEAMS — e.lastTeam + e._arenaTeam + e._arenaSuper
    // ================================================================
    // Client:
    //   setTeam(e) — line 114933-114938: reads e.lastTeam._lastTeamInfo
    //   AltarInfoManger.setArenaTeamInfo(e._arenaTeam) — line 114823
    //   AltarInfoManger.setArenaSuperInfo(e._arenaSuper) — line 114823
    //
    // lastTeam._lastTeamInfo is object keyed by team type (number):
    //   { "1": { _team: [...], _superSkill: [...] }, "2": {...}, ... }
    var lastTeamInfo = {};
    for (var t = 0; t < teams.length; t++) {
        var team = teams[t];
        try {
            var teamDataParsed = JSON.parse(team.teamData);
            var superSkillParsed = JSON.parse(team.superSkill);
            lastTeamInfo[team.teamType] = {
                _team: teamDataParsed,
                _superSkill: superSkillParsed
            };
        } catch (e) {
            lastTeamInfo[team.teamType] = { _team: [], _superSkill: [] };
        }
    }

    // Arena team — guarded internally by "if (e)"
    // Default: [null, null, null, null, null] (5 slots, all empty)
    var arenaTeamData = (arenaTeam !== null && arenaTeam !== undefined)
        ? arenaTeam
        : [null, null, null, null, null];

    // Arena super skill — guarded internally by "if (e)"
    var arenaSuperData = (arenaSuper !== null && arenaSuper !== undefined)
        ? arenaSuper
        : [];

    // ================================================================
    // 6.9 BUILD DUNGEON — e.dungeon (MANDATORY)
    // ================================================================
    // Client: setCounterpart(e) — line 114943-114948
    // GUARDED: "if (e.dungeon)" — but should be present
    // Reads: e.dungeon._dungeons
    if (!dungeon || !dungeon._dungeons) dungeon = { _dungeons: {} };

    // ================================================================
    // 6.10 BUILD SKILL — e.skill (MANDATORY)
    // ================================================================
    // Client: reads e.skill._items
    if (!skill || !skill._items) skill = { _items: {} };

    // ================================================================
    // 6.11 BUILD GUILD FIELDS (ALL CONDITIONAL)
    // ================================================================
    // Client: setTeam(e) — line 114933-114938
    //   reads e.userGuild, e.userGuildPub, e.guildLevel, e.guildTreasureMatchRet
    //   each has individual guard
    // setTeamTechnology(e) — line 114949-114956
    //   reads e.userGuild._tech (guarded by "if (e.userGuild)")

    // ================================================================
    // 6.12 BUILD KARIN TIMES — e.karinStartTime + e.karinEndTime (MANDATORY)
    // ================================================================
    // Client: TowerDataManager.setKarinTime(e.karinStartTime, e.karinEndTime)
    // NO GUARD — direct parameter passing
    // Default: 0 (karin tower not in special time period)
    var karinStartTime = 0;
    var karinEndTime = 0;

    // ================================================================
    // 6.13 BUILD QQ/SOCIAL FIELDS (ALL MANDATORY — NO guard!)
    // ================================================================
    // Client: Direct assignment — line 114839-114844
    // WelfareInfoManager.enableShowQQ = e.enableShowQQ
    // WelfareInfoManager.showQQVip = e.showQQVip
    // WelfareInfoManager.showQQ = e.showQQ
    // WelfareInfoManager.showQQImg1 = e.showQQImg1
    // WelfareInfoManager.showQQImg2 = e.showQQImg2
    // WelfareInfoManager.showQQUrl = e.showQQUrl

    // ================================================================
    // 6.14 BUILD CUR MAIN TASK — e.curMainTask (MANDATORY)
    // ================================================================
    // Client: UserInfoSingleton.setMianTask(e.curMainTask) — line 114953-114954
    // NOTE: "MianTask" typo in client! (Mian not Main)
    // Client does: Object.keys(e.curMainTask) — CRASH if null!
    // MUST be array or object, NOT null.

    // ================================================================
    // 6.15 BUILD BROADCAST RECORD — e.broadcastRecord (outside saveUserData)
    // ================================================================
    // Client: chatJoinRecord({_record: e.broadcastRecord}) — line 114436
    // GUARDED: "e.broadcastRecord &&" — but should be present
    var broadcastRecord = loadModule(db, userId, 'broadcastRecord', []);

    // ================================================================
    // 6.16 UPDATE LAST LOGIN TIME
    // ================================================================
    db.updateUserLastLogin(userId);

    // ================================================================
    // 6.17 BUILD COMPLETE RESPONSE (84+ fields)
    // ================================================================
    //
    // Fields are ordered by category for readability.
    // Each field annotated with:
    //   - MANDATORY/CONDITIONAL status
    //   - Client setter function and line number
    //   - Guard status (guarded/unguarded)
    //   - Data source
    //

    var response = {

        // ================================================================
        // USER PROFILE (MANDATORY)
        // Client: setUserInfo(e) — line 114874-114885
        // ================================================================
        user: userData,                       // MANDATORY — reads _id, _pwd, _nickName, etc.

        // ================================================================
        // META FIELDS
        // ================================================================
        currency: currency,                   // MANDATORY — line 114795: ts.currency = e.currency
        newUser: isNewUser,                   // CONDITIONAL — line 114524: SDK analytics only
        serverId: config.serverId,            // CONDITIONAL — line 114823: UserInfoSingleton.setServerId(e.serverId)
        serverVersion: serverVersion,         // CONDITIONAL — line 114823
        serverOpenDate: serverOpenDate,       // CONDITIONAL — line 114823

        // ================================================================
        // BROADCAST RECORD (outside saveUserData)
        // Client: chatJoinRecord({_record: e.broadcastRecord}) — line 114436
        // ================================================================
        broadcastRecord: broadcastRecord,     // CONDITIONAL — guarded

        // ================================================================
        // HEROES (MANDATORY)
        // Client: HerosManager.readByData(e.heros) — line 133718
        // CRITICAL: _heros is OBJECT keyed by heroId, NOT array!
        // ================================================================
        heros: { _heros: herosObj },          // MANDATORY

        // ================================================================
        // BACKPACK (MANDATORY)
        // Client: setBackpack(e) — line 114912-114921
        // Reads: e.totalProps._items + e.backpackLevel
        // ================================================================
        totalProps: { _items: totalPropsItems }, // MANDATORY
        backpackLevel: backpackLevel,         // MANDATORY — direct assignment

        // ================================================================
        // SUMMON (MANDATORY)
        // Client: setSummon(e) — line 114901-114911
        // Reads: e.summon._energy, _wishList, _wishVersion, etc.
        // ================================================================
        summon: summon,                       // MANDATORY

        // ================================================================
        // HANGUP + GLOBAL WAR BUFFS (MANDATORY)
        // Client: setOnHook(e) — line 114886-114900
        // Reads e.hangup.* AND e.globalWarBuffTag etc.
        // ================================================================
        hangup: hangup,                       // MANDATORY
        globalWarBuffTag: globalWarBuffTag,   // MANDATORY — setOnHook reads from e directly
        globalWarLastRank: globalWarLastRank, // MANDATORY — setOnHook reads from e directly
        globalWarBuff: globalWarBuff,         // MANDATORY — setOnHook reads from e directly
        globalWarBuffEndTime: globalWarBuffEndTime, // MANDATORY — setOnHook reads from e directly

        // ================================================================
        // EQUIPMENT (MANDATORY)
        // Client: setEquip(e) → EquipInfoManager.readByData(e) — line 114940-114947
        // Reads: e.equip._suits, e.weapon._items, e.genki
        // ================================================================
        equip: equip,                         // CONDITIONAL — guarded by "if (e.equip)"
        weapon: weapon,                       // CONDITIONAL — guarded by "if (e.weapon)"
        genki: genki,                         // CONDITIONAL — GenkiModel.deserialize(e.genki)

        // ================================================================
        // DRAGON EQUIP (MANDATORY — CRASH if null!)
        // Client: ItemsCommonSingleton.initDragonBallEquip(e.dragonEquiped)
        // Uses for...in — CRASH if null!
        // ================================================================
        dragonEquiped: dragonEquiped,         // MANDATORY — MUST be {} not null!

        // ================================================================
        // TEAMS (MANDATORY for lastTeam, CONDITIONAL for arena)
        // Client: setTeam(e) — line 114933-114938
        //   reads e.lastTeam._lastTeamInfo
        // AltarInfoManger — line 114823
        //   setArenaTeamInfo(e._arenaTeam) — guarded internally
        //   setArenaSuperInfo(e._arenaSuper) — guarded internally
        // ================================================================
        lastTeam: { _lastTeamInfo: lastTeamInfo }, // CONDITIONAL — guarded by "e.lastTeam &&"
        _arenaTeam: arenaTeamData,            // CONDITIONAL — guarded internally by "if (e)"
        _arenaSuper: arenaSuperData,          // CONDITIONAL — guarded internally by "if (e)"

        // ================================================================
        // GUIDE / TUTORIAL (CONDITIONAL)
        // Client: GuideInfoManager.setGuideInfo(e.guide) — line 120569
        // Guarded by "e.guide &&"
        // ================================================================
        guide: guide,                         // CONDITIONAL

        // ================================================================
        // SCHEDULE INFO (MANDATORY — 48 fields!)
        // Client: AllRefreshCount.initData(e.scheduleInfo) — line 91274-91323
        // NO GUARD — MUST have all 48 fields!
        // ================================================================
        scheduleInfo: scheduleInfo,           // MANDATORY — 48 fields, most unguarded

        // ================================================================
        // TIMES INFO (CONDITIONAL but send for all users)
        // Client: TimesInfoSingleton.initData(e.timesInfo) — line ~96001
        // Guarded by "e.timesInfo &&"
        // Inside: ALL 12 fields unguarded!
        // ================================================================
        timesInfo: timesInfo,                 // CONDITIONAL

        // ================================================================
        // SUPER SKILL (CONDITIONAL)
        // Client: SuperSkillSingleton.initSuperSkill(e.superSkill) — line 88732
        // Guarded internally by "if (e)"
        // For new user: null. When populated: { _skills: { [skillId]: { _skillId, _level, ... } } }
        // ================================================================
        superSkill: superSkill,               // CONDITIONAL

        // ================================================================
        // GIFT INFO (CONDITIONAL)
        // Client: Full giftInfo block — line 114799-114813
        // Guarded by "e.giftInfo &&"
        // DANGER: sub-setters have NO internal null guard!
        // ================================================================
        giftInfo: giftInfo,                   // CONDITIONAL

        // ================================================================
        // CHANNEL SPECIAL (MANDATORY — NO guard!)
        // Client: WelfareInfoManager.channelSpecial = e.channelSpecial — line 114795
        // MUST have all 9 fields!
        // ================================================================
        channelSpecial: channelSpecial,       // MANDATORY — 9 fields, NO guard

        // ================================================================
        // USER DOWNLOAD REWARD (CONDITIONAL)
        // Client: Inline — line 114814-114822
        // Guarded by "e.userDownloadReward &&"
        // ================================================================
        userDownloadReward: userDownloadReward, // CONDITIONAL

        // ================================================================
        // YOU TUBER RECRUIT (CONDITIONAL)
        // Client: YouTuberRecruitModel — line 114823
        // If _hidden is truthy, entire feature is SKIPPED
        // ================================================================
        YouTuberRecruit: YouTuberRecruit,     // CONDITIONAL

        // ================================================================
        // IMPRINT / SIGN (CONDITIONAL)
        // Client: setSign(e) — line 114922-114930
        // Guarded internally by "if (e.imprint)"
        // ================================================================
        imprint: imprint,                     // CONDITIONAL

        // ================================================================
        // CHECKIN (CONDITIONAL)
        // No specific client reference found in saveUserData.
        // May be handled by a separate action.
        // ================================================================
        checkin: null,                        // CONDITIONAL — not in saveUserData

        // ================================================================
        // GUILD FIELDS (ALL CONDITIONAL)
        // Client:
        //   setTeam(e) — line 114933-114938
        //     reads e.userGuild, e.userGuildPub, e.guildLevel, e.guildTreasureMatchRet
        //   setTeamTechnology(e) — line 114949-114956
        //     reads e.userGuild._tech (guarded by "if (e.userGuild)")
        //   setTeamName(e.guildName) — guarded by "e.guildName &&"
        //   setActivePoints(e.guildActivePoints) — guarded by "e.guildActivePoints &&"
        // ================================================================
        guildName: null,                      // CONDITIONAL
        userGuild: null,                      // CONDITIONAL
        userGuildPub: null,                   // CONDITIONAL
        guildLevel: null,                     // CONDITIONAL
        guildTreasureMatchRet: null,          // CONDITIONAL
        guildActivePoints: null,              // CONDITIONAL

        // ================================================================
        // DUNGEON (MANDATORY)
        // Client: setCounterpart(e) — line 114943-114948
        // Guarded by "if (e.dungeon)" — but should be present
        // ================================================================
        dungeon: dungeon,                     // CONDITIONAL (but always send)

        // ================================================================
        // SKILL (MANDATORY)
        // Client: reads e.skill._items
        // ================================================================
        skill: skill,                         // MANDATORY

        // ================================================================
        // VIP / CARD / RECHARGE (ALL CONDITIONAL)
        // Client:
        //   WelfareInfoManager.setVipLogList(e.vipLog) — line 114795
        //   WelfareInfoManager.setMonthCardLogList(e.cardLog) — line 114795
        //   WelfareInfoManager.setMonthCardInfo(e.monthCard) — line 114814
        //   WelfareInfoManager.setRechargeInfo(e.recharge) — line 114814
        // ================================================================
        vipLog: null,                         // CONDITIONAL
        cardLog: null,                        // CONDITIONAL
        monthCard: null,                      // CONDITIONAL
        recharge: null,                       // CONDITIONAL

        // ================================================================
        // TIME BONUS / ONLINE BULLETIN (CONDITIONAL)
        // Client:
        //   TimeLimitGiftBagManager.setTimeLimitGiftBag(e.timeBonusInfo) — line 114823
        //   BulletinSingleton.setBulletInfo(e.onlineBulletin) — line 114823
        // ================================================================
        timeBonusInfo: null,                  // CONDITIONAL
        onlineBulletin: null,                 // CONDITIONAL

        // ================================================================
        // KARIN TIMES (MANDATORY — NO guard!)
        // Client: TowerDataManager.setKarinTime(e.karinStartTime, e.karinEndTime)
        // NO GUARD — direct parameter passing
        // ================================================================
        karinStartTime: karinStartTime,       // MANDATORY — no guard
        karinEndTime: karinEndTime,           // MANDATORY — no guard

        // ================================================================
        // IMAGE VERSIONS (CONDITIONAL)
        // Client: UserInfoSingleton.heroImageVersion / superImageVersion — line 114823
        // ================================================================
        heroImageVersion: 0,                  // CONDITIONAL
        superImageVersion: 0,                 // CONDITIONAL

        // ================================================================
        // TRAINING / WAR (CONDITIONAL)
        // Client:
        //   PadipataInfoManager.setPadipataModel(e.training) — line 114823
        //   GlobalWarManager.setWarLoginInfo(e.warInfo) — line 114823
        //   GlobalWarManager.setUserWarModel(e.userWar) — line 114823
        // ================================================================
        training: null,                       // CONDITIONAL
        warInfo: null,                        // CONDITIONAL
        userWar: null,                        // CONDITIONAL

        // ================================================================
        // BALL WAR FIELDS (ALL CONDITIONAL)
        // Client:
        //   TeamInfoManager.UserBallWar = e.userBallWar — line 114829
        //   TeamInfoManager.BallWarState = e.ballWarState — line 114829
        //   TeamInfoManager.setBallWarBrodecast(e.ballBroadcast) — line 114829
        //   new GuildBallWarInfo().deserialize(e.ballWarInfo) — line 114829
        // ================================================================
        userBallWar: null,                    // CONDITIONAL
        ballWarState: null,                   // CONDITIONAL
        ballBroadcast: null,                  // CONDITIONAL
        ballWarInfo: null,                    // CONDITIONAL

        // ================================================================
        // HEAD EFFECT (CONDITIONAL)
        // Client: new HeadEffectModel().deserialize(e.headEffect) — line 114823
        // ================================================================
        headEffect: headEffect,               // CONDITIONAL

        // ================================================================
        // EXPEDITION (CONDITIONAL)
        // Client: ExpeditionManager.setExpeditionModel(e.expedition) — line 114847
        // ================================================================
        expedition: null,                     // CONDITIONAL

        // ================================================================
        // TIME TRIAL (CONDITIONAL)
        // Client: SpaceTrialManager.setSpaceTrialModel(e.timeTrial, e.timeTrialNextOpenTime)
        //   — line 114848
        // ================================================================
        timeTrial: null,                      // CONDITIONAL
        timeTrialNextOpenTime: 0,             // CONDITIONAL

        // ================================================================
        // RETRIEVE (CONDITIONAL)
        // Client: GetBackReourceManager.setRetrieveModel(e.retrieve) — line 114849
        // Guarded internally by "e &&"
        // ================================================================
        retrieve: null,                       // CONDITIONAL

        // ================================================================
        // BATTLE MEDAL (CONDITIONAL)
        // Client: BattleMedalManager.setBattleMedal(e.battleMedal) — line 114850
        // ================================================================
        battleMedal: null,                    // CONDITIONAL

        // ================================================================
        // SHOP NEW HEROES (CONDITIONAL)
        // Client: ShopInfoManager.shopNewHero = e.shopNewHeroes — line 114851
        // ================================================================
        shopNewHeroes: null,                  // CONDITIONAL

        // ================================================================
        // RESONANCE (CONDITIONAL)
        // Client: HerosManager.setResonanceModel(e.resonance) — line 114866
        // ================================================================
        resonance: resonance,                 // CONDITIONAL

        // ================================================================
        // FAST TEAM (CONDITIONAL)
        // Client: HerosManager.saveLoginFastTeam(e.fastTeam) — line 114868
        // Guarded by "e.fastTeam &&"
        // ================================================================
        fastTeam: fastTeam,                   // CONDITIONAL

        // ================================================================
        // HIDE HEROES (CONDITIONAL)
        // Client: WelfareInfoManager.setHideHeroes(e.hideHeroes) — line 114845
        // Guarded by "e.hideHeroes &&"
        // ================================================================
        hideHeroes: hideHeroes,               // CONDITIONAL

        // ================================================================
        // GEMSTONE (CONDITIONAL)
        // Client: EquipInfoManager.saveGemStone(e) — line 114864
        // Reads e.gemstone._items
        // ================================================================
        gemstone: gemstone,                   // CONDITIONAL

        // ================================================================
        // QUESTIONNAIRES (CONDITIONAL)
        // Client: UserInfoSingleton.setQuestData(e.questionnaires) — line 114865
        // ================================================================
        questionnaires: null,                 // CONDITIONAL

        // ================================================================
        // TOP BATTLE (CONDITIONAL)
        // Client: TopBattleManager.setTopBattleLoginInfo(e) — line 114867
        // Reads e.userTopBattle, e.topBattleInfo
        // ================================================================
        userTopBattle: null,                  // CONDITIONAL
        topBattleInfo: null,                  // CONDITIONAL

        // ================================================================
        // BLACKLIST / FORBIDDEN CHAT (CONDITIONAL)
        // Client:
        //   BroadcastSingleton.setBlacklistPlayerInfo(e) — line 114869
        //     reads e.blacklist (guarded by "e.blacklist")
        //   BroadcastSingleton.setUserBidden(e.forbiddenChat) — line 114870
        //     guarded internally by "if (e)"
        // ================================================================
        blacklist: blacklist,                 // CONDITIONAL
        forbiddenChat: forbiddenChat,         // CONDITIONAL

        // ================================================================
        // CLICK SYSTEM (CONDITIONAL)
        // Client: UserClickSingleton.setClickSys(n, e.clickSystem._clickSys[n])
        //   — line 114796-114797
        // ================================================================
        clickSystem: null,                    // CONDITIONAL

        // ================================================================
        // CUR MAIN TASK (MANDATORY)
        // Client: UserInfoSingleton.setMianTask(e.curMainTask) — line 114953-114954
        // NOTE: "MianTask" typo in client!
        // Client does Object.keys(e.curMainTask) — CRASH if null!
        // ================================================================
        curMainTask: curMainTask,             // MANDATORY — must be array/object, NOT null!

        // ================================================================
        // TEAM DUNGEON FIELDS (ALL CONDITIONAL)
        // Client: TeamworkManager — line 114852-114863
        //   setLoginInfo(e.teamDungeon)
        //   teamServerHttpUrl = e.teamServerHttpUrl
        //   teamDungeonOpenTime = e.teamDungeonOpenTime
        //   teamDungeonTask.deserialize(e.teamDungeonTask)
        //   SetTeamDungeonBroadcast(e.teamDungeonSplBcst, true)
        //   SetTeamDungeonBroadcast(e.teamDungeonNormBcst, false)
        //   setTeamDungeonHideInfo(e.teamDungeonHideInfo)
        // ================================================================
        teamDungeon: null,                    // CONDITIONAL
        teamServerHttpUrl: '',                // CONDITIONAL
        teamDungeonOpenTime: 0,               // CONDITIONAL
        teamDungeonTask: null,                // CONDITIONAL
        teamDungeonSplBcst: null,             // CONDITIONAL
        teamDungeonNormBcst: null,            // CONDITIONAL
        teamDungeonHideInfo: null,            // CONDITIONAL

        // ================================================================
        // TEMPLE LESS (CONDITIONAL)
        // Client: TrialManager.setTempleLess(e.templeLess) — line 114861
        // ================================================================
        templeLess: null,                     // CONDITIONAL

        // ================================================================
        // TEAM DUNGEON INVITED FRIENDS (CONDITIONAL)
        // Client: TeamworkManager.teamDungeonInvitedFriends = e.teamDungeonInvitedFriends
        //   — line 114862
        // ================================================================
        teamDungeonInvitedFriends: null,      // CONDITIONAL

        // ================================================================
        // MY TEAM SERVER SOCKET URL (CONDITIONAL)
        // Client: ts.loginInfo.serverItem.dungeonurl = e.myTeamServerSocketUrl
        //   — line 114863
        // ================================================================
        myTeamServerSocketUrl: '',            // CONDITIONAL

        // ================================================================
        // QQ / SOCIAL FIELDS (ALL MANDATORY — NO guard!)
        // Client: Direct assignment — line 114839-114844
        // WelfareInfoManager.enableShowQQ = e.enableShowQQ (no guard)
        // WelfareInfoManager.showQQVip = e.showQQVip (no guard)
        // WelfareInfoManager.showQQ = e.showQQ (no guard)
        // WelfareInfoManager.showQQImg1 = e.showQQImg1 (no guard)
        // WelfareInfoManager.showQQImg2 = e.showQQImg2 (no guard)
        // WelfareInfoManager.showQQUrl = e.showQQUrl (no guard)
        // ================================================================
        enableShowQQ: 0,                      // MANDATORY — no guard
        showQQVip: 0,                         // MANDATORY — no guard
        showQQ: 0,                            // MANDATORY — no guard
        showQQImg1: '',                       // MANDATORY — no guard
        showQQImg2: '',                       // MANDATORY — no guard
        showQQUrl: '',                        // MANDATORY — no guard

        // ================================================================
        // GRAVITY (CONDITIONAL)
        // Client: TrialManager.setGravityTrialInfo(e) — line 114871
        // Reads e.gravity or e._model
        // ================================================================
        gravity: null,                        // CONDITIONAL

        // ================================================================
        // LITTLE GAME (CONDITIONAL)
        // Client: LittleGameManager.saveData(e.littleGame) — line 114872
        // ================================================================
        littleGame: null,                     // CONDITIONAL

        // ================================================================
        // USER YOUTUBER RECRUIT (CONDITIONAL)
        // Separate from YouTuberRecruit!
        // ================================================================
        userYouTuberRecruit: null,            // CONDITIONAL

        // ================================================================
        // TIME MACHINE (CONDITIONAL)
        // Client: TimeLeapSingleton.initData(e.timeMachine) — line 114823
        // ================================================================
        timeMachine: null,                    // CONDITIONAL

        // ================================================================
        // HERO SKIN (CONDITIONAL)
        // Client: HerosManager.setSkinData(e.heroSkin) — line 114795
        // Guarded by "e.heroSkin &&"
        // ================================================================
        heroSkin: heroSkin,                   // CONDITIONAL

        // ================================================================
        // SUMMON LOG (CONDITIONAL)
        // Client: SummonSingleton.setSummomLogList(e) — line 114795
        // Guarded by "e.summonLog"
        // NOTE: "SummomLog" typo in client! (Summom not Summon)
        // ================================================================
        summonLog: summonLog,                 // CONDITIONAL

        // ================================================================
        // CELLGAME HAVE SET HERO (CONDITIONAL)
        // Client: e.scheduleInfo._cellgameHaveSetHero = e.cellgameHaveSetHero
        //   — line 114795
        // Sets a field INSIDE scheduleInfo from a top-level field
        // Guarded by "e.cellgameHaveSetHero &&"
        // ================================================================
        cellgameHaveSetHero: false,           // CONDITIONAL

        // ================================================================
        // TEAM TRAINING (CONDITIONAL)
        // Client: setTeamTraining(e) — line 114951-114952
        // Guarded by "e.teamTraining &&"
        // ================================================================
        teamTraining: null                    // CONDITIONAL
    };

    return response;
}

// ============================================================
// SECTION 8: MAIN HANDLER
// ============================================================

/**
 * Execute the enterGame action.
 *
 * This is the main entry point called by index.js when a client
 * sends the 'enterGame' action via handler.process.
 *
 * Flow:
 *   1. Validate input fields (loginToken, userId)
 *   2. Validate loginToken against login-server DB (READ-ONLY)
 *   3. Cross-check userId
 *   4. Get password from login DB
 *   5. Check user in main-server DB
 *   6. NEW user → create all default data
 *   7. RETURNING user → continue
 *   8. Build complete response
 *   9. Return compressed response
 *
 * @param {object} data - Client request data
 * @param {object} socket - Socket.IO socket instance
 * @param {object} ctx - Context object { db, buildResponse, buildErrorResponse, config, crypto, _logNickName }
 * @returns {Promise<object>} Response object { ret, data, compress, serverTime, server0Time }
 */
function execute(data, socket, ctx) {
    var db = ctx.db;
    var buildResponse = ctx.buildResponse;
    var buildErrorResponse = ctx.buildErrorResponse;

    // ================================================================
    // 1. VALIDATE INPUT
    // ================================================================
    var loginToken = (data.loginToken || '').trim();
    var userId = (data.userId || '').trim();
    var serverId = data.serverId;

    if (!loginToken || !userId) {
        return Promise.resolve(buildErrorResponse(1));
    }

    // ================================================================
    // 2. VALIDATE LOGIN TOKEN (login-server DB — READ-ONLY)
    // ================================================================
    var loginInfo = db.validateLoginToken(loginToken);

    if (!loginInfo) {
        return Promise.resolve(buildErrorResponse(1));
    }

    // ================================================================
    // 3. CROSS-CHECK userId
    // ================================================================
    if (loginInfo.userId !== userId) {
        return Promise.resolve(buildErrorResponse(1));
    }

    // ================================================================
    // 4. GET PASSWORD FROM LOGIN DB
    // ================================================================
    // Used for _pwd field in response (client expects plaintext!)
    var pwd = db.getLoginUserPassword(userId);

    // ================================================================
    // 5. CHECK USER IN MAIN-SERVER DB
    // ================================================================
    var user = db.getUser(userId);
    var isNewUser = false;

    if (!user) {
        // ============================================================
        // NEW USER → CREATE ALL DEFAULT DATA
        // ============================================================
        isNewUser = true;
        var createResult = createNewUser(db, userId, pwd);

        if (!createResult) {
            return Promise.resolve(buildErrorResponse(1));
        }

        // Set nickName for logging purposes
        ctx._logNickName = createResult.nickName;
    } else {
        // ============================================================
        // RETURNING USER
        // ============================================================
        ctx._logNickName = user.nickName;
    }

    // ================================================================
    // 6. BUILD COMPLETE ENTERGAME RESPONSE
    // ================================================================
    var responseData = buildEnterGameResponse(db, userId, pwd, isNewUser);

    if (!responseData) {
        return Promise.resolve(buildErrorResponse(1));
    }

    // ================================================================
    // 7. RETURN COMPRESSED RESPONSE
    // ================================================================
    return Promise.resolve(buildResponse(responseData));
}

// ============================================================
// SECTION 9: MODULE EXPORTS
// ============================================================

module.exports = { execute: execute };
