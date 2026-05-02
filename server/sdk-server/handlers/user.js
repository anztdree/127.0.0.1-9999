/**
 * handlers/user.js — User Info Endpoint
 *
 * GET /api/user/info?userId=xxx — Get user information
 */

/**
 * Register user routes on the Express app.
 * @param {object} app       Express app
 * @param {object} db        Database module
 * @param {object} config    Config module
 * @param {object} helpers   Helper functions
 */
function register(app, db, config, helpers) {

    // ============================================================
    // GET /api/user/info
    // ============================================================

    app.get('/api/user/info', function (req, res) {
        var userId = (req.query.userId || '').trim();

        if (!userId) {
            return res.json({ success: false, error: 'userId_required' });
        }

        var user = db.getUserInfo(userId);

        if (!user) {
            return res.json({ success: false, error: 'user_not_found' });
        }

        return res.json({
            userId: user.userId,
            nickName: user.nickName,
            sdk: user.sdk,
            isGuest: user.isGuest,
            lastLoginAt: user.lastLoginAt
        });
    });
}

module.exports = { register: register };
