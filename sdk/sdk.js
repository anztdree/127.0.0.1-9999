/**
 * ============================================================
 * SDK.JS - DragonBall HTML5 Standalone SDK
 * ============================================================
 * 
 * Purpose: Menyediakan data SDK untuk game standalone
 * tanpa native wrapper atau server backend.
 * 
 * Load Order: BEFORE bridge.js and egret.web.min.js
 * 
 * Author: Local SDK Bridge
 * Version: 1.1.0
 * ============================================================
 */

(function(window) {
    'use strict';

        // ========================================================
    // 1. STYLISH LOGGER - FIXED VERSION
    // ========================================================
    var LOG = {
        prefix: '📦 [SDK]',
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
            
            // Format: %c[Prefix] %c[Timestamp + Icon + Message]
            var format = '%c' + this.prefix + ' %c[' + timestamp + '] ' + icon + ' ' + message;
            
            if (data !== undefined) {
                console.log(format, this.styles.title, style, data);
            } else {
                console.log(format, this.styles.title, style);
            }
        },
        
        title: function(message) {
            var line = '══════════════════════════════════════════════════════';
            // Gunakan dua %c: satu untuk badge SDK, satu untuk teks garis/pesan
            console.log('%c' + this.prefix + '%c ' + line, this.styles.title, this.styles.separator);
            console.log('%c' + this.prefix + '%c ' + message, this.styles.title, this.styles.title);
            console.log('%c' + this.prefix + '%c ' + line, this.styles.title, this.styles.separator);
        },
        
        success: function(message, data) { this._log('success', '✅', message, data); },
        info: function(message, data) { this._log('info', 'ℹ️', message, data); },
        warn: function(message, data) { this._log('warn', '⚠️', message, data); },
        error: function(message, data) { this._log('error', '❌', message, data); },
        data: function(message, data) { this._log('data', '📊', message, data); },
        call: function(message, data) { this._log('call', '📞', message, data); }
    };


    // ========================================================
    // 2. STORAGE KEY
    // ========================================================
    var STORAGE_KEY = 'dragonball_local_sdk';

    // ========================================================
    // 3. HELPER: Generate Random Strings
    // ========================================================
    function generateUserId() {
        var timestamp = Date.now().toString(36);
        var random = Math.random().toString(36).substring(2, 10);
        return 'u_' + timestamp + random;
    }

    function generateToken() {
        var timestamp = Date.now().toString(36);
        var random = Math.random().toString(36).substring(2, 15);
        return 'local_' + timestamp + '_' + random;
    }

    // ========================================================
    // 4. LOAD OR CREATE USER DATA
    // ========================================================
    function loadOrCreateUserData() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                var parsed = JSON.parse(stored);
                LOG.info('Loaded existing user data:', parsed.userId);
                return parsed;
            }
        } catch (e) {
            LOG.warn('Failed to load stored data:', e);
        }

        // Create new user data
        var newUserData = {
            userId: generateUserId(),
            nickname: 'Player',
            token: generateToken(),
            createdAt: Date.now()
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newUserData));
            LOG.success('Created new user data:', newUserData.userId);
        } catch (e) {
            LOG.warn('Failed to store user data:', e);
        }

        return newUserData;
    }

    // ========================================================
    // 5. USER DATA INSTANCE
    // ========================================================
    var userData = loadOrCreateUserData();

    // ========================================================
    // 6. SDK CONFIGURATION
    // ========================================================
    var SDK_CONFIG = {
        // Server configuration
        loginServer: 'http://127.0.0.1:9999',
        
        // Game version
        version: '1.0.0',
        
        // Language setting
        language: 'en',
        
        // Channel identifier
        thirdChannel: 'en',
        
        // Third party SDK parameters (stringified for bridge)
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
        
        // Client parameters (stringified for bridge)
        // NOTE: gameIcon harus EMPTY STRING agar tidak menambah suffix ke nama file
        // Semua field ini dibaca oleh index.html dan di-set ke window.*
        clientParams: {
            hideList: [],
            gameIcon: '',           // EMPTY - no suffix added to image names
            supportLang: ['en', 'cn', 'tw', 'kr', 'de', 'fr', 'pt', 'vi', 'enme'],
            battleAudio: true,
            showUserCenterSdk: false,
            showContact: true,
            switchAccount: false,
            sdkNativeChannel: 'en',
            showCurChannel: 'en',
            show18Login: false,     // Disable 18+ login screen
            show18Home: false       // Disable 18+ home screen
        },
        
        // Version configuration
        versionConfig: {}
    };

    // ========================================================
    // 7. GETTERS
    // ========================================================
    
    /**
     * Get data for startGame callback
     * Returns object ready for JSON.stringify
     */
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

    /**
     * Get SDK login info for game
     */
    function getSdkLoginInfo() {
        return {
            sdk: SDK_CONFIG.thirdParams.sdk,
            nickName: SDK_CONFIG.thirdParams.nickname,
            userId: SDK_CONFIG.thirdParams.userid,
            security: SDK_CONFIG.thirdParams.data.securityCode
        };
    }

    /**
     * Get login server URL
     */
    function getLoginServer() {
        return SDK_CONFIG.loginServer;
    }

    // ========================================================
    // 8. WINDOW FUNCTIONS - SDK Interface
    // ========================================================

    /**
     * Get SDK login information
     * Called by: TSBrowser.getSdkLoginInfo()
     */
    window.getSdkLoginInfo = function() {
        LOG.call('getSdkLoginInfo()');
        var info = getSdkLoginInfo();
        LOG.data('Returning:', info);
        return info;
    };

    /**
     * Check if running from native wrapper
     * Called by: TSBrowser.isNative()
     */
    window.checkFromNative = function() {
        LOG.call('checkFromNative() → true');
        return true;
    };

    /**
     * Get login server URL
     * Called by: TSBrowser.executeFunction('getLoginServer')
     */
    window.getLoginServer = function() {
        LOG.call('getLoginServer() → ' + SDK_CONFIG.loginServer);
        return SDK_CONFIG.loginServer;
    };

    /**
     * Get app ID
     * Called by: TSBrowser.executeFunction('getAppId')
     */
    window.getAppId = function() {
        LOG.call('getAppId() → local_standalone');
        return 'local_standalone';
    };

    /**
     * Payment SDK
     * Called by: TSBrowser.payToSdk() / window.paySdk
     */
    window.paySdk = function(data) {
        LOG.call('paySdk()');
        LOG.data('Payment Data:', data);
        LOG.warn('Standalone mode - Payment bypassed');
    };

    /**
     * Switch user account
     * Called by: window.switchUser
     */
    window.switchUser = function() {
        LOG.call('switchUser() - Generating new user...');
        
        userData = {
            userId: generateUserId(),
            nickname: 'Player',
            token: generateToken(),
            createdAt: Date.now()
        };
        
        // Update config
        SDK_CONFIG.thirdParams.nickname = userData.nickname;
        SDK_CONFIG.thirdParams.userid = userData.userId;
        SDK_CONFIG.thirdParams.data.nickname = userData.nickname;
        SDK_CONFIG.thirdParams.data.userid = userData.userId;
        SDK_CONFIG.thirdParams.data.securityCode = userData.token;
        
        // Store new user
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
        } catch (e) {
            LOG.warn('Failed to store new user data:', e);
        }
        
        LOG.success('Switched to new user:', userData.userId);
        
        // Reload game
        window.location.reload();
    };

    /**
     * Customer service contact
     */
    window.contactSdk = function() {
        LOG.call('contactSdk()');
        LOG.warn('Standalone mode - No customer service available');
    };

    /**
     * Report to SDK
     */
    window.report2Sdk = function(data) {
        LOG.call('report2Sdk()');
        LOG.data('Report Data:', data);
    };

    /**
     * Report to third party (Facebook, Google, etc)
     */
    window.report2Third = function(data) {
        LOG.call('report2Third()');
        LOG.data('Report Data:', data);
    };

    /**
     * Change language
     */
    window.changeLanguage = function(lang) {
        LOG.call('changeLanguage() → ' + lang);
        SDK_CONFIG.language = lang;
        try {
            localStorage.setItem(STORAGE_KEY + '_lang', lang);
        } catch (e) {
            LOG.warn('Failed to store language:', e);
        }
    };

    /**
     * Open URL
     */
    window.openURL = function(url) {
        LOG.call('openURL() → ' + url);
        window.open(url, '_blank');
    };

    // ========================================================
    // 9. WINDOW FUNCTIONS - PP SDK Specific
    // ========================================================

    window.gameChapterFinish = function(lessonId) {
        LOG.call('gameChapterFinish() → Lesson: ' + lessonId);
    };

    window.openShopPage = function() {
        LOG.call('openShopPage()');
    };

    window.gameLevelUp = function(level) {
        LOG.call('gameLevelUp() → Level: ' + level);
    };

    window.tutorialFinish = function() {
        LOG.call('tutorialFinish()');
    };

    window.reportLogToPP = function(event, data) {
        LOG.call('reportLogToPP() → ' + event);
        if (data) LOG.data('Data:', data);
    };

    // ========================================================
    // 10. WINDOW FUNCTIONS - Additional SDK Features
    // ========================================================

    window.fbGiveLiveSdk = function() {
        LOG.call('fbGiveLiveSdk()');
        LOG.warn('Standalone mode - No Facebook integration');
    };

    window.userCenterSdk = function() {
        LOG.call('userCenterSdk()');
        LOG.warn('Standalone mode - No user center');
    };

    window.gifBagSdk = function() {
        LOG.call('gifBagSdk()');
        LOG.warn('Standalone mode - No gift bag');
    };

    window.switchAccountSdk = function() {
        LOG.call('switchAccountSdk()');
        window.switchUser();
    };

    window.giveLikeSdk = function(data) {
        LOG.call('giveLikeSdk()');
        LOG.data('Data:', data);
    };

    window.reportToBSH5Createrole = function(data) {
        LOG.call('reportToBSH5Createrole()');
        LOG.data('Data:', data);
    };

    // ========================================================
    // 11. SDK CHANNEL VARIABLES
    // ========================================================
    // ⚠️ PERINGATAN: Jangan overwrite window.contactSdk, window.userCenterSdk,
    // window.switchAccountSdk, window.switchUser — mereka sudah didefinisikan
    // sebagai FUNCTION di Section 8-10. Mengoverwrite dengan boolean
    // akan menyebabkan crash ketika game memanggilnya sebagai fungsi.
    //
    // Variabel showContact, showUserCenterSdk, sdkNativeChannel, dll
    // sudah di-set oleh index.html dari clientParams. Tidak perlu duplikat.
    //
    // window.sdkChannel dibaca langsung oleh game (bukan dari clientParams),
    // jadi ini perlu di-set di sini.
    // ========================================================
    
    window.sdkChannel = SDK_CONFIG.thirdChannel;

    // ========================================================
    // 12. EXPORT SDK INTERFACE
    // ========================================================
    
    window.LOCAL_SDK = {
        // Configuration
        config: SDK_CONFIG,
        
        // User data
        user: userData,
        
        // Getters
        getStartGameData: getStartGameData,
        getSdkLoginInfo: getSdkLoginInfo,
        getLoginServer: getLoginServer,
        
        // Utilities
        generateUserId: generateUserId,
        generateToken: generateToken,
        
        // Reset user (for testing)
        resetUser: function() {
            localStorage.removeItem(STORAGE_KEY);
            LOG.success('User data cleared. Reload to generate new user.');
        },
        
        // Debug: Show current config
        showConfig: function() {
            LOG.title('Current SDK Configuration');
            LOG.data('loginServer:', SDK_CONFIG.loginServer);
            LOG.data('language:', SDK_CONFIG.language);
            LOG.data('thirdChannel:', SDK_CONFIG.thirdChannel);
            LOG.data('gameIcon:', SDK_CONFIG.clientParams.gameIcon || '(empty)');
            LOG.data('show18Login:', SDK_CONFIG.clientParams.show18Login);
            LOG.data('userId:', userData.userId);
            LOG.data('token:', userData.token);
        }
    };

    // ========================================================
    // 13. INITIALIZATION LOG
    // ========================================================
    LOG.title('Local SDK Initialized');
    LOG.success('User ID: ' + userData.userId);
    LOG.info('Nickname: ' + userData.nickname);
    LOG.info('Channel: ' + SDK_CONFIG.thirdChannel);
    LOG.info('Language: ' + SDK_CONFIG.language);
    LOG.info('gameIcon: (empty) - No image suffix');
    LOG.info('Languages: ' + SDK_CONFIG.clientParams.supportLang.join(', '));
    LOG.info('Login Server: ' + SDK_CONFIG.loginServer);
    LOG.info('');
    LOG.info('💡 Debug: Use LOCAL_SDK.showConfig() to view config');

})(window);
