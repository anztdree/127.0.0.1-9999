# SDK-SERVER & SDK.JS — Analisa 100% Reverse Engineering

> **Super Warrior Z** — Tahap 1: SDK-SERVER & SDK.JS (CLIENT)
> Source: `main.min(unminfy).js` (244,761 lines) + `index.html` + `sdk.js`
> Tools: Node.js | Database: better-sqlite3 ^11.7.0
> Metode: Tanpa STUB, OVERRIDE, FORCE, BYPASS, DUMMY, ASUMSI
> Versi: 6.0 — Decisions locked: Security Code Sharing (Option A), Payment Notify (Option B), Log Style (Emoji Block), CORS: Allow-Origin:*
> Changelog v6.0: FIX server0Time=25200000, ADD POST /event/report (console log), ADD CORS spec (game:8080 ↔ SDK:9999), DECIDE loginGame SKIP (SDK focus), DECIDE localStorage key=ppgame_login, DECIDE Eruda no-inject (rely on index.html), MARK Error 38 REQUIRES DEEPER ANALYSIS, SKIP LoginAnnounce/LZString (not SDK scope), CONFIRM /api/payment/callback FINAL

---

## DAFTAR ISI

1. [Arsitektur Overview](#1-arsitektur-overview)
2. [SDK Bridge: TSBrowser Class](#2-sdk-bridge-tsbrowser-class)
3. [Kontrak Window API — Apa yang SDK WAJIB Sediakan](#3-kontrak-window-api--apa-yang-sdk-wajib-sediakan)
4. [SDK Login Flow — Detail Step-by-Step](#4-sdk-login-flow--detail-step-by-step)
5. [PPGAME Object — Implementasi di sdk.js](#5-ppgame-object--implementasi-di-sdkjs)
6. [SDK Data Fields — Mapping Lengkap](#6-sdk-data-fields--mapping-lengkap)
7. [Sign & Security — Analisa Kriptografi](#7-sign--security--analisa-kriptografi)
8. [Payment Flow — Implementasi Lengkap](#8-payment-flow--implementasi-lengkap)
9. [SDK Reporting & Analytics](#9-sdk-reporting--analytics)
10. [TEA Verification Handshake](#10-tea-verification-handshake)
11. [Server Connection Architecture](#11-server-connection-architecture)
12. [Window Variables — Konfigurasi Runtime](#12-window-variables--konfigurasi-runtime)
13. [SDK Channel UI Visibility — Logika per-Channel](#13-sdk-channel-ui-visibility--logika-per-channel)
14. [Third-Party Analytics — FB/Yahoo/Google](#14-third-party-analytics--fbyahoogoogle)
15. [SDK-Server Spesifikasi — Standalone](#15-sdk-server-spesifikasi--standalone)
16. [sdk.js — Spesifikasi Implementasi](#16-sdkjs--spesifikasi-implementasi)
17. [Database Schema — SDK-Server Standalone](#17-database-schema--sdk-server-standalone)
18. [Login UI — Guest & UserID Login](#18-login-ui--guest--userid-login)
19. [Error Codes Relevan](#19-error-codes-relevan)
    - [19.1 Error 38 — REQUIRES DEEPER ANALYSIS](#191-error-38--requires-deeper-analysis)
20. [Catatan Implementasi](#20-catatan-implementasi)
    - [20.10 Decisions — SKIP/FINAL (v6.0)](#2010-decisions--skipfinal-v60)
21. [Log Style — SDK-SERVER & SDK.JS](#21-log-style--sdk-server--sdkjs)

---

## 1. ARSITEKTUR OVERVIEW

### 1.1 Prinsip Desain

**Setiap server STANDALONE** — database sendiri, dependency sendiri, tidak berbagi file DB.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Client)                             │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  sdk.js (SDK Client)                                        │     │
│  │                                                              │     │
│  │  ● window.PPGAME object (createPaymentOrder, playerEnter..) │     │
│  │  ● window.checkSDK()      → return true                     │     │
│  │  ● window.getSdkLoginInfo() → {sdk,loginToken,nickName,     │     │
│  │                                 userId,sign,security}        │     │
│  │  ● window.paySdk()        → PPGAME.createPaymentOrder       │     │
│  │  ● window.report2Sdk()    → PPGAME.playerEnterServer/       │     │
│  │                              PPGAME.submitEvent              │     │
│  │  ● window.getAppId()      → ''                              │     │
│  │  ● window.getLoginServer() → ''                             │     │
│  │  ● window.gameReady()     → PPGAME.gameReady                │     │
│  │  ● Login UI (Guest + UserID)                                │     │
│  └──────────────────────────┬──────────────────────────────────┘     │
│                             │ HTTP REST                              │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  main.min.js (Egret Engine)                                  │    │
│  │  TSBrowser.executeFunction() → baca window.* functions       │    │
│  │  TSBrowser.getVariantValue() → baca window.* variables       │    │
│  │  Socket.IO client → connect ke server ports                  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────────┐
          │                   │                       │
          ▼                   ▼                       ▼
┌──────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│  SDK-SERVER      │ │  LOGIN-SERVER     │ │  MAIN-SERVER      │
│  Port: 9999      │ │  Port: 8000       │ │  Port: 8001       │
│  HTTP REST       │ │  Socket.IO 2.5.1  │ │  Socket.IO+TEA    │
│                  │ │  TEA: OFF         │ │                    │
│  DB: sdk.db      │ │  DB: login.db     │ │  DB: main.db      │
│  (standalone)    │ │  (standalone)     │ │  (standalone)     │
└──────────────────┘ └───────────────────┘ └───────────────────┘
                              │                       │
                     ┌────────┴─────────┐             │
                     ▼                  ▼             ▼
            ┌──────────────────┐ ┌───────────────────┐
            │  CHAT-SERVER     │ │  DUNGEON-SERVER   │
            │  Port: 8002      │ │  Port: 8003       │
            │  Socket.IO+TEA   │ │  Socket.IO+TEA    │
            │  DB: chat.db     │ │  DB: dungeon.db   │
            │  (standalone)    │ │  (standalone)     │
            └──────────────────┘ └───────────────────┘
```

### 1.2 Data Sharing Antar Server

**Keputusan:** Setiap server bisa melihat dan mengambil isi database server lain, tapi tetap standalone. Tidak ada shared config — untuk mempermudah debugging. Komunikasi antar server via API call.

| Data | Cara Sharing | Keterangan |
|------|-------------|-----------|
| User identity (userId, sign, securityCode) | Client mengirim di request | Setiap server menerima langsung dari client |
| securityCode validation | Login-Server → SDK-Server API call | **Option A (DECIDED):** Login-Server memanggil `POST /auth/validate` ke SDK-Server untuk verifikasi securityCode. SDK-Server = single source of truth |
| Payment order | Main-Server → Client → SDK-Server | Client adalah intermediary |
| payFinish notification | SDK-Server → Main-Server (server-to-server) | **Option B (DECIDED):** Setelah user konfirmasi payment, SDK-Server langsung notify Main-Server via HTTP API, BUKAN melalui client |
| Cross-DB read access | API call antar server | Setiap server bisa query data server lain via REST API, tapi DB file tetap terpisah |

### 1.3 Prinsip Utama

**Game client TIDAK peduli SDK mana yang aktif.** Semua komunikasi SDK dilakukan melalui `window.*` functions yang bersifat generik. `sdk.js` mengimplementasikan `window.PPGAME` object + semua window wrapper functions yang dibutuhkan game.

---

## 2. SDK BRIDGE: TSBROWSER CLASS

**Lokasi:** `main.min(unminfy).js` Line 81714–81736

```javascript
TSBrowser = (function () {
    function e() {}
    return e.checkWindowFunction = function (e) {
        return window ? window[e] && 'function' == typeof window[e] : false;
    }, e.executeFunction = function (e) {
        for (var t = [], n = 1; n < arguments.length; n++) {
            t[n - 1] = arguments[n];
        }
        var o = this.checkWindowFunction(e);
        return o ? window[e].apply(window, t) : void 0;
    }, e.getVariantValue = function (e) {
        return window && window[e] ? window[e] : void 0;
    }, e.switchAccount = function () {
        this.executeFunction('switchAccount');
    }, e.payToSdk = function (e) {
        this.executeFunction('paySdk', e);
    }, e.isNative = function () {
        return this.executeFunction('checkFromNative') === true;
    }, e.getSdkLoginInfo = function () {
        return this.executeFunction('getSdkLoginInfo');
    }, e;
}());
```

### Cara Kerja

| Method | Fungsi Window | Return | Catatan |
|--------|--------------|--------|---------|
| `executeFunction('getSdkLoginInfo')` | `window.getSdkLoginInfo()` | `{sdk, loginToken, nickName, userId, sign, security}` | Return `undefined` jika tidak ada |
| `executeFunction('paySdk', data)` | `window.paySdk(data)` | void | Di-bridge ke `PPGAME.createPaymentOrder` |
| `executeFunction('getAppId')` | `window.getAppId()` | `string` | PPGAME: `''` |
| `executeFunction('getLoginServer')` | `window.getLoginServer()` | `string` | PPGAME: `''` → fallback ke serversetting.json |
| `executeFunction('checkFromNative')` | `window.checkFromNative()` | `boolean` | PPGAME: `false` |
| `getVariantValue('sdkChannel')` | baca `window.sdkChannel` | `string` | PPGAME: `'ppgame'` |
| `checkWindowFunction('paySdk')` | cek `window.paySdk` | `boolean` | Dipakai sebelum panggil paySdk |

---

## 3. KONTRAK WINDOW API — Apa yang SDK WAJIB Sediakan

### 3.1 FUNGSI WAJIB (Critical — tanpa ini game TIDAK bisa login)

| # | Window Function | Signature | Return | Deskripsi | Line |
|---|----------------|-----------|--------|-----------|------|
| 1 | `window.checkSDK()` | `()` | `boolean` | Harus return `true` agar game menggunakan SDK login path | 138070 |
| 2 | `window.getSdkLoginInfo()` | `()` | `object` | Return 6 field: `{sdk, loginToken, nickName, userId, sign, security}` | 138072 |

### 3.2 FUNGSI PENTING (Feature — tanpa ini fitur tertentu tidak jalan)

| # | Window Function | Signature | Return | Deskripsi | Line |
|---|----------------|-----------|--------|-----------|------|
| 3 | `window.paySdk(orderData)` | `(object)` | void | Bridge ke `PPGAME.createPaymentOrder(orderData)` | 114168 |
| 4 | `window.report2Sdk(data)` | `(object)` | void | Bridge ke `PPGAME.playerEnterServer` atau `PPGAME.submitEvent` | 114170 |
| 5 | `window.reportLogToPP(event, data)` | `(string, object?)` | void | Analytics event logging | 114705 |
| 6 | `window.getAppId()` | `()` | `string` | Sub-channel ID. PPGAME: `''` | 114403 |
| 7 | `window.getLoginServer()` | `()` | `string\|null` | Return `''` → fallback ke serversetting.json | 114510 |
| 8 | `window.gameReady()` | `()` | void | Signal game loaded. Bridge ke `PPGAME.gameReady()` | index.html:201 |
| 9 | `window.changeLanguage(lang)` | `(string)` | void | Ubah bahasa SDK | 114290 |
| 10 | `window.checkFromNative()` | `()` | `boolean` | PPGAME: `false` | 81732 |
| 11 | `window.accountLoginCallback(fn)` | `(function)` | void | Register exit callback | 137840 |
| 12 | `window.openURL(url)` | `(string)` | void | Buka URL di browser | 114715 |
| 13 | `window.getQueryStringByName(name)` | `(string)` | `string` | Baca URL query parameter | 86884 |

### 3.3 FUNGSI OPSIONAL (Platform-specific — PPGAME bisa implement minimal)

| # | Window Function | Signature | Deskripsi | Line |
|---|----------------|-----------|-----------|------|
| 14 | `window.switchAccount()` | `()` | Ganti akun SDK | 81728 |
| 15 | `window.gameChapterFinish(id)` | `(number)` | Report chapter selesai → `PPGAME.gameChapterFinish` | 114686 |
| 16 | `window.tutorialFinish()` | `()` | Report tutorial selesai → `PPGAME.submitEvent("game_tutorial_finish")` | 114698 |
| 17 | `window.openShopPage()` | `()` | Buka shop → `PPGAME.openShopPage` | 114700 |
| 18 | `window.gameLevelUp(level)` | `(number)` | Report level up → `PPGAME.gameLevelUp` | 114703 |
| 19 | `window.sendCustomEvent(name, data)` | `(string, object)` | Kirim custom event | 114717 |
| 20 | `window.reload()` | `()` | Reload halaman | 113824 |
| 21 | `window.contactSdk()` | `()` | Buka customer service | 138117 |
| 22 | `window.userCenterSdk()` | `()` | Buka user center | 138119 |
| 23 | `window.switchUser()` | `()` | Ganti user | 138121 |
| 24 | `window.reportToCpapiCreaterole(data)` | `(object)` | CP API role creation (gameId: 261) | 114174 |
| 25 | `window.report2Sdk350CreateRole(data)` | `(string)` | 350 platform role creation | 114199 |
| 26 | `window.report2Sdk350LoginUser(data)` | `(string)` | 350 platform login | 114201 |
| 27 | `window.fbq(action, event)` | `(string, string)` | Facebook pixel tracking | 114179 |
| 28 | `window.gtag(event, type, opts)` | `(string, string, object)` | Google Analytics | 114197 |

---

## 4. SDK LOGIN FLOW — Detail Step-by-Step

### 4.1 Timeline Lengkap

```
[Browser loads index.html]
       │
       ▼
┌─ 1. LOAD SCRIPTS ─────────────────────────────────────────────────┐
│    jszip-utils.min.js → jszip.min.js → sdk.js                     │
│                                                                     │
│    sdk.js langsung:                                                 │
│    ● Inject window.PPGAME object                                   │
│    ● Inject window.checkSDK, getSdkLoginInfo, paySdk, dll.        │
│    ● TAMPILKAN LOGIN UI (overlay)                                  │
│    ● TUNGGGU user klik "Login as Guest" atau "Login by UserID"    │
│    ● Blocking: game code TIDAK jalan sampai login selesai         │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼ (user klik tombol login)
       │
┌─ 2. GUEST LOGIN ──────────────────────────────────────────────────┐
│    POST http://127.0.0.1:9999/auth/guest                           │
│    → SDK-Server generate userId, loginToken, sign, security       │
│    → Simpan ke sdk.db                                              │
│    → Response: {loginToken, sign, security, userId, nickName}      │
│    → sdk.js cache login info di memory                             │
│    → TUTUP login UI overlay                                        │
│                                                                     │
│    ATAU                                                             │
│                                                                     │
│    LOGIN BY USERID                                                  │
│    POST http://127.0.0.1:9999/auth/login                           │
│    Body: {userId}                                                   │
│    → SDK-Server cari user di db                                    │
│    → Jika ada → return data                                        │
│    → Jika tidak → create baru                                      │
│    → Response: sama seperti guest                                  │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ 3. VALIDATE (Optional) ─────────────────────────────────────────┐
│    POST http://127.0.0.1:9999/auth/validate                        │
│    Body: {loginToken, userId}                                       │
│    → SDK-Server verifikasi loginToken                               │
│    → Response: {valid, sign, securityCode}                          │
│    → Dipakai oleh Login-Server untuk verifikasi                    │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ 4. LOAD GAME CODE ──────────────────────────────────────────────┐
│    loadMainJson(ver) → load json.zp (resource data)                │
│    loadMainCodeAsync(ver) → load main.min.js.zp → eval()          │
│    egret.runEgret({renderMode:'webgl', audioType:0})              │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ 5. GAME INIT — Login.initAll() ─────────────────────────────────┐
│    Line 137838                                                     │
│                                                                     │
│    a. accountLoginCallback(ts.exitGame)                            │
│    b. gameReady2Report() → window.gameReady() → PPGAME.gameReady()│
│    c. getSdkLoginInfo():                                            │
│       - checkLoginFromSdk() → window.checkSDK() → return true     │
│       - window.getSdkLoginInfo() → return cached data             │
│    d. Store ke ts.loginUserInfo: {userId, sign, sdk}              │
│    e. sdkLoginSuccess(o) → store ke ts.loginInfo.userInfo         │
│    f. clientRequestServerList(userId, sdk)                         │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ 6. CONNECT TO LOGIN-SERVER ─────────────────────────────────────┐
│    a. window.getLoginServer() → '' (PPGAME)                       │
│    b. Fallback: load serversetting.json                           │
│       → {loginserver: "http://127.0.0.1:8000"}                    │
│    c. loginClient.connectToServer("http://127.0.0.1:8000")       │
│    d. io.connect(url, {reconnectionAttempts: 10})                  │
│    e. On 'connect': verifyEnable=false → LANGSUNG callback        │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ 7. GetServerList ───────────────────────────────────────────────┐
│    SEND: {type:'User', action:'GetServerList', userId,            │
│           subChannel:'', channel:'ppgame'}                         │
│    RECV: {serverList:[...], history:[...], offlineReason:''}       │
│    Client: selectNewServer → onLoginSuccess                        │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ 8. SaveHistory (user klik Start) ───────────────────────────────┐
│    SEND: {type:'User', action:'SaveHistory', accountToken,        │
│           channelCode, serverId, securityCode, subChannel,         │
│           version:'1.0'}                                            │
│    RECV: {loginToken, todayLoginCount}                              │
│    Client: update loginToken, clientStartGame → connect Main-Server│
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ 9. clientEnterGame (Main-Server) ───────────────────────────────┐
│    SEND: {type:'user', action:'enterGame', loginToken, userId,    │
│           serverId, version:'1.0', language, gameVersion}          │
│    RECV: full user data (lihat bagian enterGame response)          │
│    On success: reportToLoginEnterInfo()                            │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─ 10. SaveUserEnterInfo ──────────────────────────────────────────┐
│    SEND: {type:'User', action:'SaveUserEnterInfo', accountToken,  │
│           channelCode, subChannel, createTime, userLevel,          │
│           version:'1.0'}                                            │
│    RECV: {ret:0}                                                    │
│    Client: loginClient.destroy() ← SOCKET DESTROYED               │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 Kode Kritis — checkLoginFromSdk & getSdkLoginInfo

```javascript
// Line 138069-138072
t.prototype.checkLoginFromSdk = function () {
    return window.checkSDK && window.checkSDK() ? true : false;
};

t.prototype.getSdkLoginInfo = function () {
    return this.checkLoginFromSdk() && window.getSdkLoginInfo 
        ? window.getSdkLoginInfo() 
        : null;
};
```

**Urutan wajib:**
1. `window.checkSDK()` harus ada DAN return `true`
2. `window.getSdkLoginInfo` harus ada (sebagai function)
3. `window.getSdkLoginInfo()` dipanggil → harus return object dengan 6 field

**Jika salah satu gagal** → game masuk origin login path (`checkLastLogin`) yang meminta username/password manual dengan default password `'game_origin'` (Line 137980).

### 4.3 Kode Kritis — sdkLoginSuccess

```javascript
// Line 138073-138093
t.prototype.sdkLoginSuccess = function (e) {
    var t = this, n = this;
    try {
        ts.loginInfo.userInfo = {
            loginToken: e.loginToken,
            userId: e.userId,
            nickName: e.nickName,
            channelCode: e.sdk,       // ← MAPPING: sdk → channelCode
            securityCode: e.security  // ← MAPPING: security → securityCode
        };
        ts.clientRequestServerList(e.userId, e.sdk, function (e) {
            n.selectNewServer(ts.loginInfo.userInfo, e);
            t.getNotice();
        });
    } catch (o) {
        console.log(o);
        n.showLoginSuccessStatus();
    }
};
```

---

## 5. PPGAME OBJECT — Implementasi di sdk.js

### 5.1 Keputusan: Implementasi langsung di sdk.js

index.html saat ini sudah memuat kode bridge yang mengarah ke `window.PPGAME`. Kita **mempertahankan pola ini** — sdk.js membuat `window.PPGAME` object dan semua window wrapper functions.

### 5.2 PPGAME Object — Methods yang HARUS Diimplementasi

```javascript
window.PPGAME = {
    // Payment
    createPaymentOrder: function(orderData) { ... },
    
    // Reporting
    playerEnterServer: function(data) { ... },
    submitEvent: function(eventName, data) { ... },
    
    // Game lifecycle
    gameReady: function() { ... },
    gameChapterFinish: function(chapterId) { ... },
    openShopPage: function() { ... },
    gameLevelUp: function(level) { ... }
};
```

### 5.3 Field Mapping report2Sdk → PPGAME

| Game Field (report2Sdk input) | PPGAME Field | Transformasi |
|-------------------------------|--------------|-------------|
| `roleName` | `characterName` | Rename |
| `roleID` | `characterId` | Rename |
| `serverID` | `serverId` | Rename (case) |
| `serverName` | `serverName` | Sama |
| `dataType` | — | Routing saja, tidak dikirim |

### 5.4 report2Sdk Routing Logic (dari index.html)

```javascript
window.report2Sdk = function(a) {
    if (a.dataType == 3) {
        // dataType 3 = EnterGame → playerEnterServer
        window.PPGAME.playerEnterServer({
            "characterName": a.roleName,
            "characterId": a.roleID,
            "serverId": a.serverID,
            "serverName": a.serverName
        });
    } else if (a.dataType == 2) {
        // dataType 2 = CreateRole → submitEvent
        window.PPGAME.submitEvent("game_create_role", {
            "characterName": a.roleName,
            "characterId": a.roleID,
            "serverId": a.serverID,
            "serverName": a.serverName
        });
    }
    // dataType lain: SILENT — PPGAME bridge tidak handle
};
```

### 5.5 Semua Bridge Functions (dari index.html)

| Game memanggil | PPGAME Method | Kondisi |
|---------------|---------------|---------|
| `window.paySdk(orderData)` | `PPGAME.createPaymentOrder(orderData)` | Selalu |
| `window.gameReady()` | `PPGAME.gameReady()` | Selalu |
| `window.report2Sdk(data)` | `PPGAME.playerEnterServer(data)` | dataType=3 |
| `window.report2Sdk(data)` | `PPGAME.submitEvent("game_create_role", data)` | dataType=2 |
| `window.gameChapterFinish(id)` | `PPGAME.gameChapterFinish(id)` | Selalu |
| `window.openShopPage()` | `PPGAME.openShopPage()` | Selalu |
| `window.gameLevelUp(level)` | `PPAME.gameLevelUp(level)` | Selalu |
| `window.tutorialFinish()` | `PPGAME.submitEvent("game_tutorial_finish")` | Selalu |

---

## 6. SDK DATA FIELDS — MAPPING LENGKAP

### 6.1 getSdkLoginInfo() Return Object

```javascript
{
    sdk: string,          // 'ppgame'
    loginToken: string,   // Session token dari SDK-Server
    nickName: string,     // Display name
    userId: string,       // Unique ID (format: 'guest_XXXX' atau custom)
    sign: string,         // Signature — HANYA dipakai di ReportToCpapiCreaterole
    security: string      // Security code — HANYA dipakai di SaveHistory request
}
```

### 6.2 Internal Mapping setelah sdkLoginSuccess

| SDK Field | Game Field (ts.loginInfo.userInfo) | Game Field (ts.loginUserInfo) | Penggunaan |
|-----------|-----------------------------------|------------------------------|-----------|
| `sdk` | `channelCode` | `sdk` | Identifikasi channel di semua request |
| `loginToken` | `loginToken` | — | Auth token, diupdate oleh SaveHistory |
| `nickName` | `nickName` | — | Display name |
| `userId` | `userId` | `userId` | User ID di semua request |
| `sign` | — | `sign` | HANYA di ReportToCpapiCreaterole |
| `security` | `securityCode` | — | HANYA di SaveHistory request |

### 6.3 Field Name Variasi di Request ke Login-Server

| Action | Field untuk userId | Catatan |
|--------|-------------------|---------|
| `GetServerList` | `userId` | CamelCase |
| `SaveHistory` | `accountToken` | Alias |
| `SaveUserEnterInfo` | `accountToken` | Alias |
| `SaveLanguage` | `userid` | Huruf kecil! |

---

## 7. SIGN & SECURITY — ANALISA KRIPTOGRAFI

### 7.1 TEMUAN KRITIS: Sign TIDAK Perlu Kompleks

Berdasarkan analisa mendalam terhadap `main.min(unminfy).js`:

**`sign` — TIDAK PERNAH divalidasi oleh game client.** Flow-nya:

```
SDK-Server generate sign → sdk.js return sign → game store di ts.loginUserInfo.sign
→ sign dikirim ke external SDK (ReportToCpapiCreaterole) saja
→ TIDAK dikirim ke game server manapun
```

**`security` (→ securityCode) — HANYA dikirim di SaveHistory ke Login-Server.**

```
SDK-Server generate security → sdk.js return security → game store di securityCode
→ securityCode dikirim di SaveHistory request ke Login-Server
→ Login-Server validasi securityCode terhadap data yang dimilikinya
```

### 7.2 Implementasi Sign & Security

Karena game TIDAK melakukan validasi client-side terhadap sign/security, dan server-side validation sepenuhnya kendali kita:

**sign:**
```javascript
// SDK-Server generate:
sign = MD5(userId + secretKey)
// Contoh: sign = md5('guest_a1b2c3d4' + 'SUPER_WARRIOR_Z_SDK_SECRET_2026')
```

**securityCode (security):**
```javascript
// SDK-Server generate:
securityCode = randomHex(16)
// Contoh: 'f8a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5'
```

**Alasan:**
- `sign` hanya dipakai sebagai identifier/passthrough ke external SDK call (ReportToCpapiCreaterole). Tidak ada validasi kriptografi di game client.
- `securityCode` hanya dipakai untuk verifikasi SaveHistory di Login-Server. Karena kedua server kita kendali, format bebas selama konsisten.
- Game client hanya menyimpan dan meneruskan kedua value ini — TIDAK pernah menghitung atau memvalidasi.

### 7.3 Kriptografi yang Ada di main.min.js

| Algoritma | Class | Line | Kegunaan | Relevan SDK? |
|-----------|-------|------|----------|-------------|
| MD5 | `md5` | 37380 | Chat report signing (salt: `0acc53af8679849572afd232158c`) | ❌ Tidak |
| XXTEA (string) | `TEA` | 117041 | Socket verify handshake, key: `'verification'` | ❌ Tidak |
| XXTEA (binary) | `TSTea` | 113326 | Image asset decryption, magic: `onepieceencrypts` | ❌ Tidak |
| Base64 | `Base64` | 116969 | Encoding untuk TEA output | ❌ Tidak |
| UTF-8 | `Utf8` | 117017 | Encoding helper | ❌ Tidak |

**Hanya MD5 yang relevan untuk SDK-Server** — dipakai untuk generate `sign`.

### 7.4 Chat Report Sign (BAGIAN TERPISAH — bukan SDK sign)

```javascript
// Line 207030, 225248 — sign untuk chat report ke external service
// Formula: MD5(urlEncode('288') + urlEncode('S'+serverId) + urlEncode(userId) + timestamp + '0acc53af8679849572afd232158c')
// Salt hardcoded: '0acc53af8679849572afd232158c'
// Ini bukan bagian SDK-Server, tapi bagian chat reporting ke external service
```

### 7.5 Autentikasi Game Server — BUKAN sign-based

Game server TIDAK menggunakan `sign` untuk autentikasi request. Autentikasi dilakukan melalui:

1. **Socket Verification Handshake** — TEA encrypt challenge dengan key `'verification'`
2. **loginToken** — Dikirim di `enterGame` ke Main-Server, server validasi token ini
3. **securityCode** — HANYA di `SaveHistory` ke Login-Server

```
Autentikasi Login-Server:
  Connect → (tanpa TEA) → handler.process → SaveHistory dengan securityCode

Autentikasi Main-Server:
  Connect → TEA handshake → handler.process → enterGame dengan loginToken

Autentikasi Chat-Server:
  Connect → TEA handshake → handler.process

Autentikasi Dungeon-Server:
  Connect → TEA handshake → handler.process
```

---

## 8. PAYMENT FLOW — IMPLEMENTASI LENGKAP

### 8.1 Arsitektur Payment — Localhost Gateway

```
┌──────────┐   processHandler()   ┌──────────────┐   prePayRet     ┌──────────┐
│  Client   │ ─────────────────▶  │  Main-Server  │ ─────────────▶  │  Client   │
│           │  {type,action,      │  (8001)       │  {errorCode,    │           │
│           │   userId, ...}       │               │   data:{...}}   │           │
└──────────┘                      └──────┬───────┘                 └─────┬────┘
                                         │                               │
                                  Main-Server simpan                    │
                                  order ke main.db                     payToSdk(prePayRet.data)
                                                                         │
                                                                         ▼
                                                                  ┌──────────────┐
                                                                  │  sdk.js       │
                                                                  │  PPGAME       │
                                                                  │  .createPay.. │
                                                                  └──────┬───────┘
                                                                         │
                                                                  POST /payment/create
                                                                         │
                                                                         ▼
                                                                  ┌──────────────┐
                                                                  │  SDK-Server   │
                                                                  │  (9999)       │
                                                                  │  Payment GW   │
                                                                  │  localhost    │
                                                                  └──────┬───────┘
                                                                         │
                                                                  POST /payment/confirm
                                                                  (setelah user konfirmasi)
                                                                         │
                                                                         ▼
┌──────────┐   Notify 'payFinish'  ┌──────────────┐  POST /api/payment/callback  ┌──────────────┐
│  Client   │ ◀─────────────────── │  Main-Server  │ ◀─────────────────────────── │  SDK-Server   │
│           │  (socket push)       │  (8001)       │  {paymentId,orderId,userId}  │  (9999)       │
└──────────┘                       └──────────────┘   server-to-server ───────────└──────────────┘
```

### 8.2 Payment Actions — Semua yang Menghasilkan prePayRet

| type | action | Deskripsi | Line |
|------|--------|-----------|------|
| `activity` | `buyFund` | Activity fund | 141123 |
| `activity` | `heroRewardBuyToken` | Hero reward token | 143608 |
| `activity` | `buyDailyDiscount` | Daily discount | 146884 |
| `activity` | `buyHeroSuperGift` | Hero super gift | 148163 |
| `activity` | `diamondShop` | Diamond shop | 152599 |
| `timeBonus` | `buyBonus` | Time-limited bonus | 145319 |
| `gift` | `buyVipGift` | VIP prerogative gift | 220163 |
| `gift` | `buyFund` | Growth fund | 220332 |
| `recharge` | `recharge` | Direct recharge | 220750 |
| `monthCard` | `buyCard` | Month card | 219627 |
| `battleMedal` | `buySuper` | Battle medal super | 219667 |
| `trial` | `buyFund` | Temple privilege fund | 211402 |
| `hangup` | `buyLessonFund` | Lesson fund | 211416 |

### 8.3 prePayRet Data Structure

```javascript
// Response dari Main-Server setelah buy/recharge request:
{
    prePayRet: {
        errorCode: 0,      // 0 = success, selain itu = gagal
        data: {             // ← dikirim ke paySdk() → PPGAME.createPaymentOrder()
            orderId: string,        // ID unik order
            productId: string,      // ID produk
            productName: string,    // Nama produk
            price: number,          // Harga
            currency: string,       // Kode mata uang (USD, IDR, dll.)
            userId: string,         // User ID
            serverId: string,       // Server ID
            roleId: string,         // Role ID
            roleName: string,       // Role name
            roleLevel: number,      // Role level
            roleVip: number,        // VIP level
            serverName: string,     // Server name
            timestamp: number,      // Waktu order
            extra: string           // Data tambahan (JSON string)
        }
    }
}
```

**Catatan:** Jika `checkFromNative()` return true (PPGAME: false), client menambahkan field `roleId`, `roleName`, `roleLevel`, `roleVip`, `serverName` ke orderData sebelum dikirim ke `paySdk()`.

### 8.4 Payment Gateway Endpoints — SDK-Server

| Method | Path | Deskripsi | Request | Response |
|--------|------|-----------|---------|----------|
| POST | `/payment/create` | Buat payment order | orderData dari prePayRet | `{paymentId, status, payUrl}` |
| POST | `/payment/confirm` | Konfirmasi payment sukses | `{paymentId, orderId}` | `{success, message}` — lalu SDK-Server notify Main-Server via `POST /api/payment/callback` |
| GET | `/payment/status/:paymentId` | Cek status payment | — | `{status, orderId}` |
| GET | `/payment/list/:userId` | Riwayat payment user | — | `[{paymentId, orderId, status, amount, createdAt}]` |

### 8.5 Payment Flow — Step by Step

```
1. User klik beli di game
2. Client → Main-Server: processHandler({type:'recharge', action:'recharge', ...})
3. Main-Server → Client: {prePayRet: {errorCode:0, data:{orderId, productId, price, ...}}}
4. Client → paySdk(prePayRet.data) → PPGAME.createPaymentOrder(orderData)
5. sdk.js → POST /payment/create ke SDK-Server
6. SDK-Server simpan order ke db, return {paymentId, status:'pending'}
7. sdk.js TAMPILKAN KONFIRMASI PAYMENT UI (modal dialog)
   ┌──────────────────────────────────┐
   │  Payment Confirmation            │
   │                                  │
   │  Product: Diamond x100           │
   │  Price: $0.99                    │
   │                                  │
   │  [Confirm]  [Cancel]             │
   └──────────────────────────────────┘
8. User klik [Confirm]
9. sdk.js → POST /payment/confirm ke SDK-Server
10. SDK-Server update status → 'success', simpan ke db
11. SDK-Server → POST http://127.0.0.1:8001/api/payment/callback {paymentId, orderId, userId, status}
    Main-Server verifikasi order → update user data → simpan ke main.db
12. Main-Server push Notify 'payFinish' ke client
13. Client refresh UI, tampilkan reward

**Keputusan Payment Notify (Option B):** SDK-Server notify Main-Server secara server-to-server, BUKAN melalui client. Ini lebih reliable karena tidak bergantung pada koneksi client yang bisa terputus.
```

### 8.6 payFinish Notify Data Structure

```javascript
// Main-Server push ke client via socket 'Notify':
{
    action: 'payFinish',
    _code: 0,              // 0 = success
    _goodType: number,     // GOOD_TYPE enum
    _goodId: number,       // Item/goods ID
    _detail: {
        _totalPrice: number,    // Total price (USD, dilaporkan ke FB Analytics)
        _haveBought: {...},     // RECHARGE type
        _card: {_endTime},     // MONTH_CARD type
        _buyCount: number,     // LEVEL_BUY_GIFT type
        _buyTimes: number,     // ACT_NEW_SERVER_GIFT type
        _buyTime: number,      // ACT_FUND type
        _haveBrought: boolean, // ACT_DAILY_DISCOUNT type
        _buyTokenTimes: number // ACT_HERO_REWARD_TOKEN type
    }
}
```

### 8.7 Currency System

```javascript
// DIAMONDID = 101 (Line 116237)
// GOLDID = 102
// Currency ditentukan oleh Main-Server di enterGame response: ts.currency = e.currency
// Price display: ToolCommon.getPriceInfoWithCurrency(price)
//   → Format: currencyDisplay[currency][language] → e.g. "${0}", "₩{0}", "Rp{0}"
```

---

## 9. SDK REPORTING & ANALYTICS

### 9.1 ReportDataType Enum

```javascript
// Line 116910-116943
1=ChangeServer, 2=CreateRole, 3=EnterGame, 4=LevelUp, 5=ExitGame,
6=ChangeName, 7=EndGuide, 8=GetFirstRecharge, 9=GetVipLevelReward,
10=LevelAchieved, 11-15=LevelAchieved variants, 17-21=LevelAchieved20-40,
22=SecondDaySign, 23-26=userLevelAchieved variants, 27=firstViewRechargePanel,
28=blackStoneLoginCount4, 29=blackStoneLoginCount6, 30=blackStoneLessonFinish,
31=EnterGameFalse, 32=UserVipLevelUP
```

### 9.2 ReportSdkInfoXX — Dispatcher

```javascript
// Line 83256-83314 — 3 branch:

// BRANCH 1: SDK V2 (window.issdkVer2 = true) — PPGAME: TIDAK AKTIF
// BRANCH 2: TC (Tencent) channel — PPGAME: TIDAK AKTIF
// BRANCH 3: Default (PPGAME dan channel lain) — INI YANG DIPAKAI
var n = {
    dataType: e,        // ReportDataType enum value
    appid: 0,           // Selalu 0
    serverID: string,
    serverName: string,
    userId: string,      // ts.loginUserInfo.userId
    roleID: string,      // Game role ID
    roleName: string,
    roleLevel: number,
    moneyNum: number,    // Diamond count (DIAMONDID=101)
    vipLevel: string
};
ts.reportToSdkXX(n);  // → window.report2Sdk(n)
```

### 9.3 PPGAME Routing (di index.html bridge)

| dataType | ReportDataType | Action PPGAME |
|----------|---------------|---------------|
| 2 | CreateRole | `PPGAME.submitEvent("game_create_role", data)` |
| 3 | EnterGame | `PPGAME.playerEnterServer(data)` |
| lainnya | apapun | **SILENT — tidak di-handle** |

### 9.4 reportLogToPP Events

| Event | Line | Kapan |
|-------|------|-------|
| `'endLoadResource'` | 137853 | Setelah resource loaded |
| `'startPlay'` | 137902 | User klik Start |
| `'connectLoginSocket'` | 137924 | Connect ke login server |
| `'disConnectLoginSocket'` | 137915 | Disconnect login server |
| `'enterServerList'` | 138036 | Server list ditampilkan |
| `'connectGame78Socket'` | 114417 | Connect ke game server |
| `'disconnectGame78Socket'` | 114524 | Disconnect game server |
| `'inGame'` | 233477 | Masuk home screen |
| `'enterLoadingPage'` | 236631 | First enter loading |

### 9.5 ThinkingData — TIDAK AKTIF untuk PPGAME

```javascript
// Line 88938-88975
ThinkingdataSingleton.checkUseThinkingData = function (e) {
    this.useThinkingData = 'Blackstone' == e;  // Hanya aktif untuk 'Blackstone'
};
// PPGAME: useThinkingData = false → TIDAK ada ThinkingData tracking
```

---

## 10. TEA VERIFICATION HANDSHAKE

### 10.1 Verify Flow

```
Client                              Server
  │                                   │
  │──── io.connect() ───────────────▶│
  │◀─── 'connect' ──────────────────│
  │                                   │
  │   [if verifyEnable == true]       │
  │                                   │
  │◀─── 'verify' (challenge) ────────│  Server kirim challenge string
  │                                   │
  │ encrypted = TEA.encrypt(          │
  │   challenge, 'verification'       │  Key: selalu 'verification'
  │ )                                 │
  │                                   │
  │──── 'verify' (encrypted) ───────▶│  Client kirim encrypted response
  │                                   │
  │◀─── callback({ret:0}) ──────────│  OK, verifikasi berhasil
  │  atau                             │
  │◀─── callback({ret:errorCode}) ───│  Gagal → socket destroy
```

### 10.2 TEA Algorithm — XXTEA (Corrected Block TEA)

```javascript
// Line 117041-117091
// Delta: 0x9E3779B9 (golden ratio)
// Key: UTF-8 encode, slice first 16 chars → 4 × 32-bit words
// Rounds: floor(6 + 52/n) dimana n = jumlah 32-bit data words
// Output: Base64.encode(encrypted)
// Decrypt: reverse process
```

### 10.3 VerifyEnable per Server

| Server | Port | verifyEnable | TEA Handshake |
|--------|------|-------------|---------------|
| login-server | 8000 | `false` | **TIDAK** — langsung connect |
| main-server | 8001 | `true` | **YA** — wajib TEA verify |
| chat-server | 8002 | `true` | **YA** — wajib TEA verify |
| dungeon-server | 8003 | `true` | **YA** — wajib TEA verify |

---

## 11. SERVER CONNECTION ARCHITECTURE

### 11.1 Socket.IO Events

| Event | Direction | Deskripsi | Server |
|-------|-----------|-----------|--------|
| `'handler.process'` | Client→Server | Request utama semua action | Semua |
| `'handler.process'` callback | Server→Client | Response | Semua |
| `'verify'` | Server→Client | Challenge TEA handshake | Main, Chat, Dungeon |
| `'verify'` | Client→Server | Encrypted response | Main, Chat, Dungeon |
| `'Notify'` | Server→Client | Push notifications | Main-Server |

### 11.2 Response Envelope Format

```javascript
// Semua server:
{
    ret: number,          // 0 = success
    data: string,         // JSON string (raw atau LZString compressed)
    compress: boolean,    // true = LZString compressed
    serverTime: number,   // WAJIB: Date.now()
    server0Time: number   // WAJIB: 25200000 (fixed value — UTC+7 offset dalam ms)
}
```

### 11.3 enterGame Response — Data Lengkap

```javascript
// Line 114793-114873 — Struktur data dari Main-Server:
{
    currency: string,
    user: {_id, _pwd, _nickName, _headImage, _lastLoginTime, _createTime, ...},
    hangup: {_curLess, _maxPassLesson, _haveGotChapterReward, ...},
    summon: {_energy, _wishList, _wishVersion, ...},
    totalProps: {_items: [{_id, _num}]},
    heros: [...],
    heroSkin: [...],
    superSkill: [...],
    checkin: {...},
    dungeon: {_dungeons: [...]},
    userGuild: {...},
    equip: [...],
    curMainTask: {...},
    giftInfo: {_fristRecharge, _haveGotVipRewrd, _buyVipGiftCount, ...},
    monthCard: {...},
    recharge: {...},
    timesInfo: {...},
    scheduleInfo: {...},
    guide: {...},
    newUser: boolean,     // NEW USER FLAG → trigger CreateRole report
    serverVersion: string,
    serverOpenDate: number,
    lastTeam: {...},
    training: {...},
    battleMedal: {...},
    teamDungeon: {...},
    broadcastRecord: [...],  // Chat broadcast
    // ... dan banyak field lainnya
}
```

---

## 12. WINDOW VARIABLES — KONFIGURASI RUNTIME

### 12.1 Variabel yang Di-set di index.html

```javascript
window["Log_Clean"] = false;
window["debug"] = true;
window["sdkChannel"] = "ppgame";
window["gameIcon"] = "";
window["debugLanguage"] = "en";
```

### 12.2 Variabel yang Dibaca dari main.min.js

| Variable | Type | Default PPGAME | Penggunaan | Line |
|----------|------|---------------|-----------|------|
| `window.sdkChannel` | `string` | `'ppgame'` | Analytics routing, channel identification | 114178 |
| `window.sdkNativeChannel` | `string` | `undefined` | UI button visibility per channel | 114155 |
| `window.issdkVer2` | `boolean` | `false` | Report format v2 (hanya EnterGame) | 83257 |
| `window.serverList` | `object` | `undefined` | Server whitelist filter | 138062 |
| `window.gameIcon` | `string` | `''` | Login background image selection | 137845 |
| `window.supportLang` | `array` | `undefined` | Language selector visibility & list | 137851 |
| `window.hideShop` | `boolean` | `false` | Hide shop button | 233461 |
| `window.show18Login` | `boolean` | `false` | 18+ badge on login screen | 137840 |
| `window.show18Home` | `boolean` | `false` | 18+ badge on home screen | 233476 |
| `window.showSixteenImg` | `boolean` | `false` | 16+ image on login | 137850 |
| `window.contactSdk` | `function` | `undefined` | Customer service callback | 114158 |
| `window.showContact` | `boolean` | `false` | Contact button visibility | 114158 |
| `window.userCenterSdk` | `function` | `undefined` | User center callback | 114162 |
| `window.switchAccountSdk` | `function` | `undefined` | Switch account (tanwan55en) | 114164 |
| `window.fbGiveLiveSdk` | `function` | `undefined` | Facebook Live Like (tanwan55en) | 231750 |
| `window.reportToFbq` | `function` | `undefined` | BSH5 Facebook pixel reporting | 114181 |
| `window.reportToBSH5Createrole` | `function` | `undefined` | BSH5 role creation reporting | 114176 |
| `window.getQueryStringByName` | `function` | defined in HTML | URL params | 42 |
| `window.loginpictype` | `number` | `undefined` | -2 = custom login pic, else default | 137840 |
| `window.loginpic` | `string` | `undefined` | URL login background (when loginpictype=-2) | 137841 |
| `window.privacyUrl` | `string` | `undefined` | Privacy policy link (shown for Huawei) | 137870 |
| `window.debugUrl` | `string` | `undefined` | Custom resource base URL for debug | 83183 |
| `window.clientver` | `string` | `undefined` | Client version override | 83711 |
| `window.clientserver` | `string` | `undefined` | Resource server URL (WeChat) | 83716 |
| `window.versionConfig` | `string` | `undefined` | Version config override | 87129 |
| `window.showCurChannel` | `string` | `undefined` | Facebook button channel config | 114160 |
| `window.battleAudio` | `boolean` | `undefined` | Force battle audio on | 97663 |

### 12.3 Variabel Internal yang Di-set oleh Game Code (READ-ONLY untuk SDK)

Variabel-variabel ini di-set oleh game code (main.min.js) sebagai response dari server atau sebagai state internal. SDK TIDAK perlu meng-set variabel ini, tapi perlu tahu bahwa mereka ada:

| Variable | Type | Penggunaan | Line |
|----------|------|-----------|------|
| `window.battleAudio` | `boolean` | Override battle audio setting | 97663 |
| `window.dotq` | `array` | Yahoo tracking queue (sdkChannel='en') | 114184 |
| `window.maskLayerClear` | `function` | Clear loading mask | 86854 |
| `window.loadJsonFunc` | `function` | Load JSON from preloaded window vars | index.html:125 |
| `window.refreshPage` | `function` | Reload page | index.html:129 |

### 12.4 isNoSdk Flag — Penentu Alur Login

```javascript
// Line 137871
UserInfoSingleton.getInstance().isNoSdk = 'game_origin' == o.sdk;
```

**Penjelasan:**
- Jika `sdk === 'game_origin'` → `isNoSdk = true` → game berperilaku tanpa SDK
- Jika `sdk !== 'game_origin'` (termasuk `'ppgame'`) → `isNoSdk = false` → game berperilaku dengan SDK
- **PPGAME: `sdk = 'ppgame'` → `isNoSdk = false`** — ini yang kita inginkan, game menggunakan SDK login path

Flag ini mempengaruhi:
- `isFromSdk` property di Login class → `true` ketika SDK login berhasil
- Tombol logout: `logoutBtnTap` → `isFromSdk ? refreshServerList() : showDefaultLoginStatus()`
- ThinkingData activation: `checkUseThinkingData(sdk)` → hanya aktif untuk `'Blackstone'`

### 12.5 saveLanguage — Request ke Login-Server

```javascript
// Line 114279-114296
saveLanguage: function(lang) {
    var t = TSBrowser.executeFunction('getAppId') || '';
    var n = TSBrowser.executeFunction('getSdkLoginInfo');
    var o = ts.loginUserInfo.userId;
    var a = ts.loginUserInfo.sdk;
    
    // Fallback jika loginUserInfo belum populated
    if (!o && n) { o = n.userId; a = n.sdk; }
    
    var r = {
        type: 'User',
        action: 'SaveLanguage',
        userid: ts.loginUserInfo.userId,   // ← PERHATIAN: huruf kecil 'userid'!
        sdk: ts.loginUserInfo.sdk,
        appid: t,
        language: lang
    };
    ts.processHandlerWithLogin(r, true, successCallback, errorCallback);
}
```

**PERHATIAN:** Field `userid` menggunakan huruf kecil, berbeda dengan `GetServerList` yang pakai `userId` (CamelCase). Ini quirk dari game client yang HARUS dihandle Login-Server.

### 12.6 clientLoginUser — Origin Login (Fallback tanpa SDK)

```javascript
// Line 114369-114385
clientLoginUser: function(username, password, fromChannel, callback) {
    var subChannel = TSBrowser.executeFunction('getAppId') || '';
    var requestData = {
        type: 'User',
        action: 'loginGame',
        userId: username,
        password: password,
        fromChannel: fromChannel,
        channelName: '',
        headImageUrl: '',
        nickName: '',
        subChannel: subChannel,
        version: '1.0'
    };
    ts.processHandlerWithLogin(requestData, false, callback);
}
```

**Alur Origin Login** (Line 137977-137990):
```
1. checkLastLogin() → baca dari localStorage
2. doOriginLoginRequest(credentials)
3. credentials.password = 'game_origin' (default jika tidak ada password)
4. clientLoginUser(username, password, password, callback)
5. callback → clientRequestServerList → selectServer
```

**Untuk PPGAME:** Alur ini TIDAK pernah dijalankan karena `checkSDK()` return `true`. Login-Server tetap perlu implement `loginGame` action untuk backward compatibility, tapi **untuk Phase 1 SDK fokus, loginGame SKIP dulu** — akan diimplement di Phase 2 (Login-Server).

---

## 13. SDK CHANNEL UI VISIBILITY — LOGIKA PER-CHANNEL

### 13.1 UI Button Visibility Functions

Game client memiliki 6 function yang menentukan visibility tombol SDK di UI Settings dan Login. Semua bergantung pada `window.sdkNativeChannel` dan/atau `window.sdkChannel`. Untuk PPGAME (`sdkNativeChannel = undefined`), sebagian besar tombol HIDDEN.

```javascript
// Line 114155-114166
```

| Function | Logic | PPGAME Result | Catatan |
|----------|-------|--------------|---------|
| `getSDKCDKEYBtnShow()` | `window.sdkNativeChannel ? true : true` | **`true`** | Selalu true! Logic bug — kedua branch return true |
| `getSDKContactBtnShow()` | `window.contactSdk ? (window.showContact ? true : sdkNativeChannel in ['tanwan55en','kr']) : false` | **`false`** | contactSdk undefined → false |
| `getSDKtoFacebookBtnShow()` | `window.showCurChannel ? complex logic : false` | **`false`** | showCurChannel undefined → false |
| `getSDKuserCenterBtnShow()` | `window.userCenterSdk && sdkNativeChannel === 'tanwan55en'` | **`false`** | userCenterSdk undefined → false |
| `getSDKSwitchAccount()` | `window.switchAccountSdk && sdkNativeChannel === 'tanwan55en'` | **`false`** | switchAccountSdk undefined → false |
| `getSDKLoginSwitchAccount()` | `window.switchUser && sdkNativeChannel in ['kr','vi']` | **`false`** | sdkNativeChannel undefined → false |

### 13.2 Implikasi untuk sdk.js PPGAME

Untuk PPGAME, kita TIDAK perlu mengimplementasi:
- `window.contactSdk` — tombol hidden
- `window.userCenterSdk` — tombol hidden
- `window.switchAccountSdk` — tombol hidden
- `window.fbGiveLiveSdk` — hanya tanwan55en
- `window.showContact` — tidak perlu
- `window.showCurChannel` — tidak perlu

Yang perlu diimplementasi minimal:
- `window.switchUser` — dipakai di `getSDKLoginSwitchAccount()` dan di Login screen (Line 191790-191798), tapi untuk PPGAME bisa diabaikan karena `sdkNativeChannel` undefined → tombol hidden
- `window.contactSdk` — dipanggil langsung di Line 138117 tanpa visibility check, tapi TIDAK error jika undefined (hanya if-check)

### 13.3 checkMoyaSdk — Korean/Taiwan Logic

```javascript
// Line 114202
checkMoyaSdk: function() {
    return ('kr' == window.sdkNativeChannel || 'kr' == window.sdkChannel) 
           && 'tw' == ToolCommon.getLanguage() 
           ? true : false;
}
```

**PPGAME:** `sdkChannel = 'ppgame'` ≠ `'kr'` → `checkMoyaSdk() = false` → TIDAK ada Moya SDK behavior.

### 13.4 Login Screen — sdkChannel Logic

```javascript
// Line 191676
if ('jr' == window.sdkChannel) {
    e.switchAccountBtn.parent.visible = false;
    e.switchAccountBtn.parent.includeInLayout = false;
}
```

**PPGAME:** `sdkChannel = 'ppgame'` ≠ `'jr'` → switch account button tetap visible (tapi hidden oleh `getSDKLoginSwitchAccount()` yang return false).

### 13.5 Home Scene — goHome Channel Logic

```javascript
// Line 236669-236670
if (window && window.sdkChannel && 'sylz' != window.sdkChannel && '' != window.sdkChannel) {
    var o = 'leida_' + window.sdkChannel;
    n.push(o);
}
```

**PPGAME:** `sdkChannel = 'ppgame'` ≠ `'sylz'` ≠ `''` → push `'leida_ppgame'` ke array. Ini untuk resource group selection — game mencoba load resource group `leida_ppgame`. Jika group tidak ada, fallback ke default. **Tidak perlu action khusus.**

---

## 14. THIRD-PARTY ANALYTICS — FB/YAHOO/GOOGLE

### 14.1 Overview

Game client terintegrasi dengan beberapa third-party analytics service. Semua hanya aktif untuk channel tertentu (`sdkChannel === 'en'`). Untuk PPGAME, semua ini **TIDAK AKTIF**.

### 14.2 Facebook Pixel — `reportToEnFaceBookSdk`

```javascript
// Line 114177-114179
reportToEnFaceBookSdk: function(e) {
    var t = TSBrowser.getVariantValue('sdkChannel');
    'en' == t && TSBrowser.executeFunction('fbq', e.actionName, e.eventName);
}
```

**PPGAME:** `sdkChannel = 'ppgame'` ≠ `'en'` → **TIDAK AKTIF**

### 14.3 BSH5 Facebook Pixel — `reportToBsH5FaceBookSdk`

```javascript
// Line 114180-114181
reportToBsH5FaceBookSdk: function(e) {
    window && window.reportToFbq && window.reportToFbq(e);
}
```

**PPGAME:** `window.reportToFbq` undefined → **TIDAK AKTIF**

### 14.4 Yahoo Analytics — `reportToEnYaHooSdk`

```javascript
// Line 114182-114196
reportToEnYaHooSdk: function(e) {
    var t = TSBrowser.getVariantValue('sdkChannel');
    'en' == t && window.dotq && (window.dotq = window.dotq || [], window.dotq.push({
        projectId: '10000',
        properties: {
            pixelId: '1000XXXX',
            qstrings: { et: 'custom', ea: e }
        }
    }));
}
```

**PPGAME:** `sdkChannel = 'ppgame'` ≠ `'en'` → **TIDAK AKTIF**

### 14.5 Google Analytics — `reportToEnGoogleSdk`

```javascript
// Line 114195-114197
reportToEnGoogleSdk: function(e) {
    var t = TSBrowser.getVariantValue('sdkChannel');
    'en' == t && TSBrowser.executeFunction('gtag', 'event', 'conversion', { send_to: e });
}
```

**Conversion ID contoh:** `'AW-727890639/fHr2CNfov6UBEM_1itsC'` (Line 114531)

**PPGAME:** `sdkChannel = 'ppgame'` ≠ `'en'` → **TIDAK AKTIF**

### 14.6 350 Platform — `reportTo350CreateRole` / `report2Sdk350LoginUser`

```javascript
// Line 114198-114201
reportTo350CreateRole: function(e) {
    TSBrowser.executeFunction('report2Sdk350CreateRole', e);
},
report2Sdk350LoginUser: function(e) {
    TSBrowser.executeFunction('report2Sdk350LoginUser', e);
}
```

**PPGAME:** `window.report2Sdk350CreateRole` dan `window.report2Sdk350LoginUser` undefined → TSBrowser.executeFunction return `undefined` → **TIDAK AKTIF**

### 14.7 ThinkingData — Analytics Platform

```javascript
// Line 88938
var ThinkingdataAppId = 'da5e91639fc948399ba6c9523f593944';
var ThinkingdataServerUrl = 'https://ssweb.episodezz.com';

// Line 88956-88957
ThinkingdataSingleton.checkUseThinkingData = function(e) {
    this.useThinkingData = 'Blackstone' == e;
};
```

**PPGAME:** `sdk = 'ppgame'` ≠ `'Blackstone'` → `useThinkingData = false` → **TIDAK AKTIF**

### 14.8 ReportToCpapiCreaterole — CP API (gameId: 261)

```javascript
// Line 83327-83335
ReportToCpapiCreaterole: function() {
    var e = {
        gameId: 261,
        userId: ts.loginUserInfo.userId,
        areaId: UserInfoSingleton.getInstance().getServerId(),
        roleName: UserInfoSingleton.getInstance().userNickName,
        sign: ts.loginUserInfo.sign
    };
    ts.reportToCpapiCreaterole(e);  // → window.reportToCpapiCreaterole(e)
}
```

**PPGAME:** `window.reportToCpapiCreaterole` undefined → TSBrowser.executeFunction return `undefined` → **TIDAK AKTIF.** Namun data tetap disiapkan oleh game. Jika kita ingin capture data ini, kita bisa implement `window.reportToCpapiCreaterole` di sdk.js.

### 14.9 ReportToBSH5Createrole — BSH5 Role Creation

```javascript
// Line 83336-83347
ReportToBSH5Createrole: function() {
    var e = {
        uid: ts.loginUserInfo.userId,
        serverName: ts.loginUserInfo.serverName,
        userRoleName: UserInfoSingleton.getInstance().userNickName,
        userRoleId: UserInfoSingleton.getInstance().userId,
        userRoleLevel: UserInfoSingleton.getInstance().getUserLevel(),
        vipLevel: UserInfoSingleton.getInstance().userVipLevel,
        partyName: '',
        userRoleBalance: '',
        serverId: ts.loginUserInfo.serverId
    };
    window.reportToBSH5Createrole && window.reportToBSH5Createrole(e);
}
```

**PPGAME:** `window.reportToBSH5Createrole` undefined → if-check fails → **TIDAK AKTIF**

### 14.10 Summary — Third-Party Analytics untuk PPGAME

| Service | Channel Required | PPGAME Status | Action Needed |
|---------|-----------------|---------------|---------------|
| Facebook Pixel (en) | `sdkChannel === 'en'` | ❌ Tidak Aktif | Tidak perlu |
| BSH5 Facebook | `window.reportToFbq` | ❌ Tidak Aktif | Tidak perlu |
| Yahoo Analytics | `sdkChannel === 'en'` | ❌ Tidak Aktif | Tidak perlu |
| Google Analytics | `sdkChannel === 'en'` | ❌ Tidak Aktif | Tidak perlu |
| 350 Platform | `window.report2Sdk350*` | ❌ Tidak Aktif | Tidak perlu |
| ThinkingData | `sdk === 'Blackstone'` | ❌ Tidak Aktif | Tidak perlu |
| CP API (gameId:261) | `window.reportToCpapiCreaterole` | ❌ Tidak Aktif | Opsional — bisa implement jika ingin tracking |
| BSH5 Role | `window.reportToBSH5Createrole` | ❌ Tidak Aktif | Opsional — bisa implement jika ingin tracking |

---

## 15. SDK-SERVER SPESIFIKASI — STANDALONE

### 15.1 Port & Transport

```
SDK-SERVER: Port 9999 (HTTP REST API — Express.js atau native http)
Database: better-sqlite3 ^11.7.0 — file: ./data/sdk.db
```

### 15.2 Endpoints

| Method | Path | Deskripsi | Request Body | Response |
|--------|------|-----------|-------------|----------|
| POST | `/auth/guest` | Guest login | `{}` | `{loginToken, sign, security, userId, nickName}` |
| POST | `/auth/login` | Login by UserID | `{userId}` | `{loginToken, sign, security, userId, nickName}` |
| POST | `/auth/validate` | Validasi token + securityCode | `{loginToken, userId, securityCode}` | `{valid, sign, securityCode}` — dipanggil oleh Login-Server |
| POST | `/payment/create` | Buat payment order | orderData dari prePayRet | `{paymentId, status, payUrl}` |
| POST | `/payment/confirm` | Konfirmasi payment | `{paymentId, orderId}` | `{success, message}` |
| GET | `/payment/status/:paymentId` | Cek status payment | — | `{status, orderId}` |
| GET | `/payment/list/:userId` | Riwayat payment | — | `[{paymentId, ...}]` |
| GET | `/user/info/:userId` | Info user | — | `{userId, nickName, ...}` |
| POST | `/event/report` | Report event dari sdk.js | `{eventType, data}` | `{success: true}` — **HANYA log ke console, tidak kirim ke external** |

### 15.3 Standalone Dependency

```json
{
    "name": "sdk-server",
    "version": "1.0.0",
    "description": "Super Warrior Z — SDK Server (Port 9999)",
    "main": "index.js",
    "dependencies": {
        "express": "^4.18.0",
        "better-sqlite3": "^11.7.0",
        "md5": "^2.3.0",
        "cors": "^2.8.5"
    }
}
```

### 15.4 CORS Configuration

**DECIDED:** SDK-Server menggunakan `cors` middleware dengan `Access-Control-Allow-Origin: *`.

**Alasan:**
- Game berjalan di `http://127.0.0.1:8080` (static file server)
- SDK-Server berjalan di `http://127.0.0.1:9999`
- Browser akan memblokir cross-origin request dari port 8080 ke 9999 tanpa CORS header
- Karena semua server berjalan di localhost, security risk minimal
- `cors: *` adalah pilihan paling sederhana dan reliable

```javascript
// SDK-Server (index.js):
const cors = require('cors');
app.use(cors({ origin: '*' }));  // Allow all origins — localhost only
```

**Alternatif yang DIPERTIMBANGKAN:**
- Proxy di game server → lebih kompleks, tidak perlu
- Specific origin `http://127.0.0.1:8080` → terlalu rigid, tidak ada keuntungan di localhost

### 15.5 Event Reporting — /event/report

**DECIDED:** Endpoint `POST /event/report` aktif dan menerima data, tapi HANYA log ke console server. Tidak ada kirim ke external service.

```javascript
// SDK-Server handler:
app.post('/event/report', (req, res) => {
    const { eventType, data } = req.body;
    console.log(`📊 EVENT ▸ ${eventType}`, data);
    // Hanya log — tidak kirim ke mana-mana
    res.json({ success: true });
});
```

**sdk.js memanggil endpoint ini ketika:**
- `PPGAME.playerEnterServer(data)` → POST /event/report dengan `{eventType: 'enterServer', data}`
- `PPGAME.submitEvent(eventName, data)` → POST /event/report dengan `{eventType: eventName, data}`
- `PPGAME.gameReady()` → POST /event/report dengan `{eventType: 'gameReady', data: {}}`
- `PPGAME.gameChapterFinish(id)` → POST /event/report dengan `{eventType: 'chapterFinish', data: {chapterId: id}}`
- `PPGAME.gameLevelUp(level)` → POST /event/report dengan `{eventType: 'levelUp', data: {level: level}}`

**Catatan:** Event tetap aktif (bukan no-op) agar flow `main.min.js` tetap berjalan natural. SDK-Server menerima dan mencatat di console, bukan mengabaikan.

### 15.6 Auth Response Format

```javascript
// POST /auth/guest response:
{
    loginToken: string,     // Session token — MD5(userId + timestamp + secretKey)
    sign: string,           // MD5(userId + secretKey)
    security: string,       // randomHex(16) — verifikasi Login-Server SaveHistory
    userId: string,         // 'guest_' + randomHex(8)
    nickName: string        // 'Guest_' + shortId
}

// POST /auth/login response (sama):
{
    loginToken: string,     // Session token baru
    sign: string,           // MD5(userId + secretKey) — konsisten
    security: string,       // securityCode user — dari db
    userId: string,         // userId yang diminta
    nickName: string        // nickName user — dari db
}

// POST /auth/validate response:
{
    valid: boolean,         // true jika loginToken cocok
    sign: string,           // sign user
    securityCode: string    // securityCode user (nama field berbeda: securityCode, bukan security)
}
```

### 15.7 Security Code Sharing dengan Login-Server — DECIDED: Option A

**Keputusan:** Login-Server memanggil SDK-Server API untuk verifikasi securityCode. Setiap server bisa baca data server lain via API, tapi tetap standalone (DB terpisah, dependency terpisah). Tidak ada shared config.

**Flow yang DIPAKAI (Option A):**
```
Login-Server menerima SaveHistory request dengan securityCode
Login-Server → POST http://127.0.0.1:9999/auth/validate
                    Body: {loginToken, userId, securityCode}
SDK-Server → cek di sdk.db → return {valid: true/false, sign, securityCode}
Login-Server → jika valid → lanjutkan SaveHistory
Login-Server → jika tidak valid → reject dengan error code 55 (SIGN_ERROR)
```

**Keuntungan:**
- SDK-Server = single source of truth untuk securityCode
- Tidak ada data duplication
- Mudah debug — semua verifikasi bisa dilihat di log kedua server
- Setiap server tetap fully standalone

---

## 16. SDK.JS — SPESIFIKASI IMPLEMENTASI

### 16.1 Loading Order

```
index.html memuat:
1. jszip-utils.min.js
2. jszip.min.js
3. sdk.js ← HARUS selesai init SEBELUM game code jalan
4. (game code loaded dynamically via loadMainCodeAsync)
```

### 16.2 Blocking Strategy

sdk.js menggunakan **blocking pattern** — game code TIDAK jalan sampai login selesai:

```javascript
// sdk.js blocking mechanism:
// 1. Segera set window.checkSDK = function() { return false; }  ← BLOCK game init
// 2. Tampilkan Login UI overlay
// 3. User klik tombol login
// 4. Lakukan HTTP request ke SDK-Server
// 5. Set window.getSdkLoginInfo = function() { return loginData; }
// 6. Update window.checkSDK = function() { return true; }  ← UNBLOCK
// 7. Tutup Login UI overlay
// 8. Game code saat ini memanggil getSdkLoginInfo() → dapat data
```

### 16.3 Structure

```javascript
(function() {
    'use strict';
    
    // ====== CONFIG ======
    var SDK_SERVER = 'http://127.0.0.1:9999';
    var CHANNEL = 'ppgame';
    var SECRET_KEY = 'SUPER_WARRIOR_Z_SDK_SECRET_2026';
    var STORAGE_KEY = 'ppgame_login';  // localStorage key
    
    // ====== STATE ======
    var _loginInfo = null;
    var _sdkReady = false;
    
    // ====== 1. BLOCK GAME INIT ======
    window.checkSDK = function() { return _sdkReady; };
    
    // ====== 2. LOGIN INFO GETTER ======
    window.getSdkLoginInfo = function() {
        if (!_loginInfo) return null;
        return {
            sdk: CHANNEL,
            loginToken: _loginInfo.loginToken,
            nickName: _loginInfo.nickName,
            userId: _loginInfo.userId,
            sign: _loginInfo.sign,
            security: _loginInfo.security
        };
    };
    
    // ====== 3. PPGAME OBJECT ======
    window.PPGAME = {
        createPaymentOrder: function(orderData) {
            // POST /payment/create ke SDK-Server
            // Tampilkan konfirmasi UI
            // POST /payment/confirm setelah user konfirmasi
            // SDK-Server notify Main-Server via /api/payment/callback
        },
        playerEnterServer: function(data) {
            // POST /event/report ke SDK-Server {eventType: 'enterServer', data}
        },
        submitEvent: function(eventName, data) {
            // POST /event/report ke SDK-Server {eventType: eventName, data}
        },
        gameReady: function() {
            // POST /event/report ke SDK-Server {eventType: 'gameReady', data: {}}
        },
        gameChapterFinish: function(chapterId) {
            // POST /event/report ke SDK-Server {eventType: 'chapterFinish', data: {chapterId}}
        },
        openShopPage: function() {
            // Buka shop UI
        },
        gameLevelUp: function(level) {
            // POST /event/report ke SDK-Server {eventType: 'levelUp', data: {level}}
        }
    };
    
    // ====== 4. WINDOW WRAPPER FUNCTIONS ======
    window.paySdk = function(a) { window.PPGAME.createPaymentOrder(a); };
    window.gameReady = function() { window.PPGAME.gameReady(); };
    window.report2Sdk = function(a) { /* routing logic */ };
    window.gameChapterFinish = function(a) { window.PPGAME.gameChapterFinish(a); };
    window.openShopPage = function() { window.PPGAME.openShopPage(); };
    window.gameLevelUp = function(a) { window.PPGAME.gameLevelUp(a); };
    window.tutorialFinish = function() { window.PPGAME.submitEvent("game_tutorial_finish"); };
    window.getAppId = function() { return ''; };
    window.getLoginServer = function() { return ''; };
    window.checkFromNative = function() { return false; };
    window.reportLogToPP = function(event, data) { /* log */ };
    window.changeLanguage = function(lang) { /* update */ };
    window.accountLoginCallback = function(fn) { window._exitCallback = fn; };
    window.switchAccount = function() { /* reload login UI */ };
    window.openURL = function(url) { window.open(url, '_blank'); };
    window.sendCustomEvent = function(name, data) { /* log */ };
    window.reload = function() { window.location.reload(); };
    // ... dan fungsi opsional lainnya
    
    // ====== 5. LOGIN UI ======
    // Tampilkan overlay dengan tombol:
    // - "Login as Guest"
    // - "Login by UserID" (input field)
    
    // ====== 6. AUTO-INIT ======
    // Cek localStorage key 'ppgame_login'
    // Jika ada session aktif → langsung restore tanpa UI
    // Jika tidak → tampilkan Login UI
})();
```

---

## 17. DATABASE SCHEMA — SDK-SERVER STANDALONE

### 17.1 Tabel: `users`

```sql
CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    loginToken TEXT NOT NULL,
    sign TEXT NOT NULL,
    securityCode TEXT NOT NULL,
    nickName TEXT NOT NULL DEFAULT 'Guest',
    sdk TEXT NOT NULL DEFAULT 'ppgame',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    lastLoginAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_loginToken ON users(loginToken);
CREATE INDEX IF NOT EXISTS idx_users_sdk ON users(sdk);
CREATE INDEX IF NOT EXISTS idx_users_lastLoginAt ON users(lastLoginAt);
```

### 17.2 Tabel: `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
    sessionId TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    loginToken TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    lastActivityAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
CREATE INDEX IF NOT EXISTS idx_sessions_loginToken ON sessions(loginToken);
```

**Catatan:** Tidak ada expiry — session aktif selamanya sesuai keputusan user.

### 17.3 Tabel: `payments`

```sql
CREATE TABLE IF NOT EXISTS payments (
    paymentId TEXT PRIMARY KEY,
    orderId TEXT NOT NULL,
    userId TEXT NOT NULL,
    productId TEXT,
    productName TEXT,
    price REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending',
    serverId TEXT,
    roleId TEXT,
    roleName TEXT,
    extra TEXT,
    createdAt INTEGER NOT NULL,
    confirmedAt INTEGER,
    FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX IF NOT EXISTS idx_payments_userId ON payments(userId);
CREATE INDEX IF NOT EXISTS idx_payments_orderId ON payments(orderId);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
```

### 17.4 Tabel: `events`

```sql
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    eventData TEXT,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX IF NOT EXISTS idx_events_userId ON events(userId);
CREATE INDEX IF NOT EXISTS idx_events_eventType ON events(eventType);
```

---

## 18. LOGIN UI — GUEST & USERID LOGIN

### 18.1 Login UI Overlay

sdk.js menampilkan overlay HTML di atas game canvas SEBELUM game code berjalan:

```
┌──────────────────────────────────────┐
│                                      │
│      SUPER WARRIOR Z                 │
│      SDK Login                       │
│                                      │
│   ┌──────────────────────────────┐   │
│   │  [Login as Guest]            │   │
│   │                              │   │
│   │  ─── atau ───               │   │
│   │                              │   │
│   │  UserID: [________________]  │   │
│   │  [Login by UserID]          │   │
│   └──────────────────────────────┘   │
│                                      │
└──────────────────────────────────────┘
```

### 18.2 Session Persistence

- Setelah login berhasil, simpan `{userId, loginToken}` ke `localStorage` dengan key **`ppgame_login`**
- Format: JSON string — `localStorage.setItem('ppgame_login', JSON.stringify({userId, loginToken}))`
- Saat buka kembali, cek `localStorage.getItem('ppgame_login')` → jika ada → parse → langsung restore tanpa UI
- Validasi session ke SDK-Server (`/auth/validate`) dengan `{loginToken, userId, securityCode}`
- Jika valid → langsung masuk game
- Jika tidak valid → hapus localStorage, tampilkan Login UI lagi

**Key name:** `ppgame_login`
**Format:** `{"userId":"guest_xxxx","loginToken":"abc123..."}`
**Alasan key name:** `ppgame_login` — singkat, jelas, unik. Tidak konflik dengan key lain di localStorage.

### 18.3 Guest Login Flow

```
1. User klik "Login as Guest"
2. POST /auth/guest → SDK-Server
3. SDK-Server:
   a. Generate userId = 'guest_' + randomHex(8)
   b. Generate loginToken = MD5(userId + Date.now() + secretKey)
   c. Generate sign = MD5(userId + secretKey)
   d. Generate securityCode = randomHex(16)
   e. Generate nickName = 'Guest_' + userId.slice(-4)
   f. INSERT ke users table
   g. INSERT ke sessions table
   h. Return {loginToken, sign, security, userId, nickName}
4. sdk.js cache data, set _sdkReady = true
5. Simpan ke localStorage: `ppgame_login` → `JSON.stringify({userId, loginToken})`
6. Tutup Login UI
7. Game code jalan → getSdkLoginInfo() → return data
```

### 18.4 UserID Login Flow

```
1. User masukkan UserID
2. POST /auth/login {userId} → SDK-Server
3. SDK-Server:
   a. Cek userId di users table
   b. Jika ada:
      - Generate loginToken baru
      - UPDATE users, INSERT sessions
      - Return data user
   c. Jika tidak ada:
      - Buat user baru dengan userId tersebut
      - nickName = userId (atau 'User_' + shortId)
      - Return data user baru
4. sdk.js cache data, set _sdkReady = true
5. Simpan ke localStorage: `ppgame_login` → `JSON.stringify({userId, loginToken})`
6. Tutup Login UI
7. Game code jalan → getSdkLoginInfo() → return data
```

---

## 19. ERROR CODES RELEVAN

| Code | errorType | Kapan | Hint | isKick |
|------|-----------|-------|------|--------|
| 1 | ERROR_UNKNOWN | Error umum | window | 0 |
| 3 | ERROR_DATA_ERROR | Data corrupt/invalid | window | 0 |
| 4 | ERROR_INVALID | Data tidak valid | window | 0 |
| 8 | ERROR_LACK_PARAM | Parameter kurang | window | 0 |
| 22 | — | Battle log trigger | — | — |
| 29 | IP_NOT_IN_WHITE_LIST | IP diblokir | window | 1 |
| 37 | ERROR_NO_LOGIN_CLIENT | User tidak ditemukan | window | 0 |
| 38 | ERROR_LOGIN_CHECK_FAILED | Force reload (version/auth) | window | — |
| 41 | PARAM_ERR | Parameter error | window | 0 |
| 45 | FORBIDDEN_LOGIN | Akun dilarang | window | 0 |
| 55 | SIGN_ERROR | securityCode mismatch | window | 0 |
| 61 | ONLINE_USER_MAX | Server penuh | window | 0 |
| 62 | CLIENT_VERSION_ERR | Versi tidak cocok | window | 0 |
| 65 | MAINTAIN | Maintenance | window | 0 |

**Error 38** → Client otomatis reload page. **Error 55** → securityCode tidak cocok di SaveHistory.

### 19.1 Error 38 — REQUIRES DEEPER ANALYSIS

**Status:** Belum sepenuhnya dipahami kapan Error 38 dikirim server dan kondisi apa yang memicunya.

**Yang diketahui dari main.min.js:**
- Error code 38 = `ERROR_LOGIN_CHECK_FAILED` (dari errorDefine.json)
- Ketika client menerima error 38 dari server → client otomatis `window.location.reload()`
- Ini adalah mekanisme "force reload" — server menyuruh client refresh page

**Kemungkinan kondisi Error 38 dikirim:**
1. Login session expired di server — server mendeteksi loginToken tidak valid
2. Version mismatch — server mendeteksi client version tidak cocok
3. Duplicate login — user login dari tempat lain, session lama di-invalidate
4. Security validation failed — securityCode tidak cocok saat verifikasi

**Yang perlu dianalisa lebih lanjut:**
- Telusuri di `main.min(unminfy).js` semua tempat yang mengirim error code 38
- Perhatikan di setiap server (Login, Main, Chat, Dungeon) kapan mereka mengirim code 38
- Definisikan kondisi spesifik di setiap server specification

**Untuk Phase 1 SDK:** Error 38 handling di client sudah jelas (auto-reload). Yang belum jelas adalah **kapan server mengirimnya** — ini akan didefinisikan saat masing-masing server diimplementasi di Phase 2-5.

---

## 20. CATATAN IMPLEMENTASI

### 20.1 Blocking Login

1. sdk.js **WAJIB** memblokir game init sampai login selesai
2. `window.checkSDK()` return `false` sampai login data tersedia
3. Login UI overlay ditampilkan di atas game canvas
4. Setelah login: `window.checkSDK()` return `true`, tutup overlay
5. Game init akan membaca `getSdkLoginInfo()` → mendapat data yang sudah siap

### 20.2 Session No Expiry

6. Session tidak pernah expired — user login sekali, tetap aktif selamanya
7. Simpan di `localStorage` key `ppgame_login` untuk persistence antar browser session
8. Saat buka kembali: cek `localStorage.getItem('ppgame_login')` → validate ke SDK-Server → langsung masuk

### 20.3 PPGAME Object

9. Implementasi langsung di sdk.js — tidak perlu ubah index.html bridge code
10. `window.PPGAME` object dibuat di sdk.js, index.html bridge code akan bekerja
11. index.html `if(window.PPGAME)` block akan menemukan PPGAME yang sudah di-set oleh sdk.js

### 20.4 Sign & Security

12. `sign` = `MD5(userId + secretKey)` — sederhana, cukup untuk identifikasi
13. `securityCode` = `randomHex(16)` — random, cukup untuk verifikasi
14. Keduanya TIDAK divalidasi oleh game client — hanya diteruskan ke server
15. Login-Server memvalidasi securityCode via SDK-Server API call

### 20.5 Payment

16. Payment gateway localhost — tanpa pihak ketiga
17. Alur lengkap: create order → konfirmasi UI → confirm → SDK-Server notify Main-Server (server-to-server)
18. SDK-Server mencatat semua payment di database
19. **Option B (DECIDED):** SDK-Server → POST `/api/payment/callback` ke Main-Server, BUKAN melalui client
20. Main-Server push `payFinish` Notify ke client setelah menerima callback dari SDK-Server
21. Retry mechanism: jika Main-Server tidak reachable, SDK-Server retry hingga 5x dengan interval 5s

### 20.6 Database

20. Setiap server: database file sendiri (`sdk.db`, `login.db`, `main.db`, `chat.db`, `dungeon.db`)
21. Setiap server: dependency sendiri (`package.json` sendiri)
22. Data sharing via API calls antar server (bukan shared DB file)
23. better-sqlite3 WAL mode untuk performa

### 20.7 TEA Verification

24. Login-Server: `verifyEnable = false` — TIDAK ada TEA handshake
25. Main/Chat/Dungeon Server: `verifyEnable = true` — WAJIB TEA handshake
26. TEA key: `'verification'` (16 chars, 4 × 32-bit words)
27. Algorithm: XXTEA, delta = `0x9E3779B9`

### 20.8 Socket.IO

28. Socket.IO versi 2.5.1 — BUKAN 3.x/4.x
29. Satu event: `'handler.process'` untuk semua request/response
30. Server push: `'Notify'` event dari Main-Server

### 20.9 Client Version

31. Client version dari `resource/properties/clientversion.json`
32. Current: `"2026-03-02143147"`
33. Dikirim ke Main-Server di `enterGame` sebagai `gameVersion`

### 20.10 Decisions — SKIP/FINAL (v6.0)

**Items yang di-SKIP untuk Phase 1 (SDK focus):**

| Item | Status | Alasan | Kapan implement |
|------|--------|--------|----------------|
| `loginGame` action | **SKIP** | Bukan ranah SDK, fokus SDK dulu | Phase 2 (Login-Server) |
| LoginAnnounce | **SKIP** | Bukan ranah SDK, tidak masuk scope | Phase 2 (Login-Server) |
| LZString compression | **SKIP** | SDK tidak menggunakan LZString | Tidak pernah — SDK endpoint pakai raw JSON |
| Error 38 conditions | **ANALISA LAGI** | Perlu telusuri lebih dalam di main.min.js | Saat implement masing-masing server |

**Items yang FINAL:**

| Item | Decision | Detail |
|------|----------|--------|
| server0Time | **25200000** | Fixed value — UTC+7 offset dalam milliseconds |
| CORS | **Allow-Origin: \*** | Game:8080 ↔ SDK:9999, localhost-only, risk minimal |
| Payment callback path | **/api/payment/callback** | FINAL — SDK-Server → Main-Server server-to-server |
| localStorage key | **ppgame_login** | Format: `JSON.stringify({userId, loginToken})` |
| Eruda integration | **No-inject** | Rely on existing Eruda di index.html |
| Event reporting | **Active, log to console** | POST /event/report → HANYA log, tidak kirim external |

---


## 21. LOG STYLE — SDK-SERVER & SDK.JS

### 21.1 Prinsip Logging

**Detail adalah teman debugging.** Log harus mencatat SEMUA operasi penting dengan data lengkap, bukan hanya pesan singkat. Setiap log entry harus punya:
- **Timestamp** — format `HH:mm:ss.SSS`
- **Level** — `INFO`, `WARN`, `ERROR`, `DEBUG`
- **Module** — komponen mana yang menghasilkan log (dengan emoji unik)
- **Context** — data relevan (userId, requestId, dll)
- **Duration** — untuk operasi yang membutuhkan waktu

### 21.2 Emoji System

Emoji dipakai sebagai **visual anchor** — mata langsung tertarik ke emoji, 1 detik tahu level + module.

#### 21.2.1 Level Emoji (selalu konsisten, warna = level)

| Level | Emoji | chalk color |
|-------|-------|-------------|
| INFO  | 🟢 | `green` |
| WARN  | 🟡 | `yellow` |
| ERROR | 🔴 | `red` |
| DEBUG | 🔵 | `cyan` |

#### 21.2.2 Module Emoji (per domain, unik per module)

| Module | Emoji | chalk color |
|--------|-------|-------------|
| AUTH   | 🛡️ | `magenta` |
| PAY    | 💳 | `yellow` |
| SIGN   | 🔑 | `blue` |
| NOTIFY | 📨 | `magenta` |
| SERVER | 🚀 | `green` |
| DB     | 💾 | `cyan` |
| ROUTE  | 🛤️ | `gray` |

#### 21.2.3 Detail Emoji (sub-line, tipe data)

| Tipe | Emoji | Fungsi |
|------|-------|--------|
| 📋 | Data field | key-value pairs |
| 📌 | Important | stack trace, critical info |
| ⏱️ | Duration | timing dalam ms |
| 📍 | Location | URL, port, path |
| 💾 | Database | query, table |
| ⚙️ | Config | setting, mode |

### 21.3 SDK-SERVER LOG — Terminal (Node.js + chalk)

SDK-SERVER menggunakan **chalk** untuk warna terminal. Format log yang **emoji-forward, detail, dan mudah di-scan**.

#### 21.3.1 Log System Architecture

```javascript
// logger.js — SDK-SERVER Terminal Logger
const chalk = require('chalk');

const LEVELS = {
  INFO:  { emoji: '🟢', color: chalk.green,  label: 'INFO ', priority: 1 },
  WARN:  { emoji: '🟡', color: chalk.yellow, label: 'WARN ', priority: 2 },
  ERROR: { emoji: '🔴', color: chalk.red,    label: 'ERROR', priority: 3 },
  DEBUG: { emoji: '🔵', color: chalk.cyan,   label: 'DEBUG', priority: 0 },
};

const MODULES = {
  AUTH:   { emoji: '🛡️', color: chalk.magenta },
  PAY:    { emoji: '💳', color: chalk.yellow },
  SIGN:   { emoji: '🔑', color: chalk.blue },
  NOTIFY: { emoji: '📨', color: chalk.magenta },
  SERVER: { emoji: '🚀', color: chalk.green },
  DB:     { emoji: '💾', color: chalk.cyan },
  ROUTE:  { emoji: '🛤️', color: chalk.gray },
};

const DETAILS = {
  data:     '📋',
  important:'📌',
  duration: '⏱️',
  location: '📍',
  database: '💾',
  config:   '⚙️',
};

function ts() {
  const d = new Date();
  return chalk.gray(
    d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  );
}

// Main log function — header line
function log(level, module, message) {
  const lv = LEVELS[level] || LEVELS.INFO;
  const md = MODULES[module] || { emoji: '⚪', color: chalk.white };
  const levelStr = lv.color(lv.label);
  const modStr = md.color(module.padEnd(6));
  console.log(`${lv.emoji} ${ts()} ${levelStr} ${md.emoji} ${modStr} ▸ ${chalk.white.bold(message)}`);
}

// Detail line — sub-info with tree connector
function detail(type, ...pairs) {
  const emoji = DETAILS[type] || '📋';
  const line = pairs.map(p => `${chalk.dim(p[0])}: ${chalk.white(p[1])}`).join(` ${chalk.dim('·')} `);
  console.log(`  └ ${emoji} ${line}`);
}

// Multi-detail with tree connector
function details(type, ...pairs) {
  const emoji = DETAILS[type] || '📋';
  pairs.forEach((p, i) => {
    const connector = i < pairs.length - 1 ? '├' : '└';
    const line = `${chalk.dim(p[0])}: ${chalk.white(p[1])}`;
    console.log(`  ${connector} ${emoji} ${line}`);
  });
}

// Boundary — startup/shutdown banner
function boundary(emoji, message) {
  console.log(`${emoji} ${chalk.magenta.bold('═'.repeat(55))}`);
  console.log(`   ${chalk.white.bold(message)}`);
}

function boundaryEnd(emoji) {
  console.log(`${emoji} ${chalk.magenta.bold('═'.repeat(55))}`);
}

// Route list
function route(method, path) {
  console.log(`  ├ 📋 ${chalk.cyan(method.padEnd(5))} ${chalk.white(path)}`);
}

function routeLast(method, path) {
  console.log(`  └ 📋 ${chalk.cyan(method.padEnd(5))} ${chalk.white(path)}`);
}

module.exports = { log, detail, details, boundary, boundaryEnd, route, routeLast, LEVELS, MODULES, DETAILS, chalk };
```

#### 21.3.2 Startup & Shutdown Logs

```
🚀 ══════════════════════════════════════════════════════════
   SDK-Server v1.0.0
   📍 Port: 3000
   💾 DB: /data/sdk-server.db
   ⚙️ Mode: standalone
🚀 ══════════════════════════════════════════════════════════

🟢 14:23:00.102 INFO  💾 DB     ▸ Database initialized
  └ 📋 tables: users, sessions, orders, payments

🟢 14:23:00.205 INFO  🛤️ ROUTE  ▸ Routes registered
  ├ 📋 POST /api/auth/guest
  ├ 📋 POST /api/auth/login
  ├ 📋 POST /api/payment/create
  ├ 📋 POST /api/payment/notify
  └ 📋 GET  /api/security/verify

🟢 14:23:00.300 INFO  🚀 SERVER ▸ Ready — listening on http://127.0.0.1:9999
```

#### 21.3.3 Auth Request Logs

```
🟢 14:23:01.457 INFO  🛡️ AUTH   ▸ Guest login success
  └ 📋 userId: G_17462 · nickName: Player_17462

🟢 14:23:01.612 INFO  🛡️ AUTH   ▸ Login by userId success
  └ 📋 userId: U_5531 · nickName: ProGamer01

🟡 14:23:02.112 WARN  🛡️ AUTH   ▸ Login retry — token expired
  └ 📋 userId: G_17462 · attempt: 2/3

🔴 14:23:03.889 ERROR 🛡️ AUTH   ▸ Login failed — invalid token
  ├ 📋 userId: G_17462 · ip: 127.0.0.1
  └ 📌 stack: AuthService.verify → L47
```

#### 21.3.4 Payment Logs

```
🟢 14:23:05.201 INFO  💳 PAY    ▸ Payment order created
  └ 📋 orderId: ORD_001 · amount: 5000 · productId: gem_100

🟢 14:23:06.334 INFO  💳 PAY    ▸ Payment confirmed
  ├ 📋 orderId: ORD_001 · grossAmt: 5000 · sign: valid
  └ ⏱️ 1133ms

🟢 14:23:06.501 INFO  📨 NOTIFY ▸ Notify Main-Server success
  ├ 📍 url: http://127.0.0.1:8000/api/notify
  ├ 📋 status: 200 · response: OK
  └ ⏱️ 167ms
```

#### 21.3.5 Payment Error & Retry Logs

```
🟡 14:23:07.112 WARN  📨 NOTIFY ▸ Notify retry — timeout
  ├ 📍 url: http://127.0.0.1:8000/api/notify
  └ 📋 attempt: 1/3 · nextRetry: 5s

🔴 14:23:10.889 ERROR 📨 NOTIFY ▸ Notify failed — server unreachable
  ├ 📍 url: http://127.0.0.1:8000/api/notify
  ├ 📋 attempts: 3/3 · lastStatus: ECONNREFUSED
  └ 📌 saved to retry queue
```

#### 21.3.6 Sign & Security Logs

```
🔵 14:23:07.778 DEBUG 🔑 SIGN   ▸ Sign generation detail
  ├ 📋 raw: userId=G_17462&time=1746255807&key=***
  └ 📋 result: a1b2c3d4e5f6a7b8c9d0

🔵 14:23:08.001 DEBUG 🔑 SIGN   ▸ Security code generation
  ├ 📋 input: G_17462 + 1746255808
  └ 📋 result: sec_xyz789abc

🟢 14:23:09.001 INFO  🛡️ AUTH   ▸ Security code verified
  └ 📋 source: Login-Server · userId: G_17462 · valid: true
```

#### 21.3.7 Cross-Server API Call Logs

```
🟢 14:32:10.789 INFO  🛡️ AUTH   ▸ Incoming from Login-Server
  └ 📍 GET /user/info/G_17462 · from: 127.0.0.1:8000

🟢 14:32:10.792 INFO  💾 DB     ▸ User found
  └ 📋 userId: G_17462 · 3ms
```

### 21.4 SDK.JS LOG — Eruda Console (Browser)

SDK.JS menggunakan **console.log + CSS styling** yang didukung browser DevTools dan Eruda. Emoji dipakai sama seperti terminal agar konsisten.

**Keputusan Eruda Integration:** sdk.js TIDAK perlu inject Eruda sendiri. `index.html` sudah load Eruda (`eruda.init()`). Semua `console.log` dari sdk.js akan otomatis terlihat di Eruda console tanpa konfigurasi tambahan.

#### 21.4.1 Log System Architecture

```javascript
// sdk.js — Eruda Logger Module
var _log = (function() {
    var LEVEL_EMOJI = {
        INFO:  '🟢',
        WARN:  '🟡',
        ERROR: '🔴',
        DEBUG: '🔵'
    };

    var MODULE_EMOJI = {
        AUTH:    '🛡️',
        PAY:     '💳',
        SIGN:    '🔑',
        NOTIFY:  '📨',
        SDK:     '⚡',
        NET:     '🌐',
        GAME:    '🎮',
        REPORT:  '📊',
        SESSION: '🔐',
        UI:      '🖥️'
    };

    var DETAIL_EMOJI = {
        data:     '📋',
        important:'📌',
        duration: '⏱️',
        location: '📍',
        config:   '⚙️'
    };

    function ts() {
        var d = new Date();
        return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    }

    function levelColor(level) {
        var colors = { INFO: '#4CAF50', WARN: '#FF9800', ERROR: '#F44336', DEBUG: '#2196F3' };
        return colors[level] || '#9E9E9E';
    }

    // Header line — level + module + message
    function header(level, module, message) {
        var lvEmoji = LEVEL_EMOJI[level] || '⚪';
        var mdEmoji = MODULE_EMOJI[module] || '⚪';
        var modPad = (module + '   ').slice(0, 6);
        var prefix = '%c' + lvEmoji + ' ' + ts() + ' %c' + level.padEnd(5) + ' %c' + mdEmoji + ' ' + modPad + ' ▸ ' + message;
        console.log(
            prefix,
            'color:#757575;',                                        // timestamp
            'color:' + levelColor(level) + ';font-weight:bold;',     // level
            'color:#9C27B0;font-weight:bold;'                        // module
        );
    }

    // Detail line — single
    function detail(type, text) {
        var emoji = DETAIL_EMOJI[type] || '📋';
        console.log('%c  └ ' + emoji + ' ' + text, 'color:#616161;padding-left:8px;');
    }

    // Multi-detail lines — tree connector
    function details(type, pairs) {
        var emoji = DETAIL_EMOJI[type] || '📋';
        pairs.forEach(function(p, i) {
            var connector = i < pairs.length - 1 ? '├' : '└';
            var line = p[0] + ': ' + p[1];
            console.log('%c  ' + connector + ' ' + emoji + ' ' + line, 'color:#616161;padding-left:8px;');
        });
    }

    // Boundary — startup/shutdown
    function boundary(emoji, message) {
        console.log('%c' + emoji + ' ' + '═'.repeat(50), 'color:#E91E63;font-weight:bold;font-size:13px;');
        console.log('%c   ' + message, 'color:white;font-weight:bold;font-size:13px;');
    }

    function boundaryEnd(emoji) {
        console.log('%c' + emoji + ' ' + '═'.repeat(50), 'color:#E91E63;font-weight:bold;font-size:13px;');
    }

    return {
        header: header,
        detail: detail,
        details: details,
        boundary: boundary,
        boundaryEnd: boundaryEnd,
        LEVEL_EMOJI: LEVEL_EMOJI,
        MODULE_EMOJI: MODULE_EMOJI,
        DETAIL_EMOJI: DETAIL_EMOJI
    };
})();
```

#### 21.4.2 SDK Init & Login Logs

```
🚀 ══════════════════════════════════════════════════════════
   SDK.js — Super Warrior Z SDK Client v1.0.0
🚀 ══════════════════════════════════════════════════════════

🟢 14:23:00.100 INFO  ⚡ SDK    ▸ SDK.js loaded
  └ 📋 version: 1.0.0 · env: localhost

🟢 14:23:00.102 INFO  🛡️ AUTH   ▸ Initializing SDK Bridge
  ├ 📋 window.checkSDK → function (blocking mode)
  ├ 📋 window.getSdkLoginInfo → function
  ├ 📋 window.PPGAME → object (7 methods)
  ├ 📋 window.paySdk → PPGAME.createPaymentOrder
  ├ 📋 window.report2Sdk → routing function
  └ 📋 window.gameReady → PPGAME.gameReady

🟢 14:23:00.105 INFO  🔐 SESSION ▸ Checking localStorage
  └ 📋 session: none found

🟢 14:23:00.106 INFO  🖥️ UI     ▸ Login UI overlay rendered

─── User klik "Login as Guest" ───

🟢 14:23:02.500 INFO  🛡️ AUTH   ▸ Guest Login Request
🟢 14:23:02.501 DEBUG 🌐 NET    ▸ POST http://127.0.0.1:9999/auth/guest
  └ ⏱️ 45ms
🟢 14:23:02.546 INFO  🛡️ AUTH   ▸ Guest login success
  ├ 📋 userId: G_17462 · nickName: Player_17462
  ├ 📋 loginToken: a1b2c3d4e5f6...
  ├ 📋 sign: d4e5f6a7b8c9...
  └ 📋 security: a4f7e2d1c8b3...

🟢 14:23:02.548 INFO  🔐 SESSION ▸ Session saved to localStorage
  └ 📋 userId: G_17462

🟢 14:23:02.549 INFO  🛡️ AUTH   ▸ Unblocking game init
  └ 📋 window.checkSDK → return true

🟢 14:23:02.550 INFO  🖥️ UI     ▸ Login UI overlay closed
🟢 14:23:02.551 INFO  ⚡ SDK    ▸ SDK Ready — game init unblocked
```

#### 21.4.3 Session Restore Logs

```
🚀 ══════════════════════════════════════════════════════════
   SDK.js — Super Warrior Z SDK Client v1.0.0
🚀 ══════════════════════════════════════════════════════════

🟢 14:23:00.102 INFO  🔐 SESSION ▸ Checking localStorage
  └ 📋 session: found · userId: G_17462

🟢 14:23:00.103 DEBUG 🌐 NET    ▸ POST http://127.0.0.1:9999/auth/validate
  └ ⏱️ 22ms
🟢 14:23:00.125 INFO  🛡️ AUTH   ▸ Session restored
  └ 📋 userId: G_17462 · valid: true

🟢 14:23:00.126 INFO  🛡️ AUTH   ▸ Skipping Login UI — session active
🟢 14:23:00.127 INFO  ⚡ SDK    ▸ SDK Ready — game init unblocked
```

#### 21.4.4 Game Lifecycle Logs

```
🟢 14:23:05.100 INFO  🎮 GAME   ▸ window.gameReady() called
  └ 📋 → PPGAME.gameReady()

🟢 14:23:06.200 INFO  📊 REPORT ▸ window.report2Sdk() called
  ├ 📋 dataType: 3 (EnterGame)
  └ 📋 → PPGAME.playerEnterServer({characterName, characterId, serverId, serverName})

🟢 14:23:06.250 DEBUG 🌐 NET    ▸ POST http://127.0.0.1:9999/event/report
  └ ⏱️ 30ms
🟢 14:23:06.280 INFO  📊 REPORT ▸ Event reported — playerEnterServer

🟢 14:23:07.100 INFO  📊 REPORT ▸ window.report2Sdk() called
  ├ 📋 dataType: 2 (CreateRole)
  └ 📋 → PPGAME.submitEvent("game_create_role", {...})

🟢 14:23:07.150 INFO  📊 REPORT ▸ Event reported — game_create_role

🟢 14:23:08.000 INFO  🎮 GAME   ▸ window.gameLevelUp(25) called
  └ 📋 → PPGAME.gameLevelUp(25)
```

#### 21.4.5 Payment Logs (Client Side)

```
🟢 14:23:10.100 INFO  💳 PAY    ▸ window.paySdk() called
  └ 📋 → PPGAME.createPaymentOrder(orderData)

🟢 14:23:10.101 INFO  💳 PAY    ▸ Payment order created
  └ 📋 orderId: ORD_001 · product: Diamond x100 · price: $0.99

🟢 14:23:10.150 DEBUG 🌐 NET    ▸ POST http://127.0.0.1:9999/payment/create
  └ ⏱️ 38ms

🟢 14:23:10.189 INFO  💳 PAY    ▸ Payment Confirmation UI shown
  ├ 📋 paymentId: pay_x9y8z7 · status: pending
  └ 📍 waiting user action

─── User klik "Confirm" ───

🟢 14:23:12.500 INFO  💳 PAY    ▸ User confirmed payment
🟢 14:23:12.501 DEBUG 🌐 NET    ▸ POST http://127.0.0.1:9999/payment/confirm
  └ ⏱️ 52ms
🟢 14:23:12.553 INFO  💳 PAY    ▸ Payment complete
  ├ 📋 paymentId: pay_x9y8z7 · orderId: ORD_001
  └ 📋 SDK-Server will notify Main-Server server-to-server

🟢 14:23:12.554 INFO  🖥️ UI     ▸ Payment Confirmation UI closed
🟢 14:23:12.555 INFO  💳 PAY    ▸ Waiting for Main-Server payFinish Notify...
```

#### 21.4.6 Payment Cancel Logs

```
🟡 14:23:11.200 WARN  💳 PAY    ▸ User cancelled payment
  └ 📋 paymentId: pay_x9y8z7

🟢 14:23:11.201 INFO  🖥️ UI     ▸ Payment Confirmation UI closed
🟡 14:23:11.202 WARN  💳 PAY    ▸ Payment cancelled
```

#### 21.4.7 Error Logs (Client Side)

```
🔴 14:23:03.000 ERROR 🌐 NET    ▸ Network error
  ├ 📍 POST http://127.0.0.1:9999/auth/guest
  └ 📌 Connection refused — SDK-Server not reachable

🔴 14:23:03.001 ERROR 🛡️ AUTH   ▸ Login failed
  └ 📌 Cannot connect to SDK-Server

🟡 14:23:03.002 WARN  🖥️ UI     ▸ Error shown in Login UI
  └ 📋 message: "Server tidak bisa dijangkau. Coba lagi."

🔴 14:23:15.000 ERROR 💳 PAY    ▸ Payment creation failed
  ├ 📍 POST http://127.0.0.1:9999/payment/create
  ├ 📋 status: 500
  └ 📌 Internal Server Error — Database write failed
```

### 21.5 Log Level Control

#### 21.5.1 SDK-SERVER (Terminal)

```javascript
// config.js
module.exports = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'INFO',  // DEBUG | INFO | WARN | ERROR
  // DEBUG = semua log termasuk DB queries dan internal data
  // INFO  = operasi utama tanpa data detail
  // WARN  = hanya warning dan error
  // ERROR = hanya error
};
```

**Cara pakai:**
```bash
# Normal — INFO level
node index.js

# Debug mode — semua log termasuk data sensitif
LOG_LEVEL=DEBUG node index.js

# Quiet mode — hanya warning dan error
LOG_LEVEL=WARN node index.js
```

#### 21.5.2 SDK.JS (Eruda)

```javascript
// sdk.js — Log level diatur via localStorage
// Set di Eruda console:
//   localStorage.setItem('SDK_LOG_LEVEL', 'DEBUG')   → semua log
//   localStorage.setItem('SDK_LOG_LEVEL', 'INFO')    → normal
//   localStorage.setItem('SDK_LOG_LEVEL', 'WARN')    → quiet
//   localStorage.setItem('SDK_LOG_LEVEL', 'NONE')    → silent

var _logLevel = localStorage.getItem('SDK_LOG_LEVEL') || 'INFO';
```

### 21.6 Chalk Color Map — SDK-SERVER

```
Line 1 (header):
  🟢/🟡/🔴/🔵     → sesuai level color
  HH:mm:ss.SSS     → chalk.gray
  INFO/WARN/ERROR   → same as level color + chalk.bold
  🛡️💳🔑📨🚀💾🛤️   → (emoji, no chalk needed)
  AUTH/PAY/SIGN     → chalk.bold + unique color per module
  ▸                 → chalk.gray
  Message           → chalk.white.bold

Line 2+ (detail):
  ├ / └             → chalk.gray
  📋📌⏱️📍💾⚙️     → (emoji, no chalk needed)
  key:              → chalk.dim
  value             → chalk.white
  · (separator)     → chalk.dim

Boundary:
  🚀 ═══            → chalk.magenta.bold
  Text              → chalk.white.bold
```

### 21.7 CSS Style Map — SDK.JS (Eruda)

```
Line 1 (header):
  🟢/🟡/🔴/🔵 timestamp  → color:#757575
  INFO/WARN/ERROR          → color: sesuai level + font-weight:bold
  🛡️💳🔑📨⚡🌐🎮📊🔐🖥️  → (emoji, no CSS needed)
  MODULE ▸ message         → color:#9C27B0 + font-weight:bold

Line 2+ (detail):
  ├ / └ emoji text         → color:#616161 + padding-left:8px
  key:                     → (tanpa styling khusus)
  value                    → (tanpa styling khusus)
  · (separator)            → (tanpa styling khusus)

Boundary:
  🚀 ═══                   → color:#E91E63 + font-weight:bold + font-size:13px
  Text                     → color:white + font-weight:bold + font-size:13px
```

### 21.8 Log Format Summary

**SDK-SERVER Terminal:**
```
[LEVEL_EMOJI] HH:mm:ss.SSS LEVEL  [MODULE_EMOJI] MODULE ▸ Message
  └ [DETAIL_EMOJI] key: value · key: value
```

**SDK.JS Eruda:**
```
[LEVEL_EMOJI] HH:mm:ss.SSS LEVEL  [MODULE_EMOJI] MODULE ▸ Message
  └ [DETAIL_EMOJI] key: value · key: value
```

**Keduanya konsisten:**
- Selalu mulai dengan level emoji → timestamp → level text → module emoji → module → pesan
- Detail selalu di baris baru dengan tree connector `├ └`
- Multiple field di 1 baris dipisah dengan `·` (titik tengah)
- Boundary pakai emoji + `═══` untuk startup/shutdown
- Duration selalu pakai ⏱️ emoji
- Location/URL selalu pakai 📍 emoji
- Stack trace/critical selalu pakai 📌 emoji
