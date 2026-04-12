/**
 * =====================================================
 *  SDK Server — Dragon Ball Z (Super Fighter Z)
 *  Port 9999
 *
 *  Backend untuk sdk.js client (PPGAME SDK type):
 *
 *  Endpoints:
 *    GET  /health                    — Health check
 *    GET  /api/auth/check            — Validasi session
 *    POST /api/auth/login            — Login user
 *    POST /api/auth/register         — Registrasi user baru
 *    POST /api/auth/logout           — Logout user
 *    POST /api/payment/process       — Proses payment
 *    POST /api/analytics/event       — Terima analytics event (fire-and-forget)
 *    GET  /api/analytics/dashboard   — Dashboard analytics
 *    GET  /api/users                 — List semua user (admin)
 *    GET  /api/users/:id             — Detail user
 *    GET  /api/payments              — List semua payment (admin)
 *
 *  Data Flow:
 *    sdk.js (browser) ←→ sdk-server (9999) ←→ data/users.json, data/payments.json
 *
 *  Login Flow:
 *    1. User login via sdk.js UI → POST /api/auth/login
 *    2. Server return { userId, sign, sdk, loginToken, nickName, security }
 *    3. sdk.js redirect: ?sdk=X&logintoken=X&nickname=X&userid=X
 *    4. index.html getSdkLoginInfo() baca URL params
 *    5. Game: checkSDK()=true, getSdkLoginInfo()=object → SDK login path
 *
 *  Payment Flow:
 *    1. Game: processHandler({type:"activity",action:"buyXxx"}) → main server (8001)
 *    2. Main server return { prePayRet: { errorCode:0, data:{...} } }
 *    3. Game: ts.payToSdk(data) → index.html paySdk(data) → PPGAME.createPaymentOrder(data)
 *    4. sdk.js: handlePayment(data) → POST /api/payment/process
 *    5. sdk-server: log payment → return result
 *    6. Game server PUSH notifyData("payFinish") → client update UI
 *
 *  Analytics Flow:
 *    1. Game memanggil SDK function (fbq, gtag, report2Sdk, dll)
 *    2. sdk.js: sendAnalytics(category, action, data) → POST /api/analytics/event
 *    3. sdk-server: log event ke data/analytics.json
 *
 *  Referensi: main.min.js, index.html, sdk.js
 * =====================================================
 */

var express = require('express');
var cors = require('cors');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

// =============================================
// BAGIAN 1: KONFIGURASI
// =============================================

var PORT = process.env.PORT || 9999;
var DATA_DIR = path.join(__dirname, 'data');
var USERS_FILE = path.join(DATA_DIR, 'users.json');
var PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');
var ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
var SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// SDK channel default — digunakan saat register user baru
var DEFAULT_SDK_CHANNEL = 'en';

// App ID default — dikirim ke login server sebagai subChannel
var DEFAULT_APP_ID = '1';

// Secret key untuk generate sign
// Game membaca ts.loginUserInfo.sign dan menggunakannya
var SIGN_SECRET = 'sdk_sign_secret_2024';

// Crypto rounds untuk password hashing
var HASH_ITERATIONS = 10000;
var HASH_KEY_LENGTH = 64;

// =============================================
// BAGIAN 2: INISIALISASI EXPRESS
// =============================================

var app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-SDK-Channel', 'X-Session-ID', 'X-SDK-AppId', 'X-SDK-Version', 'X-Request-ID'],
    exposedHeaders: ['Content-Type', 'X-SDK-Channel'],
    credentials: false,
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware — log setiap request
app.use(function (req, res, next) {
    var timestamp = new Date().toISOString();
    // Skip analytics endpoint dari log untuk mengurangi noise
    var skipPaths = ['/api/analytics/event', '/api/report/event', '/api/report/batch'];
    if (skipPaths.indexOf(req.path) !== -1) {
        return next();
    }
    console.log('[' + timestamp + '] ' + req.method + ' ' + req.path);
    next();
});

// =============================================
// BAGIAN 3: DATA STORAGE (JSON Files)
// Menggunakan file-based storage tanpa database dependency
// =============================================

/**
 * Pastikan data directory ada
 */
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log('[Storage] Created directory:', DATA_DIR);
    }
}

/**
 * Load JSON file — return parsed object atau default jika tidak ada
 * @param {string} filename - Path ke file
 * @param {*} defaultValue - Default value jika file tidak ada atau error
 * @returns {*}
 */
function loadJSON(filename, defaultValue) {
    try {
        if (fs.existsSync(filename)) {
            var raw = fs.readFileSync(filename, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[Storage] Error loading', filename, ':', e.message);
    }
    return defaultValue;
}

/**
 * Save JSON file — atomic write (write to temp lalu rename)
 * @param {string} filename - Path ke file
 * @param {*} data - Data yang akan disimpan
 * @returns {boolean} true jika berhasil
 */
function saveJSON(filename, data) {
    try {
        ensureDataDir();
        var tempPath = filename + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tempPath, filename);
        return true;
    } catch (e) {
        console.error('[Storage] Error saving', filename, ':', e.message);
        return false;
    }
}

// --- Users ---

/**
 * Load semua data user
 * Format: { users: { "lowercase_username": userObj, ... }, nextId: number }
 */
function loadUsers() {
    return loadJSON(USERS_FILE, { users: {}, nextId: 1 });
}

function saveUsers(data) {
    return saveJSON(USERS_FILE, data);
}

/**
 * Cari user berdasarkan userId
 * @param {string} userId
 * @returns {object|null}
 */
function findUserById(userId) {
    var data = loadUsers();
    var keys = Object.keys(data.users);
    for (var i = 0; i < keys.length; i++) {
        var user = data.users[keys[i]];
        if (user.id === String(userId)) {
            return { key: keys[i], user: user, data: data };
        }
    }
    return null;
}

// --- Payments ---

/**
 * Load semua data payment
 * Format: { payments: [ paymentObj, ... ], nextOrderNum: number }
 */
function loadPayments() {
    return loadJSON(PAYMENTS_FILE, { payments: [], nextOrderNum: 1 });
}

function savePayments(data) {
    return saveJSON(PAYMENTS_FILE, data);
}

// --- Analytics ---

/**
 * Load analytics buffer
 * Format: { events: [ eventObj, ... ], meta: { totalEvents: number, lastFlush: string } }
 */
function loadAnalytics() {
    return loadJSON(ANALYTICS_FILE, { events: [], meta: { totalEvents: 0, lastFlush: '' } });
}

function saveAnalytics(data) {
    return saveJSON(ANALYTICS_FILE, data);
}

// --- Sessions ---

/**
 * Load active sessions
 * Format: { sessions: { "loginToken": { userId, createdAt, expiresAt }, ... } }
 */
function loadSessions() {
    return loadJSON(SESSIONS_FILE, { sessions: {} });
}

function saveSessions(data) {
    return saveJSON(SESSIONS_FILE, data);
}

// =============================================
// BAGIAN 4: CRYPTO UTILITIES
// =============================================

/**
 * Hash password menggunakan PBKDF2
 * Lebih aman dari plain SHA-256 karena punya salt dan iterations
 *
 * @param {string} password - Plain password
 * @param {string} salt - Hex salt
 * @param {function} callback - callback(err, hash)
 */
function hashPassword(password, salt, callback) {
    crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, 'sha512', function (err, derivedKey) {
        if (err) return callback(err, null);
        callback(null, derivedKey.toString('hex'));
    });
}

/**
 * Hash password secara synchronous (untuk internal use)
 * @param {string} password
 * @param {string} salt
 * @returns {string}
 */
function hashPasswordSync(password, salt) {
    return crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, 'sha512').toString('hex');
}

/**
 * Generate random salt (32 bytes hex)
 * @returns {string}
 */
function generateSalt() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate login token — unik per session login
 * Format: timestamp_base36 + '_' + random_hex
 * @returns {string}
 */
function generateLoginToken() {
    var timestamp = Date.now().toString(36);
    var random = crypto.randomBytes(24).toString('hex');
    return timestamp + '_' + random;
}

/**
 * Generate user ID (auto-increment dari data file)
 * @param {object} usersData
 * @returns {string}
 */
function generateUserId(usersData) {
    var id = usersData.nextId || 1;
    usersData.nextId = id + 1;
    return String(id);
}

/**
 * Generate sign (signature) untuk validasi user
 * Digunakan oleh: ts.loginUserInfo.sign di main.min.js line 88571
 * Format: sha256(userId + loginToken + secret)
 *
 * @param {string} userId
 * @param {string} loginToken
 * @returns {string}
 */
function generateSign(userId, loginToken) {
    return crypto.createHash('sha256')
        .update(userId + loginToken + SIGN_SECRET)
        .digest('hex')
        .substring(0, 32);
}

/**
 * Generate security code
 * Digunakan oleh: ts.loginInfo.userInfo.securityCode di main.min.js line 88725
 * @returns {string}
 */
function generateSecurity() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate order ID untuk payment
 * Format: ORD_timestamp_random
 * @returns {string}
 */
function generateOrderId(paymentsData) {
    var num = paymentsData.nextOrderNum || 1;
    paymentsData.nextOrderNum = num + 1;
    var timestamp = Date.now().toString(36);
    var random = crypto.randomBytes(4).toString('hex');
    return 'ORD' + String(num).padStart(6, '0') + '_' + timestamp + '_' + random;
}

/**
 * Sanitasi username — hanya alphanumeric dan underscore
 * @param {string} username
 * @returns {string}
 */
function sanitizeUsername(username) {
    return String(username || '').replace(/[^a-zA-Z0-9_]/g, '').substring(0, 20);
}

// =============================================
// BAGIAN 5: SESSION MANAGEMENT
// =============================================

/**
 * Register session baru
 * @param {string} userId
 * @param {string} loginToken
 */
function createSession(userId, loginToken) {
    var sessionsData = loadSessions();
    var expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 hari
    sessionsData.sessions[loginToken] = {
        userId: userId,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt
    };
    saveSessions(sessionsData);
}

/**
 * Validasi session masih aktif
 * @param {string} userId
 * @param {string} loginToken
 * @returns {boolean}
 */
function isSessionValid(userId, loginToken) {
    var sessionsData = loadSessions();
    var session = sessionsData.sessions[loginToken];
    if (!session) return false;
    if (session.userId !== String(userId)) return false;
    if (Date.now() > session.expiresAt) {
        // Session expired — hapus
        delete sessionsData.sessions[loginToken];
        saveSessions(sessionsData);
        return false;
    }
    return true;
}

/**
 * Hapus session
 * @param {string} loginToken
 */
function destroySession(loginToken) {
    var sessionsData = loadSessions();
    if (sessionsData.sessions[loginToken]) {
        delete sessionsData.sessions[loginToken];
        saveSessions(sessionsData);
    }
}

/**
 * Cleanup expired sessions (dipanggil periodik)
 */
function cleanupExpiredSessions() {
    var sessionsData = loadSessions();
    var keys = Object.keys(sessionsData.sessions);
    var now = Date.now();
    var removed = 0;
    for (var i = 0; i < keys.length; i++) {
        if (now > sessionsData.sessions[keys[i]].expiresAt) {
            delete sessionsData.sessions[keys[i]];
            removed++;
        }
    }
    if (removed > 0) {
        saveSessions(sessionsData);
        console.log('[Sessions] Cleaned up ' + removed + ' expired sessions');
    }
}

// =============================================
// BAGIAN 6: API ENDPOINTS
// =============================================

// -------------------------------------------------
// 6.1 GET /health
// Health check endpoint
// Dipanggil oleh sdk.js saat login UI untuk cek status server
// -------------------------------------------------
app.get('/health', function (req, res) {
    var usersData = loadUsers();
    var paymentsData = loadPayments();
    var analyticsData = loadAnalytics();
    var userCount = Object.keys(usersData.users).length;

    res.json({
        status: 'online',
        port: PORT,
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime()),
        registeredUsers: userCount,
        totalPayments: paymentsData.payments.length,
        totalEvents: analyticsData.meta ? analyticsData.meta.totalEvents : 0,
        timestamp: new Date().toISOString()
    });
});

/**
 * Format uptime detik ke string yang mudah dibaca
 */
function formatUptime(seconds) {
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var secs = Math.floor(seconds % 60);
    var parts = [];
    if (days > 0) parts.push(days + 'd');
    if (hours > 0) parts.push(hours + 'h');
    if (minutes > 0) parts.push(minutes + 'm');
    parts.push(secs + 's');
    return parts.join(' ');
}

// -------------------------------------------------
// 6.2 POST /api/auth/register
// Registrasi user baru
//
// Request: { username: string, password: string }
// Response: { success: true, data: { userId, sign, sdk, loginToken, nickName, security } }
//           { success: false, message: string }
//
// Alur:
//   1. Validasi input (username 3-20 char, password 4-32 char)
//   2. Cek username belum dipakai (case-insensitive)
//   3. Generate: userId, salt, hash password, loginToken, sign, security
//   4. Simpan user ke data/users.json
//   5. Buat session
//   6. Return session data → sdk.js redirect ke game dengan URL params
// -------------------------------------------------
app.post('/api/auth/register', function (req, res) {
    var username = sanitizeUsername(req.body.username);
    var password = req.body.password;

    // Validasi input
    if (!username || username.length < 3) {
        return res.json({
            success: false,
            message: 'Username minimal 3 karakter (huruf, angka, underscore)'
        });
    }
    if (!password || password.length < 4) {
        return res.json({
            success: false,
            message: 'Password minimal 4 karakter'
        });
    }
    if (password.length > 32) {
        return res.json({
            success: false,
            message: 'Password maksimal 32 karakter'
        });
    }

    var usersData = loadUsers();
    var userKey = username.toLowerCase();

    // Cek username sudah ada
    if (usersData.users[userKey]) {
        return res.json({
            success: false,
            message: 'Username "' + username + '" sudah digunakan, pilih username lain'
        });
    }

    // Generate data user baru
    var userId = generateUserId(usersData);
    var salt = generateSalt();
    var hashedPassword = hashPasswordSync(password, salt);
    var loginToken = generateLoginToken();
    var sign = generateSign(userId, loginToken);
    var security = generateSecurity();

    // Simpan user
    usersData.users[userKey] = {
        id: userId,
        username: username,
        passwordHash: hashedPassword,
        salt: salt,
        nickname: username,
        sdk: DEFAULT_SDK_CHANNEL,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        lastToken: loginToken,
        sign: sign,
        security: security
    };

    if (!saveUsers(usersData)) {
        return res.json({
            success: false,
            message: 'Gagal menyimpan data user (storage error)'
        });
    }

    // Buat session
    createSession(userId, loginToken);

    // Log
    console.log('[Auth] User registered: ' + username + ' (ID: ' + userId + ')');

    // Return data yang dibutuhkan sdk.js untuk redirect
    return res.json({
        success: true,
        data: {
            userId: userId,
            sign: sign,
            sdk: DEFAULT_SDK_CHANNEL,
            loginToken: loginToken,
            nickName: username,
            security: security
        }
    });
});

// -------------------------------------------------
// 6.3 POST /api/auth/login
// Login user yang sudah terdaftar
//
// Request: { username: string, password: string }
// Response: { success: true, data: { userId, sign, sdk, loginToken, nickName, security } }
//           { success: false, message: string }
//
// Alur:
//   1. Validasi input
//   2. Cari user berdasarkan username (case-insensitive)
//   3. Verifikasi password (PBKDF2)
//   4. Generate token baru (loginToken, sign, security)
//   5. Update data user (lastLogin, lastToken, sign, security)
//   6. Buat session baru
//   7. Return session data → sdk.js redirect ke game
// -------------------------------------------------
app.post('/api/auth/login', function (req, res) {
    var username = sanitizeUsername(req.body.username);
    var password = req.body.password;

    // Validasi input
    if (!username || username.length < 3) {
        return res.json({
            success: false,
            message: 'Username minimal 3 karakter'
        });
    }
    if (!password) {
        return res.json({
            success: false,
            message: 'Password diperlukan'
        });
    }

    var usersData = loadUsers();
    var userKey = username.toLowerCase();
    var user = usersData.users[userKey];

    // Cek user ada
    if (!user) {
        return res.json({
            success: false,
            message: 'Username "' + username + '" tidak ditemukan'
        });
    }

    // Verifikasi password
    var hashedInput = hashPasswordSync(password, user.salt);
    if (hashedInput !== user.passwordHash) {
        console.log('[Auth] Failed login attempt: ' + username);
        return res.json({
            success: false,
            message: 'Password salah'
        });
    }

    // Generate token baru untuk session ini
    var loginToken = generateLoginToken();
    var sign = generateSign(user.id, loginToken);
    var security = generateSecurity();

    // Update data user
    user.lastLogin = new Date().toISOString();
    user.lastToken = loginToken;
    user.sign = sign;
    user.security = security;

    if (!saveUsers(usersData)) {
        return res.json({
            success: false,
            message: 'Gagal menyimpan data login (storage error)'
        });
    }

    // Buat session baru (token sebelumnya di-invalidasi)
    createSession(user.id, loginToken);

    // Log
    console.log('[Auth] User logged in: ' + username + ' (ID: ' + user.id + ')');

    // Return data
    return res.json({
        success: true,
        data: {
            userId: user.id,
            sign: sign,
            sdk: user.sdk || DEFAULT_SDK_CHANNEL,
            loginToken: loginToken,
            nickName: user.nickname || username,
            security: security
        }
    });
});

// -------------------------------------------------
// 6.4 GET /api/auth/check
// Validasi apakah session user masih valid
//
// Query: ?userId=xxx&loginToken=xxx
// Response: { success: true, valid: boolean }
//
// Dipanggil oleh sdk.js saat init — cek session tersimpan masih valid
// -------------------------------------------------
app.get('/api/auth/check', function (req, res) {
    var userId = req.query.userId;
    var loginToken = req.query.loginToken;

    if (!userId || !loginToken) {
        return res.json({
            success: false,
            message: 'userId dan loginToken diperlukan'
        });
    }

    var valid = isSessionValid(userId, loginToken);

    return res.json({
        success: true,
        valid: valid
    });
});

// -------------------------------------------------
// 6.5 POST /api/auth/logout
// Logout user — hapus session
//
// Request: { userId: string, loginToken: string }
// Response: { success: true }
// -------------------------------------------------
app.post('/api/auth/logout', function (req, res) {
    var loginToken = req.body.loginToken;

    if (loginToken) {
        destroySession(loginToken);
        console.log('[Auth] User logged out (token: ' + loginToken.substring(0, 16) + '...)');
    }

    return res.json({ success: true });
});

// -------------------------------------------------
// 6.6 POST /api/payment/process
// Proses payment dari game
//
// Request: payment object dari prePayRet.data
//   { orderId, price, goodsId, goodsName, roleId, roleName, roleLevel, roleVip, serverName, ... }
//
// Response: { success: true, orderId: string }
//           { success: false, message: string }
//
// Alur lengkap payment (dari main.min.js):
//   1. User klik beli → processHandler({type:"activity",action:"buyXxx"}) → main server (8001)
//   2. Main server return { prePayRet: { errorCode:0, data:{...} } }
//   3. Game: ts.payToSdk(data) → paySdk(data) → PPGAME.createPaymentOrder(data)
//   4. sdk.js: handlePayment(data) → POST /api/payment/process (sini)
//   5. sdk-server: log payment → return result
//   6. Game server PUSH notifyData("payFinish", { _code: 0, _detail: {...} }) → client
//   7. Client: refreshNodePayFinish() → update semua UI panel
//
// CATATAN: Payment processing sebenarnya terjadi di main server (8001).
// sdk-server di sini HANYA menerima log dari sdk.js.
// Approve/reject payment dilakukan oleh game server, bukan sdk-server.
// -------------------------------------------------
app.post('/api/payment/process', function (req, res) {
    var paymentData = req.body;

    if (!paymentData) {
        return res.json({
            success: false,
            message: 'No payment data received'
        });
    }

    // Generate order ID jika tidak ada dari game
    var paymentsData = loadPayments();
    var orderId = paymentData.orderId || generateOrderId(paymentsData);

    // Log payment ke file
    var paymentRecord = {
        orderId: orderId,
        userId: paymentData.roleId || 'unknown',
        roleName: paymentData.roleName || 'unknown',
        roleLevel: paymentData.roleLevel || 'unknown',
        roleVip: paymentData.roleVip || 'unknown',
        serverName: paymentData.serverName || 'unknown',
        amount: paymentData.price || paymentData.totalPrice || 0,
        goodsId: paymentData.goodsId || 'unknown',
        goodsName: paymentData.goodsName || paymentData.productId || 'unknown',
        rawData: paymentData,
        receivedAt: new Date().toISOString(),
        status: 'received'
    };

    paymentsData.payments.push(paymentRecord);

    if (savePayments(paymentsData)) {
        console.log('[Payment] Order received: ' + orderId +
            ' | User: ' + paymentRecord.roleName + ' (' + paymentRecord.userId + ')' +
            ' | Goods: ' + paymentRecord.goodsName +
            ' | Amount: ' + paymentRecord.amount);

        return res.json({
            success: true,
            orderId: orderId,
            message: 'Payment logged successfully'
        });
    } else {
        return res.json({
            success: false,
            message: 'Failed to log payment (storage error)'
        });
    }
});

// -------------------------------------------------
// 6.7 POST /api/analytics/event
// Terima analytics event dari sdk.js
// Ini adalah fire-and-forget endpoint — sdk.js tidak menunggu response
//
// Request: {
//   category: string,    — facebook_pixel, google_analytics, sdk_report, pp_analytics, dll
//   action: string,      — event/action name
//   data: any,           — event payload
//   userId: string|null, — user ID (jika sudah login)
//   sdkChannel: string,  — SDK channel
//   timestamp: string    — ISO timestamp
// }
//
// Response: { success: true } (selalu)
//
// Events yang diterima:
//   Facebook Pixel: CompleteRegistration, CharacterCreated, GameStarted, Purchase, dll
//   Google Analytics: AW-727890639/* conversion events
//   SDK Report: player_enter_server, create_role, enter_server, dll
//   PP Analytics: game_ready, startPlay, connectLoginSocket, enterLoadingPage, dll
//   Game Progress: chapter_finish, level_up, tutorial_finish
//   Payment: add_to_cart, purchase, error, rejected
//   Auth: login_success, register_success, switch_account
//   SDK: init
//   Custom Event: loginSuccess, createRole, enterHomeScreen, levelUp, finishGuide
//   BSH5: 01MainScreen, AddToCart, Purchase, 03StartFighting, dll
//   CP API: create_role
//   SDK 350: create_role, enter_server
//   Navigation: open_url
//   Shop: open_shop_page
//   VIP: change_vip_link
//   Social: fb_give_live
//   Support: contact_sdk
//   User: open_user_center
//   Settings: change_language
//   Error: force_reload
// -------------------------------------------------
app.post('/api/analytics/event', function (req, res) {
    var event = req.body;

    if (!event || !event.category || !event.action) {
        return res.json({ success: true }); // Always return success for fire-and-forget
    }

    // Append ke analytics buffer
    var analyticsData = loadAnalytics();
    if (!analyticsData.events) analyticsData.events = [];
    if (!analyticsData.meta) analyticsData.meta = { totalEvents: 0, lastFlush: '' };

    analyticsData.events.push({
        category: event.category,
        action: event.action,
        data: event.data,
        userId: event.userId || null,
        sdkChannel: event.sdkChannel || 'unknown',
        timestamp: event.timestamp || new Date().toISOString(),
        receivedAt: new Date().toISOString()
    });

    analyticsData.meta.totalEvents = (analyticsData.meta.totalEvents || 0) + 1;
    analyticsData.meta.lastFlush = new Date().toISOString();

    saveAnalytics(analyticsData);

    // Selalu return success — analytics tidak boleh gagal
    return res.json({ success: true });
});

// -------------------------------------------------
// 6.8 GET /api/analytics/dashboard
// Dashboard ringkasan analytics
// Endpoint admin untuk melihat statistik
//
// Query params:
//   ?category=facebook_pixel  — filter by category
//   ?limit=50                 — max events returned
// -------------------------------------------------
app.get('/api/analytics/dashboard', function (req, res) {
    var analyticsData = loadAnalytics();
    var category = req.query.category;
    var limit = parseInt(req.query.limit) || 50;

    var events = analyticsData.events || [];

    // Filter by category jika ada
    if (category) {
        events = events.filter(function (e) {
            return e.category === category;
        });
    }

    // Hitung statistik per category
    var categoryStats = {};
    for (var i = 0; i < events.length; i++) {
        var cat = events[i].category;
        if (!categoryStats[cat]) {
            categoryStats[cat] = { count: 0, actions: {} };
        }
        categoryStats[cat].count++;
        var action = events[i].action;
        if (!categoryStats[cat].actions[action]) {
            categoryStats[cat].actions[action] = 0;
        }
        categoryStats[cat].actions[action]++;
    }

    // Ambil N event terakhir
    var recentEvents = events.slice(-limit);

    res.json({
        success: true,
        meta: analyticsData.meta,
        totalEvents: events.length,
        categoryStats: categoryStats,
        recentEvents: recentEvents
    });
});

// -------------------------------------------------
// 6.9 GET /api/users
// List semua user yang terdaftar (admin/debug)
//
// Query params:
//   ?search=username  — cari username
//   ?limit=100        — max results
// -------------------------------------------------
app.get('/api/users', function (req, res) {
    var usersData = loadUsers();
    var search = (req.query.search || '').toLowerCase();
    var limit = parseInt(req.query.limit) || 100;
    var userList = [];
    var keys = Object.keys(usersData.users);

    for (var i = 0; i < keys.length && userList.length < limit; i++) {
        var user = usersData.users[keys[i]];
        if (search && keys[i].indexOf(search) === -1 && (user.nickname || '').toLowerCase().indexOf(search) === -1) {
            continue;
        }
        userList.push({
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username,
            sdk: user.sdk || DEFAULT_SDK_CHANNEL,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
        });
    }

    res.json({
        success: true,
        count: userList.length,
        total: keys.length,
        users: userList
    });
});

// -------------------------------------------------
// 6.10 GET /api/users/:id
// Detail user spesifik (admin/debug)
// -------------------------------------------------
app.get('/api/users/:id', function (req, res) {
    var found = findUserById(req.params.id);

    if (!found) {
        return res.json({ success: false, message: 'User tidak ditemukan' });
    }

    var user = found.user;
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username,
            sdk: user.sdk || DEFAULT_SDK_CHANNEL,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            lastToken: user.lastToken ? user.lastToken.substring(0, 16) + '...' : null
        }
    });
});

// -------------------------------------------------
// 6.11 GET /api/payments
// List semua payment yang sudah diproses (admin/debug)
//
// Query params:
//   ?userId=xxx    — filter by userId
//   ?limit=100     — max results
//   ?status=xxx    — filter by status
// -------------------------------------------------
app.get('/api/payments', function (req, res) {
    var paymentsData = loadPayments();
    var payments = paymentsData.payments || [];
    var userId = req.query.userId;
    var status = req.query.status;
    var limit = parseInt(req.query.limit) || 100;

    // Filter
    if (userId) {
        payments = payments.filter(function (p) { return p.userId === userId; });
    }
    if (status) {
        payments = payments.filter(function (p) { return p.status === status; });
    }

    var total = payments.length;
    var result = payments.slice(-limit).reverse(); // Terbaru dulu

    // Hapus rawData dari response (terlalu besar)
    result = result.map(function (p) {
        var clean = Object.assign({}, p);
        delete clean.rawData;
        return clean;
    });

    res.json({
        success: true,
        count: result.length,
        total: total,
        payments: result
    });
});

// -------------------------------------------------
// 6.12 GET /api/config
// Konfigurasi SDK server (read-only)
// Berguna untuk sdk.js verifikasi kompatibilitas
// -------------------------------------------------
app.get('/api/config', function (req, res) {
    res.json({
        success: true,
        config: {
            version: '1.0.0',
            sdkType: 'PPGAME',
            defaultChannel: DEFAULT_SDK_CHANNEL,
            defaultAppId: DEFAULT_APP_ID,
            sessionDuration: '7 days',
            hashAlgorithm: 'PBKDF2-SHA512',
            hashIterations: HASH_ITERATIONS,
            endpoints: {
                login: 'POST /api/auth/login',
                register: 'POST /api/auth/register',
                checkSession: 'GET /api/auth/check',
                logout: 'POST /api/auth/logout',
                payment: 'POST /api/payment/process',
                analytics: 'POST /api/analytics/event',
                analyticsDashboard: 'GET /api/analytics/dashboard',
                health: 'GET /health'
            }
        }
    });
});

// -------------------------------------------------
// 6.13 POST /api/auth/guest
// Guest login — login tanpa username/password
//
// Request: { channel: string, appId: string, deviceId: string }
// Response: { success: true, data: { userId, sign, sdk, loginToken, nickName, security } }
//
// Alur:
//   1. Terima deviceId dari sdk.js
//   2. Cek apakah deviceId sudah pernah terdaftar
//   3. Jika belum → buat user baru (username: GUEST_xxx)
//   4. Jika sudah → gunakan user yang ada
//   5. Generate token baru (loginToken, sign, security)
//   6. Return session data
// -------------------------------------------------
app.post('/api/auth/guest', function (req, res) {
    var deviceId = req.body.deviceId;
    var channel = req.body.channel || DEFAULT_SDK_CHANNEL;
    var appId = req.body.appId || DEFAULT_APP_ID;

    if (!deviceId) {
        return res.json({
            success: false,
            message: 'Device ID diperlukan untuk guest login'
        });
    }

    var usersData = loadUsers();
    var guestKey = 'guest_' + deviceId.toLowerCase();
    var user = usersData.users[guestKey];
    var isNewUser = false;

    if (!user) {
        // Buat user baru untuk guest
        isNewUser = true;
        var userId = generateUserId(usersData);
        var guestUsername = 'GUEST_' + userId;
        var salt = generateSalt();
        var hashedPassword = hashPasswordSync(deviceId, salt);

        user = {
            id: userId,
            username: guestUsername,
            passwordHash: hashedPassword,
            salt: salt,
            nickname: guestUsername,
            sdk: channel,
            deviceId: deviceId,
            isGuest: true,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };

        usersData.users[guestKey] = user;
        console.log('[Auth] New guest user created: ' + guestUsername + ' (ID: ' + userId + ')');
    }

    // Generate token baru untuk session ini
    var loginToken = generateLoginToken();
    var sign = generateSign(user.id, loginToken);
    var security = generateSecurity();

    // Update data user
    user.lastLogin = new Date().toISOString();
    user.lastToken = loginToken;
    user.sign = sign;
    user.security = security;
    user.sdk = channel;

    if (!saveUsers(usersData)) {
        return res.json({
            success: false,
            message: 'Gagal menyimpan data guest (storage error)'
        });
    }

    // Buat session
    createSession(user.id, loginToken);

    console.log('[Auth] Guest login: ' + user.username + ' (ID: ' + user.id + ')' +
        (isNewUser ? ' [NEW]' : ' [RETURNING]'));

    return res.json({
        success: true,
        data: {
            userId: user.id,
            sign: sign,
            sdk: channel,
            loginToken: loginToken,
            nickName: user.nickname || user.username,
            security: security,
            isNewUser: isNewUser
        }
    });
});

// -------------------------------------------------
// 6.14 POST /api/payment/create
// Create payment order dari sdk.js
//
// Request: { orderId, userId, sessionId, goodsId, goodsName, goodsNum,
//            price, totalPrice, currency, roleId, roleName, ... }
// Response: { success: true, data: { orderId, status: "pending" } }
//
// Endpoint ini dipanggil oleh sdk.js PPGAME.createPaymentOrder().
// Mencatat order dan mengembalikan konfirmasi ke client.
// -------------------------------------------------
app.post('/api/payment/create', function (req, res) {
    var paymentData = req.body;

    if (!paymentData || !paymentData.goodsId) {
        return res.json({
            success: false,
            message: 'Invalid payment data — goodsId required'
        });
    }

    var paymentsData = loadPayments();
    var orderId = paymentData.orderId || generateOrderId(paymentsData);

    var paymentRecord = {
        orderId: orderId,
        userId: paymentData.userId || paymentData.roleId || 'unknown',
        sessionId: paymentData.sessionId || null,
        roleName: paymentData.roleName || 'unknown',
        roleLevel: paymentData.roleLevel || 'unknown',
        roleVip: paymentData.roleVip || 'unknown',
        serverId: paymentData.serverId || 'unknown',
        serverName: paymentData.serverName || 'unknown',
        amount: paymentData.totalPrice || paymentData.price || 0,
        currency: paymentData.currency || 'USD',
        goodsId: paymentData.goodsId || paymentData.goodId || 'unknown',
        goodsName: paymentData.goodsName || 'unknown',
        goodsNum: paymentData.goodsNum || paymentData.goodNum || 1,
        rawData: paymentData,
        receivedAt: new Date().toISOString(),
        status: 'pending'
    };

    paymentsData.payments.push(paymentRecord);

    if (savePayments(paymentsData)) {
        console.log('[Payment] Order created: ' + orderId +
            ' | User: ' + paymentRecord.roleName + ' (' + paymentRecord.userId + ')' +
            ' | Goods: ' + paymentRecord.goodsName +
            ' | Amount: ' + paymentRecord.amount + ' ' + paymentRecord.currency);

        return res.json({
            success: true,
            data: {
                orderId: orderId,
                status: 'pending',
                message: 'Order created — awaiting confirmation'
            }
        });
    } else {
        return res.json({
            success: false,
            message: 'Failed to create payment order (storage error)'
        });
    }
});

// -------------------------------------------------
// 6.15 POST /api/payment/verify
// Verify dan complete payment setelah user konfirmasi
//
// Request: { orderId, userId, sessionId, confirmed: true }
// Response: { success: true, data: { orderId, status: "completed" } }
//
// Endpoint ini dipanggil oleh sdk.js setelah user klik "Confirm Pay".
// Update status order dari 'pending' menjadi 'completed'.
//
// CATATAN: Game server (8001) yang sebenarnya mengirim push notification
// "payFinish" ke client setelah payment processed. sdk-server hanya mencatat status.
// -------------------------------------------------
app.post('/api/payment/verify', function (req, res) {
    var orderId = req.body.orderId;
    var userId = req.body.userId;
    var confirmed = req.body.confirmed;

    if (!orderId) {
        return res.json({
            success: false,
            message: 'Order ID required'
        });
    }

    if (!confirmed) {
        return res.json({
            success: false,
            message: 'Payment not confirmed by user'
        });
    }

    var paymentsData = loadPayments();
    var payments = paymentsData.payments || [];
    var found = false;

    // Cari order berdasarkan orderId
    for (var i = 0; i < payments.length; i++) {
        if (payments[i].orderId === orderId) {
            payments[i].status = 'completed';
            payments[i].verifiedAt = new Date().toISOString();
            payments[i].verifiedBy = userId || 'unknown';
            found = true;
            console.log('[Payment] Order verified: ' + orderId +
                ' | User: ' + (payments[i].roleName || 'unknown') +
                ' | Goods: ' + (payments[i].goodsName || 'unknown') +
                ' | Amount: ' + payments[i].amount);
            break;
        }
    }

    if (!found) {
        return res.json({
            success: false,
            message: 'Order not found: ' + orderId
        });
    }

    if (!savePayments(paymentsData)) {
        return res.json({
            success: false,
            message: 'Failed to verify payment (storage error)'
        });
    }

    return res.json({
        success: true,
        data: {
            orderId: orderId,
            status: 'completed',
            message: 'Payment verified successfully'
        }
    });
});

// -------------------------------------------------
// 6.16 POST /api/payment/callback
// Payment callback dari external payment gateway
//
// Request: { orderId, status, transactionId, ... }
// Response: { success: true }
//
// Endpoint ini untuk integrasi dengan payment gateway pihak ketiga.
// Saat ini sebagai placeholder — bisa diimplementasi nanti.
// -------------------------------------------------
app.post('/api/payment/callback', function (req, res) {
    var callbackData = req.body;
    var orderId = callbackData.orderId;
    var status = callbackData.status;

    console.log('[Payment] Callback received:', JSON.stringify(callbackData));

    if (!orderId) {
        return res.json({ success: false, message: 'Order ID required' });
    }

    var paymentsData = loadPayments();
    var payments = paymentsData.payments || [];

    for (var i = 0; i < payments.length; i++) {
        if (payments[i].orderId === orderId) {
            payments[i].status = status || payments[i].status;
            payments[i].callbackData = callbackData;
            payments[i].callbackAt = new Date().toISOString();
            break;
        }
    }

    savePayments(paymentsData);
    return res.json({ success: true });
});

// -------------------------------------------------
// 6.17 POST /api/report/event
// Terima single report event dari sdk.js
//
// Request: { eventType, eventData, userId, sessionId, timestamp, ... }
// Response: { success: true }
//
// Endpoint untuk single event reporting.
// Data disimpan ke analytics.json dengan category "sdk_report".
// -------------------------------------------------
app.post('/api/report/event', function (req, res) {
    var event = req.body;

    if (!event || !event.eventType) {
        return res.json({ success: true }); // Silent success
    }

    var analyticsData = loadAnalytics();
    if (!analyticsData.events) analyticsData.events = [];
    if (!analyticsData.meta) analyticsData.meta = { totalEvents: 0, lastFlush: '' };

    analyticsData.events.push({
        category: event.category || 'sdk_report',
        action: event.eventType,
        data: event.eventData || event,
        userId: event.userId || null,
        sessionId: event.sessionId || null,
        sdkChannel: event.sdk || 'unknown',
        timestamp: event.timestamp || new Date().toISOString(),
        receivedAt: new Date().toISOString()
    });

    analyticsData.meta.totalEvents = (analyticsData.meta.totalEvents || 0) + 1;
    analyticsData.meta.lastFlush = new Date().toISOString();

    saveAnalytics(analyticsData);
    return res.json({ success: true });
});

// -------------------------------------------------
// 6.18 POST /api/report/batch
// Terima batch report events dari sdk.js
//
// Request: { reports: [ { id, eventType, eventData, ... }, ... ], timestamp }
// Response: { success: true, count: number }
//
// Endpoint untuk batch event reporting.
// Dipanggil oleh sdk.js flushReportQueue() setiap 30 detik atau saat queue penuh.
// Menerima array of report objects dan menyimpannya ke analytics.json.
// -------------------------------------------------
app.post('/api/report/batch', function (req, res) {
    var batchData = req.body;
    var reports = batchData.reports;

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
        return res.json({ success: true, count: 0 });
    }

    var analyticsData = loadAnalytics();
    if (!analyticsData.events) analyticsData.events = [];
    if (!analyticsData.meta) analyticsData.meta = { totalEvents: 0, lastFlush: '' };

    var count = 0;
    for (var i = 0; i < reports.length; i++) {
        var report = reports[i];
        analyticsData.events.push({
            id: report.id || null,
            category: report.category || 'sdk_report',
            action: report.eventType || 'unknown',
            data: report.eventData || report,
            userId: report.userId || null,
            sessionId: report.sessionId || null,
            sdkChannel: report.sdk || 'unknown',
            timestamp: report.timestamp || new Date().toISOString(),
            receivedAt: new Date().toISOString()
        });
        count++;
    }

    analyticsData.meta.totalEvents = (analyticsData.meta.totalEvents || 0) + count;
    analyticsData.meta.lastFlush = new Date().toISOString();

    saveAnalytics(analyticsData);

    console.log('[Report] Batch received: ' + count + ' events');
    return res.json({ success: true, count: count });
});

// -------------------------------------------------
// 6.19 POST /api/user/language
// Simpan preferensi bahasa user
//
// Request: { userId, sessionId, language, timestamp }
// Response: { success: true }
//
// Endpoint untuk menyimpan preferensi bahasa user.
// Dipanggil oleh sdk.js window.changeLanguage() setelah user ganti bahasa.
// -------------------------------------------------
app.post('/api/user/language', function (req, res) {
    var userId = req.body.userId;
    var language = req.body.language;

    if (!userId || !language) {
        return res.json({
            success: false,
            message: 'userId and language required'
        });
    }

    // Cari user dan update preferensi bahasa
    var found = findUserById(userId);
    if (found) {
        found.user.language = language;
        found.user.lastLanguageChange = new Date().toISOString();
        saveUsers(found.data);
        console.log('[User] Language updated: User ' + userId + ' → ' + language);
    }

    // Simpan ke analytics juga
    var analyticsData = loadAnalytics();
    if (!analyticsData.events) analyticsData.events = [];
    if (!analyticsData.meta) analyticsData.meta = { totalEvents: 0, lastFlush: '' };

    analyticsData.events.push({
        category: 'settings',
        action: 'change_language',
        data: { userId: userId, language: language },
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString()
    });

    analyticsData.meta.totalEvents = (analyticsData.meta.totalEvents || 0) + 1;
    saveAnalytics(analyticsData);

    return res.json({ success: true });
});

// -------------------------------------------------
// 6.20 GET /api/user/info
// Info user berdasarkan userId atau sessionId
//
// Query: ?userId=xxx atau ?sessionId=xxx
// Response: { success: true, data: { userId, username, nickname, ... } }
// -------------------------------------------------
app.get('/api/user/info', function (req, res) {
    var userId = req.query.userId;
    var sessionId = req.query.sessionId;

    if (userId) {
        var found = findUserById(userId);
        if (!found) {
            return res.json({ success: false, message: 'User tidak ditemukan' });
        }
        var user = found.user;
        return res.json({
            success: true,
            data: {
                userId: user.id,
                username: user.username,
                nickname: user.nickname || user.username,
                sdk: user.sdk || DEFAULT_SDK_CHANNEL,
                isGuest: user.isGuest || false,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                language: user.language || null
            }
        });
    }

    if (sessionId) {
        var sessionsData = loadSessions();
        var session = sessionsData.sessions[sessionId];
        if (!session) {
            return res.json({ success: false, message: 'Session tidak ditemukan' });
        }
        var found2 = findUserById(session.userId);
        if (!found2) {
            return res.json({ success: false, message: 'User tidak ditemukan untuk session ini' });
        }
        var user2 = found2.user;
        return res.json({
            success: true,
            data: {
                userId: user2.id,
                username: user2.username,
                nickname: user2.nickname || user2.username,
                sdk: user2.sdk || DEFAULT_SDK_CHANNEL,
                isGuest: user2.isGuest || false,
                createdAt: user2.createdAt,
                lastLogin: user2.lastLogin,
                language: user2.language || null
            }
        });
    }

    return res.json({
        success: false,
        message: 'userId atau sessionId diperlukan'
    });
});

// =============================================
// BAGIAN 7: ERROR HANDLERS
// =============================================

// 404 handler
app.use(function (req, res) {
    res.status(404).json({
        success: false,
        message: 'Endpoint tidak ditemukan: ' + req.method + ' ' + req.url
    });
});

// Global error handler
app.use(function (err, req, res, next) {
    console.error('[Error]', err.message);
    res.status(500).json({
        success: false,
        message: 'Internal server error: ' + (err.message || 'Unknown')
    });
});

// =============================================
// BAGIAN 8: START SERVER
// =============================================

ensureDataDir();

// Cleanup expired sessions setiap 1 jam
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

app.listen(PORT, function () {
    var usersData = loadUsers();
    var userCount = Object.keys(usersData.users).length;

    console.log('');
    console.log('================================================');
    console.log('  SDK Server — Dragon Ball Z (Super Fighter Z)');
    console.log('  Type: PPGAME SDK');
    console.log('================================================');
    console.log('  Port:       ' + PORT);
    console.log('  URL:        http://127.0.0.1:' + PORT);
    console.log('  Channel:    ' + DEFAULT_SDK_CHANNEL);
    console.log('  App ID:     ' + DEFAULT_APP_ID);
    console.log('  Users:      ' + userCount + ' registered');
    console.log('================================================');
    console.log('');
    console.log('Endpoints:');
    console.log('  POST /api/auth/register        — Register user baru');
    console.log('  POST /api/auth/login           — Login user');
    console.log('  POST /api/auth/guest           — Guest login');
    console.log('  GET  /api/auth/check           — Validasi session');
    console.log('  POST /api/auth/logout          — Logout user');
    console.log('  POST /api/payment/process      — Proses payment (legacy)');
    console.log('  POST /api/payment/create       — Create payment order');
    console.log('  POST /api/payment/verify       — Verify payment');
    console.log('  POST /api/payment/callback     — Payment gateway callback');
    console.log('  POST /api/analytics/event      — Terima analytics (fire-and-forget)');
    console.log('  GET  /api/analytics/dashboard  — Dashboard analytics');
    console.log('  POST /api/report/event         — Single report event');
    console.log('  POST /api/report/batch         — Batch report events');
    console.log('  POST /api/user/language        — Save language preference');
    console.log('  GET  /api/user/info            — User info');
    console.log('  GET  /api/users                — List users (admin)');
    console.log('  GET  /api/users/:id            — Detail user (admin)');
    console.log('  GET  /api/payments             — List payments (admin)');
    console.log('  GET  /api/config               — Server config');
    console.log('  GET  /health                   — Health check');
    console.log('');
    console.log('SDK Server is ready!');
    console.log('');
});
