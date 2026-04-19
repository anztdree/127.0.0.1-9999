/**
 * =====================================================
 *  User Handler — handlers/user.js
 *  Port 8001 — Main Server
 *
 *  Actions: 13 total
 *  WRITE: 6 | READ: 7
 *
 *  100% derived from client code analysis.
 *
 *  CLIENT enterGame REQUEST (line 77350-77358):
 *    {
 *      type: "user",
 *      action: "enterGame",
 *      loginToken: ts.loginInfo.userInfo.loginToken,
 *      userId: ts.loginInfo.userInfo.userId,
 *      serverId: parseInt(ts.loginInfo.serverItem.serverId),
 *      version: "1.0",
 *      language: ToolCommon.getLanguage(),
 *      gameVersion: ToolCommon.getClientVer()
 *    }
 *
 *  CLIENT enterGame RESPONSE processed by UserDataParser.saveUserData() (line 77643-77724):
 *    Full player state object with 99+ fields.
 *    See defaultData.js generateNewUserData() for complete field list.
 *    CRITICAL: All top-level fields that client reads unconditionally
 *    (currency, user, hangup, summon, totalProps, heros, scheduleInfo,
 *    clickSystem, curMainTask, dragonEquiped) MUST be non-null.
 *
 *  CLIENT registChat REQUEST (line 77392-77397):
 *    {
 *      type: "user",
 *      action: "registChat",
 *      userId: UserInfoSingleton.getInstance().userId,
 *      version: "1.0"
 *    }
 *
 *  CLIENT registChat RESPONSE:
 *    {
 *      _success: boolean,
 *      _chatServerUrl: string,
 *      _worldRoomId: number,
 *      _guildRoomId: number,
 *      _teamDungeonChatRoom: number,
 *      _teamChatRoom: number
 *    }
 *
 *  DB SCHEMA:
 *    users table — stores account info (user_id, password, nick_name, etc.)
 *    user_data table — stores per-server game state as JSON blob (game_data column)
 *    login_tokens table — stores active login tokens for session validation
 *
 *  Usage:
 *    handler.handle(socket, parsedRequest, callback)
 * =====================================================
 */

'use strict';

var RH = require('../../shared/responseHelper');
var DB = require('../../database/connection');
var DefaultData = require('../../shared/defaultData');
var GameData = require('../../shared/gameData/loader');
var logger = require('../../shared/utils/logger');
var UserDataService = require('../services/userDataService');
var configModule = require('../../shared/config');
var chatConstants = require('../../chat-server/utils/chatConstants');

// =============================================
// ACTION HANDLERS
// =============================================

/**
 * enterGame — The MOST CRITICAL action.
 *
 * Called when client first connects to main server after TEA verify.
 * Returns full player state. If user is new, generates default data.
 *
 * CLIENT FLOW (line 77342-77366):
 *   1. clientEnterGame() sends request via mainClient
 *   2. On success: UserDataParser.saveUserData(response)
 *   3. Then: loginSuccessCallBack(response) → analytics + scene transition
 *   4. Then: reportToLoginEnterInfo() → loginClient.SaveUserEnterInfo
 *   5. Then: setInterval(registChat, 3000)
 *
 * @param {object} socket - Socket.IO socket
 * @param {object} parsed - Parsed request { type, action, userId, loginToken, serverId, version, language, gameVersion }
 * @param {function} callback - Socket.IO acknowledgment callback
 */
async function enterGame(socket, parsed, callback) {
    var userId = parsed.userId;
    var serverId = parsed.serverId || 1;
    var loginToken = parsed.loginToken;

    // Validate required fields
    if (!userId) {
        logger.warn('USER', 'enterGame: missing userId');
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing userId'));
    }

    logger.info('USER', 'enterGame: userId=' + userId + ', serverId=' + serverId);

    try {
        // =============================================
        // Step 1: Validate loginToken (MANDATORY)
        // =============================================
        // loginToken comes from SaveHistory response on login-server.
        // Login-server saves it to login_tokens table (single-use, 24h expiry).
        // We validate it here — NO bypass, NO dev mode fallback.
        //
        // Client flow: loginGame → SaveHistory → clientStartGame → enterGame
        // enterGame request (line 77350-77358):
        //   { type:"user", action:"enterGame", loginToken, userId, serverId, version, language, gameVersion }
        //
        // If validation fails, client shows error (ret !== 0) and may reload page (ret=38).
        if (!loginToken) {
            logger.warn('USER', 'enterGame: missing loginToken for userId=' + userId);
            return callback(RH.error(RH.ErrorCode.SESSION_EXPIRED, 'Missing loginToken'));
        }

        try {
            var tokenRows = await DB.query(
                'SELECT * FROM login_tokens WHERE user_id = ? AND token = ? AND used = 0 AND expires_at > ?',
                [userId, loginToken, Date.now()]
            );
            if (tokenRows.length === 0) {
                // Token not found, expired, or already used
                logger.warn('USER', 'enterGame: invalid/expired loginToken for userId=' + userId);
                return callback(RH.error(RH.ErrorCode.LOGIN_CHECK_FAILED, 'Invalid or expired loginToken'));
            }
            // Mark token as used (single-use — each enterGame needs a fresh token)
            await DB.query(
                'UPDATE login_tokens SET used = 1 WHERE user_id = ? AND token = ?',
                [userId, loginToken]
            );
            logger.info('USER', 'enterGame: loginToken validated and consumed for userId=' + userId);
        } catch (tokenErr) {
            // login_tokens table doesn't exist — DB not initialized properly
            logger.error('USER', 'enterGame: loginToken validation failed (DB error): ' + tokenErr.message);
            return callback(RH.error(RH.ErrorCode.LOGIN_CHECK_FAILED, 'Server database error'));
        }

        // =============================================
        // Step 2: Load or create user data via UserDataService
        // =============================================
        // UserDataService handles: DB query, JSON parse, mergeWithDefaults, cache
        // enterGame just decides: new player vs existing player
        var playerData = null;
        var isNewPlayer = false;

        try {
            playerData = await UserDataService.loadUserData(userId, serverId);
        } catch (loadErr) {
            logger.warn('USER', 'enterGame: loadUserData failed: ' + loadErr.message);
        }

        if (!playerData) {
            // New player — generate default data
            playerData = DefaultData.generateNewUserData(userId, userId, serverId);
            isNewPlayer = true;
            logger.info('USER', 'enterGame: new player data generated for userId=' + userId);
        } else {
            logger.info('USER', 'enterGame: loaded existing data for userId=' + userId);
        }

        // =============================================
        // Step 3: Update dynamic fields
        // =============================================
        var now = Date.now();

        // Update login time
        if (playerData.user) {
            playerData.user._lastLoginTime = now;
        }

        // newUser — response-time flag set per enterGame call
        // Not in defaultData (not persistent) — enterGame decides based on actual state
        playerData.newUser = isNewPlayer;

        // serverVersion — from server config, not a boolean check
        playerData.serverVersion = configModule.config.version || null;

        // serverOpenDate — set on first login, preserved after
        playerData.serverOpenDate = playerData.serverOpenDate || now;

        // FIX: guide._id MUST be userId (not empty string)
        // Client Home.initAll() at line 167178:
        //   if(0 != GuideInfoManager.getInstance().startGuide()) { ... e.setActs() ... }
        // startGuide() returns 0 when guide._id is empty → ENTIRE Home init SKIPS
        // → no activity icons, no battle/summon buttons, nothing renders!
        if (playerData.guide) {
            if (!playerData.guide._id) {
                playerData.guide._id = userId;
                logger.info('USER', 'enterGame: fixed guide._id for userId=' + userId);
            }
        }

        // =============================================
        // Step 4: Save to database
        // =============================================
        try {
            if (isNewPlayer) {
                // First time — INSERT new row into user_data table
                await DB.query(
                    'INSERT INTO user_data (user_id, server_id, game_data, last_login_time, update_time) VALUES (?, ?, ?, ?, ?)',
                    [userId, serverId, JSON.stringify(playerData), now, now]
                );
                logger.info('USER', 'enterGame: inserted new user_data for userId=' + userId);
            } else {
                // Existing player — UPDATE via UserDataService (cache-aware)
                await UserDataService.saveUserData(userId, playerData, serverId);
                logger.info('USER', 'enterGame: updated user_data for userId=' + userId);
            }
        } catch (saveErr) {
            logger.error('USER', 'enterGame: failed to save user_data: ' + saveErr.message);
        }

        // =============================================
        // Step 5: Track online status
        // =============================================
        try {
            // Remove old online record for this user+server
            await DB.query(
                'DELETE FROM user_online WHERE user_id = ? AND server_id = ?',
                [userId, serverId]
            );
            // Insert new online record
            await DB.query(
                'INSERT INTO user_online (user_id, server_id, socket_id, login_time) VALUES (?, ?, ?, ?)',
                [userId, serverId, socket.id, now]
            );
        } catch (onlineErr) {
            logger.warn('USER', 'enterGame: online tracking failed: ' + onlineErr.message);
        }

        // =============================================
        // Step 6: Validate & send response to client
        // =============================================
        // CRITICAL: Response format must match UserDataParser.saveUserData() expectations.
        // The response IS the full player state object — NOT wrapped in a container.
        // Client does: UserDataParser.saveUserData(response)
        // which reads response.currency, response.user, response.heros, etc. directly.
        //
        // SAFETY: Validate hangup._curLess is a valid lesson ID.
        // Client OnHookSingleton accesses lesson[lastSection] without null guard.
        // An invalid _curLess → lastSection → lesson[invalid].nextID → TypeError crash.
        if (playerData.hangup) {
            var lessonConfigs = null;
            try { lessonConfigs = require('../../shared/gameData/loader').get('lesson'); } catch (e) {}
            var curLess = playerData.hangup._curLess;
            if (!curLess || !lessonConfigs || !lessonConfigs[String(curLess)]) {
                var safeDefault = DefaultData.GAME_CONSTANTS.startLesson;
                logger.warn('USER', 'enterGame: invalid hangup._curLess=' + curLess +
                    ' for userId=' + userId + ', resetting to ' + safeDefault);
                playerData.hangup._curLess = safeDefault;
            }
        }

        // FIX: Validate giftInfo._onlineGift format
        // Client WelfareInfoManager.setOnlineGift(e) reads e._curId and e._nextTime.
        // If _onlineGift is not an object (e.g., was 0 from old default), client crashes.
        // This also fixes the Home.setOnLineGift() → onlineBonus[n].nextID TypeError.
        if (playerData.giftInfo) {
            var og = playerData.giftInfo._onlineGift;
            if (!og || typeof og !== 'object' || typeof og._curId !== 'number') {
                var oldVal = 0;
                if (typeof og === 'number' && og > 0) {
                    oldVal = og; // Preserve old numeric value as _curId
                }
                logger.warn('USER', 'enterGame: invalid giftInfo._onlineGift format for userId=' + userId +
                    ' (was: ' + JSON.stringify(og) + '), resetting to { _curId: ' + oldVal + ', _nextTime: 0 }');
                playerData.giftInfo._onlineGift = { _curId: oldVal, _nextTime: 0 };

                // If this is an existing player with corrupted data, set first tier's nextTime
                if (oldVal === 0 && !isNewPlayer) {
                    try {
                        var onlineBonusConfigs = require('../../shared/gameData/loader').get('onlineBonus');
                        if (onlineBonusConfigs && onlineBonusConfigs['1']) {
                            playerData.giftInfo._onlineGift._nextTime = now + (onlineBonusConfigs['1'].time * 1000);
                        }
                    } catch (e) {}
                }
            } else {
                // Object is valid — ensure _nextTime is reasonable
                // If _nextTime is 0 and _curId is 0, set the first tier timer
                if (og._curId === 0 && og._nextTime === 0) {
                    try {
                        var onlineBonusConfigs2 = require('../../shared/gameData/loader').get('onlineBonus');
                        if (onlineBonusConfigs2 && onlineBonusConfigs2['1']) {
                            og._nextTime = now + (onlineBonusConfigs2['1'].time * 1000);
                            logger.info('USER', 'enterGame: set first online bonus timer for userId=' + userId);
                        }
                    } catch (e) {}
                }
            }
        }

        callback(RH.success(playerData));

        // FIX 16: Set socket._userId after enterGame so other handlers can use it
        // (e.g., exitGame uses socket._userId as fallback when parsed.userId is missing)
        socket._userId = userId;

        logger.info('USER', 'enterGame: success for userId=' + userId + ', newUser=' + isNewPlayer);

    } catch (err) {
        logger.error('USER', 'enterGame: unhandled error for userId=' + userId + ': ' + err.message);
        logger.error('USER', 'enterGame: stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

/**
 * registChat — Register chat room after entering game.
 *
 * Called every 3 seconds until successful (line 77364-77366).
 * Returns chat server connection info and room IDs.
 *
 * CLIENT CODE (line 77390-77399):
 *   ts.processHandler({
 *       type: "user", action: "registChat",
 *       userId: UserInfoSingleton.getInstance().userId, version: "1.0"
 *   }, function(n) {
 *       if (n._success) {
 *           ts.loginInfo.serverItem.chaturl = n._chatServerUrl
 *           ts.loginInfo.serverItem.worldRoomId = n._worldRoomId
 *           ts.loginInfo.serverItem.guildRoomId = n._guildRoomId
 *           ts.loginInfo.serverItem.teamDungeonChatRoom = n._teamDungeonChatRoom
 *           ts.loginInfo.serverItem.teamChatRoomId = n._teamChatRoom
 *           clearInterval(ts.chatInterval)
 *           t.clientStartChat(false, e)  // connect chatClient
 *       } else {
 *           ts.chatConnectCount++
 *           ts.chatConnectCount > 15 && clearInterval(ts.chatInterval)
 *       }
 *   })
 *
 * CLIENT FLOW AFTER SUCCESS (line 77400-77489):
 *   1. clientStartChat → chatClient.connectToServer(chaturl)
 *   2. On connect → chatLoginRequest(false, joinRecord)
 *   3. chatLoginRequest joins rooms via Promise.all:
 *      - worldRoomId         → ALWAYS joined (server-wide)
 *      - guildRoomId         → joined only if truthy (player-specific)
 *      - teamDungeonChatRoom → joined only if truthy (server-wide)
 *      - teamChatRoom        → joined only if truthy (player-specific)
 *
 * ROOM ID SCHEME:
 *   Defined in chat-server/utils/chatConstants.js:
 *     getRoomId(roomType, serverId) = serverId * 100 + roomType
 *   Room types: WORLD=1, GUILD=2, TEAM_DUNGEON=3, TEAM=4
 *   For serverId=1: 101, 102, 103, 104
 *
 * GUILD & TEAM ROOM IDs:
 *   These are player-specific (each guild/team has its own room).
 *   At registChat time, player hasn't loaded guild/team data yet.
 *   They are set later by guild/team handler responses:
 *     - guildRoomId: line 77178 → ts.loginInfo.serverItem.guildRoomId = e._chatRoomId
 *     - teamChatRoomId: line 87496 → ts.loginInfo.serverItem.teamChatRoomId = o
 *   Returning null here is correct — client checks truthiness before joining.
 *
 * @param {object} socket
 * @param {object} parsed - { type, action, userId, version }
 * @param {function} callback
 */
async function registChat(socket, parsed, callback) {
    var userId = parsed.userId;

    if (!userId) {
        logger.warn('USER', 'registChat: missing userId');
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing userId'));
    }

    logger.info('USER', 'registChat: userId=' + userId);

    // Chat server URL — use serverPublicHost (same pattern as getServerList/buildServerUrl)
    var config = configModule.config;
    var chatServerUrl = 'http://' + config.serverPublicHost + ':' + config.ports.chat;

    // Room IDs — use chatConstants.getRoomId() for consistency with chat-server
    // Default serverId=1: WORLD=101, GUILD=102, TEAM_DUNGEON=103, TEAM=104
    // Only worldRoomId and teamDungeonChatRoom are server-wide (always joined).
    // guildRoomId and teamChatRoom are player-specific (set later by guild/team handlers).
    callback(RH.success({
        _success: true,
        _chatServerUrl: chatServerUrl,
        _worldRoomId: chatConstants.getRoomId(chatConstants.ROOM_TYPE.WORLD),
        _guildRoomId: null,
        _teamDungeonChatRoom: chatConstants.getRoomId(chatConstants.ROOM_TYPE.TEAM_DUNGEON),
        _teamChatRoom: null,
    }));
}

/**
 * exitGame — Player exits game, save data and cleanup.
 *
 * CLIENT CODE: Called when player exits or closes game.
 *
 * @param {object} socket
 * @param {object} parsed
 * @param {function} callback
 */
async function exitGame(socket, parsed, callback) {
    var userId = parsed.userId || socket._userId;
    var serverId = parsed.serverId || 1;

    logger.info('USER', 'exitGame: userId=' + userId + ', serverId=' + serverId);

    try {
        // FIX 16: Add server_id filter to online cleanup DELETE query
        // Without server_id filter, exiting one server would clear online status
        // on all servers for this user.
        if (userId) {
            await DB.query(
                'DELETE FROM user_online WHERE user_id = ? AND server_id = ?',
                [userId, serverId]
            );
        }
    } catch (err) {
        logger.warn('USER', 'exitGame: cleanup failed: ' + err.message);
    }

    callback(RH.success({}));
}

/**
 * changeNickName — Change player's display nickname.
 *
 * CLIENT CODE: Opens nickname input UI, validates length (12 chars max from constant.json).
 *
 * @param {object} socket
 * @param {object} parsed - { userId, nickName }
 * @param {function} callback
 */
async function changeNickName(socket, parsed, callback) {
    var userId = parsed.userId;
    var nickName = parsed.nickName;

    if (!nickName || nickName.length === 0) {
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing nickName'));
    }

    logger.info('USER', 'changeNickName: userId=' + userId + ', nickName=' + nickName);

    // TODO: Validate nickname (length, forbidden words, etc.)
    // TODO: Update in users table
    // TODO: Update playerData.user._nickName

    callback(RH.success({
        _changeInfo: {
            _nickName: nickName,
        },
    }));
}

/**
 * changeHeadImage — Change player's avatar/head image.
 *
 * @param {object} socket
 * @param {object} parsed - { userId, headImageId }
 * @param {function} callback
 */
async function changeHeadImage(socket, parsed, callback) {
    var userId = parsed.userId;
    var headImageId = parsed.headImageId;

    if (!headImageId) {
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing headImageId'));
    }

    logger.info('USER', 'changeHeadImage: userId=' + userId + ', headImageId=' + headImageId);

    callback(RH.success({
        _changeInfo: {
            _headImage: headImageId,
        },
    }));
}

/**
 * changeHeadBox — Change player's equipped head frame/avatar box.
 *
 * @param {object} socket
 * @param {object} parsed - { userId, headBoxId }
 * @param {function} callback
 */
async function changeHeadBox(socket, parsed, callback) {
    var userId = parsed.userId;
    var headBoxId = parsed.headBoxId;

    if (!headBoxId) {
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing headBoxId'));
    }

    logger.info('USER', 'changeHeadBox: userId=' + userId + ', headBoxId=' + headBoxId);

    callback(RH.success({
        _changeInfo: {
            _headBox: headBoxId,
        },
    }));
}

/**
 * clickSystem — Record a system UI click event / daily reward claim tracking.
 *
 * Called when user clicks certain system panels (Temple Trial privilege,
 * Chapter fund privilege) to mark them as "seen" and persist to user_data.
 *
 * CLIENT CODE (line 148728, 159924):
 *   ts.processHandler({
 *       type: "user", action: "clickSystem",
 *       sysType: CLICK_SYSTEM.TEMPLE_FUND,   // or CLICK_SYSTEM.LESSON_FUND
 *       userId: e
 *   }, function(e) {
 *       UserClickSingleton.getInstance().setClickSys(CLICK_SYSTEM.TEMPLE_FUND, !0)
 *   })
 *
 * CALLBACK BEHAVIOR:
 *   Client does NOT read the response body. It only hardcodes
 *   setClickSys(type, true) locally. So response format is irrelevant
 *   to the client — but server should still persist the state.
 *
 * CLICK_SYSTEM enum:
 *   LESSON_FUND = 1  (Chapter fund privilege)
 *   TEMPLE_FUND = 2  (Temple Trial fund privilege)
 *
 * USER DATA STRUCTURE:
 *   clickSystem: { _clickSys: { "1": false, "2": false } }
 *   Loaded on login (line 77645-77646), iterated with for...in.
 *
 * @param {object} socket
 * @param {object} parsed - { type, action, userId, sysType, version }
 * @param {function} callback
 */
async function clickSystem(socket, parsed, callback) {
    var userId = parsed.userId;
    var sysType = parsed.sysType;

    logger.info('USER', 'clickSystem: userId=' + userId + ', sysType=' + sysType);

    callback(RH.success({}));
}

/**
 * getBulletinBrief — Get summary/list of bulletin/announcement headers.
 *
 * Called on login (UserDataParser.saveUserData line 77645, fire-and-forget)
 * and when user opens Notice Board tab (5-minute throttle).
 *
 * CLIENT CODE (line 79579):
 *   ts.processHandler({
 *       type: "user", action: "getBulletinBrief",
 *       userId: n, version: "1.0"
 *   }, function(n) {
 *       t.bulletinList = {};
 *       for (var o in n._brief)
 *           t.bulletinList[o] = {
 *               bulletin: "",
 *               bulletinTitle: n._brief[o].title,
 *               bulletinVersion: n._brief[o].version,
 *               order: n._brief[o].order
 *           };
 *       e && e()
 *   })
 *
 * RESPONSE FORMAT:
 *   { _brief: { <id>: { title: string, version: string, order: number }, ... } }
 *   _brief is an OBJECT keyed by bulletin ID, NOT an array.
 *   Client iterates with for...in, reads .title, .version, .order.
 *   Empty object {} = no bulletins = Notice Board shows nothing.
 *
 * RED DOT LOGIC (getBulletinRed):
 *   Compares local bulletinVersions (persisted per-user) against each
 *   bulletin's version. Mismatch → show red dot on Notice Board tab.
 *
 * @param {object} socket
 * @param {object} parsed - { type, action, userId, version }
 * @param {function} callback
 */
async function getBulletinBrief(socket, parsed, callback) {
    var userId = parsed.userId;

    logger.info('USER', 'getBulletinBrief: userId=' + (userId || '-'));

    // Return bulletin brief list.
    // _brief = object keyed by bulletin ID, each with title/version/order.
    // Empty object {} = no bulletins (local game, no admin panel to create).
    // Client iterates with for...in → no iterations → bulletinList = {}.
    callback(RH.success({
        _brief: {},
    }));
}

/**
 * queryPlayerHeadIcon — Query available head icons/avatars.
 *
 * @param {object} socket
 * @param {object} parsed
 * @param {function} callback
 */
async function queryPlayerHeadIcon(socket, parsed, callback) {
    logger.info('USER', 'queryPlayerHeadIcon: userId=' + (parsed.userId || '-'));

    callback(RH.success({
        _headIconList: [],
    }));
}

/**
 * readBulletin — Read full content of a specific bulletin.
 *
 * Called when user expands a bulletin item in the Notice Board that
 * hasn't been loaded yet, or clicks a bulletin with the "new" badge.
 *
 * CLIENT CODE (line 129477):
 *   ts.processHandler({
 *       type: "user", action: "readBulletin",
 *       userId: i, id: a, version: "1.0"
 *   }, function(t) {
 *       e.data.noticeInfo = MailInfoManager.getInstance().saveBulletin(a, t);
 *       ts.currentSceneNode;
 *       ts.refreshNodeRed(), n()
 *   })
 *
 * RESPONSE FORMAT (read by saveBulletin):
 *   { _bulletin: string, _bulletinTitle: string, _bulletinVersion: string }
 *   All 3 fields are read FLAT from the response — NOT wrapped in an object.
 *   saveBulletin sets bulletinVersions[id] = response._bulletinVersion
 *   and updates bulletinList[id] with the content.
 *
 * @param {object} socket
 * @param {object} parsed - { type, action, userId, id, version }
 *                          Note: client sends `id`, NOT `bulletinId`
 * @param {function} callback
 */
async function readBulletin(socket, parsed, callback) {
    var bulletinId = parsed.id;

    logger.info('USER', 'readBulletin: bulletinId=' + (bulletinId || '-'));

    callback(RH.success({
        _bulletin: '',
        _bulletinTitle: '',
        _bulletinVersion: '',
    }));
}

/**
 * suggest — Get recommended content.
 *
 * @param {object} socket
 * @param {object} parsed - { suggestType }
 * @param {function} callback
 */
async function suggest(socket, parsed, callback) {
    logger.info('USER', 'suggest: suggestType=' + (parsed.suggestType || '-'));

    callback(RH.success({
        _suggestList: [],
    }));
}

/**
 * saveFastTeam — Save a quick-access battle team composition.
 *
 * @param {object} socket
 * @param {object} parsed - { userId, teamIndex, heroList }
 * @param {function} callback
 */
async function saveFastTeam(socket, parsed, callback) {
    var userId = parsed.userId;
    var teamIndex = parsed.teamIndex;
    var heroList = parsed.heroList;

    logger.info('USER', 'saveFastTeam: userId=' + userId + ', teamIndex=' + teamIndex);

    callback(RH.success({
        _changeInfo: {
            _fastTeam: {},
        },
    }));
}

/**
 * setFastTeamName — Rename a saved quick-access battle team.
 *
 * @param {object} socket
 * @param {object} parsed - { userId, teamIndex, teamName }
 * @param {function} callback
 */
async function setFastTeamName(socket, parsed, callback) {
    var userId = parsed.userId;
    var teamIndex = parsed.teamIndex;
    var teamName = parsed.teamName;

    logger.info('USER', 'setFastTeamName: userId=' + userId + ', teamIndex=' + teamIndex);

    callback(RH.success({
        _changeInfo: {
            _fastTeam: {},
        },
    }));
}

// =============================================
// MAIN ROUTER
// =============================================

/**
 * Main handler function — routes actions to specific handlers.
 *
 * Called by main-server/index.js:
 *   handler.handle(socket, parsed, callback)
 *
 * @param {object} socket - Socket.IO socket instance
 * @param {object} parsed - Parsed request from ResponseHelper.parseRequest()
 *   { type, action, userId, ...params }
 * @param {function} callback - Socket.IO acknowledgment callback
 */
async function handle(socket, parsed, callback) {
    var action = parsed.action;
    var userId = parsed.userId;

    if (!action) {
        logger.warn('USER', 'Missing action in request');
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing action'));
    }

    try {
        switch (action) {

            // === CRITICAL: enterGame (first action called after TEA verify) ===
            case 'enterGame':
                await enterGame(socket, parsed, callback);
                break;

            // === CHAT ===
            case 'registChat':
                await registChat(socket, parsed, callback);
                break;

            // === WRITE ACTIONS ===
            case 'changeNickName':
                await changeNickName(socket, parsed, callback);
                break;

            case 'changeHeadImage':
                await changeHeadImage(socket, parsed, callback);
                break;

            case 'changeHeadBox':
                await changeHeadBox(socket, parsed, callback);
                break;

            case 'clickSystem':
                await clickSystem(socket, parsed, callback);
                break;

            case 'exitGame':
                await exitGame(socket, parsed, callback);
                break;

            case 'saveFastTeam':
                await saveFastTeam(socket, parsed, callback);
                break;

            case 'setFastTeamName':
                await setFastTeamName(socket, parsed, callback);
                break;

            // === READ ACTIONS ===
            case 'getBulletinBrief':
                await getBulletinBrief(socket, parsed, callback);
                break;

            case 'queryPlayerHeadIcon':
                await queryPlayerHeadIcon(socket, parsed, callback);
                break;

            case 'readBulletin':
                await readBulletin(socket, parsed, callback);
                break;

            case 'suggest':
                await suggest(socket, parsed, callback);
                break;

            // === UNKNOWN ACTION ===
            default:
                logger.warn('USER', 'Unknown action: ' + action + ' from userId=' + (userId || '-'));
                callback(RH.error(RH.ErrorCode.INVALID_COMMAND, 'Unknown action: ' + action));
                break;
        }
    } catch (err) {
        logger.error('USER', 'Handler error for action=' + action + ': ' + err.message);
        logger.error('USER', 'Stack: ' + err.stack);
        callback(RH.error(RH.ErrorCode.UNKNOWN, 'Internal server error'));
    }
}

module.exports = { handle: handle };
