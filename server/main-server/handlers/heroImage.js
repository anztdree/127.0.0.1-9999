'use strict';

/**
 * =====================================================
 *  heroImage.js — Hero Image / Hero Book Handler
 *  Super Warrior Z Game Server — Main Server
 *
 *  Manages the hero handbook (图鉴) system:
 *    1. getAll — Returns hero book data (which heroes user collected, max levels)
 *    2. readHeroVersion — Marks handbook as "read" (clears red dot)
 *    3. getComments — Returns paginated comments/ratings for a hero (social)
 *    4. addComment — Adds a new comment/rating for a hero
 *    5. likeComment — Like a hero comment
 *    6. unlikeComment — Unlike a hero comment
 *
 *  DATA SOURCES:
 *    - user_data.heros._heros → hero roster (for getAll)
 *    - user_data.heroImageVersion → last seen version (for readHeroVersion)
 *    - heroBook.json config → isNewVersion for version tracking
 *    - hero_comments DB table → social comments (shared across users)
 *
 *  CLIENT CODE ANALYSIS:
 *    - getAll called on login (line 169711): setAlreadyGainHeroID(e)
 *    - readHeroVersion called when opening handbook tab (line 121861)
 *    - getComments called when opening hero appraise (line 56415, 127248)
 *    - addComment called when submitting review (line 127482)
 *    - likeComment/unlikeComment called on praise toggle (line 127337, 127349)
 *
 *  CLIENT RESPONSE FORMATS:
 *    getAll: { _heros: { [heroDisplayId]: { _id, _maxLevel, _selfComments } } }
 *    readHeroVersion: {} (empty, client only checks ret:0)
 *    getComments: { _comments: [...], _avgScore: number, _end: number }
 *    addComment: { _comment: { _id, _detail, _score, _time, _likeUsers, _userId, _nickName, _headImage, _level, _serverId } }
 *    likeComment: {} (empty, client pushes userId into likeUsers locally)
 *    unlikeComment: {} (empty, client removes userId from likeUsers locally)
 *
 *  HeroCommentModel (line 85000-85015):
 *    Fields: id, detail, score, time, likeUsers[], userId, nickName, headImage, level, serverId
 *    deserialize strips underscore prefix: this[t.substring(1)] = n
 *    Special: _likeUsers → array (not stripped)
 *
 *  HeroImageInfo (line 84988):
 *    Fields: id (from _id), maxLevel (from _maxLevel), selfComments[] (from _selfComments)
 * =====================================================
 */

var RH = require('../../shared/responseHelper');
var logger = require('../../shared/utils/logger');
var DB = require('../../database/connection');
var userDataService = require('../services/userDataService');
var GameData = require('../../shared/gameData/loader');

// =============================================
// CONSTANTS
// =============================================

/** Max comments per page (client HeroAppraiseNeedCount = 10) */
var COMMENTS_PER_PAGE = 10;

/** Max comment length (prevent abuse) */
var MAX_COMMENT_LENGTH = 200;

/** Valid score range (1-10, in steps of 2: 2,4,6,8,10) */
var VALID_SCORES = [2, 4, 6, 8, 10];

// =============================================
// TABLE INITIALIZATION
// =============================================

/** Track if hero_comments table has been ensured */
var _tableEnsured = false;

/**
 * Ensure hero_comments table exists.
 * Creates it on first use with CREATE TABLE IF NOT EXISTS.
 *
 * Table stores social hero comments/ratings shared across all users.
 * Each comment has an auto-increment ID used as cid in like/unlike.
 *
 * @returns {Promise<void>}
 */
function ensureTable() {
    if (_tableEnsured) {
        return Promise.resolve();
    }

    return DB.query(
        'CREATE TABLE IF NOT EXISTS hero_comments (' +
        '  id INT AUTO_INCREMENT PRIMARY KEY,' +
        '  hero_display_id VARCHAR(32) NOT NULL COMMENT "heroDisplayId from heroBook.json",' +
        '  user_id VARCHAR(64) NOT NULL COMMENT "userId of commenter",' +
        '  detail TEXT NOT NULL COMMENT "Comment text",' +
        '  score INT NOT NULL DEFAULT 0 COMMENT "Rating 2/4/6/8/10",' +
        '  like_users TEXT NOT NULL DEFAULT "[]"" COMMENT "JSON array of userIds who liked",' +
        '  nick_name VARCHAR(64) NOT NULL DEFAULT "" COMMENT "Commenter nickname",' +
        '  head_image VARCHAR(256) NOT NULL DEFAULT "" COMMENT "Commenter head image",' +
        '  level INT NOT NULL DEFAULT 1 COMMENT "Commenter player level",' +
        '  server_id INT NOT NULL DEFAULT 1 COMMENT "Commenter server ID",' +
        '  create_time BIGINT NOT NULL DEFAULT 0 COMMENT "Comment timestamp",' +
        '  INDEX idx_hero (hero_display_id),' +
        '  INDEX idx_user (user_id)' +
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    ).then(function () {
        _tableEnsured = true;
        logger.info('HEROIMAGE', 'hero_comments table ensured');
    }).catch(function (err) {
        logger.info('HEROIMAGE', 'Warning: hero_comments table check failed: ' + err.message);
        // Don't throw — allow graceful degradation
    });
}

// =============================================
// HELPER: Get current heroBookVersion from config
// =============================================

/**
 * Calculate the current heroBookVersion from heroBook.json config.
 * This is the max isNewVersion across all hero entries.
 * Used for readHeroVersion to update user's seen version.
 *
 * Client code (line 122172-122185):
 *   e.heroBookVersion = 0;
 *   for(var n in t) { if(e.heroBookVersion < t[n].isNewVersion) e.heroBookVersion = t[n].isNewVersion; }
 *
 * @returns {number} Max isNewVersion value, or 0 if config not loaded
 */
function getCurrentHeroBookVersion() {
    var heroBook = GameData.get('heroBook');
    if (!heroBook) {
        return 0;
    }
    var maxVersion = 0;
    var keys = Object.keys(heroBook);
    for (var i = 0; i < keys.length; i++) {
        var entry = heroBook[keys[i]];
        if (entry && entry.isNewVersion && entry.isNewVersion > maxVersion) {
            maxVersion = entry.isNewVersion;
        }
    }
    return maxVersion;
}

// =============================================
// ACTION: getAll
// =============================================

/**
 * Get all hero book data for the current user.
 *
 * Called on login (line 169711):
 *   ts.processHandler({ type:"heroImage", action:"getAll", userId, version:"1.0" },
 *     function(e) { HerosManager.getInstance().setAlreadyGainHeroID(e) })
 *
 * Client-side processing (line 85644-85660):
 *   setAlreadyGainHeroID(e):
 *     this.alreadyGainHeroIDList = {};
 *     for(var n in e._heros) {
 *       var o = e._heros[n]._id;
 *       var a = new HeroImageInfo;
 *       a.id = o;
 *       a.maxLevel = e._heros[n]._maxLevel;
 *       a.selfComments = [];
 *       var r = e._heros[n]._selfComments;
 *       if(r) for(var i=0; i<r.length; i++) a.selfComments.push(r[i]);
 *       this.alreadyGainHeroIDList[o] = a;
 *     }
 *
 * Expected response format:
 *   { _heros: {
 *       [heroDisplayId]: {
 *         _id: <heroDisplayId>,
 *         _maxLevel: <maxLevel>,
 *         _selfComments: [ <commentText>, ... ]
 *       }
 *     }
 *   }
 *
 * DATA SOURCES:
 *   - Hero list: user_data.heros._heros → iterate owned heroes
 *   - Max level: user_data.heros._heros[heroId]._heroBaseAttr._level
 *   - Self comments: from hero_comments WHERE user_id = userId
 *   - Note: heroId (instance) != heroDisplayId (template). We use heroDisplayId.
 *
 * @param {string} userId
 * @param {function} callback
 */
function actionGetAll(userId, callback) {
    logger.info('HEROIMAGE', 'getAll userId=' + userId);

    userDataService.loadUserData(userId)
        .then(function (gameData) {
            if (!gameData || !gameData.heros || !gameData.heros._heros) {
                logger.info('HEROIMAGE', 'getAll userId=' + userId + ' heroCount=0 (no hero data)');
                callback(RH.success({ _heros: {} }));
                return;
            }

            var heroRoster = gameData.heros._heros;
            var heroKeys = Object.keys(heroRoster);

            // Build a map of heroDisplayId -> max level across all owned instances
            // (user can have multiple copies of same hero from summons)
            var displayIdMaxLevel = {};
            for (var i = 0; i < heroKeys.length; i++) {
                var heroData = heroRoster[heroKeys[i]];
                if (!heroData || !heroData._heroDisplayId) continue;

                var displayId = String(heroData._heroDisplayId);
                var level = (heroData._heroBaseAttr && heroData._heroBaseAttr._level) || 0;

                if (!displayIdMaxLevel[displayId] || level > displayIdMaxLevel[displayId]) {
                    displayIdMaxLevel[displayId] = level;
                }
            }

            var displayIds = Object.keys(displayIdMaxLevel);

            if (displayIds.length === 0) {
                logger.info('HEROIMAGE', 'getAll userId=' + userId + ' heroCount=0');
                callback(RH.success({ _heros: {} }));
                return;
            }

            // Build response from hero data FIRST (guaranteed available).
            // Comments are optional enrichment — failure must NOT lose hero data.
            var response = { _heros: {} };
            for (var d = 0; d < displayIds.length; d++) {
                response._heros[displayIds[d]] = {
                    _id: displayIds[d],
                    _maxLevel: displayIdMaxLevel[displayIds[d]],
                    _selfComments: []
                };
            }

            // Ensure table exists before querying
            // (getAll runs on LOGIN — may be the first heroImage access ever)
            return ensureTable().then(function () {
                var placeholders = displayIds.map(function () { return '?'; }).join(',');
                return DB.query(
                    'SELECT hero_display_id, detail FROM hero_comments WHERE user_id = ? AND hero_display_id IN (' + placeholders + ')',
                    [userId].concat(displayIds)
                );
            }).then(function (commentRows) {
                if (commentRows && commentRows.length > 0) {
                    for (var c = 0; c < commentRows.length; c++) {
                        var row = commentRows[c];
                        var hid = String(row.hero_display_id);
                        if (response._heros[hid]) {
                            response._heros[hid]._selfComments.push(row.detail);
                        }
                    }
                }

                logger.info('HEROIMAGE', 'getAll userId=' + userId +
                    ' heroCount=' + displayIds.length +
                    ' commentsLoaded=' + (commentRows ? commentRows.length : 0));
                callback(RH.success(response));
            }).catch(function (commentErr) {
                // Comments query failed — return hero data WITHOUT comments
                // (better than returning empty hero book)
                logger.warn('HEROIMAGE', 'getAll comments failed for userId=' + userId +
                    ': ' + commentErr.message + ' — returning heroes without comments');
                callback(RH.success(response));
            });
        })
        .catch(function (err) {
            logger.error('HEROIMAGE', 'getAll userData error for userId=' + userId +
                ': ' + err.message);
            callback(RH.success({ _heros: {} }));
        });
}

// =============================================
// ACTION: readHeroVersion
// =============================================

/**
 * Mark hero handbook as "read" to clear the red dot notification.
 *
 * Called when user opens hero handbook tab (line 121860-121866):
 *   UserInfoSingleton.getInstance().heroImageVersion < e.myData.heroBookVersion && ts.processHandler({
 *       type: "heroImage",
 *       action: "readHeroVersion",
 *       userId: n,
 *       version: "1.0"
 *   }, function(t) {
 *       UserInfoSingleton.getInstance().heroImageVersion = e.myData.heroBookVersion,
 *       e.judgeRed()
 *   })
 *
 * CLIENT EXPECTS: Response can be empty {}. Client only checks ret:0.
 * After success, client sets: heroImageVersion = heroBookVersion (current max from config)
 *
 * SERVER SIDE: We update user_data.heroImageVersion to current heroBookVersion
 * so that on next login, the enterGame response carries the updated version.
 *
 * @param {string} userId
 * @param {function} callback
 */
function actionReadHeroVersion(userId, callback) {
    logger.info('HEROIMAGE', 'readHeroVersion userId=' + userId);

    var newVersion = getCurrentHeroBookVersion();
    logger.info('HEROIMAGE', 'readHeroVersion userId=' + userId + ' newVersion=' + newVersion);

    userDataService.loadUserData(userId)
        .then(function (gameData) {
            if (!gameData) {
                callback(RH.success({}));
                return;
            }

            // Update heroImageVersion to current max version
            gameData.heroImageVersion = newVersion;

            return userDataService.saveUserData(userId, gameData);
        })
        .then(function () {
            callback(RH.success({}));
        })
        .catch(function (err) {
            logger.info('HEROIMAGE', 'readHeroVersion error for userId=' + userId + ': ' + err.message);
            // Still return success — client doesn't need the data
            callback(RH.success({}));
        });
}

// =============================================
// ACTION: getComments
// =============================================

/**
 * Get paginated comments/ratings for a specific hero.
 *
 * Called when opening hero appraise panel (line 56415) and scrolling (line 127248):
 *   ts.processHandler({
 *       type: "heroImage",
 *       action: "getComments",
 *       userId: t,
 *       heroDisplayId: e,
 *       start: 0,          // offset for pagination
 *       needCount: n,      // HeroAppraiseNeedCount = 10
 *       version: "1.0"
 *   }, function(t) {
 *       HerosManager.getInstance().setHeroCommentModel(t);
 *       // uses t._avgScore, passes t to setHeroCommentModel
 *   })
 *
 * Client processing (line 86089-86095):
 *   setHeroCommentModel(e):
 *     for(var n=0; n<e._comments.length; n++) {
 *       var o = new HeroCommentModel;
 *       o.deserialize(e._comments[n]);
 *       t.heroCommentModelList.push(o)
 *     }
 *
 * Pagination (line 127248-127265):
 *   When scrolling, client sends start=t.startCount, needCount=HeroAppraiseNeedCount
 *   Response: e._comments (array), e._end (next start offset)
 *
 * Expected response:
 *   {
 *     _comments: [
 *       { _id, _detail, _score, _time, _likeUsers, _userId, _nickName, _headImage, _level, _serverId }
 *     ],
 *     _avgScore: <number>,  // average score across ALL comments for this hero
 *     _end: <number>         // next pagination offset (= start + needCount)
 *   }
 *
 * @param {object} parsed - Request with heroDisplayId, start, needCount
 * @param {function} callback
 */
function actionGetComments(parsed, callback) {
    var userId = parsed.userId;
    var heroDisplayId = parsed.heroDisplayId;
    var start = parseInt(parsed.start) || 0;
    var needCount = parseInt(parsed.needCount) || COMMENTS_PER_PAGE;

    logger.info('HEROIMAGE', 'getComments userId=' + userId +
        ' heroDisplayId=' + heroDisplayId +
        ' start=' + start + ' needCount=' + needCount);

    if (!heroDisplayId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroDisplayId'));
        return;
    }

    ensureTable().then(function () {
        // Get total count and average score
        return DB.query(
            'SELECT COUNT(*) as cnt, AVG(score) as avgScore FROM hero_comments WHERE hero_display_id = ?',
            [heroDisplayId]
        );
    }).then(function (stats) {
        var totalCount = stats && stats[0] ? parseInt(stats[0].cnt) : 0;
        var avgScore = stats && stats[0] && stats[0].avgScore
            ? Math.round(parseFloat(stats[0].avgScore) * 10) / 10
            : 0;

        // Get paginated comments (newest first)
        return DB.query(
            'SELECT id, user_id, detail, score, like_users, nick_name, head_image, level, server_id, create_time ' +
            'FROM hero_comments WHERE hero_display_id = ? ORDER BY create_time DESC LIMIT ? OFFSET ?',
            [heroDisplayId, needCount, start]
        ).then(function (rows) {
            var comments = [];
            if (rows && rows.length > 0) {
                for (var i = 0; i < rows.length; i++) {
                    var row = rows[i];
                    var likeUsers = [];
                    try {
                        likeUsers = JSON.parse(row.like_users || '[]');
                    } catch (e) {
                        likeUsers = [];
                    }

                    comments.push({
                        _id: String(row.id),
                        _detail: row.detail,
                        _score: row.score,
                        _time: row.create_time,
                        _likeUsers: likeUsers,
                        _userId: String(row.user_id),
                        _nickName: row.nick_name || '',
                        _headImage: row.head_image || '',
                        _level: row.level || 1,
                        _serverId: row.server_id || 1,
                    });
                }
            }

            var end = start + needCount;
            if (end > totalCount) end = totalCount;

            logger.info('HEROIMAGE', 'getComments userId=' + userId +
                ' heroDisplayId=' + heroDisplayId +
                ' returned=' + comments.length + '/' + totalCount +
                ' avgScore=' + avgScore);

            callback(RH.success({
                _comments: comments,
                _avgScore: avgScore,
                _end: end,
            }));
        });
    }).catch(function (err) {
        logger.info('HEROIMAGE', 'getComments error: ' + err.message);
        callback(RH.success({ _comments: [], _avgScore: 0, _end: 0 }));
    });
}

// =============================================
// ACTION: addComment
// =============================================

/**
 * Add a new comment/rating for a hero.
 *
 * Called from InputHeroAppraise.presentBtnTap (line 127482):
 *   ts.processHandler({
 *       type: "heroImage",
 *       action: "addComment",
 *       userId: t,
 *       heroDisplayId: e.myData.heroDisplayId,
 *       detail: o,          // comment text (already filtered by ToolCommon.replaceMessageBlocked)
 *       score: n,           // 2, 4, 6, 8, or 10
 *       version: "1.0"
 *   }, function(t) {
 *       var n = new HeroCommentModel;
 *       n.deserialize(t._comment);
 *       HerosManager.getInstance().addHeroCommonModel(n);
 *       // Shows success tip
 *   })
 *
 * Expected response:
 *   {
 *     _comment: {
 *       _id, _detail, _score, _time, _likeUsers, _userId, _nickName, _headImage, _level, _serverId
 *     }
 *   }
 *
 * The comment text has already been sanitized by the client (ToolCommon.replaceMessageBlocked).
 * We still do server-side validation for safety.
 *
 * @param {object} parsed - Request with heroDisplayId, detail, score
 * @param {function} callback
 */
function actionAddComment(parsed, callback) {
    var userId = parsed.userId;
    var heroDisplayId = parsed.heroDisplayId;
    var detail = parsed.detail;
    var score = parseInt(parsed.score) || 0;

    logger.info('HEROIMAGE', 'addComment userId=' + userId +
        ' heroDisplayId=' + heroDisplayId +
        ' score=' + score);

    if (!heroDisplayId) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing heroDisplayId'));
        return;
    }

    if (!detail || detail.trim().length === 0) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing detail'));
        return;
    }

    if (VALID_SCORES.indexOf(score) === -1) {
        callback(RH.error(RH.ErrorCode.INVALID, 'Invalid score: ' + score));
        return;
    }

    // Truncate comment if too long
    if (detail.length > MAX_COMMENT_LENGTH) {
        detail = detail.substring(0, MAX_COMMENT_LENGTH);
    }

    var now = Date.now();

    // Load user data to get nickname, head image, level
    userDataService.loadUserData(userId)
        .then(function (gameData) {
            var nickName = '';
            var headImage = '';
            var level = 1;
            var serverId = 1;

            if (gameData) {
                if (gameData.user && gameData.user._nickName) {
                    nickName = gameData.user._nickName;
                }
                if (gameData.user && gameData.user._headImage) {
                    headImage = gameData.user._headImage;
                }
                if (gameData.totalProps && gameData.totalProps._items) {
                    var levelItem = gameData.totalProps._items['104']; // PLAYERLEVELID
                    if (levelItem && levelItem._num) {
                        level = parseInt(levelItem._num) || 1;
                    }
                }
                if (gameData.serverId) {
                    serverId = gameData.serverId;
                }
            }

            return ensureTable().then(function () {
                return DB.query(
                    'INSERT INTO hero_comments (hero_display_id, user_id, detail, score, like_users, nick_name, head_image, level, server_id, create_time) ' +
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [heroDisplayId, userId, detail, score, '[]', nickName, headImage, level, serverId, now]
                ).then(function (result) {
                    var commentId = result && result.insertId ? result.insertId : 0;

                    var comment = {
                        _id: String(commentId),
                        _detail: detail,
                        _score: score,
                        _time: now,
                        _likeUsers: [],
                        _userId: String(userId),
                        _nickName: nickName,
                        _headImage: headImage,
                        _level: level,
                        _serverId: serverId,
                    };

                    logger.info('HEROIMAGE', 'addComment userId=' + userId +
                        ' heroDisplayId=' + heroDisplayId +
                        ' commentId=' + commentId + ' OK');

                    callback(RH.success({ _comment: comment }));
                });
            });
        })
        .catch(function (err) {
            logger.info('HEROIMAGE', 'addComment error: ' + err.message);
            callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Failed to add comment'));
        });
}

// =============================================
// ACTION: likeComment
// =============================================

/**
 * Like a hero comment.
 *
 * Called from HeroAppraiseItemListItem (line 127337):
 *   ts.processHandler({
 *       type: "heroImage",
 *       action: "likeComment",
 *       userId: t,
 *       heroDisplayId: e.myData.heroDisplayId,
 *       cid: e.heroModel.id,   // comment ID
 *       version: "1.0"
 *   }, function(n) {
 *       e.heroModel.likeUsers.push(t);  // client adds locally
 *       HerosManager.getInstance().changeHeroCommonModel(e.heroModel);
 *   })
 *
 * Also called from HeroAppraisePanel (line 127573):
 *   Same pattern, e.heroDisplayId instead of e.myData.heroDisplayId
 *
 * SERVER: Add userId to like_users JSON array for the comment.
 * CLIENT: On success, pushes userId into likeUsers[] locally (no response data needed).
 *
 * Expected response: {} (empty, client only checks ret:0)
 *
 * @param {object} parsed - Request with heroDisplayId, cid (comment ID)
 * @param {function} callback
 */
function actionLikeComment(parsed, callback) {
    var userId = String(parsed.userId);
    var cid = parsed.cid;

    logger.info('HEROIMAGE', 'likeComment userId=' + userId + ' cid=' + cid);

    if (!cid) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing cid'));
        return;
    }

    ensureTable().then(function () {
        // Get current like_users
        return DB.query(
            'SELECT like_users FROM hero_comments WHERE id = ?',
            [cid]
        );
    }).then(function (rows) {
        if (!rows || rows.length === 0) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Comment not found'));
            return;
        }

        var likeUsers = [];
        try {
            likeUsers = JSON.parse(rows[0].like_users || '[]');
        } catch (e) {
            likeUsers = [];
        }

        // Check if already liked
        if (likeUsers.indexOf(userId) > -1) {
            // Already liked — return success anyway (idempotent)
            callback(RH.success({}));
            return;
        }

        // Add userId to likes
        likeUsers.push(userId);
        var newLikeUsers = JSON.stringify(likeUsers);

        return DB.query(
            'UPDATE hero_comments SET like_users = ? WHERE id = ?',
            [newLikeUsers, cid]
        ).then(function () {
            logger.info('HEROIMAGE', 'likeComment userId=' + userId + ' cid=' + cid + ' OK');
            callback(RH.success({}));
        });
    }).catch(function (err) {
        logger.info('HEROIMAGE', 'likeComment error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Failed to like comment'));
    });
}

// =============================================
// ACTION: unlikeComment
// =============================================

/**
 * Unlike a hero comment.
 *
 * Called from HeroAppraiseItemListItem (line 127349):
 *   ts.processHandler({
 *       type: "heroImage",
 *       action: "unlikeComment",
 *       userId: t,
 *       heroDisplayId: e.myData.heroDisplayId,
 *       cid: e.heroModel.id,
 *       version: "1.0"
 *   }, function(n) {
 *       var o = e.heroModel.likeUsers.indexOf(t);
 *       o > -1 && e.heroModel.likeUsers.splice(o, 1);  // client removes locally
 *       HerosManager.getInstance().changeHeroCommonModel(e.heroModel);
 *   })
 *
 * Also called from HeroAppraisePanel (line 127585):
 *   Same pattern
 *
 * SERVER: Remove userId from like_users JSON array.
 * CLIENT: On success, removes userId from likeUsers[] locally.
 *
 * Expected response: {} (empty, client only checks ret:0)
 *
 * @param {object} parsed - Request with heroDisplayId, cid (comment ID)
 * @param {function} callback
 */
function actionUnlikeComment(parsed, callback) {
    var userId = String(parsed.userId);
    var cid = parsed.cid;

    logger.info('HEROIMAGE', 'unlikeComment userId=' + userId + ' cid=' + cid);

    if (!cid) {
        callback(RH.error(RH.ErrorCode.LACK_PARAM, 'Missing cid'));
        return;
    }

    ensureTable().then(function () {
        return DB.query(
            'SELECT like_users FROM hero_comments WHERE id = ?',
            [cid]
        );
    }).then(function (rows) {
        if (!rows || rows.length === 0) {
            callback(RH.error(RH.ErrorCode.DATA_ERROR, 'Comment not found'));
            return;
        }

        var likeUsers = [];
        try {
            likeUsers = JSON.parse(rows[0].like_users || '[]');
        } catch (e) {
            likeUsers = [];
        }

        // Find and remove userId
        var idx = likeUsers.indexOf(userId);
        if (idx === -1) {
            // Not liked — return success anyway (idempotent)
            callback(RH.success({}));
            return;
        }

        likeUsers.splice(idx, 1);
        var newLikeUsers = JSON.stringify(likeUsers);

        return DB.query(
            'UPDATE hero_comments SET like_users = ? WHERE id = ?',
            [newLikeUsers, cid]
        ).then(function () {
            logger.info('HEROIMAGE', 'unlikeComment userId=' + userId + ' cid=' + cid + ' OK');
            callback(RH.success({}));
        });
    }).catch(function (err) {
        logger.info('HEROIMAGE', 'unlikeComment error: ' + err.message);
        callback(RH.error(RH.ErrorCode.UNKNOWN_ERROR, 'Failed to unlike comment'));
    });
}

// =============================================
// MAIN HANDLER
// =============================================

/**
 * Handle heroImage requests.
 *
 * Routes:
 *   type: "heroImage" → this handler
 *
 * Actions (verified from client code):
 *   getAll          — Get hero book collection data (login)
 *   readHeroVersion — Mark handbook version as read (open tab)
 *   getComments     — Get paginated comments for a hero
 *   addComment      — Submit a new comment/rating
 *   likeComment     — Like a comment
 *   unlikeComment   — Unlike a comment
 *
 * FABRICATED actions removed (not in client code):
 *   getImageVersion — Client never sends this
 *   downloadImage   — Client never sends this
 *
 * @param {object} socket - Socket.IO socket
 * @param {object} parsed - Parsed request { type, action, userId, ... }
 * @param {function} callback - Response callback
 */
function handle(socket, parsed, callback) {
    var action = parsed.action;
    var userId = parsed.userId;

    switch (action) {
        case 'getAll':
            actionGetAll(userId, callback);
            break;

        case 'readHeroVersion':
            actionReadHeroVersion(userId, callback);
            break;

        case 'getComments':
            actionGetComments(parsed, callback);
            break;

        case 'addComment':
            actionAddComment(parsed, callback);
            break;

        case 'likeComment':
            actionLikeComment(parsed, callback);
            break;

        case 'unlikeComment':
            actionUnlikeComment(parsed, callback);
            break;

        default:
            logger.warn('HEROIMAGE', 'Unknown action: ' + action);
            callback(RH.error(RH.ErrorCode.INVALID_COMMAND, 'Unknown action: ' + action));
            break;
    }
}

module.exports = { handle: handle };
