'use strict';

/**
 * =====================================================
 *  activity/_config.js — Activity Shared Configuration
 *  Super Warrior Z Game Server — Main Server
 *
 *  Shared data used by activity handlers:
 *    - ACTIVITY_BRIEF_LIST: Static list of 12 activities (from HAR)
 *    - ACTS_MAP: Pre-built lookup map keyed by activity UUID (DEEP COPIED)
 *
 *  DATA SOURCE: 100% verified against HAR (28 identical responses)
 *  VERIFIED BY: Field-by-field comparison with main.min.js client code
 *
 *  ACTIVITY_CYCLE enum (client line 79710):
 *    0=UNKNOWN, 1=NEW_USER, 2=SERVER_OPEN, 3=WEEK, 4=RANK,
 *    5=SUMMON, 6=BE_STRONG, 7=LIMIT_HERO, 8=HOLIDAY,
 *    9=EQUIPTOTALACTIVITY, 10=SIGNTOTALACTIVITY, 11=SUMARRYGIFT,
 *    12=MERGESERVER, 13=SPECIALHOLIDY, 14=BUDOPEAK, 15=SUPERLEGEND,
 *    16=OLDUSERBACK, 17=REGRESSION, 18=ULTRA_INSTINCT, 19=WEEKEND_SIGNIN,
 *    20=WELFARE_ACCOUNT, 60=QUESTION, 84=DOWNLOADREWARD,
 *    88=FBGIVELIKE, 89=IOSGIVELIKE, 90=FBSDKSHARE,
 *    91=OFFLINEACT, 92=OFFLINEACT_TWO, 93=YouTubeRecruit,
 *    94=RedFoxCommunity, 5041=NEW_HERO_CHALLENGE
 *
 *  ACTIVITY_TYPE enum (client line 79722):
 *    0=UNKNOWN, 100=ITEM_DROP, 101=NEW_USER_MAIL, 102=FREE_INHERIT,
 *    1001=LOGIN, 1002=GROW, 1003=RECHARGE_3,
 *    2001=HERO_GIFT, 2002=HERO_ORANGE, 2003=NEW_SERVER_GIFT,
 *    2004=RECHARGE_GIFT, 2005=POWER_RANK, 2006=RECHARGE_7,
 *    2007=RECHARGE_DAILY, 4001=HERO_IMAGE_RANK, 4003=TEMPLE_RANK,
 *    5003=TODAY_DISCOUNT, 5037=HERO_SUPER_GIFT
 *
 *  CLIENT PROCESSING (Home.setActs, line 168098-168111):
 *    Iterates t._acts, reads r.id, r.endTime, r.actType, r.actCycle,
 *    r.cycleType, r.poolId, r.hangupReward per activity type.
 *    Default path: groups by r.actCycle into actCycleList[r.actCycle][].
 *
 *  CLIENT PROCESSING (backToActivityPage, line 57528-57551):
 *    Reads l.id and l.actCycle, filters by cycle, passes to BaseActivity.
 * =====================================================
 */

var ACTIVITY_BRIEF_LIST = [
    {
        id: '8df2ff74-e2d7-48f6-b32b-0beadee8f916',
        templateName: '（新版开服）每日累充',
        name: 'Daily accumulated top-up',
        icon: '/activity/新服活动/huodongnew35.png?rnd=649231590140442',
        displayIndex: 6,
        showRed: true,
        actCycle: 2,
        actType: 2007
    },
    {
        id: 'a0d76656-aa09-45c9-bb8e-92976ed016b0',
        templateName: '新服特惠三选一礼包',
        name: 'Hero Value Pack',
        icon: '/activity/新服活动/xinfuyingxiongtehui_rukou.png?rnd=851641672116391',
        displayIndex: 0,
        showRed: true,
        actCycle: 2,
        actType: 5037
    },
    {
        id: 'ee7c49ba-9a79-46b6-a15e-bd0dec2698a4',
        templateName: '（新版开服）英雄大返利',
        name: 'Hero Grand Kickback',
        icon: '/activity/新服活动/huodongnew39.png',
        displayIndex: 8,
        showRed: true,
        actCycle: 1,
        actType: 2001
    },
    {
        id: '693a71e2-2aaa-4692-8bbd-a735b2aeeb86',
        templateName: '（新版开服）点亮图鉴',
        name: 'Ignition Illustration',
        icon: '/activity/抢占先机/huodongnew137.png',
        displayIndex: 10,
        showRed: true,
        actCycle: 4,
        actType: 4001
    },
    {
        id: '93a2ebab-7ca1-438b-a0df-da4d3ca3010d',
        templateName: '（开服）新服特惠包（新）',
        name: 'New Server Discount Pack',
        icon: '/activity/新服活动/huodongnew42.png',
        displayIndex: 2,
        showRed: true,
        actCycle: 2,
        actType: 2003
    },
    {
        id: '54273e08-e5fd-4ea8-9f1d-01ad7927f0cc',
        templateName: '（新版开服）神殿争先',
        name: 'Temple Contest',
        icon: '/activity/抢占先机/huodongnew142.png?rnd=561581579242342',
        displayIndex: 9,
        showRed: true,
        actCycle: 4,
        actType: 4003
    },
    {
        id: 'f4f2041a-0391-48b7-bbd9-cbaf0f957761',
        templateName: '（开服）累充豪礼（新）',
        name: 'Cumulative Top-up Gift',
        icon: '/activity/强者之路/huodongnew107.png',
        displayIndex: 4,
        showRed: true,
        actCycle: 2,
        actType: 2004
    },
    {
        id: 'ab188628-9f0b-476b-8ec9-8b52d581595c',
        templateName: '(新版开服)橙将集结号',
        name: 'Orange Hero Assembly',
        icon: '/activity/新服活动/huodongnew40.png?rnd=171461604461607',
        displayIndex: 9,
        showRed: true,
        actCycle: 1,
        actType: 2002
    },
    {
        id: '99c3b0c4-d222-4ff8-bbcc-0de131f53e3c',
        templateName: '（开服）7日任意充',
        name: '7-Day Top-up At Will',
        icon: '/activity/新用户活动/huodongnew372.png?rnd=558541576031269',
        displayIndex: 85,
        showRed: true,
        actCycle: 1,
        actType: 1003
    },
    {
        id: '79864801-f914-4bdd-a454-b20fdee290e2',
        templateName: '开服七日登陆有礼',
        name: 'Event Sign-in',
        icon: '/activity/新用户活动/huodongnew43.png?rnd=92791669347101',
        displayIndex: 9999,
        showRed: false,
        actCycle: 8,
        actType: 1001,
        haveExReward: false
    },
    {
        id: 'd02c4167-dc19-46ca-b854-f15125fbf781',
        templateName: '（开服）今日特价（新）',
        name: 'Discount Today',
        icon: '/activity/强者之路/huodongnew205.png?rnd=574051578983873',
        displayIndex: 3,
        showRed: true,
        actCycle: 2,
        actType: 5003
    },
    {
        id: '2a904fc5-07d1-489c-bec7-90bb178cd1ae',
        templateName: '（开服）成长任务',
        name: 'Growth Quest',
        icon: '/activity/新用户活动/huodongnew47.png',
        displayIndex: 7,
        showRed: true,
        actCycle: 1,
        actType: 1002
    }
];

// Pre-build _acts map from the list (keyed by id for O(1) lookup)
// IMPORTANT: Deep copy each entry so ACTS_MAP and ACTIVITY_BRIEF_LIST
// are independent — mutating one does NOT affect the other.
var ACTS_MAP = {};
for (var _i = 0; _i < ACTIVITY_BRIEF_LIST.length; _i++) {
    ACTS_MAP[ACTIVITY_BRIEF_LIST[_i].id] = JSON.parse(JSON.stringify(ACTIVITY_BRIEF_LIST[_i]));
}

module.exports = {
    ACTIVITY_BRIEF_LIST: ACTIVITY_BRIEF_LIST,
    ACTS_MAP: ACTS_MAP
};
