/**
 * ============================================================
 * SDK.JS - DragonBall HTML5 Standalone SDK v3.1.0
 * ============================================================
 * 
 * PRINSIP: SDK menyediakan APA YANG GAME BUTUHKAN.
 * File game (index.html, game.min.js, dll) TIDAK dimodifikasi.
 * 
 * Load Order: BEFORE semua file lain (di <head>)
 * 
 * Arsitektur:
 * - sdk.js (HEAD) -> set window functions & variables
 * - index.html script 2 (BODY) -> var func = ... akan MENCOBA menimpa
 *   SEBAGIAN fungsi sdk.js. Fungsi PROTECTED (configurable:false) 
 *   TIDAK BISA ditimpa oleh var declaration.
 *   Fungsi tidak dilindungi BOLEH ditimpa karena versi index.html
 *   memanggil ExternalInterface yang ditangani bridge.js.
 * - bridge.js (via manifest) -> override egret.ExternalInterface
 * 
 * Fungsi yang DILINDUNGI (configurable:false, writable:false):
 * - getSdkLoginInfo: index.html return 4 field, game butuh 6 field
 * - getAppId: Tidak ada di index.html sama sekali
 * - getLoginServer: index.html return null (belum set), SDK return URL
 * - getQueryStringByName: Tidak ada di index.html
 * - urlEncode: Tidak ada di index.html
 * - accountLoginCallback: Tidak ada di index.html
 * - gameReady: Tidak ada di index.html
 * - initSDKDe: Tidak ada di index.html
 * - reportChatMsg: Tidak ada di index.html
 * - sendCustomEvent: Tidak ada di index.html
 * - reportLogToPP: Tidak ada di index.html
 * - report2Sdk350CreateRole: Tidak ada di index.html
 * - report2Sdk350LoginUser: Tidak ada di index.html
 * - reportToCpapiCreaterole: Tidak ada di index.html
 * - fbq: Tidak ada di index.html
 * - gtag: Tidak ada di index.html
 * 
 * Fungsi yang TIDAK dilindungi (boleh ditimpa index.html):
 * - checkSDK, checkFromNative, paySdk, switchUser, dll
 *   Karena versi index.html memanggil ExternalInterface yang
 *   ditangani bridge.js, jadi tetap berfungsi.
 * 
 * Version: 3.1.0
 * ============================================================
 * 
 * v3.1.0 Changelog:
 *   FIX: resetUser() sekarang di-wrap try-catch (sebelumnya bisa throw)
 *   FIX: Semua empty catch block sekarang log warning (sebelumnya silent)
 *   FIX: Expose STORAGE_KEY via LOCAL_SDK agar bridge.js bisa reference
 *   FIX: openURL dan window.open catch sekarang log error
 * ============================================================
 */

(function(window) {
    'use strict';

    // ========================================================
    // 1. LOGGER
    // ========================================================
    var LOG = {
        prefix: '\uD83D\uDCE6 [SDK]',
        styles: {
            title: 'background: linear-gradient(90deg, #059669 0%, #10b981 100%); color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
            success: 'color: #10b981; font-weight: bold;',
            info: 'color: #6b7280;',
            warn: 'color: #f59e0b; font-weight: bold;',
            error: 'color: #ef4444; font-weight: bold;',
            data: 'color: #8b5cf6;',
            separator: 'color: #6b7280;',
            call: 'color: #0ea5e9; font-weight: bold;'
        },
        _log: function(level, icon, message, data) {
            var timestamp = new Date().toISOString().substr(11, 12);
            var style = this.styles[level] || this.styles.info;
            var format = '%c' + this.prefix + ' %c[' + timestamp + '] ' + icon + ' ' + message;
            if (data !== undefined) {
                console.log(format, this.styles.title, style, data);
            } else {
                console.log(format, this.styles.title, style);
            }
        },
        title: function(message) {
            var line = '\u2550'.repeat(60);
            console.log('%c' + this.prefix + '%c ' + line, this.styles.title, this.styles.separator);
            console.log('%c' + this.prefix + '%c ' + message, this.styles.title, this.styles.title);
            console.log('%c' + this.prefix + '%c ' + line, this.styles.title, this.styles.separator);
        },
        success: function(msg, data) { this._log('success', '\u2705', msg, data); },
        info: function(msg, data) { this._log('info', '\u2139\uFE0F', msg, data); },
        warn: function(msg, data) { this._log('warn', '\u26A0\uFE0F', msg, data); },
        error: function(msg, data) { this._log('error', '\u274C', msg, data); },
        data: function(msg, data) { this._log('data', '\uD83D\uDCCA', msg, data); },
        call: function(msg, data) { this._log('call', '\uD83D\uDCDE', msg, data); }
    };

    // ========================================================
    // 2. STORAGE KEYS
    // ========================================================
    var STORAGE_KEY = 'dragonball_local_sdk';
    var STORAGE_LANG_KEY = 'dragonball_local_sdk_lang';

    // ========================================================
    // 3. SAVE ORIGINAL window.open (SEBELUM siapapun menimpa)
    // ========================================================
    // CRITICAL: index.html line 265 akan overwrite window.open dengan:
    //   var open = function(url) { ExternalInterface.call("openURL", url); }
    // bridge.js akan memanggil window.open() → loop infinite!
    // Jadi kita WAJIB simpan reference asli SEKARANG, lalu expose ke bridge.js
    var _nativeWindowOpen = window.open;

    // ========================================================
    // 4. HELPERS
    // ========================================================
    function generateUserId() {
        return 'u_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    }
    function generateToken() {
        return 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 15);
    }
    function generateLoginToken() {
        return 'tk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 20);
    }
    function generateSign() {
        return Date.now().toString(16) + Math.floor(Math.random() * 1000000).toString(16);
    }
    function getQueryStringValue(name) {
        try {
            var regex = new RegExp('[?&]' + name.replace(/[\[\]]/g, '\\$&') + '(=([^&#]*)|&|#|$)');
            var results = regex.exec(window.location.href);
            if (!results || !results[2]) return null;
            return decodeURIComponent(results[2].replace(/\+/g, ' '));
        } catch (e) { return null; }
    }

    // ========================================================
    // 5. USER DATA (localStorage)
    // ========================================================
    function loadOrCreateUserData() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                var parsed = JSON.parse(stored);
                if (parsed.userId && parsed.token) {
                    LOG.info('Loaded existing user:', parsed.userId);
                    return parsed;
                }
            }
        } catch (e) { LOG.warn('Failed to load user data:', e); }
        var data = {
            userId: generateUserId(),
            nickname: 'Player_' + Math.floor(Math.random() * 9999),
            token: generateToken(),
            loginToken: generateLoginToken(),
            sign: generateSign(),
            createdAt: Date.now(),
            lastLogin: Date.now()
        };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { LOG.warn('Failed to save new user data:', e); }
        LOG.success('Created new user:', data.userId);
        return data;
    }

    var userData = loadOrCreateUserData();
    // Refresh sign & loginToken setiap sesi (penting untuk auth server)
    userData.lastLogin = Date.now();
    userData.sign = generateSign();
    userData.loginToken = generateLoginToken();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); } catch (e) { LOG.warn('Failed to save refreshed user data:', e); }

    // ========================================================
    // 6. CONFIG
    // ========================================================
    function loadSavedLanguage() {
        try {
            var lang = localStorage.getItem(STORAGE_LANG_KEY);
            if (lang) return lang;
        } catch (e) { LOG.warn('Failed to load saved language:', e); }
        return getQueryStringValue('language') || 'en';
    }

    var SDK_CONFIG = {
        loginserver: 'http://127.0.0.1:8000',
        version: '2026-02-02',
        language: loadSavedLanguage(),
        thirdChannel: 'en',
        thirdParams: {
            osType: 'android',
            sdkType: 'PP',
            sdk: 'local',
            nickname: userData.nickname,
            userid: userData.userId,
            data: {
                sdk: 'local',
                nickname: userData.nickname,
                userid: userData.userId,
                securityCode: userData.token
            }
        },
        clientParams: {
            hideList: [],
            gameIcon: '',
            supportLang: ['en', 'cn', 'tw', 'kr', 'de', 'fr', 'pt', 'vi', 'enme'],
            battleAudio: true,
            showUserCenterSdk: false,
            showContact: true,
            switchAccount: false,
            sdkNativeChannel: 'en',
            showCurChannel: 'en',
            show18Login: false,
            show18Home: false
        },
        versionConfig: {}
    };

    // Exit callback dari game (accountLoginCallback)
    var _exitCallback = null;

    // ========================================================
    // 7. GETTERS
    // ========================================================
    function getStartGameData() {
        return {
            loginServer: SDK_CONFIG.loginServer,
            thirdParams: JSON.stringify(SDK_CONFIG.thirdParams),
            clientParams: JSON.stringify(SDK_CONFIG.clientParams),
            version: SDK_CONFIG.version,
            versionConfig: JSON.stringify(SDK_CONFIG.versionConfig),
            language: SDK_CONFIG.language,
            thirdChannel: SDK_CONFIG.thirdChannel
        };
    }

    // ========================================================
    // 8. PROTECTION HELPER
    // ========================================================
    // defineProperty dengan configurable:false + writable:false
    // membuat var func = ... di index.html GAGAL SILENTLY.
    // Ini memastikan fungsi-fungsi kritis tidak tertimpa.
    function protectFunction(name, fn) {
        Object.defineProperty(window, name, {
            value: fn,
            writable: false,
            configurable: false,
            enumerable: true
        });
    }

    // ========================================================
    // 9. WINDOW FUNCTIONS - FULLY PROTECTED
    // ========================================================
    // Fungsi-fungsi ini TIDAK BOLEH ditimpa oleh index.html.
    // configurable:false + writable:false = var declaration gagal silently.
    //
    // Kenapa perlu:
    // - getSdkLoginInfo: index.html hanya return 4 field, game butuh 6 field
    // - getAppId: Tidak ada di index.html, tapi game langsung panggil
    // - getLoginServer: index.html return null (loginServer belum set saat var didefinisi)
    // - Fungsi exclusive: Tidak ada di index.html sama sekali

    /**
     * getSdkLoginInfo() - PALING KRITIS, DIPROTEKSI
     * 
     * index.html return {sdk, nickName, userId, security} (4 field)
     * Game butuh    {userId, sign, sdk, nickName, loginToken, security} (6 field)
     * 
     * Field 'sign' dan 'loginToken' TIDAK ADA di versi index.html
     * -> tanpa proteksi, game tidak bisa login ke server
     * 
     * Dipanggil oleh: TSBrowser.executeFunction("getSdkLoginInfo")
     * Dipakai di: sdkLoginSuccess (line 37469), save language (line 25986)
     * 
     * Return fields yang dibaca game:
     * - userId -> ts.loginUserInfo.userId (line 37311)
     * - sign -> ts.loginUserInfo.sign (line 37311)
     * - sdk -> ts.loginUserInfo.sdk (line 37311)
     * - loginToken -> ts.loginInfo.userInfo.loginToken (line 37476)
     * - userId -> ts.loginInfo.userInfo.userId (line 37477)
     * - nickName -> ts.loginInfo.userInfo.nickName (line 37478)
     * - sdk -> ts.loginInfo.userInfo.channelCode (line 37479)
     * - security -> ts.loginInfo.userInfo.securityCode (line 37480)
     */
    protectFunction('getSdkLoginInfo', function() {
        LOG.call('getSdkLoginInfo() [PROTECTED]');
        var info = {
            userId: userData.userId,
            sign: userData.sign,
            sdk: SDK_CONFIG.thirdParams.sdk,
            nickName: userData.nickname,
            loginToken: userData.loginToken,
            security: userData.token
        };
        LOG.data('Return:', info);
        return info;
    });

    /**
     * getAppId() - DIPROTEKSI
     * Tidak ada di index.html sama sekali.
     * Dipanggil oleh: TSBrowser.executeFunction("getAppId")
     * Dipakai di: reporting (line 25985), login (line 26051), game connect (line 26083, 26125, 37339)
     */
    protectFunction('getAppId', function() {
        LOG.call('getAppId() [PROTECTED] -> local_standalone');
        return 'local_standalone';
    });

    /**
     * getLoginServer() - DIPROTEKSI
     * 
     * Kenapa dilindungi:
     * index.html: var getLoginServer = function() { return loginServer; }
     // loginServer = null saat var ini didefinisi!
     * -> jika index.html menimpa, getLoginServer() return null!
     * 
     * Dipanggil oleh: TSBrowser.executeFunction("getLoginServer")
     * Dipakai di: line 26175
     */
    protectFunction('getLoginServer', function() {
        LOG.call('getLoginServer() [PROTECTED] -> ' + SDK_CONFIG.loginServer);
        return SDK_CONFIG.loginServer;
    });

    /**
     * getQueryStringByName(name) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("getQueryStringByName", name)
     * Dipakai di: line 3870, 12127, 37381, 37300
     * Digunakan untuk: "language", "pluginMiniGame"
     */
    protectFunction('getQueryStringByName', function(name) {
        var val = getQueryStringValue(name);
        LOG.call('getQueryStringByName("' + name + '") [PROTECTED] -> ' + val);
        return val;
    });

    /**
     * urlEncode(str) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("urlEncode", str)
     * Dipakai di: line 94033-94040, 109037-109044 (chat link building)
     */
    protectFunction('urlEncode', function(str) {
        LOG.call('urlEncode() [PROTECTED]');
        return encodeURIComponent(str);
    });

    /**
     * accountLoginCallback(exitFn) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("accountLoginCallback", exitFn)
     * Dipakai di: line 37294 (initAll)
     * Game mendaftarkan ts.exitGame sebagai callback exit
     */
    protectFunction('accountLoginCallback', function(exitFn) {
        LOG.call('accountLoginCallback() [PROTECTED]');
        if (typeof exitFn === 'function') {
            _exitCallback = exitFn;
            LOG.success('Exit callback registered');
        } else {
            LOG.warn('exitFn is not a function: ' + typeof exitFn);
        }
    });

    /**
     * gameReady() - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: window.gameReady() di line 37323
     * Dipanggil setelah login screen siap
     */
    protectFunction('gameReady', function() {
        LOG.success('gameReady() [PROTECTED] - Game selesai loading!');
    });

    /**
     * initSDKDe(key) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("initSDKDe", key)
     * Dipakai di: line 3931
     * Dipanggil dengan key: "68355760639752706329835728782448"
     * Init ThinkingAnalytics SDK
     */
    protectFunction('initSDKDe', function(key) {
        LOG.call('initSDKDe() [PROTECTED] key=' + key);
        LOG.warn('Standalone mode - ThinkingAnalytics not connected');
    });

    /**
     * reportChatMsg(data) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("reportChatMsg", data)
     * Dipakai di: line 94028, 109032
     * Format: { gkey, tkey, server_id, qid, name, role_id, type, content, time, ip, sign }
     */
    protectFunction('reportChatMsg', function(data) {
        LOG.call('reportChatMsg() [PROTECTED]');
        LOG.data('Chat data:', data);
    });

    /**
     * sendCustomEvent(name, data) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("sendCustomEvent", name, data)
     * Dipakai di: line 26334
     */
    protectFunction('sendCustomEvent', function(name, data) {
        LOG.call('sendCustomEvent() [PROTECTED] ' + name);
    });

    /**
     * reportLogToPP(event, data) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("reportLogToPP", event, data)
     * Dipakai di: line 26322
     */
    protectFunction('reportLogToPP', function(event, data) {
        LOG.call('reportLogToPP() [PROTECTED] ' + event);
    });

    /**
     * report2Sdk350CreateRole(json) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("report2Sdk350CreateRole", json)
     * Dipakai di: line 25922
     */
    protectFunction('report2Sdk350CreateRole', function(json) {
        LOG.call('report2Sdk350CreateRole() [PROTECTED]');
        LOG.data('Data:', json);
    });

    /**
     * report2Sdk350LoginUser(json) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("report2Sdk350LoginUser", json)
     * Dipakai di: line 25924
     */
    protectFunction('report2Sdk350LoginUser', function(json) {
        LOG.call('report2Sdk350LoginUser() [PROTECTED]');
        LOG.data('Data:', json);
    });

    /**
     * reportToCpapiCreaterole(data) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("reportToCpapiCreaterole", data)
     * Dipakai di: line 25895
     */
    protectFunction('reportToCpapiCreaterole', function(data) {
        LOG.call('reportToCpapiCreaterole() [PROTECTED]');
        LOG.data('Data:', data);
    });

    /**
     * fbq(actionName, eventName) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("fbq", actionName, eventName)
     * Dipakai di: line 25900 (hanya saat sdkChannel === "en")
     * Facebook Pixel tracking
     */
    protectFunction('fbq', function(actionName, eventName) {
        LOG.call('fbq() [PROTECTED] ' + actionName + ', ' + eventName);
    });

    /**
     * gtag(...args) - DIPROTEKSI
     * Tidak ada di index.html.
     * Dipanggil oleh: TSBrowser.executeFunction("gtag", ...args)
     * Dipakai di: line 25918 (hanya saat sdkChannel === "en")
     * Google Ads conversion tracking
     */
    protectFunction('gtag', function() {
        var args = Array.prototype.slice.call(arguments);
        LOG.call('gtag() [PROTECTED] ' + JSON.stringify(args));
    });

    // ========================================================
    // 10. WINDOW FUNCTIONS - NOT PROTECTED (boleh ditimpa index.html)
    // ========================================================
    // Fungsi-fungsi ini juga didefinisikan sdk.js sebagai FALLBACK.
    // index.html boleh menimpa karena versi index.html memanggil
    // egret.ExternalInterface.call() yang ditangani bridge.js.

    /**
     * checkSDK() - Dipanggil di line 37466 (login screen)
     * Harus return true agar game mengenali SDK ada
     * index.html version: calls ExternalInterface("changeView") lalu return true
     */
    window.checkSDK = function() {
        LOG.call('checkSDK() -> true');
        return true;
    };

    /**
     * checkFromNative() - Dipanggil di line 25889, 262, 41977, 43423
     * Harus return true untuk payment flow dan native checks
     */
    window.checkFromNative = function() {
        LOG.call('checkFromNative() -> true');
        return true;
    };

    /**
     * paySdk(data) - Dipanggil di line 25889, 260
     * index.html version: set data.power, lalu call ExternalInterface("pei")
     */
    window.paySdk = function(data) {
        LOG.call('paySdk()');
        if (data) {
            data.power = data.money;
            if (data.h5payParam) data.serverName = data.serverId;
        }
        LOG.warn('Standalone mode - Payment bypassed');
    };

    /**
     * switchUser() - Dipanggil di line 37510, 82046
     * index.html version: call ExternalInterface("refresh", "switch usr")
     * Fungsi ini TIDAK dilindungi karena index.html version memanggil
     * bridge.js yang handle "switch usr" dan reset user data.
     */
    window.switchUser = function() {
        LOG.call('switchUser()');
        userData = {
            userId: generateUserId(),
            nickname: 'Player_' + Math.floor(Math.random() * 9999),
            token: generateToken(),
            loginToken: generateLoginToken(),
            sign: generateSign(),
            createdAt: Date.now(),
            lastLogin: Date.now()
        };
        SDK_CONFIG.thirdParams.nickname = userData.nickname;
        SDK_CONFIG.thirdParams.userid = userData.userId;
        SDK_CONFIG.thirdParams.data.nickname = userData.nickname;
        SDK_CONFIG.thirdParams.data.userid = userData.userId;
        SDK_CONFIG.thirdParams.data.securityCode = userData.token;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); } catch (e) { LOG.warn('Failed to save switched user data:', e); }
        LOG.success('New user:', userData.userId);
        window.location.reload();
    };

    /**
     * giveLikeSdk(data) - Dipanggil di line 116981
     * index.html version: call ExternalInterface("giveLike")
     */
    window.giveLikeSdk = function(data) {
        LOG.call('giveLikeSdk()');
    };

    /**
     * contactSdk() - Dipanggil di line 37506, 82053
     * index.html version: call ExternalInterface("contact")
     */
    window.contactSdk = function() {
        LOG.call('contactSdk()');
    };

    /**
     * switchAccountSdk() - Dipanggil di line 82044 (tanwan55en channel)
     * index.html version: call ExternalInterface("switchAccount")
     */
    window.switchAccountSdk = function() {
        LOG.call('switchAccountSdk()');
    };

    /**
     * switchAccount() - Dipanggil via TSBrowser (line 258)
     * Tidak ada di index.html, tapi game memanggilnya langsung
     * Fallback: trigger switchUser
     */
    window.switchAccount = function() {
        LOG.call('switchAccount()');
        // Trigger switch user flow
        if (typeof window.LOCAL_SDK !== 'undefined' && window.LOCAL_SDK.resetUser) {
            window.LOCAL_SDK.resetUser();
        }
        setTimeout(function() { window.location.reload(); }, 100);
    };

    /**
     * fbGiveLiveSdk() - Dipanggil di line 114453
     * index.html version: call ExternalInterface("fbGiveLive")
     */
    window.fbGiveLiveSdk = function() {
        LOG.call('fbGiveLiveSdk()');
    };

    /**
     * userCenterSdk() - Dipanggil di line 37508, 82062
     * index.html version: call ExternalInterface("userCenter")
     */
    window.userCenterSdk = function() {
        LOG.call('userCenterSdk()');
    };

    /**
     * gifBagSdk() - Defensi, tidak ditemukan di game.min.js
     * tapi ada di index.html, jadi kita sediakan
     */
    window.gifBagSdk = function() {
        LOG.call('gifBagSdk()');
    };

    /**
     * report2Sdk(data) - Dipanggil di line 25891, 25893
     * index.html version: set data.powerNum = data.moneyNum, lalu call ExternalInterface("report2Third")
     */
    window.report2Sdk = function(data) {
        LOG.call('report2Sdk()');
        if (data) data.powerNum = data.moneyNum;
    };

    /**
     * report2Third(data) - Dipanggil game melalui index.html
     * index.html version: call ExternalInterface("report2Third", JSON.stringify(data))
     */
    window.report2Third = function(data) {
        LOG.call('report2Third()');
    };

    /**
     * gameChapterFinish(lessonId) - Dipanggil di line 26313
     * index.html version: jika sdkType=="PP", report ke ExternalInterface("report2Third")
     */
    window.gameChapterFinish = function(lessonId) {
        LOG.call('gameChapterFinish(' + lessonId + ')');
    };

    /**
     * openShopPage() - Dipanggil di line 26317
     * index.html version: jika sdkType=="PP", report ke ExternalInterface("report2Third")
     */
    window.openShopPage = function() {
        LOG.call('openShopPage()');
    };

    /**
     * gameLevelUp(level) - Dipanggil di line 26320
     * index.html version: jika sdkType=="PP", report ke ExternalInterface("report2Third")
     */
    window.gameLevelUp = function(level) {
        LOG.call('gameLevelUp(' + level + ')');
    };

    /**
     * tutorialFinish() - Dipanggil di line 26315
     * index.html version: jika sdkType=="PP", report ke ExternalInterface("report2Third")
     */
    window.tutorialFinish = function() {
        LOG.call('tutorialFinish()');
    };

    /**
     * reload() - Dipanggil di line 25650, 25682 (error code 38)
     * index.html version: call ExternalInterface("refresh", "reload game")
     */
    window.reload = function() {
        LOG.call('reload()');
        window.location.reload();
    };

    /**
     * changeLanguage(lang) - Dipanggil di line 25999
     * index.html version: call ExternalInterface("changeLanguage", lang) lalu reload
     * 
     * CATATAN: index.html akan menimpa fungsi ini.
     * Versi index.html TIDAK menyimpan bahasa ke localStorage!
     * Itulah kenapa bridge.js harus menangani "changeLanguage" call
     * dan menyimpan bahasa melalui LOCAL_SDK.saveLanguage()
     */
    window.changeLanguage = function(lang) {
        LOG.call('changeLanguage(' + lang + ')');
        SDK_CONFIG.language = lang;
        try { localStorage.setItem(STORAGE_LANG_KEY, lang); } catch (e) { LOG.warn('Failed to save language:', e); }
    };

    /**
     * openURL(url) - Dipanggil di line 26332
     * index.html version: call ExternalInterface("openURL", url)
     * 
     * PENTING: versi sdk.js ini memakai _nativeWindowOpen
     * karena index.html akan meng-overwrite window.open
     */
    window.openURL = function(url) {
        LOG.call('openURL(' + url + ')');
        if (url && _nativeWindowOpen) {
            try { _nativeWindowOpen.call(window, url, '_blank'); } catch (e) { LOG.warn('openURL failed:', e); }
        }
    };

    /**
     * window.open - fallback (akan ditimpa index.html)
     * PENTING: pakai _nativeWindowOpen, bukan window.open (rekursi!)
     */
    window.open = function(url, target) {
        LOG.call('open(' + url + ')');
        if (url && _nativeWindowOpen) {
            try { _nativeWindowOpen.call(window, url, target || '_blank'); } catch (e) { LOG.warn('window.open failed:', e); }
        }
    };

    // ========================================================
    // 10b. ADDITIONAL WINDOW FUNCTIONS - Called by game with && guard
    // ========================================================
    // Fungsi-fungsi ini dipanggil game dengan pattern:
    //   window.funcName && window.funcName(data)
    // Jadi tidak wajib ada, tapi game mengharapkannya ada.
    // Tanpa ini, game TIDAK crash, tapi reporting/analytics tidak berjalan.

    /**
     * reportToBSH5Createrole(data) - Dipanggil di line 25897
     * Pattern: window.reportToBSH5Createrole && window.reportToBSH5Createrole(e)
     * Tujuan: Report character creation ke BSH5 analytics
     */
    window.reportToBSH5Createrole = function(data) {
        LOG.call('reportToBSH5Createrole()');
    };

    /**
     * reportToFbq(data) - Dipanggil di line 25902
     * Pattern: window && window.reportToFbq && window.reportToFbq(e)
     * Tujuan: Facebook Pixel reporting (channel-specific)
     */
    window.reportToFbq = function(data) {
        LOG.call('reportToFbq()');
    };

    /**
     * dotq - Dipanggil di line 25905 (hanya saat sdkChannel === "en")
     * Pattern: "en" == t && window.dotq && (window.dotq = window.dotq || [], window.dotq.push({...}))
     * Tujuan: Yahoo Gemini Pixel tracking
     * HARUS dimulai sebagai array jika channel == "en"
     */
    window.dotq = [];

    // ========================================================
    // 11. WINDOW VARIABLES - Dibaca langsung oleh game
    // ========================================================
    // Game membaca ini via TSBrowser.getVariantValue(name) → window[name]

    /**
     * window.sdkChannel - Dipakai di line 25899, 25904, 25917, 25926, 81964, 118432
     * Menentukan channel-specific behavior (fbq, gtag, Yahoo SDK, Moya SDK, dll)
     * HARUS string
     */
    window.sdkChannel = SDK_CONFIG.thirdChannel;

    /**
     * window.showContact - Dipakai di line 25879
     * Tampilkan tombol kontak. HARUS boolean
     * NOTE: Akan di-overwrite oleh index.html dari clientParams
     */
    window.showContact = true;

    /**
     * window.showSixteenImg - Dipakai di line 37302
     * Tampilkan gambar konten 16+. Tidak di-set dari clientParams di index.html
     */
    window.showSixteenImg = false;

    /**
     * window.show18Login - Dipakai di line 37294
     * Tampilkan gambar konten 18+. Di-set oleh refreshPage() di index.html.
     * index.html: window["show18Login"] = clientParams["show18Login"]
     * Tanpa ini, gambar 18+ tidak ditampilkan saat refresh.
     * Game code: window.show18Login && (e.needAgeOverImg.source = "zhujiemian_18+_png")
     */
    window.show18Login = false;

    /**
     * window.show18Home - Dipakai di index.html refreshPage()
     * Tampilkan konten 18+ di home screen.
     * Di-set oleh: window["show18Home"] = clientParams["show18Home"]
     */
    window.show18Home = false;

    /**
     * window.loginpictype - Dipakai di line 37294
     * Tipe gambar login (-2 = special handling). Tidak di-set dari clientParams
     */
    window.loginpictype = 0;

    /**
     * window.issdkVer2 - Dipakai di line 1181
     * Flag versi SDK untuk reporting. Set true untuk SDK v2 behavior
     */
    window.issdkVer2 = true;

    // ========================================================
    // 12. EXPORT SDK INTERFACE (dipakai bridge.js & debug)
    // ========================================================
    window.LOCAL_SDK = {
        config: SDK_CONFIG,
        user: userData,
        STORAGE_KEY: STORAGE_KEY,
        STORAGE_LANG_KEY: STORAGE_LANG_KEY,
        getStartGameData: getStartGameData,
        getSdkLoginInfo: function() { return window.getSdkLoginInfo(); },
        
        // Reference asli window.open (sebelum index.html menimpa)
        // bridge.js butuh ini untuk buka URL tanpa infinite loop
        _nativeWindowOpen: _nativeWindowOpen,
        
        // Dipanggil bridge.js saat "changeLanguage" EI diterima
        // Karena index.html's changeLanguage TIDAK simpan ke localStorage,
        // bridge HARUS simpan sebelum page reload
        saveLanguage: function(lang) {
            if (lang) {
                SDK_CONFIG.language = lang;
                try { localStorage.setItem(STORAGE_LANG_KEY, lang); } catch (e) { LOG.warn('Failed to save language via bridge:', e); }
                LOG.success('Language saved via bridge: ' + lang);
            }
        },
        
        // Dipanggil bridge.js saat "refresh" + "switch usr" diterima
        // Karena index.html's switchUser tidak reset userData,
        // bridge HARUS clear localStorage agar sdk.js buat user baru
        resetUser: function() {
            try {
                localStorage.removeItem(STORAGE_KEY);
                LOG.success('User data cleared. New user will be created on reload.');
            } catch (e) {
                LOG.warn('Failed to clear user data:', e);
            }
        },

        // Panggil exit callback (jika terdaftar)
        callExit: function() {
            if (typeof _exitCallback === 'function') {
                LOG.info('Calling exit callback...');
                try { _exitCallback(); } catch (e) { LOG.error('Exit callback error:', e); }
            } else {
                LOG.warn('No exit callback registered');
            }
        },

        // Switch ke user baru (tanpa reload, untuk testing)
        generateNewUser: function() {
            userData = {
                userId: generateUserId(),
                nickname: 'Player_' + Math.floor(Math.random() * 9999),
                token: generateToken(),
                loginToken: generateLoginToken(),
                sign: generateSign(),
                createdAt: Date.now(),
                lastLogin: Date.now()
            };
            SDK_CONFIG.thirdParams.nickname = userData.nickname;
            SDK_CONFIG.thirdParams.userid = userData.userId;
            SDK_CONFIG.thirdParams.data.nickname = userData.nickname;
            SDK_CONFIG.thirdParams.data.userid = userData.userId;
            SDK_CONFIG.thirdParams.data.securityCode = userData.token;
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); } catch (e) { LOG.warn('Failed to save generated user data:', e); }
            this.user = userData;
            LOG.success('New user generated:', userData.userId);
            return userData;
        },

        showConfig: function() {
            LOG.title('SDK v3.0 Configuration');
            LOG.data('loginServer:', SDK_CONFIG.loginServer);
            LOG.data('language:', SDK_CONFIG.language);
            LOG.data('thirdChannel:', SDK_CONFIG.thirdChannel);
            LOG.data('version:', SDK_CONFIG.version);
            LOG.data('sdkType:', SDK_CONFIG.thirdParams.sdkType);
            LOG.data('userId:', userData.userId);
            LOG.data('nickname:', userData.nickname);
            LOG.data('sign:', userData.sign);
            LOG.data('loginToken:', userData.loginToken);
            LOG.data('security/token:', userData.token);
            LOG.info('');
            LOG.info('=== Protected Functions (configurable:false) ===');
            var protectedFuncs = [
                'getSdkLoginInfo', 'getAppId', 'getLoginServer',
                'getQueryStringByName', 'urlEncode', 'accountLoginCallback',
                'gameReady', 'initSDKDe', 'reportChatMsg', 'sendCustomEvent',
                'reportLogToPP', 'report2Sdk350CreateRole', 'report2Sdk350LoginUser',
                'reportToCpapiCreaterole', 'fbq', 'gtag'
            ];
            protectedFuncs.forEach(function(fn) {
                var descriptor = Object.getOwnPropertyDescriptor(window, fn);
                var isProtected = descriptor && !descriptor.configurable && !descriptor.writable;
                var icon = isProtected ? '\uD83D\uDD12' : '\u274C';
                LOG.info(icon + ' window.' + fn + '() ' + (isProtected ? '[PROTECTED]' : '[NOT PROTECTED!]'));
            });
            LOG.info('');
            LOG.info('=== Unprotected Functions (index.html boleh menimpa) ===');
            var unprotectedFuncs = [
                'checkSDK', 'checkFromNative', 'paySdk', 'switchUser',
                'giveLikeSdk', 'contactSdk', 'switchAccountSdk', 'switchAccount',
                'fbGiveLiveSdk', 'userCenterSdk', 'gifBagSdk',
                'report2Sdk', 'report2Third', 'gameChapterFinish',
                'openShopPage', 'gameLevelUp', 'tutorialFinish',
                'reload', 'changeLanguage', 'openURL'
            ];
            unprotectedFuncs.forEach(function(fn) {
                var isFunc = typeof window[fn] === 'function';
                LOG.info((isFunc ? '\u2705' : '\u274C') + ' window.' + fn + '()');
            });
            LOG.info('');
            LOG.info('=== Window Variables ===');
            LOG.info('\u2705 window.sdkChannel = ' + window.sdkChannel);
            LOG.info('\u2705 window.showContact = ' + window.showContact);
            LOG.info('\u2705 window.showSixteenImg = ' + window.showSixteenImg);
            LOG.info('\u2705 window.loginpictype = ' + window.loginpictype);
            LOG.info('\u2705 window.issdkVer2 = ' + window.issdkVer2);
            LOG.info('\u2705 _exitCallback = ' + (typeof _exitCallback === 'function' ? 'registered' : 'null'));
        }
    };

    // ========================================================
    // 13. INIT LOG
    // ========================================================
    LOG.title('SDK v3.0 Initialized');
    LOG.success('User ID: ' + userData.userId);
    LOG.info('Nickname: ' + userData.nickname);
    LOG.info('Channel: ' + SDK_CONFIG.thirdChannel);
    LOG.info('Language: ' + SDK_CONFIG.language);
    LOG.info('Version: ' + SDK_CONFIG.version);
    LOG.info('sdkType: PP');
    LOG.info('Login Server: ' + SDK_CONFIG.loginServer);
    LOG.info('');
    LOG.info('Protected functions (16): getSdkLoginInfo, getAppId, getLoginServer,');
    LOG.info('  getQueryStringByName, urlEncode, accountLoginCallback, gameReady,');
    LOG.info('  initSDKDe, reportChatMsg, sendCustomEvent, reportLogToPP,');
    LOG.info('  report2Sdk350CreateRole, report2Sdk350LoginUser,');
    LOG.info('  reportToCpapiCreaterole, fbq, gtag');
    LOG.info('');
    LOG.info('Unprotected functions (20): checkSDK, checkFromNative, paySdk, ...');
    LOG.info('Additional (&& guarded): reportToBSH5Createrole, reportToFbq, dotq');
    LOG.info('Window variables (7): sdkChannel, showContact, showSixteenImg, show18Login, show18Home, loginpictype, issdkVer2');
    LOG.info('');
    LOG.info('Debug: LOCAL_SDK.showConfig()');

})(window);
