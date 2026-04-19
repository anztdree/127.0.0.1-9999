'use strict';

/**
 * =====================================================
 *  hero.js — Hero Management Handler
 *  Super Warrior Z Game Server — Main Server
 *
 *  CORE GAMEPLAY HANDLER — 20 actions managing heroes.
 *
 *  Actions (all verified from client code):
 *    1.  getAttrs           — Calculate hero attributes (called 8+ times)
 *    2.  autoLevelUp        — Level up hero (single/bulk)
 *    3.  evolve             — Star up / evolve hero
 *    4.  resolve            — Decompose hero into soul coins
 *    5.  reborn             — Rebirth hero (reset, reclaim resources)
 *    6.  splitHero          — Split duplicate hero into fragments
 *    7.  inherit            — Transfer stats from one hero to another
 *    8.  qigong             — Start qigong (meditation) training
 *    9.  saveQigong         — Save qigong training results
 *   10.  cancelQigong       — Cancel ongoing qigong
 *   11.  heroBreak          — Perform hero breakthrough
 *   12.  activeHeroBreak    — Activate breakthrough level
 *   13.  autoHeroBreak      — Auto breakthrough (one-key)
 *   14.  rebornSelfBreak    — Rebirth self-breakthrough
 *   15.  wakeUp             — Awaken hero (upgrade quality tier)
 *   16.  activeSkill        — Activate potential skill
 *   17.  useSkin            — Equip/unequip hero skin
 *   18.  activeSkin         — Activate/unlock new skin
 *   19.  queryHeroEquipInfo — Query hero equipment (social view)
 *   20.  queryArenaHeroEquipInfo — Query arena hero equipment
 *
 *  ATTRIBUTE CALCULATION ENGINE:
 *    Base:   heroLevelAttr[level] (hp, attack, armor from level)
 *    Type:   heroTypeParam[type] (body/skill/strength multipliers + bias)
 *    Quality: heroQualityParam[quality] (all 1.0 currently)
 *    Evolve: heroLevelUpMul[qualityIdx][evolveStep] (evolve multiplier)
 *    Evolve Bonus: heroEvolve[displayId][step] (flat stat bonuses per evolve)
 *    Qigong: qigong bonuses added on top
 *    Break:  selfBreak bonuses added on top
 *
 *  CONFIG FILES USED:
 *    hero.json, heroLevelAttr.json, heroLevelUpMul.json,
 *    heroTypeParam.json, heroQualityParam.json, heroEvolve.json,
 *    heroLevelUp{White,Green,Blue,Purple,Orange,...}.json,
 *    heroResolve.json, heroRebirth.json, heroPiece.json,
 *    heroWakeUp.json, heroSkin.json, heroConnect.json,
 *    selfBreak.json, selfBreakCost.json, selfBreakQuality.json,
 *    selfBreakDefault.json, potentialLevel.json, qigong.json,
 *    heroPower.json, constant.json, inherit.json
 *
 *  CLIENT CODE SOURCES (line numbers from unminified main.min.js):
 *    getAttrs: 53614, 85422, 169699
 *    autoLevelUp: 123101
 *    evolve: 121132
 *    resolve: 106158
 *    reborn: 106280
 *    splitHero: 123180
 *    inherit: 106792
 *    qigong: 52881, saveQigong: 52893, cancelQigong: 52904
 *    heroBreak: 123684, activeHeroBreak: 123627, autoHeroBreak: 123613
 *    rebornSelfBreak: 123751
 *    wakeUp: 124446
 *    activeSkill: 120796
 *    useSkin: 119497, activeSkin: 119527
 *    queryHeroEquipInfo: 86188, queryArenaHeroEquipInfo: 86213
 * =====================================================
 */

var RH = require('../../shared/responseHelper');
var logger = require('../../shared/utils/logger');
var DB = require('../../database/connection');
var userDataService = require('../services/userDataService');
var GameData = require('../../shared/gameData/loader');

// =============================================
// SECTION 1: CONSTANTS
// =============================================

/**
 * Quality tier index mapping.
 * Used to index into heroLevelUpMul.json (keys "1"-"6").
 * heroResolve.json and heroRebirth.json also use these as keys.
 */
var QUALITY_INDEX = {
    'white': 1,
    'green': 2,
    'blue': 3,
    'purple': 4,
    'orange': 5,
    'flickerOrange': 6,
    'superOrange': 7,
    'red': 8
};

/**
 * Quality tier names ordered by star progression.
 * evolveLevel 0-19 = white, 20-39 = green, 40-59 = blue, etc.
 * Each quality tier spans 20 evolve levels, except white which starts at 0.
 */
var STAR_QUALITY = [
    'white',
    'green',
    'blue',
    'purple',
    'orange',
    'flickerOrange',
    'superOrange',
    'red'
];

/**
 * Level up config file names per quality tier.
 * Maps quality string → GameData config key for level-up cost table.
 * Each config contains entries keyed by target level with costID1/num1/costID2/num2.
 */
var LEVEL_UP_CONFIG = {
    'white': 'heroLevelUpWhite',
    'green': 'heroLevelUpGreen',
    'blue': 'heroLevelUpBlue',
    'purple': 'heroLevelUpPurple',
    'orange': 'heroLevelUpOrange',
    'flickerOrange': 'heroLevelUpFlickerOrange',
    'superOrange': 'heroLevelUpSuperOrange',
    'red': 'heroLevelUpRed'
};

/**
 * Item IDs used throughout hero system.
 * These correspond to entries in the game's item database.
 */
var ITEM = {
    DIAMOND: 101,          // Premium currency
    GOLD: 102,             // Basic currency
    PLAYER_EXP: 103,       // Player experience
    PLAYER_LEVEL: 104,     // Player level
    EXP_CAPSULE: 131,      // Hero experience capsule (level up cost 1)
    EVOLVE_CAPSULE: 132,   // Hero evolve capsule (evolve/break cost)
    SOUL_COIN: 111,        // Soul coin (from resolve/decompose)
    ENERGY_STONE: 136,     // Energy stone (qigong cost)
    POTENTIAL_EXP: 133,    // Potential experience (activeSkill cost)
    SUPER_EXP: 134,        // Super skill experience
    BREAK_MATERIAL: 501    // Breakthrough material (selfBreak cost)
};

/**
 * 31 base attribute names for hero attribute system.
 * These are stored in _heroBaseAttr on each hero instance.
 * From HeroAttribute constructor (client line 84951).
 */
var ATTR_NAMES = [
    'hp', 'attack', 'armor', 'speed',
    'hit', 'dodge', 'block', 'blockEffect',
    'skillDamage', 'critical', 'criticalResist',
    'criticalDamage', 'armorBreak', 'damageReduce',
    'controlResist', 'trueDamage', 'energy',
    'power', 'extraArmor', 'hpPercent',
    'armorPercent', 'attackPercent', 'speedPercent',
    'orghp', 'superDamage', 'healPlus',
    'healerPlus', 'damageDown', 'shielderPlus',
    'damageUp'
];

/**
 * Ability name enum matching HeroAbilityName and abilityName.json.
 * Maps ability string name → numeric attribute ID.
 * IMPORTANT: These IDs must match the client-side HeroAbilityName enum exactly.
 */
var ABILITY_NAME = {
    'hp': 0,
    'attack': 1,
    'armor': 2,
    'speed': 3,
    'hit': 4,
    'dodge': 5,
    'block': 6,
    'blockEffect': 7,
    'skillDamage': 8,
    'critical': 9,
    'criticalResist': 10,
    'criticalDamage': 11,
    'armorBreak': 12,
    'damageReduce': 13,
    'controlResist': 14,
    'trueDamage': 15,
    'energy': 16,
    'hpPercent': 17,
    'armorPercent': 18,
    'attackPercent': 19,
    'speedPercent': 20,
    'power': 21,
    'orghp': 22,
    'superDamage': 23,
    'healPlus': 24,
    'healerPlus': 25,
    'extraArmor': 26,
    'shielderPlus': 27,
    'damageUp': 28,
    'damageDown': 29,
    'talent': 30,
    'superDamageResist': 31,
    'dragonBallWarDamageUp': 32,
    'dragonBallWarDamageDown': 33,
    'bloodDamage': 34,
    'normalAttack': 35,
    'criticalDamageResist': 36,
    'blockThrough': 37,
    'controlAdd': 38,
    'bloodResist': 39,
    'extraArmorBreak': 40,
    'energyMax': 41,
    'attackPercentInBattle': 42,
    'teamWarDamageUp': 43,
    'teamWarDamageDown': 44,
    'additionalArmor': 45
};

/**
 * Reverse ability ID → name mapping.
 */
var ABILITY_ID_TO_NAME = {};
for (var _abKey in ABILITY_NAME) {
    ABILITY_ID_TO_NAME[ABILITY_NAME[_abKey]] = _abKey;
}

/**
 * ATTR_ID_NAME: numeric attribute ID → English attribute name.
 * Used for _items array in baseAttr and totalAttr responses.
 * The client expects _id to be a numeric value matching these IDs.
 */
var ATTR_ID_NAME = [
    'hp',                  // 0
    'attack',              // 1
    'armor',               // 2
    'speed',               // 3
    'hit',                 // 4
    'dodge',               // 5
    'block',               // 6
    'blockEffect',         // 7
    'skillDamage',         // 8
    'critical',            // 9
    'criticalResist',      // 10
    'criticalDamage',      // 11
    'armorBreak',          // 12
    'damageReduce',        // 13
    'controlResist',       // 14
    'trueDamage',          // 15
    'energy',              // 16
    'hpPercent',           // 17
    'armorPercent',        // 18
    'attackPercent',       // 19
    'speedPercent',        // 20
    'power',               // 21
    'orghp',               // 22
    'superDamage',         // 23
    'healPlus',            // 24
    'healerPlus',          // 25
    'extraArmor',          // 26
    'shielderPlus',        // 27
    'damageUp',            // 28
    'damageDown',          // 29
    'talent',              // 30
    'superDamageResist',   // 31
    'dragonBallWarDamageUp', // 32
    'dragonBallWarDamageDown', // 33
    'bloodDamage',         // 34
    'normalAttack',        // 35
    'criticalDamageResist', // 36
    'blockThrough',        // 37
    'controlAdd',          // 38
    'bloodResist',         // 39
    'extraArmorBreak',     // 40
    'energyMax',           // 41
    'attackPercentInBattle', // 42
    'teamWarDamageUp',     // 43
    'teamWarDamageDown',   // 44
    'additionalArmor'      // 45
];

/**
 * Passive skill stat field names that can appear in skillOutBattle.json entries.
 * Used to extract stat bonuses from passive and potential skill configs.
 *
 * [BUG 2 FIX] Added 'crticalDamageResist' (typo) — the JSON config files use this
 * misspelled key exclusively (1060 occurrences in skillOutBattle.json).
 * The correctly-spelled 'criticalDamageResist' does NOT exist in any config file.
 * Client code (line 78600) also reads: p.crticalDamageResist (same typo).
 *
 * PASSIVE_STAT_FIELD_MAP maps typo/misnamed fields to their canonical attribute name
 * so the output dict always uses correct keys that exist in ABILITY_NAME.
 */
var PASSIVE_STAT_FIELDS = [
    'hp', 'attack', 'armor', 'speed',
    'hpPercent', 'attackPercent', 'armorPercent', 'speedPercent',
    'hit', 'dodge', 'block', 'blockEffect',
    'skillDamage', 'critical', 'criticalResist',
    'criticalDamage', 'criticalDamageResist', 'crticalDamageResist', 'armorBreak',
    'damageReduce', 'controlResist', 'controlAdd',
    'trueDamage', 'superDamage', 'superDamageResist',
    'healPlus', 'healerPlus', 'shielderPlus', 'blockThrough',
    'bloodDamage', 'bloodResist'
];

/**
 * Maps raw config field names to canonical attribute names.
 * Used when reading passive/potential skill stat bonuses from skillOutBattle.json.
 * Config files use typos (e.g. 'crticalDamageResist') that must be normalized
 * before being stored in the attribute dictionary.
 */
var PASSIVE_STAT_FIELD_MAP = {
    'crticalDamageResist': 'criticalDamageResist'
};

/**
 * Hero type enum for qigong matching.
 * Used to match hero heroType against qigong.json heroType field.
 * Qigong config has 4 archetypes: body, dodge, block, armor.
 * Client HERO_TYPE enum (line 84835):
 *   NULL=0, BODY=1, ARMOR=2, DODGE=3, BLOCK=4, STRENGTH=5,
 *   HIT=6, CRITICAL=7, SKILL=8, DOT=9, BODYDAMAGE=10,
 *   ARMORDAMAGE=11, ARMORS=12, CRITICALSINGLE=13
 *
 * Qigong groups: body→{body,bodyDamage}, armor→{armor,armorS,armorDamage},
 *                dodge→{dodge}, block→{block}
 * Other types use "body" as fallback.
 */
var QIGONG_HERO_TYPE_MAP = {
    'body': ['body', 'bodyDamage', 'strength', 'skill', 'dot',
             'hit', 'critical', 'criticalSingle'],
    'dodge': ['dodge'],
    'block': ['block'],
    'armor': ['armor', 'armorS', 'armorDamage']
};

/**
 * _openType values for response when resources are insufficient.
 * Client checks: OPEN_TYPE.TIME_BONUS → show time-limited gift pack
 *                OPEN_TYPE.TIPS → show "not enough" dialog
 *                0 or absent → success, no dialog
 */
var OPEN_TYPE = {
    SUCCESS: 0,
    TIME_BONUS: 1,
    TIPS: 2
};

/**
 * UP_TYPE enum — hero upgrade state check results.
 * Client uses these to determine button state:
 *   TYPE_FULL = already at max level
 *   TYPE_WAKEUP = needs awakening to continue
 *   Default = can level up normally
 */
var UP_TYPE = {
    DEFAULT: 0,
    TYPE_FULL: 1,
    TYPE_WAKEUP: 2,
    TYPE_EXP: 3,
    TYPE_GOLD: 4
};

/**
 * Skill type enum — matches client SkillBasic (line 84964-84967).
 *   SkillBasic.NORMAL = 0, SKILL = 1, SKILL_PASSIVE = 2, SUPER = 3, POTENTIAL = 4
 * Used in activeSkill request: stype = SkillBasic.POTENTIAL (= 4)
 */
var SKILL_TYPE = {
    NORMAL: 0,
    SKILL: 1,
    SKILL_PASSIVE: 2,
    SUPER: 3,
    POTENTIAL: 4
};


// =============================================
// SECTION 2: UTILITY — Quality & Attribute Helpers
// =============================================

/**
 * Get quality string from evolveLevel.
 * Each quality tier spans 20 evolve levels.
 * evolveLevel 0-19 → white, 20-39 → green, 40-59 → blue,
 * 60-79 → purple, 80-99 → orange, 100-119 → flickerOrange,
 * 120-139 → superOrange, 140+ → red
 *
 * @param {number} evolveLevel - Current evolve level (0-based)
 * @returns {string} Quality tier name
 */
function getQualityFromEvolve(evolveLevel) {
    if (evolveLevel == null || evolveLevel < 0) evolveLevel = 0;
    var idx = Math.floor(evolveLevel / 20);
    if (idx >= STAR_QUALITY.length) idx = STAR_QUALITY.length - 1;
    return STAR_QUALITY[idx];
}

/**
 * Get the BASE quality of a hero from hero.json config.
 * This is the STATIC quality tier assigned to the hero template.
 * Used for level-up cost table lookup — each hero always uses its base
 * quality's cost table regardless of evolveLevel.
 *
 * Client reference (line 85398-85400):
 *   o.heroQuality = HeroCommon.colorToHeroColor(r.quality)
 *   where r = HeroCommon.getLocalJsonHero(heroDisplayId)
 *
 * IMPORTANT: This is DIFFERENT from getQualityFromEvolve()!
 *   - getHeroBaseQuality() → STATIC, from hero.json config → for cost table lookup
 *   - getQualityFromEvolve() → DYNAMIC, from evolveLevel → for attribute multiplier params
 *
 * @param {string|number} heroDisplayId - Hero template ID
 * @returns {string} Quality tier name (e.g., "white", "green", "blue", ...)
 */
function getHeroBaseQuality(heroDisplayId) {
    var heroInfo = getHeroInfo(heroDisplayId);
    if (!heroInfo || !heroInfo.quality) return 'white';
    return String(heroInfo.quality).toLowerCase();
}

/**
 * Get quality index number for config lookups.
 * Used as key into heroLevelUpMul.json, heroResolve.json, heroRebirth.json.
 *
 * @param {string} quality - Quality tier name
 * @returns {number} Quality index (1-8)
 */
function getQualityIndex(quality) {
    return QUALITY_INDEX[quality] || 1;
}

/**
 * Get quality index from a numeric evolveLevel directly.
 * More efficient when you only have the evolveLevel.
 *
 * @param {number} evolveLevel
 * @returns {number}
 */
function getQualityIndexFromEvolve(evolveLevel) {
    return Math.min(Math.floor((evolveLevel || 0) / 20), 6) + 1;
}

/**
 * Get hero info from hero.json config.
 * Contains: id, type, heroType, quality, breakType, breakType2,
 *           defaultSkin, normal, skill, skillLevel, potential1, potential2,
 *           wakeupMax, talent, speed, balancePower, etc.
 *
 * @param {string|number} heroDisplayId - Hero template ID
 * @returns {object|null} Hero config entry or null
 */
function getHeroInfo(heroDisplayId) {
    var heroConfig = GameData.get('hero');
    if (!heroConfig) return null;
    return heroConfig[heroDisplayId] || heroConfig[String(heroDisplayId)] || null;
}

/**
 * Get hero type parameters from heroTypeParam.json.
 * Contains: hpParam, attackParam, armorParam (multipliers)
 *           hpBais, attackBais, armorBais (flat bonuses)
 * 13 hero types: body, strength, skill, armor, armorS, armorDamage,
 *                dodge, block, hit, critical, criticalSingle, bodyDamage, dot
 *
 * @param {string} heroType - e.g. "body", "skill", "strength"
 * @returns {object|null} Type parameters
 */
function getHeroTypeParam(heroType) {
    var config = GameData.get('heroTypeParam');
    if (!config) return null;
    return config[heroType] || null;
}

/**
 * Get quality parameters from heroQualityParam.json.
 * Contains: hpParam, attackParam, armorParam (all 1.0 currently).
 *
 * @param {string} quality - Quality tier name
 * @returns {object|null} Quality parameters
 */
function getQualityParam(quality) {
    var config = GameData.get('heroQualityParam');
    if (!config) return null;
    return config[quality] || null;
}

/**
 * Get level-up multiplier for given quality and evolveLevel.
 * From heroLevelUpMul.json: keys "1"-"6" (quality index).
 * Each key maps to array of { evolveLevel, quality, hpMul, attackMul, armorMul }.
 *
 * Algorithm: Find the entry with evolveLevel <= current evolveLevel (highest match).
 * Example: evolveLevel=85, orange quality → matches evolveLevel=80 entry (hpMul=1.32)
 *
 * @param {string} quality - Quality tier name
 * @param {number} evolveLevel - Current evolve level
 * @returns {object} { hpMul, attackMul, armorMul } (default 1 if not found)
 */
function getLevelUpMul(quality, evolveLevel) {
    var config = GameData.get('heroLevelUpMul');
    if (!config) return { hpMul: 1, attackMul: 1, armorMul: 1 };

    var qIdx = String(getQualityIndex(quality));
    var entries = config[qIdx];
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return { hpMul: 1, attackMul: 1, armorMul: 1 };
    }

    // Find the best matching entry: highest evolveLevel <= current
    var best = { hpMul: 1, attackMul: 1, armorMul: 1 };
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.evolveLevel <= evolveLevel) {
            best.hpMul = entry.hpMul || 1;
            best.attackMul = entry.attackMul || 1;
            best.armorMul = entry.armorMul || 1;
        } else {
            break; // entries are sorted by evolveLevel ascending
        }
    }
    return best;
}

/**
 * Get base attributes for a hero level from heroLevelAttr.json.
 * Each entry has: level, hp, attack, armor.
 * Levels go from 1 to 349+.
 *
 * @param {number} level - Hero level (1-based)
 * @returns {object} { hp, attack, armor }
 */
function getLevelBaseAttr(level) {
    level = level || 1;
    level = Math.max(1, Math.floor(level));
    var config = GameData.get('heroLevelAttr');
    if (!config) return { hp: 0, attack: 0, armor: 0 };

    var entry = config[String(level)];
    if (!entry) return { hp: 0, attack: 0, armor: 0 };

    return {
        hp: entry.hp || 0,
        attack: entry.attack || 0,
        armor: entry.armor || 0
    };
}

/**
 * Get evolve entries for a specific hero from heroEvolve.json.
 * Each entry has: level, hp, attack, armor, speed,
 *                costID1, num1, costID2, num2,
 *                skillID, normalID, needLevel, needQuality, needStar, needNum,
 *                skillPassive1ID, skillPassive1Level, etc.
 *
 * Entries are sorted by level ascending: 0, 20, 40, 60, 80, 100, 110, 120, ...
 *
 * @param {string|number} heroDisplayId - Hero template ID
 * @returns {Array|null} Array of evolve entries or null
 */
function getHeroEvolveEntries(heroDisplayId) {
    var config = GameData.get('heroEvolve');
    if (!config) return null;
    var entries = config[heroDisplayId] || config[String(heroDisplayId)];
    if (!entries) return null;

    // Merge heroEvolveRed config (client: getlocalHeroEvolve line 53305-53309)
    // Red evolve entries extend the evolve table for heroes past normal evolve caps
    var redConfig = GameData.get('heroEvolveRed');
    if (redConfig) {
        var redEntries = redConfig[heroDisplayId] || redConfig[String(heroDisplayId)];
        if (redEntries) {
            var base = Array.isArray(entries) ? entries : [entries];
            var red = Array.isArray(redEntries) ? redEntries : [redEntries];
            return base.concat(red);
        }
    }

    return Array.isArray(entries) ? entries : [entries];
}

/**
 * Get the evolve entry matching a specific hero level.
 * Client: getHeroEvolveLocal(displayId, level) finds entry where entry.level == level.
 * Used in getHeroNextState (line 85923), setHeroPassiveSkillState (line 85519),
 * evolveBtnTap (line 121123), setEvolveWarnLabel (line 121098), etc.
 *
 * @param {string|number} heroDisplayId
 * @param {number} heroLevel - The hero's current level
 * @returns {object|null} Evolve config entry or null
 */
function getEvolveEntryByLevel(heroDisplayId, heroLevel) {
    var entries = getHeroEvolveEntries(heroDisplayId);
    if (!entries || !Array.isArray(entries)) return null;

    for (var i = 0; i < entries.length; i++) {
        if (entries[i].level == heroLevel) {
            return entries[i];
        }
    }
    return null;
}

/**
 * Get the next evolve entry for a hero based on current evolveLevel.
 * Uses step-based progression: +20 for evolveLevel < 100, +10 for >= 100.
 * Falls back to iterating entries to find the first one > currentEvolveLevel.
 *
 * @param {string|number} heroDisplayId
 * @param {number} currentEvolveLevel
 * @returns {object|null} Next evolve entry or null if max
 */
function getNextEvolveEntry(heroDisplayId, currentEvolveLevel) {
    var entries = getHeroEvolveEntries(heroDisplayId);
    if (!entries || !Array.isArray(entries)) return null;

    // Primary: step-based lookup
    var step = currentEvolveLevel < 100 ? 20 : 10;
    var targetLevel = currentEvolveLevel + step;
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].level == targetLevel) {
            return entries[i];
        }
    }

    // Fallback: find first entry with level > currentEvolveLevel
    for (var j = 0; j < entries.length; j++) {
        if (entries[j].level > currentEvolveLevel) {
            return entries[j];
        }
    }
    return null;
}

/**
 * Get maximum evolve level possible for a hero.
 * Determined by the highest level entry in heroEvolve.json for that hero.
 *
 * @param {string|number} heroDisplayId
 * @returns {number} Max evolve level (typically 200)
 */
function getMaxEvolveLevel(heroDisplayId) {
    var entries = getHeroEvolveEntries(heroDisplayId);
    if (!entries || !Array.isArray(entries) || entries.length === 0) return 0;

    var maxLevel = 0;
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].level > maxLevel) maxLevel = entries[i].level;
    }
    return maxLevel;
}

/**
 * Get qigong config entry for a hero's type and qigong stage.
 * Qigong config is keyed sequentially but has heroType and levelPara fields.
 *
 * @param {string} heroType - Hero's heroType field (e.g. "body", "skill")
 * @param {number} qigongStage - Current qigong training stage (1-31)
 * @returns {object|null} Qigong config entry
 */
function getQigongConfig(heroType, qigongStage) {
    var config = GameData.get('qigong');
    if (!config) return null;

    // Normalize heroType to qigong group
    var qigongGroup = getQigongGroup(heroType);

    var keys = Object.keys(config);
    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        var entryType = (entry.heroType || '').toLowerCase();
        if (entryType === qigongGroup && entry.levelPara === qigongStage) {
            return entry;
        }
    }
    return null;
}

/**
 * Map hero heroType to qigong group.
 * Qigong has 4 groups: body, dodge, block, armor.
 * Other types fall back to "body".
 *
 * @param {string} heroType
 * @returns {string} Qigong group name
 */
function getQigongGroup(heroType) {
    if (!heroType) return 'body';
    var ht = heroType.toLowerCase();

    // Check each qigong group
    var groups = ['dodge', 'block', 'armor'];
    for (var i = 0; i < groups.length; i++) {
        var groupTypes = QIGONG_HERO_TYPE_MAP[groups[i]] || [];
        for (var j = 0; j < groupTypes.length; j++) {
            if (groupTypes[j] === ht) return groups[i];
        }
    }
    return 'body'; // default fallback
}

/**
 * Get constant value from constant.json.
 * Constant config has a single entry keyed by "1" with 200+ fields.
 *
 * @param {string} fieldName - e.g. "maxUserLevel", "selfBreakBeRebornConsume"
 * @returns {*} Value or undefined
 */
function getConstant(fieldName) {
    var config = GameData.get('constant');
    if (!config || !config['1']) return undefined;
    return config['1'][fieldName];
}

/**
 * Get resolve reward config for a quality tier.
 * heroResolve.json: keys "1"-"7", each has { quality, resolveTo, num }.
 *
 * @param {string} quality - Quality tier name
 * @returns {object|null} { resolveTo, num }
 */
function getResolveConfig(quality) {
    var config = GameData.get('heroResolve');
    if (!config) return null;
    var qIdx = String(getQualityIndex(quality));
    return config[qIdx] || null;
}

/**
 * Get rebirth refund config for a quality tier.
 * heroRebirth.json: keys "1"-"7", each has { quality, rebirthNeeded, num }.
 *
 * @param {string} quality - Quality tier name
 * @returns {object|null} { rebirthNeeded, num }
 */
function getRebirthConfig(quality) {
    var config = GameData.get('heroRebirth');
    if (!config) return null;
    var qIdx = String(getQualityIndex(quality));
    return config[qIdx] || null;
}

/**
 * Get hero piece config by heroDisplayId.
 * heroPiece.json: keyed by piece ID, has { belongTo, mergeNum, quality }.
 *
 * @param {string|number} heroDisplayId - Hero template ID
 * @returns {object|null} Piece config entry { id, belongTo, mergeNum, quality }
 */
function getHeroPiece(heroDisplayId) {
    var config = GameData.get('heroPiece');
    if (!config) return null;

    var keys = Object.keys(config);
    for (var i = 0; i < keys.length; i++) {
        if (config[keys[i]].belongTo == heroDisplayId) {
            return config[keys[i]];
        }
    }
    return null;
}

/**
 * Get inherit cost config for quality and star level.
 * inherit.json: keys "1"-"16", each has { quality, star, diamond }.
 *
 * @param {string} quality - Quality tier (e.g. "flickerOrange")
 * @param {number} star - Star level (3-10)
 * @returns {object|null} { diamond } cost
 */
function getInheritConfig(quality, star) {
    var config = GameData.get('inherit');
    if (!config) return null;

    var keys = Object.keys(config);
    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        if (entry.quality === quality && entry.star === star) {
            return entry;
        }
    }
    return null;
}

/**
 * Get selfBreak cost config for quality and break level.
 * selfBreakCost.json: keys "1"-"50", each has
 *   { quality, breakLevel, costID1, costNum1, costID2, costNum2,
 *     selfPieceNeeded, selfTheRedDevils }
 *
 * @param {string} quality - Quality tier
 * @param {number} breakLevel - Target break level (1-15)
 * @returns {object|null} Break cost entry
 */
function getSelfBreakCost(quality, breakLevel) {
    var config = GameData.get('selfBreakCost');
    if (!config) return null;

    var keys = Object.keys(config);
    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        if (entry.quality === quality && entry.breakLevel === breakLevel) {
            return entry;
        }
    }
    return null;
}

/**
 * Get selfBreak training entry for break type and level position.
 * selfBreak.json: keyed sequentially, each has
 *   { breakType, breakLevel, level, levelNeeded, costID1, costNum1,
 *     ability1, abilityID1, value1, abilityAffected1, ... }
 *
 * [BUG 3 FIX] Now also checks breakType2 for heroes with secondary break type.
 * Client (line 85569): r[u].breakType && r[u].breakType != hero.breakType ||
 *   (r[u].breakType || !r[u].breakType2 || r[u].breakType2 == hero.breakType2)
 *
 * @param {string} breakType - e.g. "break_damageUp"
 * @param {number} breakLevel - Current break tier (1-6+)
 * @param {number} level - Position within tier (1-21)
 * @param {string} [breakType2] - Optional secondary break type
 * @returns {object|null} Training node entry
 */
function getSelfBreakEntry(breakType, breakLevel, level, breakType2) {
    var config = GameData.get('selfBreak');
    if (!config) return null;

    var keys = Object.keys(config);
    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        // Match breakType (if entry has one), and breakType2 (if entry has one)
        var typeMatch = !entry.breakType || entry.breakType === breakType;
        var type2Match = !entry.breakType2 || !breakType2 || entry.breakType2 === breakType2;
        if (typeMatch && type2Match &&
            entry.breakLevel === breakLevel &&
            entry.level === level) {
            return entry;
        }
    }
    return null;
}

/* 
 * NOTE: 3-param getSelfBreakEntry removed — was shadowing the 4-param version above.
 * All call sites use 4 params: getSelfBreakEntry(breakType, breakLevel, level, breakType2).
 * The 4-param version handles breakType2 as optional, so it works for all cases.
 */

/**
 * Get all selfBreak training entries for a break type and level.
 * Returns all nodes (level 1-21) for the given break type and tier.
 *
 * @param {string} breakType - e.g. "break_damageUp"
 * @param {number} breakLevel - Break tier
 * @param {string} [breakType2] - Optional secondary break type
 * @returns {Array} Array of training entries
 */
function getSelfBreakEntriesForLevel(breakType, breakLevel, breakType2) {
    var config = GameData.get('selfBreak');
    if (!config) return [];

    var results = [];
    var keys = Object.keys(config);
    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        var typeMatch = !entry.breakType || entry.breakType === breakType;
        var type2Match = !entry.breakType2 || !breakType2 || entry.breakType2 === breakType2;
        if (typeMatch && type2Match && entry.breakLevel === breakLevel) {
            results.push(entry);
        }
    }
    // Sort by level ascending
    results.sort(function(a, b) { return (a.level || 0) - (b.level || 0); });
    return results;
}

/**
 * Get selfBreak quality multiplier.
 * selfBreakQuality.json: keys "1"-"4", each has { quality, costPara, abilityPara }.
 *
 * [BUG 2 FIX] Client uses abilityPara for training cost multiplier, not costPara.
 * Client getHeroLimitBreakQualityParm (line 85819-85828) returns abilityPara.
 * Client setTrainCost (line 126362): costNum1 * breakQualityParm (abilityPara).
 * Client checkHeroBreakLimitRedPoint (line 85851): costNum1 * i (abilityPara).
 *
 * costPara may be used for other calculations (unlock costs, etc.).
 * abilityPara is used for training cost adjustment per quality tier.
 *
 * @param {string} quality - Quality tier
 * @returns {object} { costPara: 1, abilityPara: 1 }
 */
function getSelfBreakQualityMul(quality) {
    var config = GameData.get('selfBreakQuality');
    if (!config) {
        return { costPara: 1, abilityPara: 1 };
    }

    var keys = Object.keys(config);
    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        if (entry.quality === quality) {
            return { costPara: entry.costPara || 1, abilityPara: entry.abilityPara || 1 };
        }
    }
    return { costPara: 1, abilityPara: 1 };
}

/**
 * Get wakeUp config for a hero.
 * heroWakeUp.json: keyed by heroDisplayId.
 * Value is either a single object (1 star) or array of objects (1-3 stars).
 *
 * @param {string|number} heroDisplayId
 * @returns {Array} Array of wakeUp entries (normalized)
 */
function getWakeUpConfig(heroDisplayId) {
    var config = GameData.get('heroWakeUp');
    if (!config) return [];

    var entry = config[heroDisplayId] || config[String(heroDisplayId)];
    if (!entry) return [];

    // Normalize to array
    if (Array.isArray(entry)) return entry;
    return [entry];
}

/**
 * Get wakeUp entry for a specific star level.
 *
 * @param {string|number} heroDisplayId
 * @param {number} star - Current star (0-based, looking for next star)
 * @returns {object|null} WakeUp config for next star
 */
function getWakeUpEntry(heroDisplayId, star) {
    var entries = getWakeUpConfig(heroDisplayId);
    var targetStar = star + 1; // next star level
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].star === targetStar) {
            return entries[i];
        }
    }
    return null;
}

/**
 * Get potential level config for a hero's potential skill.
 * potentialLevel.json: keyed by potential ID (e.g. "120141", "120342").
 * Format: heroDisplayId + position code (41=pos1, 42=pos2).
 * Value is array of level entries with { level, expID, expNum, goldID, goldNum, heroLevel }.
 *
 * @param {string|number} heroDisplayId
 * @param {number} pos - Potential skill position (1 or 2)
 * @returns {Array|null} Array of potential level entries
 */
function getPotentialConfig(heroDisplayId, pos) {
    var config = GameData.get('potentialLevel');
    if (!config) return null;

    var key = String(heroDisplayId) + '4' + String(pos);
    return config[key] || null;
}

/**
 * Get skin config by skinId.
 * heroSkin.json: keyed by skin ID (heroId * 1000 pattern).
 * Has: heroDrangon (heroDisplayId), name, iconIsShow, etc.
 *
 * @param {string|number} skinId
 * @returns {object|null} Skin config entry
 */
function getSkinConfig(skinId) {
    var config = GameData.get('heroSkin');
    if (!config) return null;
    return config[skinId] || config[String(skinId)] || null;
}


// =============================================
// SECTION 3: UTILITY — Attribute Calculation Engine
// =============================================

// --- New helper functions for attribute calculation ---

/**
 * Add a value to a flat attribute dictionary.
 * Creates the key if it doesn't exist.
 *
 * @param {object} dict - Flat attr dict (keyed by attr name string)
 * @param {string} attrName - Attribute name (e.g. 'hp', 'attackPercent')
 * @param {number} value - Value to add
 */
function addAttrToDict(dict, attrName, value) {
    if (!dict || attrName == null || !value) return;
    dict[attrName] = (dict[attrName] || 0) + value;
}

/**
 * Get qigong quality multiplier for a given evolveLevel.
 * qigongQualityMaxPara.json: keys "1"-"7", each has hpMaxPara, attackMaxPara, armorMaxPara.
 *
 * NOTE: This uses dynamic quality from evolveLevel. For the correct client-matching behavior,
 * use getQigongQualityMaxParaForQuality(baseQuality) instead — client matches by hero.json quality.
 *
 * @param {number} evolveLevel - Current evolve level
 * @returns {object} { hpMaxPara, attackMaxPara, armorMaxPara } (default 1 for each)
 */
function getQigongQualityMaxPara(evolveLevel) {
    var config = GameData.get('qigongQualityMaxPara');
    if (!config) return { hpMaxPara: 1, attackMaxPara: 1, armorMaxPara: 1 };

    var qIdx = String(getQualityIndexFromEvolve(evolveLevel));
    var entry = config[qIdx];
    if (!entry) return { hpMaxPara: 1, attackMaxPara: 1, armorMaxPara: 1 };

    return {
        hpMaxPara: entry.hpMaxPara || 1,
        attackMaxPara: entry.attackMaxPara || 1,
        armorMaxPara: entry.armorMaxPara || 1
    };
}

/**
 * Get qigong quality multiplier by quality name string.
 * [BUG 4 FIX] Client (line 78548): h.quality === i.quality where i = hero info from hero.json.
 * qigongQualityMaxPara.json: keys "1"-"7", each has { quality, hpMaxPara, attackMaxPara, armorMaxPara }.
 *
 * @param {string} qualityName - Quality tier name from hero.json (e.g. "green", "orange")
 * @returns {object} { hpMaxPara, attackMaxPara, armorMaxPara } (default 1 for each)
 */
function getQigongQualityMaxParaForQuality(qualityName) {
    var config = GameData.get('qigongQualityMaxPara');
    if (!config) return { hpMaxPara: 1, attackMaxPara: 1, armorMaxPara: 1 };

    // Client iterates all entries and matches by quality string: h.quality === i.quality
    var keys = Object.keys(config);
    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        if (entry.quality === qualityName) {
            return {
                hpMaxPara: entry.hpMaxPara || 1,
                attackMaxPara: entry.attackMaxPara || 1,
                armorMaxPara: entry.armorMaxPara || 1
            };
        }
    }
    return { hpMaxPara: 1, attackMaxPara: 1, armorMaxPara: 1 };
}

/**
 * Get zPower quality para multiplier.
 * zPowerQualityPara.json: keys "1"-"7", each has quality and para.
 *
 * IMPORTANT: The raw para values from the default JSON produce extremely low
 * zPower (e.g. purple level 3 = 34 instead of ~1500). The original server
 * applied a runtime scaling multiplier so the formula produces correct power
 * values matching the client's getHeroZpowe() output.
 *
 * Scale factor derived from: Kid Goku purple level 3 should give ~1500 power.
 *   inner = 100 + 3 * 5^(1 + ceil(3/10)/35) ≈ 115.7
 *   1500 / (115.7 * 0.3) ≈ 43.26
 *
 * @param {number} qualityIndex - Quality tier index (1-7)
 * @returns {number} Para multiplier (default 1)
 */
var ZPOWER_PARA_SCALE = 43.33;

function getZPowerQualityPara(qualityIndex) {
    var config = GameData.get('zPowerQualityPara');
    if (!config) return ZPOWER_PARA_SCALE;

    var entry = config[String(qualityIndex)];
    if (!entry) return ZPOWER_PARA_SCALE;

    var rawPara = entry.para || 1;
    return rawPara * ZPOWER_PARA_SCALE;
}

/**
 * Get hero star level from heroData.
 *
 * @param {object} heroData - Hero instance
 * @returns {number} Star level (0 if not set)
 */
function getHeroStar(heroData) {
    if (!heroData) return 0;
    return heroData._heroStar || 0;
}

/**
 * Look up a skillOutBattle entry by skill ID and level.
 * skillOutBattle.json has two formats:
 *   - skillPassive (array): [{id, level, type:"skillPassive", critical: 0.14, ...}]
 *   - potential (single object): {id, level, type:"potential", hpPercent: 0.3, ...}
 *
 * For skillPassive entries: find the entry matching skillId and the given level.
 * For potential entries: find the single entry matching skillId (level param is used for potential level).
 *
 * @param {string|number} skillId - Skill ID from hero.json or heroEvolve
 * @param {number} level - Desired level (for skillPassive: find matching level; for potential: current level)
 * @returns {object|null} Skill config entry
 */
function getSkillOutBattleAttr(skillId, level) {
    var config = GameData.get('skillOutBattle');
    if (!config) return null;

    var idStr = String(skillId);
    var keys = Object.keys(config);

    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        if (!entry) continue;

        if (String(entry.id) === idStr) {
            if (entry.type === 'skillPassive') {
                // Array format: check if this entry's level matches
                if (entry.level === level) {
                    return entry;
                }
            } else if (entry.type === 'potential') {
                // Single potential entry — always return it (caller handles level check)
                return entry;
            }
        }
    }
    return null;
}

/**
 * Get potential skill attributes from skillOutBattle.json.
 * Potential skills have a single entry with type "potential".
 * The entry has stat fields (hpPercent, attackPercent, etc.) — empty string "" means no bonus.
 *
 * @param {string|number} potentialId - Potential skill ID
 * @param {number} currentLevel - Current level of the potential skill
 * @returns {object} Flat attr dict with stat bonuses
 */
function getPotentialSkillAttr(potentialId, currentLevel) {
    var attrs = {};
    var config = GameData.get('skillOutBattle');
    if (!config || !potentialId) return attrs;

    var idStr = String(potentialId);
    var keys = Object.keys(config);

    for (var i = 0; i < keys.length; i++) {
        var entry = config[keys[i]];
        if (!entry) continue;
        if (String(entry.id) === idStr && entry.type === 'potential') {
            // Extract all stat bonuses; skip empty strings and non-stat fields
            for (var si = 0; si < PASSIVE_STAT_FIELDS.length; si++) {
                var fieldName = PASSIVE_STAT_FIELDS[si];
                var val = entry[fieldName];
                if (val !== undefined && val !== null && val !== '') {
                    var numVal = Number(val);
                    if (!isNaN(numVal) && numVal !== 0) {
                        // [BUG 2 FIX] Normalize field name (e.g. crticalDamageResist → criticalDamageResist)
                        var canonicalName = PASSIVE_STAT_FIELD_MAP[fieldName] || fieldName;
                        attrs[canonicalName] = numVal;
                    }
                }
            }
            return attrs;
        }
    }
    return attrs;
}

/**
 * Collect all passive skill attributes for a hero.
 * Passive sources include:
 *   - skillPassive1/2/3 from hero.json (with passiveLevel1/2/3)
 *   - skillPassive1ID/skillPassive1Level from heroEvolve entries (override hero.json when evolve >= entry level)
 *   - redPassive1/2/3 from hero.json (with redPassiveLevel1/2/3) — red-tier awakened passives
 *   - redPassive1ID/Level from heroEvolve entries (override hero.json red passives)
 *   - potential1/2/3 from hero.json (with _potential1Level/_potential2Level/_potential3Level from heroData)
 *
 * Client reference: makeHeroPassiveSkillAttr (line 78578-78632)
 *   Processes: skillPassive (from evolve entry matching current evolveLevel) → potential → redPassive (if isRed)
 *   setHeroPassiveSkillState (line 85519-85537): adds redPassive skills to hero model
 *
 * @param {object} heroInfo - Hero config entry from hero.json
 * @param {number} evolveLevel - Current evolve level
 * @param {object} heroData - Hero instance data
 * @returns {object} Flat attr dict with all passive stat bonuses accumulated
 */
function collectPassiveAttrs(heroInfo, evolveLevel, heroData) {
    var passiveAttrs = {};

    if (!heroInfo) return passiveAttrs;

    var displayId = heroInfo.id;
    var evolveEntries = getHeroEvolveEntries(displayId);

    // --- Determine effective passive skills from heroEvolve overrides ---
    // heroEvolve entries can have skillPassive1ID/skillPassive1Level that override hero.json
    // Find the highest evolve entry <= current evolveLevel for each passive slot
    var passiveOverrides = {
        1: { id: null, level: null, evolveLevel: -1 },
        2: { id: null, level: null, evolveLevel: -1 },
        3: { id: null, level: null, evolveLevel: -1 }
    };

    if (evolveEntries && Array.isArray(evolveEntries)) {
        for (var ei = 0; ei < evolveEntries.length; ei++) {
            var ee = evolveEntries[ei];
            if (ee.level > evolveLevel) continue;

            for (var slot = 1; slot <= 3; slot++) {
                var idField = 'skillPassive' + slot + 'ID';
                var lvlField = 'skillPassive' + slot + 'Level';
                if (ee[idField] != null && ee[lvlField] != null) {
                    passiveOverrides[slot] = {
                        id: ee[idField],
                        level: ee[lvlField],
                        evolveLevel: ee.level
                    };
                }
            }
        }
    }

    // --- Process skillPassive1, skillPassive2, skillPassive3 ---
    for (var ps = 1; ps <= 3; ps++) {
        var skillId, skillLevel;

        // Check evolve override first
        if (passiveOverrides[ps].id != null) {
            skillId = passiveOverrides[ps].id;
            skillLevel = passiveOverrides[ps].level;
        } else {
            // Fall back to hero.json
            skillId = heroInfo['skillPassive' + ps];
            skillLevel = heroInfo['passiveLevel' + ps];
        }

        if (!skillId || !skillLevel) continue;

        // Look up skillOutBattle for skillPassive type
        var skillEntry = getSkillOutBattleAttr(skillId, skillLevel);
        if (skillEntry) {
            for (var fi = 0; fi < PASSIVE_STAT_FIELDS.length; fi++) {
                var field = PASSIVE_STAT_FIELDS[fi];
                var fval = skillEntry[field];
                if (fval !== undefined && fval !== null && fval !== '') {
                    var fnum = Number(fval);
                    if (!isNaN(fnum) && fnum !== 0) {
                        // [BUG 2 FIX] Normalize field name (e.g. crticalDamageResist → criticalDamageResist)
                        var canonicalField = PASSIVE_STAT_FIELD_MAP[field] || field;
                        addAttrToDict(passiveAttrs, canonicalField, fnum);
                    }
                }
            }
        }
    }

    // --- Process potential1, potential2, potential3 ---
    for (var pi = 1; pi <= 3; pi++) {
        var potId = heroInfo['potential' + pi];
        if (!potId) continue;

        // Get current level from heroData
        // [FIX] _potentialLevel is a dict { "1": level, "2": level, "3": level }
        // NOT separate fields like _potential1Level. Look up by slot key.
        var potLevel = 1;
        if (heroData && heroData._potentialLevel) {
            var potKey = String(pi);
            if (heroData._potentialLevel[potKey] != null) {
                potLevel = heroData._potentialLevel[potKey];
            }
        }

        var potAttrs = getPotentialSkillAttr(potId, potLevel);
        var potKeys = Object.keys(potAttrs);
        for (var pk = 0; pk < potKeys.length; pk++) {
            addAttrToDict(passiveAttrs, potKeys[pk], potAttrs[potKeys[pk]]);
        }
    }

    // --- Process redPassive1, redPassive2, redPassive3 ---
    // [BUG 5 FIX] Red-tier passive skills from hero.json / heroEvolve entries.
    // Client (line 78616-78630): if(r) { for redPassive1..3: read skillOutBattle attrs }
    // Client setHeroPassiveSkillState (line 85526-85537): adds redPassive skills to model.
    // heroEvolve entries can have redPassive1ID/Level overriding hero.json redPassive1/Level.
    var hasRedPassive = heroInfo['redPassive1'] ||
                       heroInfo['redPassive2'] ||
                       heroInfo['redPassive3'];

    if (hasRedPassive) {
        // Determine redPassive overrides from heroEvolve entries
        var redPassiveOverrides = {
            1: { id: null, level: null, evolveLevel: -1 },
            2: { id: null, level: null, evolveLevel: -1 },
            3: { id: null, level: null, evolveLevel: -1 }
        };

        if (evolveEntries && Array.isArray(evolveEntries)) {
            for (var rpi = 0; rpi < evolveEntries.length; rpi++) {
                var rpe = evolveEntries[rpi];
                if (rpe.level > evolveLevel) continue;

                for (var rslot = 1; rslot <= 3; rslot++) {
                    var rpidField = 'redPassive' + rslot + 'ID';
                    var rplvlField = 'redPassive' + rslot + 'Level';
                    if (rpe[rpidField] != null && rpe[rplvlField] != null) {
                        redPassiveOverrides[rslot] = {
                            id: rpe[rpidField],
                            level: rpe[rplvlField],
                            evolveLevel: rpe.level
                        };
                    }
                }
            }
        }

        for (var rp = 1; rp <= 3; rp++) {
            var rSkillId, rSkillLevel;

            // Check evolve override first
            if (redPassiveOverrides[rp].id != null) {
                rSkillId = redPassiveOverrides[rp].id;
                rSkillLevel = redPassiveOverrides[rp].level;
            } else {
                // Fall back to hero.json
                rSkillId = heroInfo['redPassive' + rp];
                rSkillLevel = heroInfo['redPassiveLevel' + rp];
            }

            if (!rSkillId || !rSkillLevel) continue;

            // Look up skillOutBattle — same logic as skillPassive
            var rSkillEntry = getSkillOutBattleAttr(rSkillId, rSkillLevel);
            if (rSkillEntry) {
                for (var rfi = 0; rfi < PASSIVE_STAT_FIELDS.length; rfi++) {
                    var rfield = PASSIVE_STAT_FIELDS[rfi];
                    var rfval = rSkillEntry[rfield];
                    if (rfval !== undefined && rfval !== null && rfval !== '') {
                        var rfnum = Number(rfval);
                        if (!isNaN(rfnum) && rfnum !== 0) {
                            var rCanonical = PASSIVE_STAT_FIELD_MAP[rfield] || rfield;
                            addAttrToDict(passiveAttrs, rCanonical, rfnum);
                        }
                    }
                }
            }
        }
    }

    return passiveAttrs;
}

/**
 * Calculate base and total attributes for a hero.
 *
 * BASE FORMULA (from client makeHeroBasicAttr line 78514):
 *   baseHP = (levelBase.hp * typeParam.hpParam + typeParam.hpBais) * qualityParam.hpParam * hero.balanceHp
 *   baseAttack = (levelBase.attack * typeParam.attackParam + typeParam.attackBais) * qualityParam.attackParam * hero.balanceAttack
 *   baseArmor = (levelBase.armor * typeParam.armorParam + typeParam.armorBais) * qualityParam.armorParam * hero.balanceArmor
 *
 * TOTAL FORMULA:
 *   totalHP = floor(baseHP * levelUpMul.hpMul * talent) * (1 + hpPercent/100)
 *             + evolveHP + wakeupHP + qigongHP + qigongTmpHP + breakHP + passiveHP
 *   totalAttack = floor(baseAttack * levelUpMul.attackMul * talent) * (1 + attackPercent/100)
 *                 + evolveAttack + wakeupAttack + qigongAttack + qigongTmpAttack + breakAttack + passiveAttack
 *   totalArmor = floor(baseArmor * levelUpMul.armorMul) * (1 + armorPercent/100)
 *                + evolveArmor + wakeupArmor + qigongArmor + qigongTmpArmor + breakArmor + passiveArmor
 *   speed = heroSpeed + evolveSpeed + wakeupSpeed + passiveSpeed
 *
 * zPower FORMULA (from getHeroZpowe client line 53626):
 *   zPower = (A + level * Math.pow(B, 1 + Math.ceil(level / C) / D)) * zPowerQualityPara[qualityIndex].para
 *   Where A,B,C,D from constant.json[1]: zPowerFormulaParaA/B/C/D
 *
 * @param {object} heroData - Hero instance from user_data.heros._heros[heroId]
 * @param {object} [gameData] - Optional user gameData for linked hero context
 * @returns {object} { _baseAttr: { _items }, _totalAttr: { _items } }
 */
/**
 * Compute hero power using heroPower.json weighted stat sum.
 * Original server formula: sum(totalAttr[i]._num * heroPower[heroType][attrName].powerParam) * balancePower
 *
 * @param {object} heroInfo - Hero info from hero.json config
 * @param {object} totalItems - _totalAttr._items (keyed by attr ID string)
 * @returns {number} Power rating
 */
function computeStatPower(heroInfo, totalItems) {
    if (!heroInfo || !totalItems) return 0;

    var heroType = heroInfo.heroType || heroInfo.type || 'body';
    var balancePower = heroInfo.balancePower || 1;

    var heroPowerConfig = GameData.get('heroPower');
    if (!heroPowerConfig) return 0;

    // Build attName → powerParam map for this heroType
    var powerWeights = {};
    for (var pwKey in heroPowerConfig) {
        var pwEntry = heroPowerConfig[pwKey];
        if (pwEntry && String(pwEntry.heroType) === String(heroType)) {
            powerWeights[String(pwEntry.attName)] = pwEntry.powerParam || 0;
        }
    }

    // Sum weighted attribute values
    var powerSum = 0;
    for (var attrId in totalItems) {
        var attrName = ATTR_ID_NAME[attrId] || ATTR_ID_NAME[parseInt(attrId)];
        if (attrName && powerWeights[attrName] !== undefined) {
            powerSum += (totalItems[attrId]._num || 0) * powerWeights[attrName];
        }
    }

    return Math.floor(powerSum * balancePower);
}

function calculateHeroAttrs(heroData, gameData) {
    if (!heroData) return emptyAttrs();

    var displayId = heroData._heroDisplayId;
    var baseAttr = heroData._heroBaseAttr || {};
    var level = baseAttr._level || 1;
    var evolveLevel = baseAttr._evolveLevel || 0;
    var heroStar = getHeroStar(heroData);

    // Get hero info
    var heroInfo = getHeroInfo(displayId);
    var heroType = heroInfo ? (heroInfo.heroType || heroInfo.type || 'body') : 'body';
    var quality = getQualityFromEvolve(evolveLevel);
    var qualityIndex = getQualityIndexFromEvolve(evolveLevel);

    // Base quality from hero.json — STATIC, used for qualityParam and qigongQualityMaxPara
    // Client (line 78517): ReadJsonSingleton.heroQualityParam[i.quality]
    // Client (line 78548): h.quality === i.quality  (i = hero info from hero.json)
    var baseQuality = heroInfo ? String(heroInfo.quality || 'white').toLowerCase() : 'white';

    // Get config multipliers
    var typeParam = getHeroTypeParam(heroType) || {
        hpParam: 1, attackParam: 1, armorParam: 1,
        hpBais: 0, attackBais: 0, armorBais: 0
    };
    // [BUG 3 FIX] qualityParam uses STATIC base quality from hero.json, NOT dynamic from evolveLevel
    // Client (line 78517): heroQualityParam[i.quality] where i = hero info from hero.json
    var qualParam = getQualityParam(baseQuality) || { hpParam: 1, attackParam: 1, armorParam: 1 };
    var levelUpMul = getLevelUpMul(quality, evolveLevel);
    var levelBase = getLevelBaseAttr(level);

    // === STEP 1: Base attributes (correct formula) ===
    // base = (levelBase * typeParam + typeBais) * qualityParam * hero.balanceXxx
    var balanceHp = (heroInfo && heroInfo.balanceHp) ? heroInfo.balanceHp : 1;
    var balanceAttack = (heroInfo && heroInfo.balanceAttack) ? heroInfo.balanceAttack : 1;
    var balanceArmor = (heroInfo && heroInfo.balanceArmor) ? heroInfo.balanceArmor : 1;

    var baseHP = (levelBase.hp * (typeParam.hpParam || 1) + (typeParam.hpBais || 0))
               * (qualParam.hpParam || 1) * balanceHp;
    var baseAttack = (levelBase.attack * (typeParam.attackParam || 1) + (typeParam.attackBais || 0))
                   * (qualParam.attackParam || 1) * balanceAttack;
    var baseArmor = (levelBase.armor * (typeParam.armorParam || 1) + (typeParam.armorBais || 0))
                  * (qualParam.armorParam || 1) * balanceArmor;

    // === STEP 2: Evolve bonuses (cumulative) ===
    var evolveHP = 0, evolveAttack = 0, evolveArmor = 0, evolveSpeed = 0;
    var evolveEntries = getHeroEvolveEntries(displayId);
    if (evolveEntries && Array.isArray(evolveEntries)) {
        for (var i = 0; i < evolveEntries.length; i++) {
            var ee = evolveEntries[i];
            if (ee.level <= evolveLevel) {
                evolveHP += ee.hp || 0;
                evolveAttack += ee.attack || 0;
                evolveArmor += ee.armor || 0;
                evolveSpeed += ee.speed || 0;
            }
        }
    }

    // === STEP 3: WakeUp bonuses ===
    // Sum all wakeup entries where star <= heroStar
    var wakeupHP = 0, wakeupAttack = 0, wakeupArmor = 0, wakeupSpeed = 0, wakeupTalent = 0;
    var wakeupEntries = getWakeUpConfig(displayId);
    if (wakeupEntries && Array.isArray(wakeupEntries)) {
        for (var wi = 0; wi < wakeupEntries.length; wi++) {
            var we = wakeupEntries[wi];
            if (we.star && we.star <= heroStar) {
                wakeupHP += we.hp || 0;
                wakeupAttack += we.attack || 0;
                wakeupArmor += we.armor || 0;
                wakeupSpeed += we.speed || 0;
                wakeupTalent += we.talent || 0;
            }
        }
    }

    // === STEP 4: Talent calculation ===
    // Total talent = hero.json talent + wakeup talent bonus
    var heroTalent = (heroInfo && heroInfo.talent) ? heroInfo.talent : 1;
    var totalTalent = heroTalent + wakeupTalent;

    // === STEP 5: Speed calculation ===
    // Base speed from hero.json + evolve speed bonus
    var heroSpeed = (heroInfo && heroInfo.speed) ? heroInfo.speed : 0;
    var baseSpeed = heroSpeed + evolveSpeed;

    // === STEP 6: Qigong bonuses (with quality multiplier) ===
    var qigongHP = 0, qigongAttack = 0, qigongArmor = 0;
    // [BUG 4 FIX] qigongQualityMaxPara uses STATIC base quality from hero.json
    // Client (line 78548): h.quality === i.quality (i.quality = hero.json quality)
    var qigongQualityMul = getQigongQualityMaxParaForQuality(baseQuality);

    if (heroData._qigong && heroData._qigong._items) {
        var qItems = heroData._qigong._items;
        if (Array.isArray(qItems)) {
            for (var qi = 0; qi < qItems.length; qi++) {
                var q = qItems[qi];
                var qid = q._id;
                var qnum = q._num || 0;
                // Support both numeric and string IDs
                if (qid === 'hp' || qid === 0 || qid === '0') qigongHP += qnum;
                else if (qid === 'attack' || qid === 1 || qid === '1') qigongAttack += qnum;
                else if (qid === 'armor' || qid === 2 || qid === '2') qigongArmor += qnum;
            }
        } else if (typeof qItems === 'object') {
            // Object format: { hp: num, attack: num, armor: num }
            qigongHP += qItems.hp || 0;
            qigongAttack += qItems.attack || 0;
            qigongArmor += qItems.armor || 0;
        }
    }

    // Apply qigong quality multiplier
    qigongHP = qigongHP * (qigongQualityMul.hpMaxPara || 1);
    qigongAttack = qigongAttack * (qigongQualityMul.attackMaxPara || 1);
    qigongArmor = qigongArmor * (qigongQualityMul.armorMaxPara || 1);

    // === STEP 7: Qigong temporary (unsaved) bonuses (also with quality multiplier) ===
    var qigongTmpHP = 0, qigongTmpAttack = 0, qigongTmpArmor = 0;
    if (heroData._qigongTmp && heroData._qigongTmp._items) {
        var qtItems = heroData._qigongTmp._items;
        if (Array.isArray(qtItems)) {
            for (var qi2 = 0; qi2 < qtItems.length; qi2++) {
                var qt = qtItems[qi2];
                var qtid = qt._id;
                var qtnum = qt._num || 0;
                if (qtid === 'hp' || qtid === 0 || qtid === '0') qigongTmpHP += qtnum;
                else if (qtid === 'attack' || qtid === 1 || qtid === '1') qigongTmpAttack += qtnum;
                else if (qtid === 'armor' || qtid === 2 || qtid === '2') qigongTmpArmor += qtnum;
            }
        }
    }

    // Apply qigong quality multiplier to temporary as well
    qigongTmpHP = qigongTmpHP * (qigongQualityMul.hpMaxPara || 1);
    qigongTmpAttack = qigongTmpAttack * (qigongQualityMul.attackMaxPara || 1);
    qigongTmpArmor = qigongTmpArmor * (qigongQualityMul.armorMaxPara || 1);

    // === STEP 8: Break bonuses (all attribute types) ===
    var breakAttrs = {};
    if (heroData._breakInfo && heroData._breakInfo._attrs) {
        var bAttrs = heroData._breakInfo._attrs;
        if (Array.isArray(bAttrs)) {
            for (var bi = 0; bi < bAttrs.length; bi++) {
                var ba = bAttrs[bi];
                var bAbility = ba._ability != null ? ba._ability : ba.ability;
                var bValue = ba._value != null ? ba._value : ba.value;
                if (bAbility == null || !bValue) continue;
                // Resolve ability name from numeric ID or string
                var bName = (typeof bAbility === 'number')
                    ? ATTR_ID_NAME[bAbility]
                    : String(bAbility);
                if (bName && ABILITY_NAME[bName] !== undefined) {
                    addAttrToDict(breakAttrs, bName, bValue);
                }
            }
        }
    }

    // === STEP 9: Passive skill bonuses ===
    var passiveAttrs = collectPassiveAttrs(heroInfo, evolveLevel, heroData);
    var passiveHP = passiveAttrs.hp || 0;
    var passiveAttack = passiveAttrs.attack || 0;
    var passiveArmor = passiveAttrs.armor || 0;
    var passiveSpeed = passiveAttrs.speed || 0;
    var passiveHpPercent = passiveAttrs.hpPercent || 0;
    var passiveAttackPercent = passiveAttrs.attackPercent || 0;
    var passiveArmorPercent = passiveAttrs.armorPercent || 0;

    // === STEP 10: Calculate total attributes ===
    // hp and attack are multiplied by talent in _totalAttr
    // Armor is NOT multiplied by talent
    // [FIX] Floor must be applied AFTER talent multiplication, not before.
    // Formula: floor(base * mul * talent), NOT floor(base * mul) * talent
    var totalHP_base = Math.floor(baseHP * (levelUpMul.hpMul || 1) * totalTalent);
    var totalHP = Math.floor(totalHP_base * (1 + passiveHpPercent / 100))
                + evolveHP + wakeupHP
                + qigongHP + qigongTmpHP
                + (breakAttrs.hp || 0) + passiveHP;

    var totalAttack_base = Math.floor(baseAttack * (levelUpMul.attackMul || 1) * totalTalent);
    var totalAttack = Math.floor(totalAttack_base * (1 + passiveAttackPercent / 100))
                    + evolveAttack + wakeupAttack
                    + qigongAttack + qigongTmpAttack
                    + (breakAttrs.attack || 0) + passiveAttack;

    var totalArmor_base = Math.floor(baseArmor * (levelUpMul.armorMul || 1));
    var totalArmor = Math.floor(totalArmor_base * (1 + passiveArmorPercent / 100))
                   + evolveArmor + wakeupArmor
                   + qigongArmor + qigongTmpArmor
                   + (breakAttrs.armor || 0) + passiveArmor;

    // Speed: base speed + wakeup speed + passive speed
    var totalSpeed = baseSpeed + wakeupSpeed + passiveSpeed;

    // === STEP 11: Power (zPower) — computed below after totalObj is built ===
    var zPower = 0;

    // === STEP 12: EnergyMax from hero.json ===
    var heroEnergyMax = (heroInfo && heroInfo.energyMax) ? heroInfo.energyMax : 0;

    // === Build _baseAttr._items — Object keyed by string ID ===
    // HAR format: {"0": {_id:0, _num:...}, "1": {_id:1, _num:...}, ...}
    // Client setBaseAttr iterates with for(var a in n) — works with both Array and Object.
    // Original server sends ALL 35 IDs (0-15, 23-41), even when 0.
    // IDs 16-22 are NEVER in _baseAttrs (only in _attrs per HAR analysis of 26 heroes).
    var baseObj = {};

    // IDs 0-3: Core base stats (hp/attack WITHOUT talent multiplier)
    baseObj['0'] = { _id: 0, _num: Math.round(baseHP) };
    baseObj['1'] = { _id: 1, _num: Math.round(baseAttack) };
    baseObj['2'] = { _id: 2, _num: Math.round(baseArmor) };
    baseObj['3'] = { _id: 3, _num: Math.round(baseSpeed) };

    // IDs 4-15: Combat stats from hero.json (hit, dodge, block, etc.)
    // hero.json doesn't have these fields for basic heroes — always 0.
    // Using ABILITY_NAME for correct numeric ID mapping (not sequential index).
    var BASE_COMBAT_FIELDS = [
        'hit', 'dodge', 'block', 'blockEffect',
        'skillDamage', 'critical', 'criticalResist',
        'criticalDamage', 'armorBreak', 'damageReduce',
        'controlResist', 'trueDamage'
    ];
    for (var bci = 0; bci < BASE_COMBAT_FIELDS.length; bci++) {
        var bcf = BASE_COMBAT_FIELDS[bci];
        var bcId = ABILITY_NAME[bcf];
        if (bcId !== undefined) {
            baseObj[String(bcId)] = {
                _id: bcId,
                _num: (heroInfo && heroInfo[bcf]) ? heroInfo[bcf] : 0
            };
        }
    }

    // IDs 23-41: Extended base stats (all 0 for basic heroes, except talent & energyMax)
    for (var bext = 23; bext <= 41; bext++) {
        var bextName = ATTR_ID_NAME[bext] || '';
        var bextVal = 0;
        if (heroInfo && bextName) bextVal = heroInfo[bextName] || 0;
        if (bext === 30) bextVal = Math.round(totalTalent * 100) / 100;  // talent
        if (bext === 41) bextVal = heroEnergyMax;                        // energyMax
        baseObj[String(bext)] = { _id: bext, _num: bextVal };
    }

    // === Build _totalAttr._items — Object keyed by string ID ===
    // HAR has ALL 42 IDs (0-41) in _attrs for every hero, even when value is 0.
    // Client setTotalAttrs iterates with for(var c in o) — works with Object format.
    var totalObj = {};

    // IDs 0-3: Total core stats (hp/attack WITH talent multiplier)
    totalObj['0'] = { _id: 0, _num: totalHP };
    totalObj['1'] = { _id: 1, _num: totalAttack };
    totalObj['2'] = { _id: 2, _num: totalArmor };
    totalObj['3'] = { _id: 3, _num: totalSpeed };

    // IDs 4-15: Combat stats (hero.json base + passive + break bonuses)
    for (var tci = 0; tci < BASE_COMBAT_FIELDS.length; tci++) {
        var tcf = BASE_COMBAT_FIELDS[tci];
        var tcId = ABILITY_NAME[tcf];
        if (tcId !== undefined) {
            var tcVal = ((heroInfo && heroInfo[tcf]) ? heroInfo[tcf] : 0)
                     + (passiveAttrs[tcf] || 0)
                     + (breakAttrs[tcf] || 0);
            totalObj[String(tcId)] = { _id: tcId, _num: Math.round(tcVal * 100) / 100 };
        }
    }

    // ID 16: Energy — hero starting energy for battle. Always 50 per HAR (all 26 heroes).
    totalObj['16'] = { _id: 16, _num: 50 };

    // IDs 17-20: Percentage stats (from passive skills, usually 0)
    var PCT_STAT_FIELDS = ['hpPercent', 'armorPercent', 'attackPercent', 'speedPercent'];
    for (var pi = 0; pi < PCT_STAT_FIELDS.length; pi++) {
        var pcf = PCT_STAT_FIELDS[pi];
        var pcId = ABILITY_NAME[pcf];
        if (pcId !== undefined) {
            totalObj[String(pcId)] = {
                _id: pcId,
                _num: Math.round((passiveAttrs[pcf] || 0) * 100) / 100
            };
        }
    }

    // ID 21: Power — stat-based using heroPower.json weights
    // Formula: sum(totalAttr[i]._num * heroPower[heroType].powerParam) * balancePower
    zPower = computeStatPower(heroInfo, totalObj);
    totalObj['21'] = { _id: 21, _num: zPower };

    // ID 22: orghp — effective HP after talent, always equals totalHP per HAR
    totalObj['22'] = { _id: 22, _num: totalHP };

    // IDs 23-41: Extended total stats (hero.json base + passive + break)
    for (var text = 23; text <= 41; text++) {
        var textName = ATTR_ID_NAME[text] || '';
        var textVal = 0;
        if (textName) {
            textVal = ((heroInfo && heroInfo[textName]) ? heroInfo[textName] : 0)
                    + (passiveAttrs[textName] || 0)
                    + (breakAttrs[textName] || 0);
        }
        if (text === 30) textVal = Math.round(totalTalent * 100) / 100;  // talent
        if (text === 41) textVal = heroEnergyMax;                        // energyMax
        totalObj[String(text)] = { _id: text, _num: Math.round(textVal * 100) / 100 };
    }

    return {
        _baseAttr: { _items: baseObj },
        _totalAttr: { _items: totalObj }
    };
}

/**
 * Generate empty attribute response.
 * Used as default/fallback when hero data is unavailable.
 * Returns Object format matching HAR: all IDs present with _num: 0.
 * _baseAttrs: 35 IDs (0-15, 23-41) — IDs 16-22 excluded per HAR.
 * _attrs: 42 IDs (0-41) — all present.
 *
 * @returns {object} { _baseAttr: { _items: {...} }, _totalAttr: { _items: {...} } }
 */
function emptyAttrs() {
    var baseObj = {};
    // IDs 0-15
    for (var i = 0; i <= 15; i++) baseObj[String(i)] = { _id: i, _num: 0 };
    // IDs 23-41
    for (var j = 23; j <= 41; j++) baseObj[String(j)] = { _id: j, _num: 0 };

    var totalObj = {};
    // IDs 0-41 (all 42)
    for (var k = 0; k <= 41; k++) totalObj[String(k)] = { _id: k, _num: 0 };

    return {
        _baseAttr: { _items: baseObj },
        _totalAttr: { _items: totalObj }
    };
}

/**
 * Serialize attribute items from a flat name→value object to _items array format.
 * Converts { hp: 100, attack: 50 } → [{ _id: 0, _num: 100 }, { _id: 1, _num: 50 }]
 * Uses numeric attribute IDs from ABILITY_NAME mapping.
 *
 * @param {object} attrs - Flat attribute object (keyed by attr name string)
 * @returns {Array} Array of { _id (numeric), _num } items
 */
function serializeAttrItems(attrs) {
    if (!attrs) return [];
    var items = [];
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
        if (attrs[keys[i]] != null && attrs[keys[i]] !== 0) {
            var numericId = ABILITY_NAME[keys[i]];
            if (numericId !== undefined) {
                items.push({ _id: numericId, _num: attrs[keys[i]] });
            } else {
                // Fallback: use the key as-is if no mapping found
                items.push({ _id: keys[i], _num: attrs[keys[i]] });
            }
        }
    }
    return items;
}

/**
 * Deserialize _items array to flat name→value object.
 * Converts [{ _id: 0, _num: 100 }] → { hp: 100 }
 * Supports both numeric IDs (via ATTR_ID_NAME lookup) and string names.
 *
 * @param {Array} items - Array of { _id (numeric or string), _num } items
 * @returns {object} Flat attribute object keyed by attribute name string
 */
function deserializeAttrItems(items) {
    if (!items || !Array.isArray(items)) return {};
    var attrs = {};
    for (var i = 0; i < items.length; i++) {
        var id = items[i]._id;
        var num = items[i]._num;
        // Resolve to attribute name
        var name;
        if (typeof id === 'number') {
            name = ATTR_ID_NAME[id];
        } else {
            // String: could be a number string or a name string
            var numId = parseInt(id, 10);
            if (!isNaN(numId) && ATTR_ID_NAME[numId]) {
                name = ATTR_ID_NAME[numId];
            } else {
                name = String(id);
            }
        }
        if (name) {
            attrs[name] = num;
        }
    }
    return attrs;
}

// =============================================
// SECTION 4: UTILITY — Inventory Management
// =============================================

/**
 * Get item count from user's totalProps.
 * totalProps._items is an object keyed by item ID string.
 * Each entry has { _id, _num, _star, _level, _part }.
 *
 * @param {object} gameData - User's game data
 * @param {number|string} itemId - Item ID
 * @returns {number} Current count (0 if not found)
 */
function getItemCount(gameData, itemId) {
    if (!gameData || !gameData.totalProps || !gameData.totalProps._items) return 0;
    var item = gameData.totalProps._items[itemId];
    return item ? (item._num || 0) : 0;
}

/**
 * Set item count in user's totalProps.
 * Creates the item entry if it doesn't exist.
 * Clamps to minimum 0.
 *
 * @param {object} gameData - User's game data
 * @param {number|string} itemId - Item ID
 * @param {number} newCount - New count (will be clamped to >= 0)
 * @returns {object} Updated item entry { _id, _num }
 */
function setItemCount(gameData, itemId, newCount) {
    if (!gameData.totalProps) gameData.totalProps = { _items: {} };
    if (!gameData.totalProps._items) gameData.totalProps._items = {};

    var idStr = String(itemId);
    if (!gameData.totalProps._items[idStr]) {
        gameData.totalProps._items[idStr] = { _id: idStr, _num: 0 };
    }
    gameData.totalProps._items[idStr]._num = Math.max(0, Math.floor(newCount));
    return { _id: idStr, _num: gameData.totalProps._items[idStr]._num };
}

/**
 * Add or subtract items from user's inventory.
 * Positive amount = add, negative amount = subtract.
 *
 * @param {object} gameData - User's game data
 * @param {number|string} itemId - Item ID
 * @param {number} amount - Amount to change (positive/negative)
 * @returns {object} Updated item entry { _id, _num }
 */
function addItem(gameData, itemId, amount) {
    var current = getItemCount(gameData, itemId);
    return setItemCount(gameData, itemId, current + amount);
}

/**
 * Check if user has enough of an item.
 *
 * @param {object} gameData - User's game data
 * @param {number|string} itemId - Item ID
 * @param {number} amount - Required amount
 * @returns {boolean} True if user has >= amount
 */
function hasItem(gameData, itemId, amount) {
    return getItemCount(gameData, itemId) >= amount;
}

/**
 * Build _changeInfo response object from array of item changes.
 * Client reads response._changeInfo._items to update UI.
 *
 * @param {Array} changes - Array of { _id, _num } entries
 * @returns {object} { _items: [...] }
 */
function buildChangeInfo(changes) {
    return { _items: changes || [] };
}

// =============================================
// SECTION 5: UTILITY — Hero Data Helpers
// =============================================

/**
 * Get hero instance from user data by heroId.
 * heroId is the instance ID (unique per hero in user's roster).
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroId - Instance heroId
 * @returns {object|null} Hero data object or null
 */
function getHero(gameData, heroId) {
    if (!gameData || !gameData.heros || !gameData.heros._heros) return null;
    return gameData.heros._heros[heroId] || gameData.heros._heros[String(heroId)] || null;
}

/**
 * Remove hero from user's roster.
 * Also cleans up any link references.
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroId - Instance heroId to remove
 * @returns {boolean} True if hero was found and removed
 */
function removeHero(gameData, heroId) {
    if (!gameData || !gameData.heros || !gameData.heros._heros) return false;
    var idStr = String(heroId);

    if (!gameData.heros._heros[idStr]) return false;

    var heroData = gameData.heros._heros[idStr];

    // Clean up link references
    if (heroData._linkTo) {
        // This hero links to another — remove the reverse link
        var linkedHero = getHero(gameData, heroData._linkTo);
        if (linkedHero && linkedHero._linkFrom === idStr) {
            linkedHero._linkFrom = null;
        }
    }
    if (heroData._linkFrom) {
        // Another hero links to this one — clear it
        var sourceHero = getHero(gameData, heroData._linkFrom);
        if (sourceHero && sourceHero._linkTo === idStr) {
            sourceHero._linkTo = null;
        }
    }

    delete gameData.heros._heros[idStr];
    return true;
}

/**
 * Add a new hero to user's roster with default values.
 * Creates full hero data structure matching client HeroDataModel.
 *
 * @param {object} gameData - User's game data
 * @param {string} heroId - New instance ID
 * @param {string|number} heroDisplayId - Template ID from hero.json
 * @param {number} [level] - Starting level (default 1)
 * @returns {object} The created hero data
 */
function addHero(gameData, heroId, heroDisplayId, level) {
    if (!gameData.heros) gameData.heros = {};
    if (!gameData.heros._heros) gameData.heros._heros = {};

    var idStr = String(heroId);
    var dispId = String(heroDisplayId);

    // Get hero info for default values
    var heroInfo = getHeroInfo(dispId);
    var defaultLevel = level || 1;

    gameData.heros._heros[idStr] = {
        _heroId: idStr,
        _heroDisplayId: dispId,
        _heroStar: 0,
        _heroTag: [0],
        _fragment: 0,
        _superSkillResetCount: 0,
        _potentialResetCount: 0,
        _expeditionMaxLevel: 0,
        _heroBaseAttr: {
            _level: defaultLevel,
            _evolveLevel: 0,
            maxlevel: getConstant('heroZeroStarMaxLevel') || 100,
            _hp: 0,
            _attack: 0,
            _armor: 0,
            _speed: 0,
            _hit: 0,
            _dodge: 0,
            _block: 0,
            _blockEffect: 0,
            _skillDamage: 0,
            _critical: 0,
            _criticalResist: 0,
            _criticalDamage: 0,
            _armorBreak: 0,
            _damageReduce: 0,
            _controlResist: 0,
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
            _damageUp: 0
        },
        _superSkillLevel: {},
        _potentialLevel: { "1": 0, "2": 0, "3": 0 },
        _qigong: null,
        _qigongTmp: null,
        _qigongStage: 1,
        _qigongTmpPower: 0,
        _totalCost: {
            _levelUp: [],
            _evolve: [],
            _qigong: [],
            _heroBreak: [],
            _wakeUp: []
        },
        _breakInfo: null,
        _gemstoneSuitId: null,
        _linkTo: null,
        _linkFrom: null
    };

    return gameData.heros._heros[idStr];
}

/**
 * Find first hero instance matching a displayId.
 * Iterates user's hero roster to find a hero with the given template ID.
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroDisplayId - Template ID to search for
 * @returns {object|null} { heroId, heroData } or null
 */
function findHeroByDisplayId(gameData, heroDisplayId) {
    if (!gameData || !gameData.heros || !gameData.heros._heros) return null;
    var keys = Object.keys(gameData.heros._heros);
    for (var i = 0; i < keys.length; i++) {
        var hid = keys[i];
        if (String(gameData.heros._heros[hid]._heroDisplayId) === String(heroDisplayId)) {
            return { heroId: hid, heroData: gameData.heros._heros[hid] };
        }
    }
    return null;
}

/**
 * Get next available hero instance ID.
 * Scans existing hero IDs and returns max + 1.
 *
 * @param {object} gameData - User's game data
 * @returns {string} Next hero ID as string
 */
function getNextHeroId(gameData) {
    if (!gameData || !gameData.heros || !gameData.heros._heros) return '1';
    var keys = Object.keys(gameData.heros._heros);
    var maxId = 0;
    for (var i = 0; i < keys.length; i++) {
        var id = parseInt(keys[i], 10);
        if (!isNaN(id) && id > maxId) maxId = id;
    }
    return String(maxId + 1);
}

/**
 * Get the maximum level a hero can reach.
 * This mirrors the client's getHeroCanLevelMax() logic (line 85941-85951)
 * combined with SetHeroDataToModel maxlevel assignment (line 85405-85416).
 *
 * CLIENT LOGIC:
 *   1. Base maxlevel from WakeUp config levelBound for hero's star
 *   2. If no WakeUp entry for star, use constant.heroZeroStarMaxLevel
 *   3. Runtime max = max(heroBaseAttr.maxlevel, expeditionMaxLevel, resonanceQualificationLevel)
 *   4. Resonance qualification only applies if:
 *      - heroQuality >= 6 (SilverOrange or SuperOrange)
 *      - heroStar >= 10
 *      - totalTalent >= minheroIntelligence threshold
 *      - resonance system unlocked
 *
 * NOTE: Resonance qualification system is deferred until resonance handler is implemented.
 * The base maxlevel from WakeUp config covers the primary use case.
 *
 * @param {object} heroData - Hero instance data
 * @returns {number} Maximum level this hero can reach
 */
function getMaxLevel(heroData) {
    var displayId = heroData._heroDisplayId;
    var heroStar = heroData._heroStar || 0;

    // Step 1: Base maxlevel from WakeUp config (client: SetHeroDataToModel line 85405-85416)
    // Default: constant.heroZeroStarMaxLevel
    var baseMaxLevel = getConstant('heroZeroStarMaxLevel') || 100;
    var wakeupEntries = getWakeUpConfig(displayId);
    for (var i = 0; i < wakeupEntries.length; i++) {
        if (wakeupEntries[i].star == heroStar) {
            baseMaxLevel = wakeupEntries[i].levelBound;
            break;
        }
    }

    // Step 2: Expedition max level (client: getHeroCanLevelMax line 85941-85951)
    var expeditionMax = heroData._expeditionMaxLevel || 0;

    // Step 3: Use the higher of base maxlevel and expedition max
    var maxLevel = Math.max(baseMaxLevel, expeditionMax);

    // Step 4: Global cap from constant.maxUserLevel
    var globalMax = getConstant('maxUserLevel') || 300;
    if (maxLevel > globalMax) maxLevel = globalMax;

    // Step 5: Resonance qualification level (DEFERRED)
    // Requires: heroConnectLevelMax config, resonanceData.totalTalent,
    // checkHeroLevelUpCondition(). Will be implemented with resonance handler.
    // When implemented, add: maxLevel = Math.max(maxLevel, resonanceLevel)
    // if checkHeroLevelUpCondition(heroData) is true.

    return maxLevel;
}

/**
 * Get the quality of a hero from its evolveLevel.
 * Convenience wrapper around getQualityFromEvolve.
 *
 * @param {object} heroData - Hero instance
 * @returns {string} Quality tier name
 */
function getHeroQuality(heroData) {
    if (!heroData || !heroData._heroBaseAttr) return 'white';
    return getQualityFromEvolve(heroData._heroBaseAttr._evolveLevel || 0);
}

// =============================================
// SECTION 6: UTILITY — Total Cost Tracking
// =============================================

/**
 * Initialize totalCost structure for a hero.
 * Called when creating a new hero to ensure _totalCost exists.
 * Tracks cumulative investment in: levelUp, evolve, qigong, heroBreak, wakeUp.
 *
 * @param {object} heroData - Hero instance
 */
function initTotalCost(heroData) {
    if (!heroData._totalCost || typeof heroData._totalCost !== 'object') {
        heroData._totalCost = {};
    }
    // Ensure all known categories are arrays (not {} or other truthy non-arrays).
    // BUG FIX: _totalCost sub-properties were sometimes initialized as {} instead of [],
    // causing "entries.push is not a function" in addTotalCostEntry.
    var categories = ['_levelUp', '_evolve', '_qigong', '_heroBreak', '_wakeUp', '_earring', '_skill'];
    for (var i = 0; i < categories.length; i++) {
        var cat = categories[i];
        if (!Array.isArray(heroData._totalCost[cat])) {
            heroData._totalCost[cat] = [];
        }
    }
}

/**
 * Add a cost entry to totalCost tracking.
 * Used to record what resources were spent on this hero.
 *
 * @param {object} heroData - Hero instance
 * @param {string} category - "levelUp", "evolve", "qigong", "heroBreak", "wakeUp"
 * @param {number|string} itemId - Item ID that was consumed
 * @param {number} amount - Amount consumed
 */
function addTotalCostEntry(heroData, category, itemId, amount) {
    initTotalCost(heroData);
    var catKey = '_' + category;
    // Defensive: ensure the category is an array even if initTotalCost missed it
    if (!Array.isArray(heroData._totalCost[catKey])) {
        heroData._totalCost[catKey] = [];
    }

    // Find existing entry for this item and accumulate
    var entries = heroData._totalCost[catKey];
    var found = false;
    for (var i = 0; i < entries.length; i++) {
        if (entries[i]._id == itemId) {
            entries[i]._num = (entries[i]._num || 0) + amount;
            found = true;
            break;
        }
    }
    if (!found) {
        entries.push({ _id: String(itemId), _num: amount });
    }
}

/**
 * Build totalCost response from hero data.
 * Returns the full totalCost object for client display.
 *
 * @param {object} heroData - Hero instance
 * @returns {object} Total cost object
 */
function buildTotalCostResponse(heroData) {
    if (!heroData || !heroData._totalCost) {
        return { _levelUp: [], _evolve: [], _qigong: [], _heroBreak: [], _wakeUp: [] };
    }
    return heroData._totalCost;
}

/**
 * Calculate total cost for a hero including all categories.
 * Returns a flat { _items: [{ _id, _num }] } format.
 *
 * @param {object} heroData - Hero instance
 * @returns {object} { _items: [...] }
 */
function calculateTotalCostFlat(heroData) {
    if (!heroData || !heroData._totalCost) return { _items: [] };

    var merged = {};
    var categories = ['_levelUp', '_evolve', '_qigong', '_heroBreak', '_wakeUp'];
    for (var c = 0; c < categories.length; c++) {
        var entries = heroData._totalCost[categories[c]];
        if (entries && Array.isArray(entries)) {
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                var id = String(e._id);
                if (!merged[id]) merged[id] = 0;
                merged[id] += e._num || 0;
            }
        }
    }

    var items = [];
    var keys = Object.keys(merged);
    for (var k = 0; k < keys.length; k++) {
        items.push({ _id: keys[k], _num: merged[keys[k]] });
    }
    return { _items: items };
}


// =============================================
// SECTION 7: UTILITY — Linked Hero System
// =============================================

/**
 * Build linked heroes response data.
 * When a hero is modified (level up, evolve, break, qigong, etc.),
 * linked/connected heroes may also need attribute updates.
 *
 * Linked heroes are connected via the heroConnect (bond/resonance) system.
 * When the main hero's attributes change, connected heroes' base attrs may also change.
 *
 * @param {object} gameData - User's game data
 * @param {string} heroId - The hero that was modified
 * @param {object} heroData - Modified hero's data
 * @returns {object|null} Linked heroes data or null
 *   Format: { [linkedHeroId]: { basicAttr: attrs, totalAttr: attrs, breakInfo: ..., qigong: ... } }
 */
function buildLinkHeroesResponse(gameData, heroId, heroData) {
    // Check if this hero has linked heroes
    if (!heroData._linkTo && !heroData._linkFrom) return null;

    var linkHeroes = {};

    // [BUG 4 FIX] Normalize _linkTo to array for consistent iteration.
    // Client can send _linkTo as either a string (single link) or an array (multiple links).
    var linkToTargets = heroData._linkTo;
    if (linkToTargets && !Array.isArray(linkToTargets)) {
        linkToTargets = [linkToTargets];
    }

    // If this hero links TO another hero, the target needs updating
    if (linkToTargets) {
        for (var lt = 0; lt < linkToTargets.length; lt++) {
            var targetId = String(linkToTargets[lt]);
            var targetHero = getHero(gameData, targetId);
            if (targetHero) {
                var targetAttrs = calculateHeroAttrs(targetHero, gameData);
                // [BUG 3 FIX] Include full hero data in 'hero' field.
                // Client setDecomposeHeroLink (line 85269): a.hero = o.hero → SetHeroDataToModel(o.hero)
                // Without 'hero' field, client crashes trying to call SetHeroDataToModel(undefined).
                linkHeroes[targetId] = {
                    hero: targetHero,
                    basicAttr: targetAttrs._baseAttr,
                    totalAttr: targetAttrs._totalAttr,
                    breakInfo: targetHero._breakInfo,
                    qigong: targetHero._qigong
                };
            }
        }
    }

    // If another hero links FROM this hero, the source needs updating
    if (heroData._linkFrom) {
        // _linkFrom is always a single heroId (string)
        var sourceId = String(heroData._linkFrom);
        var sourceHero = getHero(gameData, sourceId);
        if (sourceHero) {
            var sourceAttrs = calculateHeroAttrs(sourceHero, gameData);
            linkHeroes[sourceId] = {
                hero: sourceHero,
                basicAttr: sourceAttrs._baseAttr,
                totalAttr: sourceAttrs._totalAttr,
                breakInfo: sourceHero._breakInfo,
                qigong: sourceHero._qigong
            };
        }
    }

    return Object.keys(linkHeroes).length > 0 ? linkHeroes : null;
}

// =============================================
// SECTION 8: UTILITY — Hero Power Calculation
// =============================================

/**
 * Calculate hero power rating.
 * Power formula uses constant.json params:
 *   zPowerFormulaParaA (100), zPowerFormulaParaB (5),
 *   zPowerFormulaParaC (10), zPowerFormulaParaD (35)
 *
 * Approximate formula:
 *   power = (hp/A + attack/B + armor/C) × D × balancePower
 *
 * @param {object} heroData - Hero instance
 * @returns {number} Power rating
 */
function calculateHeroPower(heroData) {
    if (!heroData) return 0;

    var attrs = calculateHeroAttrs(heroData);
    var totalItems = attrs._totalAttr._items || {};
    var heroInfo = getHeroInfo(heroData._heroDisplayId);

    return computeStatPower(heroInfo, totalItems);
}

// =============================================
// SECTION 9: UTILITY — Level Up Helpers
// =============================================

/**
 * Determine hero upgrade state (UP_TYPE).
 * Checks if hero is at max level, needs awakening, or can level up.
 *
 * Client checks (line 123080):
 *   UP_TYPE.TYPE_FULL → max level reached
 *   UP_TYPE.TYPE_WAKEUP → needs awakening (star up) first
 *   Otherwise → can level up (checks exp and gold)
 *
 * @param {object} heroData - Hero instance
 * @returns {object} { upType, nextLevel, maxLevel }
 */
function getHeroUpType(heroData) {
    if (!heroData || !heroData._heroBaseAttr) {
        return { upType: UP_TYPE.TYPE_FULL, nextLevel: 0, maxLevel: 0 };
    }

    var level = heroData._heroBaseAttr._level || 1;
    var evolveLevel = heroData._heroBaseAttr._evolveLevel || 0;
    var star = heroData._heroStar || 0;
    var maxLevel = getMaxLevel(heroData);

    if (level >= maxLevel) {
        return { upType: UP_TYPE.TYPE_FULL, nextLevel: 0, maxLevel: maxLevel };
    }

    // Check if hero needs awakening to increase max level
    var displayId = heroData._heroDisplayId;
    var heroInfo = getHeroInfo(displayId);
    var wakeupMax = heroInfo ? (heroInfo.wakeupMax || 0) : 0;

    if (wakeupMax > 0 && star >= wakeupMax && level >= maxLevel) {
        return { upType: UP_TYPE.TYPE_WAKEUP, nextLevel: level + 1, maxLevel: maxLevel };
    }

    return { upType: UP_TYPE.DEFAULT, nextLevel: level + 1, maxLevel: maxLevel };
}

/**
 * Get level up cost for the given level.
 * The JSON config is keyed by current level. Entry with id=N contains
 * the cost to level up FROM level N TO level N+1.
 *
 * Client reference (line 85978-85990):
 *   getHeroLevelLocal(heroQuality, heroBaseAttr.level)
 *   → finds entry where entry.id == currentLevel
 *
 * @param {number} currentLevel - The hero's current level (cost to go FROM this level)
 * @param {string} quality - Current quality tier name
 * @returns {object|null} { costID1, num1, costID2, num2 } or null if no entry
 */
function getLevelUpCost(currentLevel, quality) {
    var configName = LEVEL_UP_CONFIG[quality];
    if (!configName) return null;

    var config = GameData.get(configName);
    if (!config) return null;

    var entry = config[String(currentLevel)];
    if (!entry) return null;

    return {
        costID1: entry.costID1,
        num1: entry.num1 || 0,
        costID2: entry.costID2,
        num2: entry.num2 || 0
    };
}

// =============================================
// SECTION 10: ACTION — getAttrs
// =============================================

/**
 * ACTION 1: getAttrs — Calculate and return attributes for requested heroes.
 *
 * CLIENT REQUEST (line 53614, 85422, 169699):
 *   { type:"hero", action:"getAttrs", userId, heros:[heroId,...], version:"1.0" }
 *
 * CLIENT CALLBACK — HerosManager.getAttrsCallBack (line 85141):
 *   - Iterates t._attrs with `for (var o in t._attrs)`
 *   - Uses `n.getHero(e[o])` where e=heroIdList (array) and o=iteration key
 *   - _attrs is an ARRAY of hero attr objects — o="0","1",... maps correctly
 *
 * RESPONSE FORMAT (verified from HAR — 26 heroes analyzed):
 *   _attrs: [{ _items: { "0":{_id:0,_num:...}, "1":{_id:1,_num:...}, ... } }, ...]
 *   _baseAttrs: [{ _items: { "0":{_id:0,_num:...}, ... } }, ...]
 *
 *   _items is an OBJECT keyed by string ID (NOT an array).
 *   _attrs._items has 42 IDs (0-41) for every hero.
 *   _baseAttrs._items has 35 IDs (0-15, 23-41) — IDs 16-22 excluded per HAR.
 *
 *   ID 16 (energy) = always 50, ID 21 (power) = zPower, ID 22 (orghp) = totalHP.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionGetAttrs(parsed, callback) {
    var userId = parsed.userId;
    var heroIds = parsed.heros;

    // Validate input
    if (!heroIds || !Array.isArray(heroIds) || heroIds.length === 0) {
        callback(RH.success({ _attrs: [], _baseAttrs: [] }));
        return;
    }

    logger.info('HERO', 'getAttrs userId=' + userId + ' heroCount=' + heroIds.length);

    userDataService.loadUserData(userId)
        .then(function (gameData) {
            if (!gameData) {
                logger.warn('HERO', 'getAttrs userId=' + userId + ' user not found');
                callback(RH.success({ _attrs: [], _baseAttrs: [] }));
                return;
            }

            // BUGFIX: Use ARRAYS instead of objects.
            // Client callback iterates `for (var o in t._attrs)` and uses `e[o]` to look up
            // the heroId from the original request array. When _attrs is an array,
            // o="0","1",... which correctly maps to heroIdList[0], heroIdList[1], etc.
            var attrs = [];
            var baseAttrs = [];

            // Calculate attributes for each requested hero
            for (var i = 0; i < heroIds.length; i++) {
                var hid = String(heroIds[i]);
                var heroData = getHero(gameData, hid);

                if (heroData) {
                    var calculated = calculateHeroAttrs(heroData, gameData);
                    attrs.push(calculated._totalAttr);
                    baseAttrs.push(calculated._baseAttr);
                } else {
                    // Hero not found — return empty attrs (Object format, all zeros)
                    var ea = emptyAttrs();
                    attrs.push(ea._totalAttr);
                    baseAttrs.push(ea._baseAttr);
                }
            }

            callback(RH.success({ _attrs: attrs, _baseAttrs: baseAttrs }));
        })
        .catch(function (err) {
            logger.error('HERO', 'getAttrs error userId=' + userId + ': ' + err.message);
            callback(RH.success({ _attrs: [], _baseAttrs: [] }));
        });
}

// =============================================
// SECTION 11: ACTION — autoLevelUp
// =============================================

/**
 * ACTION 2: autoLevelUp — Level up a hero (single or bulk).
 *
 * CLIENT REQUEST (line 123078-123112):
 *   {
 *     type: "hero", action: "autoLevelUp",
 *     userId, heroId, version: "1.0",
 *     times: 1 | 100
 *   }
 *   times=1: single click ("levelUpBtnTimeTap")
 *   times=100: one-key auto ("oneKeyLevelUpBtnTap")
 *   Client sets: var i = "levelUp" == e ? 1 : 100
 *
 * CLIENT PRE-CHECKS (line 123083-123096):
 *   1. levelUpCallBack must be undefined or true (not already in-progress)
 *   2. getHeroNextState(hero) — checks if can level up:
 *      TYPE_FULL → show "max level" dialog, do NOT send request
 *      TYPE_WAKEUP → show "needs awakening" dialog, do NOT send request
 *      TYPE_LEVEL → proceed
 *   3. levelUpExpEnough (bool) — if false, show "not enough exp" dialog, do NOT send
 *   4. levelUpGoldEnough (bool) — if false, show "not enough gold" dialog, do NOT send
 *
 * CLIENT RESPONSE PROCESSING (line 123108):
 *   HerosManager.levelUpCallBack(n) → processes hero level + attrs
 *   EquipInfoManager.wakeUpEarringData(n.heroId, n._equip) → if _equip present
 *   ItemsCommonSingleton.resetTtemsCallBack(n) → updates item cache from _changeInfo
 *   showLevelUpEffect() → visual feedback
 *   doRefresh() → UI refresh
 *
 * HerosManager.levelUpCallBack (line 85149-85158):
 *   1. getHero(e.heroId) → main hero model
 *   2. setHeroLevelUpDataChange(e, mainHero) → sets heroBaseAttr.level from _heroLevel
 *   3. for (a in o.linkTo):
 *        setHeroLevelUpDataChange(e, linkedHero) → sets level on ALL linked heroes
 *   4. setTotalAttrs(e, mainHero) → processes _baseAttr, _totalAttr, _totalCost,
 *        _linkHeroesBasicAttr, _linkHeroesTotalAttr
 *
 * setHeroLevelUpDataChange (line 85159-85161):
 *   - e._evolveLevel && (t.heroBaseAttr.evolveLevel = e._evolveLevel, setSkills...)
 *   - e._heroLevel && (t.heroBaseAttr.level = e._heroLevel)
 *   - updates alreadyGainHeroIDList maxLevel tracking
 *
 * setTotalAttrs (line 85201-85231):
 *   - e._baseAttr → setBaseAttr(e._baseAttr, hero)
 *   - e._totalAttr._items → updates hero.totalAttr entries
 *   - e._totalCost → hero.totalCost.deserialize(e._totalCost)
 *   - e._linkHeroesBasicAttr → for each heroId: setBaseAttrsByHeroId(data, heroId)
 *   - e._linkHeroesTotalAttr → for each heroId: setTotalAttrsByHeroIdNotChange(data, heroId)
 *
 * resetTtemsCallBack (line ~79577):
 *   - Reads e._changeInfo._items → for each: setItem(_id, _num) to update local cache
 *
 * LEVEL UP COST (heroLevelUp{Quality}.json):
 *   Keyed by current level. Entry id=N = cost to go FROM level N TO level N+1.
 *   { id, costID1: 131 (EXP_CAPSULE), num1, costID2: 102 (GOLD), num2 }
 *   Client lookup: getHeroLevelLocal(heroQuality, heroBaseAttr.level)
 *     → u[e] selects config by heroQuality (1-7 numeric from hero.json)
 *     → iterates entries, returns entry where entry.id == currentLevel
 *
 * IMPORTANT — QUALITY FOR COST LOOKUP:
 *   heroQuality is a STATIC property from hero.json config (line 85398-85400):
 *     o.heroQuality = HeroCommon.colorToHeroColor(r.quality)
 *   It does NOT change with evolveLevel. A green hero at evolveLevel 0
 *   still uses heroLevelUpGreen costs. Use getHeroBaseQuality() for cost lookup.
 *
 * MAX LEVEL (client: SetHeroDataToModel line 85405-85416, getHeroCanLevelMax line 85941):
 *   1. Base: WakeUp config levelBound for hero's star (fallback: heroZeroStarMaxLevel)
 *   2. Runtime: max(baseMaxLevel, expeditionMaxLevel, resonanceQualificationLevel)
 *   3. Global cap: constant.maxUserLevel
 *   Use getMaxLevel(heroData) for correct calculation.
 *
 * LINKED HERO SYSTEM (resonance/bond):
 *   Main hero: _linkTo = array of child hero IDs (client model: linkTo = [])
 *   Child hero: _linkFrom = main hero's ID (client model: linkFrom = "")
 *   Client iterates: for (a in o.linkTo) { getHero(o.linkTo[a]) }
 *   Server must update ALL linked heroes' levels and include their attrs in response.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionAutoLevelUp(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;
    var times = parseInt(parsed.times) || 1;

    logger.info('HERO', 'autoLevelUp userId=' + userId + ' heroId=' + heroId + ' times=' + times);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        var baseAttr = heroData._heroBaseAttr || {};
        var level = baseAttr._level || 1;

        // Max level from WakeUp config + expedition + global cap (mirrors client logic)
        var maxLevel = getMaxLevel(heroData);

        // Cost table quality from hero.json config (NOT from evolveLevel!)
        // Client: getHeroLevelLocal(t.heroQuality, t.heroBaseAttr.level)
        // heroQuality = colorToHeroColor(hero.json quality) — static per hero template
        var quality = getHeroBaseQuality(heroData._heroDisplayId);

        // Ensure totalCost structure exists
        initTotalCost(heroData);

        // Track final item states for _changeInfo (deduplicated by itemId)
        var changedItems = {};     // keyed by itemId string → final { _id, _num }
        var lastConsumedExpId = null;  // track last consumed exp item ID
        var lastConsumedGoldId = null; // track last consumed gold item ID
        var totalExpCost = 0;
        var totalGoldCost = 0;
        var levelsGained = 0;
        var stoppedBy = null;     // 'max' | 'time_bonus' | 'tips' | null

        // Level up loop
        for (var t = 0; t < times; t++) {
            if (level >= maxLevel) {
                stoppedBy = 'max';
                break;
            }

            // Cost to go FROM current level TO level+1
            // JSON entry id=N = cost FROM level N TO level N+1
            var cost = getLevelUpCost(level, quality);
            if (!cost) {
                stoppedBy = 'max';
                break;
            }

            // Check cost 1 (exp capsule, usually item 131)
            if (cost.num1 > 0) {
                if (!hasItem(gameData, cost.costID1, cost.num1)) {
                    // Client pattern (line 126229-126242): shows TIME_BONUS if player has
                    // at least 1 of the item (can partially level up), TIPS if has 0.
                    stoppedBy = hasItem(gameData, cost.costID1, 1) ? 'time_bonus' : 'tips';
                    break;
                }
            }

            // Check cost 2 (gold, usually item 102)
            if (cost.num2 > 0) {
                if (!hasItem(gameData, cost.costID2, cost.num2)) {
                    stoppedBy = hasItem(gameData, cost.costID2, 1) ? 'time_bonus' : 'tips';
                    break;
                }
            }

            // Deduct costs and record to totalCost tracking
            if (cost.num1 > 0) {
                addItem(gameData, cost.costID1, -cost.num1);
                totalExpCost += cost.num1;
                lastConsumedExpId = cost.costID1;
                addTotalCostEntry(heroData, 'levelUp', cost.costID1, cost.num1);
            }
            if (cost.num2 > 0) {
                addItem(gameData, cost.costID2, -cost.num2);
                totalGoldCost += cost.num2;
                lastConsumedGoldId = cost.costID2;
                addTotalCostEntry(heroData, 'levelUp', cost.costID2, cost.num2);
            }

            level++;
            levelsGained++;
        }

        // Record FINAL item counts for _changeInfo._items
        // Client resetTtemsCallBack: for (o in items) setItem(items[o]._id, items[o]._num)
        // _num = the item's count AFTER all deductions (not the amount consumed)
        if (totalExpCost > 0 && lastConsumedExpId != null) {
            changedItems[String(lastConsumedExpId)] = {
                _id: String(lastConsumedExpId),
                _num: getItemCount(gameData, lastConsumedExpId)
            };
        }
        if (totalGoldCost > 0 && lastConsumedGoldId != null) {
            changedItems[String(lastConsumedGoldId)] = {
                _id: String(lastConsumedGoldId),
                _num: getItemCount(gameData, lastConsumedGoldId)
            };
        }

        // Update main hero's level
        heroData._heroBaseAttr._level = level;

        // Update linked heroes' levels (resonance/bond system)
        // Client levelUpCallBack (line 85149-85158):
        //   for (a in o.linkTo) { setHeroLevelUpDataChange(e, getHero(o.linkTo[a])) }
        // linkTo is an array of child hero IDs on the main hero
        // _linkFrom on child heroes points back to the main hero
        var linkedHeroIds = [];
        var linkTo = heroData._linkTo;
        if (linkTo) {
            // Normalize to array (handle both string and array formats)
            var linkArray = Array.isArray(linkTo) ? linkTo : [linkTo];
            for (var li = 0; li < linkArray.length; li++) {
                var linkedId = String(linkArray[li]);
                var linkedHero = getHero(gameData, linkedId);
                if (linkedHero) {
                    linkedHero._heroBaseAttr._level = level;
                    linkedHeroIds.push(linkedId);
                }
            }
        }

        // Build response — calculate attrs for main hero
        var attrs = calculateHeroAttrs(heroData, gameData);

        // Build _linkHeroesBasicAttr and _linkHeroesTotalAttr for linked heroes
        // Client setTotalAttrs (line 85201-85231):
        //   e._linkHeroesBasicAttr → for (g in data) setBaseAttrsByHeroId(data[g], g)
        //   e._linkHeroesTotalAttr → for (g in data) setTotalAttrsByHeroIdNotChange(data[g], g)
        var linkHeroesBasicAttr = null;
        var linkHeroesTotalAttr = null;
        if (linkedHeroIds.length > 0) {
            linkHeroesBasicAttr = {};
            linkHeroesTotalAttr = {};
            for (var li2 = 0; li2 < linkedHeroIds.length; li2++) {
                var lhid = linkedHeroIds[li2];
                var linkedHeroData = getHero(gameData, lhid);
                if (linkedHeroData) {
                    var linkedAttrs = calculateHeroAttrs(linkedHeroData, gameData);
                    linkHeroesBasicAttr[lhid] = linkedAttrs._baseAttr;
                    linkHeroesTotalAttr[lhid] = linkedAttrs._totalAttr;
                }
            }
        }

        // Build response object
        // Client expects: heroId, _heroLevel, _baseAttr, _totalAttr, _changeInfo, _totalCost
        var response = {
            heroId: heroId,
            _heroLevel: level,
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr,
            _changeInfo: {
                _items: Object.keys(changedItems).map(function (k) { return changedItems[k]; })
            },
            _totalCost: buildTotalCostResponse(heroData)
        };

        // _evolveLevel: only include if changed (evolve action reuse).
        // autoLevelUp never changes evolveLevel. Client setHeroLevelUpDataChange
        // only applies _evolveLevel if truthy: e._evolveLevel && (...)
        // Omitting is safe and correct for pure level-up.

        // _linkHeroesBasicAttr / _linkHeroesTotalAttr: attrs for linked heroes
        if (linkHeroesBasicAttr) {
            response._linkHeroesBasicAttr = linkHeroesBasicAttr;
        }
        if (linkHeroesTotalAttr) {
            response._linkHeroesTotalAttr = linkHeroesTotalAttr;
        }

        // _openType: client autoLevelUp callback does NOT explicitly check _openType.
        // Other actions (evolve, break, wakeUp) DO check _openType in their callbacks.
        // Including it is harmless — serves as safety net for edge cases.
        if (stoppedBy === 'time_bonus') {
            response._openType = OPEN_TYPE.TIME_BONUS;
        } else if (stoppedBy === 'tips') {
            response._openType = OPEN_TYPE.TIPS;
        }

        // Save and respond
        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'autoLevelUp userId=' + userId + ' heroId=' + heroId
                + ' +' + levelsGained + 'Lv (now Lv.' + level + '/' + maxLevel + ')'
                + ' exp=' + totalExpCost + ' gold=' + totalGoldCost
                + (stoppedBy ? ' stop=' + stoppedBy : ' complete'));
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'autoLevelUp save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Save failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'autoLevelUp error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Level up failed'));
    });
}

// =============================================
// SECTION 12: ACTION — evolve
// =============================================

/**
 * ACTION 3: evolve — Evolve a hero (breakthrough evolve).
 *
 * CLIENT REQUEST (line 121120-121152):
 *   { type:"hero", action:"evolve", userId, heroId, version:"1.0" }
 *
 * CLIENT CALLBACK (line 121146-121151):
 *   if(e._changeInfo) {
 *     HerosManager.getInstance().levelUpCallBack(e, !0)   // isEvolve=true
 *     ItemsCommonSingleton.getInstance().resetTtemsCallBack(e)
 *     ts.closeWindow("HeroEvolve")
 *     var i = t.getOnUpdate(); i()  // refresh UI
 *   }
 *
 * HerosManager.levelUpCallBack (line 85149-85158, called with isEvolve=true):
 *   1. setHeroLevelUpDataChange(e, mainHero)
 *      → e._evolveLevel && (t.heroBaseAttr.evolveLevel = e._evolveLevel,
 *          setHeroPassiveSkillState(t), setHeroProactiveSkillState(t))
 *      → e._heroLevel && (t.heroBaseAttr.level = e._heroLevel)
 *   2. for(a in o.linkTo) { setHeroLevelUpDataChange(e, linkedHero) }
 *   3. setTotalAttrs(e, o) → processes _baseAttr, _totalAttr, _totalCost,
 *      _linkHeroesBasicAttr, _linkHeroesTotalAttr
 *
 * setHeroPassiveSkillState (line 85514-85537):
 *   - Gets evolve entry by (displayId, evolveLevel)
 *   - If entry exists: overrides normal/proactive/passive skills from entry
 *   - If no entry: falls back to hero.json base skills
 *   - Also processes red passive skills (redPassive1-3ID/Level)
 *
 * setHeroProactiveSkillState (line 85500-85503):
 *   - Gets proactive level from WakeUp config based on heroStar
 *   - Applies level to proactive skill
 *
 * CLIENT PRE-CHECKS (line 121093-121106, 121120-121152):
 *   1. getHeroNextState checks TYPE_EVOLVE vs TYPE_WAITSTARUP:
 *      - TYPE_WAITSTARUP if: expeditionMaxLevel<=0 AND heroStar < entry.needStarSelf
 *      - TYPE_EVOLVE otherwise (if heroLevel == entry.level AND heroLevel > evolveLevel)
 *   2. checkHeroEvolveNeed(quality, needLevel, needNum, needStar):
 *      Counts sacrificial heroes in roster meeting quality/level/star requirements
 *   3. hasOtherHero must be true for evolve button to be enabled
 *
 * EVOLVE ENTRY LOOKUP (line 85991-85994):
 *   getHeroEvolveLocal(displayId, heroBaseAttr.level) → entry where entry.level == heroLevel
 *   Note: entry.level is the hero LEVEL threshold AND the resulting evolveLevel.
 *
 * EVOLVE CONFIG FIELDS (heroEvolve.json + heroEvolveRed.json merged):
 *   level, costID1/num1, costID2/num2, costID3/num3,
 *   needLevel, needQuality, needNum, needStar, needStarSelf,
 *   hp, attack, normalID, skillID,
 *   skillPassive1-3ID/Level, redPassive1-3ID/Level,
 *   activation, levelUp
 *
 * IMPORTANT — EVOLVE DOES NOT:
 *   - Change heroStar (stars only change via wakeUp/starUp)
 *   - Consume sacrificial heroes (they're a prerequisite gate only)
 *   - Consume hero fragments (_fragment)
 *   - Change hero level
 *
 * EVOLVE DOES:
 *   - Set evolveLevel = entry.level
 *   - Consume cost items (costID1/2/3, num1/2/3)
 *   - Also evolve ALL linked heroes (client applies _evolveLevel to linked heroes)
 *   - Recalculate attributes (evolve bonuses from hp/attack in entries)
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionEvolve(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;

    logger.info('HERO', 'evolve userId=' + userId + ' heroId=' + heroId);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        var displayId = heroData._heroDisplayId;
        var currentEvolve = heroData._heroBaseAttr._evolveLevel || 0;
        var level = heroData._heroBaseAttr._level || 1;
        var star = heroData._heroStar || 0;

        // Find evolve entry matching hero's CURRENT LEVEL
        // Client: getHeroEvolveLocal(displayId, heroBaseAttr.level)
        // getHeroNextState checks: entry.level == heroLevel AND heroLevel > evolveLevel
        var evolveEntry = getEvolveEntryByLevel(displayId, level);

        if (!evolveEntry) {
            // No evolve entry at current level — hero not at an evolve point
            var noEntryAttrs = calculateHeroAttrs(heroData, gameData);
            logger.info('HERO', 'evolve userId=' + userId + ' heroId=' + heroId
                + ' no evolve entry at level ' + level);
            callback(RH.success({
                heroId: heroId,
                _evolveLevel: currentEvolve,
                _heroLevel: level,
                _baseAttr: noEntryAttrs._baseAttr,
                _totalAttr: noEntryAttrs._totalAttr,
                _changeInfo: { _items: [] },
                _totalCost: buildTotalCostResponse(heroData)
            }));
            return;
        }

        // Already evolved at this level
        if (level <= currentEvolve) {
            var alreadyAttrs = calculateHeroAttrs(heroData, gameData);
            logger.info('HERO', 'evolve userId=' + userId + ' heroId=' + heroId
                + ' already evolved at level ' + level + ' (evolveLevel=' + currentEvolve + ')');
            callback(RH.success({
                heroId: heroId,
                _evolveLevel: currentEvolve,
                _heroLevel: level,
                _baseAttr: alreadyAttrs._baseAttr,
                _totalAttr: alreadyAttrs._totalAttr,
                _changeInfo: { _items: [] },
                _totalCost: buildTotalCostResponse(heroData)
            }));
            return;
        }

        // === VALIDATION ===

        // Check needStarSelf — hero's own star requirement
        // Client (line 85930-85931): heroStar < entry.needStarSelf → TYPE_WAITSTARUP
        if (evolveEntry.needStarSelf && star < evolveEntry.needStarSelf) {
            var starFailAttrs = calculateHeroAttrs(heroData, gameData);
            logger.info('HERO', 'evolve userId=' + userId + ' heroId=' + heroId
                + ' needStarSelf=' + evolveEntry.needStarSelf + ' but star=' + star);
            callback(RH.success({
                heroId: heroId,
                _evolveLevel: currentEvolve,
                _heroLevel: level,
                _baseAttr: starFailAttrs._baseAttr,
                _totalAttr: starFailAttrs._totalAttr,
                _changeInfo: { _items: [] },
                _openType: OPEN_TYPE.TIPS,
                _totalCost: buildTotalCostResponse(heroData)
            }));
            return;
        }

        // Check sacrificial hero prerequisites (line 85748-85753: checkHeroEvolveNeed)
        // needNum heroes with: quality >= needQuality, level >= needLevel, star >= needStar
        // These are NOT consumed — only a gate check
        if (evolveEntry.needNum && evolveEntry.needNum > 0) {
            var requiredQuality = evolveEntry.needQuality ? String(evolveEntry.needQuality).toLowerCase() : 'white';
            var requiredLevel = evolveEntry.needLevel || 0;
            var requiredStar = evolveEntry.needStar || 0;
            var requiredCount = evolveEntry.needNum;

            var heroQualityNum = QUALITY_INDEX[requiredQuality] || 1;
            var sacrificialCount = countSacrificialHeroes(gameData, heroId, heroQualityNum, requiredLevel, requiredStar);

            if (sacrificialCount < requiredCount) {
                var sacFailAttrs = calculateHeroAttrs(heroData, gameData);
                logger.info('HERO', 'evolve userId=' + userId + ' heroId=' + heroId
                    + ' need ' + requiredCount + ' sacrificial heroes (quality>=' + heroQualityNum
                    + ' level>=' + requiredLevel + ' star>=' + requiredStar + ') but has ' + sacrificialCount);
                callback(RH.success({
                    heroId: heroId,
                    _evolveLevel: currentEvolve,
                    _heroLevel: level,
                    _baseAttr: sacFailAttrs._baseAttr,
                    _totalAttr: sacFailAttrs._totalAttr,
                    _changeInfo: { _items: [] },
                    _openType: OPEN_TYPE.TIPS,
                    _totalCost: buildTotalCostResponse(heroData)
                }));
                return;
            }
        }

        // Check and consume cost items (up to 3 cost slots: costID1/2/3)
        var itemChanges = [];  // { _id, _num } entries for _changeInfo
        var costFailed = false;

        for (var ci = 1; ci <= 3; ci++) {
            var costId = evolveEntry['costID' + ci];
            var costNum = evolveEntry['num' + ci];
            if (!costId || !costNum || costNum <= 0) continue;

            if (!hasItem(gameData, costId, costNum)) {
                // Return with appropriate openType
                var costFailAttrs = calculateHeroAttrs(heroData, gameData);
                var openType = hasItem(gameData, costId, 1) ? OPEN_TYPE.TIME_BONUS : OPEN_TYPE.TIPS;
                logger.info('HERO', 'evolve userId=' + userId + ' heroId=' + heroId
                    + ' not enough item ' + costId + ' (need ' + costNum + ')');
                callback(RH.success({
                    heroId: heroId,
                    _evolveLevel: currentEvolve,
                    _heroLevel: level,
                    _baseAttr: costFailAttrs._baseAttr,
                    _totalAttr: costFailAttrs._totalAttr,
                    _changeInfo: { _items: [] },
                    _openType: openType,
                    _totalCost: buildTotalCostResponse(heroData)
                }));
                costFailed = true;
                break;
            }

            // Deduct the cost item
            var result = addItem(gameData, costId, -costNum);
            itemChanges.push(result);
            addTotalCostEntry(heroData, 'evolve', costId, costNum);
        }

        if (costFailed) return;

        // === EXECUTE EVOLVE ===
        var newEvolveLevel = evolveEntry.level;
        heroData._heroBaseAttr._evolveLevel = newEvolveLevel;
        // NOTE: evolve does NOT change heroStar — stars only change via wakeUp

        // Update linked heroes' evolveLevel (client applies _evolveLevel to ALL linked heroes)
        // levelUpCallBack: for(a in o.linkTo) { setHeroLevelUpDataChange(e, linkedHero) }
        // setHeroLevelUpDataChange: e._evolveLevel && (t.heroBaseAttr.evolveLevel = e._evolveLevel, setSkills...)
        var linkedHeroIds = [];
        var linkTo = heroData._linkTo;
        if (linkTo) {
            var linkArray = Array.isArray(linkTo) ? linkTo : [linkTo];
            for (var li = 0; li < linkArray.length; li++) {
                var linkedId = String(linkArray[li]);
                var linkedHero = getHero(gameData, linkedId);
                if (linkedHero) {
                    linkedHero._heroBaseAttr._evolveLevel = newEvolveLevel;
                    linkedHeroIds.push(linkedId);
                }
            }
        }

        // Recalculate attributes after evolve
        var newAttrs = calculateHeroAttrs(heroData, gameData);

        // Build _linkHeroesBasicAttr and _linkHeroesTotalAttr for linked heroes
        var linkHeroesBasicAttr = null;
        var linkHeroesTotalAttr = null;
        if (linkedHeroIds.length > 0) {
            linkHeroesBasicAttr = {};
            linkHeroesTotalAttr = {};
            for (var li2 = 0; li2 < linkedHeroIds.length; li2++) {
                var lhid = linkedHeroIds[li2];
                var linkedHeroData = getHero(gameData, lhid);
                if (linkedHeroData) {
                    var linkedAttrs = calculateHeroAttrs(linkedHeroData, gameData);
                    linkHeroesBasicAttr[lhid] = linkedAttrs._baseAttr;
                    linkHeroesTotalAttr[lhid] = linkedAttrs._totalAttr;
                }
            }
        }

        // Build response
        var response = {
            heroId: heroId,
            _evolveLevel: newEvolveLevel,
            _heroLevel: level,
            _baseAttr: newAttrs._baseAttr,
            _totalAttr: newAttrs._totalAttr,
            _changeInfo: { _items: itemChanges },
            _totalCost: buildTotalCostResponse(heroData)
        };

        // Linked heroes attrs (client setTotalAttrs reads these)
        if (linkHeroesBasicAttr) {
            response._linkHeroesBasicAttr = linkHeroesBasicAttr;
        }
        if (linkHeroesTotalAttr) {
            response._linkHeroesTotalAttr = linkHeroesTotalAttr;
        }

        // Save and respond
        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'evolve userId=' + userId + ' heroId=' + heroId
                + ' evolveLevel=' + currentEvolve + '→' + newEvolveLevel);
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'evolve save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Evolve failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'evolve error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Evolve failed'));
    });
}

/**
 * Count sacrificial heroes in the user's roster that meet evolve requirements.
 * Mirrors client: checkHeroEvolveNeed (line 85748-85753)
 *
 * Client checks: heroQuality >= requiredQuality, heroBaseAttr.level >= requiredLevel,
 * heroStar >= requiredStar, NOT expedition hero, NOT linked hero
 *
 * @param {object} gameData - User's game data
 * @param {string} excludeHeroId - Hero being evolved (exclude from count)
 * @param {number} requiredQuality - Min quality numeric (1-7 from QUALITY_INDEX)
 * @param {number} requiredLevel - Min level
 * @param {number} requiredStar - Min star
 * @returns {number} Count of eligible sacrificial heroes
 */
function countSacrificialHeroes(gameData, excludeHeroId, requiredQuality, requiredLevel, requiredStar) {
    if (!gameData || !gameData.heros || !gameData.heros._heros) return 0;

    var count = 0;
    var excludeIdStr = String(excludeHeroId);
    var heroKeys = Object.keys(gameData.heros._heros);

    for (var i = 0; i < heroKeys.length; i++) {
        var hKey = heroKeys[i];
        if (hKey === excludeIdStr) continue;  // exclude the hero being evolved

        var h = gameData.heros._heros[hKey];
        if (!h) continue;

        // Skip expedition heroes (client: expeditionMaxLevel <= 0)
        if (h._expeditionMaxLevel && h._expeditionMaxLevel > 0) continue;

        // Skip linked heroes (client: !linkFrom)
        if (h._linkFrom) continue;

        // Check quality (client: heroQuality >= required)
        // heroQuality comes from hero.json config (STATIC), not evolveLevel
        var hBaseQuality = getHeroBaseQuality(h._heroDisplayId);
        var hQualityNum = QUALITY_INDEX[hBaseQuality] || 1;
        if (hQualityNum < requiredQuality) continue;

        // Check level (client: heroBaseAttr.level >= requiredLevel)
        var hLevel = (h._heroBaseAttr && h._heroBaseAttr._level) || 0;
        if (hLevel < requiredLevel) continue;

        // Check star (client: heroStar >= requiredStar)
        var hStar = h._heroStar || 0;
        if (hStar < requiredStar) continue;

        count++;
        // Early exit if we have enough (client: r >= n)
        // Not needed here since we need the total for logging, but could optimize
    }

    return count;
}


// =============================================
// SECTION 13: ACTION — resolve (decompose hero)
// =============================================

/**
 * ACTION 4: resolve — Decompose heroes into soul coins.
 *
 * CLIENT REQUEST (line 106155):
 *   { type:"hero", action:"resolve", userId, heros:[heroId,...], version:"1.0" }
 *
 * CLIENT CALLBACK (line 106155-106170):
 *   - t.removeHero(e, n) — removes heroes from UI
 *   - n._linkHeroes → HerosManager.setDecomposeHeroLink(n._linkHeroes)
 *     Updates linked heroes if decomposed hero was connected
 *
 * Also used for auto-decompose from summon (line 172307):
 *   - SummonSingleton sends resolve for alreadyHasHeros
 *   - Response: SummonSingleton.playDisappearEffect
 *
 * RESOLVE REWARDS (heroResolve.json):
 *   Quality → { resolveTo: 111 (soul coin), num: X }
 *   white=1, green=2, blue=5, purple=25, orange=250,
 *   flickerOrange=1000, superOrange=5000
 *
 * The resolve also needs to handle linked heroes:
 *   When a hero with links is resolved, the linked heroes' data must be returned
 *   so the client can update their attributes.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionResolve(parsed, callback) {
    var userId = parsed.userId;
    var heroIds = parsed.heros;

    logger.info('HERO', 'resolve userId=' + userId + ' heroes=' + JSON.stringify(heroIds));

    if (!heroIds || !Array.isArray(heroIds) || heroIds.length === 0) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heros'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var changes = [];
        var linkHeroes = {};
        var resolvedCount = 0;

        for (var i = 0; i < heroIds.length; i++) {
            var hid = String(heroIds[i]);
            var heroData = getHero(gameData, hid);
            if (!heroData) {
                logger.warn('HERO', 'resolve heroId=' + hid + ' not found, skipping');
                continue;
            }

            // [BUG 1 FIX] Use BASE quality from hero.json config, NOT evolveLevel-based quality.
            // Client: heroQuality = HeroCommon.colorToHeroColor(heroInfo.quality)
            // heroResolve.json is keyed by base quality: "1"=white, "2"=green, etc.
            // Using evolveLevel-based quality would give wrong reward (e.g. evolved green→purple gives 25x instead of 2x).
            var quality = getHeroBaseQuality(heroData._heroDisplayId);

            // Build linked heroes response BEFORE removing
            var heroLinks = buildLinkHeroesResponse(gameData, hid, heroData);
            if (heroLinks) {
                for (var lk in heroLinks) {
                    linkHeroes[lk] = heroLinks[lk];
                }
            }

            // Get resolve reward from heroResolve.json
            var resolveConfig = getResolveConfig(quality);
            if (resolveConfig && resolveConfig.num > 0 && resolveConfig.resolveTo) {
                changes.push(addItem(gameData, resolveConfig.resolveTo, resolveConfig.num));
                logger.info('HERO', 'resolve heroId=' + hid + ' quality=' + quality
                    + ' reward: ' + resolveConfig.num + 'x item ' + resolveConfig.resolveTo);
            }

            // [BUG 2 FIX] Remove hero from all teams BEFORE deleting from roster.
            // Client calls removeHeroFromList which removes from HerosManager.
            // Server must also clean arenaTeam, topBattleTeam, expeditionTeam, guildBossTeam, towerTeam.
            removeHeroFromAllTeams(gameData, hid);

            // Remove the hero from roster
            removeHero(gameData, hid);
            resolvedCount++;
        }

        var response = {
            _changeInfo: buildChangeInfo(changes)
        };

        // Add linked heroes if any
        if (Object.keys(linkHeroes).length > 0) {
            response._linkHeroes = linkHeroes;
        } else {
            response._linkHeroes = null;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'resolve userId=' + userId + ' resolved ' + resolvedCount + '/' + heroIds.length + ' heroes');
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'resolve save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Resolve failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'resolve error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Resolve failed'));
    });
}

// =============================================
// SECTION 14: ACTION — reborn (rebirth)
// =============================================

/**
 * ACTION 5: reborn — Rebirth hero and reclaim resources.
 *
 * CLIENT REQUEST (line 106277):
 *   {
 *     type:"hero", action:"reborn",
 *     userId, heros:[heroId,...],
 *     keepStar: boolean,    // true = keep star level, false = reset to 0
 *     version:"1.0"
 *   }
 *
 * CLIENT CALLBACK (line 106277-106295):
 *   - t.removeHero(e, n) — removes heroes from UI
 *   - n._linkHeroes → HerosManager.setDecomposeHeroLink
 *   - n._addHeroes → add new heroes (if keepStar, hero is recreated)
 *
 * REBIRTH SYSTEM:
 *   When keepStar = true:
 *     - Hero is removed then recreated at 1-star with same displayId
 *     - Returns the hero in _addHeroes so client can re-add it
 *     - Some resources are NOT refunded (evolve costs kept)
 *   When keepStar = false:
 *     - Hero is completely removed
 *     - All invested resources are partially refunded via heroRebirth.json
 *
 * REBIRTH REFUNDS (heroRebirth.json):
 *   Quality → { rebirthNeeded: 101 (diamond), num: X }
 *   white/green/blue = 0 diamonds, purple = 5, orange = 20,
 *   flickerOrange = 50, superOrange = 100
 *
 * IMPORTANT: The reborn system also has a totalCost refund.
 * When keepStar=true, the hero's totalCost investments are partially refunded.
 * When keepStar=false, hero is just deleted.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionReborn(parsed, callback) {
    var userId = parsed.userId;
    var heroIds = parsed.heros;
    var keepStar = !!parsed.keepStar; // Default false; true = preserve star, no wakeup refund

    logger.info('HERO', 'reborn userId=' + userId + ' heroes=' + JSON.stringify(heroIds)
        + ' keepStar=' + keepStar);

    if (!heroIds || !Array.isArray(heroIds) || heroIds.length === 0) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heros'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var changes = [];
        var addHeroes = [];
        var linkHeroes = {};
        var totalDiamondCost = 0;
        var heroesToProcess = []; // Pre-validate and collect info

        // =============================================
        // PHASE 1: Validate all heroes, calculate diamond cost
        // Client reference: getHeroRebirthPrice (line 52095-52098)
        //   heroRebirth[qualityIndex].num = diamond cost per hero
        //   Quality index: White=0, Green=1, Blue=2, Purple=3, Orange=4,
        //                 SilverOrange=5, SuperOrange=6
        // =============================================
        for (var i = 0; i < heroIds.length; i++) {
            var hid = String(heroIds[i]);
            var heroData = getHero(gameData, hid);
            if (!heroData) {
                logger.warn('HERO', 'reborn heroId=' + hid + ' not found, skipping');
                continue;
            }

            // [BUG 1 FIX] Use BASE quality from hero.json config, NOT evolveLevel-based.
            // Client (line 85398-85400): o.heroQuality = colorToHeroColor(heroInfo.quality)
            // heroInfo.quality is STATIC per hero template — always the same regardless of evolve.
            // getHeroQuality() uses evolveLevel → WRONG for diamond cost lookup.
            var baseQuality = getHeroBaseQuality(heroData._heroDisplayId);

            // Calculate diamond cost from heroRebirth config
            // Client (line 52095-52098): return t[n].num where t = heroRebirth, n = quality index
            // Server: getRebirthConfig maps quality name → config[String(qualityIndex)]
            var rebirthConfig = getRebirthConfig(baseQuality);
            var heroDiamondCost = (rebirthConfig && rebirthConfig.num > 0) ? rebirthConfig.num : 0;
            totalDiamondCost += heroDiamondCost;

            // Initialize totalCost if missing (for older heroes that might not have it)
            initTotalCost(heroData);

            // Client eligibility check (line 107373):
            //   expeditionMaxLevel > 0 || (level > 1 || star >= 1)
            var currentLevel = heroData._heroBaseAttr ? (heroData._heroBaseAttr._level || 1) : 1;
            var currentStar = heroData._heroStar || 0;
            var expeditionMax = heroData._expeditionMaxLevel || 0;
            if (expeditionMax <= 0 && currentLevel <= 1 && currentStar <= 0) {
                logger.warn('HERO', 'reborn heroId=' + hid + ' not eligible (level='
                    + currentLevel + ' star=' + currentStar + '), skipping');
                continue;
            }

            heroesToProcess.push({
                hid: hid,
                heroData: heroData,
                displayId: heroData._heroDisplayId,
                currentStar: currentStar,
                diamondCost: heroDiamondCost
            });
        }

        if (heroesToProcess.length === 0) {
            callback(RH.error(RH.ErrorCode.LACK_PARAM, 'No eligible heroes to reborn'));
            return;
        }

        // =============================================
        // [BUG 2 FIX] Check and consume diamonds BEFORE processing
        // Client (line 106033): i += ToolCommon.getHeroRebirthPrice(l.heroQuality)
        // Client checks isDiamondEnough before allowing reborn.
        // Server must verify and deduct total diamond cost.
        // =============================================
        if (totalDiamondCost > 0) {
            if (!hasItem(gameData, ITEM.DIAMOND, totalDiamondCost)) {
                callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Not enough diamonds. Need: '
                    + totalDiamondCost));
                return;
            }
            changes.push(addItem(gameData, ITEM.DIAMOND, -totalDiamondCost));
            logger.info('HERO', 'reborn total diamond cost=' + totalDiamondCost + ' for '
                + heroesToProcess.length + ' heroes');
        }

        // =============================================
        // PHASE 2: Process each hero — refund, remove, recreate
        // =============================================
        for (var j = 0; j < heroesToProcess.length; j++) {
            var info = heroesToProcess[j];
            var heroData = info.heroData;
            var totalCost = heroData._totalCost;

            // [BUG 5 FIX] Remove hero from all teams before deletion.
            // Same pattern as resolve bug fix. Without this, hero remains in
            // arenaTeam, topBattleTeam, expeditionTeam, guildBossTeam, towerTeam
            // causing ghost references.
            removeHeroFromAllTeams(gameData, info.hid);

            // =============================================
            // [BUG 3 FIX] Refund ALL totalCost materials.
            // Client gainItemList (line 106052-106079) builds reward preview from:
            //   totalCost.levelUp  — ALWAYS refunded
            //   totalCost.evolve   — ALWAYS refunded
            //   totalCost.qigong   — ALWAYS refunded (EnergyStone at 80%)
            //   totalCost.heroBreak — ALWAYS refunded
            //   totalCost.wakeUp   — ONLY if keepStar=false (BUG 4 interaction)
            // Server _totalCost format: { _levelUp:[], _evolve:[], _qigong:[],
            //                             _heroBreak:[], _wakeUp:[] }
            // Each entry: { _id: itemId, _num: amount }
            // =============================================

            // --- Level-up materials: 100% refund ---
            if (totalCost._levelUp && Array.isArray(totalCost._levelUp)) {
                for (var lu = 0; lu < totalCost._levelUp.length; lu++) {
                    var luEntry = totalCost._levelUp[lu];
                    if (luEntry._num > 0) {
                        changes.push(addItem(gameData, String(luEntry._id), luEntry._num));
                    }
                }
            }

            // --- Evolve materials: 100% refund ---
            if (totalCost._evolve && Array.isArray(totalCost._evolve)) {
                for (var ev = 0; ev < totalCost._evolve.length; ev++) {
                    var evEntry = totalCost._evolve[ev];
                    if (evEntry._num > 0) {
                        changes.push(addItem(gameData, String(evEntry._id), evEntry._num));
                    }
                }
            }

            // --- Qigong materials: 100% refund, EnergyStone (136) at 80% ---
            // Client (line 106074):
            //   a.qigong[s].id == EnergyStone && (l = Math.floor(.8 * a.qigong[s].num))
            // EnergyStone = 136 (client line 78651, matches ITEM.ENERGY_STONE)
            if (totalCost._qigong && Array.isArray(totalCost._qigong)) {
                for (var qg = 0; qg < totalCost._qigong.length; qg++) {
                    var qgEntry = totalCost._qigong[qg];
                    if (qgEntry._num > 0) {
                        var qgRefund = qgEntry._num;
                        // [BUG 8 FIX] Apply 80% reduction for EnergyStone
                        if (String(qgEntry._id) === String(ITEM.ENERGY_STONE)) {
                            qgRefund = Math.floor(qgEntry._num * 0.8);
                        }
                        if (qgRefund > 0) {
                            changes.push(addItem(gameData, String(qgEntry._id), qgRefund));
                        }
                    }
                }
            }

            // --- Hero break materials: 100% refund ---
            if (totalCost._heroBreak && Array.isArray(totalCost._heroBreak)) {
                for (var hb = 0; hb < totalCost._heroBreak.length; hb++) {
                    var hbEntry = totalCost._heroBreak[hb];
                    if (hbEntry._num > 0) {
                        changes.push(addItem(gameData, String(hbEntry._id), hbEntry._num));
                    }
                }
            }

            // --- Wakeup materials: ONLY if keepStar=false ---
            // Client (line 106062-106065):
            //   0 == n.heroRetainStar → refund wakeUp, hero fragment at star=0
            //   1 == n.heroRetainStar → NO wakeUp refund, hero fragment at current star
            // [BUG 4 FIX] Was missing entirely. Now correctly conditional.
            if (!keepStar && totalCost._wakeUp && Array.isArray(totalCost._wakeUp)) {
                for (var wu = 0; wu < totalCost._wakeUp.length; wu++) {
                    var wuEntry = totalCost._wakeUp[wu];
                    if (wuEntry._num > 0) {
                        changes.push(addItem(gameData, String(wuEntry._id), wuEntry._num));
                    }
                }
            }

            // Build linked heroes response BEFORE removing the hero.
            // After removal, link references are cleaned up by removeHero().
            // Client (line 106287): setDecomposeHeroLink(n._linkHeroes)
            var heroLinks = buildLinkHeroesResponse(gameData, info.hid, heroData);
            if (heroLinks) {
                for (var lk in heroLinks) {
                    linkHeroes[lk] = heroLinks[lk];
                }
            }

            // Remove old hero from roster
            removeHero(gameData, info.hid);

            // =============================================
            // [BUG 4 & 5 FIX] Always recreate the hero.
            // Client (line 106196-106210): _addHeroes ALWAYS contains the reborn hero.
            // Old code only created hero when keepStar=true && star>0 — hero was LOST otherwise!
            //
            // keepStar=false → star=0, wakeup materials refunded (above)
            // keepStar=true  → star=preserved, NO wakeup refund (above)
            // =============================================
            var newHeroId = getNextHeroId(gameData);
            var newHero = addHero(gameData, newHeroId, info.displayId, 1);

            // [BUG 4 FIX] Set star based on keepStar flag
            newHero._heroStar = keepStar ? info.currentStar : 0;

            // [BUG 7 FIX] getMaxLevel now takes heroData object, not (evolveLevel, star).
            // The addHero() already calls getMaxLevel internally with evolveLevel=0,
            // but we need to recalculate with the correct star level.
            newHero._heroBaseAttr.maxlevel = getMaxLevel(newHero);

            // Reset evolveLevel and level (addHero already sets these, but be explicit)
            newHero._heroBaseAttr._evolveLevel = 0;
            newHero._heroBaseAttr._level = 1;

            // addHero() already initializes _totalCost as empty — this is correct
            // because all costs were refunded above.

            addHeroes.push(newHero);

            logger.info('HERO', 'reborn heroId=' + info.hid + ' → new heroId=' + newHeroId
                + ' star=' + newHero._heroStar + ' keepStar=' + keepStar
                + ' diamondCost=' + info.diamondCost
                + ' refunded=' + (totalCost._levelUp.length + totalCost._evolve.length
                    + totalCost._qigong.length + totalCost._heroBreak.length
                    + (keepStar ? 0 : totalCost._wakeUp.length)) + ' cost entries');
        }

        // =============================================
        // Build response
        // Client removeHero callback (line 106166-106224) expects:
        //   _changeInfo._items — material refunds
        //   _addHeroes — array of reborn hero data
        //   _linkHeroes — linked heroes data (or null)
        // =============================================
        var response = {
            _changeInfo: buildChangeInfo(changes),
            _addHeroes: addHeroes
        };

        if (Object.keys(linkHeroes).length > 0) {
            response._linkHeroes = linkHeroes;
        } else {
            response._linkHeroes = null;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'reborn userId=' + userId + ' reborned '
                + heroesToProcess.length + ' heroes, totalDiamondCost=' + totalDiamondCost);
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'reborn save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Reborn failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'reborn error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Reborn failed'));
    });
}

// =============================================
// SECTION 15: ACTION — splitHero
// =============================================

/**
 * ACTION 6: splitHero — Split a hero into fragments/pieces.
 *
 * CLIENT REQUEST (line 123181):
 *   { type:"hero", action:"splitHero", userId, heros:[heroId], version:"1.0" }
 *
 * CLIENT CALLBACK (line 123181-123210):
 *   - HeroCommon.removeHeroBackWithServerData() — removes hero from UI
 *   - HerosManager.setDecomposeHeroLink(n._linkHeroes) — updates linked heroes
 *   - Navigates to ExpeditionMachineMain or HeroList on success
 *
 * Also used from HeroWakeUpChose (line 124699):
 *   - HerosManager.removeHeroFromList() — removes from list
 *   - HeroCommon.removeHeroBackWithServerData()
 *   - Refreshes wake-up choose UI
 *
 * SPLIT LOGIC:
 *   When a hero is split, it's destroyed and the player receives:
 *   - A portion of the merge cost as fragments back
 *   - From heroPiece.json: mergeNum = pieces needed to create the hero
 *   - Refund amount is typically mergeNum (or a portion of it)
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionSplitHero(parsed, callback) {
    var userId = parsed.userId;
    var heroIds = parsed.heros;

    logger.info('HERO', 'splitHero userId=' + userId + ' heroes=' + JSON.stringify(heroIds));

    if (!heroIds || !Array.isArray(heroIds) || heroIds.length === 0) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heros'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var changes = [];
        var linkHeroes = {};

        for (var i = 0; i < heroIds.length; i++) {
            var hid = String(heroIds[i]);
            var heroData = getHero(gameData, hid);
            if (!heroData) {
                logger.warn('HERO', 'splitHero heroId=' + hid + ' not found, skipping');
                continue;
            }

            var displayId = heroData._heroDisplayId;
            var quality = getHeroBaseQuality(heroData._heroDisplayId);

            // Build linked heroes response BEFORE removing
            var heroLinks = buildLinkHeroesResponse(gameData, hid, heroData);
            if (heroLinks) {
                for (var lk in heroLinks) {
                    linkHeroes[lk] = heroLinks[lk];
                }
            }

            // Get piece config for this hero
            var pieceConfig = getHeroPiece(displayId);
            if (pieceConfig && pieceConfig.id) {
                // Refund the merge number of pieces
                var refundNum = pieceConfig.mergeNum || 10;
                changes.push(addItem(gameData, pieceConfig.id, refundNum));
                logger.info('HERO', 'splitHero heroId=' + hid + ' refund: '
                    + refundNum + 'x piece ' + pieceConfig.id);
            } else {
                // No piece config — check resolve as fallback
                var resolveConfig = getResolveConfig(quality);
                if (resolveConfig && resolveConfig.num > 0 && resolveConfig.resolveTo) {
                    changes.push(addItem(gameData, resolveConfig.resolveTo, resolveConfig.num));
                }
            }

            // Remove the hero
            removeHero(gameData, hid);
        }

        var response = {
            _changeInfo: buildChangeInfo(changes),
            _addHeroes: []
        };

        if (Object.keys(linkHeroes).length > 0) {
            response._linkHeroes = linkHeroes;
        } else {
            response._linkHeroes = null;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'splitHero userId=' + userId + ' split ' + heroIds.length + ' heroes');
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'splitHero save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Split failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'splitHero error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Split failed'));
    });
}

// =============================================
// SECTION 16: ACTION — inherit
// =============================================

/**
 * ACTION 7: inherit — Transfer stats from one hero to another.
 *
 * CLIENT REQUEST (line 106793):
 *   {
 *     type:"hero", action:"inherit",
 *     userId,
 *     fromHeroId: e.choseCostHeroId,    // Source hero (consumed/sacrificed)
 *     toHeroId: e.animHeroId,            // Target hero (receives stats)
 *     version:"1.0"
 *   }
 *
 * CLIENT CALLBACK — HerosManager.InheritCallBack (line 85265):
 *   - n.SetHeroDataToModel(e._toHero) — rebuilds target hero model from server data
 *   - n.setTotalAttrs(e, n) — recalculates total attributes
 *   - n.herosInfo[n.heroId] = n — stores updated hero
 *   - e._inheritFromLinkHeroes → setDecomposeHeroLink — handles link heroes from source
 *
 * CLIENT PRECONDITIONS:
 *   - fromHeroId must be >= flickerOrange quality AND >= inheritStarNeeded stars (typically 3)
 *   - toHeroId must be 1-star level 0 hero with same displayId as fromHeroId
 *   - Diamond cost = inherit.json[quality][star].diamond
 *   - Free inherit possible via activity system (freeInheritHeroes, inheritDiscount)
 *
 * INHERIT LOGIC:
 *   1. Validate source hero quality >= flickerOrange and star >= 3
 *   2. Validate target hero has same displayId as source
 *   3. Consume diamond cost
 *   4. Copy level, evolveLevel, star from source to target
 *   5. Remove source hero
 *   6. Return updated target hero data
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionInherit(parsed, callback) {
    var userId = parsed.userId;
    var fromHeroId = parsed.fromHeroId;
    var toHeroId = parsed.toHeroId;

    logger.info('HERO', 'inherit userId=' + userId + ' from=' + fromHeroId + ' to=' + toHeroId);

    if (!fromHeroId || !toHeroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing fromHeroId or toHeroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var fromHero = getHero(gameData, fromHeroId);
        var toHero = getHero(gameData, toHeroId);

        if (!fromHero) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Source hero not found'));
            return;
        }
        if (!toHero) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Target hero not found'));
            return;
        }

        // === VALIDATION ===

        // Both heroes must have the same displayId
        if (String(fromHero._heroDisplayId) !== String(toHero._heroDisplayId)) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Heroes must have same displayId'));
            return;
        }

        // Source hero quality check (must be >= flickerOrange)
        var fromQuality = getHeroBaseQuality(fromHero._heroDisplayId);
        var fromQIdx = getQualityIndex(fromQuality);
        var flickerIdx = QUALITY_INDEX['flickerOrange'] || 6;
        if (fromQIdx < flickerIdx) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Source hero quality too low for inherit'));
            return;
        }

        // Source star check (must be >= 3 typically)
        var fromStar = fromHero._heroStar || 0;
        var inheritStarNeeded = 3; // Minimum star for inherit
        if (fromStar < inheritStarNeeded) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Source hero star too low (need ' + inheritStarNeeded + ')'));
            return;
        }

        // === DIAMOND COST ===
        var changes = [];
        var inheritCost = getInheritConfig(fromQuality, fromStar);
        if (inheritCost && inheritCost.diamond && inheritCost.diamond > 0) {
            if (!hasItem(gameData, ITEM.DIAMOND, inheritCost.diamond)) {
                callback(RH.success({
                    fromHeroId: fromHeroId,
                    _toHero: toHero,
                    _changeInfo: buildChangeInfo([]),
                    _addHeroes: [],
                    _baseAttr: { _items: [] },
                    _totalAttr: { _items: [] },
                    _openType: OPEN_TYPE.TIPS
                }));
                return;
            }
            changes.push(addItem(gameData, ITEM.DIAMOND, -inheritCost.diamond));
        }

        // Build linked heroes from source BEFORE removing
        var inheritLinkHeroes = buildLinkHeroesResponse(gameData, fromHeroId, fromHero);

        // === EXECUTE INHERIT ===

        // Copy stats from source to target
        toHero._heroBaseAttr._level = fromHero._heroBaseAttr._level;
        toHero._heroBaseAttr._evolveLevel = fromHero._heroBaseAttr._evolveLevel;
        toHero._heroStar = fromHero._heroStar;
        toHero._heroBaseAttr.maxlevel = getMaxLevel(toHero);

        // Remove source hero
        removeHero(gameData, fromHeroId);

        // Recalculate target attributes
        var toHeroAttrs = calculateHeroAttrs(toHero, gameData);
        var targetLinkHeroes = buildLinkHeroesResponse(gameData, toHeroId, toHero);

        var response = {
            fromHeroId: fromHeroId,
            _toHero: toHero,
            _changeInfo: buildChangeInfo(changes),
            _addHeroes: [],
            _baseAttr: toHeroAttrs._baseAttr,
            _totalAttr: toHeroAttrs._totalAttr,
            _totalCost: buildTotalCostResponse(toHero)
        };

        // Merge link heroes from both source and target
        var allLinkHeroes = {};
        if (inheritLinkHeroes) {
            for (var lk in inheritLinkHeroes) {
                allLinkHeroes[lk] = inheritLinkHeroes[lk];
            }
        }
        if (targetLinkHeroes) {
            for (var tlk in targetLinkHeroes) {
                allLinkHeroes[tlk] = targetLinkHeroes[tlk];
            }
        }
        if (Object.keys(allLinkHeroes).length > 0) {
            response._inheritFromLinkHeroes = allLinkHeroes;
        } else {
            response._inheritFromLinkHeroes = null;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'inherit userId=' + userId + ' from=' + fromHeroId
                + ' to=' + toHeroId + ' OK (diamond cost: '
                + (inheritCost ? inheritCost.diamond : 0) + ')');
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'inherit save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Inherit failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'inherit error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Inherit failed'));
    });
}


// =============================================
// SECTION 17: ACTIONS — qigong / saveQigong / cancelQigong
// =============================================

/**
 * ACTION 8: qigong — Start qigong (meditation) training.
 *
 * CLIENT REQUEST (line 52882):
 *   {
 *     type:"hero", action:"qigong",
 *     userId, heroId, times: N,    // 1 or 10
 *     version:"1.0"
 *   }
 *
 * CLIENT CALLBACK (line 85441 — HerosManager.qigongTrainCallBack):
 *   - n.qigongTmp = t.setAttrItems(e._qigongTmp) — sets temporary qigong attrs
 *   - n.offPower = e._offPower — sets power offset
 *   - t.setTotalAttrs(e, n) — recalculates total attrs
 *   - ItemsCommonSingleton.resetTtemsCallBack(e) — updates item counts
 *
 * QIGONG SYSTEM:
 *   Training costs energy stones (136) and gold (102).
 *   Each training session generates random attribute bonuses within max ranges.
 *   The qigong config has 4 hero type groups (body, dodge, block, armor)
 *   with 31 stages each (levelPara 1-31).
 *
 *   Stage progression: qigongStage matches qigong config levelPara.
 *   The stage is based on the hero's evolveLevel.
 *   After saving, qigongStage advances to the next level.
 *
 *   Config entry (qigong.json):
 *     { heroType, levelPara, evolveLevel,
 *       hpMax, attackMax, armorMax,       // max random values
 *       hpIncrement, attackIncrement, armorIncrement,
 *       qigongCostID1: 136, num1,         // energy stone cost
 *       qigongCostID2: 102, num2 }        // gold cost
 *
 * TEMPORARY ATTRIBUTES:
 *   Results go into heroData._qigongTmp (NOT saved permanently).
 *   Player must call saveQigong to commit, or cancelQigong to discard.
 *   _qigongTmp format: { _items: [{ _id: 'hp', _num: X }, ...] }
 *
 * POWER OFFSET:
 *   _offPower = current power - previous power (before qigong)
 *   Shows the power change in the UI.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionQigong(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;
    var times = parseInt(parsed.times) || 1;

    logger.info('HERO', 'qigong userId=' + userId + ' heroId=' + heroId + ' times=' + times);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        var displayId = heroData._heroDisplayId;
        var heroInfo = getHeroInfo(displayId);
        var heroType = heroInfo ? (heroInfo.heroType || heroInfo.type || 'body') : 'body';
        var qigongStage = heroData._qigongStage || 1;

        // Ensure totalCost structure exists
        initTotalCost(heroData);

        // Find qigong config for this hero type and stage
        var qigongEntry = getQigongConfig(heroType, qigongStage);
        if (!qigongEntry) {
            // Try fallback to stage 1
            qigongEntry = getQigongConfig(heroType, 1);
            if (!qigongEntry) {
                callback(RH.error(RH.ErrorCode.DATA_ERROR, 'No qigong config for type=' + heroType));
                return;
            }
        }

        // === CHECK COSTS ===
        var changes = [];
        var totalCost1 = (qigongEntry.num1 || 0) * times;
        var totalCost2 = (qigongEntry.num2 || 0) * times;

        if (totalCost1 > 0 && qigongEntry.qigongCostID1) {
            if (!hasItem(gameData, qigongEntry.qigongCostID1, totalCost1)) {
                callback(RH.success({
                    heroId: heroId,
                    _qigongTmp: heroData._qigongTmp || { _items: [] },
                    _offPower: 0,
                    _changeInfo: buildChangeInfo([]),
                    _openType: hasItem(gameData, qigongEntry.qigongCostID1, 1)
                        ? OPEN_TYPE.TIME_BONUS : OPEN_TYPE.TIPS
                }));
                return;
            }
            changes.push(addItem(gameData, qigongEntry.qigongCostID1, -totalCost1));
            addTotalCostEntry(heroData, 'qigong', qigongEntry.qigongCostID1, totalCost1);
        }

        if (totalCost2 > 0 && qigongEntry.qigongCostID2) {
            if (!hasItem(gameData, qigongEntry.qigongCostID2, totalCost2)) {
                // Refund cost1 if already consumed
                if (totalCost1 > 0 && qigongEntry.qigongCostID1) {
                    addItem(gameData, qigongEntry.qigongCostID1, totalCost1);
                }
                callback(RH.success({
                    heroId: heroId,
                    _qigongTmp: heroData._qigongTmp || { _items: [] },
                    _offPower: 0,
                    _changeInfo: buildChangeInfo([]),
                    _openType: hasItem(gameData, qigongEntry.qigongCostID2, 1)
                        ? OPEN_TYPE.TIME_BONUS : OPEN_TYPE.TIPS
                }));
                return;
            }
            changes.push(addItem(gameData, qigongEntry.qigongCostID2, -totalCost2));
            addTotalCostEntry(heroData, 'qigong', qigongEntry.qigongCostID2, totalCost2);
        }

        // === GENERATE QIGONG RESULTS ===
        // Random values within max ranges, multiplied by times
        var hpMax = qigongEntry.hpMax || 0;
        var attackMax = qigongEntry.attackMax || 0;
        var armorMax = qigongEntry.armorMax || 0;

        var hpResult = 0, attackResult = 0, armorResult = 0;

        // If hero already has qigongTmp, add to existing values
        var existingTmp = { hp: 0, attack: 0, armor: 0 };
        if (heroData._qigongTmp && heroData._qigongTmp._items) {
            var tmpItems = heroData._qigongTmp._items;
            if (Array.isArray(tmpItems)) {
                for (var ti = 0; ti < tmpItems.length; ti++) {
                    if (tmpItems[ti]._id === 0 || tmpItems[ti]._id === 'hp') existingTmp.hp = tmpItems[ti]._num || 0;
                    else if (tmpItems[ti]._id === 1 || tmpItems[ti]._id === 'attack') existingTmp.attack = tmpItems[ti]._num || 0;
                    else if (tmpItems[ti]._id === 2 || tmpItems[ti]._id === 'armor') existingTmp.armor = tmpItems[ti]._num || 0;
                }
            }
        }

        for (var t = 0; t < times; t++) {
            hpResult += Math.floor(Math.random() * (hpMax + 1));
            attackResult += Math.floor(Math.random() * (attackMax + 1));
            armorResult += Math.floor(Math.random() * (armorMax + 1));
        }

        hpResult += existingTmp.hp;
        attackResult += existingTmp.attack;
        armorResult += existingTmp.armor;

        // Calculate power offset
        var powerBefore = calculateHeroPower(heroData);

        // Set qigongTmp (temporary, not saved until saveQigong)
        heroData._qigongTmp = {
            _items: [
                { _id: 'hp', _num: hpResult },
                { _id: 'attack', _num: attackResult },
                { _id: 'armor', _num: armorResult }
            ]
        };

        var powerAfter = calculateHeroPower(heroData);
        var offPower = powerAfter - powerBefore;

        // Recalculate attrs with temporary qigong
        var attrs = calculateHeroAttrs(heroData, gameData);
        var linkHeroes = buildLinkHeroesResponse(gameData, heroId, heroData);

        var response = {
            heroId: heroId,
            _qigongTmp: heroData._qigongTmp,
            _offPower: offPower,
            _changeInfo: buildChangeInfo(changes),
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr,
            _totalCost: buildTotalCostResponse(heroData)
        };

        if (linkHeroes) {
            response._linkHeroes = linkHeroes;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'qigong userId=' + userId + ' heroId=' + heroId
                + ' hp+' + hpResult + ' atk+' + attackResult + ' arm+' + armorResult
                + ' powerDelta=' + offPower);
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'qigong save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Qigong failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'qigong error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Qigong failed'));
    });
}

/**
 * ACTION 9: saveQigong — Save qigong training results permanently.
 *
 * CLIENT REQUEST (line 52894):
 *   { type:"hero", action:"saveQigong", userId, heroId, version:"1.0" }
 *
 * CLIENT CALLBACK (line 85445 — HerosManager.saveQigongCallBack):
 *   - n.qigongTmp = t.setAttrItems(e._qigongTmp) — update temp attrs
 *   - n.qigong = t.setAttrItems(e._qigong) — update saved attrs (committed)
 *   - t.setTotalAttrs(e, n) — recalculate totals
 *   - n.qigongStage = e._qigongStage — advance to next stage
 *   - If e._linkHeroes → update linked heroes' qigong and attrs
 *
 * SAVE LOGIC:
 *   1. Merge _qigongTmp values into _qigong (permanent storage)
 *   2. Clear _qigongTmp (training complete)
 *   3. Advance _qigongStage to next level
 *   4. Calculate new stage based on evolveLevel
 *   5. Return updated qigong data and attrs
 *   6. Handle linked heroes if applicable
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionSaveQigong(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;

    logger.info('HERO', 'saveQigong userId=' + userId + ' heroId=' + heroId);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        // Check if there's temporary qigong data to save
        if (!heroData._qigongTmp || !heroData._qigongTmp._items) {
            // Nothing to save — return current state
            var noChangeAttrs = calculateHeroAttrs(heroData, gameData);
            callback(RH.success({
                heroId: heroId,
                _qigongTmp: heroData._qigongTmp,
                _qigong: heroData._qigong,
                _qigongStage: heroData._qigongStage || 1,
                _changeInfo: buildChangeInfo([]),
                _baseAttr: noChangeAttrs._baseAttr,
                _totalAttr: noChangeAttrs._totalAttr,
                _totalCost: buildTotalCostResponse(heroData)
            }));
            return;
        }

        // === MERGE qigongTmp INTO qigong (permanent) ===
        if (!heroData._qigong || !heroData._qigong._items) {
            heroData._qigong = { _items: [] };
        }

        var qigongItems = heroData._qigong._items;
        var tmpItems = heroData._qigongTmp._items;

        // Merge: add tmp values to existing saved values
        if (Array.isArray(qigongItems) && Array.isArray(tmpItems)) {
            for (var i = 0; i < tmpItems.length; i++) {
                var tmpId = tmpItems[i]._id;
                var tmpNum = tmpItems[i]._num || 0;
                var found = false;

                for (var j = 0; j < qigongItems.length; j++) {
                    if (qigongItems[j]._id === tmpId) {
                        qigongItems[j]._num = (qigongItems[j]._num || 0) + tmpNum;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    qigongItems.push({ _id: tmpId, _num: tmpNum });
                }
            }
        }

        // === ADVANCE QIGONG STAGE ===
        var oldStage = heroData._qigongStage || 1;
        var newStage = oldStage + 1;

        // Cap stage at max based on evolveLevel
        var maxStage = 31; // Maximum qigong stage
        if (newStage > maxStage) newStage = maxStage;

        heroData._qigongStage = newStage;

        // === CLEAR TEMP DATA ===
        heroData._qigongTmp = null;
        heroData._qigongTmpPower = 0;

        // === RECALCULATE ===
        var attrs = calculateHeroAttrs(heroData, gameData);
        var linkHeroes = buildLinkHeroesResponse(gameData, heroId, heroData);

        var response = {
            heroId: heroId,
            _qigongTmp: heroData._qigongTmp,
            _qigong: heroData._qigong,
            _qigongStage: heroData._qigongStage,
            _changeInfo: buildChangeInfo([]),
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr,
            _totalCost: buildTotalCostResponse(heroData)
        };

        if (linkHeroes) {
            response._linkHeroes = linkHeroes;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'saveQigong userId=' + userId + ' heroId=' + heroId
                + ' stage ' + oldStage + '→' + newStage);
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'saveQigong save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Save qigong failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'saveQigong error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Save qigong failed'));
    });
}

/**
 * ACTION 10: cancelQigong — Cancel qigong training (discard temp results).
 *
 * CLIENT REQUEST (line 52905):
 *   { type:"hero", action:"cancelQigong", userId, heroId, version:"1.0" }
 *
 * CLIENT CALLBACK (line 85493 — HerosManager.clearQigongTmp):
 *   - n.qigongTmp = {} — reset temporary attrs
 *   - n.offPower = 0 — reset power offset
 *
 * CANCEL LOGIC:
 *   1. Clear heroData._qigongTmp (discard unsaved training)
 *   2. Reset _qigongTmpPower to 0
 *   3. Return heroId for client to identify the hero
 *   4. Note: Costs are NOT refunded (already consumed when qigong was initiated)
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionCancelQigong(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;

    logger.info('HERO', 'cancelQigong userId=' + userId + ' heroId=' + heroId);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        // Clear temporary qigong data
        heroData._qigongTmp = null;
        heroData._qigongTmpPower = 0;

        // Recalculate attributes without qigong tmp
        var attrs = calculateHeroAttrs(heroData, gameData);

        var response = {
            heroId: heroId,
            _qigongTmp: heroData._qigongTmp,
            _qigong: heroData._qigong,
            _changeInfo: buildChangeInfo([]),
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr,
            _totalCost: buildTotalCostResponse(heroData)
        };

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'cancelQigong userId=' + userId + ' heroId=' + heroId + ' OK');
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'cancelQigong save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Cancel qigong failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'cancelQigong error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Cancel qigong failed'));
    });
}


// =============================================
// SECTION 18: ACTIONS — heroBreak / activeHeroBreak / autoHeroBreak / rebornSelfBreak
// =============================================

/**
 * ACTION 11: heroBreak — Perform a single breakthrough training step.
 *
 * CLIENT REQUEST (line 123683-123693):
 *   {
 *     type:"hero", action:"heroBreak",
 *     dragonPieceNum: N,    // dragon soul pieces used as substitute
 *     selfPieceNum: N,      // self hero pieces used
 *     userId, heroId, version:"1.0"
 *   }
 *
 * CLIENT CALLBACK — HerosManager.heroBreakCallBack (line 85162):
 *   - n.breakInfo.deserialize(e._breakInfo) — update break info
 *   - t.setTotalAttrs(e, n) — recalculate total attrs
 *   - If e._linkHeroes → update linked heroes' breakInfo and attrs
 *   - ItemsCommonSingleton.resetTtemsCallBack(e) — update item counts
 *
 * SELF-BREAK SYSTEM:
 *   Purple+ quality heroes can undergo breakthrough training.
 *   Requirements from constant.json:
 *     selfBreakStarNeeded: 3 (minimum star rating)
 *     selfBreakLevelNeeded: 150 (minimum hero level)
 *     selfBreakPlayerLevel: 200 (minimum player level)
 *
 *   Break has two components:
 *   1. UNLOCK break level (from selfBreakCost.json):
 *      - Cost per quality and break level
 *      - Requires selfPieceNeeded or selfTheRedDevils
 *      - dragonPieceNum/selfPieceNum from client to substitute missing pieces
 *   2. TRAIN within break level (from selfBreak.json):
 *      - Each level has 21 training nodes
 *      - Cost: energy stones per node
 *      - Reward: stat bonus per node (hp or attack typically)
 *      - Level 21 = milestone node (3% damageUp)
 *
 *   Break types (from selfBreakDefault.json):
 *     break_damageUp, break_damageDown, break_healerPlus, break_shielderPlus
 *
 *   Break data on hero: _breakInfo = { _level, _attrs: [{ _ability, _abilityID, _value, _abilityAffected }] }
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionHeroBreak(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;
    var dragonPieceNum = parseInt(parsed.dragonPieceNum) || 0;
    var selfPieceNum = parseInt(parsed.selfPieceNum) || 0;

    logger.info('HERO', 'heroBreak userId=' + userId + ' heroId=' + heroId
        + ' dragon=' + dragonPieceNum + ' self=' + selfPieceNum);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        // === VALIDATION ===

        // [BUG 1 FIX] Use BASE quality from hero.json config, NOT evolveLevel-based.
        // Client (line 85835): o[r].quality == n.heroLocalAttt.quality
        // heroLocalAttt.quality is STATIC from hero.json config (line 85402).
        // getHeroQuality() uses evolveLevel → WRONG for break cost lookup.
        var quality = getHeroBaseQuality(heroData._heroDisplayId);
        var qIdx = getQualityIndex(quality);
        var minBreakQIdx = QUALITY_INDEX['purple'] || 4;
        if (qIdx < minBreakQIdx) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Hero quality too low for breakthrough'));
            return;
        }

        // Check star requirement
        var starNeeded = getConstant('selfBreakStarNeeded') || 3;
        var currentStar = heroData._heroStar || 0;
        if (currentStar < starNeeded) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Hero star too low for breakthrough (need ' + starNeeded + ')'));
            return;
        }

        // Check level requirement
        var levelNeeded = getConstant('selfBreakLevelNeeded') || 150;
        var currentLevel = heroData._heroBaseAttr._level || 1;
        if (currentLevel < levelNeeded) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Hero level too low for breakthrough (need ' + levelNeeded + ')'));
            return;
        }

        // === GET BREAK INFO ===
        var displayId = heroData._heroDisplayId;
        var heroInfo = getHeroInfo(displayId);
        var breakType = heroInfo ? (heroInfo.breakType || 'break_damageUp') : 'break_damageUp';

        // Current break state
        var currentBreakLevel = 0;
        var currentTrainLevel = 0;
        if (heroData._breakInfo) {
            currentBreakLevel = heroData._breakInfo._level || 0;
            currentTrainLevel = (heroData._breakInfo._attrs || []).length;
        }

        // Determine if this is an UNLOCK action (moving to next break tier)
        // or a TRAIN action (advancing within current tier)
        var selfBreakPointLevel = getConstant('selfBreakPointLevel') || 21;

        // Check if training within current level is complete
        var isTrainComplete = currentTrainLevel >= selfBreakPointLevel;

        var changes = [];
        initTotalCost(heroData);

        if (isTrainComplete) {
            // === UNLOCK NEXT BREAK LEVEL ===
            // [BUG 4 FIX] Use currentBreakLevel for cost lookup, NOT currentBreakLevel+1.
            // Client getHeroLimitCurrentLastCostJson (line 85835): breakLevel == n.breakInfo.breakLevel
            // selfBreakCost entry with breakLevel = X = cost to unlock tier X+1 when at tier X.
            var breakCost = getSelfBreakCost(quality, currentBreakLevel);

            if (!breakCost) {
                // Already at max break level
                var maxBreakAttrs = calculateHeroAttrs(heroData, gameData);
                callback(RH.success({
                    heroId: heroId,
                    _breakInfo: heroData._breakInfo,
                    _baseAttr: maxBreakAttrs._baseAttr,
                    _totalAttr: maxBreakAttrs._totalAttr,
                    _changeInfo: buildChangeInfo([]),
                    _totalCost: buildTotalCostResponse(heroData),
                    _openType: OPEN_TYPE.TIPS
                }));
                return;
            }

            // Check cost 1 (evolve capsule)
            if (breakCost.costNum1 > 0 && breakCost.costID1) {
                if (!hasItem(gameData, breakCost.costID1, breakCost.costNum1)) {
                    var failAttrs = calculateHeroAttrs(heroData, gameData);
                    callback(RH.success({
                        heroId: heroId,
                        _breakInfo: heroData._breakInfo,
                        _baseAttr: failAttrs._baseAttr,
                        _totalAttr: failAttrs._totalAttr,
                        _changeInfo: buildChangeInfo([]),
                        _totalCost: buildTotalCostResponse(heroData),
                        _openType: hasItem(gameData, breakCost.costID1, 1)
                            ? OPEN_TYPE.TIME_BONUS : OPEN_TYPE.TIPS
                    }));
                    return;
                }
                changes.push(addItem(gameData, breakCost.costID1, -breakCost.costNum1));
                addTotalCostEntry(heroData, 'heroBreak', breakCost.costID1, breakCost.costNum1);
            }

            // Check cost 2 (break material)
            if (breakCost.costNum2 > 0 && breakCost.costID2) {
                if (!hasItem(gameData, breakCost.costID2, breakCost.costNum2)) {
                    // Refund cost1
                    if (breakCost.costNum1 > 0 && breakCost.costID1) {
                        addItem(gameData, breakCost.costID1, breakCost.costNum1);
                    }
                    var failAttrs2 = calculateHeroAttrs(heroData, gameData);
                    callback(RH.success({
                        heroId: heroId,
                        _breakInfo: heroData._breakInfo,
                        _baseAttr: failAttrs2._baseAttr,
                        _totalAttr: failAttrs2._totalAttr,
                        _changeInfo: buildChangeInfo([]),
                        _totalCost: buildTotalCostResponse(heroData),
                        _openType: hasItem(gameData, breakCost.costID2, 1)
                            ? OPEN_TYPE.TIME_BONUS : OPEN_TYPE.TIPS
                    }));
                    return;
                }
                changes.push(addItem(gameData, breakCost.costID2, -breakCost.costNum2));
                addTotalCostEntry(heroData, 'heroBreak', breakCost.costID2, breakCost.costNum2);
            }

            // Check self piece requirement
            var selfPieceNeeded = breakCost.selfPieceNeeded || 0;
            if (selfPieceNeeded > 0) {
                var pieceConfig = getHeroPiece(displayId);
                if (pieceConfig) {
                    var hasPieces = getItemCount(gameData, pieceConfig.id);
                    var totalPieces = hasPieces + selfPieceNum + dragonPieceNum;

                    if (totalPieces < selfPieceNeeded) {
                        // Refund costs
                        for (var ci = 1; ci <= 5; ci++) {
                            var refundCostID = breakCost['costID' + ci];
                            var refundCostNum = breakCost['costNum' + ci];
                            if (refundCostID && refundCostNum > 0) {
                                addItem(gameData, refundCostID, refundCostNum);
                            }
                        }
                        var failAttrs3 = calculateHeroAttrs(heroData, gameData);
                        callback(RH.success({
                            heroId: heroId,
                            _breakInfo: heroData._breakInfo,
                            _baseAttr: failAttrs3._baseAttr,
                            _totalAttr: failAttrs3._totalAttr,
                            _changeInfo: buildChangeInfo([]),
                            _totalCost: buildTotalCostResponse(heroData),
                            _openType: OPEN_TYPE.TIPS
                        }));
                        return;
                    }

                    // Consume self pieces first, then dragon pieces
                    // [BUG 5 FIX] Dragon pieces are consumed from dragonSoulPieceID constant.
                    // Client (line 123660): l = s.dragonSoulPieceID
                    // Client (line 123686): dragonPieceNum: u = selfPieceNeeded - c
                    var selfToUse = Math.min(hasPieces, selfPieceNeeded);
                    var remaining = selfPieceNeeded - selfToUse;
                    var dragonToUse = Math.min(selfPieceNum, remaining);

                    if (selfToUse > 0) {
                        changes.push(addItem(gameData, pieceConfig.id, -selfToUse));
                        addTotalCostEntry(heroData, 'heroBreak', pieceConfig.id, selfToUse);
                    }
                    if (dragonToUse > 0) {
                        var dragonSoulPieceID = getConstant('dragonSoulPieceID');
                        if (dragonSoulPieceID) {
                            changes.push(addItem(gameData, dragonSoulPieceID, -dragonToUse));
                            addTotalCostEntry(heroData, 'heroBreak', dragonSoulPieceID, dragonToUse);
                        }
                    }
                }
            }

            // [BUG 6 FIX] Check and consume selfTheRedDevils (red soul item).
            // Client (line 123675-123681):
            //   m = HeroCommon.getLocalJsonHero(o.heroDisplayId)
            //   h = m.redSoulId
            //   p.selfTheRedDevils > getItemNum(h) → not enough
            if (breakCost.selfTheRedDevils && breakCost.selfTheRedDevils > 0) {
                var heroInfoLocal = getHeroInfo(displayId);
                if (heroInfoLocal && heroInfoLocal.redSoulId) {
                    if (!hasItem(gameData, heroInfoLocal.redSoulId, breakCost.selfTheRedDevils)) {
                        // Refund all previously consumed items
                        for (var ri = 1; ri <= 5; ri++) {
                            var rCostID = breakCost['costID' + ri];
                            var rCostNum = breakCost['costNum' + ri];
                            if (rCostID && rCostNum > 0) {
                                addItem(gameData, rCostID, rCostNum);
                            }
                        }
                        var pieceConfigR = getHeroPiece(displayId);
                        if (pieceConfigR) {
                            var selfToUseR = Math.min(getItemCount(gameData, pieceConfigR.id), selfPieceNeeded);
                            if (selfToUseR > 0) addItem(gameData, pieceConfigR.id, selfToUseR);
                            var remainR = selfPieceNeeded - selfToUseR;
                            var dragonToUseR = Math.min(selfPieceNum, remainR);
                            if (dragonToUseR > 0) {
                                var dragonID = getConstant('dragonSoulPieceID');
                                if (dragonID) addItem(gameData, dragonID, dragonToUseR);
                            }
                        }
                        var failAttrs6 = calculateHeroAttrs(heroData, gameData);
                        callback(RH.success({
                            heroId: heroId,
                            _breakInfo: heroData._breakInfo,
                            _baseAttr: failAttrs6._baseAttr,
                            _totalAttr: failAttrs6._totalAttr,
                            _changeInfo: buildChangeInfo([]),
                            _totalCost: buildTotalCostResponse(heroData),
                            _openType: OPEN_TYPE.TIPS
                        }));
                        return;
                    }
                    changes.push(addItem(gameData, heroInfoLocal.redSoulId, -breakCost.selfTheRedDevils));
                }
            }

            // Initialize break info if needed
            if (!heroData._breakInfo) {
                heroData._breakInfo = { _level: 0, _attrs: [] };
            }

            // Advance break level
            heroData._breakInfo._level = currentBreakLevel + 1;

            logger.info('HERO', 'heroBreak UNLOCK userId=' + userId + ' heroId=' + heroId
                + ' breakLevel=' + currentBreakLevel + '→' + (currentBreakLevel + 1));

        } else {
            // === TRAIN WITHIN CURRENT BREAK LEVEL ===
            var nextTrainLevel = currentTrainLevel + 1;
            var effectiveBreakLevel = Math.max(currentBreakLevel, 1);

            // [BUG 3 FIX] Pass breakType2 for heroes with secondary break type.
            // Client (line 85569): also checks breakType2 from heroLocalAttt config.
            var breakType2 = heroInfo ? (heroInfo.breakType2 || null) : null;
            var trainEntry = getSelfBreakEntry(breakType, effectiveBreakLevel, nextTrainLevel, breakType2);

            if (!trainEntry) {
                // No more training nodes
                var noTrainAttrs = calculateHeroAttrs(heroData, gameData);
                callback(RH.success({
                    heroId: heroId,
                    _breakInfo: heroData._breakInfo,
                    _baseAttr: noTrainAttrs._baseAttr,
                    _totalAttr: noTrainAttrs._totalAttr,
                    _changeInfo: buildChangeInfo([]),
                    _totalCost: buildTotalCostResponse(heroData),
                    _openType: OPEN_TYPE.TIPS
                }));
                return;
            }

            // Check training cost (energy stones)
            if (trainEntry.costNum1 > 0 && trainEntry.costID1) {
                var qualMul = getSelfBreakQualityMul(quality);
                // [BUG 2 FIX] Use abilityPara for training cost, NOT costPara.
                // Client getHeroLimitBreakQualityParm (line 85819-85828) returns abilityPara.
                // Client setTrainCost (line 126362): costNum1 * breakQualityParm (abilityPara).
                // Client checkHeroBreakLimitRedPoint (line 85851): costNum1 * abilityPara.
                var adjustedCost = Math.floor((trainEntry.costNum1 || 0) * (qualMul.abilityPara || 1));

                if (!hasItem(gameData, trainEntry.costID1, adjustedCost)) {
                    var failAttrs4 = calculateHeroAttrs(heroData, gameData);
                    callback(RH.success({
                        heroId: heroId,
                        _breakInfo: heroData._breakInfo,
                        _baseAttr: failAttrs4._baseAttr,
                        _totalAttr: failAttrs4._totalAttr,
                        _changeInfo: buildChangeInfo([]),
                        _totalCost: buildTotalCostResponse(heroData),
                        _openType: hasItem(gameData, trainEntry.costID1, 1)
                            ? OPEN_TYPE.TIME_BONUS : OPEN_TYPE.TIPS
                    }));
                    return;
                }
                changes.push(addItem(gameData, trainEntry.costID1, -adjustedCost));
                addTotalCostEntry(heroData, 'heroBreak', trainEntry.costID1, adjustedCost);
            }

            // Apply quality multiplier to attribute values
            var qualMul2 = getSelfBreakQualityMul(quality);
            var adjustedValue = (trainEntry.value1 || 0) * (qualMul2.abilityPara || 1);

            // Initialize break info if needed
            if (!heroData._breakInfo) {
                heroData._breakInfo = { _level: 0, _attrs: [] };
            }

            // Add attribute bonus from training
            heroData._breakInfo._attrs.push({
                _ability: trainEntry.ability1 || 'attack',
                _abilityID: trainEntry.abilityID1 || 1,
                _value: adjustedValue,
                _abilityAffected: trainEntry.abilityAffected1 || 0
            });

            logger.info('HERO', 'heroBreak TRAIN userId=' + userId + ' heroId=' + heroId
                + ' breakLevel=' + (currentBreakLevel || 1) + ' trainLevel=' + nextTrainLevel
                + ' ability=' + (trainEntry.ability1 || 'attack') + ' value=' + adjustedValue);
        }

        // === BUILD RESPONSE ===
        var attrs = calculateHeroAttrs(heroData, gameData);
        var linkHeroes = buildLinkHeroesResponse(gameData, heroId, heroData);

        var response = {
            heroId: heroId,
            _breakInfo: heroData._breakInfo,
            _changeInfo: buildChangeInfo(changes),
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr,
            _totalCost: buildTotalCostResponse(heroData)
        };

        if (linkHeroes) {
            response._linkHeroes = linkHeroes;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'heroBreak save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Break failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'heroBreak error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Break failed'));
    });
}

/**
 * ACTION 12: activeHeroBreak — Activate a specific breakthrough level.
 *
 * CLIENT REQUEST (line 123626-123634):
 *   {
 *     type:"hero", action:"activeHeroBreak",
 *     userId, heroId, version:"1.0"
 *   }
 *
 * CLIENT CALLBACK (line 123626):
 *   - HerosManager.heroBreakCallBack(t) — same as heroBreak
 *   - ItemsCommonSingleton.resetTtemsCallBack(t) — update items
 *   - UIWindowManager.openHeroAttrChange() — show attr change popup
 *
 * DIFFERENCE FROM heroBreak:
 *   activeHeroBreak doesn't send dragonPieceNum/selfPieceNum.
 *   It's used for activation/leveling within an already-unlocked break tier.
 *   Delegates to the same core logic but is a separate action for client routing.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionActiveHeroBreak(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;

    logger.info('HERO', 'activeHeroBreak userId=' + userId + ' heroId=' + heroId);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    // Delegate to heroBreak with default piece counts
    parsed.dragonPieceNum = 0;
    parsed.selfPieceNum = 0;
    actionHeroBreak(parsed, callback);
}

/**
 * ACTION 13: autoHeroBreak — One-key auto breakthrough.
 *
 * CLIENT REQUEST (line 123612-123622):
 *   {
 *     type:"hero", action:"autoHeroBreak",
 *     userId, heroId
 *     // NOTE: no dragonPieceNum/selfPieceNum, no version
 *   }
 *
 * CLIENT CALLBACK (line 123612):
 *   - Same as heroBreak but checks _openType differently:
 *     TIME_BONUS → show time-limited gift pack
 *     TIPS → show "not enough" dialog
 *   - If t._changeInfo exists, proceeds with updates
 *
 * DIFFERENCE FROM heroBreak:
 *   autoHeroBreak attempts to do as many breakthroughs as possible in one click.
 *   It loops until resources are exhausted or max is reached.
 *   Returns _openType.TIME_BONUS on insufficient resources (vs TIPS for manual).
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionAutoHeroBreak(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;

    logger.info('HERO', 'autoHeroBreak userId=' + userId + ' heroId=' + heroId);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        // Validation — [BUG 1 FIX] use BASE quality, same as heroBreak
        var quality = getHeroBaseQuality(heroData._heroDisplayId);
        var qIdx = getQualityIndex(quality);
        if (qIdx < (QUALITY_INDEX['purple'] || 4)) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Quality too low'));
            return;
        }

        var starNeeded = getConstant('selfBreakStarNeeded') || 3;
        if ((heroData._heroStar || 0) < starNeeded) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Star too low'));
            return;
        }

        var levelNeeded = getConstant('selfBreakLevelNeeded') || 150;
        if ((heroData._heroBaseAttr._level || 1) < levelNeeded) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Level too low'));
            return;
        }

        // === AUTO LOOP ===
        var displayId = heroData._heroDisplayId;
        var heroInfo = getHeroInfo(displayId);
        var breakType = heroInfo ? (heroInfo.breakType || 'break_damageUp') : 'break_damageUp';
        var breakType2 = heroInfo ? (heroInfo.breakType2 || null) : null;
        var selfBreakPointLevel = getConstant('selfBreakPointLevel') || 21;

        var changes = [];
        initTotalCost(heroData);
        var totalBreaks = 0;
        var stoppedReason = null;
        var MAX_AUTO_ITERATIONS = 500; // Safety limit

        for (var iter = 0; iter < MAX_AUTO_ITERATIONS; iter++) {
            var currentBreakLevel = heroData._breakInfo ? (heroData._breakInfo._level || 0) : 0;
            var currentTrainLevel = (heroData._breakInfo && heroData._breakInfo._attrs)
                ? heroData._breakInfo._attrs.length : 0;
            var isTrainComplete = currentTrainLevel >= selfBreakPointLevel;

            if (isTrainComplete) {
                // Try to unlock next break level
                var nextBreakLevel = currentBreakLevel + 1;
                // [BUG 4 FIX] Use currentBreakLevel for cost lookup (matching client).
                var breakCost = getSelfBreakCost(quality, currentBreakLevel);

                if (!breakCost) {
                    stoppedReason = 'max';
                    break;
                }

                // Check costs
                var canAfford = true;
                if (breakCost.costNum1 > 0 && breakCost.costID1) {
                    if (!hasItem(gameData, breakCost.costID1, breakCost.costNum1)) {
                        canAfford = false;
                        stoppedReason = hasItem(gameData, breakCost.costID1, 1) ? 'time_bonus' : 'tips';
                    }
                }
                if (canAfford && breakCost.costNum2 > 0 && breakCost.costID2) {
                    if (!hasItem(gameData, breakCost.costID2, breakCost.costNum2)) {
                        canAfford = false;
                        stoppedReason = hasItem(gameData, breakCost.costID2, 1) ? 'time_bonus' : 'tips';
                    }
                }

                if (!canAfford) break;

                // Check self piece requirement
                if (canAfford && breakCost.selfPieceNeeded > 0) {
                    var pieceConfig = getHeroPiece(displayId);
                    if (pieceConfig && getItemCount(gameData, pieceConfig.id) < breakCost.selfPieceNeeded) {
                        canAfford = false;
                        stoppedReason = 'tips';
                    }
                }

                if (!canAfford) break;

                // Consume unlock costs
                if (breakCost.costNum1 > 0 && breakCost.costID1) {
                    changes.push(addItem(gameData, breakCost.costID1, -breakCost.costNum1));
                    addTotalCostEntry(heroData, 'heroBreak', breakCost.costID1, breakCost.costNum1);
                }
                if (breakCost.costNum2 > 0 && breakCost.costID2) {
                    changes.push(addItem(gameData, breakCost.costID2, -breakCost.costNum2));
                    addTotalCostEntry(heroData, 'heroBreak', breakCost.costID2, breakCost.costNum2);
                }
                if (breakCost.selfPieceNeeded > 0) {
                    var piece = getHeroPiece(displayId);
                    if (piece) {
                        changes.push(addItem(gameData, piece.id, -breakCost.selfPieceNeeded));
                    }
                }

                if (!heroData._breakInfo) {
                    heroData._breakInfo = { _level: 0, _attrs: [] };
                }
                heroData._breakInfo._level = nextBreakLevel;
                totalBreaks++;

            } else {
                // Train within current level
                var nextTrainLevel = currentTrainLevel + 1;
                var effectiveBreakLevel = Math.max(currentBreakLevel, 1);
                // [BUG 3 FIX] Pass breakType2 for secondary break type heroes.
                var trainEntry = getSelfBreakEntry(breakType, effectiveBreakLevel, nextTrainLevel, breakType2);

                if (!trainEntry) {
                    stoppedReason = 'max';
                    break;
                }

                var qualMul = getSelfBreakQualityMul(quality);
                // [BUG 2 FIX] Use abilityPara for training cost, NOT costPara.
                var adjustedCost = Math.floor((trainEntry.costNum1 || 0) * (qualMul.abilityPara || 1));

                if (!hasItem(gameData, trainEntry.costID1, adjustedCost)) {
                    stoppedReason = hasItem(gameData, trainEntry.costID1, 1) ? 'time_bonus' : 'tips';
                    break;
                }

                // Consume training cost
                changes.push(addItem(gameData, trainEntry.costID1, -adjustedCost));
                addTotalCostEntry(heroData, 'heroBreak', trainEntry.costID1, adjustedCost);

                // Apply attribute bonus
                var adjustedValue = (trainEntry.value1 || 0) * (qualMul.abilityPara || 1);

                if (!heroData._breakInfo) {
                    heroData._breakInfo = { _level: 0, _attrs: [] };
                }
                heroData._breakInfo._attrs.push({
                    _ability: trainEntry.ability1 || 'attack',
                    _abilityID: trainEntry.abilityID1 || 1,
                    _value: adjustedValue,
                    _abilityAffected: trainEntry.abilityAffected1 || 0
                });

                totalBreaks++;

                // [BUG 4 FIX] Also advance break level after training completion
                var nextBreakLvl = heroData._breakInfo._level + 1;
                var nextCheck = getSelfBreakEntry(breakType, nextBreakLvl, 1, breakType2);
                if (nextCheck && currentTrainLevel + 1 >= selfBreakPointLevel) {
                    heroData._breakInfo._level = nextBreakLvl;
                }
            }
        }

        // Build response
        var attrs = calculateHeroAttrs(heroData, gameData);
        var linkHeroes = buildLinkHeroesResponse(gameData, heroId, heroData);

        var response = {
            heroId: heroId,
            _breakInfo: heroData._breakInfo,
            _changeInfo: buildChangeInfo(changes),
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr,
            _totalCost: buildTotalCostResponse(heroData)
        };

        if (linkHeroes) response._linkHeroes = linkHeroes;

        // Add openType for auto mode
        if (stoppedReason === 'time_bonus') {
            response._openType = OPEN_TYPE.TIME_BONUS;
        } else if (stoppedReason === 'tips') {
            response._openType = OPEN_TYPE.TIPS;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'autoHeroBreak userId=' + userId + ' heroId=' + heroId
                + ' totalBreaks=' + totalBreaks + ' reason=' + stoppedReason);
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'autoHeroBreak save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Auto break failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'autoHeroBreak error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Auto break failed'));
    });
}

/**
 * ACTION 14: rebornSelfBreak — Reset breakthrough and reclaim materials.
 *
 * CLIENT REQUEST (line 123744-123762):
 *   {
 *     type:"hero", action:"rebornSelfBreak",
 *     heroId, userId, version:"1.0"
 *   }
 *
 * CLIENT PRE-CHECK:
 *   Reads constant[1].selfBreakBeRebornConsume (50 diamonds)
 *   Shows confirmation dialog with cost before sending request.
 *
 * CLIENT CALLBACK (line 123751):
 *   - HerosManager.heroBreakCallBack(t) — updates break info (now reset)
 *   - UIWindowManager.openCongratulationObtain(t, ...) — shows refund popup
 *
 * REBORN SELF-BREAK LOGIC:
 *   1. Consume diamond cost (selfBreakBeRebornConsume from constant.json)
 *   2. Refund a portion of ALL break costs:
 *      - Iterate through all selfBreakCost entries up to current break level
 *      - Refund 50% of evolve capsules (costID1)
 *      - Refund 50% of break materials (costID2)
 *   3. Reset _breakInfo to { _level: 0, _attrs: [] }
 *   4. Recalculate attributes
 *   5. Return updated data with refunded items in _changeInfo
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionRebornSelfBreak(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;

    logger.info('HERO', 'rebornSelfBreak userId=' + userId + ' heroId=' + heroId);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        var quality = getHeroBaseQuality(heroData._heroDisplayId);
        var changes = [];
        initTotalCost(heroData);

        // === CONSUME DIAMOND COST ===
        var rebornDiamondCost = getConstant('selfBreakBeRebornConsume') || 50;
        if (rebornDiamondCost > 0) {
            if (!hasItem(gameData, ITEM.DIAMOND, rebornDiamondCost)) {
                var failAttrs = calculateHeroAttrs(heroData, gameData);
                callback(RH.success({
                    heroId: heroId,
                    _breakInfo: heroData._breakInfo,
                    _baseAttr: failAttrs._baseAttr,
                    _totalAttr: failAttrs._totalAttr,
                    _changeInfo: buildChangeInfo([]),
                    _totalCost: buildTotalCostResponse(heroData),
                    _openType: OPEN_TYPE.TIPS
                }));
                return;
            }
            changes.push(addItem(gameData, ITEM.DIAMOND, -rebornDiamondCost));
        }

        // === REFUND BREAK MATERIALS ===
        var currentBreakLevel = heroData._breakInfo ? (heroData._breakInfo._level || 0) : 0;

        if (currentBreakLevel > 0) {
            // Refund unlock costs for each break level achieved
            for (var bl = 1; bl <= currentBreakLevel; bl++) {
                var breakCost = getSelfBreakCost(quality, bl);
                if (breakCost) {
                    // Refund 50% of cost1
                    var refund1 = Math.floor((breakCost.costNum1 || 0) / 2);
                    if (refund1 > 0 && breakCost.costID1) {
                        changes.push(addItem(gameData, breakCost.costID1, refund1));
                    }
                    // Refund 50% of cost2
                    var refund2 = Math.floor((breakCost.costNum2 || 0) / 2);
                    if (refund2 > 0 && breakCost.costID2) {
                        changes.push(addItem(gameData, breakCost.costID2, refund2));
                    }
                }
            }

            // Also refund training costs
            var displayId = heroData._heroDisplayId;
            var heroInfo = getHeroInfo(displayId);
            var breakType = heroInfo ? (heroInfo.breakType || 'break_damageUp') : 'break_damageUp';
            var selfBreakPointLevel = getConstant('selfBreakPointLevel') || 21;
            var qualMul = getSelfBreakQualityMul(quality);

            for (var bl2 = 1; bl2 <= currentBreakLevel; bl2++) {
                for (var tl = 1; tl <= selfBreakPointLevel; tl++) {
                    var breakType2 = heroInfo ? (heroInfo.breakType2 || '') : '';
                    var trainEntry = getSelfBreakEntry(breakType, bl2, tl, breakType2);
                    if (trainEntry && trainEntry.costNum1 > 0 && trainEntry.costID1) {
                        var trainRefund = Math.floor(
                            (trainEntry.costNum1 || 0) * (qualMul.abilityPara || 1) / 2
                        );
                        if (trainRefund > 0) {
                            changes.push(addItem(gameData, trainEntry.costID1, trainRefund));
                        }
                    }
                }
            }
        }

        // === RESET BREAK INFO ===
        heroData._breakInfo = { _level: 0, _attrs: [] };

        // === BUILD RESPONSE ===
        var attrs = calculateHeroAttrs(heroData, gameData);
        var linkHeroes = buildLinkHeroesResponse(gameData, heroId, heroData);

        var response = {
            heroId: heroId,
            _breakInfo: heroData._breakInfo,
            _changeInfo: buildChangeInfo(changes),
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr,
            _totalCost: buildTotalCostResponse(heroData)
        };

        if (linkHeroes) response._linkHeroes = linkHeroes;

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'rebornSelfBreak userId=' + userId + ' heroId=' + heroId
                + ' reset breakLevel=' + currentBreakLevel + '→0'
                + ' diamond cost=' + rebornDiamondCost
                + ' refundItems=' + changes.length);
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'rebornSelfBreak save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Reborn break failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'rebornSelfBreak error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Reborn break failed'));
    });
}


// =============================================
// SECTION 19: ACTION — wakeUp
// =============================================

/**
 * ACTION 15: wakeUp — Awaken hero (upgrade quality tier / star up via materials).
 *
 * CLIENT REQUEST (line 124446):
 *   {
 *     type:"hero", action:"wakeUp",
 *     userId, heroId,
 *     heros: [materialHeroId, ...],    // material heroes to sacrifice
 *     dragonPieceNum: N,               // dragon soul pieces
 *     selfPieceNum: N,                 // self hero pieces
 *     version:"1.0"
 *   }
 *
 * CLIENT CALLBACK — HeroMainWakeUp:
 *   - Returns: heroId, heros (consumed materials), _totalTalent, _hero (updated data),
 *     _changeInfo, _baseAttr, _totalAttr, _totalCost, _linkHeroes
 *   - Updates hero star, quality tier, passive/proactive skills
 *
 * WAKE UP SYSTEM:
 *   Heroes with wakeupMax > 0 can be awakened.
 *   Each star level has a wakeUp entry in heroWakeUp.json[heroDisplayId].
 *   Format: single object (1 star) or array of objects (1-3 stars).
 *
 *   Each wakeUp entry has:
 *     - star: target star level
 *     - material1/2/3: item IDs for material requirements
 *     - isPiece1/2/3: 1 = use piece, 0 = use item directly
 *     - isRandom1/2/3: 1 = random hero needed
 *     - star1/2/3: star level required on material heroes
 *     - num1/2/3: quantity needed
 *     - itemID, num4: additional cost item
 *     - redItemID, num5: red-tier additional cost
 *     - levelBound: new max level after wake up (120, 140, 160)
 *     - talent: talent coefficient bonus (0.06-0.11)
 *     - skillLevel: proactive skill level unlocked (2, 3, 4)
 *     - levelUp: skill IDs to level up (comma-separated)
 *
 * RED POINT CHECK (line 85781 — checkHeroWakeUpRedPoint):
 *   Checks if hero has enough materials and hero level to wake up.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionWakeUp(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;
    var materialHeroIds = parsed.heros;
    var dragonPieceNum = parseInt(parsed.dragonPieceNum) || 0;
    var selfPieceNum = parseInt(parsed.selfPieceNum) || 0;

    logger.info('HERO', 'wakeUp userId=' + userId + ' heroId=' + heroId
        + ' materials=' + JSON.stringify(materialHeroIds)
        + ' dragon=' + dragonPieceNum + ' self=' + selfPieceNum);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        var displayId = heroData._heroDisplayId;
        var currentStar = heroData._heroStar || 0;
        var level = heroData._heroBaseAttr._level || 1;
        var heroInfo = getHeroInfo(displayId);
        var wakeupMax = heroInfo ? (heroInfo.wakeupMax || 0) : 0;

        // Check if hero can be awakened
        if (wakeupMax <= 0) {
            callback(RH.error(RH.ErrorCode.INVALID, 'Hero cannot be awakened'));
            return;
        }

        // Find next wakeUp entry
        var wakeEntry = getWakeUpEntry(displayId, currentStar);
        if (!wakeEntry) {
            // Already at max wakeup
            var maxAttrs = calculateHeroAttrs(heroData, gameData);
            callback(RH.success({
                heroId: heroId,
                heros: [],
                _totalTalent: 0,
                _hero: heroData,
                _changeInfo: buildChangeInfo([]),
                _baseAttr: maxAttrs._baseAttr,
                _totalAttr: maxAttrs._totalAttr,
                _totalCost: buildTotalCostResponse(heroData),
                _linkHeroes: null
            }));
            return;
        }

        // === VALIDATE MATERIAL HEROES ===
        // Material slots: material1 (isPiece/isRandom), material2, material3
        var materialSlots = [
            { id: wakeEntry.material1, isPiece: wakeEntry.isPiece1, isRandom: wakeEntry.isRandom1,
              starReq: wakeEntry.star1, num: wakeEntry.num1 },
            { id: wakeEntry.material2, isPiece: wakeEntry.isPiece2, isRandom: wakeEntry.isRandom2,
              starReq: wakeEntry.star2, num: wakeEntry.num2 },
            { id: wakeEntry.material3, isPiece: wakeEntry.isPiece3, isRandom: wakeEntry.isRandom3,
              starReq: wakeEntry.star3, num: wakeEntry.num3 }
        ];

        var changes = [];
        initTotalCost(heroData);
        var heroesConsumed = 0;
        var matHeroIndex = 0;

        // Process each material slot
        for (var s = 0; s < materialSlots.length; s++) {
            var slot = materialSlots[s];

            // Skip empty slots
            if (!slot.id && slot.id !== 0) continue;
            if (slot.isPiece === '' || slot.isPiece === undefined) continue;

            var isPiece = parseInt(slot.isPiece) === 1;
            var isRandom = parseInt(slot.isRandom) === 1;
            var numNeeded = parseInt(slot.num) || 1;

            if (isPiece) {
                // Piece requirement: consume hero pieces (fragment items)
                // The piece item is from heroPiece.json for the material hero
                var pieceConfig = getHeroPiece(slot.id);
                if (pieceConfig) {
                    var hasPieces = getItemCount(gameData, pieceConfig.id);
                    if (hasPieces < numNeeded) {
                        // Not enough pieces
                        var failAttrs = calculateHeroAttrs(heroData, gameData);
                        callback(RH.success({
                            heroId: heroId,
                            heros: [],
                            _totalTalent: 0,
                            _hero: heroData,
                            _changeInfo: buildChangeInfo([]),
                            _baseAttr: failAttrs._baseAttr,
                            _totalAttr: failAttrs._totalAttr,
                            _totalCost: buildTotalCostResponse(heroData),
                            _openType: OPEN_TYPE.TIPS
                        }));
                        return;
                    }
                    changes.push(addItem(gameData, pieceConfig.id, -numNeeded));
                }
            } else if (isRandom) {
                // Random hero requirement: consume any hero from the provided list
                if (!materialHeroIds || matHeroIndex >= materialHeroIds.length) {
                    var failAttrs2 = calculateHeroAttrs(heroData, gameData);
                    callback(RH.success({
                        heroId: heroId,
                        heros: [],
                        _totalTalent: 0,
                        _hero: heroData,
                        _changeInfo: buildChangeInfo([]),
                        _baseAttr: failAttrs2._baseAttr,
                        _totalAttr: failAttrs2._totalAttr,
                        _totalCost: buildTotalCostResponse(heroData),
                        _openType: OPEN_TYPE.TIPS
                    }));
                    return;
                }

                for (var mi = 0; mi < numNeeded && matHeroIndex < materialHeroIds.length; mi++) {
                    var matHeroId = String(materialHeroIds[matHeroIndex]);
                    var matHero = getHero(gameData, matHeroId);
                    if (!matHero) {
                        var failAttrs3 = calculateHeroAttrs(heroData, gameData);
                        callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Material hero not found: ' + matHeroId));
                        return;
                    }

                    // Check star requirement on material hero
                    if (slot.starReq && (matHero._heroStar || 0) < slot.starReq) {
                        var failAttrs4 = calculateHeroAttrs(heroData, gameData);
                        callback(RH.success({
                            heroId: heroId,
                            heros: [],
                            _totalTalent: 0,
                            _hero: heroData,
                            _changeInfo: buildChangeInfo([]),
                            _baseAttr: failAttrs4._baseAttr,
                            _totalAttr: failAttrs4._totalAttr,
                            _totalCost: buildTotalCostResponse(heroData),
                            _openType: OPEN_TYPE.TIPS
                        }));
                        return;
                    }

                    removeHero(gameData, matHeroId);
                    heroesConsumed++;
                    matHeroIndex++;
                }
            } else {
                // Specific item requirement
                if (slot.id && numNeeded > 0) {
                    if (!hasItem(gameData, slot.id, numNeeded)) {
                        var failAttrs5 = calculateHeroAttrs(heroData, gameData);
                        callback(RH.success({
                            heroId: heroId,
                            heros: [],
                            _totalTalent: 0,
                            _hero: heroData,
                            _changeInfo: buildChangeInfo([]),
                            _baseAttr: failAttrs5._baseAttr,
                            _totalAttr: failAttrs5._totalAttr,
                            _totalCost: buildTotalCostResponse(heroData),
                            _openType: OPEN_TYPE.TIPS
                        }));
                        return;
                    }
                    changes.push(addItem(gameData, slot.id, -numNeeded));
                    addTotalCostEntry(heroData, 'wakeUp', slot.id, numNeeded);
                }
            }
        }

        // Additional item cost (itemID + num4)
        if (wakeEntry.itemID && wakeEntry.num4 && parseInt(wakeEntry.num4) > 0) {
            var addItemId = parseInt(wakeEntry.itemID);
            var addItemNum = parseInt(wakeEntry.num4);
            if (!hasItem(gameData, addItemId, addItemNum)) {
                var failAttrs6 = calculateHeroAttrs(heroData, gameData);
                callback(RH.success({
                    heroId: heroId,
                    heros: [],
                    _totalTalent: 0,
                    _hero: heroData,
                    _changeInfo: buildChangeInfo([]),
                    _baseAttr: failAttrs6._baseAttr,
                    _totalAttr: failAttrs6._totalAttr,
                    _totalCost: buildTotalCostResponse(heroData),
                    _openType: OPEN_TYPE.TIPS
                }));
                return;
            }
            changes.push(addItem(gameData, addItemId, -addItemNum));
            addTotalCostEntry(heroData, 'wakeUp', addItemId, addItemNum);
        }

        // Red item cost (redItemID + num5)
        if (wakeEntry.redItemID && wakeEntry.num5 && parseInt(wakeEntry.num5) > 0) {
            var redItemId = parseInt(wakeEntry.redItemID);
            var redItemNum = parseInt(wakeEntry.num5);
            if (!hasItem(gameData, redItemId, redItemNum)) {
                var failAttrs7 = calculateHeroAttrs(heroData, gameData);
                callback(RH.success({
                    heroId: heroId,
                    heros: [],
                    _totalTalent: 0,
                    _hero: heroData,
                    _changeInfo: buildChangeInfo([]),
                    _baseAttr: failAttrs7._baseAttr,
                    _totalAttr: failAttrs7._totalAttr,
                    _totalCost: buildTotalCostResponse(heroData),
                    _openType: OPEN_TYPE.TIPS
                }));
                return;
            }
            changes.push(addItem(gameData, redItemId, -redItemNum));
            addTotalCostEntry(heroData, 'wakeUp', redItemId, redItemNum);
        }

        // === EXECUTE WAKE UP ===
        var newStar = (wakeEntry.star || (currentStar + 1));
        heroData._heroStar = newStar;

        // Update level bound (new max level)
        if (wakeEntry.levelBound) {
            heroData._heroBaseAttr.maxlevel = wakeEntry.levelBound;
            // Cap current level if exceeds new max
            if (level > wakeEntry.levelBound) {
                heroData._heroBaseAttr._level = wakeEntry.levelBound;
            }
        }

        // Update proactive skill level if specified
        if (wakeEntry.skillLevel) {
            // Update hero's superSkillLevel or potentialLevel
            // The skill is determined by the hero's skill field from hero.json
            if (heroInfo && heroInfo.skill) {
                if (!heroData._superSkillLevel) heroData._superSkillLevel = {};
                heroData._superSkillLevel[heroInfo.skill] = wakeEntry.skillLevel;
            }
        }

        // Level up specified skills (comma-separated IDs)
        if (wakeEntry.levelUp) {
            var skillIds = String(wakeEntry.levelUp).split(',');
            for (var si = 0; si < skillIds.length; si++) {
                var skillId = skillIds[si].trim();
                if (skillId) {
                    if (!heroData._superSkillLevel) heroData._superSkillLevel = {};
                    heroData._superSkillLevel[skillId] = (heroData._superSkillLevel[skillId] || 0) + 1;
                }
            }
        }

        // Recalculate attributes
        var attrs = calculateHeroAttrs(heroData, gameData);
        var linkHeroes = buildLinkHeroesResponse(gameData, heroId, heroData);

        var response = {
            heroId: heroId,
            heros: materialHeroIds ? materialHeroIds.slice(0, heroesConsumed) : [],
            _totalTalent: wakeEntry.talent || 0,
            _hero: heroData,
            _changeInfo: buildChangeInfo(changes),
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr,
            _totalCost: buildTotalCostResponse(heroData)
        };

        if (linkHeroes) response._linkHeroes = linkHeroes;
        else response._linkHeroes = null;

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'wakeUp userId=' + userId + ' heroId=' + heroId
                + ' star=' + currentStar + '→' + newStar
                + ' talent=' + (wakeEntry.talent || 0)
                + ' levelBound=' + (wakeEntry.levelBound || 'none'));
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'wakeUp save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'WakeUp failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'wakeUp error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'WakeUp failed'));
    });
}

// =============================================
// SECTION 20: ACTION — activeSkill
// =============================================

/**
 * ACTION 16: activeSkill — Activate a potential skill for a hero.
 *
 * CLIENT REQUEST (line 120789-120807):
 *   {
 *     type:"hero", action:"activeSkill",
 *     userId, heroId,
 *     pos: N,                      // potential skill slot (1, 2, or 3)
 *     stype: SkillBasic.POTENTIAL, // skill type = 4
 *     version:"1.0"
 *   }
 *
 * CLIENT CALLBACK (line 120803-120807):
 *   - HerosManager.changeSkillCallBack(t) — line 85437-85440
 *     → setHeroPotentialSkillState(n, e._potentialLevel) — line 85504-85513
 *     → setTotalAttrs(e, n)
 *   - UIWindowManager.openHeroAttrChange()
 *
 * POTENTIAL SKILL SYSTEM:
 *   potentialLevel.json: keyed by potentialId (heroDisplayId + "41", "42", or "43")
 *   Each entry is an array of level objects:
 *     { level, expID: 133, expNum, goldID: 102, goldNum, heroLevel }
 *
 *   Level progression: 0→1→2→...→19 (20 levels max)
 *   Each level has:
 *     - expNum: potential experience needed (item 133)
 *     - goldNum: gold needed (item 102)
 *     - heroLevel: minimum hero level required
 *
 *   Key format: heroDisplayId + "41" (path 1), "42" (path 2), "43" (path 3)
 *   Example: "120141" = hero 1201, potential path 1
 *
 *   Potential data stored on hero: _potentialLevel = { "1": level, "2": level, "3": level }
 *
 *   hero.json config fields: potential1, potential2, potential3 (skill IDs)
 *   Client (line 85510-85512): reads r["potential" + i] for i=1..3
 *   Client (line 85512): addSkillDataToModel(e, s, t[i], SkillBasic.POTENTIAL)
 *     where t = _potentialLevel, t[i] = level for slot i
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionActiveSkill(parsed, callback) {
    var userId = parsed.userId;
    var heroId = parsed.heroId;
    var pos = parseInt(parsed.pos);
    var stype = parseInt(parsed.stype);

    logger.info('HERO', 'activeSkill userId=' + userId + ' heroId=' + heroId
        + ' pos=' + pos + ' stype=' + stype);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }

    // [BUG 2 FIX] pos range is 1-3, NOT 1-2.
    // Client (line 120794): a = n.skills.potentialSkill.indexOf(o) + 1
    // potentialSkill can have up to 3 entries (hero.json: potential1, potential2, potential3)
    // potentialLevel.json keys: displayId + "41", "42", "43"
    if (!pos || pos < 1 || pos > 3) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Invalid pos (must be 1, 2, or 3)'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        var heroData = getHero(gameData, heroId);
        if (!heroData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found'));
            return;
        }

        var displayId = heroData._heroDisplayId;
        var level = heroData._heroBaseAttr._level || 1;

        // [BUG 1 FIX] _potentialLevel format: { "1": level, "2": level, "3": level }
        // Client (line 85504-85513): setHeroPotentialSkillState accesses t[i] for i=1..3
        // Client (line 86691): BattleTeam accesses i[E] for E=1..3
        // Client (line 85417): SetHeroDataToModel passes _potentialLevel directly
        if (!heroData._potentialLevel) {
            heroData._potentialLevel = { "1": 0, "2": 0, "3": 0 };
        } else if (heroData._potentialLevel._items) {
            // MIGRATION: Convert old format if present
            var oldItems = heroData._potentialLevel._items;
            heroData._potentialLevel = { "1": 0, "2": 0, "3": 0 };
            if (Array.isArray(oldItems)) {
                for (var mi = 0; mi < oldItems.length; mi++) {
                    var posKey = String(oldItems[mi]._pos);
                    if (posKey === "1" || posKey === "2" || posKey === "3") {
                        heroData._potentialLevel[posKey] = oldItems[mi]._level || 0;
                    }
                }
            }
        }
        // Ensure all slots exist
        if (heroData._potentialLevel[String(pos)] == null) {
            heroData._potentialLevel[String(pos)] = 0;
        }

        // Get current level for this skill position
        var currentLevel = heroData._potentialLevel[String(pos)] || 0;
        var nextLevel = currentLevel + 1;

        // Get potential level config
        var levelEntries = getPotentialConfig(displayId, pos);
        if (!levelEntries) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR,
                'No potential config for hero ' + displayId + ' pos ' + pos));
            return;
        }

        // Find next level entry
        var nextEntry = null;
        for (var j = 0; j < levelEntries.length; j++) {
            if (levelEntries[j].level === nextLevel) {
                nextEntry = levelEntries[j];
                break;
            }
        }

        if (!nextEntry) {
            // Already at max potential level
            var maxPotAttrs = calculateHeroAttrs(heroData, gameData);
            callback(RH.success({
                heroId: heroId,
                _potentialLevel: heroData._potentialLevel,
                _changeInfo: buildChangeInfo([]),
                _baseAttr: maxPotAttrs._baseAttr,
                _totalAttr: maxPotAttrs._totalAttr,
                _openType: OPEN_TYPE.TIPS
            }));
            return;
        }

        // === VALIDATION ===

        // Check hero level requirement
        if (nextEntry.heroLevel && level < nextEntry.heroLevel) {
            var failAttrs = calculateHeroAttrs(heroData, gameData);
            callback(RH.success({
                heroId: heroId,
                _potentialLevel: heroData._potentialLevel,
                _changeInfo: buildChangeInfo([]),
                _baseAttr: failAttrs._baseAttr,
                _totalAttr: failAttrs._totalAttr,
                _openType: OPEN_TYPE.TIPS
            }));
            return;
        }

        // === CHECK AND CONSUME COSTS ===
        var changes = [];

        // Cost 1: potential experience (expID: 133 = ITEM.POTENTIAL_EXP)
        if (nextEntry.expID && nextEntry.expNum && nextEntry.expNum > 0) {
            if (!hasItem(gameData, nextEntry.expID, nextEntry.expNum)) {
                var failAttrs2 = calculateHeroAttrs(heroData, gameData);
                callback(RH.success({
                    heroId: heroId,
                    _potentialLevel: heroData._potentialLevel,
                    _changeInfo: buildChangeInfo([]),
                    _baseAttr: failAttrs2._baseAttr,
                    _totalAttr: failAttrs2._totalAttr,
                    _openType: hasItem(gameData, nextEntry.expID, 1)
                        ? OPEN_TYPE.TIME_BONUS : OPEN_TYPE.TIPS
                }));
                return;
            }
            changes.push(addItem(gameData, nextEntry.expID, -nextEntry.expNum));
        }

        // Cost 2: gold (goldID: 102 = ITEM.GOLD)
        if (nextEntry.goldID && nextEntry.goldNum && nextEntry.goldNum > 0) {
            if (!hasItem(gameData, nextEntry.goldID, nextEntry.goldNum)) {
                // Refund exp if already consumed
                if (nextEntry.expID && nextEntry.expNum) {
                    addItem(gameData, nextEntry.expID, nextEntry.expNum);
                }
                var failAttrs3 = calculateHeroAttrs(heroData, gameData);
                callback(RH.success({
                    heroId: heroId,
                    _potentialLevel: heroData._potentialLevel,
                    _changeInfo: buildChangeInfo([]),
                    _baseAttr: failAttrs3._baseAttr,
                    _totalAttr: failAttrs3._totalAttr,
                    _openType: hasItem(gameData, nextEntry.goldID, 1)
                        ? OPEN_TYPE.TIME_BONUS : OPEN_TYPE.TIPS
                }));
                return;
            }
            changes.push(addItem(gameData, nextEntry.goldID, -nextEntry.goldNum));
        }

        // === UPDATE POTENTIAL LEVEL ===
        // [BUG 1 FIX] Set level directly on _potentialLevel[pos], NOT via _items array.
        heroData._potentialLevel[String(pos)] = nextLevel;

        // === BUILD RESPONSE ===
        var attrs = calculateHeroAttrs(heroData, gameData);
        var linkHeroes = buildLinkHeroesResponse(gameData, heroId, heroData);

        var response = {
            heroId: heroId,
            _potentialLevel: heroData._potentialLevel,
            _changeInfo: buildChangeInfo(changes),
            _baseAttr: attrs._baseAttr,
            _totalAttr: attrs._totalAttr
        };

        if (linkHeroes) response._linkHeroes = linkHeroes;

        userDataService.saveUserData(userId, gameData).then(function () {
            logger.info('HERO', 'activeSkill userId=' + userId + ' heroId=' + heroId
                + ' pos=' + pos + ' level=' + currentLevel + '→' + nextLevel);
            callback(RH.success(response));
        }).catch(function (saveErr) {
            logger.error('HERO', 'activeSkill save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Active skill failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'activeSkill error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Active skill failed'));
    });
}


// =============================================
// SECTION 21: ACTIONS — useSkin / activeSkin
// =============================================

/**
 * ACTION 17: useSkin — Equip or unequip a hero skin.
 *
 * CLIENT REQUEST (line 119491-119520):
 *   {
 *     type:"hero", action:"useSkin",
 *     userId, skinId
 *     // NOTE: no version field
 *   }
 *
 * CLIENT CALLBACK (line 119491):
 *   - Iterates a._totalAttrs by heroId
 *   - For each: HerosManager.setTotalAttrsByHeroIdNotChange(attrs, heroId)
 *   - HerosManager.setCurSkin(o, n) — sets current skin for hero
 *   - e.showUI() — refresh skin UI
 *
 * Also: if changeHead is true, sends separate changeHeadImage request.
 *
 * USE SKIN LOGIC:
 *   1. Find skin config by skinId → get heroDrangon (heroDisplayId)
 *   2. If skinId === current skin → unequip (set curSkin to null/default)
 *   3. Otherwise → equip the skin
 *   4. Recalculate total attributes for the hero (skins may add stat bonuses)
 *   5. Return _totalAttrs with updated values
 *
 * Skin data on user: gameData.heroSkin = {
 *   skins: { [heroDisplayId]: [skinId1, skinId2, ...] },
 *   curSkin: { [heroDisplayId]: currentSkinId }
 * }
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionUseSkin(parsed, callback) {
    var userId = parsed.userId;
    var skinId = parsed.skinId;

    logger.info('HERO', 'useSkin userId=' + userId + ' skinId=' + skinId);

    if (!skinId && skinId !== 0) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing skinId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        // Get skin config
        var skinConfig = getSkinConfig(skinId);
        if (!skinConfig) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Invalid skinId: ' + skinId));
            return;
        }

        var heroDisplayId = skinConfig.heroDrangon;
        var skinIdStr = String(skinId);

        // Initialize heroSkin data structure
        if (!gameData.heroSkin) {
            gameData.heroSkin = { skins: {}, curSkin: {} };
        }
        if (!gameData.heroSkin.skins) gameData.heroSkin.skins = {};
        if (!gameData.heroSkin.curSkin) gameData.heroSkin.curSkin = {};

        // Check if this skin is owned
        var ownedSkins = gameData.heroSkin.skins[heroDisplayId];
        if (!ownedSkins || !Array.isArray(ownedSkins)) {
            ownedSkins = [];
            gameData.heroSkin.skins[heroDisplayId] = ownedSkins;
        }

        var skinOwned = ownedSkins.indexOf(skinIdStr) !== -1;
        if (!skinOwned) {
            // If using default skin (heroDisplayId * 1000), it's always available
            var heroInfo = getHeroInfo(heroDisplayId);
            var defaultSkinId = heroInfo ? String(heroInfo.defaultSkin || '') : '';
            if (skinIdStr !== defaultSkinId) {
                callback(RH.error(RH.ErrorCode.INVALID, 'Skin not owned'));
                return;
            }
        }

        // Toggle: if already equipped, unequip (set to default); otherwise equip
        var currentSkin = gameData.heroSkin.curSkin[heroDisplayId];
        var heroInfo2 = getHeroInfo(heroDisplayId);
        var defaultSkin = heroInfo2 ? String(heroInfo2.defaultSkin || heroDisplayId + '000') : '';

        if (currentSkin == skinIdStr) {
            // Unequip — revert to default skin
            gameData.heroSkin.curSkin[heroDisplayId] = defaultSkin;
            logger.info('HERO', 'useSkin unequip heroDisplayId=' + heroDisplayId + ' skin=' + skinId);
        } else {
            // Equip the new skin
            gameData.heroSkin.curSkin[heroDisplayId] = skinIdStr;
            logger.info('HERO', 'useSkin equip heroDisplayId=' + heroDisplayId + ' skin=' + skinId);
        }

        // Recalculate total attributes for hero
        var totalAttrs = {};
        var found = findHeroByDisplayId(gameData, heroDisplayId);
        if (found) {
            var attrs = calculateHeroAttrs(found.heroData, gameData);
            totalAttrs[found.heroId] = attrs._totalAttr;
        }

        userDataService.saveUserData(userId, gameData).then(function () {
            callback(RH.success({ _totalAttrs: totalAttrs }));
        }).catch(function (saveErr) {
            logger.error('HERO', 'useSkin save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Use skin failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'useSkin error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Use skin failed'));
    });
}

/**
 * ACTION 18: activeSkin — Activate/unlock a new hero skin.
 *
 * CLIENT REQUEST (line 119526-119533):
 *   {
 *     type:"hero", action:"activeSkin",
 *     userId, skinId
 *     // NOTE: no version field
 *   }
 *
 * CLIENT CALLBACK (line 119526):
 *   - HerosManager.activeSkinData(o, n) — adds skin to hero's model
 *     Implementation (line 85036): skinData.activeSkin(heroDisplayId, skinId)
 *     → this.skins[heroDisplayId].push(skinId)
 *   - UIWindowManager.openCongratulationObtain(t) — shows unlock celebration
 *   - e.showUI() — refresh skin list UI
 *
 * ACTIVE SKIN LOGIC:
 *   1. Validate skinId exists in heroSkin.json
 *   2. Add skinId to user's owned skins list
 *   3. Automatically equip the new skin
 *   4. Return _changeInfo (may include costs if activation has a cost)
 *
 * Note: This action only UNLOCKS the skin. To EQUIP it, useSkin must be called separately.
 * However, the client auto-equips after activation, so we should too.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionActiveSkin(parsed, callback) {
    var userId = parsed.userId;
    var skinId = parsed.skinId;

    logger.info('HERO', 'activeSkin userId=' + userId + ' skinId=' + skinId);

    if (!skinId && skinId !== 0) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing skinId'));
        return;
    }

    userDataService.loadUserData(userId).then(function (gameData) {
        if (!gameData) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'User not found'));
            return;
        }

        // Get skin config
        var skinConfig = getSkinConfig(skinId);
        if (!skinConfig) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Invalid skinId: ' + skinId));
            return;
        }

        var heroDisplayId = skinConfig.heroDrangon;
        var skinIdStr = String(skinId);

        // Initialize heroSkin data structure
        if (!gameData.heroSkin) {
            gameData.heroSkin = { skins: {}, curSkin: {} };
        }
        if (!gameData.heroSkin.skins) gameData.heroSkin.skins = {};
        if (!gameData.heroSkin.curSkin) gameData.heroSkin.curSkin = {};

        // Initialize skins array for this hero
        if (!gameData.heroSkin.skins[heroDisplayId]) {
            gameData.heroSkin.skins[heroDisplayId] = [];
        }

        var ownedSkins = gameData.heroSkin.skins[heroDisplayId];

        // Check if already owned
        if (ownedSkins.indexOf(skinIdStr) !== -1) {
            // Already owned — just equip it
            gameData.heroSkin.curSkin[heroDisplayId] = skinIdStr;
            userDataService.saveUserData(userId, gameData).then(function () {
                callback(RH.success({ _changeInfo: buildChangeInfo([]) }));
            }).catch(function (saveErr) {
                logger.error('HERO', 'activeSkin save error: ' + saveErr.message);
                callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Active skin failed'));
            });
            return;
        }

        // Add to owned skins
        ownedSkins.push(skinIdStr);

        // Auto-equip the new skin
        gameData.heroSkin.curSkin[heroDisplayId] = skinIdStr;

        logger.info('HERO', 'activeSkin userId=' + userId + ' skinId=' + skinId
            + ' heroDisplayId=' + heroDisplayId + ' UNLOCKED and equipped');

        userDataService.saveUserData(userId, gameData).then(function () {
            callback(RH.success({ _changeInfo: buildChangeInfo([]) }));
        }).catch(function (saveErr) {
            logger.error('HERO', 'activeSkin save error: ' + saveErr.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Active skin failed'));
        });
    }).catch(function (err) {
        logger.error('HERO', 'activeSkin error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Active skin failed'));
    });
}

// =============================================
// SECTION 22: ACTIONS — queryHeroEquipInfo / queryArenaHeroEquipInfo
// =============================================

/**
 * ACTION 19: queryHeroEquipInfo — Query hero equipment info for social viewing.
 *
 * CLIENT REQUEST (line 86182-86206):
 *   {
 *     type:"hero", action:"queryHeroEquipInfo",
 *     userId,                       // requesting user
 *     queryUserId,                  // target user to query
 *     heroId,                       // target hero ID
 *     withAttr: boolean,            // fetch attributes if not already present
 *     serverId,                     // target user's server ID
 *     version:"1.0"
 *   }
 *
 * CLIENT CALLBACK (line 86182):
 *   - Shows loading indicator (o.visible = !0) with 5s timeout
 *   - Opens HeroEquipAndStampShow window with response as "Infos"
 *   - Params: { parent:"Hero", Infos: response, heroInfo, queryUserId, serverId }
 *
 * RESPONSE FORMAT:
 *   Opens HeroEquipAndStampShow UI which expects:
 *   {
 *     _equips: { [heroId]: equipData },
 *     _stamps: { [heroId]: stampData },
 *     _attrs: { _items: [...] } | null
 *   }
 *
 * This is a CROSS-PLAYER query — need to load the target user's data.
 * The heroId here can be the hero's _heroId (instance) or _heroDisplayId (template).
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionQueryHeroEquipInfo(parsed, callback) {
    var userId = parsed.userId;
    var queryUserId = parsed.queryUserId;
    var heroId = parsed.heroId;
    var withAttr = parsed.withAttr;
    var serverId = parsed.serverId;

    logger.info('HERO', 'queryHeroEquipInfo userId=' + userId
        + ' queryUserId=' + queryUserId + ' heroId=' + heroId
        + ' withAttr=' + withAttr + ' serverId=' + serverId);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }
    if (!queryUserId) {
        queryUserId = userId; // Default to self
    }

    // Load the target user's data
    userDataService.loadUserData(queryUserId, serverId)
        .then(function (targetGameData) {
            if (!targetGameData) {
                // Target user not found — return empty data
                callback(RH.success({
                    _equips: {},
                    _stamps: {},
                    _attrs: withAttr ? emptyAttrs() : null
                }));
                return;
            }

            // Find the hero in target user's data
            var targetHeroData = getHero(targetGameData, heroId);
            if (!targetHeroData) {
                // Try by displayId
                var found = findHeroByDisplayId(targetGameData, heroId);
                if (found) {
                    targetHeroData = found.heroData;
                }
            }

            if (!targetHeroData) {
                callback(RH.success({
                    _equips: {},
                    _stamps: {},
                    _attrs: withAttr ? emptyAttrs() : null
                }));
                return;
            }

            // Build response with equipment, stamps, and attributes
            var attrs = null;
            if (withAttr) {
                attrs = calculateHeroAttrs(targetHeroData, targetGameData);
            }

            callback(RH.success({
                _equips: {},
                _stamps: {},
                _attrs: attrs ? attrs._totalAttr : null
            }));
        })
        .catch(function (err) {
            logger.error('HERO', 'queryHeroEquipInfo error: ' + err.message);
            callback(RH.success({
                _equips: {},
                _stamps: {},
                _attrs: withAttr ? emptyAttrs() : null
            }));
        });
}

/**
 * ACTION 20: queryArenaHeroEquipInfo — Query arena hero equipment info.
 *
 * CLIENT REQUEST (line 86207-86231):
 *   {
 *     type:"hero", action:"queryArenaHeroEquipInfo",
 *     userId, queryUserId, heroId, withAttr, serverId,
 *     version:"1.0"
 *   }
 *
 * CLIENT CALLBACK (line 86207):
 *   - Nearly identical to queryHeroEquipInfo
 *   - Opens HeroEquipAndStampShow window with same format
 *   - Used for viewing yesterday's arena defense team hero equipment
 *
 * The response format is identical to queryHeroEquipInfo.
 * The difference is contextual — arena queries may use cached/historical data.
 *
 * @param {object} parsed - Request data
 * @param {function} callback - Response callback
 */
function actionQueryArenaHeroEquipInfo(parsed, callback) {
    var userId = parsed.userId;
    var queryUserId = parsed.queryUserId;
    var heroId = parsed.heroId;
    var withAttr = parsed.withAttr;
    var serverId = parsed.serverId;

    logger.info('HERO', 'queryArenaHeroEquipInfo userId=' + userId
        + ' queryUserId=' + queryUserId + ' heroId=' + heroId
        + ' withAttr=' + withAttr + ' serverId=' + serverId);

    if (!heroId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroId'));
        return;
    }
    if (!queryUserId) {
        queryUserId = userId;
    }

    // For arena context, load target user's data
    // Arena may store defense team snapshots, but for now use live data
    userDataService.loadUserData(queryUserId, serverId)
        .then(function (targetGameData) {
            if (!targetGameData) {
                callback(RH.success({
                    _equips: {},
                    _stamps: {},
                    _attrs: withAttr ? emptyAttrs() : null
                }));
                return;
            }

            var targetHeroData = getHero(targetGameData, heroId);
            if (!targetHeroData) {
                var found = findHeroByDisplayId(targetGameData, heroId);
                if (found) targetHeroData = found.heroData;
            }

            if (!targetHeroData) {
                callback(RH.success({
                    _equips: {},
                    _stamps: {},
                    _attrs: withAttr ? emptyAttrs() : null
                }));
                return;
            }

            var attrs = null;
            if (withAttr) {
                attrs = calculateHeroAttrs(targetHeroData, targetGameData);
            }

            callback(RH.success({
                _equips: {},
                _stamps: {},
                _attrs: attrs ? attrs._totalAttr : null
            }));
        })
        .catch(function (err) {
            logger.error('HERO', 'queryArenaHeroEquipInfo error: ' + err.message);
            callback(RH.success({
                _equips: {},
                _stamps: {},
                _attrs: withAttr ? emptyAttrs() : null
            }));
        });
}

// =============================================

// =============================================
// SECTION 22B: UTILITY — Hero Connect / Bond System
// =============================================

/**
 * Hero Connect (Bond) System Utilities.
 * When heroes in the user's roster have bonds/connections defined in heroConnect.json,
 * they receive additional attribute bonuses based on how many connected heroes are owned.
 *
 * heroConnect.json structure:
 *   { [connectId]: { heroIntelligence, heroLevelMax, ... bond-specific data } }
 *
 * heroConnectLevelMax.json:
 *   { [level]: { heroIntelligence, heroLevelMax } }
 *   Levels 1-10+ with increasing bonuses.
 *
 * Bond activation from bondActivation.json:
 *   { [id]: { heroId1, heroId2, attr, value } }
 *   Activates when both heroes in a pair are owned.
 */

/**
 * Get all hero bonds/connections for a hero from bondActivation.json.
 *
 * @param {string|number} heroDisplayId - Hero template ID
 * @returns {Array} Array of bond entries involving this hero
 */
function getHeroBonds(heroDisplayId) {
    var config = GameData.get('bondActivation');
    if (!config) return [];

    var bonds = [];
    var keys = Object.keys(config);
    var dispId = String(heroDisplayId);

    for (var i = 0; i < keys.length; i++) {
        var bond = config[keys[i]];
        if (String(bond.heroId1) === dispId || String(bond.heroId2) === dispId) {
            bonds.push(bond);
        }
    }
    return bonds;
}

/**
 * Count active bonds for a hero based on user's current roster.
 * A bond is active when both heroes in the pair are owned.
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroDisplayId - Hero template ID
 * @returns {Array} Array of active bond entries
 */
function getActiveBonds(gameData, heroDisplayId) {
    var allBonds = getHeroBonds(heroDisplayId);
    var activeBonds = [];
    var dispId = String(heroDisplayId);

    for (var i = 0; i < allBonds.length; i++) {
        var bond = allBonds[i];
        var otherHeroId = String(bond.heroId1) === dispId ? bond.heroId2 : bond.heroId1;

        // Check if the other hero is in user's roster
        var found = findHeroByDisplayId(gameData, otherHeroId);
        if (found) {
            activeBonds.push(bond);
        }
    }
    return activeBonds;
}

/**
 * Calculate bond attribute bonuses for a hero.
 * Sum of all active bond attribute bonuses.
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroDisplayId - Hero template ID
 * @returns {object} { hp, attack, armor, ... } bond bonuses
 */
function calculateBondBonus(gameData, heroDisplayId) {
    var activeBonds = getActiveBonds(gameData, heroDisplayId);
    var bonuses = { hp: 0, attack: 0, armor: 0 };

    for (var i = 0; i < activeBonds.length; i++) {
        var bond = activeBonds[i];
        // Bond provides attribute bonus
        if (bond.attr === 'hp' || bond.attr === 0) bonuses.hp += bond.value || 0;
        else if (bond.attr === 'attack' || bond.attr === 1) bonuses.attack += bond.value || 0;
        else if (bond.attr === 'armor' || bond.attr === 2) bonuses.armor += bond.value || 0;
    }

    return bonuses;
}

// =============================================
// SECTION 22C: UTILITY — Hero Team Validation
// =============================================

/**
 * Check if a hero is currently assigned to any battle team.
 * Teams are stored in gameData.teams or similar structure.
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroId - Hero instance ID
 * @returns {boolean} True if hero is in a team
 */
function isHeroInTeam(gameData, heroId) {
    if (!gameData) return false;

    // Check various team structures
    var teamStructures = ['teams', 'arenaTeam', 'topBattleTeam',
                          'expeditionTeam', 'guildBossTeam', 'towerTeam'];

    for (var t = 0; t < teamStructures.length; t++) {
        var teamKey = teamStructures[t];
        var teamData = gameData[teamKey];
        if (!teamData) continue;

        if (teamData._heros && Array.isArray(teamData._heros)) {
            for (var i = 0; i < teamData._heros.length; i++) {
                if (teamData._heros[i] == heroId || teamData._heros[i]._heroId == heroId) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Get all teams that a hero is assigned to.
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroId - Hero instance ID
 * @returns {Array} Array of team names
 */
function getHeroTeams(gameData, heroId) {
    if (!gameData) return [];
    var teams = [];
    var teamStructures = ['teams', 'arenaTeam', 'topBattleTeam',
                          'expeditionTeam', 'guildBossTeam', 'towerTeam'];

    for (var t = 0; t < teamStructures.length; t++) {
        var teamKey = teamStructures[t];
        var teamData = gameData[teamKey];
        if (!teamData) continue;

        if (teamData._heros && Array.isArray(teamData._heros)) {
            for (var i = 0; i < teamData._heros.length; i++) {
                if (teamData._heros[i] == heroId || teamData._heros[i]._heroId == heroId) {
                    teams.push(teamKey);
                    break;
                }
            }
        }
    }
    return teams;
}

/**
 * Remove hero from all teams.
 * Used when a hero is resolved, reborn, or transferred.
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroId - Hero instance ID to remove
 * @returns {number} Number of teams the hero was removed from
 */
function removeHeroFromAllTeams(gameData, heroId) {
    if (!gameData) return 0;
    var removed = 0;
    var teamStructures = ['teams', 'arenaTeam', 'topBattleTeam',
                          'expeditionTeam', 'guildBossTeam', 'towerTeam'];

    for (var t = 0; t < teamStructures.length; t++) {
        var teamKey = teamStructures[t];
        var teamData = gameData[teamKey];
        if (!teamData) continue;

        if (teamData._heros && Array.isArray(teamData._heros)) {
            var before = teamData._heros.length;
            teamData._heros = teamData._heros.filter(function(h) {
                return h != heroId && (!h._heroId || h._heroId != heroId);
            });
            if (teamData._heros.length < before) removed++;
        }
    }
    return removed;
}

// =============================================
// SECTION 22D: UTILITY — Enhanced Power Calculation
// =============================================

/**
 * Calculate hero power with full formula.
 *
 * The power formula from constant.json uses:
 *   zPowerFormulaParaA (100), zPowerFormulaParaB (5),
 *   zPowerFormulaParaC (10), zPowerFormulaParaD (35)
 *
 * Formula:
 *   basePower = (hp / A + attack / B + armor / C) × D
 *   finalPower = basePower × balancePower × (1 + talentBonus)
 *
 * Where talentBonus comes from wakeUp talent coefficient.
 *
 * @param {object} heroData - Hero instance
 * @param {object} [gameData] - User's game data (for bond calculations)
 * @returns {number} Total power rating
 */
function calculateFullHeroPower(heroData, gameData) {
    if (!heroData) return 0;

    var attrs = calculateHeroAttrs(heroData, gameData);
    var totalItems = attrs._totalAttr._items || {};
    var heroInfo = getHeroInfo(heroData._heroDisplayId);

    return computeStatPower(heroInfo, totalItems);
}

/**
 * Calculate the power delta when qigong is applied.
 * Returns (power with qigongTmp) - (power without qigongTmp).
 *
 * @param {object} heroData - Hero instance
 * @returns {number} Power change (positive = increase)
 */
function calculateQigongPowerDelta(heroData) {
    if (!heroData) return 0;

    var powerWithout = calculateHeroPower(heroData);
    var powerWith = calculateFullHeroPower(heroData);

    return powerWith - powerWithout;
}

// =============================================
// SECTION 22E: UTILITY — Hero Validation
// =============================================

/**
 * Validate that a hero can be operated on (not in team, exists, etc.).
 * Returns an error response if validation fails, or null if OK.
 *
 * @param {object} gameData - User's game data
 * @param {string|number} heroId - Hero instance ID
 * @param {string} operation - Operation name for logging
 * @returns {object|null} Error response or null
 */
function validateHeroOperation(gameData, heroId, operation) {
    if (!gameData) {
        return RH.error(RH.ErrorCode.DATA_ERROR, 'User not found');
    }

    var heroData = getHero(gameData, heroId);
    if (!heroData) {
        return RH.error(RH.ErrorCode.DATA_ERROR, 'Hero not found: ' + heroId);
    }

    // Check if hero is in a battle team (some operations require removing first)
    var teams = getHeroTeams(gameData, heroId);
    if (teams.length > 0) {
        logger.warn('HERO', operation + ' heroId=' + heroId + ' is in teams: ' + JSON.stringify(teams));
    }

    return null; // Validation passed
}

/**
 * Validate evolve prerequisites.
 * Checks level, star, quality requirements for evolving.
 *
 * @param {object} heroData - Hero instance
 * @returns {object} { canEvolve: boolean, reason: string, nextEntry: object|null }
 */
function validateEvolvePrerequisites(heroData) {
    var displayId = heroData._heroDisplayId;
    var currentEvolve = heroData._heroBaseAttr._evolveLevel || 0;
    var level = heroData._heroBaseAttr._level || 1;
    var star = heroData._heroStar || 0;
    var fragment = heroData._fragment || 0;

    var nextEntry = getNextEvolveEntry(displayId, currentEvolve);

    if (!nextEntry) {
        return { canEvolve: false, reason: 'MAX_EVOLVE', nextEntry: null };
    }

    // Check level requirement
    if (nextEntry.needLevel && level < nextEntry.needLevel) {
        return {
            canEvolve: false,
            reason: 'LEVEL_TOO_LOW',
            nextEntry: nextEntry,
            required: nextEntry.needLevel,
            current: level
        };
    }

    // Check self fragment requirement
    var selfStarNeeded = nextEntry.needStarSelf || nextEntry.needStar || 0;
    if (selfStarNeeded > 0 && fragment < selfStarNeeded) {
        return {
            canEvolve: false,
            reason: 'INSUFFICIENT_FRAGMENTS',
            nextEntry: nextEntry,
            required: selfStarNeeded,
            current: fragment
        };
    }

    return { canEvolve: true, reason: 'OK', nextEntry: nextEntry };
}

/**
 * Validate breakthrough prerequisites.
 * Checks quality, star, level requirements for self-breakthrough.
 *
 * @param {object} heroData - Hero instance
 * @returns {object} { canBreak: boolean, reason: string }
 */
function validateBreakPrerequisites(heroData) {
    var quality = getHeroBaseQuality(heroData._heroDisplayId);
    var qIdx = getQualityIndex(quality);

    if (qIdx < (QUALITY_INDEX['purple'] || 4)) {
        return { canBreak: false, reason: 'QUALITY_TOO_LOW' };
    }

    var starNeeded = getConstant('selfBreakStarNeeded') || 3;
    if ((heroData._heroStar || 0) < starNeeded) {
        return { canBreak: false, reason: 'STAR_TOO_LOW', required: starNeeded };
    }

    var levelNeeded = getConstant('selfBreakLevelNeeded') || 150;
    if ((heroData._heroBaseAttr._level || 1) < levelNeeded) {
        return { canBreak: false, reason: 'LEVEL_TOO_LOW', required: levelNeeded };
    }

    return { canBreak: true, reason: 'OK' };
}

// =============================================
// SECTION 22F: UTILITY — Hero Data Migration
// =============================================

/**
 * Ensure hero data structure is complete and up-to-date.
 * Called when loading hero data to add missing fields from newer versions.
 *
 * @param {object} heroData - Hero instance to migrate
 */
function migrateHeroData(heroData) {
    if (!heroData) return;

    // Ensure _heroBaseAttr exists with all fields
    if (!heroData._heroBaseAttr) {
        heroData._heroBaseAttr = {
            _level: 1, _evolveLevel: 0,
            maxlevel: getConstant('heroZeroStarMaxLevel') || 100,
            _hp: 0, _attack: 0, _armor: 0, _speed: 0,
            _hit: 0, _dodge: 0, _block: 0, _blockEffect: 0,
            _skillDamage: 0, _critical: 0, _criticalResist: 0,
            _criticalDamage: 0, _armorBreak: 0, _damageReduce: 0,
            _controlResist: 0, _trueDamage: 0, _energy: 0,
            _power: 0, _extraArmor: 0, _hpPercent: 0,
            _armorPercent: 0, _attackPercent: 0, _speedPercent: 0,
            _orghp: 0, _superDamage: 0, _healPlus: 0,
            _healerPlus: 0, _damageDown: 0, _shielderPlus: 0,
            _damageUp: 0
        };
    }

    // Ensure numeric fields exist
    if (heroData._heroStar == null) heroData._heroStar = 0;
    if (heroData._fragment == null) heroData._fragment = 0;
    if (heroData._qigongStage == null) heroData._qigongStage = 1;
    if (heroData._qigongTmpPower == null) heroData._qigongTmpPower = 0;
    if (heroData._superSkillResetCount == null) heroData._superSkillResetCount = 0;
    if (heroData._potentialResetCount == null) heroData._potentialResetCount = 0;
    if (heroData._expeditionMaxLevel == null) heroData._expeditionMaxLevel = 0;

    // Ensure object fields exist
    if (!heroData._superSkillLevel) heroData._superSkillLevel = {};
    if (!heroData._potentialLevel) heroData._potentialLevel = {};

    // Ensure _potentialLevel exists with correct format: { "1": level, "2": level, "3": level }
    // Client (line 85504-85513): setHeroPotentialSkillState accesses t[i] for i=1,2,3
    // Client (line 86691): BattleTeam accesses i[E] for E=1,2,3
    if (!heroData._potentialLevel) {
        heroData._potentialLevel = { "1": 0, "2": 0, "3": 0 };
    } else if (heroData._potentialLevel._items) {
        // MIGRATION: Convert old { _items: [{ _pos, _level }] } format to new { "1": level, ... }
        var oldItems = heroData._potentialLevel._items;
        heroData._potentialLevel = { "1": 0, "2": 0, "3": 0 };
        if (Array.isArray(oldItems)) {
            for (var mi = 0; mi < oldItems.length; mi++) {
                var posKey = String(oldItems[mi]._pos);
                if (posKey === "1" || posKey === "2" || posKey === "3") {
                    heroData._potentialLevel[posKey] = oldItems[mi]._level || 0;
                }
            }
        }
    } else {
        // Ensure all 3 slots exist
        if (heroData._potentialLevel["1"] == null) heroData._potentialLevel["1"] = 0;
        if (heroData._potentialLevel["2"] == null) heroData._potentialLevel["2"] = 0;
        if (heroData._potentialLevel["3"] == null) heroData._potentialLevel["3"] = 0;
    }

    // Ensure _heroTag is array
    if (!heroData._heroTag || !Array.isArray(heroData._heroTag)) {
        heroData._heroTag = [0];
    }

    // Ensure maxlevel is set
    if (!heroData._heroBaseAttr.maxlevel) {
        heroData._heroBaseAttr.maxlevel = getMaxLevel(heroData);
    }

    // Initialize totalCost if missing
    initTotalCost(heroData);
}

/**
 * Migrate all heroes in user data.
 *
 * @param {object} gameData - User's game data
 */
function migrateAllHeroData(gameData) {
    if (!gameData || !gameData.heros || !gameData.heros._heros) return;

    var keys = Object.keys(gameData.heros._heros);
    for (var i = 0; i < keys.length; i++) {
        migrateHeroData(gameData.heros._heros[keys[i]]);
    }
}

// =============================================
// SECTION 22G: UTILITY — Serialization Helpers
// =============================================

/**
 * Serialize hero data for database storage.
 * Ensures all fields are properly formatted for JSON storage.
 *
 * @param {object} heroData - Hero instance
 * @returns {object} Serialized hero data
 */
function serializeHero(heroData) {
    if (!heroData) return null;

    // Create a clean copy for serialization
    var result = {};
    var keys = Object.keys(heroData);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        result[key] = heroData[key];
    }

    return result;
}

/**
 * Deserialize hero data from database.
 * Ensures all fields are properly initialized after loading.
 *
 * @param {object} data - Raw hero data from DB
 * @returns {object} Deserialized hero data
 */
function deserializeHero(data) {
    if (!data) return null;

    // Run migration to ensure all fields exist
    migrateHeroData(data);

    return data;
}


// SECTION 23: MAIN HANDLER
// =============================================

/**
 * Handle hero management requests.
 *
 * Routes 20 verified actions from client code.
 * All actions verified against main.min.js client source.
 *
 * @param {object} socket - Socket.IO socket
 * @param {object} parsed - Parsed request { type, action, userId, ... }
 * @param {function} callback - Response callback
 */
function handle(socket, parsed, callback) {
    var action = parsed.action;
    var userId = parsed.userId;

    if (!action) {
        callback(RH.error(RH.ErrorCode.INVALID_COMMAND, 'Missing action'));
        return;
    }

    switch (action) {
        // === ATTRIBUTE QUERY ===
        case 'getAttrs':
            actionGetAttrs(parsed, callback);
            break;

        // === LEVEL UP ===
        case 'autoLevelUp':
            actionAutoLevelUp(parsed, callback);
            break;

        // === EVOLVE (STAR UP) ===
        case 'evolve':
            actionEvolve(parsed, callback);
            break;

        // === DECOMPOSE ===
        case 'resolve':
            actionResolve(parsed, callback);
            break;

        // === REBIRTH ===
        case 'reborn':
            actionReborn(parsed, callback);
            break;

        // === SPLIT ===
        case 'splitHero':
            actionSplitHero(parsed, callback);
            break;

        // === INHERIT ===
        case 'inherit':
            actionInherit(parsed, callback);
            break;

        // === QIGONG TRAINING ===
        case 'qigong':
            actionQigong(parsed, callback);
            break;
        case 'saveQigong':
            actionSaveQigong(parsed, callback);
            break;
        case 'cancelQigong':
            actionCancelQigong(parsed, callback);
            break;

        // === BREAKTHROUGH ===
        case 'heroBreak':
            actionHeroBreak(parsed, callback);
            break;
        case 'activeHeroBreak':
            actionActiveHeroBreak(parsed, callback);
            break;
        case 'autoHeroBreak':
            actionAutoHeroBreak(parsed, callback);
            break;
        case 'rebornSelfBreak':
            actionRebornSelfBreak(parsed, callback);
            break;

        // === AWAKENING ===
        case 'wakeUp':
            actionWakeUp(parsed, callback);
            break;

        // === SKILLS ===
        case 'activeSkill':
            actionActiveSkill(parsed, callback);
            break;

        // === SKINS ===
        case 'useSkin':
            actionUseSkin(parsed, callback);
            break;
        case 'activeSkin':
            actionActiveSkin(parsed, callback);
            break;

        // === EQUIPMENT QUERY (SOCIAL) ===
        case 'queryHeroEquipInfo':
            actionQueryHeroEquipInfo(parsed, callback);
            break;
        case 'queryArenaHeroEquipInfo':
            actionQueryArenaHeroEquipInfo(parsed, callback);
            break;

        default:
            logger.warn('HERO', 'Unknown action: ' + action + ' userId=' + userId);
            callback(RH.error(RH.ErrorCode.INVALID_COMMAND, 'Unknown action: ' + action));
            break;
    }
}

module.exports = { handle: handle };