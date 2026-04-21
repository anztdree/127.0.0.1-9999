/**
 * ============================================================================
 * SDK Server — User & Admin Handlers (Natural Implementation)
 * ============================================================================
 *
 * Endpoints:
 * GET /api/user/info — Get user info (session validated)
 * POST /api/user/language — Save language preference
 * GET /api/users — List users (admin)
 * GET /api/users/:id — User detail (admin)
 * GET /api/payments — List payments (admin)
 * GET /api/config — Server config (read-only)
 * GET /health — Health check
 *
 * Natural approach:
 * - Clean session validation
 * - Proper admin authorization (simplified)
 * - Consistent error responses
 *
 * ============================================================================
 */

const userManager = require('../services/userManager');
const sessionManager = require('../services/sessionManager');
const paymentService = require('../services/paymentService');
const analyticsService = require('../services/analyticsService');
const store = require('../storage/jsonStore');
const CONSTANTS = require('../config/constants');
const logger = require('../utils/logger');

// =============================================
// USER INFO
// =============================================

/**
 * Get user info (requires valid session)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function info(req, res) {
    // Get userId and loginToken from query or body
    const userId = req.query.userId || (req.body && req.body.userId);
    const loginToken = req.query.loginToken || (req.body && req.body.loginToken);

    // Also check X-Session-ID header
    const sessionIdHeader = req.headers['x-session-id'];
    const effectiveToken = loginToken || sessionIdHeader;

    if (!userId || !effectiveToken) {
        return res.json({
            success: false,
            message: 'userId dan loginToken diperlukan'
        });
    }

    // Validate session
    if (!sessionManager.validate(userId, effectiveToken)) {
        return res.json({
            success: false,
            message: 'Session tidak valid atau expired'
        });
    }

    // Get user detail
    const user = userManager.getUserDetail(userId);
    if (!user) {
        return res.json({
            success: false,
            message: 'User tidak ditemukan'
        });
    }

    return res.json({
        success: true,
        user
    });
}

// =============================================
// LANGUAGE
// =============================================

/**
 * Save user language preference
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function language(req, res) {
    const { userId, loginToken, language } = req.body;

    if (!userId || !language) {
        return res.json({
            success: false,
            message: 'userId dan language diperlukan'
        });
    }

    // Validate session if loginToken provided
    if (loginToken && !sessionManager.validate(userId, loginToken)) {
        return res.json({
            success: false,
            message: 'Session tidak valid'
        });
    }

    // Log language change
    analyticsService.appendEvent({
        category: 'settings',
        action: 'change_language',
        data: { language },
        userId: userId,
        timestamp: new Date().toISOString()
    });

    logger.info('User', `Language changed: user ${userId} → ${language}`);

    return res.json({
        success: true,
        message: 'Bahasa disimpan'
    });
}

// =============================================
// ADMIN: LIST USERS
// =============================================

/**
 * List all users (admin)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function listUsers(req, res) {
    const search = req.query.search || null;
    const limit = parseInt(req.query.limit) || 100;

    const result = userManager.listUsers(search, limit);

    return res.json({
        success: true,
        count: result.count,
        total: result.total,
        users: result.users
    });
}

// =============================================
// ADMIN: USER DETAIL
// =============================================

/**
 * Get user detail by ID (admin)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function getUserDetail(req, res) {
    const userId = req.params.id;

    if (!userId) {
        return res.json({
            success: false,
            message: 'User ID diperlukan'
        });
    }

    const user = userManager.getUserDetail(userId);
    if (!user) {
        return res.json({
            success: false,
            message: 'User tidak ditemukan'
        });
    }

    return res.json({
        success: true,
        user
    });
}

// =============================================
// ADMIN: LIST PAYMENTS
// =============================================

/**
 * List all payments (admin)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function listPayments(req, res) {
    const filters = {
        userId: req.query.userId || null,
        status: req.query.status || null,
        limit: parseInt(req.query.limit) || 100
    };

    const result = paymentService.listPayments(filters);

    return res.json({
        success: true,
        count: result.count,
        total: result.total,
        payments: result.payments
    });
}

// =============================================
// CONFIG
// =============================================

/**
 * Get server configuration (read-only)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function config(req, res) {
    return res.json({
        success: true,
        config: {
            version: '3.1.0',
            sdkType: 'PPGAME',
            defaultChannel: CONSTANTS.DEFAULT_SDK_CHANNEL,
            defaultAppId: CONSTANTS.DEFAULT_APP_ID,
            sessionDuration: '7 days',
            hashAlgorithm: CONSTANTS.HASH_ALGORITHM,
            maxAnalyticsEvents: CONSTANTS.MAX_ANALYTICS_EVENTS,
            supportedLanguages: ['en', 'cn', 'kr', 'vi', 'jr', 'tw', 'pt', 'fr', 'de'],
            endpoints: {
                auth: {
                    login: '/api/auth/login',
                    register: '/api/auth/register',
                    guest: '/api/auth/guest',
                    logout: '/api/auth/logout',
                    check: '/api/auth/check',
                    refresh: '/api/auth/refresh',
                    convertGuest: '/api/auth/convert-guest'
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
// HEALTH
// =============================================

/**
 * Health check endpoint
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function health(req, res) {
    const uptime = process.uptime();
    
    // Calculate uptime parts
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = Math.floor(uptime % 60);
    
    const timeParts = [];
    if (days > 0) timeParts.push(`${days}d`);
    if (hours > 0) timeParts.push(`${hours}h`);
    if (mins > 0) timeParts.push(`${mins}m`);
    timeParts.push(`${secs}s`);

    const cacheStats = store.getCacheStats();
    const userStats = userManager.getStats();
    const sessionStats = sessionManager.getStats();

    return res.json({
        status: 'online',
        service: 'sdk-server',
        version: '3.1.0',
        port: CONSTANTS.PORT,
        host: CONSTANTS.HOST,
        environment: CONSTANTS.IS_DEV ? 'development' : 'production',
        uptime: uptime,
        uptimeFormatted: timeParts.join(' '),
        stats: {
            registeredUsers: userStats.total,
            guests: userStats.guests,
            registered: userStats.registered,
            activeSessions: sessionStats.active,
            totalPayments: paymentService.getTotalCount(),
            totalEvents: analyticsService.getTotalEventCount()
        },
        cache: {
            entries: cacheStats.entries
        },
        timestamp: new Date().toISOString()
    });
}

// =============================================
// EXPORT
// =============================================

module.exports = {
    info,
    language,
    listUsers,
    getUserDetail,
    listPayments,
    config,
    health
};