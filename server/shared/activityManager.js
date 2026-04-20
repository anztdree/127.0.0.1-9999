'use strict';

/**
 * =====================================================
 *  shared/activityManager.js — Activity Enums + Manager
 *  Super Warrior Z Game Server
 *
 *  Dipakai oleh: getActivityBrief, getActivityDetail, dll
 *  Data source: 100% main.min.js + HAR
 * =====================================================
 */

var GameData = require('./gameData/loader');
var logger = require('./utils/logger');

// ═══ ENUMS (main.min.js) ═══

var ACTIVITY_CYCLE = {
    UNKNOWN: 0, NEW_USER: 1, SERVER_OPEN: 2, WEEK: 3, RANK: 4,
    SUMMON: 5, BE_STRONG: 6, LIMIT_HERO: 7, HOLIDAY: 8,
    EQUIPTOTALACTIVITY: 9, SIGNTOTALACTIVITY: 10, SUMARRYGIFT: 11,
    MERGESERVER: 12, SPECIALHOLIDY: 13, BUDOPEAK: 14, SUPERLEGEND: 15,
    OLDUSERBACK: 16, REGRESSION: 17, ULTRA_INSTINCT: 18, WEEKEND_SIGNIN: 19,
    WELFARE_ACCOUNT: 20, QUESTION: 60, DOWNLOADREWARD: 84,
    FBGIVELIKE: 88, IOSGIVELIKE: 89, FBSDKSHARE: 90,
    OFFLINEACT: 91, OFFLINEACT_TWO: 92,
    YouTubeRecruit: 93, RedFoxCommunity: 94, NEW_HERO_CHALLENGE: 5041
};

var ACTIVITY_TYPE = {
    UNKNOWN: 0, ITEM_DROP: 100, NEW_USER_MAIL: 101, FREE_INHERIT: 102,
    LOGIN: 1001, GROW: 1002, RECHARGE_3: 1003,
    HERO_GIFT: 2001, HERO_ORANGE: 2002, NEW_SERVER_GIFT: 2003,
    RECHARGE_GIFT: 2004, POWER_RANK: 2005, RECHARGE_7: 2006, RECHARGE_DAILY: 2007,
    NORMAL_LUCK: 3001, LUXURY_LUCK: 3002, SUPER_GIFT: 3003,
    LUCKY_FEEDBACK: 3004, DAILY_DISCOUNT: 3005, DAILY_BIG_GIFT: 3006,
    CUMULATIVE_RECHARGE: 3007, ENTRUST_ACT: 3008, FRIEND_BATTLE_ACT: 3009,
    MARKET_ACT: 3010, KARIN_ACT: 3011, BULMA_PARTY: 3012, HERO_HELP: 3013,
    SIGN_ACT: 3014, HERO_ARRIVAL: 3015, BE_STRONG: 3016,
    HERO_IMAGE_RANK: 4001, LESSON_RANK: 4002, TEMPLE_RANK: 4003,
    RK_POWER_RANK: 4004, CELL_GAME_RANK: 4005, HERO_POWER_RANK: 4006,
    IMPRINT_STAR_RANK: 4007, TALENT_RANK: 4008,
    LUCKY_EQUIP: 5001, IMPRINT_UP: 5002, TODAY_DISCOUNT: 5003,
    REFRESH_IMPRINT: 5004, SUMMON_GIFT: 5005, EQUIP_UP: 5006,
    COST_FEEDBACK: 5007, MERGE_SERVER_BOSS: 5008, GOOD_HARVESTS: 5009,
    TURNTABLE: 5010, SINGLE_RECHARGE: 5011, SHOP: 5012,
    HERO_REWARD: 5013, WHIS_FEAST: 5014, NEW_HERO_REWARD: 5015,
    DOUBLE_ELEVEN: 5016, OLD_USER_CERTIFICATION: 5017, TIME_LIMIT_EXCHANGR: 5018,
    NIENBEAST: 5019, EXCHANGE_MERCHANT: 5020, IMPRINT_EXTRACTION: 5022,
    FBGIVELIKE: 5023, IOSGIVELIKE: 5024, FB_SHARE: 5025,
    BUGGY_TREASURE: 5026, DIAMOND_SHOP: 5027, EQUIP_CAST: 5028,
    KARIN_RICH: 5029, LUCKY_WHEEL: 5030, OFFLINE_ACT: 5031,
    BLIND_BOX: 5032, OFFLINE_ACT_TWO: 5033, FUND: 5034,
    LANTENBLESSING: 5035, CROSS_SERVER_RANK: 5036, HERO_SUPER_GIFT: 5037,
    WELFARE_ACCOUNT: 5038, GALAXY_ADEVNTURE: 5039, GLEANING: 5040,
    NEW_HERO_CHALLENGE: 5041, RECHARGE_MERGESERVER: 99999999
};

var ACTIVITY_TIME_TYPE = {
    UNKNOWN: 0, SERVER_OPEN: 1, USER: 2, SPECIFIC: 3
};

var ACTIVITY_CYCLE_SORT = {
    0:0, 1:79, 2:69, 3:0, 4:89, 5:58, 6:49, 7:59, 8:99,
    9:38, 10:37, 11:39, 12:68, 13:98, 14:48, 15:47, 16:95,
    17:50, 18:60, 19:62, 20:64, 60:-1, 84:-2, 88:-3, 89:-3,
    90:-3, 91:-4, 92:-4, 93:-5, 94:-5, 5041:65
};

// ═══ MANAGER ═══

var _serverOpenDate = null;
var _cachedOpenDays = 0;
var _lastCalcTime = 0;
var CALC_INTERVAL_MS = 3600000;

function init(serverOpenDate) {
    if (serverOpenDate && typeof serverOpenDate === 'number') {
        _serverOpenDate = serverOpenDate;
    } else {
        var serverConfig = GameData.get('serverConfig');
        if (serverConfig && serverConfig.openDate) {
            _serverOpenDate = serverConfig.openDate;
        } else {
            _serverOpenDate = Date.now();
        }
    }
    _cachedOpenDays = _calcOpenDays();
    _lastCalcTime = Date.now();
    logger.info('ACTIVITY', 'Manager init. openDate=' + new Date(_serverOpenDate).toISOString() +
        ' openDays=' + _cachedOpenDays);
}

function _calcOpenDays() {
    if (!_serverOpenDate) return 0;
    var now = new Date(), open = new Date(_serverOpenDate);
    var nowB = new Date(now); nowB.setHours(6,0,0,0);
    if (now < nowB) nowB.setDate(nowB.getDate()-1);
    var openB = new Date(open); openB.setHours(6,0,0,0);
    if (open < openB) openB.setDate(openB.getDate()-1);
    return Math.max(Math.floor((nowB - openB) / 86400000) + 1, 1);
}

function getOpenServerDays() {
    var now = Date.now();
    if (now - _lastCalcTime > CALC_INTERVAL_MS) {
        _cachedOpenDays = _calcOpenDays();
        _lastCalcTime = now;
    }
    return _cachedOpenDays;
}

function getServerOpenDate() { return _serverOpenDate; }

function isAvailableByDay(cfg) {
    if (!cfg) return false;
    var d = getOpenServerDays();
    if (d < (cfg.minDay || 1)) return false;
    if (cfg.maxDay && d > cfg.maxDay) return false;
    return true;
}

function computeTimes(actData) {
    var timeType = actData._timeType || 0;
    if (timeType !== 1 || !_serverOpenDate) return;
    var startDay = actData._startDay || 0;
    var durationDay = actData._durationDay || 7;
    var MS = 86400000;
    if (!actData._startTime) actData._startTime = _serverOpenDate + startDay * MS;
    if (!actData._endTime) actData._endTime = actData._startTime + durationDay * MS - 1;
    if (!actData._timestamp) actData._timestamp = actData._startTime + 1310;
}

function getEnterGameData() {
    return { serverOpenDate: _serverOpenDate || Date.now(), openDays: getOpenServerDays() };
}

module.exports = {
    ACTIVITY_CYCLE: ACTIVITY_CYCLE,
    ACTIVITY_TYPE: ACTIVITY_TYPE,
    ACTIVITY_TIME_TYPE: ACTIVITY_TIME_TYPE,
    ACTIVITY_CYCLE_SORT: ACTIVITY_CYCLE_SORT,
    init: init,
    getOpenServerDays: getOpenServerDays,
    getServerOpenDate: getServerOpenDate,
    isAvailableByDay: isAvailableByDay,
    computeTimes: computeTimes,
    getEnterGameData: getEnterGameData
};
