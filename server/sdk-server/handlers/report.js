/**
 * ============================================================================
 * SDK Server — Report Handlers (Natural Implementation)
 * ============================================================================
 *
 * Endpoints:
 * POST /api/report/event — Single report (fire-and-forget)
 * POST /api/report/batch — Batch reports from sdk.js flushReportQueue()
 *
 * Natural approach:
 * - Always return success (never block client)
 * - Fire-and-forget pattern
 * - sdk.js re-queues on failure (documented behavior)
 *
 * ============================================================================
 */

const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

/**
 * Single event report
 * Fire-and-forget: always returns success
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function event(req, res) {
    const eventData = req.body;

    // Append event (fire-and-forget)
    if (eventData && eventData.eventType) {
        try {
            analyticsService.appendEvent({
                category: 'report',
                action: eventData.eventType,
                data: eventData.eventData || eventData,
                userId: eventData.userId || null,
                sessionId: eventData.sessionId || null,
                timestamp: eventData.timestamp || new Date().toISOString()
            });
        } catch (error) {
            // Never fail - fire-and-forget
            logger.error('Report', `Event failed: ${error.message}`);
        }
    }

    // Always return success
    return res.json({
        success: true
    });
}

/**
 * Batch event reports
 * From sdk.js flushReportQueue()
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function batch(req, res) {
    const reports = req.body && req.body.reports;

    // Validate reports array
    if (!Array.isArray(reports) || reports.length === 0) {
        return res.json({
            success: true,
            count: 0
        });
    }

    // Append all events (fire-and-forget)
    try {
        const count = analyticsService.appendEvents(
            reports.map(r => ({
                category: 'report',
                action: r.eventType || 'batch',
                data: r.eventData || r,
                userId: r.userId || null,
                sessionId: r.sessionId || null,
                timestamp: r.timestamp || new Date().toISOString()
            }))
        );

        return res.json({
            success: true,
            count: count
        });
    } catch (error) {
        // Never fail - fire-and-forget
        logger.error('Report', `Batch failed: ${error.message}`);
        
        return res.json({
            success: true,
            count: 0
        });
    }
}

// =============================================
// EXPORT
// =============================================

module.exports = {
    event,
    batch
};