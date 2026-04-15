/**
 * =====================================================
 *  Handler: clientConnect — Dungeon Server
 * =====================================================
 *
 *  First action after TEA verify. Registers user in a team.
 *
 *  CLIENT CODE (main.min.js line 144839):
 *    ts.processHandlerWithDungeon({
 *        type: "teamDungeonTeam",
 *        action: "clientConnect",
 *        userId: UserInfoSingleton.getInstance().userId,
 *        teamId: TeamworkManager.getInstance().myTeamId,
 *        version: "1.0"
 *    }, function(o) {
 *        TeamworkManager.getInstance().MyTeamDungeonInfo = o._teamInfo;
 *        e.checkIsFirstEnterTeam(o._teamInfo.captain);
 *        n.setMyTeamSimpleInfo(o._teamInfo);
 *        e.setMyUserMember(o._teamInfo, o._usersInfo);
 *        e.roomConnected = !0;
 *    })
 *
 *  Response: { _teamInfo: {id, captain, users, memberCount, dungeonId, ...},
 *              _usersInfo: [{userId, pos, role, isRobot, ...}, ...] }
 *
 *  FLOW:
 *    1. Team created on main-server (type "teamDungeonGame")
 *    2. Main-server returns dungeonurl to client
 *    3. Client connects to dungeon-server (TEA verify)
 *    4. Client sends clientConnect with teamId
 *    5. Dungeon-server creates team locally if not yet exists
 *       (main-server and dungeon-server are separate processes)
 *    6. Server returns team info + members
 *
 * =====================================================
 */

'use strict';

var RH = require('../../shared/responseHelper');
var DB = require('../../database/connection');
var logger = require('../../shared/utils/logger');

/**
 * @param {object} deps - { teamManager }
 * @param {object} socket
 * @param {object} parsed - { userId, teamId, dungeonId? }
 * @param {function} callback
 */
async function handle(deps, socket, parsed, callback) {
    var userId = parsed.userId;
    var teamId = parsed.teamId;
    var dungeonId = parsed.dungeonId || 0;

    if (!userId || !teamId) {
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing userId or teamId'));
    }

    logger.info('DUNGEON', 'clientConnect: userId=' + userId + ', teamId=' + teamId);

    // Register socket → userId mapping
    deps.teamManager.registerSocket(socket.id, userId);
    socket._userId = userId;
    socket._teamId = teamId;

    // Check if team exists on this dungeon-server instance.
    // Since main-server and dungeon-server are separate processes,
    // the team created on main-server doesn't exist here yet.
    // First member to connect auto-creates the team.
    var team = deps.teamManager.getTeam(teamId);
    if (!team) {
        team = deps.teamManager.createTeam(userId, socket, dungeonId, teamId);
        logger.info('DUNGEON', 'clientConnect: Auto-created team ' + teamId +
            ' for userId=' + userId + ' dungeonId=' + dungeonId);
    } else {
        // Team exists — update this user's socket reference
        var members = team.members;
        for (var i = 0; i < members.length; i++) {
            if (members[i].userId === userId) {
                members[i].socket = socket;
                break;
            }
        }
    }

    // Return team info and members in client-expected format
    // _teamInfo fields consumed by client (main.min.js L144843-144845):
    //   .captain      → checkIsFirstEnterTeam()
    //   .users        → stored in MyTeamDungeonInfo.users
    //   .memberCount  → getTeamInfoData().memberCount
    //   .id           → team identifier
    //   .dungeonId    → dungeon type
    //   .closeTime    → team expiry (L147671)
    //   .displayId    → display team ID (L147671)
    //   .autoJoinCondition → auto join condition (L147671)
    var teamInfo = deps.teamManager.getTeamInfo(teamId);

    // Load user info from DB for _usersInfo (used by ZkTeamUser.deserialize)
    // _usersInfo must be an OBJECT keyed by userId (L144859: t[a] where a = userId)
    var usersInfo = {};
    try {
        var memberIds = [];
        for (var j = 0; j < team.members.length; j++) {
            if (!team.members[j].isRobot) {
                memberIds.push(team.members[j].userId);
            }
        }
        if (memberIds.length > 0) {
            var placeholders = memberIds.map(function() { return '?'; }).join(',');
            var rows = await DB.query(
                'SELECT user_id, nick_name, head_image FROM users WHERE user_id IN (' + placeholders + ')',
                memberIds
            );
            for (var k = 0; k < rows.length; k++) {
                usersInfo[rows[k].user_id] = {
                    _userId: rows[k].user_id,
                    _nickName: rows[k].nick_name || '',
                    _headImage: rows[k].head_image || '',
                };
            }
        }
    } catch (err) {
        logger.warn('DUNGEON', 'clientConnect: DB error loading user info: ' + err.message);
    }

    callback(RH.success({
        _teamInfo: teamInfo,
        _usersInfo: usersInfo,
    }));
}

module.exports = { handle: handle };
