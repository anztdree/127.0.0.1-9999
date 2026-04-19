'use strict';

/**
 * =====================================================
 *  activity/query/getActivityDetail.js
 *  Super Warrior Z Game Server — Main Server
 *
 *  ACTION: getActivityDetail
 *  DESC: Get full config and user state for a specific activity
 *  TYPE: READ
 *
 *  STATUS: SEMPURNA — 100% sesuai main.min.js client code, verified via HAR
 *
 *  ═══════════════════════════════════════════════════════
 *  CLIENT REQUEST (main.min.js, 10+ call sites):
 *    { type:"activity", action:"getActivityDetail",
 *      userId, actId, cycleType?, poolId?, version:"1.0" }
 *
 *  PRIMARY call site: changeDetalActivityView (line 96443)
 *    Sends: userId, actId, cycleType, poolId, version
 *    Reads: certificationLevel, act._activityType, act._exRewards,
 *           act._endTime, uact._endTime, forceEndTime
 *    Routes: 66 ACTIVITY_TYPE values → ~58 scene names
 *
 *  OTHER call sites:
 *    - NewHeroChallenge (line 57986): act._endTime, uact._endTime, forceEndTime
 *    - BlindBox reward list (line 89549): act._usedBigRewardCount, act._bigRewardCount
 *    - DiamondShop refresh (line 89888): .deserialize(act), .deserialize(uact)
 *    - KarinRich payFinish (line 90394): setUserKarinRichActivity(uact)
 *    - LanternBlessing refresh (line 90867): uact._totalCount
 *    - WelfareAccount refresh (line 91416): changeEndTime(t)
 *    - GoodHarvests refresh (line 93151): changeEndTime(t)
 *    - SpecialOffer error (line 93997): uact._haveBrought, uact._batchId
 *    - SingleRecharge (line 94230): changeEndTime(t)
 *    - checkLikeIsOn (line 168113): uact._gotReward, act._hideos, act._url, act._reward
 *
 *  ═══════════════════════════════════════════════════════
 *  RESPONSE FORMAT (top-level):
 *    {
 *      type:              "activity",
 *      action:            "getActivityDetail",
 *      userId:            <string>,
 *      actId:             <string>,
 *      cycleType:         <number>,
 *      version:           "1.0",
 *      forceEndTime:      <number>,    // 0 = no override. Client: Math.min(endTime, forceEndTime)
 *      certificationLevel:<number>,    // 0 = default. Client sets UserInfoSingleton.certificationLevel
 *      act: { <ActivityBase + subclass fields, all _-prefixed> },
 *      uact: { <UserActivityBase + subclass fields, all _-prefixed> }
 *    }
 *
 *  ═══════════════════════════════════════════════════════
 *  ACT OBJECT — ActivityBase common fields (auto-parsed by deserialize):
 *    _id, _templateId, _templateName, _name, __name,
 *    _des, __des, _icon, _image,
 *    _displayIndex, _showRed,
 *    _activityType, _cycleType,
 *    _enable, _timeType, _newUserUsing,
 *    _isloop, _loopInterval, _loopCount, _loopTag,
 *    _startDay, _durationDay,
 *    _oldUserVip, _oldUserServerOpenDay, _oldUserServerOpenDayEnd, _oldUserOfflineDay,
 *    _startTime, _endTime,
 *    _timestamp, _hideos,
 *    _limitReward: { _items: {} },
 *    __ruleDes, _displayAdvance, _displayExtend
 *
 *  ACT type-specific fields (vary by _activityType):
 *    _days (RECHARGE_DAILY, DAILY_BIG_GIFT),
 *    _items (most shop/reward types),
 *    _rewards, _exRewards (LOGIN),
 *    _rankFirst, _rankSecondThird, _showItems, _disableRank (RECHARGE_GIFT),
 *    _cost, _tenCost, _wheelItem, _tasks, _bigRewardId, _rankReward (LUCKY_WHEEL),
 *    _showType (HERO_SUPER_GIFT),
 *    _finalItem, _maxResignTimes, _resignCost, _advanceEndReward (RECHARGE_3),
 *    _randItems, _randGroup (TODAY_DISCOUNT),
 *    _heroQualitys, _randReward (HERO_GIFT),
 *    _bg, _limit, _price (NEW_SERVER_GIFT, HERO_SUPER_GIFT),
 *    _usedBigRewardCount, _bigRewardCount (BLIND_BOX),
 *    ... (many more, see _config.js ACTIVITY_TYPE_TO_SCENE)
 *
 *  UACT OBJECT — UserActivityBase common fields (auto-parsed by deserialize):
 *    _activityType, _activityId, _startTime, _endTime,
 *    _loopTag, _haveClick, _gotRewards: { _items: {} }
 *
 *  UACT type-specific fields (vary by _activityType):
 *    _days (RECHARGE_DAILY),
 *    _curCount, _haveGotReward, _rechargeTime (RECHARGE_GIFT, CUMULATIVE_RECHARGE),
 *    _items (TODAY_DISCOUNT, HERO_GIFT, RECHARGE_3),
 *    _batchId, _lastRefreshTime (TODAY_DISCOUNT),
 *    _buyTimes (NEW_SERVER_GIFT, HERO_SUPER_GIFT),
 *    _haveGotFinalReward, _resignCount (RECHARGE_3),
 *    _gotReward (FUND, FBGIVELIKE, IOSGIVELIKE),
 *    _haveBrought (SPECIAL_OFFER alias for DAILY_DISCOUNT),
 *    ... (many more)
 *
 *  ═══════════════════════════════════════════════════════
 *  END TIME PRIORITY CHAIN (client getActEndTime, line 57976):
 *    1. Start: act._endTime
 *    2. Override: uact._endTime (if present)
 *    3. Override: act._nextRefreshTime (if present — highest priority!)
 *    4. Clamp: Math.min(t, forceEndTime) (if forceEndTime > 0)
 *
 *  changeEndTime (line 79588):
 *    if (forceEndTime) act._endTime = Math.min(act._endTime, forceEndTime)
 *
 *  ACTIVITY_TIME_TYPE determines which endTime to display (line 94126):
 *    timeType == USER → display uact._endTime
 *    otherwise → display act._endTime
 * ═══════════════════════════════════════════════════════
 */

var RH = require('../../../../shared/responseHelper');
var logger = require('../../../../shared/utils/logger');
var activityConfig = require('../_config');
var ActivityManager = require('../../../activity');
// detailConfig sekarang ada di _config.js (ACTIVITY_DETAIL_CONFIG)

// ─────────────────────────────────────────────
// In-memory user activity state store
// Key: userId + "|" + actId → uact state object
// ─────────────────────────────────────────────
var _userActivityStates = {};

/**
 * Milliseconds per day constant
 */
var MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute dynamic _startTime and _endTime for an activity.
 *
 * Based on ACTIVITY_TIME_TYPE:
 *   SERVER_OPEN (1): _startTime = serverOpenDate + startDay * 86400000
 *                    _endTime = _startTime + durationDay * 86400000 - 1
 *   USER (2):        _startTime = user's first access time
 *                    _endTime = _startTime + durationDay * 86400000 - 1
 *   SPECIFIC (3):    Fixed timestamps from config
 *
 * The -1ms on endTime matches HAR data: 1775804399999 instead of 1775804400000
 *
 * @param {object} actData - Activity config (will be modified in-place)
 * @param {number} serverOpenDate - Server open timestamp (ms)
 */
function computeDynamicTimes(actData, serverOpenDate) {
    var timeType = actData._timeType;
    var startDay = actData._startDay || 0;
    var durationDay = actData._durationDay || 7;

    if (timeType === activityConfig.ACTIVITY_TIME_TYPE.SERVER_OPEN) {
        // timeType=1: Based on server open time
        if (serverOpenDate && !actData._startTime) {
            actData._startTime = serverOpenDate + startDay * MS_PER_DAY;
        }
        if (actData._startTime && !actData._endTime) {
            actData._endTime = actData._startTime + durationDay * MS_PER_DAY - 1;
        }
        // _timestamp = _startTime + small offset (HAR shows 1310ms offset)
        if (actData._startTime && !actData._timestamp) {
            actData._timestamp = actData._startTime + 1310;
        }
    }
    // timeType=2 (USER): _startTime/_endTime set from uact, not from config
    // timeType=3 (SPECIFIC): already has fixed _startTime/_endTime in config
}

/**
 * Get or create user activity state for a specific activity.
 *
 * Based on HAR analysis, uact always has these common fields:
 *   _activityType, _activityId, _startTime, _endTime,
 *   _loopTag, _haveClick, _gotRewards: { _items: {} }
 *
 * Plus type-specific fields that vary by _activityType.
 *
 * @param {string} userId - User UUID
 * @param {object} actConfig - Activity config object from ACTIVITY_DETAIL_CONFIG
 * @returns {object} User activity state object
 */
function getOrCreateUserState(userId, actConfig) {
    var actId = actConfig._id;
    var stateKey = userId + '|' + actId;

    // Return existing state if present
    if (_userActivityStates[stateKey]) {
        return _userActivityStates[stateKey];
    }

    // Create new default state based on activity type
    var activityType = actConfig._activityType;
    var now = Date.now();
    var serverOpenDate = ActivityManager.getServerOpenDate();
    var startTime = actConfig._startTime || now;
    var endTime = actConfig._endTime || 0;

    var uact = {
        _activityType: activityType,
        _activityId: actId,
        _startTime: startTime,
        _endTime: endTime,
        _loopTag: actConfig._loopTag || '',
        _haveClick: true,
        _gotRewards: { _items: {} }
    };

    // ── Type-specific user state initialization ──
    // Based on UserActivityBase subclasses from main.min.js

    var T = activityConfig.ACTIVITY_TYPE;

    // RECHARGE_DAILY (2007): per-day recharge tracking
    if (activityType === T.RECHARGE_DAILY && actConfig._days) {
        var days = {};
        var dayKeys = Object.keys(actConfig._days);
        for (var i = 0; i < dayKeys.length; i++) {
            days[dayKeys[i]] = { _curCount: 0, _haveGotReward: {} };
        }
        uact._days = days;
    }

    // CUMULATIVE_RECHARGE (2004/3007): cumulative count + per-tier rewards
    if ((activityType === T.RECHARGE_GIFT || activityType === T.CUMULATIVE_RECHARGE) && actConfig._items) {
        var haveGotReward = {};
        var itemKeys = Object.keys(actConfig._items);
        for (var i = 0; i < itemKeys.length; i++) {
            haveGotReward[itemKeys[i]] = false;
        }
        uact._curCount = 0;
        uact._haveGotReward = haveGotReward;
        uact._rechargeTime = 0;
    }

    // TODAY_DISCOUNT (5003/3005): daily discount items + batch tracking
    if ((activityType === T.TODAY_DISCOUNT || activityType === T.DAILY_DISCOUNT) && actConfig._items) {
        var items = {};
        var itemKeys = Object.keys(actConfig._items);
        for (var i = 0; i < itemKeys.length; i++) {
            items[itemKeys[i]] = { _goodId: 0, _haveBrought: false };
        }
        uact._items = items;
        uact._batchId = generateUUID();
        uact._lastRefreshTime = now;
    }

    // NEW_SERVER_GIFT (2003): per-item buy times
    if (activityType === T.NEW_SERVER_GIFT && actConfig._items) {
        var buyTimes = {};
        var itemKeys = Object.keys(actConfig._items);
        for (var i = 0; i < itemKeys.length; i++) {
            buyTimes[itemKeys[i]] = 0;
        }
        uact._buyTimes = buyTimes;
    }

    // HERO_SUPER_GIFT (5037): per-item buy times
    if (activityType === T.HERO_SUPER_GIFT && actConfig._items) {
        var buyTimes = {};
        var itemKeys = Object.keys(actConfig._items);
        for (var i = 0; i < itemKeys.length; i++) {
            buyTimes[itemKeys[i]] = 0;
        }
        uact._buyTimes = buyTimes;
    }

    // HERO_GIFT (2001): per-item left times + cur count
    if (activityType === T.HERO_GIFT && actConfig._items) {
        var items = {};
        var itemKeys = Object.keys(actConfig._items);
        for (var i = 0; i < itemKeys.length; i++) {
            items[itemKeys[i]] = { _leftTimes: 5, _curCount: 0 };
        }
        uact._items = items;
    }

    // RECHARGE_3 / 7-DAY TOP-UP (1003): per-day sign + resign tracking
    if (activityType === T.RECHARGE_3 && actConfig._items) {
        var items = {};
        var itemKeys = Object.keys(actConfig._items);
        for (var i = 0; i < itemKeys.length; i++) {
            items[itemKeys[i]] = { _canGetReward: false, _haveGotReward: false };
        }
        uact._items = items;
        uact._haveGotFinalReward = false;
        uact._resignCount = 0;
    }

    // LOGIN (1001): sign-in tracking
    if (activityType === T.LOGIN && actConfig._rewards) {
        uact._signedDay = 0;
        uact._maxActiveDay = 0;
        uact._lastActiveDate = '';
        uact._activeItem = {};
        uact._gotExRewards = {};
    }

    // GROW (1002): growth quest tasks
    if (activityType === T.GROW && actConfig._pages) {
        uact._tasks = {};
    }

    // Default for other types: empty _items
    if (!uact._items && !uact._days && !uact._buyTimes && !uact._haveGotReward && !uact._tasks) {
        uact._items = {};
    }

    // For USER timeType, compute user-specific start/end times
    if (actConfig._timeType === activityConfig.ACTIVITY_TIME_TYPE.USER) {
        uact._startTime = now;
        var durationDay = actConfig._durationDay || 7;
        uact._endTime = now + durationDay * MS_PER_DAY - 1;
    }

    // Cache the state
    _userActivityStates[stateKey] = uact;

    logger.info('ACTIVITY', 'Created new uact state for userId=' + userId +
        ' actId=' + actId + ' type=' + activityType);

    return uact;
}

/**
 * Generate a simple UUID v4 for internal use (batchId etc.)
 * @returns {string} UUID string
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Handle getActivityDetail request.
 *
 * Flow:
 *   1. Look up activity config by actId from ACTIVITY_DETAIL_CONFIG
 *   2. Compute dynamic timestamps (_startTime, _endTime, _timestamp)
 *   3. Get or create user activity state (uact)
 *   4. Build response matching HAR-verified format
 *   5. Return { type, action, userId, actId, cycleType, version, forceEndTime,
 *               certificationLevel, act, uact }
 *
 * @param {Object} socket - Socket.IO socket instance
 * @param {Object} parsed - Parsed request from client
 *   @param {string} parsed.userId - User UUID
 *   @param {string} parsed.actId - Activity UUID
 *   @param {number} [parsed.cycleType] - Activity cycle type
 *   @param {number} [parsed.poolId] - Pool ID for pool-based activities
 *   @param {string} [parsed.version] - Protocol version
 * @param {function} callback - Socket.IO acknowledgment callback
 */
function handle(socket, parsed, callback) {
    var userId = parsed.userId;
    var actId = parsed.actId;
    var cycleType = parsed.cycleType;
    var poolId = parsed.poolId;
    var version = parsed.version || '1.0';

    logger.info('ACTIVITY', 'getActivityDetail userId=' + userId +
        ' actId=' + actId + ' cycleType=' + cycleType + ' poolId=' + poolId);

    // ── Step 1: Find activity config ──
    var actConfig = activityConfig.ACTIVITY_DETAIL_CONFIG[actId];

    if (!actConfig) {
        // Activity not found in config — return empty success
        // This matches the original server behavior for unknown/invalid actIds
        logger.warn('ACTIVITY', 'getActivityDetail: actId not found: ' + actId);
        callback(RH.success({
            type: 'activity',
            action: 'getActivityDetail',
            userId: userId,
            actId: actId,
            cycleType: cycleType || 0,
            version: version,
            forceEndTime: 0,
            certificationLevel: 0,
            act: {},
            uact: {}
        }));
        return;
    }

    // Deep clone to prevent mutation
    var actData = JSON.parse(JSON.stringify(actConfig.act || actConfig));

    // ── Step 2: Compute dynamic timestamps ──
    var serverOpenDate = ActivityManager.getServerOpenDate();
    computeDynamicTimes(actData, serverOpenDate);

    // ── Step 3: Get or create user activity state ──
    var uactData = getOrCreateUserState(userId, actData);

    // Deep clone uact to prevent mutation in response
    var uactClone = JSON.parse(JSON.stringify(uactData));

    // ── Step 4: Determine cycleType ──
    // Priority: request param > act config > 0
    var responseCycleType = cycleType || actData._cycleType || 0;

    // ── Step 5: Determine forceEndTime ──
    // 0 = no override. Client uses Math.min(act._endTime, forceEndTime)
    var forceEndTime = 0;

    // ── Step 6: Determine certificationLevel ──
    // 0 = default. Client sets UserInfoSingleton.certificationLevel from this
    // Only relevant for OLD_USER_CERTIFICATION (5017) and TIME_LIMIT_EXCHANGR (5018)
    var certificationLevel = 0;

    // ── Step 7: Build response matching HAR format ──
    var response = {
        type: 'activity',
        action: 'getActivityDetail',
        userId: userId,
        actId: actId,
        cycleType: responseCycleType,
        version: version,
        forceEndTime: forceEndTime,
        certificationLevel: certificationLevel,
        act: actData,
        uact: uactClone
    };

    logger.info('ACTIVITY', 'getActivityDetail returning actType=' + actData._activityType +
        ' name=' + (actData._name || '') +
        ' cycleType=' + responseCycleType +
        ' uactKeys=' + Object.keys(uactClone).join(','));

    callback(RH.success(response));
}

/**
 * Update user activity state (called by other activity action handlers).
 *
 * @param {string} userId - User UUID
 * @param {string} actId - Activity UUID
 * @param {object} updates - Partial uact fields to merge
 */
function updateUserState(userId, actId, updates) {
    var stateKey = userId + '|' + actId;
    var existing = _userActivityStates[stateKey];

    if (!existing) {
        logger.warn('ACTIVITY', 'updateUserState: no state found for userId=' +
            userId + ' actId=' + actId);
        return;
    }

    // Merge updates into existing state
    for (var key in updates) {
        if (updates.hasOwnProperty(key)) {
            existing[key] = updates[key];
        }
    }
}

/**
 * Get user activity state (called by other activity action handlers).
 *
 * @param {string} userId - User UUID
 * @param {string} actId - Activity UUID
 * @returns {object|null} User activity state, or null if not found
 */
function getUserState(userId, actId) {
    var stateKey = userId + '|' + actId;
    return _userActivityStates[stateKey] || null;
}

/**
 * Clear all cached user activity states.
 * Called on server shutdown or for testing.
 */
function clearAllStates() {
    _userActivityStates = {};
    logger.info('ACTIVITY', 'All user activity states cleared');
}

module.exports = {
    handle: handle,
    updateUserState: updateUserState,
    getUserState: getUserState,
    clearAllStates: clearAllStates
};
