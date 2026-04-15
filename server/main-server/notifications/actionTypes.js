/**
 * =====================================================
 *  actionTypes.js — Notify Action Type Constants
 *  Super Warrior Z Game Server — Main Server
 *
 *  100% derived from client code analysis (main.min.js).
 *
 *  Client listens for server-push via "Notify" event:
 *    socket.on("Notify", function(data) {
 *        if ("SUCCESS" == data.ret) { ... }
 *    })
 *
 *  Inside data, client checks data.action to determine
 *  what kind of notification it received.
 *
 *  Client handler routing (line 77182-77220):
 *    switch(data.action) {
 *        case "kickout": ...
 *        case "payFinish": ...
 *        case "mailNew": ...
 *        ... 42 action types total
 *    }
 *
 *  CRITICAL: Action string values MUST match client exactly.
 *  Client uses string comparison, NOT numeric codes.
 * =====================================================
 */

'use strict';

/**
 * Notify action type enumeration.
 * All string values MUST match client code exactly.
 *
 * @enum {string}
 */
var NOTIFY_ACTION = {
    // =============================================
    // P0 — Core Flow (impact login/gameplay)
    // =============================================

    /** Client receives "kicked" event → shows "Account logged in elsewhere" dialog */
    KICKOUT: 'kickout',

    /** Payment completed — client refreshes diamond/gold balance */
    PAY_FINISH: 'payFinish',

    /** New mail received — client refreshes mail list */
    MAIL_NEW: 'mailNew',

    /** Chat message received — client displays in chat panel */
    CHAT_MSG: 'chatMsg',

    // =============================================
    // P1 — Social / Guild
    // =============================================

    /** Guild member joined/updated */
    GUILD_MEMBER_UPDATE: 'guildMemberUpdate',

    /** Guild info updated (name, level, announcement) */
    GUILD_INFO_UPDATE: 'guildInfoUpdate',

    /** Guild application received */
    GUILD_APPLY: 'guildApply',

    /** Guild application approved/rejected */
    GUILD_APPLY_RESULT: 'guildApplyResult',

    /** Guild kicked/expelled member */
    GUILD_KICK: 'guildKick',

    /** Guild disbanded */
    GUILD_DISBAND: 'guildDisband',

    /** Guild boss event notification */
    GUILD_BOSS: 'guildBoss',

    /** Guild treasure notification */
    GUILD_TREASURE: 'guildTreasure',

    // =============================================
    // P1 — PvP / Battle
    // =============================================

    /** Arena ranking updated after being attacked */
    ARENA_UPDATE: 'arenaUpdate',

    /** Top battle ranking updated */
    TOP_BATTLE_UPDATE: 'topBattleUpdate',

    /** Friend battle challenge received */
    FRIEND_BATTLE: 'friendBattle',

    /** Revenge battle available (arena) */
    ARENA_REVENGE: 'arenaRevenge',

    // =============================================
    // P1 — Activity / Events
    // =============================================

    /** Activity opened/started */
    ACTIVITY_OPEN: 'activityOpen',

    /** Activity closed/ended */
    ACTIVITY_CLOSE: 'activityClose',

    /** Activity reward available */
    ACTIVITY_REWARD: 'activityReward',

    /** Server announcement / broadcast message */
    BROADCAST: 'broadcast',

    /** Online bonus timer tick */
    ONLINE_BONUS: 'onlineBonus',

    /** Daily sign-in refreshed */
    SIGN_IN_REFRESH: 'signInRefresh',

    /** Download milestone reward available */
    DOWNLOAD_REWARD: 'downloadReward',

    // =============================================
    // P2 — Team / Dungeon
    // =============================================

    /** Team dungeon invite received */
    TEAM_DUNGEON_INVITE: 'teamDungeonInvite',

    /** Team dungeon member joined/left */
    TEAM_DUNGEON_UPDATE: 'teamDungeonUpdate',

    /** Team dungeon battle started */
    TEAM_DUNGEON_START: 'teamDungeonStart',

    /** Team dungeon reward distributed */
    TEAM_DUNGEON_REWARD: 'teamDungeonReward',

    // =============================================
    // P2 — World Boss
    // =============================================

    /** World boss spawned */
    WORLD_BOSS_SPAWN: 'worldBossSpawn',

    /** World boss died */
    WORLD_BOSS_DIE: 'worldBossDie',

    /** World boss rank updated */
    WORLD_BOSS_RANK: 'worldBossRank',

    // =============================================
    // P2 — Dragon Ball War
    // =============================================

    /** Dragon Ball War started */
    DRAGON_BALL_WAR_START: 'dragonBallWarStart',

    /** Dragon Ball War ended */
    DRAGON_BALL_WAR_END: 'dragonBallWarEnd',

    /** Dragon Ball War rank update */
    DRAGON_BALL_WAR_RANK: 'dragonBallWarRank',

    // =============================================
    // P2 — Misc
    // =============================================

    /** Black market / boss competition notification */
    BOSS_COMPETITION: 'bossCompetition',

    /** Questionnaire / survey available */
    QUESTIONNAIRE: 'questionnaire',

    /** Friend online/offline status change */
    FRIEND_ONLINE: 'friendOnline',

    /** Expedition speed-up complete */
    EXPEDITION_COMPLETE: 'expeditionComplete',

    /** Server maintenance warning */
    MAINTENANCE: 'maintenance',

    /** Snake game special event */
    SNAKE_EVENT: 'snakeEvent',

    /** Ball War event */
    BALL_WAR_EVENT: 'ballWarEvent',
};

module.exports = NOTIFY_ACTION;
