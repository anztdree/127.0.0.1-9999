/**
 * ============================================================================
 * hero/getAttrs.js — Hero Attribute Calculation Handler
 * ============================================================================
 *
 * Handler: hero:getAttrs
 *
 * Calculates base attributes (_baseAttrs) and total attributes (_attrs) for
 * requested heroes. This is the CORE stat computation handler — every other
 * system that needs hero stats depends on this.
 *
 * ============================================================================
 * REQUEST FORMAT (from client):
 * ============================================================================
 * {
 *     type: "hero",
 *     action: "getAttrs",
 *     userId: "player-uuid",
 *     heros: ["hero-instance-uuid-1", "hero-instance-uuid-2", ...],
 *     version: "1.0"
 * }
 *
 * ============================================================================
 * RESPONSE FORMAT (HAR-verified):
 * ============================================================================
 * {
 *     type: "hero",
 *     action: "getAttrs",
 *     userId: "player-uuid",
 *     heros: ["hero-instance-uuid-1", ...],   // echoed from request
 *     version: "1.0",                          // echoed from request
 *     _attrs: [
 *         { _items: { "0": {_id:0, _num:396.8}, "1": {_id:1, _num:165}, ... } },
 *         ...                                    // one per hero, array-index matches heros[]
 *     ],
 *     _baseAttrs: [
 *         { _items: { "0": {_id:0, _num:992}, "1": {_id:1, _num:412.5}, ... } },
 *         ...
 *     ]
 * }
 *
 * CRITICAL FORMAT NOTES:
 * - _attrs and _baseAttrs are ARRAYS (not objects) — index matches heros[] order
 * - _items is an OBJECT with string-number keys, values are {_id, _num}
 * - _attrs has IDs 0-41 (all 42 attributes)
 * - _baseAttrs has IDs 0-15, 23-41 (excludes 16-22)
 *
 * ============================================================================
 * ARCHITECTURE:
 * ============================================================================
 *   _baseAttrs = makeHeroBasicAttr(heroDisplayId, level, evolveLevel, star)
 *             → raw stats BEFORE talent multiplication
 *             → includes: level-based stats, evolve bonuses, wakeUp bonuses,
 *               qigong bonuses, selfBreak bonuses, hero.json static stats
 *
 *   _attrs = _baseAttrs + ALL bonus sources
 *          → talent: hp *= talent, attack *= talent
 *          → equipment bonuses
 *          → levelAbility secondary stats
 *          → passive skill bonuses
 *          → weapon/sign/genki/guild tech bonuses
 *          → special computed IDs: energy=50, power=calculated, orghp=hp, energyMax=100
 *
 * ============================================================================
 * JSON CONFIG FILES USED:
 * ============================================================================
 * hero.json              — Hero template: talent, speed, quality, heroType, balanceHp/Attack/Armor, etc.
 * heroLevelAttr.json     — Per-level base: {level, hp, attack, armor} (360 levels)
 * heroTypeParam.json     — Per-type params: hpParam, hpBais, attackParam, attackBais, armorParam, armorBais
 * heroQualityParam.json  — Per-quality params: hpParam, attackParam, armorParam (ALL are 1)
 * heroEvolve.json        — Evolve bonuses per stage: level, hp, attack, armor, speed, skillPassive IDs
 * heroWakeUp.json        — WakeUp bonuses per star: star, talent, hp, attack, armor, speed
 * qiGong.json            — Qigong bonuses: hpMax, armorMax, attackMax (keyed by evolveLevel + heroType)
 * qigongQualityMaxPara.json — Qigong quality multiplier: hpMaxPara, armorMaxPara, attackMaxPara
 * selfBreak.json         — Self-break bonuses: abilityID, value, abilityAffected, breakType, levelNeeded
 * selfBreakQuality.json  — Self-break quality multiplier: abilityPara (only purple+ have entries)
 * skillOutBattle.json    — Out-of-battle passive skill effects
 * heroPower.json         — Power formula coefficients: attName, powerParam, powerExtraParam
 * zPowerQualityPara.json — Quality power scaling: para (white/green/blue=0.2, purple=0.3, etc.)
 * abilityName.json       — Attribute ID ↔ name mapping (46 attributes, IDs 0-45)
 * levelAbility{Type}.json — Per-level secondary stats by heroType (13 types)
 * equip.json             — Equipment item stats: hp, attack, armor, etc.
 * ============================================================================
 */

var db = require('../../db');
var resources = require('../utils/resources');

// ============================================================================
// JSON Config Caches (lazy-loaded on first request)
// ============================================================================
var _cfg = {};
var _cfgLoaded = false;

function ensureConfigsLoaded() {
    if (_cfgLoaded) return;

    _cfg.abilityName          = resources.load('abilityName');
    _cfg.heroPower            = resources.load('heroPower');
    _cfg.zPowerQualityPara    = resources.load('zPowerQualityPara');
    _cfg.heroTypeParam        = resources.load('heroTypeParam');
    _cfg.heroQualityParam     = resources.load('heroQualityParam');
    _cfg.heroEvolve           = resources.load('heroEvolve');
    _cfg.heroWakeUp           = resources.load('heroWakeUp');
    _cfg.qiGong               = resources.load('qiGong');
    _cfg.qigongQualityMaxPara = resources.load('qigongQualityMaxPara');
    _cfg.selfBreak            = resources.load('selfBreak');
    _cfg.selfBreakQuality     = resources.load('selfBreakQuality');
    _cfg.skillOutBattle       = resources.load('skillOutBattle');
    _cfg.equip                = resources.load('equip');

    // Build abilityName → ID reverse map
    _cfg._attrNameToId = {};
    if (_cfg.abilityName) {
        for (var key in _cfg.abilityName) {
            var entry = _cfg.abilityName[key];
            _cfg._attrNameToId[entry.englishName] = parseInt(key, 10);
        }
    }

    // Build heroPower lookup: heroType → [entries]
    _cfg._heroPowerByType = {};
    if (_cfg.heroPower) {
        for (var key in _cfg.heroPower) {
            var entry = _cfg.heroPower[key];
            var ht = entry.heroType;
            if (!_cfg._heroPowerByType[ht]) {
                _cfg._heroPowerByType[ht] = [];
            }
            _cfg._heroPowerByType[ht].push(entry);
        }
    }

    // Build zPowerQualityPara lookup: quality → para
    _cfg._qualityPowerPara = {};
    if (_cfg.zPowerQualityPara) {
        for (var key in _cfg.zPowerQualityPara) {
            var entry = _cfg.zPowerQualityPara[key];
            _cfg._qualityPowerPara[entry.quality] = entry.para;
        }
    }

    // Build selfBreakQuality lookup: quality → abilityPara
    _cfg._selfBreakQualityPara = {};
    if (_cfg.selfBreakQuality) {
        for (var key in _cfg.selfBreakQuality) {
            var entry = _cfg.selfBreakQuality[key];
            _cfg._selfBreakQualityPara[entry.quality] = entry.abilityPara || 1;
        }
    }

    // Build qigongQualityMaxPara lookup: quality → {hpMaxPara, armorMaxPara, attackMaxPara}
    _cfg._qigongQualityPara = {};
    if (_cfg.qigongQualityMaxPara) {
        for (var key in _cfg.qigongQualityMaxPara) {
            var entry = _cfg.qigongQualityMaxPara[key];
            _cfg._qigongQualityPara[entry.quality] = entry;
        }
    }

    _cfgLoaded = true;
}

// ============================================================================
// LevelAbility file mapping: heroType → JSON config file name
// ============================================================================
var LEVEL_ABILITY_FILE_MAP = {
    'body':           'levelAbilityBody',
    'bodyDamage':     'levelAbilityBodyDamage',
    'block':          'levelAbilityblock',      // NOTE: lowercase 'b' in original filename!
    'armor':          'levelAbilityArmor',
    'armorS':         'levelAbilityArmorS',
    'armorDamage':    'levelAbilityArmorDamage',
    'dodge':          'levelAbilityDodge',
    'strength':       'levelAbilityStrength',
    'critical':       'levelAbilityCritical',
    'criticalSingle': 'levelAbilityCritical',   // Shares with critical (TODO: verify)
    'hit':            'levelAbilityHit',
    'skill':          'levelAbilitySkill',
    'dot':            'levelAbilityDot'
};

var _levelAbilityCache = {};

/**
 * Load levelAbility data for a given heroType.
 * Data is keyed by level number as string (e.g. "1", "50", "360").
 */
function getLevelAbilityData(heroType) {
    if (_levelAbilityCache[heroType]) return _levelAbilityCache[heroType];
    var fileName = LEVEL_ABILITY_FILE_MAP[heroType];
    if (fileName) {
        var data = resources.load(fileName);
        if (data) _levelAbilityCache[heroType] = data;
    }
    return _levelAbilityCache[heroType] || null;
}

// ============================================================================
// Attribute ID Constants (from abilityName.json)
// ============================================================================
var ATTR = {
    HP:                   0,
    ATTACK:               1,
    ARMOR:                2,
    SPEED:                3,
    HIT:                  4,
    DODGE:                5,
    BLOCK:                6,
    BLOCK_EFFECT:         7,
    SKILL_DAMAGE:         8,
    CRITICAL:             9,
    CRITICAL_RESIST:      10,
    CRITICAL_DAMAGE:      11,
    ARMOR_BREAK:          12,
    DAMAGE_REDUCE:        13,
    CONTROL_RESIST:       14,
    TRUE_DAMAGE:          15,
    ENERGY:               16,     // Only in _attrs (always 50)
    HP_PERCENT:           17,     // Only in _attrs
    ARMOR_PERCENT:        18,     // Only in _attrs
    ATTACK_PERCENT:       19,     // Only in _attrs
    SPEED_PERCENT:        20,     // Only in _attrs
    POWER:                21,     // Only in _attrs (server-calculated)
    ORGHP:                22,     // Only in _attrs (= copy of _attrs.hp)
    SUPER_DAMAGE:         23,
    HEAL_PLUS:            24,
    HEALER_PLUS:          25,
    EXTRA_ARMOR:          26,     // FLAT value
    SHIELDER_PLUS:        27,
    DAMAGE_UP:            28,
    DAMAGE_DOWN:          29,
    TALENT:               30,
    SUPER_DAMAGE_RESIST:  31,
    DRAGON_BALL_WAR_DMG_UP:  32,
    DRAGON_BALL_WAR_DMG_DOWN: 33,
    BLOOD_DAMAGE:         34,
    NORMAL_ATTACK:        35,
    CRITICAL_DAMAGE_RESIST:  36,
    BLOCK_THROUGH:        37,
    CONTROL_ADD:          38,
    BLOOD_RESIST:         39,
    EXTRA_ARMOR_BREAK:    40,
    ENERGY_MAX:           41
};

// Attribute names that map to _baseAttrs (IDs 0-15, 23-41)
var BASE_ATTR_NAMES = [
    'hp', 'attack', 'armor', 'speed',
    'hit', 'dodge', 'block', 'blockEffect',
    'skillDamage', 'critical', 'criticalResist',
    'criticalDamage', 'armorBreak', 'damageReduce',
    'controlResist', 'trueDamage',
    // 16-22 excluded from _baseAttrs
    'superDamage', 'healPlus', 'healerPlus', 'extraArmor',
    'shielderPlus', 'damageUp', 'damageDown', 'talent',
    'superDamageResist', 'dragonBallWarDamageUp', 'dragonBallWarDamageDown',
    'bloodDamage', 'normalAttack', 'criticalDamageResist',
    'blockThrough', 'controlAdd', 'bloodResist', 'extraArmorBreak', 'energyMax'
];

// Attribute name → abilityName.json ID mapping
var ATTR_NAME_TO_ID = {};
(function() {
    var names = [
        'hp', 'attack', 'armor', 'speed',
        'hit', 'dodge', 'block', 'blockEffect',
        'skillDamage', 'critical', 'criticalResist',
        'criticalDamage', 'armorBreak', 'damageReduce',
        'controlResist', 'trueDamage', 'energy',
        'hpPercent', 'armorPercent', 'attackPercent', 'speedPercent',
        'power', 'orghp',
        'superDamage', 'healPlus', 'healerPlus', 'extraArmor',
        'shielderPlus', 'damageUp', 'damageDown', 'talent',
        'superDamageResist', 'dragonBallWarDamageUp', 'dragonBallWarDamageDown',
        'bloodDamage', 'normalAttack', 'criticalDamageResist',
        'blockThrough', 'controlAdd', 'bloodResist', 'extraArmorBreak', 'energyMax'
    ];
    for (var i = 0; i < names.length; i++) {
        ATTR_NAME_TO_ID[names[i]] = i;
    }
})();

// ============================================================================
// makeHeroBasicAttr — Server-side equivalent of client's makeHeroBasicAttr
// ============================================================================
/**
 * Calculate base attributes for a hero.
 * This is the raw stat computation BEFORE talent multiplication.
 *
 * @param {number} heroDisplayId  — Hero template ID (maps to hero.json key)
 * @param {number} heroLevel      — Current hero level (1-360)
 * @param {number} evolveLevel    — Current evolve level (0-15 stages)
 * @param {number} star           — Current wakeUp star level (0+)
 * @param {object} heroConfig     — Hero entry from hero.json
 * @param {object} breakInfo      — Hero's self-break data from DB
 * @param {object} qigongInfo     — Hero's qigong data from DB
 * @returns {object} Base attribute values keyed by attribute name
 */
function makeHeroBasicAttr(heroDisplayId, heroLevel, evolveLevel, star, heroConfig, breakInfo, qigongInfo) {
    // Initialize all base attributes to 0
    var d = {};
    var allAttrNames = [
        'hp', 'attack', 'armor', 'speed',
        'hit', 'dodge', 'block', 'blockEffect',
        'skillDamage', 'critical', 'criticalResist',
        'criticalDamage', 'armorBreak', 'damageReduce',
        'controlResist', 'trueDamage',
        'superDamage', 'healPlus', 'healerPlus', 'extraArmor',
        'shielderPlus', 'damageUp', 'damageDown',
        'superDamageResist', 'dragonBallWarDamageUp', 'dragonBallWarDamageDown',
        'bloodDamage', 'normalAttack', 'criticalDamageResist',
        'blockThrough', 'controlAdd', 'bloodResist', 'extraArmorBreak'
    ];
    for (var i = 0; i < allAttrNames.length; i++) {
        d[allAttrNames[i]] = 0;
    }

    // Talent and energyMax come directly from hero.json
    d.talent = heroConfig.talent || 0;
    d.energyMax = heroConfig.energyMax || 100;

    var heroType = heroConfig.heroType;
    var quality = heroConfig.quality;

    // ========================================================================
    // Step 1: Evolve Bonuses (heroEvolve.json)
    // ========================================================================
    // heroEvolve.json is keyed by heroDisplayId.
    // Each entry (or array of entries) has: level, hp, attack, armor, speed
    // We sum all bonuses where evolveEntry.level <= current evolveLevel
    var evolveEntries = _cfg.heroEvolve;
    if (evolveEntries) {
        var evolveData = evolveEntries[String(heroDisplayId)];
        if (evolveData) {
            var evolveList = Array.isArray(evolveData) ? evolveData : [evolveData];
            for (var ei = 0; ei < evolveList.length; ei++) {
                var eEntry = evolveList[ei];
                if (eEntry.level !== undefined && eEntry.level <= evolveLevel) {
                    d.hp     += (eEntry.hp     || 0);
                    d.attack += (eEntry.attack  || 0);
                    d.armor  += (eEntry.armor   || 0);
                    d.speed  += (eEntry.speed   || 0);
                }
            }
        }
    }

    // ========================================================================
    // Step 2: WakeUp Bonuses (heroWakeUp.json)
    // ========================================================================
    // heroWakeUp.json is keyed by heroDisplayId.
    // Each entry (or array) has: star, talent, hp, attack, armor, speed
    // We sum bonuses for all entries where wakeUpEntry.star <= current star
    var wakeUpEntries = _cfg.heroWakeUp;
    if (wakeUpEntries) {
        var wakeUpData = wakeUpEntries[String(heroDisplayId)];
        if (wakeUpData) {
            var wakeUpList = Array.isArray(wakeUpData) ? wakeUpData : [wakeUpData];
            for (var wi = 0; wi < wakeUpList.length; wi++) {
                var wEntry = wakeUpList[wi];
                if (wEntry.star !== undefined && wEntry.star <= star) {
                    d.talent += (wEntry.talent   || 0);
                    d.hp     += (wEntry.hp       || 0);
                    d.attack += (wEntry.attack   || 0);
                    d.armor  += (wEntry.armor    || 0);
                    d.speed  += (wEntry.speed    || 0);
                }
            }
        }
    }

    // ========================================================================
    // Step 3: Qigong Bonuses (qiGong.json + qigongQualityMaxPara.json)
    // ========================================================================
    // qiGong.json has entries keyed by evolveLevel and heroType.
    // qigongQualityMaxPara.json provides quality-based multipliers.
    // Only applies when evolveLevel > 0.
    if (evolveLevel > 0 && qigongInfo && _cfg.qiGong) {
        var qigongMatch = null;
        var qiGongData = _cfg.qiGong;

        // Search for matching qigong entry (by evolveLevel + heroType)
        for (var qgKey in qiGongData) {
            var qgEntry = qiGongData[qgKey];
            if (qgEntry.evolveLevel === evolveLevel && qgEntry.heroType === heroType) {
                qigongMatch = qgEntry;
                break;
            }
        }

        if (qigongMatch) {
            var qMultiplier = _cfg._qigongQualityPara[quality] || { hpMaxPara: 1, armorMaxPara: 1, attackMaxPara: 1 };
            d.hp     += Math.floor(qigongMatch.hpMax     * (qMultiplier.hpMaxPara     || 1));
            d.armor  += Math.floor(qigongMatch.armorMax  * (qMultiplier.armorMaxPara  || 1));
            d.attack += Math.floor(qigongMatch.attackMax * (qMultiplier.attackMaxPara || 1));
        }
    }

    // ========================================================================
    // Step 4: Self-Break Bonuses (selfBreak.json + selfBreakQuality.json)
    // ========================================================================
    // selfBreak.json has entries with: breakType, levelNeeded, ability1/abilityID1,
    //   value1, abilityAffected1
    // selfBreakQuality.json provides quality multiplier for abilityAffected stats.
    // hero.json has breakType (e.g. "damageUp", "damageDown", etc.)
    // breakInfo from DB has: _breakLevel, _level, _attr
    var heroBreakType = heroConfig.breakType;
    var heroBreakLevel = 1;
    if (breakInfo) {
        if (typeof breakInfo === 'string') {
            try { breakInfo = JSON.parse(breakInfo); } catch (e) { breakInfo = {}; }
        }
        heroBreakLevel = breakInfo._breakLevel || breakInfo.level || 1;
    }

    if (_cfg.selfBreak) {
        var sbQualityPara = _cfg._selfBreakQualityPara[quality] || 1;

        for (var sbKey in _cfg.selfBreak) {
            var sb = _cfg.selfBreak[sbKey];

            // Only apply if hero level meets requirement
            if (sb.levelNeeded > heroLevel) continue;

            // Match breakType: selfBreak.breakType = "break_" + hero.json.breakType
            if (heroBreakType && sb.breakType !== 'break_' + heroBreakType) continue;
            // If hero has no breakType, skip entries that require one
            if (!heroBreakType && sb.breakType) continue;

            // Extract ability data (supports both ability1/abilityID1/value1 and single formats)
            var sbAbilities = [];
            for (var abi = 1; abi <= 5; abi++) {
                var aName  = sb['ability' + abi];
                var aId    = sb['abilityID' + abi];
                var aValue = sb['value' + abi];
                var aAffected = sb['abilityAffected' + abi];
                if (aName !== undefined && aValue !== undefined) {
                    sbAbilities.push({ name: aName, id: aId, value: aValue, affected: aAffected });
                }
            }
            // Also check single-format fields
            if (sbAbilities.length === 0 && sb.ability && sb.value !== undefined) {
                sbAbilities.push({ name: sb.ability, id: sb.abilityID, value: sb.value, affected: sb.abilityAffected });
            }

            for (var sai = 0; sai < sbAbilities.length; sai++) {
                var sbA = sbAbilities[sai];
                var multiplier = sbA.affected ? sbQualityPara : 1;
                d[sbA.name] = (d[sbA.name] || 0) + (sbA.value * multiplier);
            }
        }
    }

    // ========================================================================
    // Step 5: Base Stats Formula (heroLevelAttr × heroTypeParam × heroQualityParam × balance)
    // ========================================================================
    // hp = (heroLevelAttr[level].hp * typeParam.hpParam + typeParam.hpBais)
    //      * qualityParam.hpParam * hero.balanceHp
    // attack = (heroLevelAttr[level].attack * typeParam.attackParam + typeParam.attackBais)
    //          * qualityParam.attackParam * hero.balanceAttack
    // armor = (heroLevelAttr[level].armor * typeParam.armorParam + typeParam.armorBais)
    //         * qualityParam.armorParam * hero.balanceArmor
    var typeParam    = _cfg.heroTypeParam ? _cfg.heroTypeParam[heroType] : null;
    var qualityParam = _cfg.heroQualityParam ? _cfg.heroQualityParam[quality] : null;
    var levelAttr    = resources.getHeroLevelAttr(heroLevel);

    if (typeParam && qualityParam && levelAttr) {
        var qhp  = qualityParam.hpParam     || 1;
        var qatk = qualityParam.attackParam  || 1;
        var qarm = qualityParam.armorParam   || 1;
        var bhp  = heroConfig.balanceHp     || 1;
        var batk = heroConfig.balanceAttack  || 1;
        var barm = heroConfig.balanceArmor   || 1;

        d.hp     += (levelAttr.hp     * (typeParam.hpParam     || 1) + (typeParam.hpBais     || 0)) * qhp  * bhp;
        d.attack += (levelAttr.attack  * (typeParam.attackParam  || 1) + (typeParam.attackBais  || 0)) * qatk * batk;
        d.armor  += (levelAttr.armor   * (typeParam.armorParam   || 1) + (typeParam.armorBais   || 0)) * qarm * barm;
    } else {
        // Fallback: use heroLevelAttr directly if config missing
        if (levelAttr) {
            d.hp     += levelAttr.hp     || 0;
            d.attack += levelAttr.attack  || 0;
            d.armor  += levelAttr.armor   || 0;
        }
    }

    // ========================================================================
    // Step 6: Static stats from hero.json
    // ========================================================================
    // Speed comes directly from hero.json (flat value, no formula)
    d.speed = heroConfig.speed || 0;

    // Secondary stats from hero.json (may be undefined for low-quality heroes)
    // These are only applied if NOT already set by evolve/wakeUp/qigong/selfBreak
    var heroJsonStats = [
        'hit', 'dodge', 'block', 'damageReduce', 'armorBreak', 'controlResist',
        'skillDamage', 'criticalDamage', 'blockEffect', 'critical', 'criticalResist',
        'trueDamage', 'healPlus', 'healerPlus', 'superDamage',
        'shielderPlus', 'damageUp', 'damageDown', 'superDamageResist',
        'dragonBallWarDamageUp', 'dragonBallWarDamageDown',
        'bloodDamage', 'normalAttack', 'criticalDamageResist',
        'blockThrough', 'controlAdd', 'bloodResist', 'extraArmorBreak'
    ];
    for (var si = 0; si < heroJsonStats.length; si++) {
        var statName = heroJsonStats[si];
        if (d[statName] === 0 && heroConfig[statName] !== undefined && heroConfig[statName] !== null) {
            d[statName] = heroConfig[statName];
        }
    }

    return d;
}

// ============================================================================
// getEquipmentBonuses — Load and compute equipment stat bonuses for a hero
// ============================================================================
/**
 * Get equipment bonuses for a hero from team equip data.
 *
 * Equipment data structure (from team/teamData):
 *   { "slotId": "equipItemId", ... }
 *   slotId: 1-6 (equipment slots)
 *   equipItemId: maps to equip.json entries
 *
 * @param {string} userId     — Player UUID
 * @param {string} heroId     — Hero instance UUID
 * @returns {object} Equipment bonus values keyed by attribute name
 */
function getEquipmentBonuses(userId, heroId) {
    var bonuses = {
        hp: 0, attack: 0, armor: 0, speed: 0, extraArmor: 0,
        hpPercent: 0, armorPercent: 0, attackPercent: 0, speedPercent: 0,
        hit: 0, dodge: 0, block: 0, critical: 0, criticalResist: 0,
        criticalDamage: 0, blockEffect: 0, skillDamage: 0,
        armorBreak: 0, damageReduce: 0, controlResist: 0, trueDamage: 0,
        superDamage: 0, healPlus: 0, healerPlus: 0, shielderPlus: 0,
        damageUp: 0, damageDown: 0, superDamageResist: 0,
        bloodDamage: 0, normalAttack: 0, criticalDamageResist: 0,
        blockThrough: 0, controlAdd: 0, bloodResist: 0, extraArmorBreak: 0,
        dragonBallWarDamageUp: 0, dragonBallWarDamageDown: 0
    };

    try {
        // Try to load equipment from userJson 'equip' module
        var equipModule = db.getJsonModule(userId, 'equip');
        if (!equipModule) return bonuses;

        // equipModule may store per-hero equipment data
        // Format: { "hero-uuid": { "slotId": "equipItemId", ... } }
        // OR: { "hero-uuid": { "equip": { "slotId": "equipItemId", ... } } }
        var heroEquipData = equipModule[heroId] || equipModule[String(heroId)];
        if (!heroEquipData) return bonuses;

        // Navigate to the actual equip object
        var equipSlots = heroEquipData;
        if (heroEquipData.equip) {
            equipSlots = heroEquipData.equip;
        }

        // Also try loading from team data
        if (!equipSlots || Object.keys(equipSlots).length === 0) {
            var teams = db.getTeams(userId);
            if (teams) {
                for (var ti = 0; ti < teams.length; ti++) {
                    var team = teams[ti];
                    var teamData = {};
                    if (typeof team.teamData === 'string') {
                        try { teamData = JSON.parse(team.teamData); } catch(e) { continue; }
                    } else if (typeof team.teamData === 'object') {
                        teamData = team.teamData;
                    }
                    // Check if hero is in this team
                    for (var pos in teamData) {
                        if (teamData[pos] && teamData[pos].equip && pos === heroId) {
                            equipSlots = teamData[pos].equip;
                            break;
                        }
                    }
                    if (equipSlots && Object.keys(equipSlots).length > 0) break;
                }
            }
        }

        if (!equipSlots || !_cfg.equip) return bonuses;

        // Process each equipped item
        for (var slot in equipSlots) {
            var equipItemId = String(equipSlots[slot]);
            var equipData = _cfg.equip[equipItemId];
            if (!equipData) continue;

            // Add flat stat bonuses
            var flatStats = ['hp', 'attack', 'armor', 'speed', 'extraArmor'];
            for (var fi = 0; fi < flatStats.length; fi++) {
                bonuses[flatStats[fi]] += (equipData[flatStats[fi]] || 0);
            }

            // Add percent stat bonuses
            var pctStats = ['hpPercent', 'armorPercent', 'attackPercent', 'speedPercent',
                            'hit', 'dodge', 'block', 'critical', 'criticalResist',
                            'criticalDamage', 'blockEffect', 'skillDamage',
                            'armorBreak', 'damageReduce', 'controlResist', 'trueDamage',
                            'superDamage', 'healPlus', 'healerPlus', 'shielderPlus',
                            'damageUp', 'damageDown', 'superDamageResist',
                            'bloodDamage', 'normalAttack', 'criticalDamageResist',
                            'blockThrough', 'controlAdd', 'bloodResist', 'extraArmorBreak'];
            for (var pi = 0; pi < pctStats.length; pi++) {
                bonuses[pctStats[pi]] += (equipData[pctStats[pi]] || 0);
            }
        }
    } catch (err) {
        console.error('[hero:getAttrs] Error loading equipment bonuses:', err);
    }

    return bonuses;
}

// ============================================================================
// getLevelAbilityBonuses — Get secondary stat bonuses from levelAbility files
// ============================================================================
/**
 * Level ability provides per-level secondary stats (hit, dodge, block, critical, etc.)
 * based on heroType and hero level.
 *
 * The levelAbility data includes hp/attack/armor/extraArmor as well, but these
 * are NOT added here (they come from heroLevelAttr via makeHeroBasicAttr).
 * Only secondary stats (hit, dodge, block, etc.) are added.
 *
 * @param {string} heroType   — Hero type (body, critical, etc.)
 * @param {number} heroLevel  — Current hero level
 * @returns {object} Secondary stat bonuses keyed by attribute name
 */
function getLevelAbilityBonuses(heroType, heroLevel) {
    var bonuses = {};

    var laData = getLevelAbilityData(heroType);
    if (!laData) return bonuses;

    var levelEntry = laData[String(heroLevel)];
    if (!levelEntry) return bonuses;

    // Secondary stats from levelAbility (NOT hp/attack/armor/extraArmor — those come from heroLevelAttr)
    var secondaryNames = [
        'hit', 'dodge', 'block', 'blockEffect',
        'skillDamage', 'critical', 'criticalResist',
        'criticalDamage', 'armorBreak', 'damageReduce',
        'controlResist', 'trueDamage', 'superDamage',
        'healPlus', 'healerPlus', 'shielderPlus',
        'damageUp', 'damageDown', 'superDamageResist',
        'blockThrough', 'criticalDamageResist',
        'bloodDamage', 'normalAttack', 'controlAdd',
        'bloodResist', 'extraArmorBreak',
        'dragonBallWarDamageUp', 'dragonBallWarDamageDown'
    ];

    for (var i = 0; i < secondaryNames.length; i++) {
        var name = secondaryNames[i];
        if (levelEntry[name] !== undefined && levelEntry[name] !== 0) {
            bonuses[name] = levelEntry[name];
        }
    }

    return bonuses;
}

// ============================================================================
// getPassiveSkillBonuses — Get bonuses from passive skills (makeHeroPassiveSkillAttr equivalent)
// ============================================================================
/**
 * Recreates the client's makeHeroPassiveSkillAttr logic on the server.
 *
 * Sources:
 * 1. heroEvolve.json → skillPassive{1-3}ID + skillPassive{1-3}Level (based on evolveLevel)
 * 2. hero.json → potential{1-3} IDs (always level 1)
 * 3. hero.json → redPassive{1-3} + redPassiveLevel{1-3} (if red awakening enabled)
 * 4. skillOutBattle.json → attribute bonuses per skill per level
 *
 * @param {number} heroDisplayId  — Hero template ID
 * @param {number} evolveLevel    — Current evolve level
 * @param {object} heroConfig     — Hero entry from hero.json
 * @returns {object} Passive skill bonus values keyed by attribute name
 */
function getPassiveSkillBonuses(heroDisplayId, evolveLevel, heroConfig) {
    var bonuses = {};
    var skillData = _cfg.skillOutBattle;
    if (!skillData) return bonuses;

    // Helper: get skill bonuses from skillOutBattle.json
    function addSkillBonuses(skillId, skillLevel) {
        if (!skillId || !skillLevel) return;
        skillId = String(skillId);
        var entry = skillData[skillId];
        if (!entry) return;

        var skillEntries = Array.isArray(entry) ? entry : [entry];
        var matched = null;

        for (var i = 0; i < skillEntries.length; i++) {
            if (skillEntries[i].level === skillLevel) {
                matched = skillEntries[i];
                break;
            }
        }
        if (!matched && skillEntries.length > 0) {
            matched = skillEntries[skillEntries.length - 1]; // fallback to highest
        }
        if (!matched) return;

        // Add all attribute bonuses from this skill
        var allBonusNames = [
            'hp', 'attack', 'armor', 'speed', 'extraArmor',
            'hit', 'dodge', 'block', 'blockEffect',
            'skillDamage', 'critical', 'criticalResist',
            'criticalDamage', 'armorBreak', 'damageReduce',
            'controlResist', 'trueDamage', 'superDamage',
            'healPlus', 'healerPlus', 'shielderPlus',
            'damageUp', 'damageDown', 'superDamageResist',
            'bloodDamage', 'normalAttack', 'criticalDamageResist',
            'blockThrough', 'controlAdd', 'bloodResist', 'extraArmorBreak',
            'hpPercent', 'armorPercent', 'attackPercent', 'speedPercent',
            'dragonBallWarDamageUp', 'dragonBallWarDamageDown'
        ];

        for (var bi = 0; bi < allBonusNames.length; bi++) {
            var bName = allBonusNames[bi];
            if (matched[bName] !== undefined && matched[bName] !== 0) {
                bonuses[bName] = (bonuses[bName] || 0) + matched[bName];
            }
        }
    }

    // --- Source 1: Evolve passive skills (skillPassive1-3) ---
    var evolveData = _cfg.heroEvolve ? _cfg.heroEvolve[String(heroDisplayId)] : null;
    if (evolveData) {
        var evolveList = Array.isArray(evolveData) ? evolveData : [evolveData];
        var currentEvolveEntry = null;

        // Find the evolve entry matching current evolveLevel
        for (var ei = 0; ei < evolveList.length; ei++) {
            if (evolveList[ei].level === evolveLevel) {
                currentEvolveEntry = evolveList[ei];
                break;
            }
        }

        if (currentEvolveEntry) {
            for (var sp = 1; sp <= 3; sp++) {
                var spId = currentEvolveEntry['skillPassive' + sp + 'ID'];
                var spLvl = currentEvolveEntry['skillPassive' + sp + 'Level'];
                addSkillBonuses(spId, spLvl);
            }
        }
    }

    // --- Source 2: Hero potential skills (potential1-3, always level 1) ---
    for (var p = 1; p <= 3; p++) {
        var potentialId = heroConfig['potential' + p];
        if (potentialId) {
            addSkillBonuses(potentialId, 1);
        }
    }

    // --- Source 3: Red awakening passive skills (redPassive1-3 + redPassiveLevel1-3) ---
    for (var rp = 1; rp <= 3; rp++) {
        var rpId   = heroConfig['redPassive' + rp];
        var rpLvl  = heroConfig['redPassiveLevel' + rp];
        if (rpId && rpLvl) {
            addSkillBonuses(rpId, rpLvl);
        }
    }

    return bonuses;
}

// ============================================================================
// calculatePower — Server-side combat power calculation
// ============================================================================
/**
 * Calculate combat power (ID 21) for a hero.
 *
 * Power is calculated ENTIRELY server-side using heroPower.json coefficients.
 * The client NEVER calculates power — it reads _id==21 from the response.
 *
 * TODO: The exact formula needs verification against live server data.
 * Current best-guess implementation:
 *   power = floor(balancePower * qualityPara * Σ(attr * powerParam))
 *
 * Verified data points (basic getAttrs, no evolve/genki/guild tech):
 *   Hero 1320 (critical, lv1, talent=0.4, no equip): power=4005
 *   Hero 1205 (critical, lv3, talent=0.4, with equip): power=16743
 *   Hero 1309 (body, lv3, talent=0.4, with equip):   power=12581
 *   Hero 1206 (strength, lv3, talent=0.32, w/ equip): power=12639
 *   Hero 1320 (critical, lv1, talent=0.26, no equip):  power=2478
 *   Hero ???  (body, lv1, talent=0.28, no equip):      power=1364
 *
 * @param {string} heroType      — Hero type (critical, body, etc.)
 * @param {number} balancePower  — Hero's balancePower from hero.json
 * @param {string} quality       — Hero's quality (white, green, blue, purple, etc.)
 * @param {object} totalAttrs    — Final computed _attrs values keyed by name
 * @returns {number} Calculated combat power (floored integer)
 */
function calculatePower(heroType, balancePower, quality, totalAttrs) {
    var powerEntries = _cfg._heroPowerByType[heroType];
    if (!powerEntries || powerEntries.length === 0) {
        // Fallback: simple sum if no power config for this type
        var fallbackSum = 0;
        fallbackSum += (totalAttrs.hp     || 0);
        fallbackSum += (totalAttrs.attack || 0);
        fallbackSum += (totalAttrs.armor  || 0);
        fallbackSum += (totalAttrs.speed  || 0);
        return Math.floor(fallbackSum * (balancePower || 1));
    }

    var qualityPara = _cfg._qualityPowerPara[quality] || 0.2;
    var weightedSum = 0;

    for (var pi = 0; pi < powerEntries.length; pi++) {
        var pe = powerEntries[pi];
        var attrValue = totalAttrs[pe.attName];
        if (attrValue === undefined || attrValue === 0) continue;

        var contribution = attrValue * (pe.powerParam || 0);

        // If powerExtraParam exists (armor, extraArmor), apply as additional multiplier
        if (pe.powerExtraParam !== undefined) {
            contribution += attrValue * (pe.powerExtraParam || 0);
        }

        weightedSum += contribution;
    }

    // Apply balancePower and quality scaling
    var power = Math.floor(weightedSum * (balancePower || 1) * qualityPara);

    return power;
}

// ============================================================================
// buildAttrItems — Convert attribute object to _items format for response
// ============================================================================
/**
 * Convert a flat attribute object to the _items format expected by the client.
 *
 * @param {object} attrs     — Attribute values keyed by name (e.g. {hp: 396.8, attack: 165})
 * @param {boolean} isTotal  — If true, include IDs 16-22 (energy, percent, power, orghp)
 * @returns {object} _items object with string-number keys
 */
function buildAttrItems(attrs, isTotal) {
    var items = {};

    // Base attribute IDs (0-15) — present in both _baseAttrs and _attrs
    var baseIds = [
        ATTR.HP, ATTR.ATTACK, ATTR.ARMOR, ATTR.SPEED,
        ATTR.HIT, ATTR.DODGE, ATTR.BLOCK, ATTR.BLOCK_EFFECT,
        ATTR.SKILL_DAMAGE, ATTR.CRITICAL, ATTR.CRITICAL_RESIST,
        ATTR.CRITICAL_DAMAGE, ATTR.ARMOR_BREAK, ATTR.DAMAGE_REDUCE,
        ATTR.CONTROL_RESIST, ATTR.TRUE_DAMAGE
    ];

    // Extended attribute IDs (23-41) — present in both _baseAttrs and _attrs
    var extendedIds = [
        ATTR.SUPER_DAMAGE, ATTR.HEAL_PLUS, ATTR.HEALER_PLUS, ATTR.EXTRA_ARMOR,
        ATTR.SHIELDER_PLUS, ATTR.DAMAGE_UP, ATTR.DAMAGE_DOWN, ATTR.TALENT,
        ATTR.SUPER_DAMAGE_RESIST, ATTR.DRAGON_BALL_WAR_DMG_UP, ATTR.DRAGON_BALL_WAR_DMG_DOWN,
        ATTR.BLOOD_DAMAGE, ATTR.NORMAL_ATTACK, ATTR.CRITICAL_DAMAGE_RESIST,
        ATTR.BLOCK_THROUGH, ATTR.CONTROL_ADD, ATTR.BLOOD_RESIST, ATTR.EXTRA_ARMOR_BREAK,
        ATTR.ENERGY_MAX
    ];

    // ID → attribute name reverse mapping
    var idToName = {};
    for (var name in ATTR_NAME_TO_ID) {
        idToName[ATTR_NAME_TO_ID[name]] = name;
    }

    // Build items for base IDs (0-15)
    for (var bi = 0; bi < baseIds.length; bi++) {
        var id = baseIds[bi];
        var name = idToName[id];
        var value = attrs[name];
        if (value !== undefined) {
            items[String(id)] = { _id: id, _num: value };
        }
    }

    if (isTotal) {
        // Add IDs 16-22 (only in _attrs)
        items[String(ATTR.ENERGY)]         = { _id: ATTR.ENERGY,         _num: attrs.energy || 50 };
        items[String(ATTR.HP_PERCENT)]     = { _id: ATTR.HP_PERCENT,     _num: attrs.hpPercent || 0 };
        items[String(ATTR.ARMOR_PERCENT)]  = { _id: ATTR.ARMOR_PERCENT,  _num: attrs.armorPercent || 0 };
        items[String(ATTR.ATTACK_PERCENT)] = { _id: ATTR.ATTACK_PERCENT, _num: attrs.attackPercent || 0 };
        items[String(ATTR.SPEED_PERCENT)]  = { _id: ATTR.SPEED_PERCENT,  _num: attrs.speedPercent || 0 };
        items[String(ATTR.POWER)]          = { _id: ATTR.POWER,          _num: attrs.power || 0 };
        items[String(ATTR.ORGHP)]          = { _id: ATTR.ORGHP,          _num: attrs.orghp || 0 };
    }

    // Build items for extended IDs (23-41)
    for (var ei = 0; ei < extendedIds.length; ei++) {
        var id = extendedIds[ei];
        var name = idToName[id];
        var value = attrs[name];
        if (value !== undefined) {
            items[String(id)] = { _id: id, _num: value };
        }
    }

    return items;
}

// ============================================================================
// computeHeroAttrs — Main computation for a single hero
// ============================================================================
/**
 * Compute both _baseAttrs and _attrs for a single hero instance.
 *
 * @param {string} userId — Player UUID
 * @param {string} heroId — Hero instance UUID
 * @returns {object} { baseAttrs: {name: value}, totalAttrs: {name: value} }
 */
function computeHeroAttrs(userId, heroId) {
    // --- Load hero from DB ---
    var heroRow = db.dbGet(
        'SELECT * FROM heroes WHERE id = ? AND userId = ?',
        [heroId, userId]
    );
    if (!heroRow) {
        console.warn('[hero:getAttrs] Hero not found:', heroId, 'userId:', userId);
        return null;
    }

    var heroDisplayId = heroRow.heroDisplayId;
    if (!heroDisplayId) {
        console.warn('[hero:getAttrs] Hero missing displayId:', heroId);
        return null;
    }

    var heroStar = heroRow.heroStar || 0;

    // Parse JSON fields from DB
    var heroBaseAttr = {};
    var breakInfo = {};
    var qigongInfo = {};

    try {
        if (heroRow.heroBaseAttr) {
            heroBaseAttr = typeof heroRow.heroBaseAttr === 'string'
                ? JSON.parse(heroRow.heroBaseAttr)
                : heroRow.heroBaseAttr;
        }
    } catch (e) { console.warn('[hero:getAttrs] Failed to parse heroBaseAttr:', e); }

    try {
        if (heroRow.breakInfo) {
            breakInfo = typeof heroRow.breakInfo === 'string'
                ? JSON.parse(heroRow.breakInfo)
                : heroRow.breakInfo;
        }
    } catch (e) { console.warn('[hero:getAttrs] Failed to parse breakInfo:', e); }

    try {
        if (heroRow.qigong) {
            qigongInfo = typeof heroRow.qigong === 'string'
                ? JSON.parse(heroRow.qigong)
                : heroRow.qigong;
        }
    } catch (e) { console.warn('[hero:getAttrs] Failed to parse qigong:', e); }

    // Extract hero state from heroBaseAttr
    var heroLevel    = heroBaseAttr._level       || 1;
    var evolveLevel  = heroBaseAttr._evolveLevel || 0;

    // --- Load hero config from hero.json ---
    var heroConfig = resources.getHero(heroDisplayId);
    if (!heroConfig) {
        console.warn('[hero:getAttrs] Hero config not found for displayId:', heroDisplayId);
        return null;
    }

    // ========================================================================
    // PHASE 1: Calculate _baseAttrs
    // ========================================================================
    var baseAttrs = makeHeroBasicAttr(
        heroDisplayId, heroLevel, evolveLevel, heroStar,
        heroConfig, breakInfo, qigongInfo
    );

    // ========================================================================
    // PHASE 2: Calculate _attrs (start from baseAttrs + apply bonuses)
    // ========================================================================
    var totalAttrs = {};
    // Deep copy all base attributes
    for (var key in baseAttrs) {
        totalAttrs[key] = baseAttrs[key];
    }

    // --- Apply Talent Multiplication ---
    // Talent multiplies HP and Attack ONLY (NOT armor, speed, or other stats)
    totalAttrs.hp     = baseAttrs.hp     * baseAttrs.talent;
    totalAttrs.attack = baseAttrs.attack * baseAttrs.talent;

    // --- Add Equipment Bonuses ---
    var equipBonuses = getEquipmentBonuses(userId, heroId);
    for (var ebKey in equipBonuses) {
        if (equipBonuses[ebKey] !== 0) {
            totalAttrs[ebKey] = (totalAttrs[ebKey] || 0) + equipBonuses[ebKey];
        }
    }

    // --- Add LevelAbility Bonuses (secondary stats from levelAbility{Type}.json) ---
    var laBonuses = getLevelAbilityBonuses(heroConfig.heroType, heroLevel);
    for (var laKey in laBonuses) {
        if (laBonuses[laKey] !== 0) {
            totalAttrs[laKey] = (totalAttrs[laKey] || 0) + laBonuses[laKey];
        }
    }

    // --- Add Passive Skill Bonuses (makeHeroPassiveSkillAttr equivalent) ---
    var passiveBonuses = getPassiveSkillBonuses(heroDisplayId, evolveLevel, heroConfig);
    for (var psKey in passiveBonuses) {
        if (passiveBonuses[psKey] !== 0) {
            totalAttrs[psKey] = (totalAttrs[psKey] || 0) + passiveBonuses[psKey];
        }
    }

    // --- Percent stat defaults (IDs 17-20) ---
    totalAttrs.hpPercent     = totalAttrs.hpPercent     || 0;
    totalAttrs.armorPercent  = totalAttrs.armorPercent  || 0;
    totalAttrs.attackPercent = totalAttrs.attackPercent || 0;
    totalAttrs.speedPercent  = totalAttrs.speedPercent  || 0;

    // --- Special computed attributes ---
    totalAttrs.energy   = 50;                    // ID 16: ALWAYS 50
    totalAttrs.energyMax = baseAttrs.energyMax;   // ID 41: from hero.json (usually 100)

    // --- ORGHP: copy of final HP (ID 22) ---
    totalAttrs.orghp = totalAttrs.hp;

    // --- Power calculation (ID 21) ---
    totalAttrs.power = calculatePower(
        heroConfig.heroType,
        heroConfig.balancePower,
        heroConfig.quality,
        totalAttrs
    );

    return {
        baseAttrs: baseAttrs,
        totalAttrs: totalAttrs
    };
}

// ============================================================================
// Handler Entry Point
// ============================================================================
module.exports = {
    /**
     * Execute getAttrs handler.
     *
     * @param {object} data   — Request payload: {type, action, userId, heros[], version}
     * @param {object} socket — Socket.IO socket reference
     * @param {object} ctx    — Context: {db, buildResponse, buildErrorResponse, ...}
     * @returns {Promise} Resolves with buildResponse result
     */
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            try {
                var userId = data.userId;
                if (!userId) {
                    return resolve(ctx.buildErrorResponse(1));
                }

                var heroIds = data.heros;
                if (!heroIds || !Array.isArray(heroIds) || heroIds.length === 0) {
                    console.warn('[hero:getAttrs] Empty or invalid heros array');
                    return resolve(ctx.buildErrorResponse(1));
                }

                // Lazy-load all JSON configs on first request
                ensureConfigsLoaded();

                var responseAttrs = [];
                var responseBaseAttrs = [];

                // Process each hero
                for (var i = 0; i < heroIds.length; i++) {
                    var heroId = heroIds[i];
                    var result = computeHeroAttrs(userId, heroId);

                    if (!result) {
                        // Hero not found — return empty items
                        responseAttrs.push({ _items: {} });
                        responseBaseAttrs.push({ _items: {} });
                        continue;
                    }

                    // Build _baseAttrs response (IDs 0-15, 23-41)
                    responseBaseAttrs.push({
                        _items: buildAttrItems(result.baseAttrs, false)
                    });

                    // Build _attrs response (IDs 0-41)
                    responseAttrs.push({
                        _items: buildAttrItems(result.totalAttrs, true)
                    });
                }

                // Build and send response
                resolve(ctx.buildResponse({
                    type:    data.type    || 'hero',
                    action:  data.action  || 'getAttrs',
                    userId:  userId,
                    heros:   heroIds,
                    version: data.version || '1.0',
                    _attrs:      responseAttrs,
                    _baseAttrs:  responseBaseAttrs
                }));

            } catch (err) {
                console.error('[hero:getAttrs] Error:', err.stack || err);
                resolve(ctx.buildErrorResponse(1));
            }
        });
    }
};
