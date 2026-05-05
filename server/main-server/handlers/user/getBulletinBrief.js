/**
 * handlers/user/getBulletinBrief.js — user.getBulletinBrief Handler
 * 
 * Get bulletin dari noticeContent.json
 *
 * Request: { type:'user', action:'getBulletinBrief', userId }
 * Response: noticeContent JSON data
 */

const jsonLoader = require('../../jsonLoader');
const responseHelper = require('../../responseHelper');
const logger = require('../../logger');

function handleGetBulletinBrief(request, session) {
    const userId = request.userId;

    logger.log('INFO', 'BULLETIN', 'getBulletinBrief request');
    logger.detail('data', ['userId', userId]);

    const noticeContent = jsonLoader.get('noticeContent');

    return responseHelper.buildSuccess(noticeContent || {});
}

module.exports = handleGetBulletinBrief;
