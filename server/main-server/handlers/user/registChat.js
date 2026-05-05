/**
 * handlers/user/registChat.js — user.registChat Handler
 * 
 * RegistChat hanya mengembalikan status sukses.
 * Chat-Server handle di port 8002.
 *
 * Request: { type:'user', action:'registChat', userId }
 * Response: { registChat: 1 }
 */

const responseHelper = require('../../responseHelper');
const logger = require('../../logger');

function handleRegistChat(request, session) {
    const { userId } = request;

    logger.log('INFO', 'REGCHAT', 'registChat request');
    logger.detail('data', ['userId', userId]);

    return responseHelper.buildSuccess({ registChat: 1 });
}

module.exports = handleRegistChat;
