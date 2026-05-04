/**
 * enterGame.js — Handler untuk user.enterGame
 * Referensi: main.min(unminfy).js saveUserData (Line 114793-114873)
 * Cross-reference: SetHeroDataToModel, SetEquipDataToModel, WeaponDataModel,
 *   ImprintItem, GemstoneItem, GenkiModel, dll.
 *
 * Request: {type:'user', action:'enterGame', loginToken, userId, serverId, version, language, gameVersion}
 * Response: Full user data (saveUserData)
 *
 * Flow:
 * 1. Validate required fields (loginToken, userId, serverId)
 * 2. Validate loginToken via SDK-Server /auth/validate
 * 3. Check if user exists → createCompleteUser (new) OR updateUserFields (existing)
 * 4. Set user online
 * 5. Load semua relasional data dari DB
 * 6. Build enterGame response SESUAI client saveUserData format
 * 7. Mark firstEnter = 0 setelah pertama kali
 *
 * CRITICAL: Client expects specific wire format:
 *   - All keys start with '_' prefix (auto-stripped by Serializable)
 *   - Arrays wrapped in { _items: [...] } pattern (ItemsList)
 *   - Maps keyed by heroId (not arrays)
 *   - Field names must match EXACTLY what client reads
 */

const http = require('http');
const db = require('../db');
const logger = require('../logger');
const responseHelper = require('../responseHelper');
const config = require('../config');
const jsonLoader = require('../jsonLoader');

// ─── SDK-Server API Helper ───

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
            logger.detail('important', ['error', err.message]);
            resolve({ valid: false, loginToken: '', securityCode: '' });
        });

        req.on('timeout', () => {
            req.destroy();
        });

        req.write(payload);
        req.end();
    });
}

// ─── Helper: Safe JSON parse ───
function safeParse(jsonStr, fallback) {
    try { return JSON.parse(jsonStr || '{}'); } catch (e) { return fallback; }
}

// ─── Helper: Build HeroAttribute from DB hero row ───
// Client reads _heroBaseAttr with: _hp, _attack, _armor, _speed, _hit, _dodge,
//   _block, _damageReduce, _armorBreak, _controlResist, _skillDamage,
//   _criticalDamage, _blockEffect, _critical, _criticalResist, _trueDamage,
//   _energy, _power, _extraArmor, _hpPercent, _armorPercent, _attackPercent,
//   _speedPercent, _orghp, _superDamage, _healPlus, _healerPlus, _damageDown,
//   _shielderPlus, _damageUp, _level, _evolveLevel
function buildHeroBaseAttr(heroRow) {
    return {
        _level: heroRow.level || 1,
        _evolveLevel: heroRow.evolveLevel || 0,
        _power: heroRow.power || 0,
        _hp: 0, _attack: 0, _armor: 0, _speed: 0,
        _hit: 0, _dodge: 0, _block: 0, _damageReduce: 0,
        _armorBreak: 0, _controlResist: 0, _skillDamage: 0,
        _criticalDamage: 0, _blockEffect: 0, _critical: 0,
        _criticalResist: 0, _trueDamage: 0, _energy: 0,
        _extraArmor: 0, _hpPercent: 0, _armorPercent: 0,
        _attackPercent: 0, _speedPercent: 0, _orghp: 0,
        _superDamage: 0, _healPlus: 0, _healerPlus: 0,
        _damageDown: 0, _shielderPlus: 0, _damageUp: 0
    };
}

// ─── Helper: Build HeroTotalCost (all empty arrays for new/initial hero) ───
function buildHeroTotalCost(heroRow) {
    let totalCost = safeParse(heroRow.totalCost, null);
    if (totalCost && typeof totalCost === 'object') return totalCost;
    return {
        _wakeUp: { _items: [] }, _earring: { _items: [] },
        _levelUp: { _items: [] }, _evolve: { _items: [] },
        _skill: { _items: [] }, _qigong: { _items: [] },
        _heroBreak: { _items: [] }
    };
}

// ─── Helper: Build HeroBreak ───
function buildHeroBreak(heroRow) {
    let breakInfo = safeParse(heroRow.breakInfo, null);
    if (breakInfo && typeof breakInfo === 'object') {
        if (!breakInfo._breakLevel) breakInfo._breakLevel = heroRow.selfBreakLevel || 0;
        if (!breakInfo._level) breakInfo._level = 0;
        if (!breakInfo._attr) breakInfo._attr = { _items: [] };
        return breakInfo;
    }
    return {
        _breakLevel: heroRow.selfBreakLevel || 0,
        _level: 0,
        _attr: { _items: [] }
    };
}

// ─── Helper: Build single hero wire format ───
// Referensi: SetHeroDataToModel (Line 134052)
function buildHeroWire(heroRow) {
    const heroId = String(heroRow.displayId);
    return {
        _heroId: heroId,
        _heroDisplayId: heroRow.displayId,
        _heroStar: heroRow.star || 0,
        _expeditionMaxLevel: heroRow.expeditionMaxLevel || 0,
        _heroTag: heroRow.heroTag || '[]',
        _fragment: heroRow.fragment || 0,
        _superSkillResetCount: heroRow.superSkillResetCount || 0,
        _potentialResetCount: heroRow.potentialResetCount || 0,
        _heroBaseAttr: buildHeroBaseAttr(heroRow),
        _superSkillLevel: safeParse(heroRow.superSkillLevel, []),
        _potentialLevel: safeParse(heroRow.potentialLevel, []),
        _qigong: safeParse(heroRow.qigong, {}),
        _qigongTmp: safeParse(heroRow.qigongTmp, {}),
        _qigongStage: 1,
        _qigongTmpPower: heroRow.qigongTmpPower || 0,
        _totalCost: buildHeroTotalCost(heroRow),
        _breakInfo: buildHeroBreak(heroRow),
        _gemstoneSuitId: heroRow.gemstoneSuitId || 0,
        _linkTo: safeParse(heroRow.linkTo, []),
        _linkFrom: ''
    };
}

// ─── Helper: Build heros map (keyed by heroId = displayId) ───
// Client reads: e.heros._heros → map by heroId
function buildHerosMap(heroes) {
    const _heros = {};
    for (const h of heroes) {
        const heroId = String(h.displayId);
        _heros[heroId] = buildHeroWire(h);
    }
    return { _heros };
}

// ─── Helper: Build equip suits map (keyed by heroId) ───
// Client reads: e.equip._suits → map by heroId
// Each suit: { _suitItems: [{_id, _pos}], _suitAttrs: [{_id, _num}],
//              _equipAttrs: [{_id, _num}], _earrings: EarringsItem, _weaponState: 0 }
function buildEquipSuits(equips) {
    const _suits = {};
    // Group equips by heroId
    const byHero = {};
    for (const e of equips) {
        const hId = String(e.heroId || 0);
        if (!byHero[hId]) byHero[hId] = [];
        byHero[hId].push(e);
    }
    for (const [heroId, items] of Object.entries(byHero)) {
        _suits[heroId] = {
            _suitItems: items.map(e => ({ _id: e.equipId, _pos: e.position || 0 })),
            _suitAttrs: [],
            _equipAttrs: [],
            _earrings: { _id: 0, _level: 0, _attrs: { _items: [] } },
            _weaponState: 0
        };
    }
    return { _suits };
}

// ─── Helper: Build weapon items array ───
// Client reads: e.weapon._items → array of WeaponDataModel
// Each: { _weaponId, _displayId, _heroId, _star, _level,
//         _attrs: {_items:[]}, _strengthenCost: {_items:[]},
//         _haloId, _haloLevel, _haloCost: {_items:[]} }
function buildWeaponItems(weapons) {
    return {
        _items: weapons.map(w => ({
            _weaponId: w.weaponId,
            _displayId: w.displayId || 0,
            _heroId: String(w.heroId || 0),
            _star: w.star || 0,
            _level: w.level || 1,
            _attrs: safeParse(w.attrs, { _items: [] }),
            _strengthenCost: safeParse(w.strengthenCost, { _items: [] }),
            _haloId: w.haloId || 0,
            _haloLevel: w.haloLevel || 0,
            _haloCost: safeParse(w.haloCost, { _items: [] })
        }))
    };
}

// ─── Helper: Build imprint (sign) items ───
// Client reads: e.imprint._items → array of ImprintItem
// Each: { _id, _displayId, _heroId, _level, _star,
//         _mainAttr: {_items:[]}, _starAttr: {_items:[]},
//         _viceAttr: [], _addAttr: {}, _tmpViceAttr: [], _totalCost: {_items:[]} }
// NOTE: _signType, part, SignQuality are derived from _displayId by client — NOT sent
function buildImprintItems(imprints) {
    return {
        _items: imprints.map(i => ({
            _id: i.id,
            _displayId: i.displayId || i.imprintId,
            _heroId: String(i.heroId || 0),
            _level: i.level || 1,
            _star: i.star || 0,
            _mainAttr: safeParse(i.mainAttr, { _items: [] }),
            _starAttr: safeParse(i.starAttr, { _items: [] }),
            _viceAttr: safeParse(i.viceAttr, []),
            _addAttr: safeParse(i.addAttr, {}),
            _tmpViceAttr: safeParse(i.tmpViceAttr, []),
            _totalCost: safeParse(i.totalCost, { _items: [] })
        }))
    };
}

// ─── Helper: Build gemstone items ───
// Client reads: e.gemstone._items → array of GemstoneItem
// Each: { _id, _displayId, _heroId, _level, _totalExp, _version }
function buildGemstoneItems(gemstones) {
    return {
        _items: gemstones.map(g => ({
            _id: g.id,
            _displayId: g.displayId || g.stoneId,
            _heroId: String(g.heroId || 0),
            _level: g.level || 1,
            _totalExp: g.totalExp || 0,
            _version: g.version || ''
        }))
    };
}

// ─── Helper: Build genki model ───
// Client reads: e.genki → { _id, _items: GenkiItem[], _curSmeltNormalExp, _curSmeltSuperExp }
// Each GenkiItem: { _id, _displayId, _heroId, _heroPos, _mainAttr, _viceAttr, _disable }
function buildGenkiModel(genkis) {
    return {
        _id: '0',
        _items: genkis.map(g => ({
            _id: g.id,
            _displayId: g.displayId || g.genkiId,
            _heroId: String(g.heroId || 0),
            _heroPos: g.pos || 0,
            _mainAttr: safeParse(g.mainAttr, { _items: [] }),
            _viceAttr: safeParse(g.viceAttr, { _items: [] }),
            _disable: g.disable || 0
        })),
        _curSmeltNormalExp: 0,
        _curSmeltSuperExp: 0
    };
}

// ─── Helper: Build initial scheduleInfo from constant.json ───
// Client reads: AllRefreshCount.initData(e.scheduleInfo)
// If user has saved scheduleData, use that; otherwise build from constant.json
function buildInitialScheduleInfo() {
    const constantData = jsonLoader.get('constant');
    const c1 = (constantData && constantData['1']) || {};
    return {
        _arenaAttackTimes: Number(c1.arenaAttackTimes || 5),
        _arenaBuyTimesCount: 0,
        _strongEnemyTimes: Number(c1.bossAttackTimes || 6),
        _strongEnemyBuyCount: 0,
        _karinTowerBattleTimes: Number(c1.karinTowerBattleTimes || 10),
        _karinTowerBuyTimesCount: 0,
        _cellGameTimes: Number(c1.cellGameTimes || 1),
        _cellGameBuyTimesCount: 0,
        _templeTestTimes: Number(c1.templeTestTimes || 10),
        _templeTestBuyTimesCount: 0,
        _expDungeonTimes: Number(c1.expDungeonTimes || 2),
        _expDungeonBuyTimes: 0,
        _evolveDungeonTimes: Number(c1.evolveDungeonTimes || 2),
        _evolveDungeonBuyTimes: 0,
        _energyDungeonTimes: Number(c1.energyDungeonTimes || 2),
        _energyDungeonBuyTimes: 0,
        _metalDungeonTimes: Number(c1.metalDungeonTimes || 2),
        _metalDungeonBuyTimes: 0,
        _zStoneDungeonTimes: Number(c1.zStoneDungeonTimes || 2),
        _zStoneDungeonBuyTimes: 0,
        _equipDungeonTimes: Number(c1.equipDungeonTimes || 2),
        _equipDungeonBuyTimes: 0,
        _signDungeonTimes: Number(c1.signDungeonTimes || 2),
        _signDungeonBuyTimes: 0,
        _bossFightTimes: Number(c1.bossFightTimesMax || 3),
        _bossFightBuyTimes: 0,
        _mahaAdventureTimes: Number(c1.mahaAdventureTimesMax || 5),
        _mahaAdventureBuyTimes: 0,
        _trainingTimes: Number(c1.trainingTimesMax || 10),
        _trainingBuyTimes: 0,
        _guildBOSSTimes: Number(c1.guildBOSSTimes || 2),
        _guildBOSSBuyTimes: 0,
        _guildGrabTimes: Number(c1.guildGrabTimes || 3),
        _mineActionPoint: Number(c1.mineActionPointMax || 50),
        _dragonBallWarTimes: Number(c1.dragonBallWarTimesMax || 3),
        _dragonBallWarBuyTimes: 0,
        _expeditionTimes: Number(c1.expeditionBattleTimes || 10),
        _snakeDungeonTimes: Number(c1.snakeTimes || 1),
        _topBattleTimes: 0,
        _topBattleBuyTimes: 0,
        _gravityTestTimes: Number(c1.gravityTestRewardpreview || 50),
        _timeTrainTimes: 0,
        _timeTrainBuyTimes: 0,
        _marketRefreshTimes: Number(c1.marketRefreshTimeMax || 5),
        _vipMarketRefreshTimes: Number(c1.vipMarketRefreshTimeMax || 5),
        _rewardHelpTimes: Number(c1.rewardHelpRewardEveryday || 10),
        _goldBuyTimes: Number(c1.goldBuyFree || 20)
    };
}

// ─── Main Handler ───

/**
 * Handle user.enterGame
 * @param {object} request - Client request object
 * @param {object} session - Socket session { userId, verified, nonce, ... }
 * @returns {Promise<object>} Response via responseHelper
 */
async function handleEnterGame(request, session) {
    const startTime = Date.now();
    const { loginToken, userId, serverId, version, language, gameVersion } = request;

    logger.log('INFO', 'ENTER', 'enterGame request');
    logger.details('request',
        ['userId', userId],
        ['serverId', serverId],
        ['version', version || ''],
        ['language', language || '']
    );

    // 1. Validate required fields
    if (!loginToken || !userId || !serverId) {
        logger.log('WARN', 'ENTER', 'Missing required fields');
        return responseHelper.buildError(responseHelper.ErrorCodes.ERROR_LACK_PARAM);
    }

    // 2. Validate loginToken via SDK-Server
    const validation = await validateWithSDKServer(loginToken, userId);
    if (!validation.valid) {
        logger.log('WARN', 'ENTER', 'loginToken validation failed');
        return responseHelper.buildError(responseHelper.ErrorCodes.ERROR_NO_LOGIN_CLIENT);
    }

    // 3. Check if user exists in main_server.db
    let user = db.getUser(userId);

    if (!user) {
        // New user — create complete user data
        // Default values dari SQLite DEFAULT constraints via db.createCompleteUser()
        logger.log('INFO', 'ENTER', `Creating new user: ${userId}`);

        const nickName = 'Guest_' + userId.slice(-4);
        user = db.createCompleteUser(userId, nickName, loginToken, serverId, language);

        logger.log('INFO', 'ENTER', `New user created: ${userId}`);
        logger.details('data', ['nickName', nickName]);
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

    // 4. Set user online
    db.setUserOnline(userId, 1);

    // 5. Track userId in session
    session.userId = userId;
    session.verified = true;

    // ═══════════════════════════════════════════════════════════════
    // 6. Load semua relasional data dari DB
    // ═══════════════════════════════════════════════════════════════

    const heroes = db.getHeroes(userId);
    const items = db.getItems(userId);
    const equips = db.getEquips(userId);
    const weapons = db.getWeapons(userId);
    const imprints = db.getImprints(userId);
    const genkis = db.getGenkis(userId);
    const friends = db.getFriends(userId);
    const mails = db.getMails(userId);
    const expeditions = db.getExpeditions(userId);
    const entrusts = db.getEntrusts(userId);
    const resonances = db.getResonances(userId);
    const superSkills = db.getSuperSkills(userId);
    const gemstones = db.getGemstones(userId);

    // Guild
    const guildInfo = db.getGuildByUser(userId);

    // Arena
    const arenaData = db.getArenaData(userId);

    // Tower
    const towerData = db.getTowerData(userId);

    // Ball war
    const ballWarData = db.getBallWarData(userId);

    // Dungeon
    const dungeonProgress = db.getDungeonProgress(userId);

    // Shop
    const shopData = db.getShopData(userId);

    // ═══════════════════════════════════════════════════════════════
    // 7. Build enterGame response — SESUAI client saveUserData format
    //    Cross-reference: main.min(unminfy).js Line 114793-114873
    // ═══════════════════════════════════════════════════════════════

    // Parse JSON fields dari user_data
    const scheduleInfo = safeParse(user.scheduleData, null) || buildInitialScheduleInfo();
    const timesInfo = safeParse(user.timesData, {});
    const battleMedalInfo = safeParse(user.battleMedalData, {});
    const giftInfoData = safeParse(user.giftInfoData, {});

    // Parse 1:1 JSON data blocks dari user_data
    const hangupData = safeParse(user.hangupData, {});
    const summonData = safeParse(user.summonData, {});
    const heroSkinData = safeParse(user.heroSkinData, {});
    const dragonEquipedData = safeParse(user.dragonEquiped, {});
    const lastTeamData = safeParse(user.lastTeamData, {});
    const trainingData = safeParse(user.trainingData, {});
    const retrieveData = safeParse(user.retrieveData, {});
    const snakeData = safeParse(user.snakeData, {});
    const checkinData = safeParse(user.checkinData, {});
    const littleGameData = safeParse(user.littleGameData, {});
    const gravityData = safeParse(user.gravityData, {});
    const headEffectData = safeParse(user.headEffectData, {});
    const warData = safeParse(user.warData, {});
    const timeTrialData = safeParse(user.timeTrialData, {});
    const cellGameData = safeParse(user.cellGameData, {});
    const hideHeroesData = safeParse(user.hideHeroesData, {});
    const teamTrainingData = safeParse(user.teamTrainingData, {});
    const channelSpecialData = safeParse(user.channelSpecial, {});

    // ─── Build totalProps (client: e.totalProps._items) ───
    // Client reads: e.totalProps._items → array of {_id, _num}
    const _items = {};
    let itemIndex = 0;
    for (const item of items) {
        _items[String(itemIndex)] = { _id: item.itemId, _num: item.num };
        itemIndex++;
    }

    // ─── Build expedition ───
    // Client reads: e.expedition → ExpeditionManager
    const expeditionWire = expeditions.map(e => ({
        _machineId: e.machineId, _heroId: e.heroId,
        _lessonIds: safeParse(e.lessonIds, []), _teams: safeParse(e.teams, [])
    }));

    // ─── Build resonance ───
    // Client reads: e.resonance → HerosManager.setResonanceModel
    const resonanceWire = resonances.map(r => ({
        _cabinId: r.cabinId, _seatId: r.seatId, _heroId: r.heroId
    }));

    // ─── Build superSkill ───
    // Client reads: e.superSkill → plain array of super skill objects
    const superSkillWire = superSkills.map(s => ({
        _skillId: s.skillId, _level: s.level, _evolveLevel: s.evolveLevel
    }));

    // ─── Build entrust ───
    const entrustWire = entrusts.map(e => ({
        _entrustIndex: e.entrustIndex, _heroInfo: safeParse(e.heroInfo, {}),
        _status: e.status, _finishTime: e.finishTime
    }));

    // ─── Build dungeon (client: e.dungeon._dungeons) ───
    const dungeonWire = { _dungeons: dungeonProgress };

    // ─── Build tower data for karinStartTime/karinEndTime ───
    const karinStartTime = towerData ? (towerData.climbTimes || 0) : 0;
    const karinEndTime = 0;

    // ─── Build ball war ───
    const userBallWarWire = ballWarData ? {
        _state: ballWarData.state, _signedUp: ballWarData.signedUp,
        _times: ballWarData.times, _defence: safeParse(ballWarData.defence, {})
    } : {};

    // ─── Build guild related ───
    const guildName = guildInfo ? guildInfo.guildName : '';
    const guildLevel = guildInfo ? guildInfo.guildLevel || 1 : 0;
    const userGuild = guildInfo ? {
        _tech: {}
    } : null;

    // ═══════════════════════════════════════════════════════════════
    // COMPLETE ENTERGAME RESPONSE
    // Field order & names sesuai client saveUserData (main.min.js Line 114793+)
    // ═══════════════════════════════════════════════════════════════

    const enterGameData = {
        // ─── currency ───
        currency: {
            _diamond: user.diamond,
            _gold: user.gold
        },

        // ─── user (nested object — client: e.user._id, e.user._nickName, dll) ───
        user: {
            _id: user.userId,
            _pwd: '',
            _nickName: user.nickName,
            _headImage: user.headImageId,
            _lastLoginTime: user.lastLoginTime,
            _createTime: user.createTime,
            _bulletinVersions: user.bulletinRead || '',
            _oriServerId: user.serverId,
            _nickChangeTimes: user.nickChangeTimes || 0
        },

        // ─── hangup (client: e.hangup → setOnHook) ───
        hangup: hangupData,

        // ─── global war fields (client: e.globalWarBuffTag etc) ───
        globalWarBuffTag: warData._globalWarBuffTag || '',
        globalWarLastRank: warData._globalWarLastRank || 0,
        globalWarBuff: warData._globalWarBuff || {},
        globalWarBuffEndTime: warData._globalWarBuffEndTime || 0,

        // ─── summon (client: e.summon → setSummon) ───
        summon: summonData,

        // ─── totalProps (client: e.totalProps._items → [{_id, _num}]) ───
        // CRITICAL: Named "totalProps" NOT "backpack" — client reads e.totalProps
        totalProps: {
            _items: _items
        },

        // ─── backpackLevel (top-level, NOT inside totalProps) ───
        backpackLevel: user.backpackLevel || 1,

        // ─── imprint (client: e.imprint._items → NOT "sign") ───
        imprint: buildImprintItems(imprints),

        // ─── equip (client: e.equip._suits → map by heroId) ───
        equip: buildEquipSuits(equips),

        // ─── weapon (client: e.weapon._items → array) ───
        weapon: buildWeaponItems(weapons),

        // ─── genki (client: e.genki → GenkiModel) ───
        genki: buildGenkiModel(genkis),

        // ─── dungeon (client: e.dungeon._dungeons → NOT "counterpart") ───
        dungeon: dungeonWire,

        // ─── superSkill (client: e.superSkill → plain array) ───
        superSkill: superSkillWire,

        // ─── heroSkin (client: e.heroSkin → HerosManager.setSkinData) ───
        heroSkin: heroSkinData,

        // ─── heros (client: e.heros._heros → map by heroId, NOT array) ───
        heros: buildHerosMap(heroes),

        // ─── curMainTask ───
        curMainTask: null,

        // ─── checkin (client: e.checkin → WelfareInfoManager.setSignInInfo) ───
        checkin: checkinData,

        // ─── channelSpecial ───
        channelSpecial: channelSpecialData,

        // ─── scheduleInfo (client: e.scheduleInfo → AllRefreshCount.initData) ───
        scheduleInfo: scheduleInfo,

        // ─── dragonEquiped (client: e.dragonEquiped → ItemsCommonSingleton) ───
        dragonEquiped: dragonEquipedData,

        // ─── guide ───
        guide: user.guideStep || '',

        // ─── guildName ───
        guildName: guildName,

        // ─── clickSystem ───
        clickSystem: { _clickSys: safeParse(user.clickSystem, {}) },

        // ─── giftInfo ───
        giftInfo: giftInfoData,

        // ─── timesInfo ───
        timesInfo: timesInfo,

        // ─── _arenaTeam (client: e._arenaTeam → AltarInfoManger) ───
        _arenaTeam: arenaData ? safeParse(arenaData.team, {}) : {},

        // ─── _arenaSuper (client: e._arenaSuper → AltarInfoManger.setArenaSuperInfo) ───
        _arenaSuper: {},

        // ─── serverVersion ───
        serverVersion: config.version,

        // ─── serverOpenDate ───
        serverOpenDate: config.server0Time,

        // ─── lastTeam (client: e.lastTeam._lastTeamInfo) ───
        lastTeam: lastTeamData._lastTeamInfo ? lastTeamData : { _lastTeamInfo: {} },

        // ─── heroImageVersion ───
        heroImageVersion: '',

        // ─── superImageVersion ───
        superImageVersion: '',

        // ─── training (client: e.training → PadipataInfoManager) ───
        training: trainingData,

        // ─── warInfo ───
        warInfo: warData._warInfo || {},

        // ─── userWar ───
        userWar: warData._userWar || {},

        // ─── serverId ───
        serverId: user.serverId,

        // ─── headEffect ───
        headEffect: headEffectData,

        // ─── userBallWar ───
        userBallWar: userBallWarWire,

        // ─── ballWarState ───
        ballWarState: ballWarData ? ballWarData.state : 0,

        // ─── ballBroadcast ───
        ballBroadcast: '',

        // ─── ballWarInfo ───
        ballWarInfo: null,

        // ─── guildActivePoints ───
        guildActivePoints: 0,

        // ─── expedition ───
        expedition: expeditionWire,

        // ─── timeTrial ───
        timeTrial: timeTrialData,

        // ─── timeTrialNextOpenTime ───
        timeTrialNextOpenTime: 0,

        // ─── retrieve ───
        retrieve: retrieveData,

        // ─── battleMedal ───
        battleMedal: battleMedalInfo,

        // ─── gemstone (client: e.gemstone._items → array) ───
        gemstone: buildGemstoneItems(gemstones),

        // ─── resonance ───
        resonance: resonanceWire,

        // ─── fastTeam ───
        fastTeam: safeParse(user.fastTeams, {}),

        // ─── forbiddenChat (client: e.forbiddenChat → {users:{}, finishTime:{}}) ───
        forbiddenChat: user.forbiddenChat ? { users: {}, finishTime: {} } : { users: {}, finishTime: {} },

        // ─── gravity ───
        gravity: gravityData,

        // ─── littleGame ───
        littleGame: littleGameData,

        // ─── userGuild (client: e.userGuild → TeamInfoManager) ───
        userGuild: userGuild,

        // ─── userGuildPub ───
        userGuildPub: null,

        // ─── guildLevel ───
        guildLevel: guildLevel,

        // ─── hideHeroes ───
        hideHeroes: hideHeroesData,

        // ─── karinStartTime ───
        karinStartTime: karinStartTime,

        // ─── karinEndTime ───
        karinEndTime: karinEndTime,

        // ─── entrustData ───
        entrustData: entrustWire,

        // ─── cellgameHaveSetHero ───
        cellgameHaveSetHero: cellGameData._cellgameHaveSetHero || 0,

        // ─── shopNewHeroes ───
        shopNewHeroes: [],

        // ─── onlineBulletin ───
        onlineBulletin: null,

        // ─── questionnaires ───
        questionnaires: null,

        // ─── newUser / firstEnter ───
        newUser: user.firstEnter === 1 ? 1 : 0,
        _firstEnter: user.firstEnter,

        // ─── _bulletinRead ───
        _bulletinRead: user.bulletinRead || '',

        // ─── teamTraining ───
        teamTraining: teamTrainingData,

        // ─── gameVersion (echo back from client) ───
        gameVersion: gameVersion || '',

        // ─── templeLess ───
        templeLess: null,

        // ─── userTopBattle ───
        userTopBattle: null,

        // ─── topBattleInfo ───
        topBattleInfo: null,

        // ─── guildTreasureMatchRet ───
        guildTreasureMatchRet: null,

        // ─── myTeamServerSocketUrl ───
        myTeamServerSocketUrl: '',

        // ─── teamDungeon ───
        teamDungeon: null,

        // ─── teamServerHttpUrl ───
        teamServerHttpUrl: '',

        // ─── teamDungeonOpenTime ───
        teamDungeonOpenTime: 0,

        // ─── teamDungeonTask ───
        teamDungeonTask: null,

        // ─── teamDungeonSplBcst ───
        teamDungeonSplBcst: '',

        // ─── teamDungeonNormBcst ───
        teamDungeonNormBcst: '',

        // ─── teamDungeonHideInfo ───
        teamDungeonHideInfo: '',

        // ─── teamDungeonInvitedFriends ───
        teamDungeonInvitedFriends: null,

        // ─── timeMachine ───
        timeMachine: null,

        // ─── timeBonusInfo ───
        timeBonusInfo: null,

        // ─── vipLog ───
        vipLog: null,

        // ─── cardLog ───
        cardLog: null,

        // ─── monthCard ───
        monthCard: null,

        // ─── recharge ───
        recharge: null,

        // ─── userDownloadReward ───
        userDownloadReward: null,

        // ─── YouTuberRecruit ───
        YouTuberRecruit: null,

        // ─── userYouTuberRecruit ───
        userYouTuberRecruit: null,

        // ─── summonLog ───
        summonLog: [],

        // ─── QQ-specific (safe defaults) ───
        enableShowQQ: 0,
        showQQVip: 0,
        showQQ: '',
        showQQImg1: '',
        showQQImg2: '',
        showQQUrl: ''
    };

    const duration = Date.now() - startTime;
    logger.log('INFO', 'ENTER', 'enterGame success');
    logger.details('data',
        ['userId', userId],
        ['level', String(user.level)],
        ['heroes', String(heroes.length)],
        ['items', String(items.length)],
        ['duration', duration + 'ms']
    );

    // Mark firstEnter = 0 setelah pertama kali
    if (user.firstEnter === 1) {
        db.updateUserFields(userId, { firstEnter: 0 });
    }

    return responseHelper.buildSuccess(enterGameData);
}

module.exports = handleEnterGame;
