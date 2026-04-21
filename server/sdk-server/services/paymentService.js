/**
 * ============================================================================
 *  SDK Server v3 — Payment Service
 *  ============================================================================
 *
 *  Payment logging in data/payments.json.
 *  NOTE: Actual payment approval/delivery happens in main-server (8001).
 *  sdk-server ONLY logs orders from sdk.js createPaymentOrder.
 *
 *  Flow (from main.min.js):
 *    1. Client taps buy → main-server prePayRet
 *    2. Client enriches with roleId/roleName/roleLevel/roleVip/serverName
 *    3. Client calls TSBrowser.executeFunction("paySdk", data)
 *    4. → sdk.js PPGAME.createPaymentOrder → POST /api/payment/create
 *    5. sdk-server logs order → returns orderId
 *    6. User confirms → POST /api/payment/verify → status confirmed
 *    7. Main-server delivers goods → PUSH notifyData("payFinish")
 *
 * ============================================================================
 */

var store = require('../storage/jsonStore');
var cryptoUtil = require('../utils/crypto');
var logger = require('../utils/logger');

var PAYMENTS_FILE = store.buildPath('payments.json');

// =============================================
// DATA ACCESS
// =============================================

function loadPayments() {
    return store.load(PAYMENTS_FILE, { payments: [], nextOrderNum: 1 });
}

function savePayments(data) {
    return store.save(PAYMENTS_FILE, data);
}

// =============================================
// OPERATIONS
// =============================================

/**
 * Create payment order from sdk.js.
 */
function createOrder(paymentData) {
    var data = loadPayments();

    var orderId = paymentData.orderId || cryptoUtil.generateOrderId(data.nextOrderNum);
    if (!paymentData.orderId) {
        data.nextOrderNum = (data.nextOrderNum || 1) + 1;
    }

    var record = {
        orderId: orderId,
        userId: paymentData.roleId || paymentData.userId || 'unknown',
        roleName: paymentData.roleName || 'unknown',
        roleLevel: String(paymentData.roleLevel || 'unknown'),
        roleVip: String(paymentData.roleVip || 'unknown'),
        serverName: paymentData.serverName || 'unknown',
        amount: paymentData.price || paymentData.totalPrice || paymentData.money || 0,
        goodsId: String(paymentData.goodsId || paymentData.goodId || 'unknown'),
        goodsName: paymentData.goodsName || ('Item ' + (paymentData.goodsId || '?')),
        goodsNum: paymentData.goodsNum || paymentData.goodNum || 1,
        currency: paymentData.currency || 'USD',
        channel: paymentData.channel || 'ppgame',
        appId: paymentData.appId || '288',
        sessionId: paymentData.sessionId || null,
        receivedAt: new Date().toISOString(),
        status: 'received'
    };

    data.payments.push(record);

    if (!savePayments(data)) {
        return { success: false, orderId: orderId, message: 'Storage error' };
    }

    logger.info('Payment', 'Order created: ' + orderId +
        ' | ' + record.roleName + ' (' + record.userId + ')' +
        ' | ' + record.goodsName + ' | $' + record.amount);

    return { success: true, orderId: orderId, message: 'Order created' };
}

/**
 * Legacy payment log (backward compat).
 */
function processPayment(paymentData) {
    return createOrder(paymentData);
}

/**
 * Verify payment — status received → confirmed.
 */
function verifyPayment(orderId, userId) {
    var data = loadPayments();
    var found = false;

    for (var i = 0; i < data.payments.length; i++) {
        if (data.payments[i].orderId === orderId) {
            data.payments[i].status = 'confirmed';
            data.payments[i].verifiedAt = new Date().toISOString();
            found = true;
            logger.info('Payment', 'Verified: ' + orderId + ' by ' + userId);
            break;
        }
    }

    if (!found) return { success: false, message: 'Order not found: ' + orderId };
    if (!savePayments(data)) return { success: false, message: 'Storage error' };

    return { success: true, message: 'Payment verified' };
}

/**
 * Payment callback — external status update.
 */
function paymentCallback(orderId, status, extraData) {
    var validStatuses = ['received', 'confirmed', 'delivered', 'failed', 'refunded'];

    if (validStatuses.indexOf(status) === -1) {
        return { success: false, message: 'Invalid status: ' + status };
    }

    var data = loadPayments();
    var found = false;

    for (var i = 0; i < data.payments.length; i++) {
        if (data.payments[i].orderId === orderId) {
            data.payments[i].status = status;
            data.payments[i].callbackAt = new Date().toISOString();
            if (extraData) data.payments[i].callbackData = extraData;
            found = true;
            logger.info('Payment', 'Callback: ' + orderId + ' → ' + status);
            break;
        }
    }

    if (!found) return { success: false, message: 'Order not found: ' + orderId };
    if (!savePayments(data)) return { success: false, message: 'Storage error' };

    return { success: true, message: 'Callback: ' + status };
}

// =============================================
// LIST
// =============================================

function listPayments(filters) {
    var data = loadPayments();
    var payments = data.payments || [];
    filters = filters || {};

    if (filters.userId) {
        payments = payments.filter(function (p) { return p.userId === filters.userId; });
    }
    if (filters.status) {
        payments = payments.filter(function (p) { return p.status === filters.status; });
    }

    var limit = filters.limit || 100;
    var total = payments.length;

    var result = payments.slice(-limit).reverse();

    return { payments: result, count: result.length, total: total };
}

function getTotalCount() {
    return (loadPayments().payments || []).length;
}

module.exports = {
    createOrder: createOrder,
    processPayment: processPayment,
    verifyPayment: verifyPayment,
    paymentCallback: paymentCallback,
    listPayments: listPayments,
    getTotalCount: getTotalCount
};
