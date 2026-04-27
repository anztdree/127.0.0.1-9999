/**
 * handlers/guide/saveGuide.js
 *
 * Client request (line 120624-120631):
 *   type: 'guide', action: 'saveGuide'
 *   userId: string
 *   guideType: o.tutorialLine  (tutorial line identifier)
 *   step: e                    (current step number)
 *   version: '1.0'
 *
 * Client callback (line 120631-120635):
 *   Success → Logger.serverDebugLog('成功')
 *   Fail    → Logger.serverDebugLog('失败')
 *   Callback does NOT read response data — only cares about ret code.
 *
 * Implementation: save guide progress to userJson module 'guide'.
 *   { guideType: step }
 */

module.exports = {
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            var userId = data.userId;
            if (!userId) return resolve(ctx.buildErrorResponse(1));

            var guideType = data.guideType;
            var step = data.step;

            // Load existing guide data
            var guideData = ctx.db.getJsonModule(userId, 'guide') || {};

            // Update step for this guideType
            if (guideType !== undefined && guideType !== null) {
                guideData[String(guideType)] = step;
            }

            // Save back
            ctx.db.setJsonModule(userId, 'guide', guideData);

            resolve(ctx.buildResponse({}));
        });
    }
};
