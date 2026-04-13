/**
 * Login Server - User Handlers
 * 
 * 100% derived from client code analysis.
 * 
 * This module contains handler logic separated for maintainability.
 * Used by login-server/index.js
 */

const { query } = require('../../database/connection');
const { success, error, ErrorCode } = require('../../shared/responseHelper');
const { info, warn, error: logError } = require('../../shared/utils/logger');

/**
 * Handle loginGame action
 * 
 * 100% from client code:
 * - Request type: "User" (line 77302)
 * - Password: PLAINTEXT (line 88576-88584, no hash applied)
 * - Auto-register: YES (no register action exists in client)
 * - Default password: "game_origin" (line 88641)
 * - newUser flag: checked in loginSuccessCallBack (line 77433)
 * - loginToken: used for enterGame on main server (line 77353)
 */
async function loginGame(socket, payload, callback, onlineUsers) {
    const {
        userId,
        password,
        fromChannel,
        channelName,
        headImageUrl,
        nickName,
        subChannel,
    } = payload;

    if (!userId) {
        return callback(error(ErrorCode.LACK_PARAM));
    }

    const now = Date.now();

    const existingUsers = await query('SELECT * FROM users WHERE user_id = ?', [userId]);

    let isNewUser = false;
    let userData;

    if (existingUsers.length === 0) {
        isNewUser = true;
        await query(
            `INSERT INTO users (user_id, password, nick_name, head_image, from_channel, channel_name, sub_channel, last_login_time, create_time, is_new)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [userId, password || 'game_origin', nickName || '', headImageUrl || '', fromChannel || '', channelName || '', subChannel || '', now, now]
        );
        userData = { user_id: userId, password: password || 'game_origin', nick_name: nickName || '' };
        info('LoginServer', `Auto-registered new user: ${userId}`);
    } else {
        userData = existingUsers[0];
        if (userData.password !== password) {
            return callback(error(ErrorCode.LOGIN_CHECK_FAILED));
        }
        await query('UPDATE users SET last_login_time = ? WHERE user_id = ?', [now, userId]);
        isNewUser = userData.is_new === 1;
        if (isNewUser) {
            await query('UPDATE users SET is_new = 0 WHERE user_id = ?', [userId]);
        }
    }

    onlineUsers.set(userId, socket.id);

    const responseData = {
        userId: userId,
        nickName: userData.nick_name || nickName || userId,
        newUser: isNewUser,
        loginToken: `${userId}_${now}_${Math.random().toString(36).substr(2, 8)}`,
        channelCode: fromChannel || '',
    };

    if (callback) callback(success(responseData));
}

module.exports = { loginGame };
