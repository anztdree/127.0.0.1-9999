/**
 * ============================================================================
 * enterGame — User Handler
 * ============================================================================
 *
 * CRITICAL handler — this is the FIRST request the client sends after
 * TEA verification. It must return the ENTIRE game state in one response.
 * Client calls UserDataParser.saveUserData(response) which parses 60+ fields.
 *
 * Client request (from main.min.js):
 *   {
 *     type: "user",
 *     action: "enterGame",
 *     loginToken:  "...",          // from login-server loginGame response
 *     userId:      "28178141",     // numeric string (NOT UUID)
 *     serverId:    2079,           // integer
 *     version:     "1.0",
 *     language:    "en",
 *     gameVersion: "20260302_153332-EN"
 *   }
 *
 * Flow:
 *   1. Validate loginToken against login_tokens table (shared DB)
 *      - Find WHERE token=? AND used=0 AND expires_at > NOW()
 *      - Mark used=1 (single-use token, prevents replay)
 *   2. Load game_user from game_users table
 *      - If not found → create new user with defaults (newUser=true)
 *      - If found → update last_login_time
 *   3. Load all game data from DB tables:
 *      - game_heroes    → heros
 *      - game_items     → totalProps
 *      - game_equips    → equip
 *      - game_guilds + game_guild_members → guildName, userGuild info
 *      - game_arena     → _arenaTeam, _arenaSuper
 *      - game_daily_tasks → timesInfo, scheduleInfo
 *      - game_main_tasks → curMainTask
 *      - chat_messages  → broadcastRecord (recent world chat)
 *      - chat_mutes     → forbiddenChat
 *   4. Merge game_users.data_json (sub-module state: hangup, summon, etc.)
 *   5. Assemble full response object
 *   6. Return compressed response
 *
 * Response fields consumed by UserDataParser.saveUserData():
 *   ─ REQUIRED (unconditional access, will crash if missing):
 *     currency, user, hangup, summon, totalProps, heros, superSkill,
 *     curMainTask, scheduleInfo, dragonEquiped, serverId, serverVersion,
 *     broadcastRecord, blacklist
 *   ─ CONDITIONAL (checked with &&, null skips parsing):
 *     newUser, backpackLevel, imprint, checkin, equip, weapon, genki,
 *     dungeon, counterpart, teamTechnology, teamTraining, heroSkin,
 *     userGuild, userGuildPub, guildLevel, guildTreasureMatchRet,
 *     channelSpecial, cellgameHaveSetHero, vipLog, cardLog, guide,
 *     guildName, clickSystem, giftInfo, monthCard, recharge, timesInfo,
 *     userDownloadReward, YouTuberRecruit, userYouTuberRecruit,
 *     timeMachine, _arenaTeam, _arenaSuper, timeBonusInfo,
 *     onlineBulletin, karinStartTime, karinEndTime, serverOpenDate,
 *     lastTeam, heroImageVersion, superImageVersion, training, warInfo,
 *     userWar, headEffect, userBallWar, ballWarState, ballBroadcast,
 *     ballWarInfo, guildActivePoints, enableShowQQ, showQQVip, showQQ,
 *     showQQImg1, showQQImg2, showQQUrl, hideHeroes, expedition,
 *     timeTrial, timeTrialNextOpenTime, retrieve, battleMedal,
 *     shopNewHeroes, teamDungeon, teamServerHttpUrl, teamDungeonOpenTime,
 *     teamDungeonTask, teamDungeonSplBcst, teamDungeonNormBcst,
 *     teamDungeonHideInfo, templeLess, teamDungeonInvitedFriends,
 *     myTeamServerSocketUrl, gemstone, questionnaires, resonance,
 *     fastTeam, forbiddenChat, gravity, littleGame, userTopBattle,
 *     topBattleInfo, sign, gemstone, imprint
 *
 * ============================================================================
 */

var CONSTANTS      = require('../../config/constants');
var ResponseHelper = require('../../core/responseHelper');
var DB             = require('../../services/db');
var logger         = require('../../utils/logger');
var helpers        = require('../../utils/helpers');

// ============================================
// DEFAULT GAME STATE — for new users
// ============================================

/**
 * Default sub-module state stored in game_users.data_json.
 * When a new user is created, this is the initial data_json value.
 * Future handler implementations will update specific fields as the player
 * progresses through the game.
 */
var DEFAULT_GAME_DATA = {
  // Hangup (campaign/idle) state
  hangup: {
    _curLess: 0,
    _maxPassLesson: 0,
    _haveGotChapterReward: {},
    _maxPassChapter: 0,
    _clickGlobalWarBuffTag: 0,
    _buyFund: 0,
    _haveGotFundReward: {}
  },

  // Summon (gacha) state
  summon: {
    _energy: 0,
    _wishList: [],
    _wishVersion: 0,
    _canCommonFreeTime: 0,
    _canSuperFreeTime: 0,
    _summonTimes: {}
  },

  // Checkin (sign-in)
  checkin: {},

  // Imprint
  imprint: { _items: [] },

  // Sign data
  sign: {},

  // Equip state
  equip: { _suits: {} },

  // Weapon state
  weapon: { _items: [] },

  // Genki state
  genki: {},

  // Dungeon state
  dungeon: { _dungeons: {} },

  // Team technology
  teamTechnology: {},

  // Team training
  teamTraining: {},

  // Super skill
  superSkill: {},

  // Schedule info (refresh counters)
  scheduleInfo: {},

  // Gift info (welfare: first recharge, VIP rewards, etc.)
  giftInfo: {},

  // Times info (daily counters)
  timesInfo: {},

  // Guide progress
  guide: {},

  // Training / padipata
  training: {},

  // Time machine
  timeMachine: {},

  // Time bonus info
  timeBonusInfo: {},

  // Online bulletin
  onlineBulletin: [],

  // Expedition
  expedition: {},

  // Space trial / time trial
  timeTrial: {},

  // Gravity trial
  gravity: {},

  // Little game
  littleGame: {},

  // Retrieve (get back resources)
  retrieve: {},

  // Battle medal
  battleMedal: {},

  // Guild treasure match
  guildTreasureMatchRet: null,

  // Channel special
  channelSpecial: {},

  // YouTuber recruit
  YouTuberRecruit: null,
  userYouTuberRecruit: null,

  // Questionnaires
  questionnaires: null,

  // Resonance
  resonance: {},

  // Fast team
  fastTeam: null,

  // Gemstone
  gemstone: {},

  // Top battle
  userTopBattle: null,
  topBattleInfo: null
};

// ============================================
// HELPER: Validate loginToken
// ============================================

/**
 * Validate and consume login token.
 * Token was created by login-server on loginGame.
 *
 * Token format: {userId}_{timestamp}_{random8chars}
 * Stored in: login_tokens table (shared DB with login-server)
 *
 * @param {string} loginToken
 * @returns {Promise<object|null>} Token row or null if invalid
 */
async function validateLoginToken(loginToken) {
  if (!loginToken) return null;

  try {
    var row = await DB.queryOne(
      'SELECT * FROM login_tokens WHERE token = ? AND used = 0 AND expires_at > ?',
      [loginToken, Date.now()]
    );

    if (!row) {
      logger.warn('enterGame', 'Invalid or expired loginToken');
      return null;
    }

    // Mark token as used (single-use — prevents replay attacks)
    await DB.query(
      'UPDATE login_tokens SET used = 1 WHERE token = ?',
      [loginToken]
    );

    return row;

  } catch (err) {
    logger.error('enterGame', 'Token validation error: ' + err.message);
    return null;
  }
}

// ============================================
// HELPER: Load or create game user
// ============================================

/**
 * Load existing game_user or create new one with defaults.
 *
 * @param {string} userId       - Numeric string userId from client
 * @param {number} serverId     - Server ID from request
 * @param {string} oriUserId    - Original userId from token (for game_users.user_id)
 * @returns {Promise<object>}   { userRow, isNewUser }
 */
async function loadOrCreateGameUser(userId, serverId, oriUserId) {
  // Try to find existing user by user_id
  var userRow = await DB.queryOne(
    'SELECT * FROM game_users WHERE user_id = ? LIMIT 1',
    [userId]
  );

  if (userRow) {
    // Existing user — update last login time
    var now = Date.now();
    await DB.query(
      'UPDATE game_users SET last_login_time = ? WHERE user_id = ?',
      [now, userId]
    );

    return { userRow: userRow, isNewUser: false };
  }

  // ------------------------------------------
  // New user — create with defaults
  // ------------------------------------------
  var now = Date.now();

  var newUserRow = {
    user_id:                 userId,
    nick_name:               'Player_' + userId,
    head_image:              '',
    level:                   1,
    exp:                     0,
    vip_level:               0,
    vip_exp:                 0,
    gold:                    0,
    diamond:                 0,
    stamina:                 CONSTANTS.MAX_LIMITS.STAMINA_MAX,
    stamina_last_recover_time: now,
    from_channel:            '',
    channel_code:            '',
    ori_server_id:           serverId || CONSTANTS.DEFAULT_SERVER_ID,
    last_login_time:         now,
    create_time:             now,
    is_new:                  1,
    data_json:               JSON.stringify(DEFAULT_GAME_DATA)
  };

  await DB.query(
    'INSERT INTO game_users (user_id, nick_name, head_image, level, exp, ' +
    'vip_level, vip_exp, gold, diamond, stamina, stamina_last_recover_time, ' +
    'from_channel, channel_code, ori_server_id, last_login_time, create_time, ' +
    'is_new, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      newUserRow.user_id,
      newUserRow.nick_name,
      newUserRow.head_image,
      newUserRow.level,
      newUserRow.exp,
      newUserRow.vip_level,
      newUserRow.vip_exp,
      newUserRow.gold,
      newUserRow.diamond,
      newUserRow.stamina,
      newUserRow.stamina_last_recover_time,
      newUserRow.from_channel,
      newUserRow.channel_code,
      newUserRow.ori_server_id,
      newUserRow.last_login_time,
      newUserRow.create_time,
      newUserRow.is_new,
      newUserRow.data_json
    ]
  );

  logger.info('enterGame', 'New user created: ' + userId);

  // Create empty arena record
  try {
    await DB.query(
      'INSERT IGNORE INTO game_arena (user_id, rank, win_count, lose_count) VALUES (?, ?, 0, 0)',
      [userId, CONSTANTS.MAX_LIMITS.MAX_ARENA_RANK]
    );
  } catch (e) {
    // Non-critical
  }

  // Create empty main task record
  try {
    await DB.query(
      'INSERT IGNORE INTO game_main_tasks (user_id, data_json) VALUES (?, ?)',
      [userId, '{}']
    );
  } catch (e) {
    // Non-critical
  }

  return { userRow: newUserRow, isNewUser: true };
}

// ============================================
// HELPER: Load game data from DB tables
// ============================================

/**
 * Load all game data from DB tables.
 * Returns object with loaded data, safe to merge into response.
 */
async function loadGameData(userId) {
  var data = {
    heroes:          null,
    items:           null,
    equips:          null,
    guildInfo:       null,
    arenaData:       null,
    mainTask:        null,
    broadcastRecord: [],
    forbiddenChat:   null
  };

  // ------------------------------------------
  // Heroes
  // ------------------------------------------
  try {
    var heroRows = await DB.query(
      'SELECT hero_id, hero_display_id, data_json FROM game_heroes WHERE user_id = ?',
      [userId]
    );

    var heroList = [];
    for (var i = 0; i < heroRows.length; i++) {
      var hr = heroRows[i];
      try {
        var heroData = JSON.parse(hr.data_json || '{}');
        // Ensure core fields are present
        heroData._heroId = hr.hero_id;
        heroData._heroDisplayId = hr.hero_display_id;
        heroList.push(heroData);
      } catch (e) {
        // Skip malformed hero data
      }
    }
    data.heroes = { _heros: heroList };

  } catch (err) {
    logger.warn('enterGame', 'Load heroes failed: ' + err.message);
    data.heroes = { _heros: [] };
  }

  // ------------------------------------------
  // Items (backpack)
  // ------------------------------------------
  try {
    var itemRows = await DB.query(
      'SELECT item_id, num FROM game_items WHERE user_id = ?',
      [userId]
    );

    var itemsMap = {};
    for (var i = 0; i < itemRows.length; i++) {
      var ir = itemRows[i];
      itemsMap[String(ir.item_id)] = { _id: ir.item_id, _num: ir.num };
    }
    data.items = { _items: itemsMap };

  } catch (err) {
    logger.warn('enterGame', 'Load items failed: ' + err.message);
    data.items = { _items: {} };
  }

  // ------------------------------------------
  // Equips
  // ------------------------------------------
  try {
    var equipRows = await DB.query(
      'SELECT equip_id, data_json FROM game_equips WHERE user_id = ?',
      [userId]
    );

    var suitsMap = {};
    for (var i = 0; i < equipRows.length; i++) {
      var er = equipRows[i];
      try {
        var equipData = JSON.parse(er.data_json || '{}');
        suitsMap[er.equip_id] = equipData;
      } catch (e) {
        // Skip malformed equip data
      }
    }
    data.equips = { _suits: suitsMap };

  } catch (err) {
    logger.warn('enterGame', 'Load equips failed: ' + err.message);
    data.equips = { _suits: {} };
  }

  // ------------------------------------------
  // Guild info
  // ------------------------------------------
  try {
    var guildMember = await DB.queryOne(
      'SELECT guild_id, role FROM game_guild_members WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (guildMember) {
      var guild = await DB.queryOne(
        'SELECT guild_id, name, level, notice FROM game_guilds WHERE guild_id = ?',
        [guildMember.guild_id]
      );

      if (guild) {
        data.guildInfo = {
          guildName:   guild.name,
          guildLevel:  guild.level,
          guildId:     guild.guild_id,
          guildRole:   guildMember.role
        };
      }
    }
  } catch (err) {
    logger.warn('enterGame', 'Load guild failed: ' + err.message);
  }

  // ------------------------------------------
  // Arena
  // ------------------------------------------
  try {
    var arena = await DB.queryOne(
      'SELECT rank, win_count, lose_count, defence_team FROM game_arena WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (arena) {
      data.arenaData = arena;
    }
  } catch (err) {
    logger.warn('enterGame', 'Load arena failed: ' + err.message);
  }

  // ------------------------------------------
  // Main task
  // ------------------------------------------
  try {
    var mainTaskRow = await DB.queryOne(
      'SELECT data_json FROM game_main_tasks WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (mainTaskRow) {
      try {
        data.mainTask = JSON.parse(mainTaskRow.data_json || '{}');
      } catch (e) {
        data.mainTask = {};
      }
    } else {
      data.mainTask = {};
    }
  } catch (err) {
    logger.warn('enterGame', 'Load main task failed: ' + err.message);
    data.mainTask = {};
  }

  // ------------------------------------------
  // Broadcast record (recent world chat for chatJoinRecord)
  // Client calls ts.chatJoinRecord({ _record: response.broadcastRecord })
  // Each entry is a ChatDataBaseClass with _kind field
  // ------------------------------------------
  try {
    var recentMsgs = await DB.query(
      'SELECT user_id, kind, content, msg_type, param_json, server_time ' +
      'FROM chat_messages WHERE room_id = ? ORDER BY server_time DESC LIMIT 10',
      ['world_' + CONSTANTS.DEFAULT_SERVER_ID]
    );

    var record = [];
    for (var i = recentMsgs.length - 1; i >= 0; i--) {
      var msg = recentMsgs[i];
      var paramObj = {};
      try { paramObj = JSON.parse(msg.param_json || '{}'); } catch (e) { /* ignore */ }

      record.push({
        _kind:     msg.kind || 0,
        _content:  msg.content || '',
        _id:       msg.user_id || '',
        _name:     '',   // will be populated by chat-server
        _image:    '',
        _type:     msg.msg_type || 0,
        _param:    paramObj,
        _time:     msg.server_time || 0
      });
    }
    data.broadcastRecord = record;

  } catch (err) {
    logger.warn('enterGame', 'Load broadcast record failed: ' + err.message);
    data.broadcastRecord = [];
  }

  // ------------------------------------------
  // Forbidden chat (muted users)
  // Client: BroadcastSingleton.getInstance().setUserBidden(e.forbiddenChat)
  // Expects: { users: [...], finishTime: {...} } or null
  // ------------------------------------------
  try {
    var mutes = await DB.query(
      'SELECT user_id, finish_time FROM chat_mutes WHERE finish_time > ?',
      [Date.now()]
    );

    if (mutes && mutes.length > 0) {
      var mutedUsers = [];
      var finishTimes = {};
      for (var i = 0; i < mutes.length; i++) {
        mutedUsers.push(mutes[i].user_id);
        finishTimes[mutes[i].user_id] = mutes[i].finish_time;
      }
      data.forbiddenChat = {
        users:       mutedUsers,
        finishTime:  finishTimes
      };
    }
  } catch (err) {
    logger.warn('enterGame', 'Load forbidden chat failed: ' + err.message);
  }

  return data;
}

// ============================================
// HELPER: Assemble full response
// ============================================

/**
 * Build the complete enterGame response object.
 *
 * @param {object} userRow    - game_users row
 * @param {boolean} isNewUser - Whether this is a new user
 * @param {object} gameData   - Loaded game data from loadGameData()
 * @param {number} serverId   - Server ID from request
 * @returns {object} Full response data object
 */
function assembleResponse(userRow, isNewUser, gameData, serverId) {
  // ------------------------------------------
  // Parse data_json (sub-module state)
  // ------------------------------------------
  var savedData = {};
  try {
    savedData = JSON.parse(userRow.data_json || '{}');
  } catch (e) {
    savedData = {};
  }

  // Deep merge: savedData overrides DEFAULT_GAME_DATA defaults
  var moduleState = helpers.clone(DEFAULT_GAME_DATA);
  for (var key in savedData) {
    if (savedData.hasOwnProperty(key)) {
      moduleState[key] = savedData[key];
    }
  }

  // ------------------------------------------
  // Build response
  // ------------------------------------------
  var now = Date.now();
  var response = {};

  // === REQUIRED FIELDS (unconditional) ===

  // Currency — from game_users row
  response.currency = {
    _items: {
      '1':  { _id: 1, _num: userRow.gold },       // gold
      '2':  { _id: 2, _num: userRow.diamond },     // diamond
      '3':  { _id: 3, _num: userRow.stamina }      // stamina
    }
  };

  // User info
  response.user = {
    _id:               userRow.user_id,
    _pwd:              'game_origin',
    _nickName:         userRow.nick_name || ('Player_' + userRow.user_id),
    _headImage:        userRow.head_image || '',
    _lastLoginTime:    userRow.last_login_time || now,
    _createTime:       userRow.create_time || now,
    _bulletinVersions: '',
    _oriServerId:      userRow.ori_server_id || serverId,
    _nickChangeTimes:  0
  };

  // Hangup (campaign)
  response.hangup = moduleState.hangup;
  // Top-level fields referenced by setOnHook
  response.globalWarBuffTag     = moduleState.globalWarBuffTag || 0;
  response.globalWarLastRank    = moduleState.globalWarLastRank || 0;
  response.globalWarBuff        = moduleState.globalWarBuff || null;
  response.globalWarBuffEndTime = moduleState.globalWarBuffEndTime || 0;

  // Summon
  response.summon = moduleState.summon;

  // Backpack
  response.totalProps     = gameData.items || { _items: {} };
  response.backpackLevel  = moduleState.backpackLevel || 20;

  // Heroes
  response.heros = gameData.heroes || { _heros: [] };

  // Super skill
  response.superSkill = moduleState.superSkill || {};

  // Main task
  response.curMainTask = gameData.mainTask || {};

  // Schedule info
  response.scheduleInfo = moduleState.scheduleInfo || {};

  // Dragon ball equipped
  response.dragonEquiped = moduleState.dragonEquiped || [];

  // Server info
  response.serverId      = serverId;
  response.serverVersion = '1.0';

  // Broadcast record (for chatJoinRecord)
  response.broadcastRecord = gameData.broadcastRecord || [];

  // Blacklist (chat blocked users)
  response.blacklist = moduleState.blacklist || [];

  // Checkin
  response.checkin = moduleState.checkin || {};

  // === CONDITIONAL FIELDS (checked with &&, null/undefined skips parsing) ===

  // New user flag — triggers SDK create-role analytics on client
  response.newUser = isNewUser ? true : undefined;

  // Imprint / Sign
  response.imprint = moduleState.imprint || undefined;
  response.sign    = moduleState.sign || undefined;

  // Equip
  response.equip   = gameData.equips || undefined;
  response.weapon  = moduleState.weapon || undefined;
  response.genki   = moduleState.genki || undefined;

  // Dungeon / Counterpart
  response.dungeon     = moduleState.dungeon || undefined;
  response.counterpart = moduleState.counterpart || undefined;

  // Guild data
  if (gameData.guildInfo) {
    response.guildName = gameData.guildInfo.guildName;
    response.guildLevel = gameData.guildInfo.guildLevel;
  }

  // Team technology & training
  response.teamTechnology = moduleState.teamTechnology || undefined;
  response.teamTraining   = moduleState.teamTraining || undefined;

  // Hero skin
  response.heroSkin = moduleState.heroSkin || undefined;

  // Channel special
  response.channelSpecial = moduleState.channelSpecial || undefined;

  // Gift info (welfare)
  response.giftInfo = moduleState.giftInfo || undefined;

  // Times info
  response.timesInfo = moduleState.timesInfo || undefined;

  // User download reward
  response.userDownloadReward = moduleState.userDownloadReward || undefined;

  // YouTuber recruit
  response.YouTuberRecruit     = moduleState.YouTuberRecruit || undefined;
  response.userYouTuberRecruit = moduleState.userYouTuberRecruit || undefined;

  // Time machine
  response.timeMachine = moduleState.timeMachine || undefined;

  // Time bonus info
  response.timeBonusInfo = moduleState.timeBonusInfo || undefined;

  // Online bulletin
  response.onlineBulletin = moduleState.onlineBulletin || undefined;

  // Karin (Tower)
  response.karinStartTime = moduleState.karinStartTime || undefined;
  response.karinEndTime   = moduleState.karinEndTime || undefined;

  // Server open date
  response.serverOpenDate = moduleState.serverOpenDate || userRow.create_time || now;

  // Last team
  response.lastTeam = moduleState.lastTeam || { _lastTeamInfo: [] };

  // Hero image versions
  response.heroImageVersion = moduleState.heroImageVersion || undefined;
  response.superImageVersion = moduleState.superImageVersion || undefined;

  // Training / padipata
  response.training = moduleState.training || undefined;

  // War info (Global War)
  response.warInfo  = moduleState.warInfo || undefined;
  response.userWar  = moduleState.userWar || undefined;

  // Head effect
  response.headEffect = moduleState.headEffect || undefined;

  // Ball War (guild)
  response.userBallWar    = moduleState.userBallWar || undefined;
  response.ballWarState   = moduleState.ballWarState || undefined;
  response.ballBroadcast  = moduleState.ballBroadcast || undefined;
  response.ballWarInfo    = moduleState.ballWarInfo || undefined;

  // Guild active points
  response.guildActivePoints = moduleState.guildActivePoints || undefined;

  // QQ integration (not used for web)
  response.enableShowQQ = moduleState.enableShowQQ || undefined;
  response.showQQVip    = moduleState.showQQVip || undefined;
  response.showQQ       = moduleState.showQQ || undefined;
  response.showQQImg1   = moduleState.showQQImg1 || undefined;
  response.showQQImg2   = moduleState.showQQImg2 || undefined;
  response.showQQUrl    = moduleState.showQQUrl || undefined;

  // Hide heroes
  response.hideHeroes = moduleState.hideHeroes || undefined;

  // Expedition
  response.expedition = moduleState.expedition || undefined;

  // Time trial
  response.timeTrial           = moduleState.timeTrial || undefined;
  response.timeTrialNextOpenTime = moduleState.timeTrialNextOpenTime || undefined;

  // Retrieve
  response.retrieve = moduleState.retrieve || undefined;

  // Battle medal
  response.battleMedal = moduleState.battleMedal || undefined;

  // Shop new heroes
  response.shopNewHeroes = moduleState.shopNewHeroes || undefined;

  // Team dungeon
  response.teamDungeon              = moduleState.teamDungeon || undefined;
  response.teamServerHttpUrl        = 'http://' + CONSTANTS.SERVER_PUBLIC_HOST + ':' + CONSTANTS.DUNGEON_SERVER_PORT;
  response.teamDungeonOpenTime      = moduleState.teamDungeonOpenTime || undefined;
  response.teamDungeonTask          = moduleState.teamDungeonTask || undefined;
  response.teamDungeonSplBcst       = moduleState.teamDungeonSplBcst || undefined;
  response.teamDungeonNormBcst      = moduleState.teamDungeonNormBcst || undefined;
  response.teamDungeonHideInfo      = moduleState.teamDungeonHideInfo || undefined;
  response.teamDungeonInvitedFriends = moduleState.teamDungeonInvitedFriends || undefined;

  // Temple less
  response.templeLess = moduleState.templeLess || undefined;

  // Dungeon server socket URL
  // Client stores: ts.loginInfo.serverItem.dungeonurl = e.myTeamServerSocketUrl
  response.myTeamServerSocketUrl = 'http://' + CONSTANTS.SERVER_PUBLIC_HOST + ':' + CONSTANTS.DUNGEON_SERVER_PORT;

  // Gemstone
  response.gemstone = moduleState.gemstone || undefined;

  // Questionnaires
  response.questionnaires = moduleState.questionnaires || undefined;

  // Resonance
  response.resonance = moduleState.resonance || undefined;

  // Fast team
  response.fastTeam = moduleState.fastTeam || undefined;

  // Top battle
  response.userTopBattle = moduleState.userTopBattle || undefined;
  response.topBattleInfo = moduleState.topBattleInfo || undefined;

  // Arena team & super team
  if (gameData.arenaData) {
    var arenaTeam = null;
    var arenaSuper = null;
    try {
      arenaTeam = JSON.parse(gameData.arenaData.defence_team || 'null');
    } catch (e) { /* ignore */ }
    response._arenaTeam = arenaTeam;
    response._arenaSuper = arenaSuper;
  } else {
    response._arenaTeam = undefined;
    response._arenaSuper = undefined;
  }

  // VIP log
  response.vipLog = moduleState.vipLog || undefined;

  // Card log (month card)
  response.cardLog = moduleState.cardLog || undefined;

  // Guide
  response.guide = moduleState.guide || undefined;

  // Click system
  response.clickSystem = moduleState.clickSystem || undefined;

  // Month card
  response.monthCard = moduleState.monthCard || undefined;

  // Recharge
  response.recharge = moduleState.recharge || undefined;

  // Forbidden chat (muted users)
  response.forbiddenChat = gameData.forbiddenChat || undefined;

  // Gravity trial
  response.gravity = moduleState.gravity || undefined;

  // Little game
  response.littleGame = moduleState.littleGame || undefined;

  // Guild treasure match
  response.guildTreasureMatchRet = moduleState.guildTreasureMatchRet || undefined;

  return response;
}

// ============================================
// MAIN HANDLER
// ============================================

/**
 * Handle user.enterGame action
 *
 * @param {object}   socket   - Socket.IO socket
 * @param {object}   request  - Parsed request
 * @param {function} callback - Socket.IO ACK callback
 */
async function enterGame(socket, request, callback) {
  var loginToken  = request.loginToken;
  var userId      = request.userId;
  var serverId    = request.serverId || CONSTANTS.DEFAULT_SERVER_ID;

  // ------------------------------------------
  // 1. Validate required params
  // ------------------------------------------

  if (!loginToken || !userId) {
    logger.warn('enterGame', 'Missing loginToken or userId');
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  // ------------------------------------------
  // 2. Validate loginToken
  // ------------------------------------------

  var tokenRow = await validateLoginToken(loginToken);

  if (!tokenRow) {
    logger.warn('enterGame', 'Token validation failed for userId=' + userId);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.SESSION_EXPIRED), callback);
    return;
  }

  // Token user_id should match request userId (sanity check)
  if (tokenRow.user_id && String(tokenRow.user_id) !== String(userId)) {
    logger.warn('enterGame', 'Token userId mismatch: token=' +
      tokenRow.user_id + ' request=' + userId);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.SESSION_EXPIRED), callback);
    return;
  }

  logger.info('enterGame', 'Token validated for userId=' + userId);

  // ------------------------------------------
  // 3. Load or create game user
  // ------------------------------------------

  var result;
  try {
    result = await loadOrCreateGameUser(userId, serverId, tokenRow.user_id || userId);
  } catch (err) {
    logger.error('enterGame', 'Failed to load/create user: ' + err.message);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.UNKNOWN), callback);
    return;
  }

  var userRow   = result.userRow;
  var isNewUser = result.isNewUser;

  // ------------------------------------------
  // 4. Load all game data from DB
  // ------------------------------------------

  var gameData;
  try {
    gameData = await loadGameData(userId);
  } catch (err) {
    logger.error('enterGame', 'Failed to load game data: ' + err.message);
    // Non-fatal — continue with empty data
    gameData = {
      heroes: { _heros: [] },
      items: { _items: {} },
      equips: { _suits: {} },
      guildInfo: null,
      arenaData: null,
      mainTask: {},
      broadcastRecord: [],
      forbiddenChat: null
    };
  }

  // ------------------------------------------
  // 5. Assemble response
  // ------------------------------------------

  var responseData = assembleResponse(userRow, isNewUser, gameData, serverId);

  logger.info('enterGame', 'Response assembled for userId=' + userId +
    ' | newUser=' + isNewUser +
    ' | heroes=' + (responseData.heros._heros ? responseData.heros._heros.length : 0) +
    ' | items=' + Object.keys(responseData.totalProps._items || {}).length);

  // ------------------------------------------
  // 6. Send response (auto-compressed for large payloads)
  // ------------------------------------------

  ResponseHelper.sendResponse(socket, 'handler.process',
    ResponseHelper.success(responseData), callback);
}

// ============================================
// EXPORT
// ============================================

module.exports = enterGame;
