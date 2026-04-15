/**
 * ============================================================================
 *  Report Handlers — Single Event & Batch
 *  ============================================================================
 *
 *  Endpoints:
 *    POST /api/report/event  — Single report event (fire-and-forget)
 *    POST /api/report/batch  — Batch report dari sdk.js flushReportQueue()
 *
 *  Dipanggil oleh sdk.js:
 *    - queueReport() → append ke _state.reportQueue
 *    - Auto-flush saat queue >= REPORT_BATCH_SIZE (10)
 *    - flushReportQueue() → POST /api/report/batch { reports: [...], timestamp }
 *    - sendImmediateReport() → flush setelah queue 1 event
 *
 *  Selalu return { success: true } — report TIDAK BOLEH gagal.
 *  Jika server error, sdk.js akan re-queue events.
 *
 * ============================================================================
 */

var analyticsService = require('../services/analyticsService');

// =============================================
// POST /api/report/event
// =============================================

/**
 * Handler: Single report event (fire-and-forget).
 *
 * Request: { eventType: string, category?, eventData?, userId?, sessionId?, ... }
 * Response: { success: true } (selalu)
 *
 * Field mapping (dari sdk.js queueReport):
 *   - eventType → action
 *   - eventData → data
 *   - category → category
 *   - userId, sessionId, serverId, serverName, etc → preserved
 *
 * Selalu return success karena ini fire-and-forget.
 * sdk.js tidak menunggu response untuk report.
 */
function event(req, res) {
    var event = req.body;

    // Jika tidak ada data yang valid, tetap return success
    if (!event || !event.eventType) {
        return res.json({ success: true });
    }

    analyticsService.appendEvent(event);

    // Selalu return success — analytics tidak boleh gagal
    return res.json({ success: true });
}

// =============================================
// POST /api/report/batch
// =============================================

/**
 * Handler: Batch report dari sdk.js flushReportQueue().
 *
 * Request: { reports: Array, timestamp: string }
 * Response: { success: true, count: number } (selalu)
 *
 * Dipanggil oleh sdk.js:
 *   1. _state.reportQueue.length >= REPORT_BATCH_SIZE (10)
 *      ATAU
 *   2. setInterval setiap REPORT_FLUSH_INTERVAL_MS (30 detik)
 *      ATAU
 *   3. sendImmediateReport() → flush setelah 1 event
 *
 * sdk.js flushReportQueue:
 *   - Copy queue ke reports array
 *   - Reset queue ke []
 *   - POST /api/report/batch { reports, timestamp }
 *   - Jika gagal → re-queue (up to REPORT_MAX_QUEUE_SIZE)
 */
function batch(req, res) {
    var body = req.body;

    if (!body || !Array.isArray(body.reports) || body.reports.length === 0) {
        return res.json({ success: true });
    }

    var count = analyticsService.appendEvents(body.reports);

    // Selalu return success
    return res.json({
        success: true,
        count: count
    });
}

module.exports = {
    event: event,
    batch: batch
};
