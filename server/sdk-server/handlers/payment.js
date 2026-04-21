/**
 * ============================================================================
 * SDK Server — Payment Handlers (Natural Implementation)
 * ============================================================================
 *
 * Endpoints:
 * POST /api/payment/process — Legacy payment log
 * POST /api/payment/create — Create order (from sdk.js)
 * POST /api/payment/verify — Verify payment (from sdk.js confirm)
 * POST /api/payment/callback — External callback
 *
 * Natural approach:
 * - Clean payment logging
 * - Proper error handling
 * - Note: Actual delivery happens in main-server (8001)
 *
 * ============================================================================
 */

const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');

/**
 * Legacy payment process
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function process(req, res) {
    const paymentData = req.body;

    if (!paymentData) {
        return res.json({
            success: false,
            message: 'Data payment diperlukan'
        });
    }

    const result = paymentService.processPayment(paymentData);
    return res.json(result);
}

/**
 * Create new payment order
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function create(req, res) {
    const paymentData = req.body;

    // Validate required fields
    if (!paymentData || !paymentData.goodsId) {
        return res.json({
            success: false,
            message: 'goodsId diperlukan'
        });
    }

    const result = paymentService.createOrder(paymentData);
    return res.json(result);
}

/**
 * Verify payment
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function verify(req, res) {
    const { orderId, userId } = req.body;

    if (!orderId) {
        return res.json({
            success: false,
            message: 'Order ID diperlukan'
        });
    }

    const result = paymentService.verifyPayment(orderId, userId || 'unknown');
    return res.json(result);
}

/**
 * Payment callback from external source
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function callback(req, res) {
    const { orderId, status, data } = req.body;

    if (!orderId || !status) {
        return res.json({
            success: false,
            message: 'Order ID dan status diperlukan'
        });
    }

    const result = paymentService.paymentCallback(orderId, status, data);
    return res.json(result);
}

// =============================================
// EXPORT
// =============================================

module.exports = {
    process,
    create,
    verify,
    callback
};