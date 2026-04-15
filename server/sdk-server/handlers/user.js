/**
 * ============================================================================
 *  User Handlers — Info, Language, List, Detail, Config, Health, Payments
 *  ============================================================================
 *
 *  Endpoints:
 *    GET  /api/user/info          — Get user info by session (sdk.js USER_INFO)
 *    POST /api/user/language      — Save language preference (sdk.js USER_LANGUAGE)
 *    GET  /api/users              — List semua user (admin/debug)
 *    GET  /api/users/:id          — Detail user (admin/debug)
 *    GET  /api/payments           — List semua payment (admin/debug)
 *    GET  /api/config             — Konfigurasi SDK server (read-only)
 *    GET  /health                 — Health check
 *
 *  /api/user/info:
 *    Dipanggil oleh sdk.js untuk get user info.
 *    Memerlukan loginToken atau userId untuk identifikasi.
 *
 *  /api/user/language:
 *    Dipanggil oleh main.min.js via TSBrowser.executeFunction("changeLanguage", lang)
 *    → index.html changeLanguage() → sdk.js POST /api/user/language
 *    Menyimpan preference bahasa user ke server.
 *
 *  /api/config:
 *    Read-only config untuk sdk.js verifikasi kompatibilitas.
 *
 *  /health:
 *    Dipanggil oleh sdk.js saat login UI untuk cek status server.
 *
 * ============================================================================
 */

var userManager = require('../services/userManager');
var sessionManager = require('../services/sessionManager');
var paymentService = require('../services/paymentService');
var analyticsService = require('../services/analyticsService');
var CONSTANTS = require('../config/constants');

// =============================================
// GET /api/user/info
// =============================================

/**
 * Handler: Get user info.
 *
 * Query: ?userId=xxx&loginToken=xxx  (or Body for POST-like usage)
 * Headers: X-Session-ID (alternative)
 *
 * Response: { success: true, user: { id, username, nickname, sdk, ... } }
 *           { success: false, message: string }
 *
 * Digunakan oleh sdk.js untuk verifikasi session dan get user data.
 */
function info(req, res) {
    var userId = req.query.userId || req.body.userId;
    var loginToken = req.query.loginToken || req.body.loginToken;

    // Alternative: X-Session-ID header
    if (!loginToken && req.headers['x-session-id']) {
        loginToken = req.headers['x-session-id'];
    }

    if (!userId || !loginToken) {
        return res.json({
            success: false,
            message: 'userId dan loginToken diperlukan'
        });
    }

    // Validasi session
    if (!sessionManager.validate(userId, loginToken)) {
        return res.json({
            success: false,
            message: 'Session tidak valid atau sudah expired'
        });
    }

    // Get user detail
    var user = userManager.getUserDetail(userId);
    if (!user) {
        return res.json({
            success: false,
            message: 'User tidak ditemukan'
        });
    }

    res.json({
        success: true,
        user: user
    });
}

// =============================================
// POST /api/user/language
// =============================================

/**
 * Handler: Save user language preference.
 *
 * Request: { userId: string, loginToken: string, language: string }
 *
 * Dipanggil oleh:
 *   main.min.js: TSBrowser.executeFunction("changeLanguage", language)
 *   → index.html: changeLanguage(lang)
 *   → sdk.js: POST /api/user/language
 *
 * Language codes: "en", "cn", "kr", "vi", "jr", "tw", "pt", "fr", "de", "sylz"
 *
 * Response: { success: true }
 *           { success: false, message: string }
 */
function language(req, res) {
    var userId = req.body.userId;
    var loginToken = req.body.loginToken;
    var language = req.body.language;

    if (!userId || !language) {
        return res.json({
            success: false,
            message: 'userId dan language diperlukan'
        });
    }

    // Validasi session jika loginToken disediakan
    if (loginToken && !sessionManager.validate(userId, loginToken)) {
        return res.json({
            success: false,
            message: 'Session tidak valid'
        });
    }

    // Log language change (analytics)
    analyticsService.appendEvent({
        category: 'settings',
        action: 'change_language',
        data: { language: language },
        userId: userId,
        timestamp: new Date().toISOString()
    });

    console.log('[User] Language change: user ' + userId + ' → ' + language);

    return res.json({ success: true });
}

// =============================================
// GET /api/users (admin)
// =============================================

/**
 * Handler: List semua user (admin/debug).
 *
 * Query params:
 *   ?search=username  — cari username/nickname (case-insensitive)
 *   ?limit=100        — max results
 *
 * Response: { success: true, count, total, users: [...] }
 */
function listUsers(req, res) {
    var search = req.query.search || null;
    var limit = parseInt(req.query.limit) || 100;

    var result = userManager.listUsers(search, limit);

    res.json({
        success: true,
        count: result.count,
        total: result.total,
        users: result.users
    });
}

// =============================================
// GET /api/users/:id (admin)
// =============================================

/**
 * Handler: Detail user spesifik (admin/debug).
 *
 * Response: { success: true, user: { id, username, ... } }
 *           { success: false, message: string }
 */
function getUserDetail(req, res) {
    var user = userManager.getUserDetail(req.params.id);

    if (!user) {
        return res.json({
            success: false,
            message: 'User tidak ditemukan'
        });
    }

    res.json({
        success: true,
        user: user
    });
}

// =============================================
// GET /api/payments (admin)
// =============================================

/**
 * Handler: List semua payment (admin/debug).
 *
 * Query params:
 *   ?userId=xxx    — filter by userId
 *   ?status=xxx    — filter by status
 *   ?limit=100     — max results
 *
 * Response: { success: true, count, total, payments: [...] }
 */
function listPayments(req, res) {
    var result = paymentService.listPayments({
        userId: req.query.userId || null,
        status: req.query.status || null,
        limit: parseInt(req.query.limit) || 100
    });

    res.json({
        success: true,
        count: result.count,
        total: result.total,
        payments: result.payments
    });
}

// =============================================
// GET /api/config (read-only)
// =============================================

/**
 * Handler: Konfigurasi SDK server (read-only).
 *
 * Response: { success: true, config: { version, sdkType, defaultChannel, ... } }
 *
 * Digunakan oleh sdk.js untuk verifikasi kompatibilitas.
 */
function config(req, res) {
    res.json({
        success: true,
        config: {
            version: '2.0.0',
            sdkType: 'PPGAME',
            defaultChannel: CONSTANTS.DEFAULT_SDK_CHANNEL,
            defaultAppId: CONSTANTS.DEFAULT_APP_ID,
            sessionDuration: '7 days',
            hashAlgorithm: 'PBKDF2-SHA512',
            maxAnalyticsEvents: CONSTANTS.MAX_ANALYTICS_EVENTS,
            supportedLanguages: ['en', 'cn', 'kr', 'vi', 'jr', 'tw', 'pt', 'fr', 'de'],
            endpoints: {
                auth: {
                    login: '/api/auth/login',
                    register: '/api/auth/register',
                    guest: '/api/auth/guest',
                    logout: '/api/auth/logout',
                    check: '/api/auth/check'
                },
                payment: {
                    process: '/api/payment/process',
                    create: '/api/payment/create',
                    verify: '/api/payment/verify',
                    callback: '/api/payment/callback'
                },
                report: {
                    event: '/api/report/event',
                    batch: '/api/report/batch'
                },
                analytics: {
                    event: '/api/analytics/event',
                    dashboard: '/api/analytics/dashboard'
                },
                user: {
                    info: '/api/user/info',
                    language: '/api/user/language'
                }
            }
        }
    });
}

// =============================================
// GET /health
// =============================================

/**
 * Handler: Health check endpoint.
 *
 * Dipanggil oleh sdk.js saat login UI untuk cek status server.
 *
 * Response: {
 *   status: 'online',
 *   port: 9999,
 *   uptime: seconds,
 *   uptimeFormatted: 'Xd Xh Xm Xs',
 *   registeredUsers: number,
 *   activeSessions: number,
 *   totalPayments: number,
 *   totalEvents: number,
 *   timestamp: ISO string
 * }
 */
function health(req, res) {
    var uptime = process.uptime();
    var days = Math.floor(uptime / 86400);
    var hours = Math.floor((uptime % 86400) / 3600);
    var minutes = Math.floor((uptime % 3600) / 60);
    var secs = Math.floor(uptime % 60);
    var parts = [];
    if (days > 0) parts.push(days + 'd');
    if (hours > 0) parts.push(hours + 'h');
    if (minutes > 0) parts.push(minutes + 'm');
    parts.push(secs + 's');

    res.json({
        status: 'online',
        port: CONSTANTS.PORT,
        uptime: uptime,
        uptimeFormatted: parts.join(' '),
        registeredUsers: userManager.getUserCount(),
        activeSessions: sessionManager.getActiveCount(),
        totalPayments: paymentService.getTotalCount(),
        totalEvents: analyticsService.getTotalEventCount(),
        timestamp: new Date().toISOString()
    });
}

module.exports = {
    info: info,
    language: language,
    listUsers: listUsers,
    getUserDetail: getUserDetail,
    listPayments: listPayments,
    config: config,
    health: health
};
