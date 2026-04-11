/**
 * ================================================================
 *  PPGAME SDK — Client Side  (Super Warrior Z / 超级战士Z)
 * ================================================================
 *
 *  SDK ini berperan sebagai PPGAME SDK yang asli.
 *  Dipanggil oleh game via TSBrowser.executeFunction() dan
 *  TSBrowser.getVariantValue() — keduanya membaca dari window[].
 *
 *  CARA PAKAI:
 *    Di index.html, tambahkan SEBELUM script lainnya:
 *    <script src="sdk/sdk.js"></script>
 *
 *  PENTING:
 *    - sdk.js HARUS load SEBELUM game code (main.min.js)
 *    - sdk.js harus load SEBELUM inline script di index.html baris 189+
 *      supaya window.PPGAME sudah ada saat if(window.PPGAME) dicek
 *    - Order: sdk.js → jszip → inline-boot → inline-sdk-bridge
 *    - Kalau sdk.js load setelah inline-sdk-bridge, bridge tidak aktif
 *      SOLUSI: sdk.js juga override fungsi bridge sendiri (fallback)
 *
 *  PRINSIP:
 *    - Tidak ada bypass — setiap fungsi bekerja sesuai harapan game
 *    - Menyediakan apa yang game butuhkan dari SDK
 *    - Jika fungsi tidak berjalan, game error silent (tanpa pesan)
 */

(function () {
    "use strict";

    // ============================================================
    //  Konfigurasi
    // ============================================================
    var SDK_VERSION = "3.0.0";
    var SDK_SERVER = window.location.protocol + "//" + window.location.hostname + ":9999";
    var APP_ID = "ppgame";

    // ============================================================
    //  Game Server Configuration — Multi-Server Architecture
    //  Login Server  :8000 — Authentication & character selection
    //  Main Server   :8001 — Core gameplay (after login)
    //  Chat Server   :8002 — Real-time chat & social
    //  Dungeon Server:8003 — Dungeon & raid instances
    // ============================================================
    var GAME_SERVERS = {
        login:   "http://127.0.0.1:8000",
        main:    "http://127.0.0.1:8001",
        chat:    "http://127.0.0.1:8002",
        dungeon: "http://127.0.0.1:8003"
    };
    var GAME_SERVER_DEFAULT = GAME_SERVERS.login;  // Entry point = Login Server

    // Payment callback timeout (berapa lama menunggu konfirmasi)
    var PAYMENT_CALLBACK_TIMEOUT = 30000; // 30 detik

    // ============================================================
    //  Helpers — paling awal supaya semua fungsi bisa pakai
    // ============================================================

    /** Baca dari localStorage, parse JSON, fallback ke defaultVal */
    function _storageGet(key, defaultVal) {
        try {
            var val = localStorage.getItem(key);
            return val !== null ? JSON.parse(val) : defaultVal;
        } catch (e) {
            return defaultVal;
        }
    }

    /** Simpan ke localStorage sebagai JSON */
    function _storageSet(key, val) {
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) {
            console.error("[PPGAME] localStorage error:", e);
        }
    }

    /** HTTP POST ke SDK server */
    function _httpPost(path, data, callback, errorCallback) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", SDK_SERVER + path, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        if (_state.loginToken) {
            xhr.setRequestHeader("Authorization", "Bearer " + _state.loginToken);
        }
        xhr.timeout = 8000;
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        callback && callback(JSON.parse(xhr.responseText));
                    } catch (e) {
                        errorCallback && errorCallback(e);
                    }
                } else {
                    errorCallback && errorCallback({ status: xhr.status, response: xhr.responseText });
                }
            }
        };
        xhr.ontimeout = function () {
            console.warn("[PPGAME] POST timeout:", path);
            errorCallback && errorCallback("timeout");
        };
        xhr.send(JSON.stringify(data));
    }

    /** HTTP GET ke SDK server */
    function _httpGet(path, callback, errorCallback) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", SDK_SERVER + path, true);
        if (_state.loginToken) {
            xhr.setRequestHeader("Authorization", "Bearer " + _state.loginToken);
        }
        xhr.timeout = 8000;
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        callback && callback(JSON.parse(xhr.responseText));
                    } catch (e) {
                        errorCallback && errorCallback(e);
                    }
                } else {
                    errorCallback && errorCallback({ status: xhr.status, response: xhr.responseText });
                }
            }
        };
        xhr.ontimeout = function () {
            console.warn("[PPGAME] GET timeout:", path);
            errorCallback && errorCallback("timeout");
        };
        xhr.send();
    }

    /** Parse URL query string jadi object */
    function _parseUrlParams() {
        var params = {};
        try {
            var search = location.search.substring(1);
            if (!search) return params;
            var pairs = search.split("&");
            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i].split("=");
                if (pair.length === 2) {
                    params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
                }
            }
        } catch (e) {}
        return params;
    }

    /** Generate simple unique ID (tanpa crypto) */
    function _simpleUID() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    }

    /** Safe JSON parse — tidak crash jika string malformed */
    function _safeJsonParse(str, fallback) {
        if (typeof str !== "string") return str;
        try {
            return JSON.parse(str);
        } catch (e) {
            console.warn("[PPGAME] JSON parse error:", e.message);
            return fallback || str;
        }
    }

    // ============================================================
    //  State Management
    // ============================================================
    var _state = _storageGet("ppgame_state", {
        userId: null,
        nickname: null,
        loginToken: null,
        sdk: null,
        serverId: null,
        serverName: null,
        characterId: null,
        characterName: null,
        characterLevel: 1,
        sessionId: null,
        lastLoginTime: null,
        gameServerUrl: null,
        mainServerUrl: null,
        chatServerUrl: null,
        dungeonServerUrl: null
    });

    // Pending payment callbacks — { orderId: { callback, timeout } }
    var _paymentCallbacks = {};

    function _saveState() {
        _storageSet("ppgame_state", _state);
    }

    function _isLoggedIn() {
        return !!(_state.userId && _state.loginToken);
    }

    function _clearLogin() {
        // Panggil logout callback jika ada
        if (typeof window._ppgameLogoutCallback === "function") {
            try {
                window._ppgameLogoutCallback("logout");
            } catch (e) {
                console.warn("[PPGAME] Logout callback error:", e);
            }
        }
        _state.userId = null;
        _state.nickname = null;
        _state.loginToken = null;
        _state.sdk = null;
        _state.sessionId = null;
        _state.lastLoginTime = null;
        _saveState();
    }

    function _setLogin(info) {
        _state.userId = info.userId;
        _state.nickname = info.nickname || ("Player_" + info.userId.slice(0, 6));
        _state.loginToken = info.loginToken;
        _state.sdk = info.sdk || "ppgame";
        _state.sessionId = _simpleUID();
        _state.lastLoginTime = Date.now();
        if (info.gameServerUrl) {
            _state.gameServerUrl = info.gameServerUrl;
        }
        _saveState();
    }

    // ============================================================
    //  Baca URL params untuk auto-login
    // ============================================================
    var _urlParams = _parseUrlParams();
    if (_urlParams.sdk && _urlParams.logintoken && _urlParams.nickname && _urlParams.userid) {
        _setLogin({
            userId: _urlParams.userid,
            nickname: _urlParams.nickname,
            loginToken: _urlParams.logintoken,
            sdk: _urlParams.sdk
        });
        console.log("[PPGAME] Auto-login dari URL params, userId:", _urlParams.userid);
    }

    // ============================================================
    //  window.PPGAME — Object utama yang dicek index.html
    //  if(window.PPGAME) { paySdk = function(a) { PPGAME.createPaymentOrder(a) } ... }
    // ============================================================
    window.PPGAME = {

        /**
         * Buat order pembayaran.
         * Dipanggil oleh index.html: paySdk(a) → PPGAME.createPaymentOrder(a)
         *
         * Game mengirim orderData dengan field:
         *   goodsId / productId  — ID produk
         *   goodsName / productName — Nama produk
         *   price / amount       — Harga
         *   currency             — Mata uang (USD, dll)
         *   serverId             — ID server
         *   roleId               — ID karakter
         *   roleName             — Nama karakter
         *   orderNo              — Nomor order dari game
         *   ext                  — Data tambahan
         *
         * @param {object} orderData - Data order dari game
         */
        createPaymentOrder: function (orderData) {
            console.log("[PPGAME] createPaymentOrder:", JSON.stringify(orderData));

            // Tampilkan UI payment processing
            _showPaymentProcessing(orderData);

            _httpPost("/api/payment/create", {
                order: orderData,
                userId: _state.userId,
                serverId: _state.serverId,
                characterId: _state.characterId,
                characterName: _state.characterName
            }, function (res) {
                console.log("[PPGAME] Payment order created:", res);

                if (res && res.orderId) {
                    // Simpan callback untuk payment ini
                    // Game mungkin mengharapkan notifikasi saat payment selesai
                    _paymentCallbacks[res.orderId] = {
                        orderData: orderData,
                        createTime: Date.now()
                    };

                    // Poll payment status secara berkala
                    _pollPaymentStatus(res.orderId, orderData);
                }
            }, function (err) {
                console.error("[PPGAME] Payment error:", err);
                _showPaymentResult(false, "Payment gagal. Coba lagi.");
            });
        },

        /**
         * Game sudah siap (loading selesai).
         * Dipanggil oleh index.html: gameReady() → PPGAME.gameReady()
         */
        gameReady: function () {
            console.log("[PPGAME] gameReady — game loaded successfully");
            _httpPost("/api/event", {
                event: "game_ready",
                userId: _state.userId,
                data: {
                    version: SDK_VERSION,
                    timestamp: Date.now(),
                    userId: _state.userId,
                    nickname: _state.nickname
                }
            });

            // Sembunyikan tombol Guest kalau ada
            var guestBtn = document.getElementById("ppgame-guest-btn");
            if (guestBtn) {
                guestBtn.style.display = "none";
            }

            // Sembunyikan login overlay kalau ada
            var overlay = document.getElementById("ppgame-login-overlay");
            if (overlay) {
                overlay.style.display = "none";
            }
        },

        /**
         * Player masuk ke server game.
         * Dipanggil oleh report2Sdk() saat dataType == 3:
         *   PPGAME.playerEnterServer({characterName, characterId, serverId, serverName})
         */
        playerEnterServer: function (info) {
            console.log("[PPGAME] playerEnterServer:", JSON.stringify(info));
            if (info) {
                _state.serverId = info.serverId || _state.serverId;
                _state.serverName = info.serverName || _state.serverName;
                _state.characterId = info.characterId || info.characterid || _state.characterId;
                _state.characterName = info.characterName || info.charactername || _state.characterName;
                _saveState();
            }
            _httpPost("/api/event", {
                event: "enter_server",
                userId: _state.userId,
                data: {
                    characterName: _state.characterName,
                    characterId: _state.characterId,
                    serverId: _state.serverId,
                    serverName: _state.serverName,
                    timestamp: Date.now()
                }
            });
        },

        /**
         * Submit event generic.
         * Dipanggil oleh report2Sdk() saat dataType == 2 (create role),
         * dan oleh tutorialFinish():
         *   PPGAME.submitEvent("game_create_role", {...})
         *   PPGAME.submitEvent("game_tutorial_finish")
         */
        submitEvent: function (eventName, data) {
            console.log("[PPGAME] submitEvent:", eventName, data ? JSON.stringify(data) : "");
            _httpPost("/api/event", {
                event: eventName,
                userId: _state.userId,
                data: data || {}
            });
        },

        /**
         * Chapter selesai.
         * Dipanggil oleh: gameChapterFinish(a) → PPGAME.gameChapterFinish(a)
         */
        gameChapterFinish: function (data) {
            console.log("[PPGAME] gameChapterFinish:", JSON.stringify(data));
            _httpPost("/api/event", {
                event: "chapter_finish",
                userId: _state.userId,
                data: data || {}
            });
        },

        /**
         * Buka shop.
         * Dipanggil oleh: openShopPage() → PPGAME.openShopPage()
         */
        openShopPage: function () {
            console.log("[PPGAME] openShopPage");
            _httpPost("/api/event", {
                event: "open_shop",
                userId: _state.userId,
                data: {
                    characterId: _state.characterId,
                    characterLevel: _state.characterLevel,
                    serverId: _state.serverId
                }
            });
        },

        /**
         * Level naik.
         * Dipanggil oleh: gameLevelUp(a) → PPGAME.gameLevelUp(a)
         */
        gameLevelUp: function (data) {
            console.log("[PPGAME] gameLevelUp:", JSON.stringify(data));
            if (data && data.level) {
                _state.characterLevel = data.level;
                _saveState();
            }
            _httpPost("/api/event", {
                event: "level_up",
                userId: _state.userId,
                data: data || {}
            });
        }
    };

    // ============================================================
    //  PAYMENT POLLING — Cek status payment secara berkala
    //  Mengganti timeout blind yang bisa false-positive di live mode
    // ============================================================

    /**
     * Poll payment status dari SDK server.
     * Cek setiap 1 detik, maksimal PAYMENT_CALLBACK_TIMEOUT.
     * Hanya trigger callback saat status benar-benar "completed".
     */
    function _pollPaymentStatus(orderId, orderData) {
        var startTime = Date.now();
        var pollInterval = 1000; // Cek setiap 1 detik
        var maxWait = PAYMENT_CALLBACK_TIMEOUT;

        var pollTimer = setInterval(function () {
            var elapsed = Date.now() - startTime;

            // Timeout — payment belum selesai
            if (elapsed > maxWait) {
                clearInterval(pollTimer);
                delete _paymentCallbacks[orderId];
                console.warn("[PPGAME] Payment polling timeout:", orderId);
                _showPaymentResult(false, "Payment timeout. Coba lagi.");
                return;
            }

            // Cek status ke server
            _httpGet("/api/payment/verify/" + orderId, function (res) {
                if (res && res.status === "completed") {
                    clearInterval(pollTimer);
                    _onPaymentComplete(orderId, orderData);
                } else if (res && res.status === "failed") {
                    clearInterval(pollTimer);
                    delete _paymentCallbacks[orderId];
                    _showPaymentResult(false, "Payment gagal.");
                }
                // Jika masih "pending", lanjut polling
            }, function () {
                // Error saat polling — lanjut coba lagi
            });
        }, pollInterval);
    }

    // ============================================================
    //  PAYMENT CALLBACK — Notifikasi ke game saat payment selesai
    // ============================================================

    /**
     * Dipanggil saat payment selesai (diverifikasi dari server).
     * Game mungkin mengharapkan callback melalui fungsi global.
     */
    function _onPaymentComplete(orderId, orderData) {
        // Hapus dari pending
        var callback = _paymentCallbacks[orderId];
        delete _paymentCallbacks[orderId];

        console.log("[PPGAME] Payment complete for order:", orderId);

        // Tampilkan UI sukses
        var productName = orderData.goodsName || orderData.productName || "Item";
        _showPaymentResult(true, productName + " berhasil dibeli!");

        // Game mungkin mendaftarkan callback global
        // Format umum: window.onPayResult atau window.paySdkCallback
        if (typeof window.onPayResult === "function") {
            try {
                window.onPayResult({ orderId: orderId, status: "completed", orderData: orderData });
            } catch (e) {
                console.warn("[PPGAME] onPayResult callback error:", e);
            }
        }

        if (typeof window.paySdkCallback === "function") {
            try {
                window.paySdkCallback({ orderId: orderId, status: "completed", orderData: orderData });
            } catch (e) {
                console.warn("[PPGAME] paySdkCallback error:", e);
            }
        }

        // Kirim event ke SDK server
        _httpPost("/api/event", {
            event: "payment_callback_sent",
            userId: _state.userId,
            data: { orderId: orderId }
        });
    }

    // ============================================================
    //  FUNGSI BRIDGE — Override index.html functions
    //
    //  index.html mendefinisikan fungsi-fungsi ini di inline script
    //  BAGIAN PALING BAWAH (setelah game boot). Tapi karena sdk.js
    //  load SEBELUM inline script, kita SET dulu. Lalu inline script
    //  menimpa dengan versinya sendiri (yang delegate ke PPGAME).
    //
    //  Namun untuk amannya (kalau load order beda), kita juga
    //  memastikan fungsi ini ada SETELAH DOM ready.
    // ============================================================

    /**
     * checkSDK() — dipanggil game untuk cek apakah SDK aktif.
     * index.html sudah define: return true. Kita pastikan true.
     */
    // (tidak perlu override, index.html sudah return true)

    /**
     * getSdkLoginInfo() — CRITICAL!
     * Dipanggil oleh TSBrowser.executeFunction("getSdkLoginInfo")
     * dan juga oleh index.html.
     *
     * index.html versi asli cuma baca URL params.
     * Kita override supaya juga baca dari localStorage
     * (untuk Guest login yang tidak reload dengan URL params).
     *
     * Return format: { sdk, loginToken, nickName, userId } atau null
     * PERHATIAN: key "nickName" (dengan N besar) — bukan "nickname"
     */
    // Flag: URL params sudah di-consume saat boot
    // Supaya getSdkLoginInfo() tidak re-read URL params terus-menerus
    // (kalau re-read, bisa overwrite token baru dari init callback dengan token lama dari URL)
    var _urlParamsConsumed = false;

    window.getSdkLoginInfo = function () {
        // 1. Cek state dulu (sudah termasuk data dari URL params + init callback)
        //    Ini PRIORITAS karena state bisa sudah di-update oleh init callback
        //    dengan token baru, sementara URL params masih punya token lama.
        if (_state.userId && _state.loginToken) {
            var info = {
                sdk: _state.sdk || "ppgame",
                loginToken: _state.loginToken,
                nickName: _state.nickname || ("Player_" + _state.userId.slice(0, 6)),  // N besar
                userId: _state.userId
            };
            console.log("[PPGAME] getSdkLoginInfo -> dari state:", info.userId);
            _urlParamsConsumed = true;  // Setelah state ada, URL params tidak relevan lagi
            return info;
        }

        // 2. Fallback: Cek URL params (hanya jika belum ada state)
        //    Ini untuk kasus dimana state belum di-set (misal localStorage di-clear)
        //    tapi URL params masih ada dari redirect.
        if (!_urlParamsConsumed) {
            var params = _parseUrlParams();
            if (params.sdk && params.logintoken && params.nickname && params.userid) {
                var info = {
                    sdk: params.sdk,
                    loginToken: params.logintoken,
                    nickName: params.nickname,  // N besar — format yang game harapkan
                    userId: params.userid
                };
                // Sync ke state
                _setLogin({
                    userId: params.userid,
                    nickname: params.nickname,
                    loginToken: params.logintoken,
                    sdk: params.sdk
                });
                _urlParamsConsumed = true;
                console.log("[PPGAME] getSdkLoginInfo -> dari URL (fallback):", info.userId);
                return info;
            }
        }

        // 3. Tidak ada login info
        console.log("[PPGAME] getSdkLoginInfo -> null (belum login)");
        return null;
    };

    // ============================================================
    //  FUNGSI WINDOW — dipanggil TSBrowser.executeFunction()
    //  yang TIDAK ada di index.html bridge
    // ============================================================

    /**
     * checkFromNative — Cek apakah app berjalan di native wrapper.
     * Return false = browser mode.
     * Game menggunakan ini untuk menentukan UI behavior.
     */
    window.checkFromNative = function () {
        return false;
    };

    /**
     * switchAccount — Ganti akun.
     * Tampilkan dialog pilih akun atau buat baru.
     * PENTING: Panggil logout callback SEBELUM switch.
     */
    window.switchAccount = function () {
        console.log("[PPGAME] switchAccount");

        // Panggil logout callback dulu supaya game bersihkan state
        if (typeof window._ppgameLogoutCallback === "function") {
            try {
                window._ppgameLogoutCallback("switch");
            } catch (e) {
                console.warn("[PPGAME] Logout callback error on switch:", e);
            }
        }

        // Logout dari SDK server
        _httpPost("/api/account/logout", {
            userId: _state.userId,
            loginToken: _state.loginToken
        });

        // Clear local state setelah logout server
        _clearLogin();

        _showAccountSwitchUI();
    };

    /**
     * getAppId — Return app ID untuk SDK.
     * Game menggunakan ini untuk identifikasi aplikasi.
     */
    window.APP_ID = APP_ID;
    window.getAppId = function () {
        return APP_ID;
    };

    /**
     * getLoginServer — Return URL game server.
     * Game pakai ini untuk koneksi Socket.IO.
     * Baca dari SDK server settings supaya dinamis.
     */
    window.getLoginServer = function () {
        // Prioritas: state > default
        // Returns Login Server URL (entry point for Socket.IO connection)
        return _state.gameServerUrl || GAME_SERVER_DEFAULT;
    };

    /**
     * getMainServer — Return Main Server URL.
     * Game connects here after Login Server authentication.
     * Core gameplay, hero management, items, etc.
     */
    window.getMainServer = function () {
        return _state.mainServerUrl || GAME_SERVERS.main;
    };

    /**
     * getChatServer — Return Chat Server URL.
     * Real-time chat, guild chat, world chat.
     */
    window.getChatServer = function () {
        return _state.chatServerUrl || GAME_SERVERS.chat;
    };

    /**
     * getDungeonServer — Return Dungeon Server URL.
     * Team dungeons, raids, boss fights.
     */
    window.getDungeonServer = function () {
        return _state.dungeonServerUrl || GAME_SERVERS.dungeon;
    };

    /**
     * changeLanguage — Ganti bahasa SDK channel.
     * Game memanggil ini saat user ganti language di settings.
     */
    window.changeLanguage = function (lang) {
        console.log("[PPGAME] changeLanguage:", lang);
        window.sdkChannel = lang || "en";
        _httpPost("/api/settings", { language: lang });
    };

    /**
     * accountLoginCallback — Register callback untuk logout/switch.
     * Game mendaftarkan callback yang dipanggil saat user logout atau switch account.
     * Ini KRITIAL — kalau tidak dipanggil, game state tidak bersih saat ganti akun.
     *
     * @param {function} callback - Fungsi yang dipanggil saat logout/switch
     */
    window.accountLoginCallback = function (callback) {
        console.log("[PPGAME] accountLoginCallback registered");
        window._ppgameLogoutCallback = callback || function () {};
    };

    /**
     * report2Sdk350CreateRole — Report create role ke SDK 350.
     * Dipanggil oleh game saat role baru dibuat (channel 350 reporting).
     */
    window.report2Sdk350CreateRole = function (data) {
        console.log("[PPGAME] report2Sdk350CreateRole:", typeof data === "string" ? data : JSON.stringify(data));
        _httpPost("/api/event", {
            event: "sdk350_create_role",
            userId: _state.userId,
            data: _safeJsonParse(data)
        });
    };

    /**
     * report2Sdk350LoginUser — Report login ke SDK 350.
     * Dipanggil oleh game saat user login (channel 350 reporting).
     */
    window.report2Sdk350LoginUser = function (data) {
        console.log("[PPGAME] report2Sdk350LoginUser:", typeof data === "string" ? data : JSON.stringify(data));
        _httpPost("/api/event", {
            event: "sdk350_login",
            userId: _state.userId,
            data: _safeJsonParse(data)
        });
    };

    /**
     * reportToCpapiCreaterole — Report create role ke CP API.
     * Dipanggil oleh game saat role baru dibuat (CP channel reporting).
     */
    window.reportToCpapiCreaterole = function (data) {
        console.log("[PPGAME] reportToCpapiCreaterole:", typeof data === "string" ? data : JSON.stringify(data));
        _httpPost("/api/event", {
            event: "cpapi_create_role",
            userId: _state.userId,
            data: _safeJsonParse(data)
        });
    };

    /**
     * reportToBSH5Createrole — Report create role ke BS H5.
     * Dipanggil oleh game saat role baru dibuat (BS H5 channel reporting).
     */
    window.reportToBSH5Createrole = function (data) {
        console.log("[PPGAME] reportToBSH5Createrole:", typeof data === "string" ? data : JSON.stringify(data));
        _httpPost("/api/event", {
            event: "bs_h5_create_role",
            userId: _state.userId,
            data: _safeJsonParse(data)
        });
    };

    /**
     * reportToFbq — Report ke Facebook Pixel (stub).
     * Game memanggil ini tapi kita tidak punya Facebook Pixel.
     * Tidak boleh error — harus diam saja.
     */
    window.reportToFbq = function () {
        // Facebook Pixel — tidak digunakan di self-hosted, diam saja
    };

    /**
     * fbq — Facebook Pixel function (stub).
     * Harus ada supaya game tidak error saat memanggil fbq().
     */
    window.fbq = function () {
        // Facebook Pixel — stub, tidak boleh error
    };

    /**
     * gtag — Google Analytics function (stub).
     * Harus ada supaya game tidak error saat memanggil gtag().
     */
    window.gtag = function () {
        // Google Analytics — stub, tidak boleh error
    };

    /**
     * reportLogToPP — Report log ke PPGAME.
     * Game mengirim log events (crash, performance, dll).
     */
    window.reportLogToPP = function (name, data) {
        console.log("[PPGAME] reportLogToPP:", name);
        _httpPost("/api/event", {
            event: "log_pp_" + name,
            userId: _state.userId,
            data: data || {}
        });
    };

    /**
     * sendCustomEvent — Kirim custom event.
     * Game bisa mengirim event custom kapan saja.
     */
    window.sendCustomEvent = function (name, data) {
        console.log("[PPGAME] sendCustomEvent:", name);
        _httpPost("/api/event", {
            event: "custom_" + name,
            userId: _state.userId,
            data: data || {}
        });
    };

    /**
     * openURL — Buka URL di tab baru.
     * Dipanggil game untuk link eksternal (privacy policy, dll).
     */
    window.openURL = function (url) {
        console.log("[PPGAME] openURL:", url);
        if (url) window.open(url, "_blank");
    };

    /**
     * reload — Reload halaman.
     */
    window.reload = function () {
        window.document.location.reload();
    };

    /**
     * reportChatMsg — Report chat message (moderasi).
     * Game mengirim chat message untuk moderasi.
     */
    window.reportChatMsg = function (data) {
        _httpPost("/api/event", {
            event: "chat_msg",
            userId: _state.userId,
            data: _safeJsonParse(data)
        });
    };

    /**
     * initSDKDe — SDK init delegate.
     * Dipanggil oleh game saat boot selesai untuk menginisialisasi SDK.
     * Game mungkin mengharapkan return value tertentu.
     * Return true = SDK berhasil diinisialisasi.
     */
    window.initSDKDe = function () {
        console.log("[PPGAME] initSDKDe called — SDK initialization complete");
        // Report init ke server
        _httpPost("/api/event", {
            event: "sdk_init_delegate",
            userId: _state.userId,
            data: { version: SDK_VERSION, timestamp: Date.now() }
        });
        return true;
    };

    /**
     * getDeviceId — Return device ID untuk SDK.
     * Game mungkin memanggil ini untuk identifikasi perangkat.
     */
    window.getDeviceId = function () {
        return _getDeviceId();
    };

    /**
     * isSDKReady — Cek apakah SDK sudah siap.
     */
    var _sdkReady = false;
    window.isSDKReady = function () {
        return _sdkReady;
    };

    /**
     * onPayResult — Callback untuk payment result.
     * Game bisa mendaftarkan callback ini untuk menerima notifikasi payment.
     * Default: tidak ada callback, game bisa override.
     */
    if (typeof window.onPayResult === "undefined") {
        window.onPayResult = null;
    }

    /**
     * paySdkCallback — Callback alternatif untuk payment.
     */
    if (typeof window.paySdkCallback === "undefined") {
        window.paySdkCallback = null;
    }

    // ============================================================
    //  FUNGSI BRIDGE YANG DIDELEGASIKAN KE PPGAME
    //  index.html define ini di if(window.PPGAME) block.
    //  Tapi kalau sdk.js load setelah inline script,
    //  kita harus define sendiri sebagai fallback.
    //
    //  PENTING: report2Sdk harus menangani SEMUA dataType:
    //    dataType 1 = login report
    //    dataType 2 = create role
    //    dataType 3 = enter server
    //    dataType 4 = level up
    //    dataType 5 = logout
    // ============================================================
    function _ensureBridgeFunctions() {
        if (typeof window.paySdk === "undefined") {
            window.paySdk = function (a) { window.PPGAME.createPaymentOrder(a); };
        }
        if (typeof window.gameReady === "undefined") {
            window.gameReady = function () { window.PPGAME.gameReady(); };
        }
        // report2Sdk sudah di-override secara global di atas — tidak perlu fallback di sini
        if (typeof window.gameChapterFinish === "undefined") {
            window.gameChapterFinish = function (a) { window.PPGAME.gameChapterFinish(a); };
        }
        if (typeof window.openShopPage === "undefined") {
            window.openShopPage = function () { window.PPGAME.openShopPage(); };
        }
        if (typeof window.gameLevelUp === "undefined") {
            window.gameLevelUp = function (a) { window.PPGAME.gameLevelUp(a); };
        }
        if (typeof window.tutorialFinish === "undefined") {
            window.tutorialFinish = function () { window.PPGAME.submitEvent("game_tutorial_finish"); };
        }
    }

    // ============================================================
    //  Override report2Sdk dari index.html
    //  index.html hanya menangani dataType 2 dan 3.
    //  Kita override untuk menangani SEMUA dataType.
    // ============================================================
    window.report2Sdk = function (a) {
        if (!a) return;

        // Tangani semua dataType secara lengkap
        switch (a.dataType) {
            case 1: // Login report
                console.log("[PPGAME] report2Sdk dataType=1 (login):", JSON.stringify(a));
                window.PPGAME.submitEvent("game_login", {
                    characterName: a.roleName,
                    characterId: a.roleID,
                    serverId: a.serverID,
                    serverName: a.serverName
                });
                break;
            case 2: // Create role
                window.PPGAME.submitEvent("game_create_role", {
                    characterName: a.roleName,
                    characterId: a.roleID,
                    serverId: a.serverID,
                    serverName: a.serverName
                });
                break;
            case 3: // Enter server
                window.PPGAME.playerEnterServer({
                    characterName: a.roleName,
                    characterId: a.roleID,
                    serverId: a.serverID,
                    serverName: a.serverName
                });
                break;
            case 4: // Level up
                console.log("[PPGAME] report2Sdk dataType=4 (level up):", JSON.stringify(a));
                window.PPGAME.gameLevelUp({
                    level: a.level || a.roleLevel,
                    characterName: a.roleName,
                    characterId: a.roleID,
                    serverId: a.serverID,
                    serverName: a.serverName
                });
                break;
            case 5: // Logout
                console.log("[PPGAME] report2Sdk dataType=5 (logout):", JSON.stringify(a));
                window.PPGAME.submitEvent("game_logout", {
                    characterName: a.roleName,
                    characterId: a.roleID,
                    serverId: a.serverID,
                    serverName: a.serverName
                });
                break;
            default:
                // Unknown dataType — tetap log dan kirim event
                console.log("[PPGAME] report2Sdk dataType=" + a.dataType + " (unknown):", JSON.stringify(a));
                window.PPGAME.submitEvent("game_report_" + a.dataType, a);
                break;
        }
    };

    // ============================================================
    //  WINDOW VALUES — dibaca TSBrowser.getVariantValue()
    //  Game mengakses: window[name] untuk mendapatkan config.
    //  Kita SET hanya kalau belum ada (supaya index.html bisa override).
    // ============================================================

    // --- SDK Version ---
    window.issdkVer2 = true;

    // --- SDK Identifier ---
    // Game mungkin baca window.sdk langsung via TSBrowser.getVariantValue("sdk")
    if (typeof window.sdk === "undefined") {
        window.sdk = "ppgame";
    }

    // --- SDK check function ---
    // Pastikan checkSDK ada sebelum index.html define-nya
    if (typeof window.checkSDK === "undefined") {
        window.checkSDK = function () { return true; };
    }

    // --- Game Config (hanya kalau belum di-set oleh index.html) ---
    if (typeof window.CacheNum === "undefined") window.CacheNum = 100;
    if (typeof window.clientserver === "undefined") window.clientserver = GAME_SERVER_DEFAULT;

    // --- Multi-Server Config (for game client to read) ---
    // Game can access window.gameServerConfig to get all server URLs
    if (typeof window.gameServerConfig === "undefined") {
        window.gameServerConfig = {
            login:   GAME_SERVERS.login,
            main:    GAME_SERVERS.main,
            chat:    GAME_SERVERS.chat,
            dungeon: GAME_SERVERS.dungeon
        };
    }

    if (typeof window.debugLanguage === "undefined") window.debugLanguage = "";
    if (typeof window.reportBattlleLog === "undefined") window.reportBattlleLog = false;
    if (typeof window.versionConfig === "undefined") window.versionConfig = {};
    // sdkChannel di-set oleh index.html sebagai "en", tapi pastikan ada default
    if (typeof window.sdkChannel === "undefined") window.sdkChannel = "en";

    // --- SDK Channel Config ---
    if (typeof window.sdkNativeChannel === "undefined") window.sdkNativeChannel = null;

    // --- Account / User Center ---
    if (typeof window.contactSdk === "undefined") window.contactSdk = false;
    if (typeof window.showContact === "undefined") window.showContact = false;
    if (typeof window.showCurChannel === "undefined") window.showCurChannel = null;
    if (typeof window.userCenterSdk === "undefined") window.userCenterSdk = false;
    if (typeof window.switchAccountSdk === "undefined") window.switchAccountSdk = true;
    if (typeof window.switchUser === "undefined") window.switchUser = true;

    // --- Login UI Config ---
    if (typeof window.show18Login === "undefined") window.show18Login = false;
    if (typeof window.show18Home === "undefined") window.show18Home = false;
    if (typeof window.loginpictype === "undefined") window.loginpictype = 0;
    if (typeof window.loginpic === "undefined") window.loginpic = "";

    // --- Server Config ---
    // serverList diisi dari SDK server settings (asynchronous)
    // Default: satu server lokal
    if (typeof window.serverList === "undefined") {
        window.serverList = {
            list: [
                {
                    id: "1",
                    name: "Super Warrior Z",
                    ip: "127.0.0.1",
                    port: 8000,
                    status: "normal",
                    recommend: true,
                    newTag: false,
                    servers: {
                        login:   { port: 8000, status: "normal" },
                        main:    { port: 8001, status: "normal" },
                        chat:    { port: 8002, status: "normal" },
                        dungeon: { port: 8003, status: "normal" }
                    }
                }
            ]
        };
    }
    if (typeof window.replaceServerName === "undefined") window.replaceServerName = [];
    if (typeof window.hiddenServersRange === "undefined") window.hiddenServersRange = [];

    // --- Privacy / Legal ---
    if (typeof window.privacyUrl === "undefined") window.privacyUrl = "";

    // --- Language ---
    if (typeof window.supportLang === "undefined") window.supportLang = null;

    // --- Age Gate ---
    if (typeof window.showSixteenImg === "undefined") window.showSixteenImg = false;

    // --- FB / Social ---
    if (typeof window.fbGiveLiveSdk === "undefined") window.fbGiveLiveSdk = false;
    if (typeof window.giveLikeSdk === "undefined") window.giveLikeSdk = false;

    // --- Debug ---
    if (typeof window.debugUrl === "undefined") window.debugUrl = "";

    // ============================================================
    //  PAYMENT UI — Terasa nyata untuk user
    // ============================================================

    /** Tampilkan payment processing overlay */
    function _showPaymentProcessing(orderData) {
        // Hapus overlay lama kalau ada
        var old = document.getElementById("ppgame-payment-overlay");
        if (old) old.remove();

        var productName = orderData.goodsName || orderData.productName || "Item";
        var price = orderData.price || orderData.amount || 0;
        var currency = orderData.currency || "USD";

        var overlay = document.createElement("div");
        overlay.id = "ppgame-payment-overlay";
        overlay.style.cssText = [
            "position: fixed",
            "top: 0", "left: 0",
            "width: 100%", "height: 100%",
            "background: rgba(0,0,0,0.6)",
            "z-index: 99999",
            "display: flex",
            "justify-content: center",
            "align-items: center",
            "font-family: Arial, sans-serif"
        ].join(";");

        var box = document.createElement("div");
        box.style.cssText = [
            "background: #1a1a2e",
            "border: 2px solid #ffd700",
            "border-radius: 12px",
            "padding: 24px",
            "min-width: 280px",
            "max-width: 90%",
            "color: #fff",
            "text-align: center"
        ].join(";");

        var title = document.createElement("div");
        title.innerHTML = "PROCESSING PAYMENT";
        title.style.cssText = "color: #ffd700; font-size: 16px; font-weight: bold; margin-bottom: 16px; letter-spacing: 1px;";
        box.appendChild(title);

        var info = document.createElement("div");
        info.innerHTML = productName + "<br><span style='color: #ffd700; font-size: 20px;'>" + price + " " + currency + "</span>";
        info.style.cssText = "font-size: 14px; margin-bottom: 16px;";
        box.appendChild(info);

        var spinner = document.createElement("div");
        spinner.innerHTML = "&#8987;"; // Hourglass
        spinner.style.cssText = "font-size: 32px; animation: spin 2s linear infinite;";
        box.appendChild(spinner);

        // Add spin animation
        if (!document.getElementById("ppgame-spin-style")) {
            var style = document.createElement("style");
            style.id = "ppgame-spin-style";
            style.textContent = "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";
            document.head.appendChild(style);
        }

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    /** Tampilkan payment result (sukses/gagal) */
    function _showPaymentResult(success, message) {
        // Hapus processing overlay
        var processing = document.getElementById("ppgame-payment-overlay");
        if (processing) processing.remove();

        var existing = document.getElementById("ppgame-payment-result");
        if (existing) existing.remove();

        var overlay = document.createElement("div");
        overlay.id = "ppgame-payment-result";
        overlay.style.cssText = [
            "position: fixed",
            "top: 0", "left: 0",
            "width: 100%", "height: 100%",
            "background: rgba(0,0,0,0.6)",
            "z-index: 99999",
            "display: flex",
            "justify-content: center",
            "align-items: center",
            "font-family: Arial, sans-serif"
        ].join(";");

        var box = document.createElement("div");
        box.style.cssText = [
            "background: #1a1a2e",
            "border: 2px solid " + (success ? "#4CAF50" : "#f44336"),
            "border-radius: 12px",
            "padding: 24px",
            "min-width: 280px",
            "max-width: 90%",
            "color: #fff",
            "text-align: center"
        ].join(";");

        var icon = document.createElement("div");
        icon.innerHTML = success ? "&#10003;" : "&#10007;";
        icon.style.cssText = "font-size: 48px; color: " + (success ? "#4CAF50" : "#f44336") + "; margin-bottom: 12px;";
        box.appendChild(icon);

        var msg = document.createElement("div");
        msg.innerHTML = message || (success ? "Payment successful!" : "Payment failed");
        msg.style.cssText = "font-size: 16px;";
        box.appendChild(msg);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Auto-hide setelah 2 detik
        setTimeout(function () {
            if (overlay.parentNode) overlay.remove();
        }, 2000);
    }

    // ============================================================
    //  GUEST LOGIN UI
    //  Tombol GUEST muncul di halaman loading (maskloadinglayer)
    //  saat belum login.
    // ============================================================

    /** Fungsi Guest Login — dipanggil saat tombol GUEST diklik */
    window.ppgameGuestLogin = function () {
        console.log("[PPGAME] Guest login requested");
        var btn = document.getElementById("ppgame-guest-btn");
        if (btn) {
            btn.style.opacity = "0.6";
            btn.style.pointerEvents = "none";
            btn.innerHTML = "CONNECTING...";
        }
        _httpPost("/api/account/guest", { deviceId: _getDeviceId() }, function (res) {
            if (res && res.account) {
                _setLogin(res.account);

                // Update gameServerUrl dari settings jika ada
                if (res.serverList && res.serverList.length > 0) {
                    _state.gameServerUrl = (_serverSettings && _serverSettings.gameServerUrl) || GAME_SERVER_DEFAULT;
                    // Update multi-server URLs from settings
                    _state.mainServerUrl = (_serverSettings && _serverSettings.mainServerUrl) || GAME_SERVERS.main;
                    _state.chatServerUrl = (_serverSettings && _serverSettings.chatServerUrl) || GAME_SERVERS.chat;
                    _state.dungeonServerUrl = (_serverSettings && _serverSettings.dungeonServerUrl) || GAME_SERVERS.dungeon;
                    _saveState();
                }

                console.log("[PPGAME] Guest login success:", res.account.nickname);

                // Redirect dengan URL params supaya game bisa baca login info
                var url = window.location.origin + window.location.pathname;
                url += "?sdk=" + encodeURIComponent(_state.sdk);
                url += "&logintoken=" + encodeURIComponent(_state.loginToken);
                url += "&nickname=" + encodeURIComponent(_state.nickname);
                url += "&userid=" + encodeURIComponent(_state.userId);
                window.location.href = url;
            } else {
                console.error("[PPGAME] Guest login failed:", res);
                _showLoginError("Login gagal. Coba lagi.");
                if (btn) {
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "auto";
                    btn.innerHTML = "GUEST";
                }
            }
        }, function (err) {
            console.error("[PPGAME] Guest login server error:", err);
            var errorMsg = "SDK server tidak bisa dijangkau.\nPastikan: node server/sdk-server/ (port 9999)";
            if (err && err.status === 429) {
                errorMsg = "Terlalu banyak akun di perangkat ini.\nHapus akun lama atau hubungi admin.";
            }
            _showLoginError(errorMsg);
            if (btn) {
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
                btn.innerHTML = "GUEST";
            }
        });
    };

    /** Device ID — identifikasi unik per browser */
    function _getDeviceId() {
        var deviceId = _storageGet("ppgame_device_id", null);
        if (!deviceId) {
            deviceId = "dev_" + _simpleUID();
            _storageSet("ppgame_device_id", deviceId);
        }
        return deviceId;
    }

    /** Tampilkan error message di layar */
    function _showLoginError(msg) {
        var existing = document.getElementById("ppgame-error");
        if (existing) existing.remove();

        var err = document.createElement("div");
        err.id = "ppgame-error";
        err.innerHTML = msg;
        err.style.cssText = [
            "position: fixed",
            "bottom: 18%",
            "left: 50%",
            "transform: translateX(-50%)",
            "background: rgba(200,0,0,0.85)",
            "color: #fff",
            "padding: 12px 24px",
            "border-radius: 8px",
            "font-size: 14px",
            "z-index: 10001",
            "text-align: center",
            "max-width: 80%",
            "white-space: pre-line"
        ].join(";");
        document.body.appendChild(err);
        setTimeout(function () { if (err.parentNode) err.remove(); }, 4000);
    }

    /** Inject tombol GUEST ke halaman loading */
    function _injectGuestButton() {
        // Kalau sudah login, tidak perlu tombol Guest
        if (_isLoggedIn()) {
            console.log("[PPGAME] Sudah login, skip guest button");
            return;
        }

        // Cari container loading screen
        var container = document.getElementById("maskloadinglayer");
        if (!container) {
            return false;
        }

        // Jangan inject duplikat
        if (document.getElementById("ppgame-guest-btn")) return true;

        // Buat overlay untuk login UI
        var overlay = document.createElement("div");
        overlay.id = "ppgame-login-overlay";
        overlay.style.cssText = [
            "position: absolute",
            "top: 0",
            "left: 0",
            "width: 100%",
            "height: 100%",
            "display: flex",
            "flex-direction: column",
            "justify-content: flex-end",
            "align-items: center",
            "padding-bottom: 18%",
            "z-index: 10000",
            "pointer-events: none"
        ].join(";");

        // Judul
        var title = document.createElement("div");
        title.innerHTML = "SUPER WARRIOR Z";
        title.style.cssText = [
            "color: #ffd700",
            "font-size: 28px",
            "font-weight: bold",
            "text-shadow: 0 0 10px rgba(255,215,0,0.8), 0 2px 4px rgba(0,0,0,0.8)",
            "letter-spacing: 3px",
            "margin-bottom: 40px",
            "font-family: Arial, sans-serif",
            "pointer-events: none"
        ].join(";");
        overlay.appendChild(title);

        // Tombol GUEST
        var btn = document.createElement("div");
        btn.id = "ppgame-guest-btn";
        btn.innerHTML = "▶ GUEST";
        btn.style.cssText = [
            "width: 260px",
            "height: 52px",
            "line-height: 52px",
            "text-align: center",
            "font-size: 20px",
            "font-weight: bold",
            "color: #fff",
            "background: linear-gradient(180deg, #f5a623 0%, #e8871e 100%)",
            "border: 2px solid #ffd700",
            "border-radius: 10px",
            "cursor: pointer",
            "text-shadow: 0 2px 4px rgba(0,0,0,0.5)",
            "box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 20px rgba(245,166,35,0.3)",
            "letter-spacing: 3px",
            "user-select: none",
            "-webkit-tap-highlight-color: transparent",
            "pointer-events: auto",
            "transition: transform 0.1s, opacity 0.2s"
        ].join(";");

        btn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.ppgameGuestLogin();
        });
        btn.addEventListener("touchstart", function () {
            btn.style.transform = "scale(0.96)";
        });
        btn.addEventListener("touchend", function () {
            btn.style.transform = "scale(1)";
        });
        btn.addEventListener("mousedown", function () {
            btn.style.transform = "scale(0.96)";
        });
        btn.addEventListener("mouseup", function () {
            btn.style.transform = "scale(1)";
        });
        overlay.appendChild(btn);

        // Info text
        var info = document.createElement("div");
        info.innerHTML = "SDK v" + SDK_VERSION + " | Servers: :9999 :8000-8003";
        info.style.cssText = [
            "color: rgba(255,255,255,0.4)",
            "font-size: 11px",
            "margin-top: 16px",
            "font-family: Arial, sans-serif",
            "pointer-events: none"
        ].join(";");
        overlay.appendChild(info);

        // Pastikan container punya position relative
        var containerStyle = window.getComputedStyle(container);
        if (containerStyle.position === "static") {
            container.style.position = "relative";
        }

        container.appendChild(overlay);
        console.log("[PPGAME] Guest login button injected");
        return true;
    }

    // ============================================================
    //  ACCOUNT SWITCH UI
    // ============================================================

    function _showAccountSwitchUI() {
        _httpGet("/api/accounts?deviceId=" + _getDeviceId(), function (res) {
            var accounts = res && res.accounts ? res.accounts : [];
            _renderAccountDialog(accounts);
        }, function () {
            _renderAccountDialog([]);
        });
    }

    function _renderAccountDialog(accounts) {
        // Hapus dialog lama kalau ada
        var old = document.getElementById("ppgame-switch-dialog");
        if (old) old.remove();

        var dialog = document.createElement("div");
        dialog.id = "ppgame-switch-dialog";
        dialog.style.cssText = [
            "position: fixed",
            "top: 0", "left: 0",
            "width: 100%", "height: 100%",
            "background: rgba(0,0,0,0.8)",
            "z-index: 99999",
            "display: flex",
            "justify-content: center",
            "align-items: center",
            "font-family: Arial, sans-serif"
        ].join(";");

        var box = document.createElement("div");
        box.style.cssText = [
            "background: #1a1a2e",
            "border: 2px solid #ffd700",
            "border-radius: 12px",
            "padding: 24px",
            "min-width: 300px",
            "max-width: 90%",
            "max-height: 80%",
            "overflow-y: auto",
            "color: #fff",
            "text-align: center"
        ].join(";");

        var title = document.createElement("h3");
        title.innerHTML = "SWITCH ACCOUNT";
        title.style.cssText = "color: #ffd700; margin: 0 0 16px 0; font-size: 20px; letter-spacing: 2px;";
        box.appendChild(title);

        // Info akun saat ini
        if (_state.nickname) {
            var currentInfo = document.createElement("div");
            currentInfo.innerHTML = "Current: <b style='color: #ffd700;'>" + _state.nickname + "</b>";
            currentInfo.style.cssText = "font-size: 12px; color: #888; margin-bottom: 12px;";
            box.appendChild(currentInfo);
        }

        // List akun yang ada
        if (accounts.length > 0) {
            accounts.forEach(function (acc) {
                var item = document.createElement("div");
                var isCurrent = acc.userId === _state.userId;
                item.innerHTML = (acc.nickname || acc.userId.slice(0, 8)) +
                    (acc.type ? " <span style='color:#888;font-size:11px;'>(" + acc.type + ")</span>" : "") +
                    (isCurrent ? " <span style='color:#4CAF50;font-size:11px;'>ACTIVE</span>" : "");
                item.style.cssText = [
                    "padding: 12px",
                    "margin: 6px 0",
                    "background: " + (isCurrent ? "#0f3460" : "#16213e"),
                    "border: 1px solid " + (isCurrent ? "#ffd700" : "#333"),
                    "border-radius: 8px",
                    "cursor: " + (isCurrent ? "default" : "pointer"),
                    "transition: background 0.2s"
                ].join(";");

                if (!isCurrent) {
                    item.addEventListener("mouseover", function () { item.style.background = "#0f3460"; });
                    item.addEventListener("mouseout", function () { item.style.background = "#16213e"; });
                    item.addEventListener("click", function () {
                        _httpPost("/api/account/switch", {
                            userId: acc.userId,
                            currentToken: _state.loginToken
                        }, function (r) {
                            if (r && r.account) {
                                _setLogin(r.account);
                                dialog.remove();
                                // Redirect dengan URL params baru
                                var url = window.location.origin + window.location.pathname;
                                url += "?sdk=" + encodeURIComponent(_state.sdk);
                                url += "&logintoken=" + encodeURIComponent(_state.loginToken);
                                url += "&nickname=" + encodeURIComponent(_state.nickname);
                                url += "&userid=" + encodeURIComponent(_state.userId);
                                window.location.href = url;
                            }
                        });
                    });
                }
                box.appendChild(item);
            });
        } else {
            var noAcc = document.createElement("div");
            noAcc.innerHTML = "No accounts yet";
            noAcc.style.cssText = "color: #888; padding: 12px;";
            box.appendChild(noAcc);
        }

        // Tombol Create New Account
        var createBtn = document.createElement("div");
        createBtn.innerHTML = "+ CREATE NEW";
        createBtn.style.cssText = [
            "padding: 10px",
            "margin: 12px 0 0 0",
            "background: linear-gradient(180deg, #4CAF50, #388E3C)",
            "border-radius: 8px",
            "cursor: pointer",
            "font-weight: bold",
            "letter-spacing: 1px"
        ].join(";");
        createBtn.addEventListener("click", function () {
            var nick = prompt("Enter nickname:");
            if (nick && nick.trim()) {
                _httpPost("/api/account/create", {
                    nickname: nick.trim(),
                    deviceId: _getDeviceId()
                }, function (r) {
                    if (r && r.account) {
                        _setLogin(r.account);
                        dialog.remove();
                        var url = window.location.origin + window.location.pathname;
                        url += "?sdk=" + encodeURIComponent(_state.sdk);
                        url += "&logintoken=" + encodeURIComponent(_state.loginToken);
                        url += "&nickname=" + encodeURIComponent(_state.nickname);
                        url += "&userid=" + encodeURIComponent(_state.userId);
                        window.location.href = url;
                    }
                });
            }
        });
        box.appendChild(createBtn);

        // Tombol Close
        var closeBtn = document.createElement("div");
        closeBtn.innerHTML = "CANCEL";
        closeBtn.style.cssText = [
            "padding: 8px",
            "margin: 8px 0 0 0",
            "color: #888",
            "cursor: pointer"
        ].join(";");
        closeBtn.addEventListener("click", function () { dialog.remove(); });
        box.appendChild(closeBtn);

        dialog.appendChild(box);
        document.body.appendChild(dialog);
    }

    // ============================================================
    //  FETCH SETTINGS DARI SDK SERVER
    //  Membaca gameServerUrl, serverList, dll secara dinamis
    // ============================================================
    var _serverSettings = null;

    function _fetchSettings() {
        _httpGet("/api/settings", function (res) {
            if (res && res.settings) {
                _serverSettings = res.settings;

                // Update gameServerUrl dari server settings
                if (res.settings.gameServerUrl) {
                    _state.gameServerUrl = res.settings.gameServerUrl;
                    _saveState();

                    // Update window.clientserver juga
                    if (typeof window.clientserver !== "undefined") {
                        window.clientserver = res.settings.gameServerUrl;
                    }
                }

                // Update multi-server URLs dari server settings
                if (res.settings.mainServerUrl) {
                    _state.mainServerUrl = res.settings.mainServerUrl;
                }
                if (res.settings.chatServerUrl) {
                    _state.chatServerUrl = res.settings.chatServerUrl;
                }
                if (res.settings.dungeonServerUrl) {
                    _state.dungeonServerUrl = res.settings.dungeonServerUrl;
                }

                // Update window.gameServerConfig jika server mengirim config
                if (res.settings.gameServerConfig) {
                    window.gameServerConfig = res.settings.gameServerConfig;
                } else {
                    // Build dari state
                    window.gameServerConfig = {
                        login:   _state.gameServerUrl || GAME_SERVERS.login,
                        main:    _state.mainServerUrl || GAME_SERVERS.main,
                        chat:    _state.chatServerUrl || GAME_SERVERS.chat,
                        dungeon: _state.dungeonServerUrl || GAME_SERVERS.dungeon
                    };
                }
                _saveState();

                // Update serverList dari server settings
                if (res.settings.serverList && res.settings.serverList.length > 0) {
                    window.serverList = { list: res.settings.serverList };
                }

                console.log("[PPGAME] Settings loaded from server");
            }
        }, function () {
            console.log("[PPGAME] Could not fetch settings from server — using defaults");
        });
    }

    // ============================================================
    //  INIT — Setup & mulai SDK
    // ============================================================

    function _init() {
        console.log("[PPGAME] SDK v" + SDK_VERSION + " initializing...");
        console.log("[PPGAME] Server:", SDK_SERVER);

        // 1. Pastikan bridge functions ada (fallback)
        _ensureBridgeFunctions();

        // 2. Fetch settings dari SDK server
        _fetchSettings();

        // 3. Report init ke SDK server
        _httpPost("/api/init", {
            userId: _state.userId,
            nickname: _state.nickname,
            loginToken: _state.loginToken,
            sdk: _state.sdk,
            deviceId: _getDeviceId(),
            version: SDK_VERSION
        }, function (res) {
            if (res) {
                // Jika server mengembalikan account info (auto-register)
                if (res.userId && !_state.userId) {
                    _setLogin(res);
                    console.log("[PPGAME] Auto account from server:", res.userId);
                }

                // Update loginToken jika server memberikan yang baru
                if (res.loginToken && res.userId === _state.userId) {
                    _state.loginToken = res.loginToken;
                    _saveState();
                }

                // Update serverList dari response
                if (res.serverList && res.serverList.length > 0) {
                    window.serverList = { list: res.serverList };
                }

                console.log("[PPGAME] Connected to SDK server");
            }
        }, function () {
            console.log("[PPGAME] SDK server not reachable — running offline");
        });

        // 4. Inject tombol Guest (tunggu DOM ready)
        _tryInjectGuestButton();

        console.log("[PPGAME] SDK ready. Logged in:", _isLoggedIn(), _state.userId || "(not logged in)");
        _sdkReady = true;
    }

    /** Coba inject guest button, retry kalau container belum ada */
    function _tryInjectGuestButton() {
        if (_isLoggedIn()) return;

        var success = _injectGuestButton();
        if (!success) {
            var attempts = 0;
            var interval = setInterval(function () {
                attempts++;
                if (_injectGuestButton() || attempts > 30) {
                    clearInterval(interval);
                    if (attempts > 30) {
                        console.warn("[PPGAME] Could not find maskloadinglayer after 30 attempts");
                    }
                }
            }, 200);
        }
    }

    // Jalankan init
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", _init);
    } else {
        _init();
    }

})();
