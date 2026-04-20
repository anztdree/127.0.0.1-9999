'use strict';

/**
 * =====================================================
 *  shared/activityState.js — User Activity State Store
 *  Super Warrior Z Game Server
 *
 *  Key: userId|actId → uact object
 *  In-memory, TODO: persist ke DB
 *
 *  createDefaultUact() — bikin default uact per activity type
 *  Dipakai oleh: getActivityDetail, dan semua action handlers
 * =====================================================
 */

var logger = require('./utils/logger');

// ═══ STATE STORE ═══

var _states = {};

function get(userId, actId) {
    return _states[userId + '|' + actId] || null;
}

function set(userId, actId, uact) {
    _states[userId + '|' + actId] = uact;
}

function update(userId, actId, updates) {
    var existing = get(userId, actId);
    if (!existing) return false;
    for (var k in updates) {
        if (updates.hasOwnProperty(k)) existing[k] = updates[k];
    }
    return true;
}

function del(userId, actId) {
    delete _states[userId + '|' + actId];
}

function clearAll() { _states = {}; }

// ═══ UACT FACTORY ═══

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Buat default uact berdasarkan activity type.
 * Dari HAR: setiap activity type punya uact fields berbeda.
 *
 * @param {object} act - Activity config (ActivityBase, _-prefixed)
 * @returns {object} uact (UserActivityBase)
 */
function createDefault(act) {
    var type = act._activityType || 0;
    var now = Date.now();
    var MS = 86400000;

    // Common fields — selalu ada (HAR verified)
    var uact = {
        _activityType: type,
        _activityId: act._id || '',
        _startTime: act._startTime || now,
        _endTime: act._endTime || 0,
        _loopTag: act._loopTag || '',
        _haveClick: true,
        _gotRewards: { _items: {} }
    };

    // timeType=2 (USER): waktu relative ke user
    if (act._timeType === 2) {
        uact._startTime = now;
        uact._endTime = now + (act._durationDay || 7) * MS - 1;
    }

    // ── Type-specific fields (HAR verified) ──

    // 2007 RECHARGE_DAILY: per-day recharge tracking
    if (type === 2007 && act._days) {
        var days = {};
        var dk = Object.keys(act._days);
        for (var i = 0; i < dk.length; i++) days[dk[i]] = { _curCount: 0, _haveGotReward: {} };
        uact._days = days;
    }

    // 2004 RECHARGE_GIFT: cumulative + per-tier
    if (type === 2004 && act._items) {
        var hgr = {};
        var ik = Object.keys(act._items);
        for (var i = 0; i < ik.length; i++) hgr[ik[i]] = false;
        uact._curCount = 0;
        uact._haveGotReward = hgr;
        uact._rechargeTime = 0;
    }

    // 5003 TODAY_DISCOUNT: daily shop slots
    if (type === 5003 && act._items) {
        var items = {};
        var ik = Object.keys(act._items);
        for (var i = 0; i < ik.length; i++) items[ik[i]] = { _goodId: 0, _haveBrought: false };
        uact._items = items;
        uact._batchId = generateUUID();
        uact._lastRefreshTime = now;
    }

    // 2003 NEW_SERVER_GIFT: buy times
    if (type === 2003 && act._items) {
        var bt = {};
        var ik = Object.keys(act._items);
        for (var i = 0; i < ik.length; i++) bt[ik[i]] = 0;
        uact._buyTimes = bt;
    }

    // 5037 HERO_SUPER_GIFT: buy times
    if (type === 5037 && act._items) {
        var bt = {};
        var ik = Object.keys(act._items);
        for (var i = 0; i < ik.length; i++) bt[ik[i]] = 0;
        uact._buyTimes = bt;
    }

    // 2001 HERO_GIFT: per-item left times + cur count
    if (type === 2001 && act._items) {
        var items = {};
        var ik = Object.keys(act._items);
        for (var i = 0; i < ik.length; i++) items[ik[i]] = { _leftTimes: 5, _curCount: 0 };
        uact._items = items;
    }

    // 1003 RECHARGE_3: per-day sign + resign
    if (type === 1003 && act._items) {
        var items = {};
        var ik = Object.keys(act._items);
        for (var i = 0; i < ik.length; i++) items[ik[i]] = { _canGetReward: false, _haveGotReward: false };
        uact._items = items;
        uact._haveGotFinalReward = false;
        uact._resignCount = 0;
    }

    // 1001 LOGIN: sign-in
    if (type === 1001) {
        uact._signedDay = 0;
        uact._maxActiveDay = 0;
        uact._lastActiveDate = '';
        uact._activeItem = {};
        uact._gotExRewards = {};
    }

    // 1002 GROW: growth quest
    if (type === 1002) {
        uact._tasks = {};
    }

    return uact;
}

module.exports = {
    get: get, set: set, update: update, del: del, clearAll: clearAll,
    createDefault: createDefault,
    generateUUID: generateUUID
};
