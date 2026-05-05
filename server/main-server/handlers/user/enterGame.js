/**
 * enterGame.js — user.enterGame Handler (COMPLETE REWRITE)
 *
 * The MOST CRITICAL handler in the Main-Server.
 * Response contains ALL ~97 fields the client needs.
 *
 * PRINCIPLES:
 * - Every field the client reads MUST be sent in exact wire format
 * - Default values from constant.json via jsonLoader, NOT hardcoded
 * - Response structure follows client parser UserDataParser.saveUserData()
 * - Serializable fields: all keys use _ prefix
 * - timesInfo and forbiddenChat: NO _ prefix
 * - null vs {} vs [] matters — follow specification
 *
 * Request: { type:'user', action:'enterGame', loginToken, userId, serverId, version, language, gameVersion }
 * Response: Full user data (~97 fields) via responseHelper.buildSuccess()
 */

const http = require('http');
const db = require('../../db');
const jsonLoader = require('../../jsonLoader');
const responseHelper = require('../../responseHelper');
const logger = require('../../logger');

// ═══════════════════════════════════════════════════════════════
// SDK-SERVER API HELPER
// ═══════════════════════════════════════════════════════════════

/**
 * Validate loginToken via SDK-Server /auth/validate
 * @param {string} loginToken
 * @param {string} userId
 * @returns {Promise<object>} { valid, sign, securityCode, loginToken }
 */
function validateWithSDKServer(loginToken, userId) {
    return new Promise((resolve) => {
        const payload = JSON.stringify({ loginToken, userId });
        const startTime = Date.now();

        const options = {
            hostname: '127.0.0.1',
            port: 9999,
            path: '/auth/validate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                try {
                    const data = JSON.parse(body);
                    logger.log('INFO', 'SDKAPI', 'SDK-Server /auth/validate response');
                    logger.details('data',
                        ['userId', userId],
                        ['valid', String(data.valid)],
                        ['duration', duration + 'ms']
                    );
                    resolve(data);
                } catch (err) {
                    logger.log('ERROR', 'SDKAPI', 'SDK-Server response parse error');
                    resolve({ valid: false, loginToken: '', securityCode: '' });
                }
            });
        });

        req.on('error', (err) => {
            logger.log('ERROR', 'SDKAPI', 'SDK-Server /auth/validate failed');
            resolve({ valid: false, loginToken: '', securityCode: '' });
        });

        req.on('timeout', () => {
            req.destroy();
        });

        req.write(payload);
        req.end();
    });
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Safe JSON parse
// ═══════════════════════════════════════════════════════════════

function safeParse(str, fallback) {
    if (str === null || str === undefined) return fallback;
    if (typeof str === 'object') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Read constant.json key "1" values
// ═══════════════════════════════════════════════════════════════

function getConstant() {
    return (jsonLoader.get('constant') || {})['1'] || {};
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build default totalProps._items for new user
// Item IDs from thingsID.json: 101=diamond, 102=gold, 103=playerExp, 105=vipExp
// ═══════════════════════════════════════════════════════════════

function buildDefaultTotalPropsItems(c1) {
    const startDiamond = Number(c1.startDiamond || 0);
    const startGold = Number(c1.startGold || 0);
    return {
        "0": { _id: 101, _num: startDiamond },
        "1": { _id: 102, _num: startGold },
        "2": { _id: 103, _num: 0 },
        "3": { _id: 105, _num: 0 }
    };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build starting hero for new user from hero.json config
// Field 8: heros — HeroDataModel wire format
// Parser: HerosManager.readByData → SetHeroDataToModel
// ═══════════════════════════════════════════════════════════════

function buildStartingHero(heroId, heroConfig, startHeroLevel) {
    const id = String(heroId);
    return {
        _heroId: id,
        _heroDisplayId: Number(heroId),
        _heroLevel: Number(startHeroLevel) || 3,
        _heroQuality: 1,
        _heroEvolveLevel: 0,
        _heroStar: Number(startHeroLevel) || 0,
        _heroSkinId: 0,
        _heroActiveSkill: {},
        _heroQigongLevel: 0,
        _heroSelfBreakLevel: 0,
        _heroSelfBreakType: 0,
        _heroConnectHeroId: 0,
        _heroPosition: 0,
        _heroPower: 0,
        _expeditionMaxLevel: 0,
        _heroTag: '',
        _fragment: 0,
        _superSkillResetCount: 0,
        _potentialResetCount: 0,
        _heroBaseAttr: {
            _hp: 0, _attack: 0, _armor: 0, _speed: 0,
            _hit: 0, _dodge: 0, _block: 0, _damageReduce: 0,
            _armorBreak: 0, _controlResist: 0, _skillDamage: 0,
            _criticalDamage: 0, _blockEffect: 0, _critical: 0,
            _criticalResist: 0, _trueDamage: 0, _energy: 0,
            _power: 0, _extraArmor: 0, _hpPercent: 0,
            _armorPercent: 0, _attackPercent: 0, _speedPercent: 0,
            _orghp: 0, _superDamage: 0, _healPlus: 0,
            _healerPlus: 0, _damageDown: 0, _shielderPlus: 0,
            _damageUp: 0, _level: 1, _evolveLevel: 0,
            _maxlevel: 0, _talent: 0
        },
        _superSkillLevel: {},
        _potentialLevel: {},
        _qigongStage: 1,
        _qigong: null,
        _qigongTmp: null,
        _qigongTmpPower: 0,
        _totalCost: { _items: [] },
        _breakInfo: null,
        _gemstoneSuitId: 0,
        _linkTo: null,
        _linkFrom: null
    };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build hero wire format from DB hero_data row
// ═══════════════════════════════════════════════════════════════

function buildHeroFromDB(h) {
    return {
        _heroId: String(h.id),
        _heroDisplayId: h.displayId,
        _heroLevel: h.level,
        _heroQuality: h.quality,
        _heroEvolveLevel: h.evolveLevel,
        _heroStar: h.star,
        _heroSkinId: h.skinId,
        _heroActiveSkill: safeParse(h.activeSkill, {}),
        _heroQigongLevel: h.qigongLevel,
        _heroSelfBreakLevel: h.selfBreakLevel,
        _heroSelfBreakType: h.selfBreakType,
        _heroConnectHeroId: h.connectHeroId,
        _heroPosition: h.position,
        _heroPower: h.power,
        _expeditionMaxLevel: 0,
        _heroTag: '',
        _fragment: 0,
        _superSkillResetCount: 0,
        _potentialResetCount: 0,
        _heroBaseAttr: {
            _hp: 0, _attack: 0, _armor: 0, _speed: 0,
            _hit: 0, _dodge: 0, _block: 0, _damageReduce: 0,
            _armorBreak: 0, _controlResist: 0, _skillDamage: 0,
            _criticalDamage: 0, _blockEffect: 0, _critical: 0,
            _criticalResist: 0, _trueDamage: 0, _energy: 0,
            _power: 0, _extraArmor: 0, _hpPercent: 0,
            _armorPercent: 0, _attackPercent: 0, _speedPercent: 0,
            _orghp: 0, _superDamage: 0, _healPlus: 0,
            _healerPlus: 0, _damageDown: 0, _shielderPlus: 0,
            _damageUp: 0, _level: h.level || 1, _evolveLevel: h.evolveLevel || 0,
            _maxlevel: 0, _talent: 0
        },
        _superSkillLevel: {},
        _potentialLevel: {},
        _qigongStage: 1,
        _qigong: null,
        _qigongTmp: null,
        _qigongTmpPower: 0,
        _totalCost: { _items: [] },
        _breakInfo: null,
        _gemstoneSuitId: 0,
        _linkTo: null,
        _linkFrom: null
    };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build default dungeon._dungeons — KEYED BY DUNGEON TYPE
// Client iterates: for(var n in e) e[n]._type == DUNGEON_TYPE.xxx
// MUST be keyed object, NOT array
// ═══════════════════════════════════════════════════════════════

function buildDefaultDungeons(c1) {
    const _dungeons = {};
    for (let type = 1; type <= 8; type++) {
        _dungeons[String(type)] = {
            _dungeonType: type,
            _level: 0,
            _sweepLevel: 0,
            _times: 0,
            _buyTimes: 0
        };
    }
    return { _dungeons: _dungeons };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build default scheduleInfo from constant.json
// Field 9: scheduleInfo — AllRefreshCount with _ prefix
// Default values from constant.json key "1"
// ═══════════════════════════════════════════════════════════════

function buildDefaultScheduleInfo(c1) {
    return {
        _arenaAttackTimes: Number(c1.arenaAttackTimes || 5),
        _arenaBuyTimesCount: 0,
        _strongEnemyTimes: Number(c1.bossAttackTimes || 6),
        _strongEnemyBuyCount: 0,
        _karinTowerBattleTimes: Number(c1.karinTowerBattleTimes || 10),
        _karinBuyBattleTimesCount: 0,
        _cellGameHaveGotReward: false,
        _cellGameHaveTimes: Number(c1.cellGameTimes || 1),
        _cellgameHaveSetHero: false,
        _bossAttackTimes: Number(c1.bossAttackTimes || 6),
        _bossCptBuyCount: 0,
        _guildBossTimes: Number(c1.guildBOSSTimes || 2),
        _guildBossTimesBuyCount: 0,
        _treasureTimes: Number(c1.guildGrabTimes || 3),
        _mahaAttackTimes: Number(c1.mahaAdventureTimesMax || 5),
        _mahaBuyTimesCount: 0,
        _bossCptTimes: Number(c1.bossFightTimesMax || 3),
        _ballWarBuyCount: 0,
        _topBattleTimes: 0,
        _topBattleBuyCount: 0,
        _dungeonTimes: {},
        _dungeonBuyTimesCount: {},
        _marketDiamondRefreshCount: 0,
        _vipMarketDiamondRefreshCount: 0,
        _karinBuyFeetCount: 0,
        _monthCardHaveGotReward: {},
        _entrustResetTimes: 0,
        _mineResetTimes: 0,
        _mineBuyResetTimesCount: 0,
        _mineBuyStepCount: 0,
        _guildCheckInType: 0,
        _dragonExchangeSSPoolId: 0,
        _dragonExchangeSSSPoolId: 0,
        _teamDugeonUsedRobots: [],
        _timeTrialBuyTimesCount: 0,
        _goldBuyCount: 0,
        _likeRank: {},
        _templeBuyCount: 0,
        _trainingBuyCount: 0,
        _expeditionEvents: {},
        _clickExpedition: false,
        _expeditionSpeedUpCost: 0,
        _templeDailyReward: false,
        _templeYesterdayLess: 0,
        _snakeResetTimes: 0,
        _snakeSweepCount: 0,
        _mergeBossBuyCount: 0,
        _gravityTrialBuyTimesCount: 0
    };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build default timesInfo from constant.json
// Field 31: timesInfo — NO _ prefix on keys
// ═══════════════════════════════════════════════════════════════

function buildDefaultTimesInfo(c1) {
    return {
        _marketRefreshTimes: Number(c1.marketRefreshTimeMax || 5),
        _marketRefreshTimesRecover: 0,
        _vipMarketRefreshTimes: Number(c1.vipMarketRefreshTimeMax || 5),
        _vipMarketRefreshTimesRecover: 0,
        _templeTimes: Number(c1.templeTestTimes || 10),
        _templeTimesRecover: 0,
        _mahaTimes: Number(c1.mahaAdventureTimesMax || 5),
        _mahaTimesRecover: 0,
        _mineSteps: Number(c1.mineActionPointMax || 50),
        _mineStepsRecover: 0,
        _karinFeet: Number(c1.karinTowerFeet || 5),
        _karinFeetRecover: 0
    };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Merge stored data into defaults
// ═══════════════════════════════════════════════════════════════

function mergeScheduleInfo(stored, c1) {
    const defaults = buildDefaultScheduleInfo(c1);
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

function mergeTimesInfo(stored, c1) {
    const defaults = buildDefaultTimesInfo(c1);
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build ItemsDict from DB item_data rows
// totalProps._items format: { "0": {_id, _num}, "1": {_id, _num}, ... }
// ═══════════════════════════════════════════════════════════════

function buildItemsDict(items) {
    const _items = {};
    items.forEach((item, index) => {
        _items[String(index)] = { _id: item.itemId, _num: item.num };
    });
    return _items;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build HerosDict from DB hero_data rows
// heros._heros format: { "0": {...heroDataModel}, ... }
// ═══════════════════════════════════════════════════════════════

function buildHerosDict(heroes) {
    const _heros = {};
    heroes.forEach((h) => {
        _heros[String(h.id)] = buildHeroFromDB(h);
    });
    return _heros;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build EquipSuits from DB equip_data rows
// CRITICAL: keyed by heroId, NOT by equip auto-increment id!
// Structure: { "heroId": { _suitItems, _suitAttrs, _equipAttrs, _earrings, _weaponState } }
// ═══════════════════════════════════════════════════════════════

function buildEquipSuits(equips) {
    const _suits = {};
    equips.forEach((e) => {
        _suits[String(e.heroId)] = {
            _suitItems: safeParse(e.suitItems, []),
            _suitAttrs: safeParse(e.suitAttrs, []),
            _equipAttrs: safeParse(e.equipAttrs, []),
            _earrings: safeParse(e.earrings, { _id: 0, _level: 0, _attrs: { _items: [] } }),
            _weaponState: e.weaponState || 0
        };
    });
    return _suits;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build WeaponItems from DB weapon_data rows
// weapon._items format: { "0": { _weaponId, _displayId, _heroId, _star, _level, _attrs, ... }, ... }
// ═══════════════════════════════════════════════════════════════

function buildWeaponItems(weapons) {
    const _items = {};
    weapons.forEach((w, index) => {
        _items[String(index)] = {
            _weaponId: String(w.weaponId || w.id),
            _displayId: w.displayId || 0,
            _heroId: String(w.heroId || ''),
            _star: w.star || 0,
            _level: w.level || 1,
            _attrs: safeParse(w.attrs, { _items: [] }),
            _strengthenCost: safeParse(w.strengthenCost, { _items: [] }),
            _haloId: w.haloId || 0,
            _haloLevel: w.haloLevel || 0,
            _haloCost: safeParse(w.haloCost, { _items: [] })
        };
    });
    return _items;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build ImprintItems from DB imprint_data rows
// imprint._items format: { "0": { _id, _displayId, _heroId, _level, _star, _mainAttr, ... }, ... }
// ═══════════════════════════════════════════════════════════════

function buildImprintItems(imprints) {
    const _items = {};
    imprints.forEach((imp, index) => {
        _items[String(index)] = {
            _id: String(imp.imprintId || ''),
            _displayId: imp.displayId || 0,
            _heroId: String(imp.heroId || ''),
            _level: imp.level || 1,
            _star: imp.star || 0,
            _mainAttr: safeParse(imp.mainAttr, { _items: [] }),
            _starAttr: safeParse(imp.starAttr, { _items: [] }),
            _viceAttr: safeParse(imp.viceAttr, []),
            _totalCost: safeParse(imp.totalCost, []),
            _addAttr: safeParse(imp.addAttr, {}),
            _signType: imp.signType || 0,
            _part: imp.part || 0,
            _signQuality: imp.signQuality || 0
        };
    });
    return _items;
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build GenkiModel from DB genki_data rows
// FLAT structure: { _items: [...], _curSmeltNormalExp: 0, _curSmeltSuperExp: 0 }
// _items is an ARRAY, NOT keyed object
// ═══════════════════════════════════════════════════════════════

function buildGenkiModel(genkis) {
    const _items = genkis.map(g => ({
        _genkiId: g.genkiId,
        _heroId: g.heroId,
        _pos: g.pos
    }));
    return {
        _items: _items,
        _curSmeltNormalExp: 0,
        _curSmeltSuperExp: 0
    };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build DungeonModel from DB dungeon_data rows
// KEYED BY DUNGEON TYPE STRING: { "1": {_dungeonType, _level, _sweepLevel, _times, _buyTimes}, ... }
// ═══════════════════════════════════════════════════════════════

function buildDungeonModel(dungeons, c1) {
    const _dungeons = {};
    // First fill defaults for all 8 dungeon types
    for (let type = 1; type <= 8; type++) {
        _dungeons[String(type)] = {
            _dungeonType: type,
            _level: 0,
            _sweepLevel: 0,
            _times: 0,
            _buyTimes: 0
        };
    }
    // Override with actual data from DB
    if (dungeons && dungeons.length) {
        dungeons.forEach((d) => {
            _dungeons[String(d.dungeonType)] = {
                _dungeonType: d.dungeonType,
                _level: d.level || 0,
                _sweepLevel: d.sweepLevel || 0,
                _times: d.times || 0,
                _buyTimes: d.buyTimes || 0
            };
        });
    }
    return { _dungeons: _dungeons };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build SuperSkillModel from DB super_skill_data rows
// { _skills: { "0": { _skillId, _level, _evolveLevel }, ... } }
// ═══════════════════════════════════════════════════════════════

function buildSuperSkillModel(superSkills) {
    const _skills = {};
    superSkills.forEach((s, index) => {
        _skills[String(index)] = {
            _skillId: s.skillId,
            _level: s.level || 1,
            _evolveLevel: s.evolveLevel || 0
        };
    });
    return { _skills: _skills };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build GemstoneModel from DB gemstone_data rows
// { _items: { "0": { _id, _displayId, _heroId, _level, _totalExp, _version }, ... } }
// ═══════════════════════════════════════════════════════════════

function buildGemstoneModel(gemstones) {
    const _items = {};
    gemstones.forEach((g, index) => {
        _items[String(index)] = {
            _id: String(g.stoneId || ''),
            _displayId: g.displayId || 0,
            _heroId: String(g.heroId || ''),
            _level: g.level || 1,
            _totalExp: g.totalExp || 0,
            _version: String(g.version || '')
        };
    });
    return { _items: _items };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build ResonanceModel from DB resonance_data rows
// { _id, _diamondCabin, _cabins, _buySeatCount, _totalTalent, _unlockSpecial }
// ═══════════════════════════════════════════════════════════════

function buildResonanceModel(resonances) {
    const _cabins = {};
    if (resonances && resonances.length) {
        resonances.forEach((r) => {
            const cabinKey = String(r.cabinId);
            if (!_cabins[cabinKey]) {
                _cabins[cabinKey] = {};
            }
            _cabins[cabinKey][String(r.seatId)] = r.heroId;
        });
    }
    return {
        _id: '',
        _diamondCabin: 0,
        _cabins: _cabins,
        _buySeatCount: 0,
        _totalTalent: 0,
        _unlockSpecial: false
    };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored hangup data
// CRITICAL: _curLess must be startLesson from constant.json (10101), NOT 0
// ═══════════════════════════════════════════════════════════════

function parseHangupData(stored, c1) {
    const startLesson = Number(c1.startLesson || 10101);
    const defaults = {
        _curLess: startLesson,
        _maxPassLesson: startLesson,
        _haveGotChapterReward: {},
        _maxPassChapter: 0,
        _clickGlobalWarBuffTag: '',
        _buyFund: false,
        _haveGotFundReward: {}
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored summon data
// ═══════════════════════════════════════════════════════════════

function parseSummonData(stored) {
    const defaults = {
        _energy: 0,
        _wishList: [],
        _wishVersion: 0,
        _canCommonFreeTime: 0,
        _canSuperFreeTime: 0,
        _summonTimes: {}
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored giftInfo data
// ═══════════════════════════════════════════════════════════════

function parseGiftInfoData(stored) {
    const defaults = {
        _fristRecharge: {},
        _haveGotVipRewrd: {},
        _buyVipGiftCount: {},
        _onlineGift: { _curId: 0, _nextTime: 0 },
        _gotBSAddToHomeReward: false,
        _clickHonghuUrlTime: 0,
        _gotChannelWeeklyRewardTag: ''
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored checkin data
// ═══════════════════════════════════════════════════════════════

function parseCheckinData(stored) {
    const defaults = {
        _id: '',
        _activeItem: [],
        _curCycle: 1,
        _maxActiveDay: 0,
        _lastActiveDate: 0
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored training data
// ═══════════════════════════════════════════════════════════════

function parseTrainingData(stored, c1) {
    const trainingTimesMax = Number(c1.trainingTimesMax || 10);
    const defaults = {
        _id: '',
        _type: 0,
        _times: trainingTimesMax,
        _timesStartRecover: 0,
        _cfgId: 0
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored expedition data
// ═══════════════════════════════════════════════════════════════

function parseExpeditionData(stored, c1) {
    const expeditionBattleTimes = Number(c1.expeditionBattleTimes || 10);
    const defaults = {
        _id: '',
        _passLesson: {},
        _machines: {},
        _collection: [],
        _teams: {},
        _times: expeditionBattleTimes,
        _timesStartRecover: 0
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored timeTrial data
// ═══════════════════════════════════════════════════════════════

function parseTimeTrialData(stored) {
    const defaults = {
        _id: '',
        _levelStars: {},
        _level: 1,
        _totalStars: 0,
        _gotStarReward: {},
        _haveTimes: 0,
        _timesStartRecover: 0,
        _lastRefreshTime: 0
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored battleMedal data
// ═══════════════════════════════════════════════════════════════

function parseBattleMedalData(stored) {
    const defaults = {
        _id: '',
        _battleMedalId: '',
        _cycle: 0,
        _nextRefreshTime: 0,
        _level: 1,
        _curExp: 0,
        _openSuper: false,
        _task: {},
        _levelReward: {},
        _shopBuyTimes: {},
        _buyLevelCount: 0
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored gravity data
// CRITICAL: FLAT object, NOT double-nested!
// Client reads: e.gravity ? void (t._gravityTrialInfo = e.gravity) : ...
// Old handler had gravity: {gravity: {...}} which is WRONG
// ═══════════════════════════════════════════════════════════════

function parseGravityData(stored) {
    const defaults = {
        _id: '',
        _haveTimes: 0,
        _timesStartRecover: 0,
        _lastLess: 0,
        _lastTime: 0
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored channelSpecial data
// ═══════════════════════════════════════════════════════════════

function parseChannelSpecialData(stored) {
    const defaults = {
        _honghuUrl: '',
        _honghuUrlStartTime: 0,
        _honghuUrlEndTime: 0
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse stored resonance data
// ═══════════════════════════════════════════════════════════════

function parseResonanceData(stored) {
    const defaults = {
        _id: '',
        _diamondCabin: 0,
        _cabins: {},
        _buySeatCount: 0,
        _totalTalent: 0,
        _unlockSpecial: false
    };
    if (!stored || typeof stored !== 'object' || Object.keys(stored).length === 0) {
        return defaults;
    }
    return { ...defaults, ...stored };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Parse nullable JSON blob — returns null if empty/missing
// ═══════════════════════════════════════════════════════════════

function parseNullableBlob(stored) {
    if (stored === null || stored === undefined || stored === '' || stored === '{}') {
        return null;
    }
    if (typeof stored === 'object') {
        if (Object.keys(stored).length === 0) return null;
        return stored;
    }
    try {
        const parsed = JSON.parse(stored);
        if (!parsed || (typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
            return null;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Create complete new user data (for first-time login)
// ═══════════════════════════════════════════════════════════════

function createNewUserData(userId, loginToken, serverId, language) {
    const c1 = getConstant();
    const startLesson = Number(c1.startLesson || 10101);
    const startHeroId = String(c1.startHero || '1205');
    const startHeroLevel = c1.startHeroLevel || '3';
    const startUserLevel = Number(c1.startUserLevel || 1);
    const nickName = 'Guest_' + userId.slice(-4);
    const heroConfig = (jsonLoader.get('hero') || {})[startHeroId] || {};

    const now = Date.now();

    return {
        userId: userId,
        nickName: nickName,
        headImageId: 0,
        pwd: '',
        bulletinVersions: '',
        oriServerId: String(serverId),
        nickChangeTimes: 0,
        lastLoginTime: now,
        createTime: now,
        loginToken: loginToken,
        serverId: serverId,
        language: language || 'en',
        online: 1,
        firstEnter: 1,
        newUser: 1,
        backpackLevel: startUserLevel,
        currency: '',
        guildLevel: 0,
        guildActivePoints: 0,
        ballWarState: 0,
        karinStartTime: 0,
        karinEndTime: 0,
        serverVersion: '1.0',
        serverOpenDate: 0,
        heroImageVersion: '',
        superImageVersion: '',
        enableShowQQ: 0,
        showQQVip: 0,
        showQQ: '',
        showQQImg1: '',
        showQQImg2: '',
        showQQUrl: '',
        cellgameHaveSetHero: 0,
        gameVersion: '',
        teamDungeonOpenTime: 0,
        timeTrialNextOpenTime: 0,
        teamServerHttpUrl: '',
        myTeamServerSocketUrl: '',
        templeLess: 0,

        // JSON blobs — stored as TEXT in SQLite
        hangupData: JSON.stringify({
            _curLess: startLesson,
            _maxPassLesson: startLesson,
            _haveGotChapterReward: {},
            _maxPassChapter: 0,
            _clickGlobalWarBuffTag: '',
            _buyFund: false,
            _haveGotFundReward: {}
        }),
        summonData: JSON.stringify({
            _energy: 0,
            _wishList: [],
            _wishVersion: 0,
            _canCommonFreeTime: 0,
            _canSuperFreeTime: 0,
            _summonTimes: {}
        }),
        itemsData: JSON.stringify({
            _items: buildDefaultTotalPropsItems(c1)
        }),
        herosData: JSON.stringify({
            _heros: { "0": buildStartingHero(startHeroId, heroConfig, startHeroLevel) }
        }),
        equipData: JSON.stringify({ _suits: {} }),
        weaponData: JSON.stringify({ _items: {} }),
        imprintData: JSON.stringify({ _items: {} }),
        genkiData: JSON.stringify({
            _id: "0",
            _items: [],
            _curSmeltNormalExp: 0,
            _curSmeltSuperExp: 0
        }),
        dungeonData: JSON.stringify(buildDefaultDungeons(c1)),
        superSkillData: JSON.stringify({ _skills: {} }),
        heroSkinData: JSON.stringify({ _skins: {}, _curSkin: {} }),
        scheduleData: JSON.stringify(buildDefaultScheduleInfo(c1)),
        timesData: JSON.stringify(buildDefaultTimesInfo(c1)),
        checkinData: JSON.stringify({
            _id: '',
            _activeItem: [],
            _curCycle: 1,
            _maxActiveDay: 0,
            _lastActiveDate: 0
        }),
        channelSpecialData: JSON.stringify({
            _honghuUrl: '',
            _honghuUrlStartTime: 0,
            _honghuUrlEndTime: 0
        }),
        giftInfoData: JSON.stringify({
            _fristRecharge: {},
            _haveGotVipRewrd: {},
            _buyVipGiftCount: {},
            _onlineGift: { _curId: 0, _nextTime: 0 },
            _gotBSAddToHomeReward: false,
            _clickHonghuUrlTime: 0,
            _gotChannelWeeklyRewardTag: ''
        }),
        monthCardData: JSON.stringify({ _id: '', _card: {} }),
        rechargeData: JSON.stringify({ _id: '', _haveBought: {} }),
        userDownloadRewardData: JSON.stringify({
            _isClick: false,
            _haveGotDlReward: false,
            _isBind: false,
            _haveGotBindReward: false
        }),
        timeMachineData: JSON.stringify({ _items: {} }),
        arenaTeamData: JSON.stringify([]),
        arenaSuperData: JSON.stringify([]),
        trainingData: JSON.stringify({
            _id: '',
            _type: 0,
            _times: Number(c1.trainingTimesMax || 10),
            _timesStartRecover: 0,
            _cfgId: 0
        }),
        headEffectData: JSON.stringify({ _effects: [] }),
        userBallWarData: JSON.stringify({
            _state: 0,
            _signedUp: 0,
            _times: Number(c1.dragonBallWarTimesMax || 3),
            _defence: {}
        }),
        ballWarInfoData: JSON.stringify({
            _signed: false,
            _fieldId: '',
            _point: 0,
            _topMsg: ''
        }),
        battleMedalData: JSON.stringify({
            _id: '',
            _battleMedalId: '',
            _cycle: 0,
            _nextRefreshTime: 0,
            _level: 1,
            _curExp: 0,
            _openSuper: false,
            _task: {},
            _levelReward: {},
            _shopBuyTimes: {},
            _buyLevelCount: 0
        }),
        teamDungeonData: JSON.stringify({
            _myTeam: '',
            _canCreateTeamTime: 0,
            _nextCanJoinTime: 0
        }),
        gemstoneData: JSON.stringify({ _items: {} }),
        resonanceData: JSON.stringify({
            _id: '',
            _diamondCabin: 0,
            _cabins: {},
            _buySeatCount: 0,
            _totalTalent: 0,
            _unlockSpecial: false
        }),
        gravityData: JSON.stringify({
            _id: '',
            _haveTimes: 0,
            _timesStartRecover: 0,
            _lastLess: 0,
            _lastTime: 0
        }),
        littleGameData: JSON.stringify({
            _gotBattleReward: {},
            _gotChapterReward: {},
            _clickTime: 0
        }),
        timeTrialData: JSON.stringify({
            _id: '',
            _levelStars: {},
            _level: 1,
            _totalStars: 0,
            _gotStarReward: {},
            _haveTimes: 0,
            _timesStartRecover: 0,
            _lastRefreshTime: 0
        }),
        lastTeamData: JSON.stringify({ _lastTeamInfo: {} }),
        fastTeamData: JSON.stringify({ _teamInfo: {} }),
        userTopBattleData: JSON.stringify({
            _id: '',
            _teams: {},
            _teamTag: '',
            _records: [],
            _history: [],
            _gotRankReward: []
        }),
        teamDungeonTaskData: JSON.stringify({
            _achievement: {},
            _dailyRefreshTime: 0,
            _daily: {}
        }),
        expeditionData: JSON.stringify({
            _id: '',
            _passLesson: {},
            _machines: {},
            _collection: [],
            _teams: {},
            _times: Number(c1.expeditionBattleTimes || 10),
            _timesStartRecover: 0
        }),

        // Nullable JSON blobs — null means "not set yet"
        userGuildData: null,
        userGuildPubData: null,
        curMainTaskData: null,
        timeBonusInfoData: null,
        onlineBulletinData: null,
        youTuberRecruitData: null,
        userYouTuberRecruitData: null,
        topBattleInfoData: null,
        questionnairesData: null,
        guildTreasureMatchRetData: null,

        // String/array JSON
        dragonEquipedData: JSON.stringify({}),
        vipLogData: JSON.stringify([]),
        cardLogData: JSON.stringify([]),
        summonLogData: JSON.stringify([]),
        shopNewHeroesData: JSON.stringify({}),
        hideHeroesData: JSON.stringify({}),
        blacklistData: JSON.stringify([]),
        forbiddenChatData: JSON.stringify({ users: [], finishTime: {} }),

        // String fields
        guide: '',
        guildName: '',
        ballBroadcast: '',
        teamDungeonSplBcst: '',
        teamDungeonNormBcst: '',
        teamDungeonHideInfo: '',
        bulletinRead: ''
    };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handler: user.enterGame
 *
 * Request: { type:'user', action:'enterGame', loginToken, userId, serverId, version, language, gameVersion }
 * Response: Full user data (~97 fields) via UserDataParser.saveUserData()
 */
async function handleEnterGame(request, session) {
    const startTime = Date.now();
    const { loginToken, userId, serverId, version, language, gameVersion } = request;

    logger.log('INFO', 'ENTER', 'enterGame request');
    logger.details('request',
        ['userId', userId],
        ['serverId', serverId],
        ['version', version || ''],
        ['language', language || ''],
        ['gameVersion', gameVersion || '']
    );

    // ── 1. Validate required fields ──
    if (!loginToken || !userId || !serverId) {
        logger.log('WARN', 'ENTER', 'Missing required fields');
        return responseHelper.buildError(responseHelper.ErrorCodes.ERROR_LACK_PARAM);
    }

    // ── 2. Validate loginToken via SDK-Server ──
    const validation = await validateWithSDKServer(loginToken, userId);
    if (!validation.valid) {
        logger.log('WARN', 'ENTER', 'loginToken validation failed');
        return responseHelper.buildError(responseHelper.ErrorCodes.ERROR_NO_LOGIN_CLIENT);
    }

    // ── 3. Check if user exists ──
    let user = db.getUser(userId);
    let isNewUser = false;

    if (!user) {
        // New user — create complete user data with all defaults
        logger.log('INFO', 'ENTER', `Creating new user: ${userId}`);

        const newUserData = createNewUserData(userId, loginToken, serverId, language);
        db.createCompleteUser(newUserData);
        user = db.getUser(userId);
        isNewUser = true;

        logger.log('INFO', 'ENTER', `New user created: ${userId}`);
    } else {
        // Existing user — update login info
        db.updateUserFields(userId, {
            loginToken: loginToken,
            lastLoginTime: Date.now(),
            online: 1,
            language: language || user.language || 'en',
            serverId: serverId
        });
    }

    // ── 4. Set user online ──
    db.setUserOnline(userId, 1);

    // ── 5. Track userId in session ──
    session.userId = userId;
    session.verified = true;

    // ── 6. Load constants from constant.json ──
    const c1 = getConstant();

    // ── 7. Load ALL relational data from DB ──
    const heroes = db.getHeroes(userId);
    const items = db.getItems(userId);
    const equips = db.getEquips(userId);
    const weapons = db.getWeapons(userId);
    const imprints = db.getImprints(userId);
    const genkis = db.getGenkis(userId);
    const superSkills = db.getSuperSkills(userId);
    const gemstones = db.getGemstones(userId);
    const resonances = db.getResonance(userId);
    const dungeonProgress = db.getDungeonProgress ? db.getDungeonProgress(userId) : [];
    const guildInfo = db.getGuildByUser ? db.getGuildByUser(userId) : null;

    // ── 8. Parse JSON blobs from user_data row ──
    // Each JSON blob column stores serialized game state
    const hangup = parseHangupData(safeParse(user.hangupData, null), c1);
    const summon = parseSummonData(safeParse(user.summonData, null));
    const totalPropsItems = (items && items.length > 0)
        ? buildItemsDict(items)
        : buildDefaultTotalPropsItems(c1);
    const herosData = (heroes && heroes.length > 0)
        ? buildHerosDict(heroes)
        : (() => {
            const startHeroId = String(c1.startHero || '1205');
            const startHeroLevel = c1.startHeroLevel || '3';
            const heroConfig = (jsonLoader.get('hero') || {})[startHeroId] || {};
            return { "0": buildStartingHero(startHeroId, heroConfig, startHeroLevel) };
        })();
    const equipData = (equips && equips.length > 0)
        ? { _suits: buildEquipSuits(equips) }
        : safeParse(user.equipData, null) || { _suits: {} };
    const weaponData = (weapons && weapons.length > 0)
        ? { _items: buildWeaponItems(weapons) }
        : safeParse(user.weaponData, null) || { _items: {} };
    const imprintData = (imprints && imprints.length > 0)
        ? { _items: buildImprintItems(imprints) }
        : safeParse(user.imprintData, null) || { _items: {} };
    const genkiData = (genkis && genkis.length > 0)
        ? buildGenkiModel(genkis)
        : safeParse(user.genkiData, null) || { _id: "0", _items: [], _curSmeltNormalExp: 0, _curSmeltSuperExp: 0 };
    const dungeonData = (dungeonProgress && dungeonProgress.length > 0)
        ? buildDungeonModel(dungeonProgress, c1)
        : (() => {
            const raw = safeParse(user.dungeonData, null);
            if (raw && raw._dungeons) return raw;
            return buildDefaultDungeons(c1);
        })();
    const superSkillData = (superSkills && superSkills.length > 0)
        ? buildSuperSkillModel(superSkills)
        : safeParse(user.superSkillData, null) || { _skills: {} };
    const heroSkinData = safeParse(user.heroSkinData, null) || { _skins: {}, _curSkin: {} };
    const scheduleInfo = mergeScheduleInfo(safeParse(user.scheduleData, null), c1);
    const timesInfo = mergeTimesInfo(safeParse(user.timesData, null), c1);
    const checkin = parseCheckinData(safeParse(user.checkinData, null));
    const channelSpecial = parseChannelSpecialData(safeParse(user.channelSpecialData, null));
    const giftInfo = parseGiftInfoData(safeParse(user.giftInfoData, null));
    const monthCard = safeParse(user.monthCardData, null) || { _id: '', _card: {} };
    const recharge = safeParse(user.rechargeData, null) || { _id: '', _haveBought: {} };
    const training = parseTrainingData(safeParse(user.trainingData, null), c1);
    const headEffect = safeParse(user.headEffectData, null) || { _effects: [] };
    const userBallWar = safeParse(user.userBallWarData, null) || {
        _state: 0,
        _signedUp: 0,
        _times: Number(c1.dragonBallWarTimesMax || 3),
        _defence: {}
    };
    const ballWarInfo = safeParse(user.ballWarInfoData, null) || {
        _signed: false,
        _fieldId: '',
        _point: 0,
        _topMsg: ''
    };
    const battleMedal = parseBattleMedalData(safeParse(user.battleMedalData, null));
    const teamDungeon = safeParse(user.teamDungeonData, null) || {
        _myTeam: '',
        _canCreateTeamTime: 0,
        _nextCanJoinTime: 0
    };
    const teamDungeonTask = safeParse(user.teamDungeonTaskData, null) || {
        _achievement: {},
        _dailyRefreshTime: 0,
        _daily: {}
    };
    const gemstoneData = (gemstones && gemstones.length > 0)
        ? buildGemstoneModel(gemstones)
        : safeParse(user.gemstoneData, null) || { _items: {} };
    const resonanceData = (resonances && resonances.length > 0)
        ? buildResonanceModel(resonances)
        : parseResonanceData(safeParse(user.resonanceData, null));
    const gravityData = parseGravityData(safeParse(user.gravityData, null));
    const littleGameData = safeParse(user.littleGameData, null) || {
        _gotBattleReward: {},
        _gotChapterReward: {},
        _clickTime: 0
    };
    const timeTrialData = parseTimeTrialData(safeParse(user.timeTrialData, null));
    const expeditionData = parseExpeditionData(safeParse(user.expeditionData, null), c1);
    const userTopBattleData = safeParse(user.userTopBattleData, null) || {
        _id: '',
        _teams: {},
        _teamTag: '',
        _records: [],
        _history: [],
        _gotRankReward: []
    };
    const userGuildData = parseNullableBlob(safeParse(user.userGuildData, null));
    const userGuildPubData = parseNullableBlob(safeParse(user.userGuildPubData, null));

    // ── 9. Build complete enterGame response — ALL ~97 FIELDS ──
    const enterGameData = {

        // ═══════════════════════════════════════════
        // 1. currency — string
        // ═══════════════════════════════════════════
        currency: user.currency || '',

        // ═══════════════════════════════════════════
        // 2. newUser — boolean
        // ═══════════════════════════════════════════
        newUser: !!isNewUser,

        // ═══════════════════════════════════════════
        // 3. user — UserInfoSingleton (Serializable)
        // ═══════════════════════════════════════════
        user: {
            _id: user.userId,
            _pwd: '',
            _nickName: user.nickName || '',
            _headImage: String(user.headImageId || 0),
            _lastLoginTime: Number(user.lastLoginTime) || 0,
            _createTime: Number(user.createTime) || 0,
            _bulletinVersions: {},
            _oriServerId: Number(user.serverId) || 1,
            _nickChangeTimes: Number(user.nickChangeTimes) || 0
        },

        // ═══════════════════════════════════════════
        // 4. hangup — OnHookSingleton (Serializable)
        // CRITICAL: _curLess must be startLesson from constant.json
        // ═══════════════════════════════════════════
        hangup: hangup,

        // ═══════════════════════════════════════════
        // 5. summon — SummonSingleton (Serializable)
        // ═══════════════════════════════════════════
        summon: summon,

        // ═══════════════════════════════════════════
        // 6. totalProps — ItemsCommonSingleton
        // ═══════════════════════════════════════════
        totalProps: {
            _items: totalPropsItems
        },

        // ═══════════════════════════════════════════
        // 7. backpackLevel — integer
        // ═══════════════════════════════════════════
        backpackLevel: Number(user.backpackLevel) || Number(c1.startUserLevel) || 1,

        // ═══════════════════════════════════════════
        // 8. heros — HerosManager (Serializable)
        // ═══════════════════════════════════════════
        heros: {
            _heros: herosData
        },

        // ═══════════════════════════════════════════
        // 9. scheduleInfo — AllRefreshCount (39+ fields with _ prefix)
        // ═══════════════════════════════════════════
        scheduleInfo: scheduleInfo,

        // ═══════════════════════════════════════════
        // 10. cellgameHaveSetHero — boolean (SEPARATE from scheduleInfo!)
        // Client: void 0 != e.cellgameHaveSetHero && (e.scheduleInfo._cellgameHaveSetHero = e.cellgameHaveSetHero)
        // ═══════════════════════════════════════════
        cellgameHaveSetHero: !!(user.cellgameHaveSetHero),

        // ═══════════════════════════════════════════
        // 11. imprint — SignInfoManager
        // ═══════════════════════════════════════════
        imprint: imprintData,

        // ═══════════════════════════════════════════
        // 12. equip — EquipInfoManager (CRITICAL - keyed by heroId!)
        // ═══════════════════════════════════════════
        equip: equipData,

        // ═══════════════════════════════════════════
        // 13. weapon — WeaponDataModel
        // ═══════════════════════════════════════════
        weapon: weaponData,

        // ═══════════════════════════════════════════
        // 14. genki — GenkiModel (FLAT, not nested under _items)
        // _items is ARRAY, not keyed object
        // ═══════════════════════════════════════════
        genki: genkiData,

        // ═══════════════════════════════════════════
        // 15. dungeon — CounterpartSingleton
        // KEYED BY dungeonType string
        // ═══════════════════════════════════════════
        dungeon: dungeonData,

        // ═══════════════════════════════════════════
        // 16. superSkill — SuperSkillSingleton
        // ═══════════════════════════════════════════
        superSkill: superSkillData,

        // ═══════════════════════════════════════════
        // 17. heroSkin — HerosManager
        // ═══════════════════════════════════════════
        heroSkin: heroSkinData,

        // ═══════════════════════════════════════════
        // 18. summonLog — SummonSingleton
        // ═══════════════════════════════════════════
        summonLog: safeParse(user.summonLogData, null) || [],

        // ═══════════════════════════════════════════
        // 19. curMainTask — UserInfoSingleton
        // ═══════════════════════════════════════════
        curMainTask: parseNullableBlob(safeParse(user.curMainTaskData, null)) || {},

        // ═══════════════════════════════════════════
        // 20. checkin — WelfareInfoManager (Serializable)
        // ═══════════════════════════════════════════
        checkin: checkin,

        // ═══════════════════════════════════════════
        // 21. channelSpecial — WelfareInfoManager
        // ═══════════════════════════════════════════
        channelSpecial: channelSpecial,

        // ═══════════════════════════════════════════
        // 22. dragonEquiped — ItemsCommonSingleton
        // ═══════════════════════════════════════════
        dragonEquiped: safeParse(user.dragonEquipedData, null) || {},

        // ═══════════════════════════════════════════
        // 23. vipLog — WelfareInfoManager
        // ═══════════════════════════════════════════
        vipLog: safeParse(user.vipLogData, null) || [],

        // ═══════════════════════════════════════════
        // 24. cardLog — WelfareInfoManager
        // ═══════════════════════════════════════════
        cardLog: safeParse(user.cardLogData, null) || [],

        // ═══════════════════════════════════════════
        // 25. guide — GuideInfoManager
        // _steps from user.guideStep parsed JSON
        // ═══════════════════════════════════════════
        guide: {
            _id: '',
            _steps: safeParse(user.guideStep, {})
        },

        // ═══════════════════════════════════════════
        // 26. guildName — string (NOT object!)
        // ═══════════════════════════════════════════
        guildName: (guildInfo ? guildInfo.guildName : '') || user.guildName || '',

        // ═══════════════════════════════════════════
        // 27. clickSystem — UserClickSingleton
        // ═══════════════════════════════════════════
        clickSystem: {
            _clickSys: safeParse(user.clickSystem, { "1": false, "2": false })
        },

        // ═══════════════════════════════════════════
        // 28. giftInfo — WelfareInfoManager (10 sub-fields)
        // ═══════════════════════════════════════════
        giftInfo: giftInfo,

        // ═══════════════════════════════════════════
        // 29. monthCard — WelfareInfoManager
        // ═══════════════════════════════════════════
        monthCard: monthCard,

        // ═══════════════════════════════════════════
        // 30. recharge — WelfareInfoManager
        // ═══════════════════════════════════════════
        recharge: recharge,

        // ═══════════════════════════════════════════
        // 31. timesInfo — TimesInfoSingleton (NO _ prefix!)
        // CRITICAL: NaN bug if not sent
        // ═══════════════════════════════════════════
        timesInfo: timesInfo,

        // ═══════════════════════════════════════════
        // 32. YouTuberRecruit (MISSING in old handler!)
        // hidden=true means client won't show it
        // ═══════════════════════════════════════════
        YouTuberRecruit: { _hidden: true },

        // ═══════════════════════════════════════════
        // 33. userYouTuberRecruit (MISSING in old handler!)
        // ═══════════════════════════════════════════
        userYouTuberRecruit: null,

        // ═══════════════════════════════════════════
        // 34. userDownloadReward
        // ═══════════════════════════════════════════
        userDownloadReward: safeParse(user.userDownloadRewardData, null) || {
            _isClick: false,
            _haveGotDlReward: false,
            _isBind: false,
            _haveGotBindReward: false
        },

        // ═══════════════════════════════════════════
        // 35. timeMachine
        // ═══════════════════════════════════════════
        timeMachine: safeParse(user.timeMachineData, null) || { _items: {} },

        // ═══════════════════════════════════════════
        // 36-37. _arenaTeam, _arenaSuper
        // ═══════════════════════════════════════════
        _arenaTeam: safeParse(user.arenaTeamData, null) || [],
        _arenaSuper: safeParse(user.arenaSuperData, null) || [],

        // ═══════════════════════════════════════════
        // 38. timeBonusInfo
        // ═══════════════════════════════════════════
        timeBonusInfo: parseNullableBlob(safeParse(user.timeBonusInfoData, null)) || { _id: '', _timeBonus: {} },

        // ═══════════════════════════════════════════
        // 39. onlineBulletin — array
        // ═══════════════════════════════════════════
        onlineBulletin: safeParse(user.onlineBulletinData, null) || [],

        // ═══════════════════════════════════════════
        // 40-41. karinStartTime, karinEndTime — numbers
        // ═══════════════════════════════════════════
        karinStartTime: Number(user.karinStartTime) || 0,
        karinEndTime: Number(user.karinEndTime) || 0,

        // ═══════════════════════════════════════════
        // 42. serverVersion — string
        // ═══════════════════════════════════════════
        serverVersion: user.serverVersion || '1.0',

        // ═══════════════════════════════════════════
        // 43. serverOpenDate — number
        // ═══════════════════════════════════════════
        serverOpenDate: Number(user.serverOpenDate) || 0,

        // ═══════════════════════════════════════════
        // 44. lastTeam
        // ═══════════════════════════════════════════
        lastTeam: safeParse(user.lastTeamData, null) || { _lastTeamInfo: {} },

        // ═══════════════════════════════════════════
        // 45-46. heroImageVersion, superImageVersion — optional numbers
        // ═══════════════════════════════════════════
        heroImageVersion: Number(user.heroImageVersion) || 0,
        superImageVersion: Number(user.superImageVersion) || 0,

        // ═══════════════════════════════════════════
        // 47. training
        // ═══════════════════════════════════════════
        training: training,

        // ═══════════════════════════════════════════
        // 48-49. warInfo, userWar — MUST be null for new users!
        // Client: e.warInfo && ... / e.userWar && ...
        // ═══════════════════════════════════════════
        warInfo: parseNullableBlob(safeParse(user.warInfoData, null)),
        userWar: parseNullableBlob(safeParse(user.userWarData, null)),

        // ═══════════════════════════════════════════
        // 50. serverId — number
        // ═══════════════════════════════════════════
        serverId: Number(user.serverId) || 1,

        // ═══════════════════════════════════════════
        // 51. headEffect
        // ═══════════════════════════════════════════
        headEffect: headEffect,

        // ═══════════════════════════════════════════
        // 52. userBallWar — object
        // ═══════════════════════════════════════════
        userBallWar: userBallWar,

        // ═══════════════════════════════════════════
        // 53. ballWarState — number
        // ═══════════════════════════════════════════
        ballWarState: Number(user.ballWarState) || 0,

        // ═══════════════════════════════════════════
        // 54. ballBroadcast — STRING! Not array!
        // Client: e.ballBroadcast && TeamInfoManager.getInstance().setBallWarBrodecast(e.ballBroadcast)
        // ═══════════════════════════════════════════
        ballBroadcast: user.ballBroadcast || '',

        // ═══════════════════════════════════════════
        // 55. ballWarInfo
        // ═══════════════════════════════════════════
        ballWarInfo: ballWarInfo,

        // ═══════════════════════════════════════════
        // 56. guildActivePoints — NUMBER! Not object!
        // Client: e.guildActivePoints && TeamInfoManager.getInstance().setActivePoints(e.guildActivePoints)
        // ═══════════════════════════════════════════
        guildActivePoints: Number(user.guildActivePoints) || 0,

        // ═══════════════════════════════════════════
        // 57-62. enableShowQQ, showQQVip, showQQ, showQQImg1, showQQImg2, showQQUrl
        // ═══════════════════════════════════════════
        enableShowQQ: !!(user.enableShowQQ),
        showQQVip: !!(user.showQQVip),
        showQQ: user.showQQ || '',
        showQQImg1: user.showQQImg1 || '',
        showQQImg2: user.showQQImg2 || '',
        showQQUrl: user.showQQUrl || '',

        // ═══════════════════════════════════════════
        // 63. hideHeroes — optional array
        // ═══════════════════════════════════════════
        hideHeroes: safeParse(user.hideHeroesData, null) || null,

        // ═══════════════════════════════════════════
        // 64. expedition — object
        // ═══════════════════════════════════════════
        expedition: expeditionData,

        // ═══════════════════════════════════════════
        // 65-66. timeTrial, timeTrialNextOpenTime
        // ═══════════════════════════════════════════
        timeTrial: timeTrialData,
        timeTrialNextOpenTime: Number(user.timeTrialNextOpenTime) || 0,

        // ═══════════════════════════════════════════
        // 67. retrieve — null OK
        // ═══════════════════════════════════════════
        retrieve: null,

        // ═══════════════════════════════════════════
        // 68. battleMedal
        // ═══════════════════════════════════════════
        battleMedal: battleMedal,

        // ═══════════════════════════════════════════
        // 69. shopNewHeroes — object
        // ═══════════════════════════════════════════
        shopNewHeroes: safeParse(user.shopNewHeroesData, null) || {},

        // ═══════════════════════════════════════════
        // 70. teamDungeon
        // ═══════════════════════════════════════════
        teamDungeon: teamDungeon,

        // ═══════════════════════════════════════════
        // 71. teamServerHttpUrl — string
        // ═══════════════════════════════════════════
        teamServerHttpUrl: user.teamServerHttpUrl || '',

        // ═══════════════════════════════════════════
        // 72. teamDungeonOpenTime — number
        // ═══════════════════════════════════════════
        teamDungeonOpenTime: Number(user.teamDungeonOpenTime) || 0,

        // ═══════════════════════════════════════════
        // 73. teamDungeonTask
        // ═══════════════════════════════════════════
        teamDungeonTask: teamDungeonTask,

        // ═══════════════════════════════════════════
        // 74-76. teamDungeonSplBcst, teamDungeonNormBcst, teamDungeonHideInfo
        // MISSING in old handler!
        // ═══════════════════════════════════════════
        teamDungeonSplBcst: user.teamDungeonSplBcst || null,
        teamDungeonNormBcst: user.teamDungeonNormBcst || null,
        teamDungeonHideInfo: user.teamDungeonHideInfo || null,

        // ═══════════════════════════════════════════
        // 77. templeLess — number
        // ═══════════════════════════════════════════
        templeLess: Number(user.templeLess) || 0,

        // ═══════════════════════════════════════════
        // 78. teamDungeonInvitedFriends — array
        // ═══════════════════════════════════════════
        teamDungeonInvitedFriends: safeParse(user.teamDungeonInvitedFriendsData, null) || [],

        // ═══════════════════════════════════════════
        // 79. myTeamServerSocketUrl — string
        // ═══════════════════════════════════════════
        myTeamServerSocketUrl: user.myTeamServerSocketUrl || '',

        // ═══════════════════════════════════════════
        // 80. gemstone — EquipInfoManager
        // GemstoneItem: _id, _displayId, _heroId, _level, _totalExp, _version
        // ═══════════════════════════════════════════
        gemstone: gemstoneData,

        // ═══════════════════════════════════════════
        // 81. questionnaires — object
        // ═══════════════════════════════════════════
        questionnaires: parseNullableBlob(safeParse(user.questionnairesData, null)) || {},

        // ═══════════════════════════════════════════
        // 82. resonance — HerosManager (Serializable)
        // ═══════════════════════════════════════════
        resonance: resonanceData,

        // ═══════════════════════════════════════════
        // 83. userTopBattle
        // ═══════════════════════════════════════════
        userTopBattle: userTopBattleData,

        // ═══════════════════════════════════════════
        // 84. topBattleInfo
        // ═══════════════════════════════════════════
        topBattleInfo: parseNullableBlob(safeParse(user.topBattleInfoData, null)) || {},

        // ═══════════════════════════════════════════
        // 85. fastTeam — from user.fastTeams parsed JSON
        // ═══════════════════════════════════════════
        fastTeam: { _teamInfo: safeParse(user.fastTeams, {}) },

        // ═══════════════════════════════════════════
        // 86. blacklist — array
        // ═══════════════════════════════════════════
        blacklist: safeParse(user.blacklistData, null) || [],

        // ═══════════════════════════════════════════
        // 87. forbiddenChat (NO _ prefix!)
        // Client: var n = e.users, o = e.finishTime; for (var a in n) { ... }
        // ═══════════════════════════════════════════
        forbiddenChat: safeParse(user.forbiddenChatData, null) || { users: [], finishTime: {} },

        // ═══════════════════════════════════════════
        // 88. gravity — FLAT OBJECT! NOT double-nested!
        // Client: e.gravity ? void (t._gravityTrialInfo = e.gravity) : ...
        // Old handler had gravity: {gravity: {...}} which is WRONG!
        // ═══════════════════════════════════════════
        gravity: gravityData,

        // ═══════════════════════════════════════════
        // 89. littleGame
        // ═══════════════════════════════════════════
        littleGame: littleGameData,

        // ═══════════════════════════════════════════
        // 90-93. globalWarBuffTag, globalWarLastRank, globalWarBuff, globalWarBuffEndTime
        // ═══════════════════════════════════════════
        globalWarBuffTag: hangup._clickGlobalWarBuffTag || '',
        globalWarLastRank: {},
        globalWarBuff: 0,
        globalWarBuffEndTime: 0,

        // ═══════════════════════════════════════════
        // 94-97. userGuild, userGuildPub, guildLevel, guildTreasureMatchRet
        // MISSING in old handler!
        // ═══════════════════════════════════════════
        userGuild: userGuildData,
        userGuildPub: userGuildPubData,
        guildLevel: Number(user.guildLevel) || null,
        guildTreasureMatchRet: parseNullableBlob(safeParse(user.guildTreasureMatchRetData, null))
    };

    const duration = Date.now() - startTime;
    logger.log('INFO', 'ENTER', 'enterGame success');
    logger.details('data',
        ['userId', userId],
        ['isNewUser', String(isNewUser)],
        ['heroes', String(heroes ? heroes.length : 0)],
        ['items', String(items ? items.length : 0)],
        ['duration', duration + 'ms']
    );

    // ── 10. Update firstEnter flag ──
    if (user.firstEnter === 1) {
        db.updateUserFields(userId, { firstEnter: 0 });
    }

    return responseHelper.buildSuccess(enterGameData);
}

module.exports = handleEnterGame;
