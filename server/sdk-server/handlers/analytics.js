/**
 * ============================================================================
 * SDK Server — Analytics Handlers (Natural Implementation)
 * ============================================================================
 *
 * Endpoints:
 * POST /api/analytics/event — Single event (fire-and-forget)
 * GET /api/analytics/dashboard — Dashboard (admin)
 *
 * Natural approach:
 * - Fire-and-forget for event endpoint
 * - Clean dashboard response
 *
 * Difference from /api/report/*:
 * - analytics: { category, action, ... }
 * - report: { eventType, eventData, ... }
 * Both normalize in analyticsService
 *
 * ============================================================================
 */

const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

/**
 * Single analytics event
 * Fire-and-forget: always returns success
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function event(req, res) {
    const eventData = req.body;

    // Validate required fields
    if (!eventData || !eventData.category || !eventData.action) {
        // Still return success - fire-and-forget
        return res.json({ success: true });
    }

    // Append event (fire-and-forget)
    try {
        analyticsService.appendEvent(eventData);
    } catch (error) {
        // Never fail - fire-and-forget
        logger.error('Analytics', `Event failed: ${error.message}`);
    }

    return res.json({ success: true });
}

/**
 * Get analytics dashboard
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function dashboard(req, res) {
    const category = req.query.category || null;
    const limit = parseInt(req.query.limit) || 50;

    try {
        const data = analyticsService.getDashboard(category, limit);

        return res.json({
            success: true,
            meta: data.meta,
            totalEvents: data.totalEvents,
            categoryStats: data.categoryStats,
            recentEvents: data.recentEvents
        });
    } catch (error) {
        logger.error('Analytics', `Dashboard failed: ${error.message}`);
        
        return res.json({
            success: false,
            message: 'Gagal mengambil data analytics'
        });
    }
}

// =============================================
// EXPORT
// =============================================

module.exports = {
    event,
    dashboard
};