/**
 * handlers/heroImage/getAll.js
 *
 * Client request (line 236709-236713):
 *   type: 'heroImage', action: 'getAll', userId, version: '1.0'
 *
 * Client response (line 134363-134376):
 *   { _heros: { "<heroDisplayId>": { _id, _maxLevel, _selfComments } } }
 */

var db = require('../../db');

module.exports = {
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            try {
                var userId = data.userId;
                if (!userId) return resolve(ctx.buildErrorResponse(1));

                var heroes = db.getHeroes(userId);
                var herosMap = {};

                for (var i = 0; i < heroes.length; i++) {
                    var h = heroes[i];
                    var displayId = String(h.heroDisplayId);
                    var level = 0;

                    // Parse heroBaseAttr to get level
                    try {
                        var attr = JSON.parse(h.heroBaseAttr || '{}');
                        level = attr._level || 0;
                    } catch (e) { level = 0; }

                    // Track max level per displayId
                    if (!herosMap[displayId] || level > herosMap[displayId]._maxLevel) {
                        herosMap[displayId] = {
                            _id: displayId,
                            _maxLevel: level,
                            _selfComments: []
                        };
                    }
                }

                resolve(ctx.buildResponse({ _heros: herosMap }));
            } catch (err) {
                console.error('[heroImage/getAll] Error:', err);
                resolve(ctx.buildErrorResponse(1));
            }
        });
    }
};
