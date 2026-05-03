/**
 * index.js — SDK-SERVER Main Entry Point
 * Referensi: sdk.md — Full Specification
 *
 * Port: 9999
 * Transport: HTTP REST (Express.js)
 * Database: better-sqlite3 — ./data/sdk.db
 * CORS: Allow-Origin: *
 *
 * Endpoint tanpa prefix /api/:
 *   POST /auth/guest
 *   POST /auth/login
 *   POST /auth/validate
 *   POST /payment/create
 *   POST /payment/confirm
 *   GET  /payment/status/:paymentId
 *   GET  /payment/list/:userId
 *   GET  /user/info/:userId
 *   POST /event/report
 */

const express = require('express');
const cors = require('cors');
const md5 = require('md5');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const logger = require('./logger');
const db = require('./db');

// ─── Configuration ───
const PORT = 9999;
const SECRET_KEY = 'SUPER_WARRIOR_Z_SDK_SECRET_2026';
const MAIN_SERVER_URL = 'http://127.0.0.1:8001';
const PAYMENT_CALLBACK_PATH = '/api/payment/callback';
const PAYMENT_RETRY_MAX = 5;
const PAYMENT_RETRY_INTERVAL = 5000;

// ─── Express App ───
const app = express();

// CORS: Allow-Origin: * (localhost only, minimal risk)
app.use(cors({ origin: '*' }));

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Utility Functions ───

/**
 * Generate random hex string
 * @param {number} bytes - Number of random bytes (output = bytes*2 hex chars)
 * @returns {string}
 */
function randomHex(bytes) {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate sign for a user
 * Formula: MD5(userId + secretKey)
 * Referensi: sdk.md Section 7.2
 * @param {string} userId
 * @returns {string}
 */
function generateSign(userId) {
    return md5(userId + SECRET_KEY);
}

/**
 * Generate loginToken
 * Formula: MD5(userId + timestamp + secretKey)
 * @param {string} userId
 * @returns {string}
 */
function generateLoginToken(userId) {
    return md5(userId + Date.now() + SECRET_KEY);
}

/**
 * Generate securityCode
 * Formula: randomHex(16) = 32 hex chars
 * Referensi: sdk.md Section 7.2
 * @returns {string}
 */
function generateSecurityCode() {
    return randomHex(16);
}

/**
 * Generate paymentId
 * Format: 'pay_' + randomHex(8)
 * @returns {string}
 */
function generatePaymentId() {
    return 'pay_' + randomHex(8);
}

/**
 * Generate sessionId
 * Format: 'sess_' + randomHex(12)
 * @returns {string}
 */
function generateSessionId() {
    return 'sess_' + randomHex(12);
}

/**
 * Notify Main-Server about payment completion (server-to-server)
 * Referensi: sdk.md Section 8 — Option B
 * Retry: up to 5x with 5s interval
 * @param {object} payment - Payment data
 */
function notifyMainServer(payment) {
    const callbackUrl = MAIN_SERVER_URL + PAYMENT_CALLBACK_PATH;
    const payload = JSON.stringify({
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        userId: payment.userId,
        status: payment.status,
        price: payment.price,
        currency: payment.currency,
        productId: payment.productId,
        productName: payment.productName
    });

    let attempt = 0;

    function tryNotify() {
        attempt++;
        const startTime = Date.now();

        const options = {
            hostname: '127.0.0.1',
            port: 8001,
            path: PAYMENT_CALLBACK_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 10000
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    logger.log('INFO', 'NOTIFY', 'Notify Main-Server success');
                    logger.details('data',
                        ['url', callbackUrl],
                        ['status', res.statusCode],
                        ['response', body.substring(0, 100)],
                        ['duration', duration + 'ms']
                    );
                } else {
                    logger.log('WARN', 'NOTIFY', `Notify Main-Server returned ${res.statusCode}`);
                    logger.details('data',
                        ['url', callbackUrl],
                        ['status', res.statusCode],
                        ['response', body.substring(0, 100)]
                    );
                    retryOrFail();
                }
            });
        });

        req.on('error', (err) => {
            const duration = Date.now() - startTime;
            if (attempt < PAYMENT_RETRY_MAX) {
                logger.log('WARN', 'NOTIFY', 'Notify retry — ' + err.message);
                logger.details('data',
                    ['url', callbackUrl],
                    ['attempt', `${attempt}/${PAYMENT_RETRY_MAX}`],
                    ['nextRetry', PAYMENT_RETRY_INTERVAL / 1000 + 's']
                );
                setTimeout(tryNotify, PAYMENT_RETRY_INTERVAL);
            } else {
                logger.log('ERROR', 'NOTIFY', 'Notify failed — server unreachable');
                logger.details('important',
                    ['url', callbackUrl],
                    ['attempts', `${attempt}/${PAYMENT_RETRY_MAX}`],
                    ['error', err.message],
                    ['duration', duration + 'ms']
                );
            }
        });

        req.on('timeout', () => {
            req.destroy();
        });

        req.write(payload);
        req.end();
    }

    function retryOrFail() {
        if (attempt < PAYMENT_RETRY_MAX) {
            logger.log('WARN', 'NOTIFY', `Notify retry — attempt ${attempt} failed`);
            logger.details('data',
                ['url', callbackUrl],
                ['attempt', `${attempt}/${PAYMENT_RETRY_MAX}`],
                ['nextRetry', PAYMENT_RETRY_INTERVAL / 1000 + 's']
            );
            setTimeout(tryNotify, PAYMENT_RETRY_INTERVAL);
        } else {
            logger.log('ERROR', 'NOTIFY', 'Notify failed — max retries reached');
            logger.details('important',
                ['url', callbackUrl],
                ['attempts', `${attempt}/${PAYMENT_RETRY_MAX}`]
            );
        }
    }

    tryNotify();
}

// ═══════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// Referensi: sdk.md Section 4, 7, 15
// ═══════════════════════════════════════════════════════════════

/**
 * POST /auth/guest
 * Guest login — generate new user with guest_xxxx ID
 *
 * Request: {}
 * Response: { loginToken, sign, security, userId, nickName }
 */
app.post('/auth/guest', (req, res) => {
    const startTime = Date.now();

    try {
        // Generate new guest user
        const userId = 'guest_' + randomHex(8);
        const loginToken = generateLoginToken(userId);
        const sign = generateSign(userId);
        const securityCode = generateSecurityCode();
        const nickName = 'Guest_' + userId.slice(-4);

        // Create user in database
        db.createUser({
            userId, loginToken, sign, securityCode, nickName, sdk: 'ppgame'
        });

        // Create session
        db.createSession({
            sessionId: generateSessionId(),
            userId, loginToken
        });

        const duration = Date.now() - startTime;
        logger.log('INFO', 'AUTH', 'Guest login success');
        logger.details('data',
            ['userId', userId],
            ['nickName', nickName],
            ['duration', duration + 'ms']
        );

        res.json({
            loginToken,
            sign,
            security: securityCode,
            userId,
            nickName
        });

    } catch (err) {
        logger.log('ERROR', 'AUTH', 'Guest login failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

/**
 * POST /auth/login
 * Login by UserID — find existing or create new
 *
 * Request: { userId }
 * Response: { loginToken, sign, security, userId, nickName }
 */
app.post('/auth/login', (req, res) => {
    const startTime = Date.now();
    const { userId } = req.body;

    if (!userId) {
        logger.log('WARN', 'AUTH', 'Login failed — missing userId');
        return res.status(400).json({ error: 'Missing userId' });
    }

    try {
        let user = db.getUser(userId);

        if (user) {
            // Existing user — generate new token, update login data
            const loginToken = generateLoginToken(userId);
            const sign = generateSign(userId);
            const securityCode = generateSecurityCode();

            db.updateUserLogin(userId, { loginToken, sign, securityCode });

            // Create new session
            db.createSession({
                sessionId: generateSessionId(),
                userId, loginToken
            });

            const duration = Date.now() - startTime;
            logger.log('INFO', 'AUTH', 'Login by userId success (existing)');
            logger.details('data',
                ['userId', userId],
                ['nickName', user.nickName],
                ['duration', duration + 'ms']
            );

            res.json({
                loginToken,
                sign,
                security: securityCode,
                userId: user.userId,
                nickName: user.nickName
            });

        } else {
            // New user — create with provided userId
            const loginToken = generateLoginToken(userId);
            const sign = generateSign(userId);
            const securityCode = generateSecurityCode();
            const nickName = 'User_' + userId.slice(-4);

            db.createUser({
                userId, loginToken, sign, securityCode, nickName, sdk: 'ppgame'
            });

            db.createSession({
                sessionId: generateSessionId(),
                userId, loginToken
            });

            const duration = Date.now() - startTime;
            logger.log('INFO', 'AUTH', 'Login by userId success (new user)');
            logger.details('data',
                ['userId', userId],
                ['nickName', nickName],
                ['duration', duration + 'ms']
            );

            res.json({
                loginToken,
                sign,
                security: securityCode,
                userId,
                nickName
            });
        }

    } catch (err) {
        logger.log('ERROR', 'AUTH', 'Login failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

/**
 * POST /auth/validate
 * Validate loginToken + return sign & securityCode
 * Dipanggil oleh Login-Server (Option A) dan oleh sdk.js saat session restore
 *
 * Request: { loginToken, userId, securityCode? }
 * Response: { valid, sign, securityCode }
 */
app.post('/auth/validate', (req, res) => {
    const startTime = Date.now();
    const { loginToken, userId, securityCode } = req.body;

    if (!loginToken || !userId) {
        logger.log('WARN', 'AUTH', 'Validate failed — missing fields');
        return res.status(400).json({ valid: false, error: 'Missing loginToken or userId' });
    }

    try {
        const user = db.validateSession(loginToken, userId);

        if (user) {
            // Optional: juga verifikasi securityCode jika dikirim
            let securityValid = true;
            if (securityCode && user.securityCode !== securityCode) {
                securityValid = false;
            }

            const valid = securityValid;
            const duration = Date.now() - startTime;

            if (valid) {
                logger.log('INFO', 'AUTH', 'Security code verified');
                logger.details('data',
                    ['userId', userId],
                    ['valid', 'true'],
                    ['duration', duration + 'ms']
                );
            } else {
                logger.log('WARN', 'AUTH', 'Security code mismatch');
                logger.details('data',
                    ['userId', userId],
                    ['valid', 'false'],
                    ['duration', duration + 'ms']
                );
            }

            // Selalu return sign & securityCode agar sdk.js bisa re-populate saat session restore
            res.json({
                valid,
                sign: user.sign,
                securityCode: user.securityCode
            });

        } else {
            const duration = Date.now() - startTime;
            logger.log('WARN', 'AUTH', 'Validate failed — token mismatch');
            logger.details('data',
                ['userId', userId],
                ['valid', 'false'],
                ['duration', duration + 'ms']
            );

            res.json({
                valid: false,
                sign: '',
                securityCode: ''
            });
        }

    } catch (err) {
        logger.log('ERROR', 'AUTH', 'Validate failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ valid: false, error: 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// PAYMENT ENDPOINTS
// Referensi: sdk.md Section 8, 15
// ═══════════════════════════════════════════════════════════════

/**
 * POST /payment/create
 * Buat payment order dari prePayRet data
 *
 * Request: orderData dari prePayRet { orderId, productId, productName, price, currency, userId, serverId, ... }
 * Response: { paymentId, status, payUrl }
 */
app.post('/payment/create', (req, res) => {
    const startTime = Date.now();
    const orderData = req.body;

    if (!orderData || !orderData.orderId) {
        logger.log('WARN', 'PAY', 'Payment create failed — missing orderData');
        return res.status(400).json({ error: 'Missing orderData or orderId' });
    }

    try {
        const paymentId = generatePaymentId();

        db.createPayment({
            paymentId,
            orderId: orderData.orderId,
            userId: orderData.userId || '',
            productId: orderData.productId || '',
            productName: orderData.productName || '',
            price: orderData.price || 0,
            currency: orderData.currency || 'USD',
            serverId: orderData.serverId || '',
            roleId: orderData.roleId || '',
            roleName: orderData.roleName || '',
            extra: orderData.extra || ''
        });

        const duration = Date.now() - startTime;
        logger.log('INFO', 'PAY', 'Payment order created');
        logger.details('data',
            ['paymentId', paymentId],
            ['orderId', orderData.orderId],
            ['product', orderData.productName || orderData.productId],
            ['price', `${orderData.price || 0} ${orderData.currency || 'USD'}`],
            ['duration', duration + 'ms']
        );

        res.json({
            paymentId,
            status: 'pending',
            payUrl: ''  // Localhost — tidak perlu redirect
        });

    } catch (err) {
        logger.log('ERROR', 'PAY', 'Payment creation failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

/**
 * POST /payment/confirm
 * Konfirmasi payment sukses
 * Setelah konfirmasi → SDK-Server notify Main-Server server-to-server
 *
 * Request: { paymentId, orderId }
 * Response: { success, message }
 */
app.post('/payment/confirm', (req, res) => {
    const startTime = Date.now();
    const { paymentId, orderId } = req.body;

    if (!paymentId) {
        logger.log('WARN', 'PAY', 'Payment confirm failed — missing paymentId');
        return res.status(400).json({ error: 'Missing paymentId' });
    }

    try {
        const payment = db.getPayment(paymentId);

        if (!payment) {
            logger.log('WARN', 'PAY', 'Payment confirm failed — not found');
            logger.detail('data', ['paymentId', paymentId]);
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        if (payment.status === 'success') {
            logger.log('WARN', 'PAY', 'Payment already confirmed');
            logger.detail('data', ['paymentId', paymentId]);
            return res.json({ success: true, message: 'Already confirmed' });
        }

        if (payment.status === 'cancelled') {
            logger.log('WARN', 'PAY', 'Payment was cancelled');
            logger.detail('data', ['paymentId', paymentId]);
            return res.status(400).json({ success: false, message: 'Payment was cancelled' });
        }

        // Confirm payment
        const confirmed = db.confirmPayment(paymentId);

        const duration = Date.now() - startTime;
        logger.log('INFO', 'PAY', 'Payment confirmed');
        logger.details('data',
            ['paymentId', paymentId],
            ['orderId', payment.orderId],
            ['userId', payment.userId],
            ['duration', duration + 'ms']
        );

        // Notify Main-Server (server-to-server, async)
        // Option B: SDK-Server langsung notify, BUKAN melalui client
        notifyMainServer(confirmed);

        res.json({
            success: true,
            message: 'Payment confirmed'
        });

    } catch (err) {
        logger.log('ERROR', 'PAY', 'Payment confirm failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

/**
 * GET /payment/status/:paymentId
 * Cek status payment
 *
 * Response: { status, orderId }
 */
app.get('/payment/status/:paymentId', (req, res) => {
    const { paymentId } = req.params;

    try {
        const payment = db.getPayment(paymentId);

        if (!payment) {
            logger.log('WARN', 'PAY', 'Payment status — not found');
            logger.detail('data', ['paymentId', paymentId]);
            return res.status(404).json({ error: 'Payment not found' });
        }

        logger.log('DEBUG', 'PAY', 'Payment status queried');
        logger.detail('data', ['paymentId', paymentId], ['status', payment.status]);

        res.json({
            status: payment.status,
            orderId: payment.orderId
        });

    } catch (err) {
        logger.log('ERROR', 'PAY', 'Payment status failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /payment/list/:userId
 * Riwayat payment user
 *
 * Response: [{ paymentId, orderId, status, amount, createdAt }]
 */
app.get('/payment/list/:userId', (req, res) => {
    const { userId } = req.params;

    try {
        const payments = db.getPaymentsByUser(userId);

        logger.log('DEBUG', 'PAY', 'Payment list queried');
        logger.detail('data', ['userId', userId], ['count', payments.length]);

        const result = payments.map(p => ({
            paymentId: p.paymentId,
            orderId: p.orderId,
            status: p.status,
            amount: p.price,
            currency: p.currency,
            productName: p.productName,
            createdAt: p.createdAt
        }));

        res.json(result);

    } catch (err) {
        logger.log('ERROR', 'PAY', 'Payment list failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// USER ENDPOINTS
// Referensi: sdk.md Section 15.2
// ═══════════════════════════════════════════════════════════════

/**
 * GET /user/info/:userId
 * Info user — dipakai oleh server lain untuk cross-server data
 *
 * Response: { userId, nickName, sdk, loginToken, sign, securityCode, createdAt, lastLoginAt }
 */
app.get('/user/info/:userId', (req, res) => {
    const { userId } = req.params;

    try {
        const user = db.getUser(userId);

        if (!user) {
            logger.log('WARN', 'AUTH', 'User info — not found');
            logger.detail('data', ['userId', userId]);
            return res.status(404).json({ error: 'User not found' });
        }

        logger.log('INFO', 'AUTH', 'Incoming cross-server request');
        logger.detail('location', ['path', `/user/info/${userId}`]);

        logger.log('DEBUG', 'DB', 'User found');
        logger.detail('data', ['userId', userId]);

        res.json({
            userId: user.userId,
            nickName: user.nickName,
            sdk: user.sdk,
            loginToken: user.loginToken,
            sign: user.sign,
            securityCode: user.securityCode,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt
        });

    } catch (err) {
        logger.log('ERROR', 'AUTH', 'User info failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// EVENT ENDPOINTS
// Referensi: sdk.md Section 9, 15.5
// ═══════════════════════════════════════════════════════════════

/**
 * POST /event/report
 * Report event dari sdk.js — HANYA log ke console + DB, tidak kirim ke external
 *
 * Request: { eventType, data, userId? }
 * Response: { success: true }
 */
app.post('/event/report', (req, res) => {
    const { eventType, data, userId } = req.body;

    if (!eventType) {
        return res.status(400).json({ error: 'Missing eventType' });
    }

    try {
        db.recordEvent({
            userId: userId || '',
            eventType,
            eventData: data ? JSON.stringify(data) : null
        });

        res.json({ success: true });

    } catch (err) {
        logger.log('ERROR', 'SERVER', 'Event report failed');
        logger.detail('important', ['error', err.message]);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// SERVER STARTUP
// ═══════════════════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
    logger.boundary('🚀', 'SDK-Server v1.0.0');
    logger.detail('location', ['Port', PORT], ['DB', path.join(__dirname, 'data', 'sdk.db')], ['Mode', 'standalone']);
    logger.boundaryEnd('🚀');

    console.log('');
    logger.log('INFO', 'ROUTE', 'Routes registered');
    logger.route('POST', '/auth/guest');
    logger.route('POST', '/auth/login');
    logger.route('POST', '/auth/validate');
    logger.route('POST', '/payment/create');
    logger.route('POST', '/payment/confirm');
    logger.route('GET',  '/payment/status/:paymentId');
    logger.route('GET',  '/payment/list/:userId');
    logger.route('GET',  '/user/info/:userId');
    logger.routeLast('POST', '/event/report');

    console.log('');
    logger.log('INFO', 'SERVER', `Ready — listening on http://127.0.0.1:${PORT}`);
});
