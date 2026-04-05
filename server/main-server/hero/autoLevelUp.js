/**
 * ============================================================
 * AUTOLEVELUP.JS - Mock Handler for hero.autoLevelUp
 * ============================================================
 *
 * Purpose: Processes hero level-up requests (single or auto/batch).
 * Called when player taps "Level Up" (times=1) or "Auto Level Up" (times=100).
 *
 * HAR Reference: main-server(level 1 sampai 10).har (26 entries)
 * Client Flow (from main.min.js HeroMainInfo.doHeroLevelUp):
 *   1. Client checks getHeroNextState() for pre-conditions:
 *      - TYPE_FULL → hero is at absolute max, no upgrade possible
 *      - TYPE_WAKEUP → hero needs awakening before further levels
 *      - TYPE_EVOLVE → hero needs evolve before next level
 *      - TYPE_WAITSTARUP → hero needs star up before evolve
 *      - TYPE_LEVEL → normal level up, cost items
 *   2. Client checks items: levelUpExpEnough && levelUpGoldEnough
 *   3. Client sends: ts.processHandler({
 *        type:"hero", action:"autoLevelUp",
 *        userId:"<uuid>", heroId:"<hero-uuid>",
 *        version:"1.0", times: <1|100>,
 *        _totalAttr: { _items: { "0":{_id:0,_num:HP}, ... } },
 *        _baseAttr: { _items: { "0":{_id:0,_num:baseHP}, ... } },
 *        _totalCost: { _wakeUp:{_items:{}}, _earring:{_items:{}},
 *                      _levelUp:{_items:{...}}, _evolve:{_items:{}},
 *                      _skill:{_items:{}}, _qigong:{_items:{}},
 *                      _heroBreak:{_items:{}} }
 *      }, successCb, errorCb)
 *   4. On response, client calls:
 *      - HerosManager.getInstance().levelUpCallBack(n)
 *      - ItemsCommonSingleton.getInstance().resetTtemsCallBack(n)
 *      - EquipInfoManager... (if _equip present)
 *
 * Response Schema (before buildResponse wrapping):
 *   {
 *     type: "hero", action: "autoLevelUp", userId, heroId, version,
 *     _heroLevel: <new_level>,
 *     _totalAttr: { _items: { "0":{_id:0,_num:newHP}, ... } },
 *     _baseAttr: { _items: { "0":{_id:0,_num:newBaseHP}, ... } },
 *     _totalCost: { _wakeUp:{_items:{}}, _earring:{_items:{}},
 *                   _levelUp:{_items:{"102":{_id:102,_num:totalGold},"131":{_id:131,_num:totalExp}}},
 *                   _evolve:{_items:{}}, ... },
 *     _changeInfo: { _items: { "102":{_id:102,_num:NEW_TOTAL_GOLD},
 *                                 "131":{_id:131,_num:NEW_TOTAL_EXP} } },
 *     _linkHeroesTotalAttr: {},
 *     _linkHeroesBasicAttr: {}
 *   }
 *
 * CRITICAL: _changeInfo._items._num = NEW TOTAL (not delta!)
 *           Client computes display delta: newTotal - oldTotal
 *
 * Config files loaded from /resource/json/:
 *   heroLevelUpWhite.json     — level cost table for white quality (evolveLevel 0)
 *   heroLevelUpGreen.json     — level cost table for green quality (evolveLevel 0)
 *   heroLevelUpBlue.json      — level cost table for blue quality (evolveLevel 0)
 *   heroLevelUpPurple.json    — level cost table for purple quality (evolveLevel 0)
 *   heroLevelUpOrange.json    — level cost table for orange quality (evolveLevel 0)
 *   heroLevelUpFlickerOrange.json — level cost table for flickerOrange quality
 *   heroLevelUpSuperOrange.json   — level cost table for superOrange quality
 *   heroLevelUpMul.json       — evolve multiplier per quality tier (stat scaling)
 *   heroLevelAttr.json        — base HP/ATK/DEF per level
 *   hero.json                 — hero template by displayId (quality, heroType, etc.)
 *   heroTypeParam.json        — heroType multipliers
 *   heroEvolve.json           — per-hero flat stat bonuses per evolve level
 *   heroPower.json            — combat power weights
 *   heroWakeUp.json           — awakening level cap data
 *
 * Cost Config Format (heroLevelUp*.json):
 *   Keyed by 1-indexed sequential level within the quality tier:
 *   { "1": {id:1, costID1:131, num1:<exp_capsule>, costID2:102, num2:<gold>},
 *     "2": {id:2, costID1:131, num1:..., costID2:102, num2:...}, ... }
 *
 * Quality → Config File Mapping:
 *   white → heroLevelUpWhite.json        (20 levels/tier × 10 tiers = 220 total)
 *   green → heroLevelUpGreen.json        (20 levels/tier × 10 tiers = 220 total)
 *   blue  → heroLevelUpBlue.json         (20 levels/tier × 10 tiers = 220 total)
 *   purple → heroLevelUpPurple.json      (20 levels/tier × 10 tiers = 220 total)
 *   orange → heroLevelUpOrange.json      (60 levels/tier × 5 tiers = 300 total)
 *   flickerOrange → heroLevelUpFlickerOrange.json (60 levels/tier × 6 tiers = 360 total)
 *   superOrange → heroLevelUpSuperOrange.json     (60 levels/tier × 6 tiers = 360 total)
 *
 * Author: Local SDK Bridge
 * Version: 1.0.0 - Based on HAR real server data (26 entries analyzed)
 * ============================================================
 */

(function(window) {
    'use strict';

    // ========================================================
    // 1. STYLISH LOGGER
    // ========================================================
    var LOG = {
        prefix: '\uD83C\uDFAE [HERO-AUTOLEVELUP]',
        _log: function(level, icon, message, data) {
            var timestamp = new Date().toISOString().substr(11, 12);
            var styles = {
                success: 'color: #22c55e; font-weight: bold;',
                info: 'color: #6b7280;',
                warn: 'color: #f59e0b; font-weight: bold;',
                error: 'color: #ef4444; font-weight: bold;'
            };
            var style = styles[level] || styles.info;
            var format = '%c' + this.prefix + ' ' + icon + ' [' + timestamp + '] ' + message;
            if (data !== undefined) {
                console.log(format + ' %o', style, data);
            } else {
                console.log(format, style);
            }
        },
        success: function(msg, data) { this._log('success', '\u2705', msg, data); },
        info: function(msg, data) { this._log('info', '\u2139\uFE0F', msg, data); },
        warn: function(msg, data) { this._log('warn', '\u26A0\uFE0F', msg, data); },
        error: function(msg, data) { this._log('error', '\u274C', msg, data); }
    };

    // ========================================================
    // 2. CONFIG CACHE
    // ========================================================
    var CONFIGS = {
        hero: null,
        heroLevelAttr: null,
        heroTypeParam: null,
        heroLevelUpMul: null,
        heroEvolve: null,
        heroPower: null,
        heroWakeUp: null
    };

    // Quality-specific level-up cost tables
    var LEVEL_UP_CONFIGS = {
        white: null,
        green: null,
        blue: null,
        purple: null,
        orange: null,
        flickerOrange: null,
        superOrange: null
    };

    // Quality → levels per evolve tier (from HAR data analysis)
    var LEVELS_PER_EVOLVE_TIER = {
        white: 20,
        green: 20,
        blue: 20,
        purple: 20,
        orange: 60,
        flickerOrange: 60,
        superOrange: 60
    };

    // Maximum evolveLevel per quality (from heroLevelUpMul.json)
    var MAX_EVOLVE_PER_QUALITY = {
        white: 180,         // 10 tiers × 20 = 200 levels total (but max evolve = 180)
        green: 180,
        blue: 180,
        purple: 180,
        orange: 80,         // 5 tiers × 60 = 300 levels total (max evolve = 80)
        flickerOrange: 180,
        superOrange: 180
    };

    // ========================================================
    // 3. CONFIG LOADING
    // ========================================================
    function loadJsonFile(name, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/resource/json/' + name + '.json', true);
        xhr.onload = function() {
            if (xhr.status === 200 || xhr.status === 0) {
                try {
                    CONFIGS[name] = JSON.parse(xhr.responseText);
                    LOG.info('Loaded config: ' + name);
                } catch (e) {
                    LOG.error('Parse error for config: ' + name, e.message);
                }
            } else {
                LOG.warn('Failed to load config: ' + name + ' (status ' + xhr.status + ')');
            }
            if (callback) callback();
        };
        xhr.onerror = function() {
            LOG.error('Network error loading config: ' + name);
            if (callback) callback();
        };
        xhr.send();
    }

    function loadLevelUpConfig(quality, callback) {
        var fileNames = {
            white: 'heroLevelUpWhite',
            green: 'heroLevelUpGreen',
            blue: 'heroLevelUpBlue',
            purple: 'heroLevelUpPurple',
            orange: 'heroLevelUpOrange',
            flickerOrange: 'heroLevelUpFlickerOrange',
            superOrange: 'heroLevelUpSuperOrange'
        };
        var fileName = fileNames[quality];
        if (!fileName) {
            LOG.warn('Unknown quality for levelUp config: ' + quality);
            if (callback) callback();
            return;
        }

        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/resource/json/' + fileName + '.json', true);
        xhr.onload = function() {
            if (xhr.status === 200 || xhr.status === 0) {
                try {
                    LEVEL_UP_CONFIGS[quality] = JSON.parse(xhr.responseText);
                    LOG.info('Loaded levelUp config: ' + quality + ' (' + fileName + ')');
                } catch (e) {
                    LOG.error('Parse error for levelUp config: ' + fileName, e.message);
                }
            } else {
                LOG.warn('Failed to load levelUp config: ' + fileName + ' (status ' + xhr.status + ')');
            }
            if (callback) callback();
        };
        xhr.onerror = function() {
            LOG.error('Network error loading levelUp config: ' + fileName);
            if (callback) callback();
        };
        xhr.send();
    }

    function loadAllConfigs(quality, onReady) {
        var mainConfigs = ['hero', 'heroLevelAttr', 'heroTypeParam', 'heroLevelUpMul', 'heroEvolve', 'heroPower', 'heroWakeUp'];
        var mainLoaded = 0;
        var mainTotal = mainConfigs.length;

        function checkMainDone() {
            mainLoaded++;
            if (mainLoaded >= mainTotal) {
                LOG.info('All ' + mainTotal + ' main configs loaded');
                if (quality) {
                    loadLevelUpConfig(quality, function() {
                        if (onReady) onReady();
                    });
                } else {
                    if (onReady) onReady();
                }
            }
        }

        for (var i = 0; i < mainConfigs.length; i++) {
            (function(name) {
                loadJsonFile(name, checkMainDone);
            })(mainConfigs[i]);
        }
    }

    // Pre-load all quality level-up configs
    function preloadAllLevelUpConfigs() {
        var qualities = ['white', 'green', 'blue', 'purple', 'orange', 'flickerOrange', 'superOrange'];
        for (var i = 0; i < qualities.length; i++) {
            loadLevelUpConfig(qualities[i]);
        }
    }

    // ========================================================
    // 4. LEVEL-UP COST LOOKUP
    // ========================================================
    /**
     * Gets the cost for leveling up at a given sequential level within a quality tier.
     *
     * The levelUp config is keyed by 1-indexed sequential level within the tier.
     * For orange quality with evolveLevel 0: sequential levels 1-60 are valid.
     * For purple quality with evolveLevel 0: sequential levels 1-20 are valid.
     *
     * The sequential level for hero's absolute level N within a tier is:
     *   seqLevel = ((N - 1) % levelsPerTier) + 1
     *
     * @param {string} quality - Hero quality name
     * @param {number} heroLevel - Current absolute hero level (1-based)
     * @returns {object|null} Cost entry {costID1, num1, costID2, num2} or null
     */
    function getLevelUpCost(quality, heroLevel) {
        var config = LEVEL_UP_CONFIGS[quality];
        if (!config) {
            LOG.warn('LevelUp config not loaded for quality: ' + quality);
            return null;
        }

        var levelsPerTier = LEVELS_PER_EVOLVE_TIER[quality] || 20;
        // Sequential level within current tier (1-indexed)
        var seqLevel = ((heroLevel - 1) % levelsPerTier) + 1;
        var entry = config[String(seqLevel)];

        if (!entry) {
            LOG.warn('No levelUp cost for quality=' + quality + ' heroLevel=' + heroLevel + ' seqLevel=' + seqLevel);
            return null;
        }

        return entry;
    }

    /**
     * Gets the maximum level a hero can reach at its current evolve level.
     * Max level within a tier: evolveLevel + levelsPerTier
     *
     * @param {string} quality - Hero quality name
     * @param {number} evolveLevel - Current evolve level
     * @returns {number} Maximum hero level at this evolve level
     */
    function getMaxLevelForEvolve(quality, evolveLevel) {
        var levelsPerTier = LEVELS_PER_EVOLVE_TIER[quality] || 20;
        return evolveLevel + levelsPerTier;
    }

    /**
     * Gets the absolute maximum level for a quality (all tiers maxed).
     *
     * @param {string} quality - Hero quality name
     * @returns {number} Absolute maximum level
     */
    function getAbsoluteMaxLevel(quality) {
        var maxEvolve = MAX_EVOLVE_PER_QUALITY[quality] || 180;
        var levelsPerTier = LEVELS_PER_EVOLVE_TIER[quality] || 20;
        return maxEvolve + levelsPerTier;
    }

    /**
     * Gets the star requirement for a given evolve level.
     * From heroLevelUpMul.json: evolve levels 20, 40, 60, 80, ... require stars.
     *
     * Star requirement formula (observed from client):
     *   evolveLevel 0-19:  0 stars needed
     *   evolveLevel 20-39: star >= 1
     *   evolveLevel 40-59: star >= 2
     *   evolveLevel 60-79: star >= 3
     *   evolveLevel 80+:    star >= 4
     *
     * @param {number} evolveLevel - Target evolve level
     * @returns {number} Minimum star required
     */
    function getStarRequirement(evolveLevel) {
        if (evolveLevel <= 0) return 0;
        var tier = Math.floor(evolveLevel / 20);
        // Tier 0: evolve 0-19 → star 0
        // Tier 1: evolve 20-39 → star 1
        // Tier 2: evolve 40-59 → star 2
        // Tier 3: evolve 60-79 → star 3
        // Tier 4+: evolve 80+ → star 4
        return tier;
    }

    // ========================================================
    // 5. EVOLVE MULTIPLIER (from heroLevelUpMul.json)
    // ========================================================
    var QUALITY_TO_MUL_ID = {
        'white': '1',
        'green': '2',
        'blue': '3',
        'purple': '4',
        'orange': '5',
        'flickerOrange': '6'
    };

    function getEvolveMultiplier(quality, evolveLevel) {
        var qualityId = QUALITY_TO_MUL_ID[quality] || '1';
        var mulEntries = CONFIGS.heroLevelUpMul ? CONFIGS.heroLevelUpMul[qualityId] : null;

        if (!mulEntries || !mulEntries.length) {
            return { hpMul: 1, attackMul: 1, armorMul: 1 };
        }

        var best = mulEntries[0];
        for (var i = 0; i < mulEntries.length; i++) {
            if (mulEntries[i].evolveLevel <= evolveLevel) {
                best = mulEntries[i];
            }
        }

        return {
            hpMul: parseFloat(best.hpMul) || 1,
            attackMul: parseFloat(best.attackMul) || 1,
            armorMul: parseFloat(best.armorMul) || 1
        };
    }

    // ========================================================
    // 6. EVOLVE FLAT BONUS (from heroEvolve.json)
    // ========================================================
    function getEvolveFlatBonus(displayId, evolveLevel) {
        var entries = CONFIGS.heroEvolve ? CONFIGS.heroEvolve[displayId] : null;

        if (!entries || !entries.length) {
            return { hp: 0, attack: 0, armor: 0, speed: 0 };
        }

        var best = entries[0];
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].level <= evolveLevel) {
                best = entries[i];
            }
        }

        return {
            hp: parseInt(best.hp) || 0,
            attack: parseInt(best.attack) || 0,
            armor: parseInt(best.armor) || 0,
            speed: parseInt(best.speed) || 0
        };
    }

    // ========================================================
    // 7. COMBAT POWER CALCULATION
    // ========================================================
    function computeCombatPower(heroType, stats) {
        if (!CONFIGS.heroPower) {
            return Math.round(
                stats.hp * 1 + stats.atk * 3 + stats.def * 1.5 +
                stats.speed * 1 + stats.talent * 200
            );
        }

        var attrMap = {
            'hpPercent': stats.hp,
            'attackPercent': stats.atk,
            'armorPercent': stats.def,
            'speed': stats.speed,
            'critical': stats.talent * 100
        };

        var power = 0;
        var keys = Object.keys(CONFIGS.heroPower);
        for (var k = 0; k < keys.length; k++) {
            var entry = CONFIGS.heroPower[keys[k]];
            if (entry.heroType === heroType) {
                var val = attrMap[entry.attName];
                if (val !== undefined && val !== null) {
                    power += val * (entry.powerParam || 0);
                }
            }
        }

        return Math.round(power);
    }

    // ========================================================
    // 8. COMPUTE HERO STATS
    // ========================================================
    function computeHeroStats(heroData) {
        var displayId = String(heroData._heroDisplayId);
        var level = (heroData._heroBaseAttr && heroData._heroBaseAttr._level) || 1;
        var evolveLevel = (heroData._heroBaseAttr && heroData._heroBaseAttr._evolveLevel) || 0;

        var heroConfig = CONFIGS.hero ? CONFIGS.hero[displayId] : null;
        if (!heroConfig) {
            LOG.warn('Hero template not found for displayId: ' + displayId);
            return getDefaultStats(level);
        }

        var heroType = heroConfig.heroType || 'strength';
        var talent = parseFloat(heroConfig.talent) || 0.26;
        var speed = parseInt(heroConfig.speed) || 360;
        var quality = heroConfig.quality || 'white';
        var balanceHp = parseFloat(heroConfig.balanceHp) || 1;
        var balanceAttack = parseFloat(heroConfig.balanceAttack) || 1;
        var balanceArmor = parseFloat(heroConfig.balanceArmor) || 1;
        var balancePower = parseFloat(heroConfig.balancePower) || 1;

        var levelAttr = CONFIGS.heroLevelAttr ? CONFIGS.heroLevelAttr[String(level)] : null;
        if (!levelAttr) {
            levelAttr = CONFIGS.heroLevelAttr ? CONFIGS.heroLevelAttr['1'] : { hp: 1240, attack: 125, armor: 205 };
            LOG.warn('Level attr not found for level ' + level + ', using level 1');
        }

        var baseHp = parseFloat(levelAttr.hp) || 1240;
        var baseAtk = parseFloat(levelAttr.attack) || 125;
        var baseDef = parseFloat(levelAttr.armor) || 205;

        var typeParam = CONFIGS.heroTypeParam ? CONFIGS.heroTypeParam[heroType] : null;
        if (!typeParam) {
            typeParam = { hpParam: 1, attackParam: 1, armorParam: 1, hpBais: 0, attackBais: 0, armorBais: 0 };
            LOG.warn('Type param not found for heroType: ' + heroType);
        }

        var rawHp = baseHp * (typeParam.hpParam || 1) * balanceHp * talent + (typeParam.hpBais || 0);
        var rawAtk = baseAtk * (typeParam.attackParam || 1) * balanceAttack * talent + (typeParam.attackBais || 0);
        var rawDef = baseDef * (typeParam.armorParam || 1) * balanceArmor * talent + (typeParam.armorBais || 0);

        var evolveMul = getEvolveMultiplier(quality, evolveLevel);
        var finalHp = rawHp * evolveMul.hpMul;
        var finalAtk = rawAtk * evolveMul.attackMul;
        var finalDef = rawDef * evolveMul.armorMul;

        var evolveFlat = getEvolveFlatBonus(displayId, evolveLevel);
        finalHp += evolveFlat.hp;
        finalAtk += evolveFlat.attack;
        finalDef += evolveFlat.armor;
        speed += evolveFlat.speed;

        var statsForPower = {
            hp: finalHp, atk: finalAtk, def: finalDef, speed: speed, talent: talent
        };
        var power = computeCombatPower(heroType, statsForPower);

        var critRate = parseFloat((talent * 1.5).toFixed(2));

        return {
            hp: parseFloat(finalHp.toFixed(1)),
            atk: parseFloat(finalAtk.toFixed(1)),
            def: parseFloat(finalDef.toFixed(1)),
            speed: speed,
            power: Math.round(power * balancePower),
            crit: critRate,
            baseHp: baseHp,
            baseAtk: baseAtk,
            baseDef: baseDef
        };
    }

    function getDefaultStats(level) {
        var levelAttr = CONFIGS.heroLevelAttr ? CONFIGS.heroLevelAttr[String(level)] : null;
        var hp = levelAttr ? parseFloat(levelAttr.hp) : 1240;
        var atk = levelAttr ? parseFloat(levelAttr.attack) : 125;
        var def = levelAttr ? parseFloat(levelAttr.armor) : 205;

        return {
            hp: hp, atk: atk, def: def, speed: 360,
            power: Math.round(hp + atk * 3 + def * 1.5 + 360),
            crit: 0.39, baseHp: hp, baseAtk: atk, baseDef: def
        };
    }

    // ========================================================
    // 9. BUILD ATTR _items OBJECTS
    // ========================================================

    /**
     * Builds _totalAttr._items (42 attributes: IDs 0-41)
     * Same structure as hero.getAttrs _attrs._items
     */
    function buildTotalAttrItems(stats) {
        var items = {};

        items['0'] = { _id: 0, _num: stats.hp };
        items['1'] = { _id: 1, _num: stats.atk };
        items['2'] = { _id: 2, _num: stats.def };
        items['3'] = { _id: 3, _num: stats.speed };
        for (var i = 4; i <= 15; i++) {
            items[String(i)] = { _id: i, _num: 0 };
        }
        items['16'] = { _id: 16, _num: 50 };
        for (var j = 17; j <= 20; j++) {
            items[String(j)] = { _id: j, _num: 0 };
        }
        items['21'] = { _id: 21, _num: stats.power };
        items['22'] = { _id: 22, _num: stats.hp };
        for (var k = 23; k <= 29; k++) {
            items[String(k)] = { _id: k, _num: 0 };
        }
        items['30'] = { _id: 30, _num: stats.crit };
        for (var m = 31; m <= 40; m++) {
            items[String(m)] = { _id: m, _num: 0 };
        }
        items['41'] = { _id: 41, _num: 100 };

        return items;
    }

    /**
     * Builds _baseAttr._items (35 attributes: IDs 0-15, 23-41)
     * NO IDs 16-22 in _baseAttrs (those are computed-only stats)
     */
    function buildBaseAttrItems(stats) {
        var items = {};

        items['0'] = { _id: 0, _num: stats.baseHp };
        items['1'] = { _id: 1, _num: stats.baseAtk };
        items['2'] = { _id: 2, _num: stats.baseDef };
        items['3'] = { _id: 3, _num: stats.speed };
        for (var i = 4; i <= 15; i++) {
            items[String(i)] = { _id: i, _num: 0 };
        }
        // NO ids 16-22 in _baseAttrs
        for (var j = 23; j <= 29; j++) {
            items[String(j)] = { _id: j, _num: 0 };
        }
        items['30'] = { _id: 30, _num: stats.crit };
        for (var k = 31; k <= 40; k++) {
            items[String(k)] = { _id: k, _num: 0 };
        }
        items['41'] = { _id: 41, _num: 100 };

        return items;
    }

    // ========================================================
    // 10. PLAYER DATA HELPERS
    // ========================================================

    /**
     * Loads player data from localStorage.
     * Matches entergame.js loadOrCreatePlayerData pattern.
     */
    function loadPlayerData(userId) {
        if (!userId) return null;
        try {
            var key = 'dragonball_player_data_' + userId;
            var raw = localStorage.getItem(key);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            LOG.error('Failed to load player data for userId: ' + userId, e.message);
        }
        return null;
    }

    /**
     * Saves updated player data to localStorage.
     */
    function savePlayerData(userId, playerData) {
        if (!userId || !playerData) return;
        try {
            var key = 'dragonball_player_data_' + userId;
            localStorage.setItem(key, JSON.stringify(playerData));
        } catch (e) {
            LOG.warn('Failed to save player data for userId: ' + userId, e.message);
        }
    }

    /**
     * Gets current item count from player items.
     * Items stored as: playerData.items["102"]._num or playerData.items[102]._num
     */
    function getItemCount(playerData, itemId) {
        if (!playerData || !playerData.items) return 0;
        var item = playerData.items[String(itemId)] || playerData.items[itemId];
        return item ? (parseInt(item._num) || 0) : 0;
    }

    /**
     * Sets item count in player items.
     */
    function setItemCount(playerData, itemId, newCount) {
        if (!playerData || !playerData.items) return;
        var idStr = String(itemId);
        if (!playerData.items[idStr]) {
            playerData.items[idStr] = { _id: itemId, _num: 0 };
        }
        playerData.items[idStr]._num = newCount;

        // Also sync to user._attribute for entergame consistency
        if (playerData.user && playerData.user._attribute && playerData.user._attribute._items) {
            if (!playerData.user._attribute._items[idStr]) {
                playerData.user._attribute._items[idStr] = { _id: itemId, _num: 0 };
            }
            playerData.user._attribute._items[idStr]._num = newCount;
        }
    }

    // ========================================================
    // 11. MAIN HANDLER: hero.autoLevelUp
    // ========================================================
    /**
     * Handler for hero.autoLevelUp
     * Registered via window.MAIN_SERVER_HANDLERS
     *
     * @param {object} request - Client request
     * @param {object} playerData - Current player data from localStorage
     * @returns {object} Response data (auto-wrapped by buildResponse in entergame.js)
     *
     * Logic:
     *   1. Validate hero exists and get its data
     *   2. Determine hero quality from hero.json (by displayId)
     *   3. Calculate current player gold (102) and exp capsules (131)
     *   4. For each requested level up:
     *      a. Check max level constraint (tier boundary)
     *      b. Get cost from levelUp config
     *      c. Check if player has enough resources
     *      d. Deduct resources
     *      e. Increment hero level
     *      f. Accumulate totalCost
     *   5. Update hero level in playerData
     *   6. Save playerData to localStorage
     *   7. Return new level, totalAttr, baseAttr, totalCost, changeInfo
     */
    function handleAutoLevelUp(request, playerData) {
        LOG.info('Handling hero.autoLevelUp');

        var heroId = request.heroId;
        var userId = request.userId;
        var times = parseInt(request.times) || 1;
        var version = request.version || '1.0';

        LOG.info('UserId: ' + userId);
        LOG.info('HeroId: ' + heroId);
        LOG.info('Times: ' + times);

        // --- 1. Find hero in playerData ---
        var heroData = null;
        if (playerData && playerData.heros && playerData.heros[heroId]) {
            heroData = playerData.heros[heroId];
        }

        if (!heroData) {
            LOG.error('Hero not found in playerData: ' + heroId);
            // Return current state unchanged
            return {
                type: 'hero',
                action: 'autoLevelUp',
                userId: userId,
                heroId: heroId,
                version: version,
                _heroLevel: 1,
                _totalAttr: { _items: request._totalAttr ? request._totalAttr._items : {} },
                _baseAttr: { _items: request._baseAttr ? request._baseAttr._items : {} },
                _totalCost: request._totalCost || buildEmptyTotalCost(),
                _changeInfo: { _items: {} },
                _linkHeroesTotalAttr: {},
                _linkHeroesBasicAttr: {}
            };
        }

        var displayId = String(heroData._heroDisplayId);
        var currentLevel = (heroData._heroBaseAttr && heroData._heroBaseAttr._level) || 1;
        var evolveLevel = (heroData._heroBaseAttr && heroData._heroBaseAttr._evolveLevel) || 0;
        var heroStar = heroData._heroStar || 0;

        LOG.info('  displayId=' + displayId + ' currentLevel=' + currentLevel + ' evolveLevel=' + evolveLevel + ' star=' + heroStar);

        // --- 2. Get hero quality from hero.json ---
        var heroConfig = CONFIGS.hero ? CONFIGS.hero[displayId] : null;
        var quality = heroConfig ? (heroConfig.quality || 'white') : 'white';

        // Ensure levelUp config is loaded for this quality
        if (!LEVEL_UP_CONFIGS[quality]) {
            LOG.warn('LevelUp config not loaded for quality: ' + quality + ', attempting sync load');
            // Fallback: try to load synchronously (may not work in all browsers)
            loadLevelUpConfig(quality);
        }

        LOG.info('  quality=' + quality);

        // --- 3. Get current player resources ---
        var currentGold = getItemCount(playerData, 102);
        var currentExpCapsule = getItemCount(playerData, 131);

        LOG.info('  currentGold=' + currentGold + ' currentExpCapsule=' + currentExpCapsule);

        // --- 4. Calculate max level for current evolve ---
        var maxLevelForCurrentEvolve = getMaxLevelForEvolve(quality, evolveLevel);
        var absoluteMaxLevel = getAbsoluteMaxLevel(quality);

        LOG.info('  maxLevelForCurrentEvolve=' + maxLevelForCurrentEvolve + ' absoluteMaxLevel=' + absoluteMaxLevel);

        // Check if hero is already at max for current evolve
        if (currentLevel >= maxLevelForCurrentEvolve) {
            LOG.warn('  Hero already at max level for current evolve tier (' + currentLevel + '/' + maxLevelForCurrentEvolve + ')');
            // Return current stats unchanged
            var currentStats = computeHeroStats(heroData);
            return {
                type: 'hero',
                action: 'autoLevelUp',
                userId: userId,
                heroId: heroId,
                version: version,
                _heroLevel: currentLevel,
                _totalAttr: { _items: buildTotalAttrItems(currentStats) },
                _baseAttr: { _items: buildBaseAttrItems(currentStats) },
                _totalCost: request._totalCost || buildEmptyTotalCost(),
                _changeInfo: { _items: {} },
                _linkHeroesTotalAttr: {},
                _linkHeroesBasicAttr: {}
            };
        }

        // --- 5. Calculate totalCost._levelUp ---
        // RECOMPUTED from config each call (not accumulated from previous calls)
        // Formula: sum of levelUp config costs for sequential levels 1 through (newLevel - 1)
        // Verified against HAR data (26 entries across 4 heroes)
        //
        // Example (orange, evolveLevel=0):
        //   heroLevel=4 → sum(orange[1..3]) = 93+150+207 = 450
        //   heroLevel=20 → sum(orange[1..19]) = 11545

        // --- 6. Perform level ups ---
        var actualLevelUps = 0;
        var totalGoldSpent = 0;
        var totalExpSpent = 0;
        var newLevel = currentLevel;
        var maxIterations = (times >= 100) ? 1000 : times; // Safety cap

        for (var iter = 0; iter < maxIterations; iter++) {
            // Check if we've done enough level ups
            if (times < 100 && actualLevelUps >= times) break;
            if (times >= 100) {
                // Auto mode: stop when resources run out or max level reached
                // (times=100 means "as many as possible", not exactly 100)
            }

            // Check max level for current evolve tier
            if (newLevel >= maxLevelForCurrentEvolve) break;

            // Get cost for next level
            var cost = getLevelUpCost(quality, newLevel);
            if (!cost) break;

            var goldCost = parseInt(cost.num2) || 0;
            var expCost = parseInt(cost.num1) || 0;

            // Check if player can afford
            if (currentGold < goldCost || currentExpCapsule < expCost) break;

            // Deduct resources
            currentGold -= goldCost;
            currentExpCapsule -= expCost;

            // Accumulate spent
            totalGoldSpent += goldCost;
            totalExpSpent += expCost;

            // Increment level
            newLevel++;
            actualLevelUps++;
        }

        LOG.info('  Level up result: ' + currentLevel + ' -> ' + newLevel + ' (' + actualLevelUps + ' levels)');
        LOG.info('  Gold spent: ' + totalGoldSpent + ', Exp spent: ' + totalExpSpent);

        // --- 7. Compute new stats ---
        // Temporarily update heroData for stat computation
        var tempHeroData = JSON.parse(JSON.stringify(heroData));
        if (!tempHeroData._heroBaseAttr) {
            tempHeroData._heroBaseAttr = { _level: 1, _evolveLevel: 0 };
        }
        tempHeroData._heroBaseAttr._level = newLevel;
        var newStats = computeHeroStats(tempHeroData);

        LOG.info('  New stats: HP=' + newStats.hp + ' ATK=' + newStats.atk + ' DEF=' + newStats.def +
            ' SPD=' + newStats.speed + ' PWR=' + newStats.power);

        // --- 8. Build _totalCost._levelUp ---
        // RECOMPUTED from config: sum of costs for seq levels 1 to (newLevel - 1)
        // Verified against HAR (26 entries across 4 heroes):
        //   Orange heroLevel=4  → 450  (sum orange[1..3])
        //   Orange heroLevel=20 → 11545 (sum orange[1..19])
        //   Purple heroLevel=4  → 405  (sum purple[1..3])
        //
        // NOTE: This replaces old accumulated model — server recomputes from scratch
        // each call to ensure consistency even after evolves/merges.
        var totalCostGold = 0;
        var totalCostExp = 0;
        var levelsPerTier = LEVELS_PER_EVOLVE_TIER[quality] || 20;
        var levelUpConfig = LEVEL_UP_CONFIGS[quality];

        if (levelUpConfig) {
            for (var lvl = 1; lvl < newLevel; lvl++) {
                var seqLvl = ((lvl - 1) % levelsPerTier) + 1;
                var lvlCost = levelUpConfig[String(seqLvl)];
                if (lvlCost) {
                    totalCostGold += parseInt(lvlCost.num2) || 0;
                    totalCostExp += parseInt(lvlCost.num1) || 0;
                }
            }
        }

        var totalCost = buildEmptyTotalCost();
        totalCost._levelUp._items = {
            '102': { _id: 102, _num: totalCostGold },
            '131': { _id: 131, _num: totalCostExp }
        };

        // --- 9. Update playerData ---
        if (playerData && actualLevelUps > 0) {
            // Update item counts in playerData
            setItemCount(playerData, 102, currentGold);
            setItemCount(playerData, 131, currentExpCapsule);

            // Update hero level
            if (playerData.heros && playerData.heros[heroId]) {
                if (!playerData.heros[heroId]._heroBaseAttr) {
                    playerData.heros[heroId]._heroBaseAttr = { _level: 1, _evolveLevel: 0 };
                }
                playerData.heros[heroId]._heroBaseAttr._level = newLevel;
            }

            // Update _totalCost._levelUp in hero data with recomputed value
            if (playerData.heros && playerData.heros[heroId] &&
                playerData.heros[heroId]._totalCost && playerData.heros[heroId]._totalCost._levelUp) {
                playerData.heros[heroId]._totalCost._levelUp._items = {
                    '102': { _id: 102, _num: totalCostGold },
                    '131': { _id: 131, _num: totalCostExp }
                };
            }

            // Sync user._attribute with items
            if (playerData.user) {
                playerData.user._attribute = { _items: playerData.items };
            }

            // Save to localStorage
            savePlayerData(userId, playerData);
            LOG.success('Player data saved after level up');
        }

        // --- 10. Build _changeInfo ---
        // CRITICAL: _num values are NEW TOTALS (not deltas)
        var changeInfo = { _items: {} };
        if (totalGoldSpent > 0) {
            changeInfo._items['102'] = { _id: 102, _num: currentGold };
        }
        if (totalExpSpent > 0) {
            changeInfo._items['131'] = { _id: 131, _num: currentExpCapsule };
        }

        // --- 11. Build response ---
        var responseData = {
            type: 'hero',
            action: 'autoLevelUp',
            userId: userId,
            heroId: heroId,
            version: version,
            _heroLevel: newLevel,
            _totalAttr: { _items: buildTotalAttrItems(newStats) },
            _baseAttr: { _items: buildBaseAttrItems(newStats) },
            _totalCost: totalCost,
            _changeInfo: changeInfo,
            _linkHeroesTotalAttr: {},
            _linkHeroesBasicAttr: {}
        };

        LOG.success('autoLevelUp success — hero ' + heroId.substring(0, 8) +
            '... level ' + currentLevel + ' → ' + newLevel +
            ' (gold -' + totalGoldSpent + ', exp -' + totalExpSpent + ')');

        return responseData;
    }

    // ========================================================
    // 12. UTILITY: Build empty _totalCost structure
    // ========================================================
    function buildEmptyTotalCost() {
        return {
            _wakeUp: { _items: {} },
            _earring: { _items: {} },
            _levelUp: { _items: {} },
            _evolve: { _items: {} },
            _skill: { _items: {} },
            _qigong: { _items: {} },
            _heroBreak: { _items: {} }
        };
    }

    // ========================================================
    // 13. REGISTER HANDLER
    // ========================================================
    function register() {
        if (typeof window === 'undefined') {
            console.error('[HERO-AUTOLEVELUP] window not available');
            return;
        }

        window.MAIN_SERVER_HANDLERS = window.MAIN_SERVER_HANDLERS || {};
        window.MAIN_SERVER_HANDLERS['hero.autoLevelUp'] = handleAutoLevelUp;

        LOG.success('Handler registered: hero.autoLevelUp');

        var configStatus = [];
        var configNames = ['hero', 'heroLevelAttr', 'heroTypeParam', 'heroLevelUpMul', 'heroEvolve', 'heroPower', 'heroWakeUp'];
        for (var i = 0; i < configNames.length; i++) {
            configStatus.push(configNames[i] + '=' + (CONFIGS[configNames[i]] ? 'OK' : 'MISSING'));
        }
        LOG.info('Config status: ' + configStatus.join(', '));

        var luStatus = [];
        var qualities = ['white', 'green', 'blue', 'purple', 'orange', 'flickerOrange', 'superOrange'];
        for (var j = 0; j < qualities.length; j++) {
            luStatus.push(qualities[j] + '=' + (LEVEL_UP_CONFIGS[qualities[j]] ? 'OK' : 'MISSING'));
        }
        LOG.info('LevelUp config status: ' + luStatus.join(', '));
    }

    // ========================================================
    // 14. INIT: Load configs then register
    // ========================================================
    if (typeof window !== 'undefined' && window.MAIN_SERVER_HANDLERS) {
        loadAllConfigs(null, function() {
            preloadAllLevelUpConfigs();
            register();
        });
    } else {
        var _check = setInterval(function() {
            if (typeof window !== 'undefined') {
                if (!window.MAIN_SERVER_HANDLERS) {
                    window.MAIN_SERVER_HANDLERS = {};
                }
                clearInterval(_check);
                loadAllConfigs(null, function() {
                    preloadAllLevelUpConfigs();
                    register();
                });
            }
        }, 50);
        setTimeout(function() { clearInterval(_check); }, 10000);
    }

})(window);
