/**
 * ============================================================================
 *  Analytics Handlers — Single Event & Dashboard
 *  ============================================================================
 *
 *  Endpoints:
 *    POST /api/analytics/event     — Single analytics event (fire-and-forget)
 *    GET  /api/analytics/dashboard  — Dashboard analytics (admin)
 *
 *  /api/analytics/event berbeda dari /api/report/event:
 *    - /api/report/event: dari sdk.js report queue (eventType field)
 *    - /api/analytics/event: dari sdk.js sendAnalytics() (action field)
 *    Kedua endpoint menyimpan ke file yang sama (data/analytics.json)
 *    Field normalization terjadi di analyticsService.normalizeEvent()
 *
 * ============================================================================
 */

var analyticsService = require('../services/analyticsService');

// =============================================
// POST /api/analytics/event
// =============================================

/**
 * Handler: Single analytics event (fire-and-forget).
 *
 * Request: {
 *   category: string,    — facebook_pixel, google_analytics, sdk_report, dll
 *   action: string,      — event/action name
 *   data: any,           — event payload
 *   userId: string|null,
 *   sdkChannel: string,
 *   timestamp: string
 * }
 *
 * Response: { success: true } (selalu)
 *
 * Selalu return success karena analytics TIDAK BOLEH gagal.
 * Jika server error, event hilang — acceptable untuk analytics.
 */
function event(req, res) {
    var event = req.body;

    if (!event || !event.category || !event.action) {
        return res.json({ success: true });
    }

    analyticsService.appendEvent(event);

    return res.json({ success: true });
}

// =============================================
// GET /api/analytics/dashboard
// =============================================

/**
 * Handler: Dashboard ringkasan analytics (admin/debug).
 *
 * Query params:
 *   ?category=lifecycle  — filter by category
 *   ?limit=50            — max recent events returned
 *
 * Response: {
 *   success: true,
 *   meta: { totalEvents, lastFlush },
 *   totalEvents: number,
 *   categoryStats: { categoryName: { count, actions: { actionName: count } } },
 *   recentEvents: Array
 * }
 */
function dashboard(req, res) {
    var category = req.query.category || null;
    var limit = parseInt(req.query.limit) || 50;

    var data = analyticsService.getDashboard(category, limit);

    res.json({
        success: true,
        meta: data.meta,
        totalEvents: data.totalEvents,
        categoryStats: data.categoryStats,
        recentEvents: data.recentEvents
    });
}

module.exports = {
    event: event,
    dashboard: dashboard
};
