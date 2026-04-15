/**
 * =====================================================
 *  Handler: agree — Dungeon Server
 * =====================================================
 *
 *  Accept a member's application to join the team.
 *
 *  CLIENT CODE (main.min.js line 147387):
 *    ts.processHandlerWithDungeon({
 *        type: "teamDungeonTeam",
 *        action: "agree",
 *        userId, teamId, memberUserId, version:"1.0"
 *    }, callback)
 *
 *  Broadcasts Notify: TDMemberJoin to all team members.
 * =====================================================
 */

'use strict';

var RH = require('../../shared/responseHelper');
var logger = require('../../shared/utils/logger');
var NOTIFY_ACTION = require('../utils/dungeonConstants').NOTIFY_ACTION;
var LIMITS = require('../utils/dungeonConstants').LIMITS;
var responseBuilder = require('../utils/responseBuilder');

/**
 * @param {object} deps - { teamManager, io }
 * @param {object} socket
 * @param {object} parsed - { userId, teamId, memberUserId }
 * @param {function} callback
 */
function handle(deps, socket, parsed, callback) {
    var userId = parsed.userId;
    var teamId = parsed.teamId;
    var memberUserId = parsed.memberUserId;

    if (!teamId || !memberUserId) {
        return callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing teamId or memberUserId'));
    }

    logger.info('DUNGEON', 'agree: userId=' + userId + ', teamId=' + teamId +
        ', memberUserId=' + memberUserId);

    var team = deps.teamManager.getTeam(teamId);
    if (!team) {
        return callback(RH.error(RH.ErrorCode.UNKNOWN, 'Team not found'));
    }

    // Only owner can accept applications
    if (team.owner !== userId) {
        return callback(RH.error(RH.ErrorCode.UNKNOWN, 'Only team owner can accept'));
    }

    // Check if team is full
    if (team.members.length >= LIMITS.MAX_TEAM_MEMBERS) {
        return callback(RH.error(RH.ErrorCode.UNKNOWN, 'Team is full'));
    }

    // Remove from apply list
    deps.teamManager.removeApply(teamId, memberUserId);

    // Member may not be connected to dungeon-server yet.
    // Their socket will be registered when they send clientConnect later.
    // addMember stores the socket ref — null means they'll get team info on connect.
    var added = deps.teamManager.addMember(teamId, memberUserId, null, false);
    if (!added) {
        return callback(RH.error(RH.ErrorCode.UNKNOWN, 'Failed to add member'));
    }

    // Reload team members for broadcasting
    team = deps.teamManager.getTeam(teamId);

    // Broadcast TDMemberJoin to all connected team members
    // Client expects (main.min.js L145132-145141):
    //   e.member.userId  → member user ID
    //   e.member.pos     → position number (L145139: a.pos = o.pos)
    //   e.member.type    → user type (L145139: a.userType = o.type; 0=player, 1=robot)
    //   e.member.isRobot → boolean (L145135, L145139: a.isRobot = o.isRobot)
    //   e.uinfo          → serialized user info for non-robot (L145138: a.deserialize(e.uinfo))
    //   e.member gets stored: i.users[o.userId] = o (L145141)

    // Find the added member to get their position
    var addedMember = null;
    for (var mi = 0; mi < team.members.length; mi++) {
        if (team.members[mi].userId === memberUserId) {
            addedMember = team.members[mi];
            break;
        }
    }

    var notifyData = {
        action: NOTIFY_ACTION.MEMBER_JOIN,
        member: {
            userId: memberUserId,
            pos: addedMember ? addedMember.pos : 0,
            type: 0,  // 0 = player (not robot)
            isRobot: false,
        },
    };

    // For non-robot members, include uinfo from DB for deserialize()
    // The agree handler runs asynchronously, so we load user info from DB
    var DB = require('../../database/connection');
    DB.query('SELECT user_id, nick_name, head_image FROM users WHERE user_id = ?', [memberUserId])
        .then(function(rows) {
            if (rows && rows.length > 0) {
                notifyData.uinfo = {
                    _userId: rows[0].user_id,
                    _nickName: rows[0].nick_name || '',
                    _headImage: rows[0].head_image || '',
                };
            }
        })
        .catch(function() {
            // If DB fails, send without uinfo — client handles gracefully
        })
        .finally(function() {
            responseBuilder.broadcastToTeam(team.members, notifyData);
        });

    callback(RH.success({}));
}

module.exports = { handle: handle };
