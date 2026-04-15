/**
 * ============================================================================
 *  Payment Handlers — Process, Create, Verify, Callback
 *  ============================================================================
 *
 *  Endpoints:
 *    POST /api/payment/process   — Log payment (legacy endpoint)
 *    POST /api/payment/create    — Create payment order (dari sdk.js)
 *    POST /api/payment/verify    — Verify payment (dari sdk.js confirmPayment)
 *    POST /api/payment/callback  — Payment callback notification
 *
 *  Payment flow lengkap (dari main.min.js):
 *    1. Client klik beli → processHandler({type:"activity",action:"buyXxx"})
 *    2. Main server (8001) return { prePayRet: { errorCode:0, data:{...} } }
 *    3. Client check: e.prePayRet && 0 === e.prePayRet.errorCode
 *    4. Client enriches data:
 *       - e.roleId = UserInfoSingleton.getInstance().userId
 *       - e.roleName = UserInfoSingleton.getInstance().userNickName
 *       - e.roleLevel = UserInfoSingleton.getInstance().getUserLevel()
 *       - e.roleVip = UserInfoSingleton.getInstance().userVipLevel
 *       - e.serverName = ts.loginUserInfo.serverName
 *    5. Client calls: TSBrowser.executeFunction("paySdk", enrichedData)
 *    6. → window.paySdk(data) → PPGAME.createPaymentOrder(data)
 *    7. sdk.js: handleCreatePaymentOrder(data) → POST /api/payment/create
 *    8. sdk-server: log order, return orderId
 *    9. sdk.js: show payment confirmation UI
 *   10. User confirms → confirmPayment() → POST /api/payment/verify
 *   11. Main server delivers goods → PUSH notifyData("payFinish")
 *   12. Client: refreshNodePayFinish() → update semua UI panel
 *
 *  CATATAN PENTING:
 *    - Payment APPROVAL/REJECT terjadi di main-server (8001), bukan di sini
 *    - sdk-server HANYA menerima log dan menyediakan UI confirmation
 *    - /api/payment/process adalah endpoint legacy, diganti oleh /api/payment/create
 *    - Tapi tetap didukung untuk backward compatibility
 *
 * ============================================================================
 */

var paymentService = require('../services/paymentService');

// =============================================
// POST /api/payment/process (LEGACY)
// =============================================

/**
 * Handler: Log payment dari game (legacy endpoint).
 * Tetap didukung untuk backward compatibility dengan sdk.js lama.
 *
 * Request: payment object dari prePayRet.data
 *   { orderId?, price, goodsId, goodsName, roleId, roleName, roleLevel, roleVip, serverName, ... }
 *
 * Response: { success: true, orderId: string, message: string }
 *           { success: false, message: string }
 */
function process(req, res) {
    var paymentData = req.body;

    if (!paymentData) {
        return res.json({
            success: false,
            message: 'No payment data received'
        });
    }

    var result = paymentService.processPayment(paymentData);
    return res.json(result);
}

// =============================================
// POST /api/payment/create
// =============================================

/**
 * Handler: Create payment order dari sdk.js handleCreatePaymentOrder.
 *
 * Request: enriched payment data dari sdk.js
 *   {
 *     orderId?, userId, sessionId, goodsId, goodsName, goodsNum,
 *     price, totalPrice, currency, roleId, roleName, roleLevel,
 *     roleVip, serverId, serverName, channel, appId, timestamp
 *   }
 *
 * Response: { success: true, orderId: string, message: string }
 *           { success: false, orderId: string, message: string }
 */
function create(req, res) {
    var paymentData = req.body;

    if (!paymentData || !paymentData.goodsId) {
        return res.json({
            success: false,
            message: 'Invalid payment data — missing goodsId'
        });
    }

    var result = paymentService.createOrder(paymentData);
    return res.json(result);
}

// =============================================
// POST /api/payment/verify
// =============================================

/**
 * Handler: Verify payment dari sdk.js confirmPayment.
 *
 * Dipanggil SETELAH user mengkonfirmasi payment di UI.
 * Update status: 'received' → 'confirmed'.
 *
 * Catatan: Delivery barang sebenarnya dilakukan oleh main-server (8001)
 * melalui PUSH notifyData("payFinish"). Endpoint ini hanya log saja.
 *
 * Request: { orderId: string, userId: string, sessionId: string, confirmed: true, timestamp: string }
 * Response: { success: true, message: string }
 *           { success: false, message: string }
 */
function verify(req, res) {
    var orderId = req.body.orderId;
    var userId = req.body.userId;

    if (!orderId) {
        return res.json({
            success: false,
            message: 'Order ID diperlukan'
        });
    }

    var result = paymentService.verifyPayment(orderId, userId || 'unknown');
    return res.json(result);
}

// =============================================
// POST /api/payment/callback
// =============================================

/**
 * Handler: Payment callback notification.
 *
 * Dipanggil oleh sistem eksternal atau manual untuk update status.
 * Status valid: 'received', 'confirmed', 'delivered', 'failed', 'refunded'
 *
 * Request: { orderId: string, status: string, data?: any }
 * Response: { success: true, message: string }
 *           { success: false, message: string }
 */
function callback(req, res) {
    var orderId = req.body.orderId;
    var status = req.body.status;
    var extraData = req.body.data;

    if (!orderId || !status) {
        return res.json({
            success: false,
            message: 'Order ID dan status diperlukan'
        });
    }

    var result = paymentService.paymentCallback(orderId, status, extraData);
    return res.json(result);
}

module.exports = {
    process: process,
    create: create,
    verify: verify,
    callback: callback
};
