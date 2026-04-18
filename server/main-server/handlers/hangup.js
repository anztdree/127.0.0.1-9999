/**
 * =====================================================
 *  Hangup Handler — handlers/hangup.js
 *  Super Warrior Z Game Server — Main Server (Port 8001)
 *
 *  Sistem HANGUP = Sistem Progression Utama (Story Lesson)
 *  BUKAN idle/AFK system — ini adalah lesson/stage progression.
 *
 *  CLIENT PROTOCOL (from main.min.js analysis):
 *
 *  type: "hangup" actions:
 *    startGeneral       → Start lesson battle (REQ: team, super, battleField)
 *    checkBattleResult  → Submit battle result (REQ: battleId, checkResult, super, battleField)
 *    saveGuideTeam      → Save team during tutorial (REQ: team, supers)
 *    nextChapter        → Advance to next chapter (REQ: -)
 *    getChapterReward   → Claim chapter completion reward (REQ: chapterId)
 *    gain               → Collect idle/gain rewards (REQ: -)
 *    buyLessonFund      → Purchase lesson battle pass (REQ: -)
 *    getLessonFundReward → Claim battle pass reward (REQ: -)
 *
 *  DB Integration:
 *    All write actions load/save user game_data via userDataService.
 *    The game_data JSON is stored in the user_data table (MariaDB).
 *
 *  Usage:
 *    handler.handle(socket, parsedRequest, callback)
 * =====================================================
 */

'use strict';

var RH = require('../../shared/responseHelper');
var DB = require('../../database/connection');
var DefaultData = require('../../shared/defaultData');
var GameData = require('../../shared/gameData/loader');
var logger = require('../../shared/utils/logger');
var userDataService = require('../services/userDataService');

// =============================================
// CONSTANTS
// =============================================

var ITEM_IDS = DefaultData.ITEM_IDS;
var GAME_CONSTANTS = DefaultData.GAME_CONSTANTS;

// Max idle time in seconds (8 hours) — from constant.json
var DEFAULT_MAX_IDLE_SECONDS = 28800;

// Last team type for hangup battles — from client LAST_TEAM_TYPE
var LAST_TEAM_TYPE_HANGUP = 9;

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Generate a unique battle ID for tracking battles.
 * Uses timestamp + random string for uniqueness.
 */
function generateBattleId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
}

/**
 * Build enemy team from lesson config — returns client-expected _rightTeam format.
 *
 * enemyList format: ",,,55206," → 5 comma-separated slots (positions 0-4)
 * Empty string = no enemy in that slot.
 *
 * Returns: Object keyed by position string {"0": heroObj, "1": heroObj, ...}
 * Each hero has: _heroDisplayId, _heroLevel, _heroStar, _skinId,
 *   _weaponHaloId, _weaponHaloLevel, _skills, _attrs._items
 */
function buildRightTeam(enemyList, enemyLevel) {
    var rightTeam = {};
    var ids = (enemyList || '').split(',');
    var levels = (enemyLevel || '').split(',');

    var heroConfigs = GameData.get('hero');
    var levelAttrs = GameData.get('heroLevelAttr');
    var skillConfigs = GameData.get('skill');
    var typeParams = GameData.get('heroTypeParam');
    var qualityParams = GameData.get('heroQualityParam');

    // Skill type mapping: skill.json skillType → client _type
    var skillTypeMap = {
        'normal': 0,
        'skill': 1,
        'skillPassive': 2,
        'super': 3,
        'potential': 4
    };

    for (var i = 0; i < 5; i++) {
        var displayId = (ids[i] || '').trim();
        if (displayId === '') continue;

        var level = parseInt(levels[i]) || 1;
        var heroConfig = heroConfigs && heroConfigs[String(displayId)];

        if (!heroConfig) {
            logger.warn('HANGUP', 'buildRightTeam: hero config not found for displayId=' + displayId);
            continue;
        }

        var heroType = heroConfig.type || 'skill';
        var heroQuality = heroConfig.quality || 'white';

        // Get type and quality multipliers
        var tp = typeParams && typeParams[heroType] || { hpParam: 1, attackParam: 1, armorParam: 1, hpBais: 0, attackBais: 0, armorBais: 0 };
        var qp = qualityParams && qualityParams[heroQuality] || { hpParam: 1, attackParam: 1, armorParam: 1 };

        // Get base level attributes
        var la = levelAttrs && levelAttrs[String(Math.min(level, 349))];
        var baseHp = la ? Number(la.hp) : 1240;
        var baseAttack = la ? Number(la.attack) : 125;
        var baseArmor = la ? Number(la.armor) : 205;

        // Calculate final attributes: (base * typeParam + typeBais) * qualityParam
        var finalHp = Math.round((baseHp * Number(tp.hpParam) + Number(tp.hpBais || 0)) * Number(qp.hpParam));
        var finalAttack = Math.round((baseAttack * Number(tp.attackParam) + Number(tp.attackBais || 0)) * Number(qp.attackParam));
        var finalArmor = Math.round((baseArmor * Number(tp.armorParam) + Number(tp.armorBais || 0)) * Number(qp.armorParam));
        var speed = Number(heroConfig.speed) || 360;
        var energyMax = Number(heroConfig.energyMax) || 100;

        // Build skills object from hero config
        var skills = {};
        var skillFields = [
            { id: heroConfig.normal, level: 1 },
            { id: heroConfig.skill, level: Number(heroConfig.skillLevel) || 1 },
            { id: heroConfig.skillPassive1, level: Number(heroConfig.passiveLevel1) || 1 },
            { id: heroConfig.skillPassive2, level: Number(heroConfig.passiveLevel2) || 1 },
            { id: heroConfig.super, level: 1 },
            { id: heroConfig.potential1, level: 1 },
            { id: heroConfig.potential2, level: 1 }
        ];

        for (var s = 0; s < skillFields.length; s++) {
            var sf = skillFields[s];
            if (!sf.id || Number(sf.id) === 0) continue;

            var sid = String(sf.id);
            var skillConfig = skillConfigs && skillConfigs[sid];
            var clientType = skillConfig && skillTypeMap[skillConfig.skillType];
            if (clientType === undefined) clientType = 1; // default to proactive

            skills[sid] = {
                _type: clientType,
                _id: Number(sf.id),
                _level: sf.level
            };
        }

        // Build attrs
        var attrs = {
            '0': { _id: 0, _num: finalHp },           // Health
            '1': { _id: 1, _num: finalAttack },         // Attack
            '2': { _id: 2, _num: finalArmor },          // Armor
            '3': { _id: 3, _num: speed },               // Speed
            '22': { _id: 22, _num: finalHp },           // FullHealth = Health
            '41': { _id: 41, _num: energyMax },          // ENERGYMAX
            '104': { _id: 104, _num: baseAttack },       // HeroBasicAttack
            '105': { _id: 105, _num: baseHp },           // HeroBasicHP
            '106': { _id: 106, _num: baseArmor }         // heroBasicArmor
        };

        rightTeam[String(i)] = {
            _heroDisplayId: Number(displayId),
            _heroLevel: level,
            _heroStar: 0,
            _skinId: 0,
            _weaponHaloId: 0,
            _weaponHaloLevel: 0,
            _skills: skills,
            _attrs: { _items: attrs }
        };
    }

    return rightTeam;
}

/**
 * Build _changeInfo._items from lesson awards.
 * Reads award1-num1, award2-num2, ... award5-num5 from lesson config.
 * Always includes PlayerExp (103) and PlayerLevel (104).
 *
 * Items format: { itemId: { _id: itemId, _num: count } }
 *
 * @param {object} lessonConfig - Lesson data from lesson.json
 * @returns {object} Items object keyed by item ID string
 */
function buildBattleAwardItems(lessonConfig) {
    var items = {};

    // Parse up to 5 award slots from lesson config
    for (var i = 1; i <= 5; i++) {
        var awardId = lessonConfig['award' + i];
        var awardNum = lessonConfig['num' + i];
        if (awardId && awardNum) {
            var idStr = String(awardId);
            items[idStr] = { _id: Number(awardId), _num: Number(awardNum) };
        }
    }

    return items;
}

/**
 * Calculate idle rewards based on elapsed time and lesson config.
 *
 * Formula: num = Math.floor(rewardNum * seconds * (1 + vipBonus))
 * Capped at max idle time (from idleVipPlus.json or default 28800).
 *
 * @param {object} lessonConfig - Current lesson config for idle rewards
 * @param {number} elapsedSeconds - Seconds since last gain
 * @param {number} vipLevel - Player's VIP level (0 = no VIP)
 * @returns {object} Items object with idle rewards
 */
function calculateIdleRewards(lessonConfig, elapsedSeconds, vipLevel) {
    var items = {};
    var idleVipPlus = GameData.get('idleVipPlus');

    // Get VIP-specific bonus and max time
    var vipBonus = 0;
    var maxIdleSeconds = DEFAULT_MAX_IDLE_SECONDS;
    if (idleVipPlus && idleVipPlus[String(vipLevel)]) {
        var vipData = idleVipPlus[String(vipLevel)];
        vipBonus = Number(vipData.idleAwardPlus) || 0;
        maxIdleSeconds = Number(vipData.idleMaxTime) || DEFAULT_MAX_IDLE_SECONDS;
    }

    // Cap elapsed time at max idle time
    var effectiveSeconds = Math.min(elapsedSeconds, maxIdleSeconds);

    if (effectiveSeconds <= 0) {
        // No idle rewards — return empty
        return items;
    }

    // Calculate multiplier including VIP bonus
    var multiplier = 1 + vipBonus;

    // Parse up to 4 idle reward slots from lesson config
    for (var i = 1; i <= 4; i++) {
        var rewardId = lessonConfig['idleReward' + i];
        var rewardRate = lessonConfig['rewardNum' + i];
        if (rewardId && rewardRate) {
            var num = Math.floor(Number(rewardRate) * effectiveSeconds * multiplier);
            if (num > 0) {
                var idStr = String(rewardId);
                items[idStr] = { _id: Number(rewardId), _num: num };
            }
        }
    }

    return items;
}

/**
 * Get player's VIP level from totalProps.
 *
 * @param {object} gameData - User's full game data
 * @returns {number} VIP level (0 if not found)
 */
function getPlayerVipLevel(gameData) {
    try {
        var vipItem = gameData.totalProps._items[String(ITEM_IDS.PLAYERVIPLEVELID)];
        if (vipItem && vipItem._num) {
            return Number(vipItem._num) || 0;
        }
    } catch (e) {
        // totalProps or _items might not exist
    }
    return 0;
}

/**
 * Apply item deltas to totalProps._items.
 * For each item in the change, add _num to the current total.
 * Creates the item entry if it doesn't exist.
 *
 * @param {object} totalPropsItems - Current totalProps._items
 * @param {object} deltaItems - Items to add { itemId: { _id, _num } }
 */
function applyItemDeltas(totalPropsItems, deltaItems) {
    var keys = Object.keys(deltaItems);
    for (var i = 0; i < keys.length; i++) {
        var itemId = keys[i];
        var delta = deltaItems[itemId];
        if (!delta) continue;

        var currentNum = 0;
        if (totalPropsItems[itemId] && totalPropsItems[itemId]._num) {
            currentNum = Number(totalPropsItems[itemId]._num) || 0;
        }

        totalPropsItems[itemId] = {
            _id: delta._id,
            _num: currentNum + Number(delta._num)
        };
    }
}

/**
 * Build chapter reward items from chapter config.
 *
 * @param {object} chapterConfig - Chapter data from chapter.json
 * @returns {object} Items object keyed by item ID string
 */
function buildChapterRewardItems(chapterConfig) {
    var items = {};

    for (var i = 1; i <= 5; i++) {
        var rewardId = chapterConfig['chapterReward' + i];
        var rewardNum = chapterConfig['num' + i];
        if (rewardId && rewardNum) {
            var idStr = String(rewardId);
            items[idStr] = { _id: Number(rewardId), _num: Number(rewardNum) };
        }
    }

    return items;
}

// =============================================
// ACTION HANDLERS
// =============================================

/**
 * startGeneral — Start a lesson/stage battle.
 *
 * CLIENT REQUEST: { type, action, userId, version:"1.0", team, super, battleField }
 *
 * RESPONSE FIELDS (what client reads):
 *   _battleId   → string battle ID (used in checkBattleResult)
 *   _rightTeam  → object keyed by position {"0": heroObj, ...}
 *   _rightSuper → enemy super skills array (empty for hangup)
 *
 * _rightTeam hero format:
 *   _heroDisplayId, _heroLevel, _heroStar, _skinId,
 *   _weaponHaloId, _weaponHaloLevel,
 *   _skills: {skillId: {_type, _id, _level}, ...}
 *   _attrs: {_items: {attrId: {_id, _num}, ...}}
 *
 * Does NOT save to DB — battle hasn't happened yet.
 */
async function handleStartGeneral(socket, parsed, callback) {
    var userId = parsed.userId;

    logger.info('HANGUP', 'startGeneral: userId=' + (userId || '-'));

    try {
        var gameData = await userDataService.loadUserData(userId, 1);
        if (!gameData) {
            logger.error('HANGUP', 'startGeneral: user data not found for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User data not found'));
        }

        var curLess = gameData.hangup._curLess || GAME_CONSTANTS.startLesson;

        var lessonConfigs = GameData.get('lesson');
        if (!lessonConfigs || !lessonConfigs[String(curLess)]) {
            logger.error('HANGUP', 'startGeneral: lesson config not found for lessonId=' + curLess);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Lesson config not found'));
        }

        var lessonConfig = lessonConfigs[String(curLess)];

        // Build enemy team in client-expected _rightTeam format
        var rightTeam = buildRightTeam(
            lessonConfig.enemyList || '',
            lessonConfig.enemyLevel || ''
        );

        var battleId = generateBattleId();
        var enemyCount = Object.keys(rightTeam).length;

        logger.info('HANGUP', 'startGeneral: lessonId=' + curLess +
            ', enemies=' + enemyCount + ', battleId=' + battleId);

        // Echo request params as real server does (client ignores them)
        var startResponse = {
            _battleId: battleId,
            _rightTeam: rightTeam,
            _rightSuper: []
        };
        if (parsed.team !== undefined) startResponse.team = parsed.team;
        if (parsed.super !== undefined) startResponse.super = parsed.super;
        if (parsed.battleField !== undefined) startResponse.battleField = parsed.battleField;
        callback(RH.success(startResponse));

    } catch (err) {
        logger.error('HANGUP', 'startGeneral error: ' + err.message + ', stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

/**
 * checkBattleResult — Submit and process battle result.
 *
 * NORMAL REQUEST: { type, action, userId, battleId, version, super, checkResult, battleField, runaway }
 * GUIDE REQUEST:  { type, action, userId, version, isGuide: true }  — NO checkResult, NO battleId
 *   Guide battles are predetermined wins (tutorial cannot fail).
 *
 * RESPONSE FIELDS (what client reads):
 *   _battleResult          → 0=WIN, 1=LOSE
 *   _curLess               → current lesson ID (advanced on WIN)
 *   _maxPassLesson         → highest lesson cleared
 *   _maxPassChapter        → highest chapter cleared (normal WIN only, guide ignores)
 *   _changeInfo._items     → {itemId: {_id, _num}} battle award items (WIN only)
 *
 * WIN:  advance lesson, give awards, save DB.
 * LOSE: no progress, no rewards, no save.
 * GUIDE: always WIN — same as WIN path.
 */
async function handleCheckBattleResult(socket, parsed, callback) {
    var userId = parsed.userId;
    var isGuide = parsed.isGuide;

    // Guide/tutorial battles are predetermined wins — client sends isGuide:true WITHOUT checkResult
    var won = isGuide ? true : (parsed.checkResult === 0 || parsed.checkResult === '0');

    logger.info('HANGUP', 'checkBattleResult: userId=' + (userId || '-') +
        ', won=' + won + ', isGuide=' + (isGuide ? 'true' : 'false'));

    try {
        var gameData = await userDataService.loadUserData(userId, 1);
        if (!gameData) {
            logger.error('HANGUP', 'checkBattleResult: user data not found for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User data not found'));
        }

        var hangup = gameData.hangup;
        var curLess = hangup._curLess || GAME_CONSTANTS.startLesson;
        var maxPassLesson = hangup._maxPassLesson || GAME_CONSTANTS.startLesson;
        var maxPassChapter = hangup._maxPassChapter || GAME_CONSTANTS.startChapter;

        if (!won) {
            // LOSE — no progress, no rewards, no DB save
            // Echo request params as real server does (client ignores them)
            logger.info('HANGUP', 'checkBattleResult: player lost, no progress for userId=' + userId);

            var loseResponse = {
                _battleResult: 1,
                _curLess: curLess,
                _maxPassLesson: maxPassLesson,
                _maxPassChapter: maxPassChapter,
                _changeInfo: { _items: {} }
            };
            // Echo request params (normal battle only)
            if (!isGuide) {
                if (parsed.battleId !== undefined) loseResponse.battleId = parsed.battleId;
                if (parsed.super !== undefined) loseResponse.super = parsed.super;
                if (parsed.checkResult !== undefined) loseResponse.checkResult = parsed.checkResult;
                if (parsed.battleField !== undefined) loseResponse.battleField = parsed.battleField;
                if (parsed.runaway !== undefined) loseResponse.runaway = parsed.runaway;
            }
            callback(RH.success(loseResponse));
            return;
        }

        // WIN — advance lesson, give awards
        var lessonConfigs = GameData.get('lesson');
        if (!lessonConfigs || !lessonConfigs[String(curLess)]) {
            logger.error('HANGUP', 'checkBattleResult: lesson config not found for lessonId=' + curLess);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Lesson config not found'));
        }

        var lessonConfig = lessonConfigs[String(curLess)];

        // Build battle award items from lesson config (these are DELTAS)
        var awardItems = buildBattleAwardItems(lessonConfig);

        // Apply item deltas to totalProps
        if (gameData.totalProps && gameData.totalProps._items) {
            applyItemDeltas(gameData.totalProps._items, awardItems);
        }

        // Build response items with TOTAL values from totalProps
        // Client expects _num = total amount, NOT delta
        var responseItems = {};
        if (gameData.totalProps && gameData.totalProps._items) {
            for (var itemId in awardItems) {
                var totalItem = gameData.totalProps._items[itemId];
                if (totalItem) {
                    responseItems[itemId] = { _id: totalItem._id, _num: totalItem._num };
                }
            }
        }

        // Update hangup state
        var newCurLess = curLess;
        var newMaxPassLesson = Math.max(curLess, maxPassLesson);
        var newMaxPassChapter = maxPassChapter;

        // Advance to next lesson if available
        if (lessonConfig.nextID) {
            newCurLess = Number(lessonConfig.nextID);
        }

        // Update max pass chapter if entering a new chapter
        if (lessonConfig.nextChapter) {
            var nextChapterId = Number(lessonConfig.nextChapter);
            if (nextChapterId > newMaxPassChapter) {
                newMaxPassChapter = nextChapterId;
            }
        }

        // Apply updates to game data
        gameData.hangup._curLess = newCurLess;
        gameData.hangup._maxPassLesson = newMaxPassLesson;
        gameData.hangup._maxPassChapter = newMaxPassChapter;

        // Save to DB
        await userDataService.saveUserData(userId, gameData, 1);

        logger.info('HANGUP', 'checkBattleResult: won lesson=' + curLess +
            ', next=' + newCurLess +
            ', maxPassLesson=' + newMaxPassLesson +
            ', maxPassChapter=' + newMaxPassChapter +
            ', isGuide=' + (isGuide ? 'true' : 'false'));

        var winResponse = {
            _battleResult: 0,
            _curLess: newCurLess,
            _maxPassLesson: newMaxPassLesson,
            _maxPassChapter: newMaxPassChapter,
            _changeInfo: { _items: responseItems }
        };
        // Echo request params as real server does (normal battle only, not guide)
        if (!isGuide) {
            if (parsed.battleId !== undefined) winResponse.battleId = parsed.battleId;
            if (parsed.super !== undefined) winResponse.super = parsed.super;
            if (parsed.checkResult !== undefined) winResponse.checkResult = parsed.checkResult;
            if (parsed.battleField !== undefined) winResponse.battleField = parsed.battleField;
            if (parsed.runaway !== undefined) winResponse.runaway = parsed.runaway;
        }
        callback(RH.success(winResponse));

    } catch (err) {
        logger.error('HANGUP', 'checkBattleResult error: ' + err.message + ', stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

/**
 * saveGuideTeam — Save team formation during tutorial.
 *
 * GUIDE REQUEST: { type, action, userId, team, supers, version:"1.0" }
 *   team   = [{heroId, ...}, null, ...] — index=position, null=empty slot
 *   supers = [superSkillId, ...] — selected super skill IDs
 *
 * RESPONSE: client ignores response entirely, proceeds to checkBattleResult.
 *
 * Saves to lastTeam._lastTeamInfo[9] in client-expected LastTeamInfo format:
 *   _team  = [{_heroId, _position}, ...] — nulls removed, underscore prefix
 *   _super = [superSkillId, ...] — underscore prefix, no "Skill" suffix
 */
async function handleSaveGuideTeam(socket, parsed, callback) {
    var userId = parsed.userId;
    var team = parsed.team || [];
    var supers = parsed.supers || [];

    logger.info('HANGUP', 'saveGuideTeam: userId=' + (userId || '-') +
        ', teamCount=' + team.length + ', supersCount=' + supers.length);

    try {
        var gameData = await userDataService.loadUserData(userId, 1);
        if (!gameData) {
            logger.error('HANGUP', 'saveGuideTeam: user data not found for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User data not found'));
        }

        // Ensure lastTeam structure exists
        if (!gameData.lastTeam) gameData.lastTeam = {};
        if (!gameData.lastTeam._lastTeamInfo) gameData.lastTeam._lastTeamInfo = {};

        // Transform team to client LastTeamInfo format: remove nulls, add _heroId/_position
        var formattedTeam = [];
        for (var i = 0; i < team.length; i++) {
            if (team[i] != null) {
                formattedTeam.push({ _heroId: team[i].heroId, _position: i });
            }
        }

        // Save in client-expected LastTeamInfo format
        gameData.lastTeam._lastTeamInfo[LAST_TEAM_TYPE_HANGUP] = {
            _team: formattedTeam,
            _super: supers
        };

        // Save to DB
        await userDataService.saveUserData(userId, gameData, 1);

        logger.info('HANGUP', 'saveGuideTeam: saved guide team for userId=' + userId);

        callback(RH.success({}));

    } catch (err) {
        logger.error('HANGUP', 'saveGuideTeam error: ' + err.message + ', stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

/**
 * nextChapter — Advance to the next chapter.
 *
 * CLIENT REQUEST:
 * { type: "hangup", action: "nextChapter", userId: string }
 *
 * CLIENT RESPONSE:
 *   _curLess → next chapter's first lesson ID
 *
 * Sets OnHookSingleton.lastSection = e._curLess and navigates to home.
 *
 * The _curLess is typically already set to the next chapter's first lesson
 * by the previous checkBattleResult (when the player beat the last lesson
 * of a chapter). This action confirms the chapter transition.
 */
async function handleNextChapter(socket, parsed, callback) {
    var userId = parsed.userId;

    logger.info('HANGUP', 'nextChapter: userId=' + (userId || '-'));

    try {
        // Load user data
        var gameData = await userDataService.loadUserData(userId, 1);
        if (!gameData) {
            logger.error('HANGUP', 'nextChapter: user data not found for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User data not found'));
        }

        var curLess = gameData.hangup._curLess || GAME_CONSTANTS.startLesson;
        var lessonConfigs = GameData.get('lesson');

        // If current lesson has a nextChapter that differs from thisChapter,
        // look up the first lesson of that chapter and set curLess
        if (lessonConfigs && lessonConfigs[String(curLess)]) {
            var lessonConfig = lessonConfigs[String(curLess)];

            if (lessonConfig.nextChapter && lessonConfig.thisChapter) {
                var thisChapter = Number(lessonConfig.thisChapter);
                var nextChapter = Number(lessonConfig.nextChapter);

                // If we're crossing a chapter boundary, find first lesson of next chapter
                if (nextChapter !== thisChapter) {
                    var chapterConfigs = GameData.get('chapter');
                    if (chapterConfigs && chapterConfigs[String(nextChapter)]) {
                        var chapterConfig = chapterConfigs[String(nextChapter)];
                        if (chapterConfig.lessonID) {
                            curLess = Number(chapterConfig.lessonID);
                            gameData.hangup._curLess = curLess;
                            await userDataService.saveUserData(userId, gameData, 1);

                            logger.info('HANGUP', 'nextChapter: advanced to chapter=' +
                                nextChapter + ', firstLesson=' + curLess);
                        }
                    }
                }
            }
        }

        callback(RH.success({
            _curLess: curLess
        }));

    } catch (err) {
        logger.error('HANGUP', 'nextChapter error: ' + err.message + ', stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

/**
 * getChapterReward — Claim chapter completion reward.
 *
 * CLIENT REQUEST:
 * { type: "hangup", action: "getChapterReward", userId: string, chapterId: number }
 *
 * CLIENT RESPONSE:
 *   _changeInfo._items → reward items from chapter.json (chapterReward1/num1, etc.)
 *
 * Sets OnHookSingleton.haveGotChapterReward[chapterId] = true.
 */
async function handleGetChapterReward(socket, parsed, callback) {
    var userId = parsed.userId;
    var chapterId = parsed.chapterId;

    logger.info('HANGUP', 'getChapterReward: userId=' + (userId || '-') +
        ', chapterId=' + chapterId);

    if (!chapterId) {
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing chapterId'));
    }

    try {
        // Load user data
        var gameData = await userDataService.loadUserData(userId, 1);
        if (!gameData) {
            logger.error('HANGUP', 'getChapterReward: user data not found for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User data not found'));
        }

        // Check if already claimed
        if (gameData.hangup._haveGotChapterReward &&
            gameData.hangup._haveGotChapterReward[String(chapterId)]) {
            logger.warn('HANGUP', 'getChapterReward: already claimed for chapterId=' + chapterId);
            // Return empty reward — client already has it marked
            callback(RH.success({
                _changeInfo: {
                    _items: {}
                }
            }));
            return;
        }

        // Get chapter config for rewards
        var chapterConfigs = GameData.get('chapter');
        if (!chapterConfigs || !chapterConfigs[String(chapterId)]) {
            logger.error('HANGUP', 'getChapterReward: chapter config not found for chapterId=' + chapterId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Chapter config not found'));
        }

        var chapterConfig = chapterConfigs[String(chapterId)];

        // Build reward item deltas from chapter config
        var rewardDeltas = buildChapterRewardItems(chapterConfig);

        // Apply item deltas to totalProps
        if (gameData.totalProps && gameData.totalProps._items) {
            applyItemDeltas(gameData.totalProps._items, rewardDeltas);
        }

        // Build response items with TOTAL values from totalProps
        var chapterResponseItems = {};
        if (gameData.totalProps && gameData.totalProps._items) {
            for (var itemId in rewardDeltas) {
                var totalItem = gameData.totalProps._items[itemId];
                if (totalItem) {
                    chapterResponseItems[itemId] = { _id: totalItem._id, _num: totalItem._num };
                }
            }
        }

        // Mark chapter reward as claimed
        if (!gameData.hangup._haveGotChapterReward) {
            gameData.hangup._haveGotChapterReward = {};
        }
        gameData.hangup._haveGotChapterReward[String(chapterId)] = true;

        // Save to DB
        await userDataService.saveUserData(userId, gameData, 1);

        logger.info('HANGUP', 'getChapterReward: claimed chapter=' + chapterId +
            ', rewardItems=' + Object.keys(chapterResponseItems).length);

        // Echo request params + universal response fields as real server does
        callback(RH.success({
            chapterId: chapterId,
            _addSigns: [],
            _addWeapons: [],
            _addHeroes: [],
            _addGenkis: [],
            _addStones: [],
            _changeInfo: {
                _items: chapterResponseItems
            }
        }));

    } catch (err) {
        logger.error('HANGUP', 'getChapterReward error: ' + err.message + ', stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

/**
 * gain — Collect idle/gain rewards from offline time.
 *
 * CLIENT REQUEST:
 * { type: "hangup", action: "gain", userId: string, version: "1.0" }
 *
 * CLIENT RESPONSE:
 *   _changeInfo._items       → idle reward items based on time elapsed
 *   _lastGainTime            → timestamp of when gain was collected
 *   _exCount                 → extra count (0 for now)
 *   _clickGlobalWarBuffTag   → string (global war buff tag)
 *
 * Idle reward calculation:
 *   - Max idle time from constant.json: 28800 seconds (8 hours)
 *   - VIP bonus from idleVipPlus.json (idleAwardPlus multiplier)
 *   - Formula: num = Math.floor(rewardNum * seconds * (1 + vipBonus))
 *   - Rewards from lesson.json: idleReward1/rewardNum1, etc.
 */
async function handleGain(socket, parsed, callback) {
    var userId = parsed.userId;

    logger.info('HANGUP', 'gain: userId=' + (userId || '-'));

    try {
        // Load user data
        var gameData = await userDataService.loadUserData(userId, 1);
        if (!gameData) {
            logger.error('HANGUP', 'gain: user data not found for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User data not found'));
        }

        var now = Date.now();
        var hangup = gameData.hangup;

        // Determine the start time for idle calculation
        // Priority: _lastGainTime > _lastLoginTime > now
        var lastGainTime = hangup._lastGainTime || 0;
        var lastLoginTime = 0;
        if (gameData.user && gameData.user._lastLoginTime) {
            lastLoginTime = Number(gameData.user._lastLoginTime) || 0;
        }
        var startTime = lastGainTime > 0 ? lastGainTime : lastLoginTime;

        // Calculate elapsed seconds
        var elapsedMs = now - startTime;
        var elapsedSeconds = Math.floor(elapsedMs / 1000);

        // Cap at max idle time (default 28800, may be overridden by VIP)
        var idleVipPlus = GameData.get('idleVipPlus');
        var vipLevel = getPlayerVipLevel(gameData);
        var maxIdleSeconds = DEFAULT_MAX_IDLE_SECONDS;
        if (idleVipPlus && idleVipPlus[String(vipLevel)]) {
            maxIdleSeconds = Number(idleVipPlus[String(vipLevel)].idleMaxTime) || DEFAULT_MAX_IDLE_SECONDS;
        }
        if (elapsedSeconds > maxIdleSeconds) {
            elapsedSeconds = maxIdleSeconds;
        }

        // Get current lesson config for idle rewards
        var curLess = hangup._curLess || GAME_CONSTANTS.startLesson;
        var lessonConfigs = GameData.get('lesson');
        var lessonConfig = null;
        if (lessonConfigs && lessonConfigs[String(curLess)]) {
            lessonConfig = lessonConfigs[String(curLess)];
        }

        // Calculate idle reward deltas
        var idleDeltas = {};
        if (lessonConfig) {
            idleDeltas = calculateIdleRewards(lessonConfig, elapsedSeconds, vipLevel);
        }

        // Apply item deltas to totalProps
        if (gameData.totalProps && gameData.totalProps._items) {
            applyItemDeltas(gameData.totalProps._items, idleDeltas);
        }

        // Build response items with TOTAL values from totalProps
        // Client expects _num = total amount, NOT delta
        var gainResponseItems = {};
        if (gameData.totalProps && gameData.totalProps._items) {
            for (var itemId in idleDeltas) {
                var totalItem = gameData.totalProps._items[itemId];
                if (totalItem) {
                    gainResponseItems[itemId] = { _id: totalItem._id, _num: totalItem._num };
                }
            }
        }

        // Update last gain time
        gameData.hangup._lastGainTime = now;

        // Save to DB
        await userDataService.saveUserData(userId, gameData, 1);

        var rewardCount = Object.keys(idleDeltas).length;
        logger.info('HANGUP', 'gain: userId=' + userId +
            ', elapsed=' + elapsedSeconds + 's' +
            ', vipLevel=' + vipLevel +
            ', rewards=' + rewardCount +
            ', lastGainTime=' + now);

        callback(RH.success({
            _changeInfo: {
                _items: gainResponseItems
            },
            _lastGainTime: now,
            _exCount: 0,
            _clickGlobalWarBuffTag: hangup._clickGlobalWarBuffTag || ''
        }));

    } catch (err) {
        logger.error('HANGUP', 'gain error: ' + err.message + ', stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

/**
 * buyLessonFund — Purchase lesson battle pass.
 *
 * CLIENT REQUEST:
 * { type: "hangup", action: "buyLessonFund", userId: string, version: "1.0" }
 *
 * CLIENT RESPONSE:
 *   _changeInfo._buyFund → true
 *   _changeInfo._items   → {} (no items on purchase)
 */
async function handleBuyLessonFund(socket, parsed, callback) {
    var userId = parsed.userId;

    logger.info('HANGUP', 'buyLessonFund: userId=' + (userId || '-'));

    try {
        // Load user data
        var gameData = await userDataService.loadUserData(userId, 1);
        if (!gameData) {
            logger.error('HANGUP', 'buyLessonFund: user data not found for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User data not found'));
        }

        // Check if already purchased
        if (gameData.hangup._buyFund) {
            logger.warn('HANGUP', 'buyLessonFund: already purchased for userId=' + userId);
            // Return success anyway — client already knows
            callback(RH.success({
                _changeInfo: {
                    _buyFund: true,
                    _items: {}
                }
            }));
            return;
        }

        // Mark fund as purchased
        gameData.hangup._buyFund = true;

        // Save to DB
        await userDataService.saveUserData(userId, gameData, 1);

        logger.info('HANGUP', 'buyLessonFund: purchased for userId=' + userId);

        callback(RH.success({
            _changeInfo: {
                _buyFund: true,
                _items: {}
            }
        }));

    } catch (err) {
        logger.error('HANGUP', 'buyLessonFund error: ' + err.message + ', stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

/**
 * getLessonFundReward — Claim battle pass (lesson fund) reward.
 *
 * CLIENT REQUEST:
 * { type: "hangup", action: "getLessonFundReward", userId: string, version: "1.0" }
 *
 * CLIENT RESPONSE:
 *   _changeInfo._items           → {} (fund reward items)
 *   _changeInfo._haveGotFundReward → {} (track claimed fund rewards)
 */
async function handleGetLessonFundReward(socket, parsed, callback) {
    var userId = parsed.userId;

    logger.info('HANGUP', 'getLessonFundReward: userId=' + (userId || '-'));

    try {
        // Load user data
        var gameData = await userDataService.loadUserData(userId, 1);
        if (!gameData) {
            logger.error('HANGUP', 'getLessonFundReward: user data not found for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User data not found'));
        }

        var haveGotFundReward = gameData.hangup._haveGotFundReward || {};

        // Ensure structure exists
        if (!gameData.hangup._haveGotFundReward) {
            gameData.hangup._haveGotFundReward = {};
        }

        // Save to DB (state may be unchanged but ensure consistency)
        await userDataService.saveUserData(userId, gameData, 1);

        logger.info('HANGUP', 'getLessonFundReward: returned for userId=' + userId);

        callback(RH.success({
            _changeInfo: {
                _items: {},
                _haveGotFundReward: haveGotFundReward
            }
        }));

    } catch (err) {
        logger.error('HANGUP', 'getLessonFundReward error: ' + err.message + ', stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

// =============================================
// MAIN ROUTER
// =============================================

/**
 * Main handler function — routes actions to specific handlers.
 *
 * Called by main-server/index.js:
 *   handler.handle(socket, parsedRequest, callback)
 *
 * @param {object} socket - Socket.IO socket instance
 * @param {object} parsed - Parsed request from ResponseHelper.parseRequest()
 *   { type, action, userId, ...params }
 * @param {function} callback - Socket.IO acknowledgment callback
 */
async function handle(socket, parsed, callback) {
    var action = parsed.action;
    var userId = parsed.userId;

    if (!action) {
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing action'));
    }

    try {
        switch (action) {
            case 'startGeneral':
                await handleStartGeneral(socket, parsed, callback);
                break;

            case 'checkBattleResult':
                await handleCheckBattleResult(socket, parsed, callback);
                break;

            case 'saveGuideTeam':
                await handleSaveGuideTeam(socket, parsed, callback);
                break;

            case 'nextChapter':
                await handleNextChapter(socket, parsed, callback);
                break;

            case 'getChapterReward':
                await handleGetChapterReward(socket, parsed, callback);
                break;

            case 'gain':
                await handleGain(socket, parsed, callback);
                break;

            case 'buyLessonFund':
                await handleBuyLessonFund(socket, parsed, callback);
                break;

            case 'getLessonFundReward':
                await handleGetLessonFundReward(socket, parsed, callback);
                break;

            // Legacy/unknown actions — return success to prevent client crashes
            default:
                logger.warn('HANGUP', 'Unknown action: ' + action +
                    ' from userId=' + (userId || '-') + ', returning empty success');
                callback(RH.success({}));
                break;
        }
    } catch (err) {
        logger.error('HANGUP', 'Handler error for action=' + action + ': ' + err.message);
        logger.error('HANGUP', 'Stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

module.exports = { handle: handle };
