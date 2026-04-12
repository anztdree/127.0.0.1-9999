/**
 * ============================================================================
 *  SDK.js — PPGAME Type SDK Client for Super Warrior Z (Dragon Ball Z)
 * ============================================================================
 *
 *  Engine     : Egret (WebGL)
 *  Resolution : 750 x 1334
 *  SDK Type   : PPGAME
 *
 *  ARCHITECTURE NOTES:
 *  ───────────────────────────────────────────────────────────────────────────
 *  1. This file loads BEFORE index.html's inline scripts and BEFORE main.min.js
 *  2. index.html (line 27) loads this file via <script src="sdk.js">
 *  3. index.html (lines 48-54) sets window.hideList, activityUrl, clientver,
 *     Log_Clean, debug, sdkChannel, gameIcon  — we MUST NOT override these
 *  4. index.html (lines 119-128) sets window.maskLayerClear, loadJsonFunc,
 *     refreshPage — we MUST NOT override these
 *  5. index.html (line 193-194) defines checkSDK() returning true
 *  6. index.html (lines 196-210) defines getSdkLoginInfo() reading URL params
 *  7. index.html (lines 221-259) PPGAME block: if(window.PPGAME) exists,
 *     creates 7 wrapper functions: paySdk, gameReady, report2Sdk,
 *     gameChapterFinish, openShopPage, gameLevelUp, tutorialFinish
 *
 *  IMPORTANT RULES:
 *  ───────────────────────────────────────────────────────────────────────────
 *  - NEVER override functions already defined by index.html
 *  - NEVER override variables already set by index.html
 *  - ONLY provide what index.html and main.min.js need but don't have
 *  - Provide window.PPGAME so index.html's PPGAME block auto-creates wrappers
 *  - main.min.js uses TSBrowser.executeFunction("name", ...args) → window[name](...args)
 *  - main.min.js uses TSBrowser.getVariantValue("name") → window[name]
 *  - main.min.js uses TSBrowser.checkWindowFunction("name") → window[name] && typeof function
 *
 *  TSBrowser INTEGRATION POINTS (from main.min.js analysis):
 *  ───────────────────────────────────────────────────────────────────────────
 *  22 executeFunction calls, 3 checkWindowFunction calls, 10 getVariantValue calls
 *  25+ direct window.xxx references
 *  ~60 total integration points
 *
 *  LOGIN FLOW:
 *  ───────────────────────────────────────────────────────────────────────────
 *  1. sdk.js loads → checks URL for ?sdk=xxx&logintoken=xxx&nickname=xxx&userid=xxx
 *  2. If params missing → show login UI (overlay on top of loading screen)
 *  3. User enters credentials → POST to sdk-server (port 9999) /api/auth/login
 *  4. Server returns { userId, loginToken, nickname, ... }
 *  5. sdk.js redirects to same page with URL params attached
 *  6. Page reloads → index.html getSdkLoginInfo() reads params → game gets login info
 *  7. Game calls checkSDK() → true → calls getSdkLoginInfo() → returns login data
 *
 *  PAYMENT FLOW:
 *  ───────────────────────────────────────────────────────────────────────────
 *  1. Player taps buy → server returns prePayRet.data (goodsId, price, etc.)
 *  2. Game calls ts.payToSdk(data) → TSBrowser.executeFunction("paySdk", data)
 *  3. → window.paySdk(data) [from PPGAME block] → window.PPGAME.createPaymentOrder(data)
 *  4. createPaymentOrder sends data to sdk-server /api/payment/create
 *  5. sdk-server records order, returns payment form/URL
 *  6. User completes payment → sdk-server notifies game server
 *  7. Game server delivers goods → client receives notification
 *
 *  REPORTING FLOW:
 *  ───────────────────────────────────────────────────────────────────────────
 *  report2Sdk (PPGAME block) → window.PPGAME.playerEnterServer / .submitEvent
 *  reportLogToPP → TSBrowser.executeFunction("reportLogToPP", event, data)
 *  All events forwarded to sdk-server for analytics storage
 *
 * ============================================================================
 */

(function () {
    'use strict';

    // ========================================================================
    // SECTION 1: SDK CONFIGURATION
    // ========================================================================

    var SDK_CONFIG = {
        // sdk-server URL (Node.js Express on port 9999)
        SERVER_URL: 'http://127.0.0.1:9999',

        // App identifiers (from main.min.js analysis)
        APP_ID: '288',          // Used in ReportSdkInfoXX (line 52484)
        GAME_ID: '261',         // Used in ReportToCpapiCreaterole (line 52500)

        // SDK channel identifier
        // Values: "en", "kr", "vi", "jr", "sylz", "tc", "tanwan55en"
        // This affects which reporting functions activate (FB, Yahoo, Google only for "en")
        CHANNEL: 'ppgame',

        // Encryption keys
        // initSDKDe key (main.min.js line 55181)
        INIT_SDK_KEY: '68355760639752706329835728782448',
        // TEA encryption key (used by game socket communication)
        TEA_KEY: 'verification',

        // Login server — returning null lets game use serversetting.json default
        LOGIN_SERVER_URL: null,

        // Client server (Weixin only — empty for non-Weixin)
        CLIENT_SERVER_URL: '',

        // Login UI configuration
        LOGIN_UI_TITLE: 'Super Warrior Z',
        LOGIN_UI_SUBTITLE: 'SDK Login',
        LOGIN_UI_BG_COLOR: '#0a0a1a',

        // Payment configuration
        PAYMENT_CURRENCY: 'USD',
        PAYMENT_TIMEOUT_MS: 300000, // 5 minutes

        // Reporting configuration
        REPORT_BATCH_SIZE: 10,
        REPORT_FLUSH_INTERVAL_MS: 30000, // 30 seconds
        REPORT_MAX_QUEUE_SIZE: 100,

        // Session timeout
        SESSION_TIMEOUT_MS: 86400000, // 24 hours

        // API endpoints
        API: {
            AUTH_LOGIN: '/api/auth/login',
            AUTH_GUEST: '/api/auth/guest',
            AUTH_REGISTER: '/api/auth/register',
            AUTH_LOGOUT: '/api/auth/logout',
            PAYMENT_CREATE: '/api/payment/create',
            PAYMENT_VERIFY: '/api/payment/verify',
            PAYMENT_CALLBACK: '/api/payment/callback',
            REPORT_EVENT: '/api/report/event',
            REPORT_BATCH: '/api/report/batch',
            USER_INFO: '/api/user/info',
            USER_LANGUAGE: '/api/user/language'
        }
    };

    // ========================================================================
    // SECTION 2: SDK STATE MANAGEMENT
    // ========================================================================

    /**
     * Central SDK state object.
     * Tracks everything from login status to pending payments to report queues.
     */
    var _state = {
        // Authentication state
        isLoggedIn: false,
        userId: null,
        nickname: null,
        loginToken: null,
        sdk: SDK_CONFIG.CHANNEL,
        security: null,
        sign: null,

        // Session info
        sessionId: null,
        loginTime: null,
        lastActivityTime: null,

        // Server info (set after connecting to game server)
        serverId: null,
        serverName: null,

        // Player info (set after entering game)
        characterId: null,
        characterName: null,
        characterLevel: null,

        // Payment state
        pendingPayments: {},    // orderId → payment data
        paymentCallbacks: {},   // orderId → callback function

        // Report queue (batched reporting)
        reportQueue: [],
        reportFlushTimer: null,

        // Login callback (from main.min.js line 88544: accountLoginCallback(ts.exitGame))
        exitGameFn: null,

        // UI state
        loginUIVisible: false,
        paymentUIVisible: false,

        // Language preference
        currentLanguage: null,

        // Encryption state
        sdkDeKey: null,
        teaCipher: null,

        // Initialization flag
        isInitialized: false,

        // Debug logging
        debugMode: false
    };

    // ========================================================================
    // SECTION 3: UTILITY FUNCTIONS
    // ========================================================================

    /**
     * Generate a unique ID string.
     * Used for session IDs, order IDs, report IDs, etc.
     * @returns {string} Unique identifier
     */
    function generateUniqueId() {
        var timestamp = Date.now().toString(36);
        var randomPart = Math.random().toString(36).substring(2, 10);
        var counter = (generateUniqueId._counter = (generateUniqueId._counter || 0) + 1);
        return timestamp + '-' + randomPart + '-' + counter.toString(36);
    }
    // Initialize counter
    generateUniqueId._counter = 0;

    /**
     * Simple hash function for generating signatures.
     * @param {string} str - String to hash
     * @returns {string} Hex hash string
     */
    function simpleHash(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    /**
     * Send HTTP request to sdk-server.
     * Handles both success and error cases with proper logging.
     *
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
     * @param {string} endpoint - API endpoint (e.g., '/api/auth/login')
     * @param {object} data - Request body data (will be JSON stringified for POST)
     * @param {function} onSuccess - Success callback: function(responseData)
     * @param {function} onError - Error callback: function(errorMsg)
     * @param {object} [headers] - Additional headers
     */
    function sendHttpRequest(method, endpoint, data, onSuccess, onError, headers) {
        var url = SDK_CONFIG.SERVER_URL + endpoint;
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-SDK-Channel', SDK_CONFIG.CHANNEL);
        xhr.timeout = 30000; // 30 second timeout

        // Add session header if logged in
        if (_state.sessionId) {
            xhr.setRequestHeader('X-Session-ID', _state.sessionId);
        }

        // Add custom headers
        if (headers) {
            for (var key in headers) {
                if (headers.hasOwnProperty(key)) {
                    xhr.setRequestHeader(key, headers[key]);
                }
            }
        }

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        var response = JSON.parse(xhr.responseText);
                        if (response.success || response.ret === 'SUCCESS') {
                            if (onSuccess) onSuccess(response.data || response);
                        } else {
                            var errorMsg = response.message || response.msg || 'Server error';
                            if (onError) onError(errorMsg);
                        }
                    } catch (e) {
                        if (onError) onError('Invalid server response: ' + e.message);
                    }
                } else if (xhr.status === 0) {
                    if (onError) onError('Cannot connect to SDK server. Please check your connection.');
                } else {
                    if (onError) onError('Server returned error code: ' + xhr.status);
                }
            }
        };

        xhr.ontimeout = function () {
            if (onError) onError('Request to SDK server timed out.');
        };

        xhr.onerror = function () {
            if (onError) onError('Network error connecting to SDK server.');
        };

        try {
            if (data && (method === 'POST' || method === 'PUT')) {
                xhr.send(JSON.stringify(data));
            } else {
                xhr.send();
            }
        } catch (e) {
            if (onError) onError('Failed to send request: ' + e.message);
        }
    }

    /**
     * Check if current page URL has the required login parameters.
     * index.html's getSdkLoginInfo() checks for: sdk, logintoken, nickname, userid
     *
     * @returns {object|null} Parsed params or null if missing
     */
    function checkUrlLoginParams() {
        var params = getUrlParams();
        var sdk = params.sdk || params.SDK;
        var logintoken = params.logintoken || params.loginToken || params.LOGINTOKEN;
        var nickname = params.nickname || params.nickName || params.NICKNAME;
        var userid = params.userid || params.userId || params.USERID;

        if (sdk && logintoken && nickname && userid) {
            return {
                sdk: sdk,
                logintoken: logintoken,
                nickname: nickname,
                userid: userid,
                sign: params.sign || null,
                security: params.security || null
            };
        }
        return null;
    }

    /**
     * Parse all URL query parameters.
     * @returns {object} Key-value pairs of URL params
     */
    function getUrlParams() {
        var result = {};
        var search = window.location.search;
        if (!search || search.length <= 1) return result;
        var pairs = search.substring(1).split('&');
        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split('=');
            if (pair.length >= 2) {
                result[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
            }
        }
        return result;
    }

    /**
     * Build URL with login parameters.
     * Used after successful login to redirect the page.
     *
     * @param {object} loginData - { sdk, loginToken, nickname, userId }
     * @returns {string} Full URL with params
     */
    function buildLoginUrl(loginData) {
        var base = window.location.origin + window.location.pathname;
        var params = getUrlParams();

        // Preserve existing non-login params
        var keepParams = ['language', 'pluginMiniGame', 'channel'];
        var paramStr = '';
        for (var i = 0; i < keepParams.length; i++) {
            if (params[keepParams[i]]) {
                paramStr += '&' + keepParams[i] + '=' + encodeURIComponent(params[keepParams[i]]);
            }
        }

        return base
            + '?sdk=' + encodeURIComponent(loginData.sdk || SDK_CONFIG.CHANNEL)
            + '&logintoken=' + encodeURIComponent(loginData.loginToken)
            + '&nickname=' + encodeURIComponent(loginData.nickname)
            + '&userid=' + encodeURIComponent(loginData.userId)
            + (loginData.sign ? '&sign=' + encodeURIComponent(loginData.sign) : '')
            + (loginData.security ? '&security=' + encodeURIComponent(loginData.security) : '')
            + paramStr;
    }

    /**
     * SDK logging utility.
     * Respects window.Log_Clean setting from index.html.
     *
     * @param {string} level - Log level: 'log', 'warn', 'error', 'debug', 'info'
     * @param {string} source - Source module name
     * @param {string} message - Log message
     * @param {*} [data] - Optional additional data
     */
    function sdkLog(level, source, message, data) {
        // Respect Log_Clean from index.html (line 51)
        if (window.Log_Clean === true && level !== 'error') return;

        var prefix = '[PPGAME SDK][' + source + ']';
        var timestamp = new Date().toISOString();

        switch (level) {
            case 'error':
                console.error(prefix, timestamp, message, data !== undefined ? data : '');
                break;
            case 'warn':
                console.warn(prefix, timestamp, message, data !== undefined ? data : '');
                break;
            case 'debug':
                if (_state.debugMode || window.debug === true) {
                    console.log(prefix, timestamp, message, data !== undefined ? data : '');
                }
                break;
            case 'info':
                console.info(prefix, timestamp, message, data !== undefined ? data : '');
                break;
            default:
                console.log(prefix, timestamp, message, data !== undefined ? data : '');
        }
    }

    /**
     * Deep clone an object.
     * @param {*} obj - Object to clone
     * @returns {*} Cloned object
     */
    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Array) {
            var arrCopy = [];
            for (var i = 0; i < obj.length; i++) {
                arrCopy[i] = deepClone(obj[i]);
            }
            return arrCopy;
        }
        var objCopy = {};
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                objCopy[key] = deepClone(obj[key]);
            }
        }
        return objCopy;
    }

    /**
     * Format a date to ISO string for reporting.
     * @param {Date} [date] - Date to format (defaults to now)
     * @returns {string} ISO formatted date string
     */
    function formatDate(date) {
        var d = date || new Date();
        return d.getFullYear() + '-'
            + String(d.getMonth() + 1).padStart(2, '0') + '-'
            + String(d.getDate()).padStart(2, '0') + 'T'
            + String(d.getHours()).padStart(2, '0') + ':'
            + String(d.getMinutes()).padStart(2, '0') + ':'
            + String(d.getSeconds()).padStart(2, '0') + '.'
            + String(d.getMilliseconds()).padStart(3, '0');
    }

    /**
     * Validate that required fields exist in an object.
     * @param {object} obj - Object to validate
     * @param {Array<string>} requiredFields - Required field names
     * @returns {boolean} True if all required fields are present
     */
    function validateFields(obj, requiredFields) {
        if (!obj || typeof obj !== 'object') return false;
        for (var i = 0; i < requiredFields.length; i++) {
            if (obj[requiredFields[i]] === undefined || obj[requiredFields[i]] === null) {
                return false;
            }
        }
        return true;
    }

    /**
     * Safely get a nested property from an object.
     * @param {object} obj - Source object
     * @param {string} path - Dot-separated path (e.g., "loginUserInfo.userId")
     * @param {*} [defaultValue] - Default value if path not found
     * @returns {*} Value at path or defaultValue
     */
    function safeGet(obj, path, defaultValue) {
        if (!obj || !path) return defaultValue;
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length; i++) {
            if (current === null || current === undefined) return defaultValue;
            current = current[parts[i]];
        }
        return current !== undefined ? current : defaultValue;
    }

    // ========================================================================
    // SECTION 4: TEA ENCRYPTION IMPLEMENTATION
    // ========================================================================

    /**
     * TEA (Tiny Encryption Algorithm) implementation.
     * Used by the game for socket communication encryption.
     * The game uses key "verification" for TEA encryption.
     *
     * TEA operates on 64-bit blocks with 128-bit key.
     * Uses 32 rounds of Feistel network.
     */
    var TEACipher = {
        // Constants
        DELTA: 0x9E3779B9,
        ROUNDS: 32,

        /**
         * Encrypt data using TEA algorithm.
         * @param {string} data - Data to encrypt
         * @param {string} key - Encryption key
         * @returns {string} Encrypted data as hex string
         */
        encrypt: function (data, key) {
            var bytes = this._stringToBytes(data);
            // Pad to multiple of 8
            while (bytes.length % 8 !== 0) bytes.push(0);

            var keyBytes = this._stringToBytes(key);
            while (keyBytes.length < 16) keyBytes.push(0);

            var result = [];
            for (var i = 0; i < bytes.length; i += 8) {
                var v0 = this._bytesToUint32(bytes, i);
                var v1 = this._bytesToUint32(bytes, i + 4);
                var k0 = this._bytesToUint32(keyBytes, 0);
                var k1 = this._bytesToUint32(keyBytes, 4);
                var k2 = this._bytesToUint32(keyBytes, 8);
                var k3 = this._bytesToUint32(keyBytes, 12);

                var sum = 0;
                for (var r = 0; r < this.ROUNDS; r++) {
                    sum = (sum + this.DELTA) >>> 0;
                    v0 = (v0 + (((v1 << 4) + k0) ^ (v1 + sum) ^ ((v1 >>> 5) + k1))) >>> 0;
                    v1 = (v1 + (((v0 << 4) + k2) ^ (v0 + sum) ^ ((v0 >>> 5) + k3))) >>> 0;
                }

                result.push(
                    (v0 >>> 24) & 0xFF, (v0 >>> 16) & 0xFF, (v0 >>> 8) & 0xFF, v0 & 0xFF,
                    (v1 >>> 24) & 0xFF, (v1 >>> 16) & 0xFF, (v1 >>> 8) & 0xFF, v1 & 0xFF
                );
            }
            return this._bytesToHex(result);
        },

        /**
         * Decrypt data using TEA algorithm.
         * @param {string} hexData - Hex string of encrypted data
         * @param {string} key - Encryption key
         * @returns {string} Decrypted string
         */
        decrypt: function (hexData, key) {
            var bytes = this._hexToBytes(hexData);
            var keyBytes = this._stringToBytes(key);
            while (keyBytes.length < 16) keyBytes.push(0);

            var result = [];
            for (var i = 0; i < bytes.length; i += 8) {
                var v0 = this._bytesToUint32(bytes, i);
                var v1 = this._bytesToUint32(bytes, i + 4);
                var k0 = this._bytesToUint32(keyBytes, 0);
                var k1 = this._bytesToUint32(keyBytes, 4);
                var k2 = this._bytesToUint32(keyBytes, 8);
                var k3 = this._bytesToUint32(keyBytes, 12);

                var sum = (this.DELTA * this.ROUNDS) >>> 0;
                for (var r = 0; r < this.ROUNDS; r++) {
                    v1 = (v1 - (((v0 << 4) + k2) ^ (v0 + sum) ^ ((v0 >>> 5) + k3))) >>> 0;
                    v0 = (v0 - (((v1 << 4) + k0) ^ (v1 + sum) ^ ((v1 >>> 5) + k1))) >>> 0;
                    sum = (sum - this.DELTA) >>> 0;
                }

                result.push(
                    (v0 >>> 24) & 0xFF, (v0 >>> 16) & 0xFF, (v0 >>> 8) & 0xFF, v0 & 0xFF,
                    (v1 >>> 24) & 0xFF, (v1 >>> 16) & 0xFF, (v1 >>> 8) & 0xFF, v1 & 0xFF
                );
            }

            // Remove trailing null bytes
            while (result.length > 0 && result[result.length - 1] === 0) {
                result.pop();
            }
            return this._bytesToString(result);
        },

        // Byte conversion helpers
        _stringToBytes: function (str) {
            var bytes = [];
            for (var i = 0; i < str.length; i++) {
                var code = str.charCodeAt(i);
                if (code < 128) {
                    bytes.push(code);
                } else if (code < 2048) {
                    bytes.push(192 | (code >> 6), 128 | (code & 63));
                } else {
                    bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
                }
            }
            return bytes;
        },

        _bytesToString: function (bytes) {
            var str = '';
            var i = 0;
            while (i < bytes.length) {
                if (bytes[i] < 128) {
                    str += String.fromCharCode(bytes[i]);
                    i++;
                } else if (bytes[i] < 224) {
                    str += String.fromCharCode(((bytes[i] & 31) << 6) | (bytes[i + 1] & 63));
                    i += 2;
                } else {
                    str += String.fromCharCode(((bytes[i] & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63));
                    i += 3;
                }
            }
            return str;
        },

        _bytesToUint32: function (bytes, offset) {
            return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
        },

        _bytesToHex: function (bytes) {
            var hex = '';
            for (var i = 0; i < bytes.length; i++) {
                hex += ('0' + bytes[i].toString(16)).slice(-2);
            }
            return hex;
        },

        _hexToBytes: function (hex) {
            var bytes = [];
            for (var i = 0; i < hex.length; i += 2) {
                bytes.push(parseInt(hex.substr(i, 2), 16));
            }
            return bytes;
        }
    };

    // ========================================================================
    // SECTION 5: REPORTING / EVENT SYSTEM
    // ========================================================================

    /**
     * ReportDataType enum — mirrors main.min.js ReportDataType (line 79543-79545).
     * Used to identify different types of SDK reporting events.
     *
     * Values:
     *   1  = ChangeServer
     *   2  = CreateRole
     *   3  = EnterGame
     *   4  = LevelUp
     *   5  = ExitGame
     *   6  = ChangeName
     *   7  = EndGuide
     *   8  = GetFirstRecharge
     *   9  = GetVipLevelReward
     *   10 = LevelAchieved
     *   11 = LevelAchieved2
     *   12 = LevelAchieved4
     *   13 = LevelAchieved6
     *   14 = LevelAchievedv2
     *   15 = LevelAchievedv6
     *   17 = LevelAchieved20
     *   18 = LevelAchieved25
     *   19 = LevelAchieved30
     *   20 = LevelAchieved35
     *   21 = LevelAchieved40
     *   22 = SecondDaySign
     *   23 = userLevelAchieved3
     *   24 = userLevelAchieved6
     *   25 = userLevelAchieved18
     *   26 = userevelAchieved28
     *   27 = firstViewRechargePanel
     *   28 = blackStoneLoginCount4
     *   29 = blackStoneLoginCount6
     *   30 = blackStoneLessonFinish
     *   31 = EnterGameFalse
     *   32 = UserVipLevelUP
     */
    var ReportDataType = {
        ChangeServer: 1,
        CreateRole: 2,
        EnterGame: 3,
        LevelUp: 4,
        ExitGame: 5,
        ChangeName: 6,
        EndGuide: 7,
        GetFirstRecharge: 8,
        GetVipLevelReward: 9,
        LevelAchieved: 10,
        LevelAchieved2: 11,
        LevelAchieved4: 12,
        LevelAchieved6: 13,
        LevelAchievedv2: 14,
        LevelAchievedv6: 15,
        LevelAchieved20: 17,
        LevelAchieved25: 18,
        LevelAchieved30: 19,
        LevelAchieved35: 20,
        LevelAchieved40: 21,
        SecondDaySign: 22,
        userLevelAchieved3: 23,
        userLevelAchieved6: 24,
        userLevelAchieved18: 25,
        userevelAchieved28: 26,
        firstViewRechargePanel: 27,
        blackStoneLoginCount4: 28,
        blackStoneLoginCount6: 29,
        blackStoneLessonFinish: 30,
        EnterGameFalse: 31,
        UserVipLevelUP: 32
    };

    /**
     * reportLogToPP events — from main.min.js analysis.
     * These are lifecycle events tracked by the PP platform.
     *
     * Events:
     *   "endLoadResource"              — Login loading screen finished
     *   "startPlay"                    — Player starts playing (taps Start)
     *   "disConnectLoginSocket"        — Disconnecting from login socket
     *   "connectLoginSocket"           — Connecting to login socket
     *   "enterServerList"              — Entered server list screen
     *   "enterLoadingPage"             — Entered loading page
     *   "disconnectGame78Socket"       — Disconnecting from game socket
     *   "connectGame78Socket"          — Connecting to game socket (port 78)
     *   "inGame"                       — Player is now in the game
     */
    var PPLogEvents = {
        END_LOAD_RESOURCE: 'endLoadResource',
        START_PLAY: 'startPlay',
        DISCONNECT_LOGIN_SOCKET: 'disConnectLoginSocket',
        CONNECT_LOGIN_SOCKET: 'connectLoginSocket',
        ENTER_SERVER_LIST: 'enterServerList',
        ENTER_LOADING_PAGE: 'enterLoadingPage',
        DISCONNECT_GAME_SOCKET: 'disconnectGame78Socket',
        CONNECT_GAME_SOCKET: 'connectGame78Socket',
        IN_GAME: 'inGame'
    };

    /**
     * Queue a report event for batched sending to sdk-server.
     * Events are stored in _state.reportQueue and flushed periodically
     * or when the queue reaches SDK_CONFIG.REPORT_BATCH_SIZE.
     *
     * @param {string} eventType - Event type identifier
     * @param {object} eventData - Event data payload
     * @param {string} [category] - Event category (default: 'lifecycle')
     */
    function queueReport(eventType, eventData, category) {
        var report = {
            id: generateUniqueId(),
            timestamp: formatDate(),
            category: category || 'lifecycle',
            eventType: eventType,
            eventData: eventData || {},
            userId: _state.userId,
            sessionId: _state.sessionId,
            serverId: _state.serverId,
            serverName: _state.serverName,
            characterId: _state.characterId,
            characterName: _state.characterName,
            characterLevel: _state.characterLevel,
            sdk: SDK_CONFIG.CHANNEL,
            appId: SDK_CONFIG.APP_ID,
            pageUrl: window.location.href,
            userAgent: navigator.userAgent
        };

        _state.reportQueue.push(report);

        sdkLog('debug', 'Report', 'Event queued: ' + eventType, {
            queueSize: _state.reportQueue.length
        });

        // Auto-flush if queue is full
        if (_state.reportQueue.length >= SDK_CONFIG.REPORT_BATCH_SIZE) {
            flushReportQueue();
        }
    }

    /**
     * Flush the report queue — send all queued events to sdk-server.
     * Called automatically when queue is full or periodically.
     */
    function flushReportQueue() {
        if (_state.reportQueue.length === 0) return;

        var reports = _state.reportQueue.slice();
        _state.reportQueue = [];

        sdkLog('info', 'Report', 'Flushing ' + reports.length + ' report(s) to server');

        sendHttpRequest(
            'POST',
            SDK_CONFIG.API.REPORT_BATCH,
            { reports: reports, timestamp: formatDate() },
            function (response) {
                sdkLog('debug', 'Report', 'Reports sent successfully');
            },
            function (error) {
                sdkLog('warn', 'Report', 'Failed to send reports: ' + error);
                // Re-queue failed reports (up to max size)
                for (var i = 0; i < reports.length; i++) {
                    if (_state.reportQueue.length < SDK_CONFIG.REPORT_MAX_QUEUE_SIZE) {
                        _state.reportQueue.push(reports[i]);
                    }
                }
            }
        );
    }

    /**
     * Start the periodic report flush timer.
     * Flushes queued reports every REPORT_FLUSH_INTERVAL_MS.
     */
    function startReportFlushTimer() {
        if (_state.reportFlushTimer) clearInterval(_state.reportFlushTimer);
        _state.reportFlushTimer = setInterval(function () {
            flushReportQueue();
        }, SDK_CONFIG.REPORT_FLUSH_INTERVAL_MS);
    }

    /**
     * Stop the periodic report flush timer.
     */
    function stopReportFlushTimer() {
        if (_state.reportFlushTimer) {
            clearInterval(_state.reportFlushTimer);
            _state.reportFlushTimer = null;
        }
    }

    /**
     * Send a single event report immediately (not queued).
     * Used for critical events that should not be batched.
     *
     * @param {string} eventType - Event type
     * @param {object} eventData - Event data
     */
    function sendImmediateReport(eventType, eventData) {
        queueReport(eventType, eventData, 'immediate');
        flushReportQueue();
    }

    // ========================================================================
    // SECTION 6: PAYMENT SYSTEM
    // ========================================================================

    /**
     * Handle payment order creation.
     * This is called by window.PPGAME.createPaymentOrder(data).
     *
     * Payment data structure (from server prePayRet.data):
     *   {
     *     goodsId: number,
     *     goodsName: string,
     *     goodsNum: number,
     *     price: number,
     *     totalPrice: number (or 'money'),
     *     currency: string,
     *     roleId: string (added if native),
     *     roleName: string (added if native),
     *     roleLevel: number (added if native),
     *     roleVip: number (added if native),
     *     serverName: string (added if native)
     *   }
     *
     * Flow:
     *   1. Receive payment data from game
     *   2. Generate order ID
     *   3. Send to sdk-server /api/payment/create
     *   4. Show payment confirmation UI
     *   5. User confirms payment
     *   6. Notify sdk-server /api/payment/verify
     *   7. sdk-server delivers goods via game server
     *
     * @param {object} paymentData - Payment data from game server
     */
    function handleCreatePaymentOrder(paymentData) {
        sdkLog('info', 'Payment', 'Creating payment order', paymentData);

        if (!paymentData || !paymentData.goodsId) {
            sdkLog('error', 'Payment', 'Invalid payment data — missing goodsId');
            return;
        }

        var orderId = 'ORD-' + generateUniqueId();
        var orderData = {
            orderId: orderId,
            userId: _state.userId,
            sessionId: _state.sessionId,
            goodsId: paymentData.goodsId || paymentData.goodId,
            goodsName: paymentData.goodsName || ('Item ' + paymentData.goodsId),
            goodsNum: paymentData.goodsNum || paymentData.goodNum || 1,
            price: paymentData.price,
            totalPrice: paymentData.totalPrice || paymentData.money || paymentData.price,
            currency: paymentData.currency || SDK_CONFIG.PAYMENT_CURRENCY,
            roleId: paymentData.roleId || _state.characterId,
            roleName: paymentData.roleName || _state.characterName,
            roleLevel: paymentData.roleLevel || _state.characterLevel,
            roleVip: paymentData.roleVip,
            serverId: _state.serverId,
            serverName: paymentData.serverName || _state.serverName,
            channel: SDK_CONFIG.CHANNEL,
            appId: SDK_CONFIG.APP_ID,
            timestamp: formatDate()
        };

        // Store pending payment
        _state.pendingPayments[orderId] = orderData;

        // Send to sdk-server
        sendHttpRequest(
            'POST',
            SDK_CONFIG.API.PAYMENT_CREATE,
            orderData,
            function (response) {
                sdkLog('info', 'Payment', 'Order created on server: ' + orderId);

                // Show payment confirmation UI
                showPaymentConfirmationUI(orderId, orderData, response);
            },
            function (error) {
                sdkLog('error', 'Payment', 'Failed to create order: ' + error);
                hidePaymentUI();
            }
        );
    }

    /**
     * Show payment confirmation UI.
     * Displays a modal overlay with order details and confirm/cancel buttons.
     *
     * @param {string} orderId - Order ID
     * @param {object} orderData - Order data
     * @param {object} serverResponse - Server response (may include payment URL)
     */
    function showPaymentConfirmationUI(orderId, orderData, serverResponse) {
        // Remove any existing payment UI
        var existingUI = document.getElementById('ppgame-payment-overlay');
        if (existingUI) existingUI.parentNode.removeChild(existingUI);

        var overlay = document.createElement('div');
        overlay.id = 'ppgame-payment-overlay';
        overlay.setAttribute('style', [
            'position: fixed',
            'top: 0; left: 0; right: 0; bottom: 0',
            'background: rgba(0, 0, 0, 0.8)',
            'z-index: 9999',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'font-family: Arial, sans-serif'
        ].join(';'));

        var dialog = document.createElement('div');
        dialog.setAttribute('style', [
            'background: linear-gradient(135deg, #1a1a3e 0%, #0d0d2b 100%)',
            'border: 2px solid #4a4a8a',
            'border-radius: 16px',
            'padding: 24px',
            'max-width: 400px',
            'width: 90%',
            'color: #ffffff',
            'box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6)'
        ].join(';'));

        // Title
        var title = document.createElement('div');
        title.textContent = 'Confirm Purchase';
        title.setAttribute('style', 'font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 16px; color: #ffd700;');
        dialog.appendChild(title);

        // Order details
        var details = document.createElement('div');
        details.setAttribute('style', 'background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; margin-bottom: 16px;');
        details.innerHTML =
            '<div style="margin-bottom: 8px;"><span style="color: #aaa;">Item:</span> <span style="color: #fff;">' + (orderData.goodsName || 'Unknown') + '</span></div>' +
            '<div style="margin-bottom: 8px;"><span style="color: #aaa;">Quantity:</span> <span style="color: #fff;">' + orderData.goodsNum + '</span></div>' +
            '<div style="margin-bottom: 8px;"><span style="color: #aaa;">Price:</span> <span style="color: #7dffb3;">$' + (orderData.totalPrice / 100).toFixed(2) + '</span></div>' +
            '<div style="margin-bottom: 8px;"><span style="color: #aaa;">Order ID:</span> <span style="color: #888; font-size: 11px;">' + orderId + '</span></div>';
        dialog.appendChild(details);

        // Buttons container
        var buttons = document.createElement('div');
        buttons.setAttribute('style', 'display: flex; gap: 12px;');

        // Cancel button
        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.setAttribute('style', [
            'flex: 1; padding: 12px; border: 1px solid #666; border-radius: 8px;',
            'background: transparent; color: #ccc; font-size: 16px; cursor: pointer'
        ].join(';'));
        cancelBtn.onclick = function () {
            sdkLog('info', 'Payment', 'Payment cancelled by user: ' + orderId);
            hidePaymentUI();
        };
        buttons.appendChild(cancelBtn);

        // Confirm button
        var confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Confirm Pay';
        confirmBtn.setAttribute('style', [
            'flex: 1; padding: 12px; border: none; border-radius: 8px;',
            'background: linear-gradient(135deg, #ffd700, #ff8c00); color: #000;',
            'font-size: 16px; font-weight: bold; cursor: pointer'
        ].join(';'));
        confirmBtn.onclick = function () {
            sdkLog('info', 'Payment', 'Payment confirmed by user: ' + orderId);
            confirmPayment(orderId, orderData);
        };
        buttons.appendChild(confirmBtn);

        dialog.appendChild(buttons);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        _state.paymentUIVisible = true;
    }

    /**
     * Confirm and complete a payment.
     * Notifies sdk-server that payment is complete.
     * Server then delivers goods to the game server.
     *
     * @param {string} orderId - Order ID
     * @param {object} orderData - Order data
     */
    function confirmPayment(orderId, orderData) {
        var confirmData = {
            orderId: orderId,
            userId: _state.userId,
            sessionId: _state.sessionId,
            confirmed: true,
            timestamp: formatDate()
        };

        sendHttpRequest(
            'POST',
            SDK_CONFIG.API.PAYMENT_VERIFY,
            confirmData,
            function (response) {
                sdkLog('info', 'Payment', 'Payment verified and delivered: ' + orderId);

                // Update UI to show success
                updatePaymentUIStatus('success', 'Payment Successful! Items will be delivered shortly.');

                // Hide after 2 seconds
                setTimeout(function () {
                    hidePaymentUI();
                }, 2000);
            },
            function (error) {
                sdkLog('error', 'Payment', 'Payment verification failed: ' + error);
                updatePaymentUIStatus('error', 'Payment failed: ' + error);
            }
        );
    }

    /**
     * Update the payment UI status message.
     * @param {string} status - 'success' or 'error'
     * @param {string} message - Status message
     */
    function updatePaymentUIStatus(status, message) {
        var overlay = document.getElementById('ppgame-payment-overlay');
        if (!overlay) return;

        var dialog = overlay.querySelector('div > div');
        if (!dialog) return;

        var statusDiv = document.createElement('div');
        statusDiv.setAttribute('style', 'text-align: center; margin-top: 12px; font-size: 14px; color: '
            + (status === 'success' ? '#7dffb3' : '#ff6b6b') + ';');
        statusDiv.textContent = message;

        // Remove buttons
        var buttons = dialog.querySelector('div:last-child');
        if (buttons && buttons.style.display === 'flex') {
            buttons.style.display = 'none';
        }

        dialog.appendChild(statusDiv);
    }

    /**
     * Hide the payment UI overlay.
     */
    function hidePaymentUI() {
        var overlay = document.getElementById('ppgame-payment-overlay');
        if (overlay) {
            overlay.parentNode.removeChild(overlay);
        }
        _state.paymentUIVisible = false;
    }

    // ========================================================================
    // SECTION 7: LOGIN UI SYSTEM
    // ========================================================================

    /**
     * Show the SDK login UI.
     * This is a full-screen overlay that appears on top of the loading screen.
     * Provides username/password login and guest login options.
     *
     * The UI is styled to match the game's dark theme (750x1334 resolution).
     */
    function showLoginUI() {
        if (_state.loginUIVisible) return;

        sdkLog('info', 'LoginUI', 'Showing login UI');

        // Create overlay container
        var overlay = document.createElement('div');
        overlay.id = 'ppgame-login-overlay';
        overlay.setAttribute('style', [
            'position: fixed',
            'top: 0; left: 0; right: 0; bottom: 0',
            'background: ' + SDK_CONFIG.LOGIN_UI_BG_COLOR,
            'z-index: 10000',
            'display: flex',
            'flex-direction: column',
            'align-items: center',
            'justify-content: center',
            'font-family: Arial, Helvetica, sans-serif',
            'overflow: hidden'
        ].join(';'));

        // Animated background gradient
        var bgGradient = document.createElement('div');
        bgGradient.setAttribute('style', [
            'position: absolute',
            'top: 0; left: 0; right: 0; bottom: 0',
            'background: radial-gradient(ellipse at center, #1a1a4e 0%, #0a0a1a 70%)',
            'z-index: -1'
        ].join(';'));
        overlay.appendChild(bgGradient);

        // Decorative circle
        var decorCircle = document.createElement('div');
        decorCircle.setAttribute('style', [
            'position: absolute',
            'top: -100px; right: -100px',
            'width: 400px; height: 400px',
            'border-radius: 50%',
            'background: radial-gradient(circle, rgba(255, 215, 0, 0.08) 0%, transparent 70%)',
            'pointer-events: none'
        ].join(';'));
        overlay.appendChild(decorCircle);

        // Logo / Title area
        var logoArea = document.createElement('div');
        logoArea.setAttribute('style', 'text-align: center; margin-bottom: 40px;');

        var logoTitle = document.createElement('div');
        logoTitle.textContent = SDK_CONFIG.LOGIN_UI_TITLE;
        logoTitle.setAttribute('style', [
            'font-size: 36px',
            'font-weight: bold',
            'color: #ffd700',
            'text-shadow: 0 2px 10px rgba(255, 215, 0, 0.3)',
            'margin-bottom: 8px',
            'letter-spacing: 2px'
        ].join(';'));
        logoArea.appendChild(logoTitle);

        var logoSubtitle = document.createElement('div');
        logoSubtitle.textContent = SDK_CONFIG.LOGIN_UI_SUBTITLE;
        logoSubtitle.setAttribute('style', 'font-size: 14px; color: #8888aa; letter-spacing: 4px; text-transform: uppercase;');
        logoArea.appendChild(logoSubtitle);

        overlay.appendChild(logoArea);

        // Login form container
        var formContainer = document.createElement('div');
        formContainer.setAttribute('style', [
            'width: 320px',
            'max-width: 85%',
            'background: rgba(255, 255, 255, 0.04)',
            'border: 1px solid rgba(255, 255, 255, 0.1)',
            'border-radius: 16px',
            'padding: 32px 24px',
            'backdrop-filter: blur(10px)'
        ].join(';'));

        // Username input
        var usernameGroup = document.createElement('div');
        usernameGroup.setAttribute('style', 'margin-bottom: 16px;');

        var usernameLabel = document.createElement('label');
        usernameLabel.textContent = 'Username';
        usernameLabel.setAttribute('style', 'display: block; font-size: 12px; color: #8888aa; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;');
        usernameGroup.appendChild(usernameLabel);

        var usernameInput = document.createElement('input');
        usernameInput.type = 'text';
        usernameInput.id = 'ppgame-username';
        usernameInput.placeholder = 'Enter your username';
        usernameInput.setAttribute('style', [
            'width: 100%; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.15);',
            'border-radius: 8px; background: rgba(0,0,0,0.3); color: #ffffff; font-size: 16px;',
            'outline: none; box-sizing: border-box; transition: border-color 0.3s;'
        ].join(';'));
        usernameInput.onfocus = function () { this.style.borderColor = '#ffd700'; };
        usernameInput.onblur = function () { this.style.borderColor = 'rgba(255,255,255,0.15)'; };
        usernameGroup.appendChild(usernameInput);

        formContainer.appendChild(usernameGroup);

        // Password input
        var passwordGroup = document.createElement('div');
        passwordGroup.setAttribute('style', 'margin-bottom: 24px;');

        var passwordLabel = document.createElement('label');
        passwordLabel.textContent = 'Password';
        passwordLabel.setAttribute('style', 'display: block; font-size: 12px; color: #8888aa; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px;');
        passwordGroup.appendChild(passwordLabel);

        var passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'ppgame-password';
        passwordInput.placeholder = 'Enter your password';
        passwordInput.setAttribute('style', [
            'width: 100%; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.15);',
            'border-radius: 8px; background: rgba(0,0,0,0.3); color: #ffffff; font-size: 16px;',
            'outline: none; box-sizing: border-box; transition: border-color 0.3s;'
        ].join(';'));
        passwordInput.onfocus = function () { this.style.borderColor = '#ffd700'; };
        passwordInput.onblur = function () { this.style.borderColor = 'rgba(255,255,255,0.15)'; };
        passwordGroup.appendChild(passwordInput);

        formContainer.appendChild(passwordGroup);

        // Error message area
        var errorMsg = document.createElement('div');
        errorMsg.id = 'ppgame-login-error';
        errorMsg.setAttribute('style', 'color: #ff6b6b; font-size: 13px; text-align: center; margin-bottom: 12px; min-height: 20px;');
        formContainer.appendChild(errorMsg);

        // Login button
        var loginBtn = document.createElement('button');
        loginBtn.textContent = 'LOGIN';
        loginBtn.id = 'ppgame-login-btn';
        loginBtn.setAttribute('style', [
            'width: 100%; padding: 14px; border: none; border-radius: 8px;',
            'background: linear-gradient(135deg, #ffd700, #ff8c00);',
            'color: #000; font-size: 18px; font-weight: bold; letter-spacing: 2px;',
            'cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;'
        ].join(';'));
        loginBtn.onmouseenter = function () {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 6px 20px rgba(255, 215, 0, 0.3)';
        };
        loginBtn.onmouseleave = function () {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        };
        loginBtn.onclick = function () { handleLoginClick(); };
        formContainer.appendChild(loginBtn);

        // Register link
        var registerLink = document.createElement('div');
        registerLink.setAttribute('style', 'text-align: center; margin-top: 12px;');

        var registerBtn = document.createElement('span');
        registerBtn.textContent = "Don't have an account? Register";
        registerBtn.setAttribute('style', 'color: #8888cc; font-size: 13px; cursor: pointer; text-decoration: underline;');
        registerBtn.onclick = function () { handleRegisterClick(); };
        registerLink.appendChild(registerBtn);

        formContainer.appendChild(registerLink);

        // Divider
        var divider = document.createElement('div');
        divider.setAttribute('style', [
            'display: flex; align-items: center; margin: 24px 0;',
            'color: #555; font-size: 12px;'
        ].join(';'));
        divider.innerHTML = '<div style="flex:1; height:1px; background: rgba(255,255,255,0.1);"></div>'
            + '<div style="padding: 0 12px;">OR</div>'
            + '<div style="flex:1; height:1px; background: rgba(255,255,255,0.1);"></div>';
        formContainer.appendChild(divider);

        // Guest login button
        var guestBtn = document.createElement('button');
        guestBtn.textContent = 'GUEST LOGIN';
        guestBtn.id = 'ppgame-guest-btn';
        guestBtn.setAttribute('style', [
            'width: 100%; padding: 12px; border: 1px solid rgba(255,255,255,0.2);',
            'border-radius: 8px; background: transparent; color: #aaa;',
            'font-size: 14px; letter-spacing: 2px; cursor: pointer; transition: all 0.3s;'
        ].join(';'));
        guestBtn.onmouseenter = function () {
            this.style.borderColor = '#8888cc';
            this.style.color = '#ccc';
        };
        guestBtn.onmouseleave = function () {
            this.style.borderColor = 'rgba(255,255,255,0.2)';
            this.style.color = '#aaa';
        };
        guestBtn.onclick = function () { handleGuestLoginClick(); };
        formContainer.appendChild(guestBtn);

        overlay.appendChild(formContainer);

        // Version info
        var versionInfo = document.createElement('div');
        versionInfo.setAttribute('style', 'position: absolute; bottom: 20px; color: #444; font-size: 11px; text-align: center;');
        versionInfo.textContent = 'PPGAME SDK v1.0.0 | Channel: ' + SDK_CONFIG.CHANNEL.toUpperCase();
        overlay.appendChild(versionInfo);

        // Add to body
        document.body.appendChild(overlay);
        _state.loginUIVisible = true;

        // Enter key submits login
        passwordInput.addEventListener('keyup', function (e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                handleLoginClick();
            }
        });
        usernameInput.addEventListener('keyup', function (e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                passwordInput.focus();
            }
        });
    }

    /**
     * Hide the login UI overlay.
     */
    function hideLoginUI() {
        var overlay = document.getElementById('ppgame-login-overlay');
        if (overlay) {
            overlay.parentNode.removeChild(overlay);
        }
        _state.loginUIVisible = false;
    }

    /**
     * Update the login UI error message.
     * @param {string} message - Error message to display (empty to clear)
     */
    function setLoginError(message) {
        var errorEl = document.getElementById('ppgame-login-error');
        if (errorEl) {
            errorEl.textContent = message || '';
        }
    }

    /**
     * Disable login UI buttons (during request).
     * @param {boolean} disabled - True to disable, false to enable
     */
    function setLoginButtonsDisabled(disabled) {
        var loginBtn = document.getElementById('ppgame-login-btn');
        var guestBtn = document.getElementById('ppgame-guest-btn');
        if (loginBtn) {
            loginBtn.disabled = disabled;
            loginBtn.style.opacity = disabled ? '0.5' : '1';
            loginBtn.style.pointerEvents = disabled ? 'none' : 'auto';
            loginBtn.textContent = disabled ? 'LOGGING IN...' : 'LOGIN';
        }
        if (guestBtn) {
            guestBtn.disabled = disabled;
            guestBtn.style.opacity = disabled ? '0.5' : '1';
            guestBtn.style.pointerEvents = disabled ? 'none' : 'auto';
            guestBtn.textContent = disabled ? 'CONNECTING...' : 'GUEST LOGIN';
        }
    }

    /**
     * Handle login button click.
     * Validates input, sends login request to sdk-server, redirects on success.
     */
    function handleLoginClick() {
        var usernameInput = document.getElementById('ppgame-username');
        var passwordInput = document.getElementById('ppgame-password');

        var username = usernameInput ? usernameInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value.trim() : '';

        // Validate input
        if (!username) {
            setLoginError('Please enter your username');
            usernameInput && usernameInput.focus();
            return;
        }
        if (!password) {
            setLoginError('Please enter your password');
            passwordInput && passwordInput.focus();
            return;
        }
        if (username.length < 3) {
            setLoginError('Username must be at least 3 characters');
            return;
        }
        if (password.length < 3) {
            setLoginError('Password must be at least 3 characters');
            return;
        }

        setLoginError('');
        setLoginButtonsDisabled(true);

        // Send login request to sdk-server
        var loginData = {
            username: username,
            password: password,
            channel: SDK_CONFIG.CHANNEL,
            appId: SDK_CONFIG.APP_ID,
            timestamp: formatDate()
        };

        sdkLog('info', 'Auth', 'Sending login request for user: ' + username);

        sendHttpRequest(
            'POST',
            SDK_CONFIG.API.AUTH_LOGIN,
            loginData,
            function (response) {
                sdkLog('info', 'Auth', 'Login successful for user: ' + username);
                handleLoginSuccess(response);
            },
            function (error) {
                sdkLog('error', 'Auth', 'Login failed: ' + error);
                setLoginError(error);
                setLoginButtonsDisabled(false);
            }
        );
    }

    /**
     * Handle register button click.
     * Switches login form to registration mode.
     */
    function handleRegisterClick() {
        var usernameInput = document.getElementById('ppgame-username');
        var passwordInput = document.getElementById('ppgame-password');
        var loginBtn = document.getElementById('ppgame-login-btn');
        var registerLink = document.querySelector('#ppgame-login-overlay span[style*="text-decoration"]');

        var username = usernameInput ? usernameInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value.trim() : '';

        if (!username || !password) {
            setLoginError('Please enter username and password to register');
            return;
        }
        if (username.length < 3) {
            setLoginError('Username must be at least 3 characters');
            return;
        }
        if (password.length < 3) {
            setLoginError('Password must be at least 3 characters');
            return;
        }

        setLoginError('');
        setLoginButtonsDisabled(true);

        var registerData = {
            username: username,
            password: password,
            channel: SDK_CONFIG.CHANNEL,
            appId: SDK_CONFIG.APP_ID,
            timestamp: formatDate()
        };

        sdkLog('info', 'Auth', 'Sending register request for user: ' + username);

        sendHttpRequest(
            'POST',
            SDK_CONFIG.API.AUTH_REGISTER,
            registerData,
            function (response) {
                sdkLog('info', 'Auth', 'Registration successful, auto-login for: ' + username);
                handleLoginSuccess(response);
            },
            function (error) {
                sdkLog('error', 'Auth', 'Registration failed: ' + error);
                setLoginError(error);
                setLoginButtonsDisabled(false);
            }
        );
    }

    /**
     * Handle guest login button click.
     * Sends guest login request to sdk-server, redirects on success.
     */
    function handleGuestLoginClick() {
        setLoginError('');
        setLoginButtonsDisabled(true);

        var guestData = {
            channel: SDK_CONFIG.CHANNEL,
            appId: SDK_CONFIG.APP_ID,
            deviceId: generateGuestDeviceId(),
            timestamp: formatDate()
        };

        sdkLog('info', 'Auth', 'Sending guest login request');

        sendHttpRequest(
            'POST',
            SDK_CONFIG.API.AUTH_GUEST,
            guestData,
            function (response) {
                sdkLog('info', 'Auth', 'Guest login successful');
                handleLoginSuccess(response);
            },
            function (error) {
                sdkLog('error', 'Auth', 'Guest login failed: ' + error);
                setLoginError(error);
                setLoginButtonsDisabled(false);
            }
        );
    }

    /**
     * Generate a persistent guest device ID.
     * Stored in localStorage so guest accounts persist across sessions.
     * @returns {string} Device ID
     */
    function generateGuestDeviceId() {
        var storageKey = 'ppgame_guest_device_id';
        try {
            var stored = localStorage.getItem(storageKey);
            if (stored) return stored;
        } catch (e) { /* localStorage not available */ }

        var deviceId = 'GUEST-' + generateUniqueId() + '-' + simpleHash(navigator.userAgent + navigator.language);

        try {
            localStorage.setItem(storageKey, deviceId);
        } catch (e) { /* localStorage not available */ }

        return deviceId;
    }

    /**
     * Handle successful login/register/guest-login.
     * Updates state and redirects page with login parameters.
     *
     * @param {object} response - Server response with userId, loginToken, nickname, etc.
     */
    function handleLoginSuccess(response) {
        // Update state
        _state.isLoggedIn = true;
        _state.userId = response.userId || response.userid;
        _state.nickname = response.nickname || response.nickName || response.username || 'Player';
        _state.loginToken = response.loginToken || response.logintoken;
        _state.sdk = response.sdk || SDK_CONFIG.CHANNEL;
        _state.sessionId = response.sessionId || generateUniqueId();
        _state.loginTime = Date.now();
        _state.lastActivityTime = Date.now();
        _state.sign = response.sign || simpleHash(_state.userId + _state.loginToken);
        _state.security = response.security || simpleHash(_state.loginToken + SDK_CONFIG.APP_ID);

        sdkLog('info', 'Auth', 'Login success — userId: ' + _state.userId + ', nickname: ' + _state.nickname);

        // Build redirect URL with login parameters
        var redirectUrl = buildLoginUrl({
            sdk: _state.sdk,
            loginToken: _state.loginToken,
            nickname: _state.nickname,
            userId: _state.userId,
            sign: _state.sign,
            security: _state.security
        });

        sdkLog('debug', 'Auth', 'Redirecting to: ' + redirectUrl);

        // Store session in localStorage for persistence
        try {
            localStorage.setItem('ppgame_session', JSON.stringify({
                userId: _state.userId,
                nickname: _state.nickname,
                loginToken: _state.loginToken,
                sdk: _state.sdk,
                sessionId: _state.sessionId,
                loginTime: _state.loginTime,
                sign: _state.sign,
                security: _state.security
            }));
        } catch (e) { /* localStorage not available */ }

        // Redirect to the game with login parameters
        window.location.href = redirectUrl;
    }

    /**
     * Handle logout.
     * Clears session, sends logout to server, reloads page.
     */
    function handleLogout() {
        sdkLog('info', 'Auth', 'Logging out user: ' + _state.userId);

        // Send logout to server
        if (_state.userId && _state.sessionId) {
            sendHttpRequest(
                'POST',
                SDK_CONFIG.API.AUTH_LOGOUT,
                {
                    userId: _state.userId,
                    sessionId: _state.sessionId,
                    timestamp: formatDate()
                },
                function () {
                    sdkLog('info', 'Auth', 'Logout successful');
                },
                function (error) {
                    sdkLog('warn', 'Auth', 'Logout failed: ' + error);
                }
            );
        }

        // Clear state
        _state.isLoggedIn = false;
        _state.userId = null;
        _state.nickname = null;
        _state.loginToken = null;
        _state.sessionId = null;
        _state.sign = null;
        _state.security = null;

        // Clear localStorage
        try {
            localStorage.removeItem('ppgame_session');
        } catch (e) { /* localStorage not available */ }

        // Stop reporting
        stopReportFlushTimer();
        flushReportQueue();

        // Reload page (will show login UI since no URL params)
        window.location.href = window.location.origin + window.location.pathname;
    }

    // ========================================================================
    // SECTION 8: PPGAME OBJECT (window.PPGAME)
    // ========================================================================

    /**
     * window.PPGAME — The core PPGAME SDK object.
     *
     * This object is the KEY integration point. When index.html's script block
     * (lines 221-259) detects that window.PPGAME exists, it automatically creates
     * 7 wrapper functions that bridge main.min.js to our SDK:
     *
     *   var paySdk = function(a)          → window.PPGAME.createPaymentOrder(a)
     *   var gameReady = function()        → window.PPGAME.gameReady()
     *   var report2Sdk = function(a)      → window.PPGAME.playerEnterServer(a) or .submitEvent(a)
     *   var gameChapterFinish = function(a) → window.PPGAME.gameChapterFinish(a)
     *   var openShopPage = function()     → window.PPGAME.openShopPage()
     *   var gameLevelUp = function(a)     → window.PPGAME.gameLevelUp(a)
     *   var tutorialFinish = function()   → window.PPGAME.submitEvent("game_tutorial_finish")
     */

    var PPGAME = {
        /**
         * createPaymentOrder(data)
         * Called when: Player initiates a purchase in the game shop.
         * Source: index.html PPGAME block line 222-224
         *         window.paySdk(data) → window.PPGAME.createPaymentOrder(data)
         *
         * @param {object} data - Payment data from game server (prePayRet.data)
         *   Expected fields: goodsId, goodsName, goodsNum, price, totalPrice, currency
         *   Optional fields: roleId, roleName, roleLevel, roleVip, serverName
         */
        createPaymentOrder: function (data) {
            sdkLog('info', 'PPGAME', 'createPaymentOrder called', data);

            // Update player info from payment data if available
            if (data.roleId) _state.characterId = data.roleId;
            if (data.roleName) _state.characterName = data.roleName;
            if (data.roleLevel) _state.characterLevel = data.roleLevel;
            if (data.serverName) _state.serverName = data.serverName;

            // Forward to payment handler
            handleCreatePaymentOrder(data);

            // Report AddToCart event (main.min.js already does this via ReportBsH5FaceBookSdkInfo)
            queueReport('payment_add_to_cart', {
                goodsId: data.goodsId || data.goodId,
                goodsName: data.goodsName,
                price: data.price,
                totalPrice: data.totalPrice || data.money,
                currency: data.currency || SDK_CONFIG.PAYMENT_CURRENCY
            }, 'payment');
        },

        /**
         * gameReady()
         * Called when: Game loading is complete and login screen is ready.
         * Source: index.html PPGAME block line 225-227
         *         window.gameReady() → window.PPGAME.gameReady()
         * Triggered by: main.min.js line 88572-88573 (gameReady2Report)
         *
         * This signals that the game has finished loading and the player
         * can interact with the login screen.
         */
        gameReady: function () {
            sdkLog('info', 'PPGAME', 'gameReady called — game loading complete');

            // Send game ready event to sdk-server
            sendImmediateReport('game_ready', {
                userId: _state.userId,
                sessionId: _state.sessionId,
                timestamp: formatDate()
            });

            // Send FB Pixel event (if sdkChannel is "en", main.min.js handles this)
            // Send Yahoo Dotq event (if sdkChannel is "en", main.min.js handles this)
            // Send Google Analytics event (if sdkChannel is "en", main.min.js handles this)
        },

        /**
         * playerEnterServer(data)
         * Called when: Player enters a game server (dataType 3).
         * Source: index.html PPGAME block lines 229-235
         *         report2Sdk(data) → if(dataType==3) → window.PPGAME.playerEnterServer(data)
         *
         * @param {object} data - Server entry data
         *   Expected: characterName, characterId, serverId, serverName
         */
        playerEnterServer: function (data) {
            sdkLog('info', 'PPGAME', 'playerEnterServer called', data);

            // Update state
            if (data.characterId) _state.characterId = data.characterId;
            if (data.characterName) _state.characterName = data.characterName;
            if (data.serverId) _state.serverId = data.serverId;
            if (data.serverName) _state.serverName = data.serverName;

            // Send to sdk-server
            sendImmediateReport('player_enter_server', {
                characterName: data.characterName,
                characterId: data.characterId,
                serverId: data.serverId,
                serverName: data.serverName,
                userId: _state.userId,
                timestamp: formatDate()
            });
        },

        /**
         * submitEvent(eventName, data)
         * Called when: Various game events need to be reported.
         * Source: index.html PPGAME block lines 237-243
         *         report2Sdk(data) → if(dataType==2) → window.PPGAME.submitEvent("game_create_role", data)
         * Source: index.html PPGAME block line 256-258
         *         tutorialFinish() → window.PPGAME.submitEvent("game_tutorial_finish")
         *
         * @param {string} eventName - Event name (e.g., "game_create_role", "game_tutorial_finish")
         * @param {object} [data] - Event data (optional)
         */
        submitEvent: function (eventName, data) {
            sdkLog('info', 'PPGAME', 'submitEvent called: ' + eventName, data);

            // Update state from event data
            if (data) {
                if (data.characterId) _state.characterId = data.characterId;
                if (data.characterName) _state.characterName = data.characterName;
                if (data.serverId) _state.serverId = data.serverId;
                if (data.serverName) _state.serverName = data.serverName;
            }

            // Send to sdk-server
            queueReport(eventName, {
                eventData: data || {},
                userId: _state.userId,
                sessionId: _state.sessionId,
                serverId: _state.serverId,
                serverName: _state.serverName,
                characterId: _state.characterId,
                characterName: _state.characterName,
                timestamp: formatDate()
            }, 'event');
        },

        /**
         * gameChapterFinish(chapterId)
         * Called when: Player completes a chapter/stage.
         * Source: index.html PPGAME block lines 247-249
         *         window.gameChapterFinish(a) → window.PPGAME.gameChapterFinish(a)
         * Triggered by: main.min.js line 77561-77563 (chapterIdToSdk)
         *
         * @param {number|string} chapterId - Chapter/stage ID
         */
        gameChapterFinish: function (chapterId) {
            sdkLog('info', 'PPGAME', 'gameChapterFinish called: ' + chapterId);

            queueReport('game_chapter_finish', {
                chapterId: chapterId,
                userId: _state.userId,
                characterId: _state.characterId,
                characterName: _state.characterName,
                serverId: _state.serverId,
                serverName: _state.serverName,
                characterLevel: _state.characterLevel,
                timestamp: formatDate()
            }, 'progress');
        },

        /**
         * openShopPage()
         * Called when: Player wants to open the in-game shop.
         * Source: index.html PPGAME block lines 250-252
         *         window.openShopPage() → window.PPGAME.openShopPage()
         * Triggered by: main.min.js line 77566-77567 (openShop2Sdk)
         */
        openShopPage: function () {
            sdkLog('info', 'PPGAME', 'openShopPage called');

            queueReport('open_shop_page', {
                userId: _state.userId,
                timestamp: formatDate()
            }, 'ui');
        },

        /**
         * gameLevelUp(level)
         * Called when: Player levels up.
         * Source: index.html PPGAME block lines 253-255
         *         window.gameLevelUp(a) → window.PPGAME.gameLevelUp(a)
         * Triggered by: main.min.js line 77568-77570 (levelUp2Sdk)
         *
         * @param {number} level - New player level
         */
        gameLevelUp: function (level) {
            sdkLog('info', 'PPGAME', 'gameLevelUp called: ' + level);

            // Update state
            _state.characterLevel = level;

            queueReport('game_level_up', {
                level: level,
                userId: _state.userId,
                characterId: _state.characterId,
                characterName: _state.characterName,
                serverId: _state.serverId,
                serverName: _state.serverName,
                timestamp: formatDate()
            }, 'progress');
        }
    };

    // ========================================================================
    // SECTION 9: WINDOW FUNCTIONS (via TSBrowser.executeFunction)
    // ========================================================================

    /**
     * The following window functions are called by main.min.js via:
     *   TSBrowser.executeFunction("functionName", ...args)
     *
     * TSBrowser.executeFunction implementation (line 51501-51504):
     *   1. Calls checkWindowFunction(name) → checks window[name] exists && typeof function
     *   2. If true → calls window[name].apply(window, args)
     *   3. If false → returns undefined (silently fails)
     *
     * Functions already defined by index.html (DO NOT override):
     *   - getQueryStringByName (line 39-45)
     *   - getSdkLoginInfo (line 196-210)
     *   - checkSDK (line 193-194) — always returns true
     *   - getParams (line 212-219)
     *   - paySdk (PPGAME block line 222-224) → window.PPGAME.createPaymentOrder
     *   - gameReady (PPGAME block line 225-227) → window.PPGAME.gameReady
     *   - report2Sdk (PPGAME block line 228-245) → window.PPGAME methods
     *   - gameChapterFinish (PPGAME block line 247-249)
     *   - openShopPage (PPGAME block line 250-252)
     *   - gameLevelUp (PPGAME block line 253-255)
     *   - tutorialFinish (PPGAME block line 256-258)
     *   - refreshPage (line 126-128) → window.document.location.reload()
     *   - maskLayerClear (line 119-121)
     *   - loadJsonFunc (line 122-125)
     *
     * Functions we need to provide (NOT defined by index.html):
     */

    /**
     * window.reload()
     * Called by: TSBrowser.executeFunction("reload") at line 76900, 76932
     * Trigger: When server returns error code "38" (session invalid)
     * Purpose: Full page reload to re-initialize the game
     */
    window.reload = function () {
        sdkLog('warn', 'Window', 'reload() called — page reloading');
        window.location.reload();
    };

    /**
     * window.checkFromNative()
     * Called by: TSBrowser.executeFunction("checkFromNative") at line 77139
     * Also used: TSBrowser.isNative() at line 51511-51512
     *           → TSBrowser.executeFunction("checkFromNative") === true
     *
     * MUST return false (not undefined!) so the game knows we're in web mode.
     * If this returns true, payment flow adds roleId, roleName, roleLevel,
     * roleVip, serverName to payment data — which the web server already provides.
     *
     * @returns {boolean} Always false for web SDK
     */
    window.checkFromNative = function () {
        return false;
    };

    /**
     * window.getAppId()
     * Called by: TSBrowser.executeFunction("getAppId") at lines 77235, 77301, 77333, 77375
     * Also at: line 88589 (startBtnTap): var t = window.getAppId ? window.getAppId() : ""
     *
     * Returns the application identifier string.
     * Used in:
     *   - saveLanguage request (line 77235)
     *   - clientLoginUser subChannel (line 77301)
     *   - reportToLoginEnterInfo subChannel (line 77375)
     *   - SaveHistory subChannel (line 88589)
     *
     * @returns {string} Application ID
     */
    window.getAppId = function () {
        return SDK_CONFIG.APP_ID;
    };

    /**
     * window.getLoginServer()
     * Called by: TSBrowser.executeFunction("getLoginServer") at line 77425
     * Used in: connectToLogin() (line 77423-77432)
     *
     * Returns the login server URL. If null/undefined, the game falls back to:
     *   - For Weixin: TSBrowser.getVariantValue("clientserver") + "/"
     *   - Default: loads "resource/properties/serversetting.json" → uses loginserver value
     *
     * We return null to use the default behavior (reads from serversetting.json).
     *
     * @returns {string|null} Login server URL or null for default
     */
    window.getLoginServer = function () {
        return SDK_CONFIG.LOGIN_SERVER_URL; // null = use default
    };

    /**
     * window.changeLanguage(lang)
     * Called by: TSBrowser.executeFunction("changeLanguage", language) at line 77249
     * Also: window.changeLanguage(lang) at line 77249 (fallback when server save fails)
     *
     * Triggered when player changes language in settings.
     * The game first tries to save to server, then calls this to apply locally.
     * If server save succeeds → TSBrowser.executeFunction("changeLanguage", lang)
     * If server save fails → window.changeLanguage(lang) (fallback)
     *
     * @param {string} lang - Language code (e.g., "en", "kr", "vi", "jr", "zh")
     */
    window.changeLanguage = function (lang) {
        sdkLog('info', 'Window', 'changeLanguage called: ' + lang);

        _state.currentLanguage = lang;

        // Store language preference
        try {
            localStorage.setItem('ppgame_language', lang);
        } catch (e) { /* localStorage not available */ }

        // Notify sdk-server
        sendHttpRequest(
            'POST',
            SDK_CONFIG.API.USER_LANGUAGE,
            {
                userId: _state.userId,
                sessionId: _state.sessionId,
                language: lang,
                timestamp: formatDate()
            },
            function () {
                sdkLog('debug', 'Window', 'Language saved to server: ' + lang);
            },
            function (error) {
                sdkLog('warn', 'Window', 'Failed to save language: ' + error);
            }
        );
    };

    /**
     * window.openURL(url)
     * Called by: TSBrowser.checkWindowFunction("openURL") + TSBrowser.executeFunction("openURL", url)
     *           at line 77582
     * Also: window.openURL at line 165703 (direct call in LikeReward)
     *
     * Opens a URL in the browser. If not provided, the game falls back to
     * ts.openH5Url(url) which opens in an iframe overlay.
     *
     * We provide this to open in a new browser tab instead of iframe.
     *
     * @param {string} url - URL to open
     */
    window.openURL = function (url) {
        sdkLog('info', 'Window', 'openURL called: ' + url);

        if (url) {
            try {
                window.open(url, '_blank', 'noopener,noreferrer');
            } catch (e) {
                // Fallback: use location.href
                sdkLog('warn', 'Window', 'window.open failed, using location.href');
                window.location.href = url;
            }
        }
    };

    /**
     * window.sendCustomEvent(eventName, data)
     * Called by: TSBrowser.checkWindowFunction("sendCustomEvent") +
     *           TSBrowser.executeFunction("sendCustomEvent", eventName, data)
     *           at line 77584
     *
     * Used to send custom game events. The game checks if this function exists
     * before calling it (via checkWindowFunction).
     *
     * Events include: loginSuccess, createRole (from EventNameDefine)
     *
     * @param {string} eventName - Event name
     * @param {object} data - Event data (userInfo object)
     */
    window.sendCustomEvent = function (eventName, data) {
        sdkLog('info', 'Window', 'sendCustomEvent called: ' + eventName, data);

        queueReport('custom_event', {
            eventName: eventName,
            eventData: data,
            userId: _state.userId,
            sessionId: _state.sessionId,
            timestamp: formatDate()
        }, 'custom');
    };

    /**
     * window.accountLoginCallback(exitGameFn)
     * Called by: TSBrowser.executeFunction("accountLoginCallback", ts.exitGame)
     *           at line 88544
     *
     * Triggered during login screen initialization (initAll).
     * The parameter is ts.exitGame — a function that disconnects all sockets,
     * clears singletons, and returns to the login scene.
     *
     * We store this function reference so the SDK can use it for switch account
     * functionality — calling exitGameFn() resets the game state.
     *
     * @param {function} exitGameFn - Game's exit function (ts.exitGame)
     */
    window.accountLoginCallback = function (exitGameFn) {
        sdkLog('info', 'Window', 'accountLoginCallback called — storing exitGame function');

        if (typeof exitGameFn === 'function') {
            _state.exitGameFn = exitGameFn;
        }
    };

    /**
     * window.reportToCpapiCreaterole(data)
     * Called by: TSBrowser.executeFunction("reportToCpapiCreaterole", data)
     *           at line 77145
     * Triggered by: ToolCommon.ReportToCpapiCreaterole() at line 52498-52506
     *
     * Data format: { gameId: 261, userId, areaId, roleName, sign }
     * This reports character creation to the CP (Content Provider) API.
     *
     * @param {object} data - CP API create role data
     */
    window.reportToCpapiCreaterole = function (data) {
        sdkLog('info', 'Window', 'reportToCpapiCreaterole called', data);

        queueReport('cp_api_create_role', {
            gameId: data.gameId,
            userId: data.userId,
            areaId: data.areaId,
            roleName: data.roleName,
            sign: data.sign,
            timestamp: formatDate()
        }, 'cp_api');
    };

    /**
     * window.fbq(action, eventName)
     * Called by: TSBrowser.executeFunction("fbq", e.actionName, e.eventName)
     *           at line 77150
     * Triggered by: ToolCommon.ReportFaceBookSdkInfo() at line 52520-52525
     * Condition: Only when sdkChannel == "en" (line 77149)
     *
     * This is the Facebook Pixel function. Normally, this would be provided
     * by the Facebook Pixel script loaded in the page. Since we don't have
     * the actual Facebook Pixel, we provide a no-op that logs the call.
     *
     * @param {string} action - Action name (usually "track")
     * @param {string} eventName - Event name (e.g., "GameStarted", "CharacterCreated")
     */
    window.fbq = function (action, eventName) {
        sdkLog('debug', 'Window', 'fbq called: ' + action + ' / ' + eventName);

        // Report to sdk-server as analytics
        queueReport('facebook_pixel', {
            action: action,
            eventName: eventName,
            timestamp: formatDate()
        }, 'analytics');
    };

    /**
     * window.gtag(type, event, data)
     * Called by: TSBrowser.executeFunction("gtag", "event", "conversion", { send_to: "AW-xxx" })
     *           at line 77168
     * Triggered by: ToolCommon.ReportGoogleSdkInfo() at line 77535-77536
     * Condition: Only when sdkChannel == "en" (line 77167)
     *
     * This is the Google Analytics gtag function. Normally provided by the
     * Google Analytics script. We provide a no-op that logs the call.
     *
     * @param {string} type - Event type (usually "event")
     * @param {string} eventName - Event name (usually "conversion")
     * @param {object} data - Event data ({ send_to: "AW-727890639/xxx" })
     */
    window.gtag = function (type, eventName, data) {
        sdkLog('debug', 'Window', 'gtag called: ' + type + ' / ' + eventName, data);

        // Report to sdk-server as analytics
        queueReport('google_analytics', {
            type: type,
            eventName: eventName,
            data: data,
            timestamp: formatDate()
        }, 'analytics');
    };

    /**
     * window.report2Sdk350CreateRole(jsonString)
     * Called by: TSBrowser.executeFunction("report2Sdk350CreateRole", JSON.stringify(data))
     *           at line 77172
     * Triggered by: ToolCommon.ReportSdkInfo350("create_role") at line 52537-52545
     *
     * Reports character creation to platform 350. Data is JSON stringified.
     * Data format: { event: "h5create_role", _sid, _sname, role_id, role_name }
     *
     * @param {string} jsonString - JSON string of role creation data
     */
    window.report2Sdk350CreateRole = function (jsonString) {
        sdkLog('info', 'Window', 'report2Sdk350CreateRole called');

        var data;
        try {
            data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        } catch (e) {
            sdkLog('error', 'Window', 'Failed to parse 350 create role data: ' + e.message);
            return;
        }

        queueReport('platform_350_create_role', {
            event: data.event,
            serverId: data._sid,
            serverName: data._sname,
            roleId: data.role_id,
            roleName: data.role_name,
            timestamp: formatDate()
        }, 'platform_350');
    };

    /**
     * window.report2Sdk350LoginUser(jsonString)
     * Called by: TSBrowser.executeFunction("report2Sdk350LoginUser", JSON.stringify(data))
     *           at line 77174
     * Triggered by: ToolCommon.ReportSdkInfo350("enter_server") at line 52537-52545
     *
     * Reports login to platform 350. Data is JSON stringified.
     * Data format: { event: "h5enter_server", _sid, _sname, role_id, role_name,
     *               role_level, vip }
     *
     * @param {string} jsonString - JSON string of login user data
     */
    window.report2Sdk350LoginUser = function (jsonString) {
        sdkLog('info', 'Window', 'report2Sdk350LoginUser called');

        var data;
        try {
            data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        } catch (e) {
            sdkLog('error', 'Window', 'Failed to parse 350 login user data: ' + e.message);
            return;
        }

        queueReport('platform_350_login_user', {
            event: data.event,
            serverId: data._sid,
            serverName: data._sname,
            roleId: data.role_id,
            roleName: data.role_name,
            roleLevel: data.role_level,
            vip: data.vip,
            timestamp: formatDate()
        }, 'platform_350');
    };

    /**
     * window.reportLogToPP(event, data)
     * Called by: TSBrowser.executeFunction("reportLogToPP", event, data)
     *           at line 77571-77572
     * Triggered by: ts.reportLogToPP() at multiple points in main.min.js
     *
     * Events: "endLoadResource", "startPlay", "disConnectLoginSocket",
     *         "connectLoginSocket", "enterServerList", "enterLoadingPage",
     *         "disconnectGame78Socket", "connectGame78Socket", "inGame"
     *
     * These are game lifecycle events tracked by the PP platform.
     *
     * @param {string} event - PP event name
     * @param {*} data - Event data (usually null)
     */
    window.reportLogToPP = function (event, data) {
        sdkLog('info', 'Window', 'reportLogToPP called: ' + event);

        // Track specific lifecycle state
        switch (event) {
            case PPLogEvents.END_LOAD_RESOURCE:
                // Login loading screen finished (called twice: lines 88552, 88552)
                sdkLog('info', 'Lifecycle', 'Login loading complete');
                break;
            case PPLogEvents.START_PLAY:
                // Player tapped Start button (line 88588)
                sdkLog('info', 'Lifecycle', 'Player starting game');
                break;
            case PPLogEvents.DISCONNECT_LOGIN_SOCKET:
                // Disconnecting from login socket (line 88601)
                sdkLog('debug', 'Lifecycle', 'Disconnecting login socket');
                break;
            case PPLogEvents.CONNECT_LOGIN_SOCKET:
                // Connecting to login socket (line 88607)
                sdkLog('debug', 'Lifecycle', 'Connecting login socket');
                break;
            case PPLogEvents.ENTER_SERVER_LIST:
                // Entered server list screen (line 88689)
                sdkLog('info', 'Lifecycle', 'Entered server list');
                break;
            case PPLogEvents.ENTER_LOADING_PAGE:
                // Entered loading page
                sdkLog('debug', 'Lifecycle', 'Entered loading page');
                break;
            case PPLogEvents.DISCONNECT_GAME_SOCKET:
                // Disconnecting from game socket (line 77434)
                sdkLog('debug', 'Lifecycle', 'Disconnecting game socket');
                break;
            case PPLogEvents.CONNECT_GAME_SOCKET:
                // Connecting to game socket
                sdkLog('debug', 'Lifecycle', 'Connecting game socket');
                break;
            case PPLogEvents.IN_GAME:
                // Player is now in the game
                sdkLog('info', 'Lifecycle', 'Player is in game');
                break;
            default:
                sdkLog('debug', 'Lifecycle', 'Unknown PP event: ' + event);
        }

        queueReport('pp_lifecycle', {
            event: event,
            data: data,
            userId: _state.userId,
            sessionId: _state.sessionId,
            serverId: _state.serverId,
            serverName: _state.serverName,
            timestamp: formatDate()
        }, 'lifecycle');
    };

    /**
     * window.initSDKDe(key)
     * Called by: main.min.js line 55181
     *           window.initSDKDe && window.initSDKDe("68355760639752706329835728782448")
     * Triggered by: startAnimation() (line 55181) — called during Main.createGameScene()
     *
     * This initializes the SDK decryption/encryption module with the given key.
     * The key is used by the game for data encryption/decryption.
     *
     * @param {string} key - Encryption/decryption key
     */
    window.initSDKDe = function (key) {
        sdkLog('info', 'Window', 'initSDKDe called with key: ' + (key ? key.substring(0, 8) + '...' : 'null'));

        _state.sdkDeKey = key;

        // Initialize TEA cipher with the game's encryption key
        _state.teaCipher = TEACipher;

        sdkLog('debug', 'Window', 'TEA cipher initialized successfully');
    };

    // ========================================================================
    // SECTION 10: ADDITIONAL WINDOW FUNCTIONS (called directly via window.xxx)
    // ========================================================================

    /**
     * The following functions are called directly by main.min.js via:
     *   window.functionName(args)
     *
     * These are NOT called through TSBrowser — the game references them directly.
     */

    /**
     * window.contactSdk()
     * Called by: window.contactSdk && window.contactSdk() at line 88756, 133303
     * Visibility: Checked by getSDKContactBtnShow() at line 77128-77129
     *   - Returns true if window.contactSdk exists
     *   - Also checks window.showContact and window.sdkNativeChannel
     *
     * Opens customer service / support page.
     */
    window.contactSdk = function () {
        sdkLog('info', 'Window', 'contactSdk called — opening customer service');

        // Open support URL or show contact info
        var supportUrl = SDK_CONFIG.SERVER_URL + '/support';
        try {
            window.open(supportUrl, '_blank');
        } catch (e) {
            sdkLog('warn', 'Window', 'Failed to open customer service URL');
            alert('Customer Support: support@ppgame-sdk.local');
        }
    };

    /**
     * window.userCenterSdk()
     * Called by: window.userCenterSdk && window.userCenterSdk() at line 88758, 133312
     * Visibility: Checked by getSDKuserCenterBtnShow() at line 77132-77133
     *   - Returns true only if window.userCenterSdk AND window.sdkNativeChannel == "tanwan55en"
     *
     * Opens user center / account management page.
     */
    window.userCenterSdk = function () {
        sdkLog('info', 'Window', 'userCenterSdk called — opening user center');

        var userCenterUrl = SDK_CONFIG.SERVER_URL + '/user-center?userId=' + (_state.userId || '');
        try {
            window.open(userCenterUrl, '_blank');
        } catch (e) {
            sdkLog('warn', 'Window', 'Failed to open user center URL');
            alert('User Center: Account management is available at ' + userCenterUrl);
        }
    };

    /**
     * window.switchAccountSdk()
     * Called by: window.switchAccountSdk() at line 133294
     * Visibility: Checked by getSDKSwitchAccount() at line 77134-77135
     *   - Returns true only if window.switchAccountSdk AND window.sdkNativeChannel == "tanwan55en"
     *
     * Switches to a different account. For tanwan55en channel.
     * If exitGameFn is available, calls it to reset game state.
     */
    window.switchAccountSdk = function () {
        sdkLog('info', 'Window', 'switchAccountSdk called — switching account');

        // If we have the exit game function, use it
        if (_state.exitGameFn && typeof _state.exitGameFn === 'function') {
            _state.exitGameFn().then(function () {
                handleLogout();
            });
        } else {
            handleLogout();
        }
    };

    /**
     * window.switchUser()
     * Called by: window.switchUser at line 133294, 133296
     * Visibility: Checked by getSDKLoginSwitchAccount() at line 77136-77137
     *   - Returns true only if window.switchUser AND window.sdkNativeChannel == "kr" or "vi"
     *
     * Switches to a different user. For kr/vi channels.
     * Calls ts.outRequest() first to notify server, then redirects.
     */
    window.switchUser = function () {
        sdkLog('info', 'Window', 'switchUser called — switching user');

        // If we have the exit game function, use it
        if (_state.exitGameFn && typeof _state.exitGameFn === 'function') {
            _state.exitGameFn().then(function () {
                handleLogout();
            });
        } else {
            handleLogout();
        }
    };

    /**
     * window.fbGiveLiveSdk()
     * Called by: window.fbGiveLiveSdk && window.fbGiveLiveSdk() at line 165703
     * Condition: Only for tanwan55en channel
     *
     * Facebook Live SDK integration. For tanwan55en channel only.
     * Opens a Facebook Live-related URL.
     */
    window.fbGiveLiveSdk = function () {
        sdkLog('info', 'Window', 'fbGiveLiveSdk called');

        // No-op for non-tanwan channels
        // For tanwan55en, this would open the FB Live page
    };

    /**
     * window.reportToBSH5Createrole(data)
     * Called by: window.reportToBSH5Createrole && window.reportToBSH5Createrole(e)
     *           at line 77147
     * Triggered by: ToolCommon.ReportToBSH5Createrole() at line 52507-52519
     *
     * Data format: { uid, serverName, userRoleName, userRoleId, userRoleLevel,
     *               vipLevel, partyName, userRoleBalance, serverId }
     *
     * Reports character creation to BSH5 platform.
     *
     * @param {object} data - BSH5 create role data
     */
    window.reportToBSH5Createrole = function (data) {
        sdkLog('info', 'Window', 'reportToBSH5Createrole called', data);

        queueReport('bsh5_create_role', {
            uid: data.uid,
            serverName: data.serverName,
            userRoleName: data.userRoleName,
            userRoleId: data.userRoleId,
            userRoleLevel: data.userRoleLevel,
            vipLevel: data.vipLevel,
            partyName: data.partyName,
            userRoleBalance: data.userRoleBalance,
            serverId: data.serverId,
            timestamp: formatDate()
        }, 'bsh5');
    };

    /**
     * window.reportToFbq(data)
     * Called by: window.reportToFbq && window.reportToFbq(e) at line 77152
     * Triggered by: ToolCommon.ReportBsH5FaceBookSdkInfo() at line 52526-52532
     *
     * Data format: { actionName, eventName, param }
     *
     * Facebook Pixel H5 reporting. Called from the BSH5 flow.
     *
     * @param {object} data - FB Pixel data
     */
    window.reportToFbq = function (data) {
        sdkLog('debug', 'Window', 'reportToFbq called', data);

        queueReport('fb_pixel_h5', {
            actionName: data.actionName,
            eventName: data.eventName,
            param: data.param,
            timestamp: formatDate()
        }, 'analytics');
    };

    // ========================================================================
    // SECTION 11: WINDOW VARIABLES
    // ========================================================================

    /**
     * The following window variables are read by main.min.js via:
     *   TSBrowser.getVariantValue("name") → window[name]
     *
     * Variables already set by index.html (DO NOT override):
     *   - window.hideList (line 48)
     *   - window.activityUrl (line 49)
     *   - window.clientver (line 50)
     *   - window.Log_Clean (line 51)
     *   - window.debug (line 52)
     *   - window.sdkChannel (line 53)
     *   - window.gameIcon (line 54)
     *   - window.maskLayerClear (set in onLoadScript, line 119-121)
     *   - window.loadJsonFunc (set in onLoadScript, line 122-125)
     *   - window.refreshPage (set in onLoadScript, line 126-128)
     *
     * Variables we need to provide:
     */

    /**
     * window.debugLanguage
     * Read by: TSBrowser.getVariantValue("debugLanguage") at line 55120
     * Used in: Main.prototype.runGame() — override for language debugging
     * Format: string (language code) or undefined
     *
     * If set, overrides the language from URL query string.
     * undefined = use URL param or default language
     */
    window.debugLanguage = undefined;

    /**
     * window.clientVer
     * Read by: TSBrowser.getVariantValue("clientVer") at line 55263
     * Used in: VersionController.resourceRoot (Weixin cache versioning)
     * Format: string (version timestamp)
     *
     * Alias for window.clientver (which index.html sets to "2026-03-02143147").
     * Used specifically for Weixin mini-game resource version caching.
     */
    window.clientVer = "2026-03-02143147";

    /**
     * window.versionConfig
     * Read by: TSBrowser.getVariantValue("versionConfig") at line 55279
     * Used in: VersionController.init() (line 55278)
     * Format: object or null
     *
     * If set and isWeixin is true, enables Weixin resource cache management.
     * null = no version-based resource mapping (standard web mode)
     */
    window.versionConfig = null;

    /**
     * window.reportBattlleLog
     * Read by: TSBrowser.getVariantValue("reportBattlleLog") at line 77533
     * Used in: TSUIController.reportBattlleLog() (line 77530-77556)
     * Format: string (URL) or any falsy value
     *
     * If truthy AND channelCode == "TanWanH5", sends battle error records
     * to the specified URL via POST.
     */
    window.reportBattlleLog = undefined;

    /**
     * window.clientserver
     * Read by: TSBrowser.getVariantValue("clientserver") at line 77429
     * Used in: connectToLogin() (line 77429)
     * Format: string (server URL) or empty string
     *
     * Only used when isWeixin is true. Prepended to resource paths.
     * Empty string = standard behavior
     */
    window.clientserver = SDK_CONFIG.CLIENT_SERVER_URL;

    /**
     * Additional window variables read directly (not via TSBrowser):
     */

    /**
     * window.show18Login
     * Read by: line 88544 — window.show18Login && (e.needAgeOverImg.source = "zhujiemian_18+_png")
     * Format: boolean
     *
     * If true, shows 18+ content warning image on login screen.
     * false = no 18+ warning
     */
    window.show18Login = false;

    /**
     * window.loginpictype
     * Read by: line 88544 — -2 == window.loginpictype
     * Format: number
     *
     * Controls login screen background image type:
     *   -2 = custom login picture (from window.loginpic)
     *    0 = default game logo background
     *
     * When -2, the game uses window.loginpic for the background.
     * When 0, it uses the default denglujiemianxuanzhejiemiannew1.jpg
     */
    window.loginpictype = 0;

    /**
     * window.showSixteenImg
     * Read by: line 88552 — window.showSixteenImg ? visible=true : visible=false
     * Format: boolean
     *
     * If true, shows 16+ content warning on login screen.
     * false = no 16+ warning
     */
    window.showSixteenImg = false;

    /**
     * window.supportLang
     * Read by: line 88552 — window.supportLang ? languageBtn.visible=true : false
     * Also: line 88749, 133206, 133326 — used as language list for LanguageList panel
     * Format: array of { lang: string, name: string }
     *
     * Controls whether the language selection button is visible on login screen.
     * If truthy, the language button is shown and this array is used as the
     * list of available languages in the LanguageList panel.
     *
     * null/undefined/empty = language button hidden
     */
    window.supportLang = [
        { lang: 'en', name: 'English' },
        { lang: 'kr', name: 'Korean' },
        { lang: 'vi', name: 'Vietnamese' },
        { lang: 'jr', name: 'Japanese' },
        { lang: 'zh', name: 'Chinese' }
    ];

    /**
     * window.showContact
     * Read by: line 77129 — window.showContact ? true : false
     * Used in: getSDKContactBtnShow() to determine if contact button is visible
     * Format: boolean
     *
     * If true, customer service contact button is shown.
     * true = show contact button
     */
    window.showContact = true;

    /**
     * window.sdkNativeChannel
     * Read by: MANY places in main.min.js (lines 77129-77137, 77176, 165703, etc.)
     * Used in:
     *   - getSDKContactBtnShow() — tanwan55en, kr, vi
     *   - getSDKtoFacebookBtnShow() — toFacebook, en
     *   - getSDKuserCenterBtnShow() — tanwan55en
     *   - getSDKSwitchAccount() — tanwan55en
     *   - getSDKLoginSwitchAccount() — kr, vi
     *   - checkMoyaSdk() — kr
     *   - reportBattlleLog — TanWanH5
     *   - fbGiveLiveSdk — tanwan55en
     * Format: string (channel identifier)
     *
     * This is the native SDK channel identifier. Different values enable/disable
     * different UI features and behaviors.
     *
     * "en" = English channel (FB Pixel, Yahoo, Google Analytics active)
     * "kr" = Korean channel (switch user, Moya SDK)
     * "vi" = Vietnamese channel (switch user)
     * "tanwan55en" = TanWan English (switch account, user center, FB Live)
     * "tc" = Taiwan channel (special report format)
     */
    window.sdkNativeChannel = 'en';

    /**
     * window.showCurChannel
     * Read by: line 77131 — window.showCurChannel ? ... : ...
     * Used in: getSDKtoFacebookBtnShow()
     * Format: string or undefined
     *
     * Channel display configuration. Controls Facebook button visibility.
     * undefined = no special channel display config
     */
    window.showCurChannel = undefined;

    /**
     * window.dotq
     * Read by: line 77155 — window.dotq && (window.dotq = window.dotq || [], window.dotq.push(...))
     * Used in: ToolCommon.ReportYaHooSdkInfo() (line 77533-77565)
     * Condition: Only when sdkChannel == "en"
     * Format: array (Yahoo Dotq tracking array)
     *
     * Yahoo Pixel tracking array. Pushes tracking events.
     * Must be initialized as an array for the push() to work.
     */
    window.dotq = [];

    /**
     * window.issdkVer2
     * Read by: line 52431 — window.issdkVer2
     * Used in: ReportSdkInfoXX() (line 52430-52441)
     * Format: boolean
     *
     * If true, ReportSdkInfoXX only processes EnterGame events and uses
     * a different data format (without dataType, with characterId, etc.).
     * false = standard reporting format with dataType
     */
    window.issdkVer2 = false;

    /**
     * window.show18Home
     * Read by: line 167173 — window.show18Home
     * Used in: Home screen 18+ content warning
     * Format: boolean
     *
     * If true, shows 18+ warning on home screen.
     * false = no 18+ warning on home
     */
    window.show18Home = false;

    /**
     * window.replaceServerName
     * Read by: line 88682 — var a = window.replaceServerName || []
     * Used in: onLoginSuccess() to replace server names based on server ID ranges
     * Format: array of { from: number, to: number, name: string, reset: number }
     *
     * Used for dynamic server name replacement. E.g., servers 100-199 could
     * be renamed to "S1-S100" format.
     * Empty array = no name replacement
     */
    window.replaceServerName = [];

    /**
     * window.serverList
     * Read by: line 88696 — a && a.hasOwnProperty(e) && (o.name = a[e])
     * Used in: matchServerUrl() to override server display names
     * Format: object { serverId: "Server Name", ... }
     *
     * Custom server name overrides. Keys are server IDs, values are display names.
     * null = no overrides
     */
    window.serverList = null;

    /**
     * window.privacyUrl
     * Read by: line 88559 — window.privacyUrl
     * Used in: If sdk == "Huawei", shows privacy policy link on login screen
     * Format: string (URL) or empty
     *
     * URL for privacy policy page. Only relevant for Huawei channel.
     */
    window.privacyUrl = '';

    /**
     * window.version
     * Read by: line 88618 — window.version && (this.clientVersion.text += " res ver " + window.version)
     * Used in: showClientVer() to append resource version to client version display
     * Format: string or undefined
     *
     * Resource version string shown in the client version display.
     * undefined = only show client version (no resource version suffix)
     */
    window.version = undefined;

    // ========================================================================
    // SECTION 12: PPGAME OBJECT ASSIGNMENT
    // ========================================================================

    /**
     * Assign PPGAME object to window.
     *
     * CRITICAL: This MUST happen before index.html's PPGAME block (lines 221-259)
     * executes. Since sdk.js is loaded at line 27 (in <head>) and the PPGAME
     * block is at line 221 (in <body>), this assignment happens first.
     *
     * When index.html sees window.PPGAME, it creates 7 wrapper functions:
     *   var paySdk = function(a)          { window.PPGAME.createPaymentOrder(a) }
     *   var gameReady = function()        { window.PPGAME.gameReady() }
     *   var report2Sdk = function(a)      { ... window.PPGAME.playerEnterServer/submitEvent(a) }
     *   var gameChapterFinish = function(a) { window.PPGAME.gameChapterFinish(a) }
     *   var openShopPage = function()     { window.PPGAME.openShopPage() }
     *   var gameLevelUp = function(a)     { window.PPGAME.gameLevelUp(a) }
     *   var tutorialFinish = function()   { window.PPGAME.submitEvent("game_tutorial_finish") }
     */
    window.PPGAME = PPGAME;

    sdkLog('info', 'Init', 'window.PPGAME assigned — ' + Object.keys(PPGAME).length + ' methods available');
    sdkLog('info', 'Init', 'PPGAME methods: ' + Object.keys(PPGAME).join(', '));

    // ========================================================================
    // SECTION 13: SDK INITIALIZATION
    // ========================================================================

    /**
     * Initialize the SDK.
     * Called immediately when sdk.js loads.
     *
     * Steps:
     *   1. Set initialization flag
     *   2. Restore session from localStorage (if available)
     *   3. Check URL for login parameters
     *   4. If no login params → show login UI
     *   5. If login params exist → restore session, update state
     *   6. Start report flush timer
     *   7. Set up beforeunload handler
     */
    function initializeSDK() {
        if (_state.isInitialized) return;
        _state.isInitialized = true;

        sdkLog('info', 'Init', '═══════════════════════════════════════════════════');
        sdkLog('info', 'Init', '  PPGAME SDK Initializing...');
        sdkLog('info', 'Init', '  Channel: ' + SDK_CONFIG.CHANNEL);
        sdkLog('info', 'Init', '  Server: ' + SDK_CONFIG.SERVER_URL);
        sdkLog('info', 'Init', '  App ID: ' + SDK_CONFIG.APP_ID);
        sdkLog('info', 'Init', '═══════════════════════════════════════════════════');

        // Try to restore session from localStorage
        try {
            var storedSession = localStorage.getItem('ppgame_session');
            if (storedSession) {
                var session = JSON.parse(storedSession);
                if (session && session.userId && session.loginToken) {
                    sdkLog('debug', 'Init', 'Found stored session for user: ' + session.userId);
                    _state.sessionId = session.sessionId || generateUniqueId();
                }
            }
        } catch (e) {
            sdkLog('warn', 'Init', 'Failed to read stored session: ' + e.message);
        }

        // Check URL for login parameters
        var loginParams = checkUrlLoginParams();

        if (loginParams) {
            // Login params exist in URL — user has logged in via SDK
            sdkLog('info', 'Init', 'Login params found in URL');
            sdkLog('debug', 'Init', '  SDK: ' + loginParams.sdk);
            sdkLog('debug', 'Init', '  UserID: ' + loginParams.userid);
            sdkLog('debug', 'Init', '  Nickname: ' + loginParams.nickname);

            // Update state with URL login info
            _state.isLoggedIn = true;
            _state.userId = loginParams.userid;
            _state.nickname = loginParams.nickname;
            _state.loginToken = loginParams.logintoken;
            _state.sdk = loginParams.sdk;
            _state.sign = loginParams.sign || null;
            _state.security = loginParams.security || null;
            _state.loginTime = Date.now();
            _state.lastActivityTime = Date.now();

            // Session will be properly set after game connects
            _state.sessionId = _state.sessionId || generateUniqueId();

            // Update stored session
            try {
                localStorage.setItem('ppgame_session', JSON.stringify({
                    userId: _state.userId,
                    nickname: _state.nickname,
                    loginToken: _state.loginToken,
                    sdk: _state.sdk,
                    sessionId: _state.sessionId,
                    loginTime: _state.loginTime,
                    sign: _state.sign,
                    security: _state.security
                }));
            } catch (e) { /* localStorage not available */ }

            // Game will continue loading normally
            sdkLog('info', 'Init', 'SDK authentication verified — game loading will proceed');

        } else {
            // No login params — show login UI
            sdkLog('info', 'Init', 'No login params found — showing login UI');

            // Wait for DOM to be ready before showing login UI
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () {
                    showLoginUI();
                });
            } else {
                showLoginUI();
            }
        }

        // Start periodic report flushing
        startReportFlushTimer();

        // Restore language preference
        try {
            var storedLang = localStorage.getItem('ppgame_language');
            if (storedLang) {
                _state.currentLanguage = storedLang;
                sdkLog('debug', 'Init', 'Restored language preference: ' + storedLang);
            }
        } catch (e) { /* localStorage not available */ }

        // Set up beforeunload to flush reports
        window.addEventListener('beforeunload', function () {
            flushReportQueue();

            // Report exit if logged in
            if (_state.isLoggedIn) {
                var exitData = {
                    userId: _state.userId,
                    sessionId: _state.sessionId,
                    duration: Date.now() - (_state.loginTime || Date.now()),
                    timestamp: formatDate()
                };

                // Synchronous send for beforeunload
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.open('POST', SDK_CONFIG.SERVER_URL + SDK_CONFIG.API.REPORT_EVENT, false);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.send(JSON.stringify({
                        eventType: 'session_end',
                        eventData: exitData
                    }));
                } catch (e) {
                    // Ignore — page is unloading
                }
            }
        });

        // Set up visibility change handler
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && _state.isLoggedIn) {
                _state.lastActivityTime = Date.now();
            }
        });

        sdkLog('info', 'Init', 'PPGAME SDK initialization complete');
    }

    // ========================================================================
    // SECTION 14: GLOBAL EXPOSED HELPERS
    // ========================================================================

    /**
     * window.PPGAME_SDK — Exposed SDK interface for external access.
     * Provides utility methods for debugging and external integration.
     */
    window.PPGAME_SDK = {
        /**
         * Get current SDK state (read-only copy).
         * @returns {object} Current SDK state
         */
        getState: function () {
            return deepClone(_state);
        },

        /**
         * Get SDK configuration (read-only copy).
         * @returns {object} Current SDK configuration
         */
        getConfig: function () {
            return deepClone(SDK_CONFIG);
        },

        /**
         * Set debug mode on/off.
         * @param {boolean} enabled - True to enable debug logging
         */
        setDebug: function (enabled) {
            _state.debugMode = !!enabled;
            sdkLog('info', 'SDK', 'Debug mode: ' + (_state.debugMode ? 'ON' : 'OFF'));
        },

        /**
         * Get TEA cipher instance for encryption/decryption.
         * @returns {object} TEA cipher object
         */
        getTEACipher: function () {
            return TEACipher;
        },

        /**
         * Encrypt data using TEA with the game's key.
         * @param {string} data - Data to encrypt
         * @returns {string} Encrypted hex string
         */
        encrypt: function (data) {
            return TEACipher.encrypt(data, SDK_CONFIG.TEA_KEY);
        },

        /**
         * Decrypt data using TEA with the game's key.
         * @param {string} hexData - Hex string to decrypt
         * @returns {string} Decrypted string
         */
        decrypt: function (hexData) {
            return TEACipher.decrypt(hexData, SDK_CONFIG.TEA_KEY);
        },

        /**
         * Force flush all queued reports.
         */
        flushReports: function () {
            flushReportQueue();
        },

        /**
         * Manually trigger logout and return to login screen.
         */
        logout: function () {
            handleLogout();
        },

        /**
         * Get ReportDataType enum reference.
         * @returns {object} ReportDataType enum
         */
        getReportDataType: function () {
            return deepClone(ReportDataType);
        },

        /**
         * Get PPLogEvents enum reference.
         * @returns {object} PPLogEvents enum
         */
        getPPLogEvents: function () {
            return deepClone(PPLogEvents);
        }
    };

    // ========================================================================
    // SECTION 15: RUN INITIALIZATION
    // ========================================================================

    // Execute initialization immediately
    initializeSDK();

})();
