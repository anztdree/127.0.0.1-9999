/**
 * =====================================================
 *  Guide Handler — handlers/guide.js
 *  Super Warrior Z Game Server — Main Server (Port 8001)
 *
 *  Tutorial / New Player Guide Progress Handler
 *
 *  Menangani progress tutorial player: simpan step, ambil data,
 *  klaim reward, dan tandai selesai.
 *
 *  Actions:
 *    saveGuide       — Save tutorial progress step (client sends)
 *    getGuideData    — Get current guide progress from DB
 *    getGuideReward  — Claim guide completion reward
 *    complete        — Mark guide line as complete (set step = endID)
 *
 *  Guide Data Structure (user_data.guide):
 *    {
 *        _id: userId,
 *        _steps: { "2": 2717, "3": 3102, "4": 4301, ... }
 *    }
 *
 *  Tutorial Config (tutorial.json):
 *    254 entries, 60 have isSave=true, 45 have tutorialEnd.
 *    tutorialEnd marks the final step of each guide line.
 *    tutorialEnd always equals the max step ID within that line (verified).
 *    No reward fields exist in tutorial.json.
 * =====================================================
 */

'use strict';

var RH = require('../../shared/responseHelper');
var logger = require('../../shared/utils/logger');
var userDataService = require('../services/userDataService');
var GameData = require('../../shared/gameData/loader');

// =============================================
// Helper: getTutorialEndStep(guideType)
// =============================================
// Looks up the tutorialEnd step ID for a given guide line from tutorial.json.
// tutorialEnd is always on the first entry (xx01) of each line,
// and equals the max step ID within that line.
//
// Returns: number (end step ID) or 0 if not found.
// =============================================
function getTutorialEndStep(guideType) {
    var tutorialConfigs = GameData.get('tutorial');
    if (!tutorialConfigs) return 0;

    for (var tid in tutorialConfigs) {
        var tcfg = tutorialConfigs[tid];
        if (tcfg.tutorialLine == guideType && tcfg.tutorialEnd) {
            return Number(tcfg.tutorialEnd);
        }
    }
    return 0;
}

// =============================================
// Helper: ensureGuideStructure(gameData, userId)
// =============================================
// Ensures gameData.guide and gameData.guide._steps exist.
// Returns the guide object.
// =============================================
function ensureGuideStructure(gameData, userId) {
    if (!gameData.guide) {
        gameData.guide = { _id: String(userId), _steps: {} };
    }
    if (!gameData.guide._steps) {
        gameData.guide._steps = {};
    }
    return gameData.guide;
}

function handle(socket, parsed, callback) {
    var action = parsed.action;
    var userId = parsed.userId;

    switch (action) {

        // =============================================
        // saveGuide — Save tutorial progress step
        // =============================================
        // REQ: { guideType, step, version }
        // RES: {} (client only checks ret: 0)
        //
        // Client call: GuideInfoManager.sendGuideSted(stepId)
        // Called only if tutorial config entry has isSave=true (60 save points).
        // =============================================
        case 'saveGuide': {
            var guideType = parsed.guideType;
            var step = parsed.step;

            if (!guideType || !step || !userId) {
                logger.warn('GUIDE', 'saveGuide missing params: userId=' + (userId || '-') +
                    ' guideType=' + (guideType || '-') + ' step=' + (step || '-'));
                callback(RH.success({}));
                return;
            }

            logger.info('GUIDE', 'saveGuide userId=' + userId +
                ' guideType=' + guideType + ' step=' + step);

            userDataService.loadUserData(userId)
                .then(function (gameData) {
                    if (!gameData) {
                        logger.error('GUIDE', 'saveGuide: user not found userId=' + userId);
                        callback(RH.success({}));
                        return;
                    }

                    var guide = ensureGuideStructure(gameData, userId);
                    var guideTypeKey = String(guideType);
                    var oldStep = guide._steps[guideTypeKey];
                    guide._steps[guideTypeKey] = step;

                    if (oldStep && oldStep !== step) {
                        logger.info('GUIDE', 'Guide progress updated: userId=' + userId +
                            ' line=' + guideType + ' step ' + oldStep + ' -> ' + step);
                    } else if (!oldStep) {
                        logger.info('GUIDE', 'New guide line started: userId=' + userId +
                            ' line=' + guideType + ' step=' + step);
                    }

                    return userDataService.saveUserData(userId, gameData);
                })
                .then(function () {
                    callback(RH.success({}));
                })
                .catch(function (err) {
                    logger.error('GUIDE', 'saveGuide error: userId=' + userId +
                        ' err=' + err.message);
                    callback(RH.success({}));
                });

            break;
        }

        // =============================================
        // getGuideData — Get current guide progress
        // =============================================
        // REQ: { userId }
        // RES: { _id, _steps }
        //
        // Returns the full guide object from DB.
        // Guide data is normally sent via enterGame response,
        // this serves as a standalone query endpoint.
        // =============================================
        case 'getGuideData': {
            if (!userId) {
                callback(RH.success({ _id: '', _steps: {} }));
                return;
            }

            userDataService.loadUserData(userId)
                .then(function (gameData) {
                    if (!gameData) {
                        callback(RH.success({ _id: String(userId), _steps: {} }));
                        return;
                    }

                    var guideData = gameData.guide || { _id: String(userId), _steps: {} };
                    if (!guideData._steps) {
                        guideData._steps = {};
                    }

                    callback(RH.success(guideData));
                })
                .catch(function (err) {
                    logger.error('GUIDE', 'getGuideData error: userId=' + userId +
                        ' err=' + err.message);
                    callback(RH.success({ _id: String(userId), _steps: {} }));
                });

            break;
        }

        // =============================================
        // getGuideReward — Claim guide completion reward
        // =============================================
        // REQ: { userId, guideType }
        // RES: { _changeInfo: { _items: rewardItems } }
        //
        // Checks if the specified guide line is complete (step >= tutorialEnd),
        // then returns reward items.
        //
        // Response format matches client reward-claiming pattern
        // (openCongratulationObtain expects _changeInfo._items),
        // consistent with checkBattleResult, getChapterReward, gain, etc.
        //
        // NOTE: tutorial.json has no reward fields currently,
        // so rewardItems is always {}. The format is correct for client.
        // If rewards are added to tutorial.json in the future, this handler
        // will need to build rewardItems from the new fields and apply
        // item deltas to totalProps (following the pattern in hangup.js).
        // =============================================
        case 'getGuideReward': {
            var gRewardType = parsed.guideType;

            if (!userId || !gRewardType) {
                logger.warn('GUIDE', 'getGuideReward missing params: userId=' + (userId || '-') +
                    ' guideType=' + (gRewardType || '-'));
                callback(RH.success({ _changeInfo: { _items: {} } }));
                return;
            }

            logger.info('GUIDE', 'getGuideReward userId=' + userId +
                ' guideType=' + gRewardType);

            var endStepId = getTutorialEndStep(gRewardType);

            if (!endStepId) {
                logger.warn('GUIDE', 'getGuideReward: no tutorialEnd found for guideType=' + gRewardType);
                callback(RH.success({ _changeInfo: { _items: {} } }));
                return;
            }

            userDataService.loadUserData(userId)
                .then(function (gameData) {
                    if (!gameData) {
                        callback(RH.success({ _changeInfo: { _items: {} } }));
                        return;
                    }

                    // Check if guide line is complete
                    var currentStep = gameData.guide && gameData.guide._steps &&
                        gameData.guide._steps[String(gRewardType)];

                    if (!currentStep || currentStep < endStepId) {
                        logger.info('GUIDE', 'getGuideReward: guide not complete userId=' + userId +
                            ' line=' + gRewardType + ' current=' + (currentStep || 0) +
                            ' needed=' + endStepId);
                        callback(RH.success({ _changeInfo: { _items: {} } }));
                        return;
                    }

                    // Guide is complete — return reward items
                    // Currently empty because tutorial.json has no reward fields.
                    var rewardItems = {};

                    logger.info('GUIDE', 'getGuideReward: guide complete, userId=' + userId +
                        ' line=' + gRewardType);

                    callback(RH.success({
                        _changeInfo: { _items: rewardItems }
                    }));
                })
                .catch(function (err) {
                    logger.error('GUIDE', 'getGuideReward error: userId=' + userId +
                        ' err=' + err.message);
                    callback(RH.success({ _changeInfo: { _items: {} } }));
                });

            break;
        }

        // =============================================
        // complete — Mark guide line as complete
        // =============================================
        // REQ: { userId, guideType }
        // RES: {} (client only checks ret: 0)
        //
        // Looks up the tutorialEnd step for the given guide line from
        // tutorial.json, then sets guide._steps[guideType] = endStep.
        // =============================================
        case 'complete': {
            var gCompleteType = parsed.guideType;

            if (!userId || !gCompleteType) {
                logger.warn('GUIDE', 'complete missing params: userId=' + (userId || '-') +
                    ' guideType=' + (gCompleteType || '-'));
                callback(RH.success({}));
                return;
            }

            logger.info('GUIDE', 'complete userId=' + userId + ' guideType=' + gCompleteType);

            var endStep = getTutorialEndStep(gCompleteType);

            if (!endStep) {
                logger.warn('GUIDE', 'complete: no tutorialEnd found for guideType=' + gCompleteType);
                callback(RH.success({}));
                return;
            }

            userDataService.loadUserData(userId)
                .then(function (gameData) {
                    if (!gameData) {
                        logger.error('GUIDE', 'complete: user not found userId=' + userId);
                        callback(RH.success({}));
                        return;
                    }

                    var guide = ensureGuideStructure(gameData, userId);
                    var guideTypeKey = String(gCompleteType);
                    var oldStep = guide._steps[guideTypeKey];
                    guide._steps[guideTypeKey] = endStep;

                    logger.info('GUIDE', 'complete: userId=' + userId +
                        ' line=' + gCompleteType +
                        (oldStep ? ' step ' + oldStep + ' -> ' + endStep : ' set to ' + endStep));

                    return userDataService.saveUserData(userId, gameData);
                })
                .then(function () {
                    callback(RH.success({}));
                })
                .catch(function (err) {
                    logger.error('GUIDE', 'complete error: userId=' + userId +
                        ' err=' + err.message);
                    callback(RH.success({}));
                });

            break;
        }

        default:
            logger.warn('GUIDE', 'Unknown action: ' + action +
                ' userId=' + (userId || '-'));
            callback(RH.error(RH.ErrorCode.INVALID_COMMAND,
                'Unknown action: ' + action));
            break;
    }
}

module.exports = { handle: handle };
