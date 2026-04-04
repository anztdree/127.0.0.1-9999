/**
 * ============================================================
 * CHECKBATTLERESULT.JS - Mock Handler for hangup.checkBattleResult
 * ============================================================
 * 
 * Purpose: Verifies battle result and returns rewards + progress
 * Called after client finishes a battle locally (both guide & normal)
 * Server echoes back all request fields and adds computed fields
 * 
 * HAR Reference: s398-zd.pksilo.com_2026_04_01_22_14_53.har
 *   12 entries total: 10 normal + 2 guide (isGuide:true)
 * 
 * HAR Verified Response Pattern:
 *   Server echoes ALL request fields, then adds 5 computed fields.
 *   Guide request (5 fields):  type, action, userId, version, isGuide
 *     -> Response: 5 echoed + 5 computed = 10 fields
 *   Normal request (9 fields): type, action, userId, battleId, version,
 *     super, checkResult, battleField, runaway
 *     -> Response: 9 echoed + 5 computed = 14 fields
 *   NO extra fields, NO missing fields.
 * 
 * HAR Guide Response Example (Entry #878):
 *   {"type":"hangup","action":"checkBattleResult","userId":"...",
 *    "version":"1.0","isGuide":true,
 *    "_changeInfo":{"_items":{"101":{"_id":101,"_num":40},
 *      "102":{"_id":102,"_num":11692},"103":{"_id":103,"_num":59},
 *      "3003":{"_id":3003,"_num":4},"3004":{"_id":3004,"_num":4}}},
 *    "_curLess":10103,"_maxPassLesson":10102,"_maxPassChapter":0,
 *    "_battleResult":0}
 *   Verified: lesson 10102 config award3=3003/num3=4, award4=3004/num4=4 -> MATCH
 * 
 * HAR Normal Response Example (Entry #306):
 *   {"type":"hangup","action":"checkBattleResult","userId":"...",
 *    "battleId":"690eab8e-...","version":"1.0",
 *    "super":[...],"checkResult":[...],"battleField":20,"runaway":false,
 *    "_changeInfo":{"_items":{"101":{"_id":101,"_num":386},
 *      "102":{"_id":102,"_num":364371},"103":{"_id":103,"_num":1554},
 *      "131":{"_id":131,"_num":58088},"3002":{"_id":3002,"_num":2}}},
 *    "_curLess":10207,"_maxPassLesson":10206,"_maxPassChapter":801,
 *    "_battleResult":0}
 *   Verified: lesson 10206 config award1=103/850, award2=102/2100, award3=131/1190, award4=3002/1, award5=101/20 -> MATCH
 * 
 * main.min.js Verified (Hakim):
 *   _battleResult: 0=win, 1=lose, 2=verificationFailure
 *     Evidence: "var n = 0 == t._battleResult ? !0 : !1"
 *     Evidence: "getBattleTypeWithResult(e,t,n): 0->pveSuccess, 1->defeated, 2->verificationFailure"
 *   _changeInfo._items: each item has _id and _num
 *     Evidence: "e._changeInfo && (n = e._changeInfo._items); for(var u in n) ... n[u]._id ... n[u]._num"
 *   _curLess, _maxPassLesson: saved to OnHookSingleton (only on win: "n && (...)")
 *   _maxPassChapter: saved to OnHookSingleton (only on win, NOT read in guide path)
 *   checkResult: heroHealthMap from client: [{hero:"Own_1_1309",hp:6090},{hero:"Enemy_1_1902",hp:0}]
 *     Evidence: "for(var s in e.heroHealthMap){var r=e.heroHealthMap[s];i.push({hero:s,hp:r})}"
 *   battleFinish (client-side): determines win/lose before sending to server
 *     Evidence: "r=true(all enemy isDeath) -> enemyTeamAllDead, t=true(all myTeam isDeath) -> myTeamAllDead"
 *   checkDeath: "e.hp > Math.abs(t) ? false : (e.isDeath=true, true)" -> hp<=0 = death
 *   resetTtemsCallBack (guide): "e._changeInfo._items -> setItem(n[o]._id, n[o]._num)"
 *   getBattleAwardItems (normal): "e._changeInfo._items -> delta = _num - currentNum"
 * 
 * IMPORTANT: _changeInfo._items._num = NEW TOTAL VALUE (not delta!)
 *   Client computes display delta: newNum - currentNum
 * 
 * Key Differences Between Guide and Normal Responses (HAR Verified):
 *   - Guide request has only 5 fields (no battleId, super, checkResult, battleField, runaway)
 *   - Normal request has 9 fields (includes battle data)
 *   - Both have identical 5 computed fields
 *   - Item 131 (ExpCapsule) appears only if lesson config has it as award1-5
 * 
 * Reward Source (HAR Verified):
 *   ALL rewards come from lesson.json config: award1-5 / num1-5
 *   NO random drops, NO hardcoded items. Server reads lesson config and returns
 *   exactly what the config specifies. This ensures preview (client reads config)
 *   and actual reward (server returns based on config) are always in sync.
 * 
 * Author: Local SDK Bridge
 * Version: 4.0.0 — lesson config driven rewards, no hardcode
 * ============================================================
 */

(function(window) {
    'use strict';

    var LOG = {
        prefix: '[BATTLE-RESULT]',
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
        success: function(msg, data) { this._log('success', 'OK', msg, data); },
        info: function(msg, data) { this._log('info', '>>', msg, data); },
        warn: function(msg, data) { this._log('warn', '!!', msg, data); },
        error: function(msg, data) { this._log('error', 'XX', msg, data); }
    };

    // Config cache for lesson lookup (awards + chapter progression)
    var lessonCache = null;
    var lessonCachePromise = null;

    function loadLessonConfig() {
        if (lessonCachePromise) return;
        var basePath = window.__GAME_BASE_PATH__ || '';
        lessonCachePromise = fetch(basePath + 'resource/json/lesson.json').then(function(r) { return r.json(); })
            .then(function(data) {
                lessonCache = data;
                LOG.info('Loaded: lesson (' + Object.keys(data).length + ' entries)');
            })
            .catch(function(e) { LOG.warn('Failed: lesson.json - ' + e.message); });
    }

    /**
     * Check if clearing a lesson completes its chapter.
     * A chapter is fully cleared when the NEXT lesson belongs to a different chapter.
     * Uses lesson.json nextID and thisChapter fields.
     * Returns the completed chapter ID, or 0 if chapter not yet complete.
     */
    function checkChapterComplete(lessonId) {
        if (!lessonCache || !lessonCache[String(lessonId)]) return 0;
        var lesson = lessonCache[String(lessonId)];
        var nextId = lesson.nextID;
        if (!nextId) {
            return lesson.thisChapter || 801;
        }
        var nextLesson = lessonCache[String(nextId)];
        if (!nextLesson) return 0;
        if (nextLesson.thisChapter !== lesson.thisChapter) {
            return lesson.thisChapter;
        }
        return 0;
    }

    /**
     * Determine battle result from request data.
     *
     * Logic derived from main.min.js (hakim):
     *   - Client battleFinish() checks isDeath on myTeam and enemyTeam
     *   - Client checkDeath(): e.hp > Math.abs(t) ? false : (e.isDeath=true, true)
     *   - Client sends heroHealthMap as checkResult: [{hero:"Enemy_1_1902",hp:0},...]
     *   - Client reads: "var n = 0 == t._battleResult ? !0 : !1"
     *   - Client getBattleTypeWithResult: 0->pveSuccess, 1->defeated, 2->verificationFailure
     *
     * Rules (HAR + main.min.js verified):
     *   - Guide (isGuide:true): always WIN (HAR: all 2 guide entries = _battleResult:0)
     *   - Runaway (runaway:true): always LOSE (client sets runaway when retreating)
     *   - Normal: check all Enemy_* in checkResult -> if all hp===0 then WIN else LOSE
     *
     * Returns: 0 = WIN, 1 = LOSE
     */
    function determineBattleResult(request) {
        if (request.isGuide) return 0;
        if (request.runaway === true) return 1;
        var checkResult = request.checkResult;
        if (!checkResult || !Array.isArray(checkResult) || checkResult.length === 0) return 0;
        var allEnemyDead = true;
        for (var i = 0; i < checkResult.length; i++) {
            var entry = checkResult[i];
            if (typeof entry.hero === 'string' && entry.hero.indexOf('Enemy_') === 0) {
                if (entry.hp > 0) {
                    allEnemyDead = false;
                    break;
                }
            }
        }
        return allEnemyDead ? 0 : 1;
    }

    /**
     * Handler for hangup.checkBattleResult
     *
     * Supports both guide (isGuide:true) and normal battles.
     *
     * Response construction (HAR verified):
     *   1. Echo ALL request fields as-is (no hardcoding, no defaults)
     *   2. Add 5 computed fields: _changeInfo, _curLess, _maxPassLesson,
     *      _maxPassChapter, _battleResult
     *
     * Client reads response (main.min.js verified):
     *   Normal: n = 0==t._battleResult -> if win: getBattleAwardItems + save progress
     *   Guide:  t = 0==e._battleResult -> if win: resetTtemsCallBack + save progress
     *   Both:   getBattleTypeWithResult for summary page display
     */
    function handleCheckBattleResult(request, playerData) {
        var isGuide = request.isGuide || false;
        var battleResult = determineBattleResult(request);
        var isWin = (battleResult === 0);

        LOG.info('Handling hangup.checkBattleResult' + (isGuide ? ' (guide)' : ''));
        LOG.info('battleId: ' + (request.battleId || 'none'));
        LOG.info('battleField: ' + request.battleField + ', runaway: ' + request.runaway);
        LOG.info(isWin ? 'Result: WIN' : 'Result: LOSE');

        // Get current progress from playerData
        var hangup = playerData.hangup || {};
        var curLess = hangup._curLess || 10101;
        var maxPassChapter = hangup._maxPassChapter || 0;
        var maxPassLesson = hangup._maxPassLesson || 0;

        var newMaxPassLesson = maxPassLesson;
        var newCurLess = curLess;

        // Only advance progress on WIN (main.min.js: "n && (OnHookSingleton.lastSection=t._curLess)")
        if (isWin) {
            newMaxPassLesson = curLess;
            newCurLess = curLess + 1;

            var completedChapter = checkChapterComplete(curLess);
            if (completedChapter > 0 && completedChapter > maxPassChapter) {
                maxPassChapter = completedChapter;
                LOG.info('Chapter completed: ' + maxPassChapter);
            }
        }

        // Get current items from playerData
        var items = playerData.items || {};

        // Generate battle rewards from lesson.json config (HAR verified)
        // _changeInfo._items._num = NEW TOTAL VALUE (main.min.js: "n[u]._num")
        // Client computes delta: _num - currentNum
        // ALL rewards come from lesson.json award1-5 / num1-5 — NO hardcode, NO random
        var rewardItems = {};

        if (isWin && lessonCache && lessonCache[String(curLess)]) {
            var lessonConfig = lessonCache[String(curLess)];
            var rewardLog = [];
            for (var aw = 1; aw <= 5; aw++) {
                var awardId = lessonConfig['award' + aw];
                var awardNum = lessonConfig['num' + aw];
                if (awardId && awardNum) {
                    var itemKey = String(awardId);
                    var currentNum = items[itemKey] ? items[itemKey]._num : 0;
                    rewardItems[itemKey] = { _id: awardId, _num: currentNum + awardNum };
                    rewardLog.push('item' + awardId + '+' + awardNum);
                }
            }
            LOG.info('Rewards (from lesson ' + curLess + '): ' + rewardLog.join(', '));
        } else if (isWin) {
            // Fallback: lesson.json not loaded yet (race condition on first battle)
            LOG.warn('lessonCache not ready for lesson ' + curLess + ' — returning empty rewards');
        }

        // Build response
        // Step 1: Echo ALL request fields (HAR: server mirrors request exactly)
        var responseData = {};
        for (var key in request) {
            if (request.hasOwnProperty(key) && request[key] !== undefined) {
                responseData[key] = request[key];
            }
        }

        // Step 2: Add 5 computed fields (HAR: present in ALL responses)
        responseData._changeInfo = { _items: rewardItems };
        responseData._curLess = newCurLess;
        responseData._maxPassLesson = newMaxPassLesson;
        responseData._maxPassChapter = maxPassChapter;
        responseData._battleResult = battleResult;

        // Persist to playerData only on WIN
        if (playerData.hangup && isWin) {
            playerData.hangup._curLess = newCurLess;
            playerData.hangup._maxPassLesson = newMaxPassLesson;
            playerData.hangup._maxPassChapter = maxPassChapter;
            LOG.info('Saved _curLess=' + newCurLess + ' _maxPassLesson=' + newMaxPassLesson + ' _maxPassChapter=' + maxPassChapter);

            // Persist reward items to playerData (from lesson config, same as response)
            playerData.items = playerData.items || {};
            for (var ri in rewardItems) {
                playerData.items[ri] = rewardItems[ri];
            }
            try {
                localStorage.setItem('dragonball_player_data_' + request.userId, JSON.stringify(playerData));
            } catch (e) {
                LOG.warn('Could not persist battle result');
            }
        }

        LOG[isWin ? 'success' : 'warn']('checkBattleResult -> ' + (isWin ? 'WIN' : 'LOSE') + ' (battleId: ' + (request.battleId || '').substring(0, 8) + '...)');
        LOG.info('Progress: lesson ' + newCurLess + ' (max passed: ' + newMaxPassLesson + ', chapter: ' + maxPassChapter + ')');

        return responseData;
    }

    // ========================================================
    // REGISTER HANDLER
    // ========================================================
    function register() {
        if (typeof window === 'undefined') {
            console.error('[BATTLE-RESULT] window not available');
            return;
        }
        window.MAIN_SERVER_HANDLERS = window.MAIN_SERVER_HANDLERS || {};
        window.MAIN_SERVER_HANDLERS['hangup.checkBattleResult'] = handleCheckBattleResult;
        LOG.success('Handler registered: hangup.checkBattleResult');
        loadLessonConfig();
    }

    if (typeof window !== 'undefined') {
        register();
    } else {
        var _check = setInterval(function() {
            if (typeof window !== 'undefined') {
                clearInterval(_check);
                register();
            }
        }, 50);
        setTimeout(function() { clearInterval(_check); }, 10000);
    }

})(window);
