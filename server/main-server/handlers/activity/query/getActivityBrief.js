'use strict';

/**
 * =====================================================
 *  activity/query/getActivityBrief.js — Get Activity Brief List
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: getActivityBrief — Return filtered list of active activities.
 *
 *  STATUS: SEMPURNA — 100% sesuai main.min.js client code
 *
 *  ═══════════════════════════════════════════════════════
 *  ALUR KERJA HANDLER:
 *
 *  1. Baca ACTIVITY_BRIEF_LIST dari _config.js
 *  2. Filter menggunakan ActivityManager.isActivityAvailableByDay()
 *     — Cek minDay ≤ openServerDays ≤ maxDay
 *  3. Deep clone setiap aktivitas yang lolos filter
 *  4. STRIP server-only field (minDay, maxDay) dari response
 *  5. STRIP hangupReward jika null/undefined (bukan tipe ITEM_DROP)
 *  6. Build ACTS_MAP { [id]: activityObj }
 *  7. Return { type, action, userId, version, _acts }
 *
 *  ═══════════════════════════════════════════════════════
 *  CLIENT REQUEST (main.min.js line 168092-168096):
 *    { type:"activity", action:"getActivityBrief", userId, version:"1.0" }
 *
 *  CLIENT CALLBACKS (2 call sites):
 *    1. Home.setActs (line 168087) — main entry, populates activity bar
 *    2. backToActivityPage (line 57528) — returning from activity detail
 *
 *  ═══════════════════════════════════════════════════════
 *  RESPONSE FORMAT — objek per aktivitas di _acts:
 *
 *    {
 *      id:           string   — UUID aktivitas
 *      templateName: string   — Nama template (HAR field, client tidak baca)
 *      name:         string   — Nama display (HAR field, client tidak baca)
 *      icon:         string   — Path ikon (line 103410, 168162)
 *      displayIndex: number   — Sort desc (line 103407)
 *      showRed:      boolean  — Flag red dot (line 103414)
 *      actCycle:     number   — ACTIVITY_CYCLE enum (line 168104)
 *      actType:      number   — ACTIVITY_TYPE enum (line 168104)
 *      cycleType:    number   — Param untuk getActivityDetail (line 168104)
 *      poolId:       number   — Param untuk getActivityDetail (line 168104)
 *      endTime:      number   — Timestamp REGRESSION countdown (line 168102)
 *      haveExReward: boolean  — Hanya actType=1001 (HAR field)
 *      hangupReward: object   — Hanya actType=100 ITEM_DROP (line 168104)
 *    }
 *
 *    FIELD YANG DI-STRIP (tidak dikirim ke client):
 *      minDay, maxDay — server-only, untuk filtering
 *
 *  ═══════════════════════════════════════════════════════
 *  CLIENT PROCESSING — Home.setActs (line 168098-168111):
 *
 *  for(var a in t._acts) {
 *    var r = t._acts[a];
 *    r.endTime && (e.regressActEndtime = r.endTime, e.setTimeLimitBags())
 *    r.id → UUID
 *    r.actType → routing:
 *      101  NEW_USER_MAIL   → FB share flag
 *      5025 FB_SHARE        → checkLikeIsOn(id, actType, cycleType, poolId)
 *      5023 FBGIVELIKE      → checkLikeIsOn(id, actType, cycleType, poolId)
 *      5024 IOSGIVELIKE     → checkLikeIsOn(id, actType, cycleType, poolId)
 *      100  ITEM_DROP       → setHangupReward(r.hangupReward)
 *      102  FREE_INHERIT    → push ke inheritHeroerActBriefDataList
 *      5031 OFFLINE_ACT     → offLineActCycle = r.actCycle
 *      5033 OFFLINE_ACT_TWO → offLineActCycleTwo = r.actCycle
 *      ALL OTHERS           → actCycleList[r.actCycle][].push(r)
 *  }
 *
 *  CLIENT PROCESSING — setActivityList (line 103401-103427):
 *    Sort: t.sort((e,t) => t.displayIndex - e.displayIndex)
 *    Baca: t.icon, t.poolId, t.id, t.showRed, t.actType
 *
 *  CLIENT PROCESSING — backToActivityPage (line 57528-57551):
 *    Baca: l.id, l.actCycle → filter by cycle → pass ke BaseActivity
 *
 *  CLIENT PROCESSING — costItemSkinComplete (line 168158-168234):
 *    Baca: actCycleList[t][0].icon, .id, .poolId
 * =====================================================
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');
var activityConfig = require('../_config');
var ActivityManager = require('../../../activity');

/**
 * Server-only fields yang TIDAK boleh dikirim ke client.
 * Client (main.min.js) tidak pernah membaca field ini dari brief response.
 * Field ini hanya digunakan untuk filtering di server side.
 *
 * @type {Array<string>}
 */
var SERVER_ONLY_FIELDS = ['minDay', 'maxDay'];

/**
 * Build filtered _acts map from activity config.
 *
 * Proses:
 *   1. Iterasi ACTIVITY_BRIEF_LIST
 *   2. Filter berdasarkan openServerDays (minDay/maxDay)
 *   3. Deep clone setiap entry yang lolos filter
 *   4. Strip server-only fields dari clone
 *   5. Strip hangupReward jika null/undefined
 *   6. Return sebagai map { [id]: activityObj }
 *
 * @returns {Object} Filtered _acts map keyed by activity UUID
 */
function buildFilteredActsMap() {
    var list = activityConfig.ACTIVITY_BRIEF_LIST;
    var actsMap = {};

    for (var i = 0; i < list.length; i++) {
        var act = list[i];

        // ── Filter: cek apakah aktivitas masih dalam range hari ──
        // ActivityManager.isActivityAvailableByDay() mengecek:
        //   - minDay ≤ openServerDays (default minDay=1)
        //   - openServerDays ≤ maxDay (jika maxDay > 0)
        if (!ActivityManager.isActivityAvailableByDay(act)) {
            continue;
        }

        // ── Deep clone: mencegah mutasi config ──
        var entry = JSON.parse(JSON.stringify(act));

        // ── Strip server-only fields ──
        for (var j = 0; j < SERVER_ONLY_FIELDS.length; j++) {
            delete entry[SERVER_ONLY_FIELDS[j]];
        }

        // ── Strip hangupReward jika null/undefined ──
        // Hanya aktType=100 (ITEM_DROP) yang butuh field ini.
        // Untuk tipe lain, hapus agar response bersih.
        if (entry.hangupReward == null) {
            delete entry.hangupReward;
        }

        actsMap[entry.id] = entry;
    }

    return actsMap;
}

/**
 * Handle getActivityBrief request.
 *
 * Endpoint READ-ONLY — tidak mengubah state user.
 * Response identik untuk semua user (static config + day filter).
 * State per-user (progress, reward claimed) ditangani oleh
 * getActivityDetail dan masing-masing action handler.
 *
 * @param {Object} socket - Socket.IO socket instance
 * @param {Object} parsed - Parsed request dari client
 *   @param {string} parsed.type - "activity"
 *   @param {string} parsed.action - "getActivityBrief"
 *   @param {string} parsed.userId - User UUID
 *   @param {string} parsed.version - Protocol version (always "1.0")
 * @param {function} callback - Socket.IO acknowledgment callback
 */
function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    var openDays = ActivityManager.getOpenServerDays();

    logger.info('ACTIVITY', 'getActivityBrief userId=' + userId +
        ' openServerDays=' + openDays);

    // Build filtered _acts map
    var actsData = buildFilteredActsMap();

    var actCount = Object.keys(actsData).length;
    logger.info('ACTIVITY', 'getActivityBrief returning ' + actCount +
        ' activities (filtered from ' + activityConfig.ACTIVITY_BRIEF_LIST.length + ')');

    callback(RH.success({
        type: parsed.type || 'activity',
        action: parsed.action || 'getActivityBrief',
        userId: userId || '',
        version: parsed.version || '1.0',
        _acts: actsData
    }));
}

module.exports = { handle: handle };
