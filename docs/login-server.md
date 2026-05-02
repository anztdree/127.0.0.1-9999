# LOGIN-SERVER — Analisa 100%

> Super Warrior Z — Login Server (Phase 3)
> Port: 8000 | Socket.IO 2.5.1 | TEA: OFF | better-sqlite3
> Source: reverse-engineering `main.min(unminfy).js`

---

## 1. SPESIFIKASI TEKNIS

| Property | Value |
|----------|-------|
| Port | 8000 |
| Transport | Socket.IO 2.5.1 |
| Transports | `['websocket', 'polling']` |
| CORS | `origin: '*', methods: ['GET', 'POST']` |
| TEA Verification | **OFF** — `verifyEnable = false` |
| Reconnection | `{reconnectionAttempts: 10}` (client side) |
| Database | better-sqlite3 ^11.7.0 (WAL mode) |
| Compression | LZString (opsional per response) |
| URL config | `resource/properties/serversetting.json` → `"http://127.0.0.1:8000"` |

Bukti TEA OFF (line 113445):
```javascript
t.loginClient = new TSSocketClient('login-server', false)  // verifyEnable = false
```

---

## 2. URL RESOLUTION

Client mencari Login-Server URL melalui 2 step (line 114509-114521):

**Step 1:** Panggil `window.getLoginServer()`
- PPGAME SDK override: `window.getLoginServer = function() { return ''; };`
- Return empty → fallback ke Step 2

**Step 2:** Load `resource/properties/serversetting.json`
```javascript
RES.getResByUrl('resource/properties/serversetting.json?v=' + Math.random(), function(n) {
    t.loginClient.connectToServer(n.loginserver, e);
});
```

File content:
```json
{ "loginserver": "http://127.0.0.1:8000" }
```

---

## 3. PROTOCOL: `handler.process`

### 3.1 Satu Event, Semua Komunikasi

Login-Server hanya menggunakan **1 Socket.IO event** untuk semua request/response:

```javascript
// Client → Server
socket.emit('handler.process', requestObject, callbackFunction)

// Server → Client (via callbackFunction)
callbackFunction(responseObject)
```

### 3.2 Request Object Format

Setiap request ke Login-Server:

```javascript
{
    type: 'User',       // WAJIB — selalu 'User' (huruf besar U)
    action: string,     // WAJIB — nama action
    version: '1.0',     // WAJIB — protocol version
    // ... field spesifik per action
}
```

### 3.3 Response Object Format

Setiap response dari Login-Server:

```javascript
{
    ret: number,          // WAJIB — 0 = success, lainnya = error code
    data: string,         // WAJIB — JSON string (raw atau LZString compressed)
    compress: boolean,    // WAJIB — true jika data LZString compressed
    serverTime: number,   // WAJIB — Date.now() timestamp server
    server0Time: number   // WAJIB — 25200000 
```

**`serverTime` dan `server0Time` WAJIB di setiap response** — success maupun error. Tanpa ini client tidak bisa sinkronisasi waktu, daily reset, event schedule — semua kacau.

### 3.4 Client Response Processing

Function `processHandlerWithLogin` (line 113900-113917):

```javascript
var r = function (e) {
    if (0 === e.ret) {
        var t = e.data;
        e.compress && (t = LZString.decompressFromUTF16(t));
        var a = JSON.parse(t);
        a.language && (ts.language = a.language);  // ← set language jika ada
        n && n(a);                                  // ← success callback
    } else {
        Logger.showInfoLog('登录出错', e.ret);       // ← log error
        o && o();                                    // ← error callback
    }
};
```

Detail:
1. Cek `ret === 0`
2. Jika `compress === true` → decompress `LZString.decompressFromUTF16(data)`
3. Parse JSON string → JavaScript object
4. Jika object punya field `language` → set `ts.language`
5. Panggil success callback dengan parsed object
6. Jika `ret !== 0` → log "登录出错" + ret code → panggil error callback

**PENTING:** Login-Server error handler TIDAK menampilkan dialog ke user. Berbeda dengan Main-Server yang pakai `ErrorHandler.ShowErrorTips`. Login-Server hanya log + callback.

### 3.5 Connection Parameter `t` (needConnect)

`processHandlerWithLogin(request, t, successCb, errorCb)` — parameter kedua `t`:

| t value | loginClient.isConnect | Hasil |
|---------|----------------------|-------|
| `true` | `false` | Connect dulu via `connectToLogin()`, lalu send |
| `true` | `true` | Langsung send |
| `false` | `false` | **TIDAK dikirim** (silent fail) |
| `false` | `true` | Langsung send |

Yang pakai `t=false`: hanya `loginGame` (sudah connect di `connectToLogin`).
Yang pakai `t=true`: `GetServerList`, `SaveHistory`, `SaveUserEnterInfo`, `SaveLanguage`, `getNotice`.

---

## 4. LOGIN-SERVER SOCKET LIFECYCLE

### 4.1 Timeline

```
[sdkLoginSuccess called]
       │
       ▼
┌─ 1. processHandlerWithLogin(GetServerList, true) ─────────────────┐
│      loginClient.isConnect? → NO → connectToLogin()               │
│      io.connect("http://127.0.0.1:8000", {reconnectionAttempts:10})│
│      ON 'connect' → verifyEnable=false → langsung callback        │
│      SEND handler.process → GetServerList                          │
│      RECV callback → serverList data                               │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
   [Client: selectNewServer / selectServer]
   [Client: onLoginSuccess → set ts.loginInfo]
   [Client: user klik Start]
       │
       ▼
┌─ 2. processHandlerWithLogin(SaveHistory, true) ───────────────────┐
│      loginClient.isConnect? → YES → langsung send                 │
│      SEND handler.process → SaveHistory                            │
│      RECV callback → {loginToken, todayLoginCount}                 │
└────────────────────────────────────────────────────────────────────┘
       │
       ▼
   [Client: clientStartGame → connect Main-Server]
   [Client: enterGame → success]
       │
       ▼
┌─ 3. processHandlerWithLogin(SaveUserEnterInfo, true) ─────────────┐
│      loginClient.isConnect? → YES → langsung send                 │
│      SEND handler.process → SaveUserEnterInfo                      │
│      RECV callback → ret:0                                         │
│      loginClient.destroy()  ← SOCKET DESTROYED                    │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 Kapan Login Socket Destroy

**Hanya 1 tempat:** `reportToLoginEnterInfo()` callback (line 114459):
```javascript
var o = function () {
    ts.loginClient.destroy();
};
ts.processHandlerWithLogin(n, true, o, o);  // success & error → sama-sama destroy
```

Socket di-destroy baik SaveUserEnterInfo success MAUPUN error.

### 4.3 Kapan Login Socket Masih Aktif

Socket tetap hidup dari GetServerList sampai SaveUserEnterInfo selesai. Selama itu, action berikut BISA dikirim:
- `GetServerList` — bisa multiple kali (refreshServerList)
- `SaveLanguage` — bisa dipanggil kapan saja dari languageBtnTap
- `getNotice` — dipanggil setelah GetServerList
- `SaveHistory` — dipanggil saat user klik Start
- `SaveUserEnterInfo` — dipanggil setelah enterGame Main-Server success → destroy

---

## 5. ACTIONS — Detail Lengkap

### 5.1 `GetServerList`

**Kapan dipanggil:** Setelah `sdkLoginSuccess` (SDK path) atau setelah `loginGame` success (origin path)

**Client function** (line 114402-114410):
```javascript
t.prototype.clientRequestServerList = function (e, t, n) {
    var o = TSBrowser.executeFunction('getAppId') || '', a = {
        type: 'User',
        action: 'GetServerList',
        userId: e,
        subChannel: o,
        channel: t
    };
    ts.processHandlerWithLogin(a, true, n);
}
```

**Request:**

| Field | Type | Value di PPGAME | Wajib |
|-------|------|-----------------|-------|
| `type` | string | `'User'` | ✅ |
| `action` | string | `'GetServerList'` | ✅ |
| `userId` | string | dari SDK (misal `'guest_a1b2c3d4'`) | ✅ |
| `subChannel` | string | `''` (dari `getAppId()`) | ✅ |
| `channel` | string | `'ppgame'` | ✅ |

**SDK path call:**
```javascript
ts.clientRequestServerList(e.userId, e.sdk, function (e) { ... });
// userId = 'guest_a1b2c3d4', channel = 'ppgame'
```

**Response envelope:**
```javascript
{
    ret: 0,
    data: JSON.stringify({
        serverList: [...],
        history: [...],
        offlineReason: ''
    }),
    compress: false,
    serverTime: Date.now(),
    server0Time: new Date().getTimezoneOffset() * 60 * 1000
}
```

**Response data structure:**

```javascript
{
    serverList: [
        {
            serverId: string,        // "1"
            name: string,            // "Server 1"
            url: string,             // "http://127.0.0.1:8001" (Main-Server)
            chaturl: string,         // "http://127.0.0.1:8002" (Chat-Server)
            dungeonurl: string,      // "http://127.0.0.1:8003" (Dungeon-Server)
            online: boolean,         // true
            hot: boolean,            // false
            new: boolean,            // false
            offlineReason: string    // ""
        }
    ],
    history: ["1"],                  // Array of serverId, diurutkan terakhir dimainkan
    offlineReason: string            // "" — alasan offline global
}
```

**Client-side processing (line 137994-138069):**

1. `filterByWhiteList(serverList)` — Filter berdasarkan `window.serverList`
   - Jika `window.serverList` undefined atau empty → **tidak ada filter**, semua server ditampilkan
   - PPGAME SDK tidak set `window.serverList` → semua server ditampilkan

2. `changeServerInfo(data)` — Set `offlineReason` ke setiap server, mark servers

3. **SDK path** → `selectNewServer()`:
   - Jika `history` ada dan entry[0] cocok dengan server → auto-select server itu
   - Jika tidak cocok → tampilkan ServerListNode UI

4. `onLoginSuccess(userInfo, serverItem)` — Set `ts.loginInfo = {userInfo, serverItem}`

**Error response:**
```javascript
{
    ret: 37,  // ERROR_NO_LOGIN_CLIENT — user tidak ditemukan
    data: '',
    compress: false,
    serverTime: Date.now(),
    server0Time: new Date().getTimezoneOffset() * 60 * 1000
}
```

**Handler implementation logic:**
```
1. Cek userId exists di SDK-Server DB
2. Jika tidak → return ret=37 (ERROR_NO_LOGIN_CLIENT)
3. Ambil server list dari config
4. Ambil history dari user_servers tabel (ORDER BY lastPlayed DESC)
5. Build response data
6. Return envelope dengan serverTime + server0Time
```

---

### 5.2 `SaveHistory`

**Kapan dipanggil:** User klik tombol Start/Play setelah memilih server (line 138094 → `startBtnTap`)

**Request** (line 137904-137913):

| Field | Type | Value di PPGAME | Wajib |
|-------|------|-----------------|-------|
| `type` | string | `'User'` | ✅ |
| `action` | string | `'SaveHistory'` | ✅ |
| `accountToken` | string | `ts.loginInfo.userInfo.userId` | ✅ |
| `channelCode` | string | `'ppgame'` | ✅ |
| `serverId` | string | `ts.loginInfo.serverItem.serverId` | ✅ |
| `securityCode` | string | dari SDK | ✅ |
| `subChannel` | string | `''` | ✅ |
| `version` | string | `'1.0'` | ✅ |

**Response data:**

```javascript
{
    loginToken: string,        // LoginToken sama dari SDK-Server (bukan generate baru)
    todayLoginCount: number    // Jumlah login hari ini oleh user ini
}
```

**Client-side processing (line 137913-137921):**
```javascript
o = function (e) {
    e && e.loginToken && (ts.loginInfo.userInfo.loginToken = e.loginToken);
    ts.reportLogToPP('disConnectLoginSocket', null);
    ts.clientStartGame(false);

    var t = e.todayLoginCount;
    4 === t && ToolCommon.ReportToSdkCommon(ReportDataType.blackStoneLoginCount4);
    6 === t && ToolCommon.ReportToSdkCommon(ReportDataType.blackStoneLoginCount6);
};
```

Detail:
- Update `ts.loginInfo.userInfo.loginToken` dengan response loginToken
- Panggil `clientStartGame` → connect ke Main-Server
- Cek `todayLoginCount === 4` → trigger analytics report (blackStoneLoginCount4)
- Cek `todayLoginCount === 6` → trigger analytics report (blackStoneLoginCount6)
- Success dan error callback SAMA — baik error maupun success, client tetap `clientStartGame`

**Handler implementation logic:**
```
1. Cek userId (accountToken) exists di SDK-Server DB
2. Cek securityCode cocok dengan SDK-Server DB
3. Jika mismatch → return ret=55 (SIGN_ERROR)
4. INSERT/UPDATE user_servers (userId, serverId, lastPlayed=now)
5. INSERT login_history (userId, serverId, channelCode, loginTime=now)
6. Hitung todayLoginCount:
   SELECT COUNT(*) FROM login_history
   WHERE userId=? AND date(loginTime/1000, 'unixepoch') = date('now')
7. Baca loginToken dari SDK-Server DB (users table)
8. Return envelope dengan data {loginToken, todayLoginCount}
```

---

### 5.3 `SaveUserEnterInfo`

**Kapan dipanggil:** Setelah `enterGame` ke Main-Server berhasil (line 114433)

**Request** (line 114448-114461):

| Field | Type | Value di PPGAME | Wajib |
|-------|------|-----------------|-------|
| `type` | string | `'User'` | ✅ |
| `action` | string | `'SaveUserEnterInfo'` | ✅ |
| `accountToken` | string | `ts.loginInfo.userInfo.userId` | ✅ |
| `channelCode` | string | `'ppgame'` | ✅ |
| `subChannel` | string | `''` | ✅ |
| `createTime` | number | dari UserInfoSingleton | ✅ |
| `userLevel` | number | dari UserInfoSingleton | ✅ |
| `version` | string | `'1.0'` | ✅ |

**Response data:** Tidak ada data spesifik. Client hanya cek `ret === 0`.

**Client-side processing (line 114458-114461):**
```javascript
var o = function () {
    ts.loginClient.destroy();   // ← DESTROY login socket
};
ts.processHandlerWithLogin(n, true, o, o);  // success & error → sama-sama destroy
```

**Handler implementation logic:**
```
1. Cek userId (accountToken) exists
2. INSERT OR REPLACE user_enter_info (userId, channelCode, createTime, userLevel, updatedAt=now)
3. Return envelope dengan data kosong '{}'
```

---

### 5.4 `SaveLanguage`

**Kapan dipanggil:** User klik tombol bahasa di Login screen → pilih bahasa (line 138107-138109)

**Request** (line 114279-114296):

| Field | Type | Value di PPGAME | Wajib |
|-------|------|-----------------|-------|
| `type` | string | `'User'` | ✅ |
| `action` | string | `'SaveLanguage'` | ✅ |
| `userid` | string | ⚠️ `ts.loginUserInfo.userId` (huruf kecil!) | ✅ |
| `sdk` | string | `'ppgame'` | ✅ |
| `appid` | string | `''` (dari `getAppId()`) | ✅ |
| `language` | string | kode bahasa, misal `'en'`, `'id'` | ✅ |

**⚠️ PERHATIAN:** Field pakai `userid` (huruf kecil, tanpa camelCase) — berbeda dari action lain yang pakai `userId` atau `accountToken`.

**Response data:**

```javascript
{
    errorCode: 0    // ⚠️ 'errorCode' bukan 'ret' — ada di dalam data, bukan envelope
}
```

**Client-side processing (line 114289-114296):**
```javascript
var i = function (t) {
    0 === t.errorCode
        ? (ts.closeWindow('LanguageList'), TSBrowser.executeFunction('changeLanguage', e))
        : (console.log('failed save language', t), ts.closeWindow('LanguageList'), window.changeLanguage(e));
};
var s = function () {
    console.log('failed save language');
    ts.closeWindow('LanguageList');
};
ts.processHandlerWithLogin(r, true, i, s);
```

Detail:
- Success callback cek `t.errorCode === 0` (di dalam data, bukan `ret` di envelope)
- Jika `errorCode === 0` → tutup LanguageList, panggil `changeLanguage` via TSBrowser
- Jika `errorCode !== 0` → tutup LanguageList, panggil `window.changeLanguage` langsung (fallback)
- Error callback → tutup LanguageList

**Handler implementation logic:**
```
1. Cek userId (userid) exists
2. INSERT OR REPLACE user_language (userId, language, sdk, updatedAt=now)
3. Return envelope dengan data {errorCode: 0}
```

---

### 5.5 `getNotice` — RETURN EMPTY

**Kapan dipanggil:** Setelah GetServerList response diterima (SDK path: line 138085)

**Request:** Deobfuscation artifact — `t` bukan request object valid. Kirim apapun, server handle.

**KEPUTUSAN:** Return empty notice `{}`.

**Response data (jika diperlukan di masa depan):**
```javascript
{
    "notice_id": {
        text: { en: "English text", id: "Teks Indonesia" },
        title: { en: "Title", id: "Judul" },
        version: string,
        orderNo: number,
        alwaysPopup: boolean
    }
}
```

Client processing (line 138128-138148):
- Loop setiap key di `t.data`
- Ambil `text[currentLanguage]` dan `title[currentLanguage]`
- Jika `alwaysPopup === true` → otomatis tampilkan notice
- Set `noticeBtn.visible` jika ada notice

---

### 5.6 `loginGame` — SKIP

**KEPUTUSAN:** Tidak diimplementasi. PPGAME SDK tidak memakai `loginGame`.

---

## 6. PROTOCOL FLOW — PPGAME SDK (Satu-satunya path)

```
  BROWSER                    SDK-SERVER (9999)         LOGIN-SERVER (8000)
     |                            |                          |
     |── POST /auth/guest ──────>|                          |
     |<─ {loginToken, sign, ─────|                          |
     |    security, userId}      |                          |
     |── POST /auth/validate ───>|                          |
     |<─ {valid, sign, ──────────|                          |
     |    securityCode}          |                          |
     |                           |                          |
     |  [Egret engine loads]     |                          |
     |  sdkLoginSuccess(o)       |                          |
     |                           |                          |
     |─────────────────────────── socket.connect ──────────>|
     |<───────────────────────── connect (no TEA) ─────────|
     |                           |                          |
     |── handler.process ─────── GetServerList ────────────>|
     |<─ handler.process ─────── {serverList, history} ────|
     |                           |                          |
     |  [selectNewServer]        |                          |
     |  [onLoginSuccess]         |                          |
     |  [user klik Start]        |                          |
     |                           |                          |
     |── handler.process ─────── SaveHistory ──────────────>|
     |<─ handler.process ─────── {loginToken, count} ──────|
     |                           |                          |
     |  [clientStartGame]        |                          |
     |  [connect Main-Server]    |                          |
     |  [enterGame success]      |                          |
     |                           |                          |
     |── handler.process ─────── SaveUserEnterInfo ────────>|
     |<─ handler.process ─────── {ret:0} ──────────────────|
     |                           |                          |
     |  [loginClient.destroy()]  |                          |
```

### Detail Step-by-Step

**Step 1: SDK Authentication** (HTTP, port 9999)
- Guest login → dapat `{loginToken, nickname, userId, sign, security}`
- Redirect ke game dengan URL params: `?sdk=ppgame&logintoken=X&nickname=Y&userid=Z&sign=S&security=C`

**Step 2: SDK Validation** (HTTP, port 9999)
- POST `/api/auth/validate` → verifikasi loginToken
- Response: `{valid: true, userId, nickName, sign, securityCode}`

**Step 3: Game Client Init**
- `window.getSdkLoginInfo()` → return 6 field
- `sdkLoginSuccess(o)`:
  ```javascript
  ts.loginInfo.userInfo = {
      loginToken: o.loginToken,
      userId: o.userId,
      nickName: o.nickName,
      channelCode: o.sdk,        // ← 'sdk' → 'channelCode'
      securityCode: o.security   // ← 'security' → 'securityCode'
  };
  ```

**Step 4: Connect ke Login-Server**
- `window.getLoginServer()` → `''` (PPGAME SDK override)
- Load `serversetting.json` → `"http://127.0.0.1:8000"`
- `io.connect("http://127.0.0.1:8000", {reconnectionAttempts: 10})`
- On `connect`: `verifyEnable = false` → langsung callback (TIDAK ada TEA handshake)

**Step 5: GetServerList**
- Kirim: `{type:'User', action:'GetServerList', userId, subChannel:'', channel:'ppgame'}`
- Terima: `{serverList:[...], history:[...], offlineReason:''}`

**Step 6: Server Selection** (client-side, NO Login-Server request)
- `filterByWhiteList()` → `window.serverList` undefined → tidak ada filter
- `selectNewServer()` → cek history[0], auto-select atau tampilkan UI
- `onLoginSuccess()` → set `ts.loginInfo = {userInfo, serverItem}`

**Step 7: SaveHistory**
- Kirim: `{type:'User', action:'SaveHistory', accountToken, channelCode, serverId, securityCode, subChannel, version}`
- Terima: `{loginToken, todayLoginCount}`
- Client update `ts.loginInfo.userInfo.loginToken`
- Client cek `todayLoginCount` → trigger analytics jika 4 atau 6
- Client panggil `clientStartGame()` → connect ke Main-Server

**Step 8: SaveUserEnterInfo** (setelah enterGame Main-Server success)
- Kirim: `{type:'User', action:'SaveUserEnterInfo', accountToken, channelCode, subChannel, createTime, userLevel, version}`
- Terima: `{ret:0}`
- Client: `loginClient.destroy()` → socket ditutup

---

## 7. DATABASE

### 7.1 Tabel: `login_history`

```sql
CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    serverId TEXT NOT NULL,
    channelCode TEXT NOT NULL DEFAULT 'ppgame',
    securityCode TEXT,
    loginTime INTEGER NOT NULL,
    todayCount INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_time
    ON login_history(userId, loginTime DESC);

CREATE INDEX IF NOT EXISTS idx_login_history_user_today
    ON login_history(userId, date(loginTime/1000, 'unixepoch'));
```

### 7.2 Tabel: `user_servers`

```sql
CREATE TABLE IF NOT EXISTS user_servers (
    userId TEXT NOT NULL,
    serverId TEXT NOT NULL,
    lastPlayed INTEGER NOT NULL,
    PRIMARY KEY (userId, serverId)
);

CREATE INDEX IF NOT EXISTS idx_user_servers_user
    ON user_servers(userId, lastPlayed DESC);
```

### 7.3 Tabel: `user_enter_info`

```sql
CREATE TABLE IF NOT EXISTS user_enter_info (
    userId TEXT PRIMARY KEY,
    channelCode TEXT NOT NULL DEFAULT 'ppgame',
    createTime INTEGER,
    userLevel INTEGER DEFAULT 0,
    updatedAt INTEGER NOT NULL
);
```

### 7.4 Tabel: `user_language`

```sql
CREATE TABLE IF NOT EXISTS user_language (
    userId TEXT PRIMARY KEY,
    language TEXT NOT NULL DEFAULT 'en',
    sdk TEXT DEFAULT 'ppgame',
    updatedAt INTEGER NOT NULL
);
```

### 7.5 READ-ONLY: SDK-Server Database

Login-Server membaca SDK-Server database (READ-ONLY, jangan pernah write):

**Path:** `../sdk-server/data/sdk_server.db`

**Tabel yang dibaca:** `users`

| Field SDK-Server | Dipakai di Login-Server | Action |
|-----------------|------------------------|--------|
| `userId` | Identifikasi user | Semua action |
| `loginToken` | Dikembalikan di SaveHistory response | SaveHistory |
| `securityCode` | Diverifikasi di SaveHistory request | SaveHistory |
| `nickName` | (tidak dipakai langsung, sudah di client) | — |
| `sdk` | (sudah di client sebagai channelCode) | — |
| `sign` | (sudah di client) | — |

---

## 8. CONFIG

```javascript
module.exports = {
    port: 8000,
    host: '0.0.0.0',
    dbFile: './data/login_server.db',
    sdkDbFile: '../sdk-server/data/sdk_server.db',
    secretKey: 'SUPER_WARRIOR_Z_SDK_SECRET_2026',
    servers: [
        {
            serverId: '1',
            name: 'Server 1',
            url: 'http://127.0.0.1:8001',
            chaturl: 'http://127.0.0.1:8002',
            dungeonurl: 'http://127.0.0.1:8003',
            online: true,
            hot: false,
            new: false
        }
    ]
};
```

---

## 9. HANDLER DETAIL

### 9.1 GetServerList

```
Input:  {type:'User', action:'GetServerList', userId, subChannel, channel}
Output: {serverList, history, offlineReason}

Logic:
1. Cek userId di SDK-Server DB → jika tidak ada → ret=37 (ERROR_NO_LOGIN_CLIENT)
2. Ambil serverList dari config.servers
3. Ambil history dari user_servers WHERE userId=? ORDER BY lastPlayed DESC
4. Return {ret:0, data:JSON, compress:false, serverTime, server0Time}
   Data: {serverList: [...], history: [serverId, ...], offlineReason: ''}
```

### 9.2 SaveHistory

```
Input:  {type:'User', action:'SaveHistory', accountToken, channelCode, serverId, securityCode, subChannel, version}
Output: {loginToken, todayLoginCount}

Logic:
1. Cek userId (accountToken) di SDK-Server DB → jika tidak ada → ret=37
2. Cek securityCode cocok dengan SDK-Server DB → jika mismatch → ret=55 (SIGN_ERROR)
3. INSERT/UPDATE user_servers (userId, serverId, lastPlayed=Date.now())
4. INSERT login_history (userId, serverId, channelCode, securityCode, loginTime=Date.now())
5. Hitung todayLoginCount:
   SELECT COUNT(*) FROM login_history
   WHERE userId=? AND date(loginTime/1000, 'unixepoch') = date('now')
6. Baca loginToken dari SDK-Server DB users table
7. Return {ret:0, data:JSON, compress:false, serverTime, server0Time}
   Data: {loginToken, todayLoginCount}
```

### 9.3 SaveUserEnterInfo

```
Input:  {type:'User', action:'SaveUserEnterInfo', accountToken, channelCode, subChannel, createTime, userLevel, version}
Output: (tidak ada data spesifik, hanya ret:0)

Logic:
1. Cek userId (accountToken) exists
2. INSERT OR REPLACE user_enter_info (userId, channelCode, createTime, userLevel, updatedAt=Date.now())
3. Return {ret:0, data:'{}', compress:false, serverTime, server0Time}
```

### 9.4 SaveLanguage

```
Input:  {type:'User', action:'SaveLanguage', userid, sdk, appid, language}
Output: {errorCode: 0}   ← di dalam data, bukan envelope!

Logic:
1. Cek userId (userid) exists
2. INSERT OR REPLACE user_language (userId, language, sdk, updatedAt=Date.now())
3. Return {ret:0, data:JSON.stringify({errorCode:0}), compress:false, serverTime, server0Time}
```

---

## 10. ERROR RESPONSE

Setiap error response WAJIB mengandung `serverTime` dan `server0Time`:

```javascript
{
    ret: errorCode,           // dari errorDefine.json
    data: '',
    compress: false,
    serverTime: Date.now(),
    server0Time: new Date().getTimezoneOffset() * 60 * 1000
}
```

### Error Codes Relevan

| Code | errorType | Kapan | Hint | isKick |
|------|-----------|-------|------|--------|
| 1 | ERROR_UNKNOWN | Error umum | window | 0 |
| 3 | ERROR_DATA_ERROR | Data corrupt/invalid | window | 0 |
| 4 | ERROR_INVALID | Data tidak valid | window | 0 |
| 8 | ERROR_LACK_PARAM | Parameter kurang | window | 0 |
| 29 | IP_NOT_IN_WHITE_LIST | IP diblokir | window | 1 |
| 37 | ERROR_NO_LOGIN_CLIENT | User tidak ditemukan | window | 0 |
| 41 | PARAM_ERR | Parameter error | window | 0 |
| 45 | FORBIDDEN_LOGIN | Akun dilarang | window | 0 |
| 55 | SIGN_ERROR | securityCode mismatch | window | 0 |
| 61 | ONLINE_USER_MAX | Server penuh | window | 0 |
| 62 | CLIENT_VERSION_ERR | Versi tidak cocok | window | 0 |
| 65 | MAINTAIN | Maintenance | window | 0 |

**Hint types:** `window` = dialog box, `float` = toast notification
**isKick:** `1` = disconnect client, `0` = tetap terhubung

---

## 11. FIELD MAPPING — SDK ↔ Login-Server

SDK `getSdkLoginInfo()` return → disimpan di `ts.loginInfo.userInfo`:

| SDK field | Login-Server field | Login-Server request field |
|-----------|-------------------|--------------------------|
| `sdk` | `channelCode` | `channelCode`, `channel` |
| `security` | `securityCode` | `securityCode` |
| `loginToken` | `loginToken` | — (dikembalikan di SaveHistory response) |
| `userId` | `userId` | `userId`, `accountToken`, `userid` |
| `nickName` | `nickName` | — (tidak dikirim ke Login-Server) |

**Perhatikan:** Login-Server pakai 3 nama berbeda untuk userId:
- `userId` — di GetServerList
- `accountToken` — di SaveHistory dan SaveUserEnterInfo
- `userid` — di SaveLanguage (huruf kecil!)

---

## 12. DATA STRUCTURES (Client-Side)

### `ts.loginInfo` (setelah onLoginSuccess, line 138020-138023)

```javascript
ts.loginInfo = {
    userInfo: {
        loginToken: string,     // dari SDK / SaveHistory response
        userId: string,         // dari SDK
        nickName: string,       // dari SDK
        channelCode: string,    // = 'ppgame'
        securityCode: string    // dari SDK
    },
    serverItem: {
        serverId: string,       // dari GetServerList
        name: string,           // dari GetServerList
        url: string,            // dari GetServerList
        chaturl: string,        // dari GetServerList
        dungeonurl: string,     // dari GetServerList
        online: boolean,        // dari GetServerList
        hot: boolean,           // dari GetServerList
        new: boolean,           // dari GetServerList
        offlineReason: string   // dari GetServerList
    }
};
```

### `ts.loginUserInfo` (line 113445-113451)

```javascript
ts.loginUserInfo = {
    userId: string,
    serverId: string,
    serverName: string,
    sign: string,
    sdk: string                // = 'ppgame'
};
```

---

## 13. FILE STRUCTURE ⚠️(SEMENTARA)

```
server/login-server/
├── package.json
├── config.js
├── db.js
└── index.js
```

### package.json

```json
{
    "name": "login-server",
    "version": "1.0.0",
    "description": "Super Warrior Z — Login Server (Port 8000)",
    "main": "index.js",
    "dependencies": {
        "socket.io": "^2.5.1",
        "better-sqlite3": "^11.7.0",
        "lz-string": "^1.5.0"
    }
}
```

**Socket.IO versi 2.5.1** — BUKAN 3.x/4.x. API berbeda.






### **LOGGER OUTPUTNYA CONTOH :** 
```
╔══════════════════════════════════════════════════════════════════════════════╗
  🚀 SUPER WARRIOR Z — LOGIN SERVER                                         
╠══════════════════════════════════════════════════════════════════════════════╣
  ⚡ Port: 8000  │  🔌 Socket.IO 2.5.1  │  🔒 TEA: OFF                     
  🗑️ DB: login_server.db  │  🔍 SDK DB: ✅ connected                       
╚══════════════════════════════════════════════════════════════════════════════╝

🟢 SESSION 493119  │  🌐 ::ffff:127.0.0.1  │  📡 websocket
┌──────────┬────┬────┬─────────────────┬──────────┬───────┬───────────────────────┐
│ ⏰ TIME  │ #  │ ➡️ │ 🔧 ACTION       │ 📊 STATUS│ ⏱ MS │ 📋 DETAILS            
├──────────┼────┼────┼─────────────────┼──────────┼───────┼───────────────────────┤
│ ◉  │ ── │ 🟢 CONNECT     │ ─────    │ ─────│ 🌐 ::1  📡 websocket    │
│    │ 🔓 │ 🔓 validate    │ ✅ OK    │ 0     │ 🔓 valid uid=test..  │
│ 1  │ ➡️ │ 🌐 GetServerList│ 📤 REQ   │ ─────│ 👤 uid=test..        │
│ 1  │ ⬅️ │ 🌐 GetServerList│ ✅ OK    │ 0     │ 🌐 1 server count=1  │
...
```

---




## 14. CATATAN IMPLEMENTASI

1. **Socket.IO 2.5.1** — API: `io.sockets.connected[socketId]`, `socket.emit(event, data, callback)`

2. **Tidak ada TEA handshake** — Jangan implementasi TEA. Langsung ready setelah connect.

3. **`type: 'User'`** — Huruf besar U. Case-sensitive.

4. **SaveLanguage field `userid`** — Huruf kecil, tanpa camelCase. Berbeda dari action lain.

5. **SaveLanguage response `errorCode`** — Di dalam data, bukan `ret` di envelope.

6. **SDK-Server DB READ-ONLY** — Jangan pernah write dari Login-Server.

7. **`serverTime` dan `server0Time`** — WAJIB di setiap response tanpa terkecuali. Success maupun error. Ini tugas server.

8. **Login socket lifecycle** — Connect → GetServerList → (select server) → SaveHistory → (enterGame Main-Server) → SaveUserEnterInfo → destroy. Bukan persistent connection.

9. **`handler.process`** — Satu-satunya event. Jangan buat event terpisah per action.

10. **`window.getAppId()`** → `''` di PPGAME SDK → `subChannel` selalu empty string.

11. **`window.serverList`** → undefined di PPGAME SDK → filterByWhiteList tidak memfilter apapun.

12. **Response `language` field** — Jika ada di response data, client otomatis set `ts.language`. Login-Server bisa kirim field ini di response mana pun.

13. **LZString compression** — `compress: false` untuk semua Login-Server response (data kecil). `serverTime` dan `server0Time` tetap WAJIB.

14. **SaveHistory success+error callback sama** — Client tetap `clientStartGame` dan `loginClient.destroy` baik success maupun error.
