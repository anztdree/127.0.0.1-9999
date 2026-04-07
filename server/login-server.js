/**
 * ============================================================
 * LOGIN-SERVER.JS - DragonBall HTML5 Mock Login Server
 * ============================================================
 * 
 * Purpose: Mock backend untuk login-server Socket.IO
 * Intercept koneksi ke login-server dan berikan response palsu
 * 
 * Load Order: AFTER socket.io.min.js, BEFORE main.min.js
 * 
 * Author: Local SDK Bridge
 * Version: 2.3.0 - SaveHistory: fresh token + safe null; SaveLanguage: add language field
 * ============================================================
 */

(function(window) {
    'use strict';

    // ========================================================
    // 1. STYLISH LOGGER
    // ========================================================
    var LOG = {
        prefix: '🖥️ [LOGIN-SERVER]',
        styles: {
            title: 'background: linear-gradient(90deg, #7c3aed 0%, #a855f7 100%); color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
            success: 'color: #22c55e; font-weight: bold;',
            info: 'color: #6b7280;',
            warn: 'color: #f59e0b; font-weight: bold;',
            error: 'color: #ef4444; font-weight: bold;',
            data: 'color: #8b5cf6;',
            separator: 'color: #6b7280;',
            call: 'color: #0ea5e9; font-weight: bold;',
            socket: 'color: #ec4899; font-weight: bold;'
        },
        
        _log: function(level, icon, message, data) {
            var timestamp = new Date().toISOString().substr(11, 12);
            var style = this.styles[level] || this.styles.info;
            var format = '%c' + this.prefix + ' %c[' + timestamp + '] ' + icon + ' ' + message;
            
            if (data !== undefined) {
                console.log(format + ' %o', this.styles.title, style, data);
            } else {
                console.log(format, this.styles.title, style);
            }
        },
        
        title: function(message) {
            var line = '══════════════════════════════════════════════════════';
            console.log('%c' + this.prefix + ' %c' + line, this.styles.title, this.styles.separator);
            console.log('%c' + this.prefix + ' %c' + message, this.styles.title, this.styles.title);
            console.log('%c' + this.prefix + ' %c' + line, this.styles.title, this.styles.separator);
        },
        
        success: function(message, data) { this._log('success', '✅', message, data); },
        info: function(message, data) { this._log('info', 'ℹ️', message, data); },
        warn: function(message, data) { this._log('warn', '⚠️', message, data); },
        error: function(message, data) { this._log('error', '❌', message, data); },
        data: function(message, data) { this._log('data', '📊', message, data); },
        call: function(message, data) { this._log('call', '📞', message, data); },
        socket: function(message, data) { this._log('socket', '🔌', message, data); }
    };


    // ========================================================
    // 2. CONFIGURATION
    // ========================================================
    // ⚠️ URL di sini HARUS sama persis dengan URL yang di-intercept
    // oleh file server lainnya. Perubahan di sini = perubahan
    // di 3 file lain (entergame, chat, dungeon).
    // ========================================================
    var CONFIG = {
        // Main server URL → dipakai entergame.js untuk intercept io.connect
        mainServerUrl: 'http://127.0.0.1:9998',
        
        // Chat server URL → dipakai chat-server.js untuk intercept io.connect
        chatServerUrl: 'http://127.0.0.1:9997',
        
        // Dungeon server URL → dipakai dungeon-server/start.js untuk intercept io.connect
        dungeonServerUrl: 'http://127.0.0.1:9996',
        
        // Server info
        serverId: '1',
        serverName: 'Local 1'
    };

    // ========================================================
    // 3. HELPER: Get Server Time
    // ========================================================
    function getServerTime() {
        return Date.now();
    }

    // ========================================================
    // 4. HELPER: Build Response
    // ========================================================
    // Response format WAJIB sesuai dengan yang game harapkan.
    // Game code: callback(response) → response.ret harus 0 untuk sukses.
    // ========================================================
    function buildResponse(data, compress) {
        var response = {
            ret: 0,
            data: typeof data === 'string' ? data : JSON.stringify(data),
            compress: compress === true,
            serverTime: getServerTime(),
            server0Time: 14400000
        };
        
        LOG.data('Built Response:', response);
        
        return response;
    }

    // ========================================================
    // 5. REQUEST HANDLERS
    // ========================================================
    var RequestHandlers = {
        
        /**
         * ============================================================
         * Handler: User.loginGame
         * ============================================================
         * 
         * DARI GAME CODE (clientLoginUser):
         *   var r = { type:"User", action:"loginGame",
         *            userId:e, password:t, fromChannel:n,
         *            channelName:"", headImageUrl:"",
         *            nickName:"", subChannel:getAppId(), version:"1.0" };
         *   ts.processHandlerWithLogin(r, false, callback)
         * 
         * SETELAH RESPONSE:
         *   ts.loginInfo = { userInfo: e, serverItem: t }
         *   ts.loginUserInfo.sdk = e.sdk
         *   e digunakan di: SaveHistory, GetServerList, enterGame
         *
         * ⚠️ FIELD YANG WAJIB ADA (dipakai oleh game — traced dari Hakim/main.min.js):
         *   - loginToken  → ts.loginInfo.userInfo.loginToken
         *                    dipakai di enterGame request
         *                    lalu di-update oleh SaveHistory response
         *   - userId      → ts.loginInfo.userInfo.userId
         *                    dipakai di GetServerList, enterGame, SaveHistory, SaveUserEnterInfo
         *   - channelCode → ts.loginInfo.userInfo.channelCode
         *                    dipakai di GetServerList, SaveHistory, SaveUserEnterInfo,
         *                    SDK reporting ("tc" check), battle record ("TanWanH5" check)
         *   - sdk        → ts.loginUserInfo.sdk
         *                    dipakai di saveLanguage request
         *   - nickName   → ts.loginInfo.userInfo.nickName
         *                    disimpan di loginInfo, nanti di-override oleh enterGame response
         *   - securityCode→ ts.loginInfo.userInfo.securityCode
         *                    dikirim ke SaveHistory request
         *
         * 📋 2 LOGIN PATH (Hakim):
         *   Origin: doOriginLoginRequest → clientLoginUser → processHandlerWithLogin
         *           → onLoginSuccess(e,t) → ts.loginInfo = { userInfo: e }
         *           → Handler ini DIPANGGIL ✅
         *   SDK:    sdkLoginSuccess(e) → manual destructuring ke userInfo
         *           → Handler ini TIDAK dipanggil ❌
         *
         * 📋 FIELD REQUEST (dari clientLoginUser):
         *   type, action, userId, password, fromChannel, channelName,
         *   headImageUrl, nickName:"", subChannel, version:"1.0"
         */
        loginGame: function(request) {
            LOG.title('HANDLING: loginGame');
            LOG.data('Request:', request);
            
            var sdkUser = window.LOCAL_SDK ? window.LOCAL_SDK.user : null;
            var userId = request.userId;
            
            // Server-generated fields (tidak ada di request — loginServer authority)
            var loginToken = sdkUser ? sdkUser.token : 'local_token_' + Date.now();
            var securityCode = sdkUser ? sdkUser.token : 'security_' + Date.now();
            
            // ============================================================
            // RESPONSE DATA
            // Origin path: response object disimpan WHOLESALE ke ts.loginInfo.userInfo
            // oleh onLoginSuccess(e,t) → ts.loginInfo = { userInfo: e }
            // SDK path: handler ini TIDAK dipanggil
            // ============================================================
            var responseData = {
                loginToken: loginToken,
                userId: userId,
                channelCode: 'en',
                sdk: 'local',
                nickName: sdkUser ? sdkUser.nickname : 'Player',
                securityCode: securityCode
            };
            
            LOG.success('Login successful for user:', userId);
            LOG.data('Response Data:', responseData);
            LOG.info('securityCode included → needed by SaveHistory');
            
            return buildResponse(responseData);
        },
        
        /**
         * ============================================================
         * Handler: User.GetServerList
         * ============================================================
         * 
         * DARI GAME CODE (clientRequestServerList):
         *   var a = { type:"User", action:"GetServerList",
         *              userId:e, subChannel:getAppId(),
         *              channel:t };  // t = loginGame.channelCode
         *   ts.processHandlerWithLogin(a, true, callback)
         * 
         * DARI HAR (login.pksilo.com_2026_04_01_22_14_06.har):
         *   Entry #14 POST req, Entry #12 GET resp (398 servers)
         *   Response: { serverList:[7 fields each], history:[], offlineReason:ROOT }
         *   serverList[].keys: serverId, new, online, hot, url, name, offlineReason
         *   ROOT offlineReason = "Sever offline,  please wait...." (typo "Sever" + double space)
         *   Per-server offlineReason = SAME value on ALL 398 servers
         *
         * DARI HAKIM (main.min.js) — field consumption:
         *   changeServerInfo(e):
         *     for each server: t[n].offlineReason = e.offlineReason  (ROOT overwrites per-server)
         *     n > 0 && t[n]."new" && (t[n]."new"=false, t[n].hot=true)  (only first is "new")
         *   selectNewServer(t):
         *     t.history.length → auto-select; t.history[0] → last serverId
         *     t.serverList[0].serverId → fallback if no history
         *   onLoginSuccess(e, t):
         *     ts.loginInfo = { userInfo:e, serverItem:t }  (t = single server object)
         *     t.serverId, t.name → display
         *     t.online → gate (Start button clickable)
         *     t.hot / t."new" → UI icon
         *   startBtnTap():
         *     !serverItem.online → show serverItem.offlineReason as error
         *   clientStartGame():
         *     serverItem.url → io.connect to main-server
         *
         * ⚠️ FIELD YANG WAJIB (7 per server + 2 root):
         *   Per-server: serverId, name, url, online, hot, new, offlineReason
         *   Root: serverList[], history[], offlineReason
         */
        GetServerList: function(request) {
            LOG.title('HANDLING: GetServerList');
            LOG.data('Request:', request);
            
            // HAR: "Sever offline,  please wait...." (exact value from real server)
            var offlineReason = 'Sever offline,  please wait....';
            
            // Build server list
            // url HARUS sama dengan mainServerUrl agar entergame.js bisa intercept
            // 7 fields per server — sesuai HAR schema
            var serverList = [{
                serverId: String(CONFIG.serverId),
                name: CONFIG.serverName,
                url: CONFIG.mainServerUrl,
                online: true,
                hot: false,
                "new": true,
                offlineReason: offlineReason
            }];
            
            var responseData = {
                serverList: serverList,
                history: [],
                offlineReason: offlineReason
            };
            
            LOG.success('Returning server list');
            LOG.info('Server URL:', CONFIG.mainServerUrl, '→ must match entergame.js intercept');
            LOG.data('Response Data:', responseData);
            
            return buildResponse(responseData);
        },
        
        /**
         * ============================================================
         * Handler: User.SaveHistory
         * ============================================================
         * 
         * DARI GAME CODE (startBtnTap):
         *   var n = { type:"User", action:"SaveHistory",
         *            accountToken: ts.loginInfo.userInfo.userId,
         *            channelCode: ts.loginInfo.userInfo.channelCode,
         *            serverId: ts.loginInfo.serverItem.serverId,
         *            securityCode: ts.loginInfo.userInfo.securityCode,
         *            subChannel: getAppId(), version:"1.0" };
         *   ts.processHandlerWithLogin(n, true, callback, callback)
         *   // callback = callback for BOTH success AND failure
         * 
         * SETELAH RESPONSE (Hakim — startBtnTap callback):
         *   e && e.loginToken && (ts.loginInfo.userInfo.loginToken = e.loginToken)
         *   ts.clientStartGame(false) → clientEnterGame → enterGame request
         *   var t = e.todayLoginCount;
         *   4 === t → analytics blackStoneLoginCount4
         *   6 === t → analytics blackStoneLoginCount6
         *
         * DARI HAR (login.pksilo.com_2026_04_01_22_14_06.har):
         *   Entry #11 POST req, Entry #10 GET resp
         *   Response (parsed): { loginToken: "155c22cff25423fd1e133e73a9bde1a7" }
         *   HANYA 1 field — tidak ada todayLoginCount di HAR
         *   loginToken BERBEDA dari loginGame token (real server generates fresh)
         *
         * ⚠️ FIELD YANG WAJIB (Kamus + Hakim):
         *   - loginToken → OVERRIDE ts.loginInfo.userInfo.loginToken
         *                 ini token BARU untuk enterGame request
         *                 HAR: nilainya BERBEDA dari loginGame token
         *   - todayLoginCount → analytics only (tidak di HAR)
         *                 Hakim baca tapi undefined = no analytics, game tetap jalan
         */
        SaveHistory: function(request) {
            LOG.title('HANDLING: SaveHistory');
            LOG.data('Request:', request);
            LOG.data('  accountToken:', request.accountToken);
            LOG.data('  channelCode:', request.channelCode);
            LOG.data('  serverId:', request.serverId);
            LOG.data('  securityCode:', request.securityCode);
            
            // HAR: loginGame token ≠ SaveHistory token (server generates fresh)
            // Mock: selalu generate fresh token (berbeda dari loginGame)
            var loginToken = 'local_token_' + Date.now();
            
            var responseData = {
                loginToken: loginToken,
                todayLoginCount: 1
            };
            
            LOG.success('History saved (mocked)');
            LOG.data('loginToken (fresh):', loginToken);
            LOG.data('todayLoginCount:', responseData.todayLoginCount, '(analytics only, not in HAR)');
            
            return buildResponse(responseData);
        },
        
        /**
         * ============================================================
         * Handler: User.SaveLanguage
         * ============================================================
         * 
         * DARI GAME CODE (TSUIController.saveLanguage):
         *   var r = { type:"User", action:"SaveLanguage",
         *             userid: ts.loginUserInfo.userId,  // LOWERCASE!
         *             sdk: ts.loginUserInfo.sdk,
         *             appid: getAppId(), language: lang };
         *   ts.processHandlerWithLogin(r, true, successCb, errorCb)
         * 
         * SETELAH RESPONSE — 2 field dibaca oleh client:
         *   1. processHandlerWithLogin: a.language → ts.language = a.language
         *      → ts.language = GLOBAL language state, dipakai ToolCommon.getLanguage()
         *      → jika language tidak ada di response, ts.language TIDAK di-update!
         *   2. successCb: t.errorCode → 0 === t.errorCode
         *      → 0: native SDK changeLanguage (TSBrowser.executeFunction)
         *      → !0: fallback window.changeLanguage (tetap ganti bahasa)
         * 
         * ⚠️ TIDAK ADA DI HAR (SaveLanguage tidak tercapture)
         * ⚠️ PERHATIAN: Field request-nya "userid" (lowercase!) bukan "userId"
         * 
         * ⚠️ FIELD YANG WAJIB (Hakim):
         *   - language → echo dari request.language
         *               processHandlerWithLogin baca ini → set ts.language
         *               TANPA ini, ts.language TIDAK update → i18n rusak!
         *   - errorCode → 0 = sukses
         */
        SaveLanguage: function(request) {
            LOG.title('HANDLING: SaveLanguage');
            LOG.data('Request:', request);
            
            var responseData = {
                language: request.language,
                errorCode: 0
            };
            
            LOG.success('Language saved:', request.language);
            
            return buildResponse(responseData);
        },
        
        /**
         * ============================================================
         * Handler: User.SaveUserEnterInfo
         * ============================================================
         * 
         * DARI GAME CODE (reportToLoginEnterInfo — called from clientEnterGame):
         *   var n = { type:"User", action:"SaveUserEnterInfo",
         *            accountToken: ts.loginInfo.userInfo.userId,
         *            channelCode: ts.loginInfo.userInfo.channelCode,
         *            subChannel: getAppId(),
         *            createTime: UserInfoSingleton.createTime,
         *            userLevel: UserInfoSingleton.getUserLevel(),
         *            version:"1.0" };
         *   var o = function() { ts.loginClient.destroy() };
         *   ts.processHandlerWithLogin(n, true, o, o)
         *   // success callback = error callback = HAPUS loginClient
         *
         * DARI HAR (login.pksilo.com_2026_04_01_22_14_06.har):
         *   2 entries (Session 1: userLevel=21, Session 2: userLevel=1)
         *   Response: "ok" (Socket.IO POST acknowledgement)
         *   Response data sebenarnya (GET polling) TIDAK tercapture
         *
         * DARI HAKIM (main.min.js):
         *   Callback: function() { ts.loginClient.destroy() }
         *   - Menerima parsed response → 100% IGNORED
         *   - success = error = fungsi SAMA (hanya destroy loginClient)
         *   - ZERO response fields dibaca oleh callback
         *   - Hanya perlu ret:0 agar processHandlerWithLogin panggil success path
         *
         * SIDE EFFECT (processHandlerWithLogin):
         *   a.language && (ts.language = a.language) → jalan untuk SETIAP response
         *   Mock tidak include language → side effect tidak trigger
         *
         * ⚠️ STATUS: FIRE-AND-FORGET — response content tidak dipakai oleh game
         */
        SaveUserEnterInfo: function(request) {
            LOG.title('HANDLING: SaveUserEnterInfo');
            LOG.data('Request:', request);
            LOG.data('  accountToken:', request.accountToken);
            LOG.data('  channelCode:', request.channelCode);
            LOG.data('  userLevel:', request.userLevel);
            LOG.data('  createTime:', request.createTime);
            
            var responseData = {
                errorCode: 0
            };
            
            LOG.success('User enter info saved (fire-and-forget — callback destroys loginClient)');
            
            return buildResponse(responseData);
        },

        /**
         * ============================================================
         * Handler: User.LoginAnnounce
         * ============================================================
         * 
         * DARI GAME CODE (getNotice — called from doOriginLoginRequest & sdkLoginSuccess):
         *   var t = { type:"User", action:"LoginAnnounce" };
         *   ts.processHandlerWithLogin(t, true, callback)
         *
         * SETELAH RESPONSE (Hakim — getNotice callback):
         *   var r = t.data;
         *   for (var i in r) {                  // iterates over data
         *       r[i].text[n]   || "";           // localized body text (keyed by lang)
         *       r[i].title[n]  || "";           // localized title text (keyed by lang)
         *       r[i].version;                   // version string
         *       r[i].orderNo;                   // sort order number
         *       r[i].alwaysPopup && (o=true);   // auto-open panel flag
         *       e.notice[i] = { bulletin, bulletinVersion, bulletinTitle, order }
         *   }
         *   e.noticeBtn.visible = a;            // show/hide notice button
         *   o && e.noticeBtnTap();              // auto-open if alwaysPopup
         *
         * DARI HAR (login.pksilo.com_2026_04_01_22_14_06.har):
         *   Entry #9 POST req: {type:"User", action:"LoginAnnounce"}
         *   Entry #8 GET resp: {ret:0, data:"[]"}
         *   Inner data = [] (EMPTY ARRAY — bukan empty object!)
         *
         * ⚠️ FIELD YANG WAJIB (Kamus + Hakim):
         *   - data → ARRAY of announcement objects (bisa kosong [])
         *     PER ITEM: text{lang:text}, title{lang:text}, version, orderNo, alwaysPopup?
         *     HAR: [] (empty array, no announcements)
         *
         * ⚠️ TIPE DATA: HAR = array [] BUKAN object {}
         *   for...in aman untuk keduanya, tapi HAR=Kamus → wajib array
         */
        LoginAnnounce: function(request) {
            LOG.title('HANDLING: LoginAnnounce');
            LOG.data('Request:', request);
            
            var responseData = {
                data: []
            };
            
            LOG.success('Returning empty announcements (array per HAR)');
            
            return buildResponse(responseData);
        }
    };

    // ========================================================
    // 6. MOCK SOCKET CLASS
    // ========================================================
    function MockSocket(serverUrl) {
        var self = this;
        
        self.url = serverUrl;
        self.connected = true;
        self.eventListeners = {};
        self.id = 'mock_socket_' + Date.now();
        
        LOG.socket('─────────────────────────────────────────');
        LOG.socket('MockSocket created');
        LOG.socket('URL:', serverUrl);
        LOG.socket('Socket ID:', self.id);
        LOG.socket('─────────────────────────────────────────');
        
        // Auto-trigger connect event after short delay
        setTimeout(function() {
            self._trigger('connect');
        }, 10);
    }
    
    MockSocket.prototype = {
        
        on: function(event, callback) {
            LOG.socket('ON() Event: ' + event);
            
            if (!this.eventListeners[event]) {
                this.eventListeners[event] = [];
            }
            this.eventListeners[event].push(callback);
            
            // If connect event and already "connected", trigger immediately
            if (event === 'connect' && this.connected) {
                var self = this;
                setTimeout(function() {
                    LOG.socket('Auto-triggering connect event');
                    callback();
                }, 5);
            }
        },
        
        off: function(event) {
            LOG.socket('OFF() Event: ' + event);
            this.eventListeners[event] = [];
        },
        
        emit: function(event, data, callback) {
            var self = this;
            
            LOG.socket('─────────────────────────────────────────');
            LOG.socket('EMIT() Event: ' + event);
            
            if (event === 'handler.process') {
                LOG.data('Request Data:', data);
                self._handleRequest(data, callback);
            } else if (event === 'verify') {
                LOG.socket('Verify event - returning success');
                if (callback) {
                    callback({ ret: 0 });
                }
            } else {
                LOG.warn('Unknown emit event: ' + event);
                if (callback) {
                    callback({ ret: 0 });
                }
            }
        },
        
        _handleRequest: function(request, callback) {
            var self = this;
            
            LOG.info('─────────────────────────────────────────');
            LOG.info('Processing request...');
            LOG.data('Type:', request.type);
            LOG.data('Action:', request.action);
            
            // Get handler based on action
            var handler = RequestHandlers[request.action];
            
            if (handler) {
                var response = handler(request);
                
                LOG.success('Handler executed: ' + request.action);
                
                if (callback) {
                    setTimeout(function() {
                        LOG.socket('Calling callback with response');
                        callback(response);
                    }, 10);
                }
            } else {
                // ============================================================
                // FALLBACK: Unknown handler
                // Return { ret: 0 } supaya game tidak crash
                // ============================================================
                LOG.warn('⚠️ No handler for action: ' + request.action);
                LOG.info('  type: ' + request.type + ' | action: ' + request.action);
                LOG.info('  Available: loginGame, GetServerList, SaveHistory, SaveLanguage, SaveUserEnterInfo, LoginAnnounce');
                LOG.data('Full request:', request);
                
                if (callback) {
                    callback(buildResponse({ success: true }));
                }
            }
        },
        
        _trigger: function(event, data) {
            LOG.socket('TRIGGER() Event: ' + event);
            
            var listeners = this.eventListeners[event];
            if (listeners) {
                for (var i = 0; i < listeners.length; i++) {
                    try {
                        listeners[i](data);
                    } catch (e) {
                        LOG.error('Error in listener: ' + e.message);
                    }
                }
            }
        },
        
        destroy: function() {
            LOG.socket('Socket destroyed: ' + this.id);
            this.connected = false;
            this.eventListeners = {};
        },
        
        connect: function() {
            LOG.socket('Socket connect() called');
            this.connected = true;
            this._trigger('connect');
        },
        
        disconnect: function() {
            LOG.socket('Socket disconnect() called');
            this.connected = false;
            this._trigger('disconnect');
        }
    };

    // ========================================================
    // 7. INTERCEPT io.connect()
    // ========================================================
    function interceptSocketIO() {
        if (typeof window.io === 'undefined') {
            LOG.error('Socket.IO not found! Make sure socket.io.min.js is loaded before login-server.js');
            return;
        }
        
        var originalConnect = window.io.connect;
        
        if (!originalConnect) {
            LOG.error('io.connect not found!');
            return;
        }
        
        LOG.title('Intercepting io.connect()');
        
        window.io.connect = function(url, options) {
            LOG.socket('═══════════════════════════════════════════════');
            LOG.socket('io.connect() called');
            LOG.socket('URL:', url);
            LOG.socket('Options:', options);
            
            // Check if this is login-server URL
            var isLoginServer = false;
            
            // Check from SDK config
            var loginServerUrl = window.LOCAL_SDK ? window.LOCAL_SDK.config.loginServer : null;
            
            if (loginServerUrl && url.indexOf(loginServerUrl) !== -1) {
                isLoginServer = true;
            }
            
            // Also check by port
            if (url.indexOf('9999') !== -1 || 
                url.indexOf('login') !== -1 ||
                url.indexOf('127.0.0.1:9999') !== -1 ||
                url.indexOf('localhost:9999') !== -1) {
                isLoginServer = true;
            }
            
            if (isLoginServer) {
                LOG.success('✅ LOGIN-SERVER DETECTED - Using MockSocket');
                LOG.socket('═════════════════════════════════════════════');
                return new MockSocket(url);
            } else {
                LOG.info('⏩ Not login-server, using original io.connect');
                LOG.socket('═════════════════════════════════════════════');
                return originalConnect.call(window.io, url, options);
            }
        };
        
        LOG.success('io.connect() intercepted successfully!');
    }

    // ========================================================
    // 8. INITIALIZE
    // ========================================================
    function init() {
        LOG.title('Login-Server Mock v2.3.0 Initialized');
        LOG.info('Login Server URL:', window.LOCAL_SDK ? window.LOCAL_SDK.config.loginServer : 'N/A');
        LOG.info('Main Server URL:', CONFIG.mainServerUrl);
        LOG.info('Chat Server URL:', CONFIG.chatServerUrl);
        LOG.info('Dungeon Server URL:', CONFIG.dungeonServerUrl);
        LOG.info('Server ID:', CONFIG.serverId);
        LOG.info('Server Name:', CONFIG.serverName);
        LOG.info('');
        LOG.info('💡 Handlers & data flow:');
        LOG.info('   loginGame → loginToken, userId, channelCode, sdk, nickName, securityCode');
        LOG.info('              ↓ (securityCode disimpan ke userInfo)');
        LOG.info('   GetServerList → serverList[].url = mainServerUrl');
        LOG.info('   SaveHistory ← securityCode dari loginGame userInfo');
        LOG.info('              → loginToken (override), todayLoginCount');
        
        interceptSocketIO();
    }

    // ========================================================
    // 9. EXPORT FOR DEBUGGING
    // ========================================================
    window.LOGIN_SERVER_MOCK = {
        config: CONFIG,
        handlers: RequestHandlers,
        MockSocket: MockSocket,
        
        showConfig: function() {
            LOG.title('Login-Server Config');
            LOG.data('mainServerUrl:', CONFIG.mainServerUrl);
            LOG.data('chatServerUrl:', CONFIG.chatServerUrl);
            LOG.data('dungeonServerUrl:', CONFIG.dungeonServerUrl);
            LOG.data('serverId:', CONFIG.serverId);
            LOG.data('serverName:', CONFIG.serverName);
        }
    };

    // ========================================================
    // 10. START
    // ========================================================
    if (typeof window.io !== 'undefined') {
        init();
    } else {
        var checkInterval = setInterval(function() {
            if (typeof window.io !== 'undefined') {
                clearInterval(checkInterval);
                init();
            }
        }, 50);
        
        setTimeout(function() {
            clearInterval(checkInterval);
            if (typeof window.io === 'undefined') {
                LOG.error('Timeout waiting for Socket.IO to load!');
            }
        }, 5000);
    }

})(window);
