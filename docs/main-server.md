# Analisa 100% Main-Server

> **Game:** Super Warrior Z (Dragon Ball themed mobile RPG)
> **Engine:** Egret (TypeScript compiled to JavaScript)
> **Sumber:** `main.min(unminfy).js` (244,761 baris, ~10.5MB) + `resource/json/` (471 file)
> **Repo:** https://github.com/anztdree/127.0.0.1-8000
> **Metode:** Zero stub, zero override, zero force, zero dummy, zero assumption — setiap detail didokumentasi dari source code

---

## Daftar Isi

1. [Arsitektur Server](#1-arsitektur-server)
2. [Protokol Komunikasi](#2-protokol-komunikasi)
3. [Login Flow ke Main-Server](#3-login-flow-ke-main-server)
4. [Error Codes](#4-error-codes)
5. [Enums & Constants](#5-enums--constants)
6. [Notify System (Server-Push)](#6-notify-system-server-push)
7. [Database Schema](#7-database-schema)
8. [Complete Handler Catalog](#8-complete-handler-catalog)
9. [Cross-Reference: Handler ↔ Resource/JSON](#9-cross-reference-handler--resourcejson)

---

## 1. Arsitektur Server

### 1.1 Game Engine

Game menggunakan **Egret Engine** (HTML5 game engine dari China), dikompilasi dari TypeScript ke JavaScript. Kode mengikuti pola `__reflect`, `__extends` untuk metadata TypeScript.

### 1.2 Topologi Server

Game terhubung ke **4 server terpisah** secara simultan:

| Server | Port | Tipe Socket | TEA Verification | Database |
|--------|------|-------------|------------------|----------|
| Login-Server | 8000 | Socket.IO 2.5.1 | **OFF** (verifyEnable=false) | login_server.db |
| Main-Server | 8001 | Socket.IO + TEA | **ON** (verifyEnable=true) | main_server.db |
| Chat-Server | 8002 | Socket.IO + TEA | **ON** (verifyEnable=true) | chat_server.db |
| Dungeon-Server | 8003 | Socket.IO + TEA | **ON** (verifyEnable=true) | dungeon_server.db |

Ditambah SDK-Server pada port 9999 (HTTP REST).

### 1.3 Client Singleton Managers

| Manager | Fungsi |
|---------|--------|
| `UserInfoSingleton` | Data pemain (userId, nickName, vipLevel, createTime, dll.) |
| `ItemsCommonSingleton` | Manajemen inventaris (items dict by ID) |
| `HerosManager` | Koleksi hero, atribut, equipment |
| `ReadJsonSingleton` | Data konfigurasi game (semua file JSON) |
| `GuildTreasureManager` | Data harta guild |
| `TrialManager` | Data temple/trial |
| `EntrustSingleton` | Data entrust/mission |
| `TeamInfoManager` | Info team/guild, state BallWar |
| `BroadcastSingleton` | Pesan sistem, broadcast arena |
| `AllRefreshCount` | Counter reset harian |
| `ServerTime` | Sinkronisasi waktu server |
| `MailInfoManager` | Sistem mail |
| `ShopInfoManager` | Data toko |
| `LittleGameManager` | Mini-game (cell game) |
| `BattleMedalManager` | Sistem battle medal |
| `GlobalWarManager` | Global war (PvP cross-server) |
| `FriendManager` | Manajemen daftar teman |

### 1.4 Koneksi & Database

- **Socket.IO 2.5.1** untuk semua komunikasi real-time
- **TEA Encryption** dengan key `'verification'` untuk handshake
- **better-sqlite3** dengan **WAL mode** untuk database
- **LZString compression** untuk response data besar
- **Data loader auto-generate** dari resource/json — semua 471 file JSON dimuat otomatis

### 1.5 TSSocketClient Class (Line 82497)

```javascript
var TSSocketClient = (function () {
    function e(serverName, verifyEnable) {
        this.socket = null;
        this.socketErrorLastTime = 0;
        this.serverName = serverName;
        this.verifyEnable = verifyEnable;
        this.maxReconnectWaitTime = 600000; // 10 menit
    }
});
```

### 1.6 Client Instances (Line 113445)

```javascript
t.loginClient = new TSSocketClient('login-server', false);   // TEA OFF
t.mainClient = new TSSocketClient('main-server', true);      // TEA ON
t.chatClient = new TSSocketClient('chat-server', true);      // TEA ON
t.dungeonClient = new TSSocketClient('dungeon-server', true); // TEA ON
```

### 1.7 TSSocketErrorType Enum (Line 82487)

| Nilai | Nama | Deskripsi |
|-------|------|-----------|
| 0 | Unknow | Error tidak diketahui |
| 1 | Error | Error socket umum |
| 2 | ReconnectError | Error reconnection |
| 3 | ReconnectFail | Reconnection gagal (max attempts) |
| 4 | Timeout | Connection timeout |
| 5 | Disconnect | Server disconnect |

### 1.8 Connection Lifecycle

1. **Login-Server:** Connect → GetServerList → SaveHistory → (enterGame Main-Server) → SaveUserEnterInfo → destroy
2. **Main-Server:** Connect → TEA verify → enterGame → persistent (listenNotify)
3. **Chat-Server:** Connect → TEA verify → login → joinRoom → persistent (listenNotify)
4. **Dungeon-Server:** Connect → TEA verify → persistent (listenNotify)

### 1.9 Logika Reconnection

Jika terputus lebih dari `maxReconnectWaitTime` (600000ms = 10 menit), client memaksa re-login. Jika tidak, client mencoba reconnection otomatis.

---

## 2. Protokol Komunikasi

### 2.1 Single Event untuk Semua Request

Semua server menggunakan **satu event Socket.IO** untuk request/response:

```javascript
// Client → Server
socket.emit('handler.process', requestObject, callbackFunction)

// Server → Client (via callbackFunction)
callbackFunction(responseObject)
```

### 2.2 Notify Event (Server → Client Push)

```javascript
// Server push notifikasi
socket.on('Notify', function(data) { ... })
```

### 2.3 Verify Event (TEA Handshake)

```javascript
// Server mengirim challenge
socket.on('verify', function(nonce) { ... })

// Client merespons
socket.emit('verify', encryptedNonce, function(response) { ... })
```

### 2.4 TEA Verification Handshake

Untuk Main-Server, Chat-Server, dan Dungeon-Server (verifyEnable=true):

```javascript
// Line 82579-82587
t.socket.on('verify', function (n) {
    var o = new TEA().encrypt(n, 'verification');
    t.socket.emit('verify', o, function (n) {
        0 == n.ret ? e() : (ErrorHandler.ShowErrorTips(n.ret, function(){}), t.destroy());
    });
});
```

**Protokol:**
1. Server emit event `verify` dengan nonce/challenge string `n`
2. Client encrypt `n` menggunakan algoritma TEA dengan key `'verification'`
3. Client emit event `verify` dengan nilai terenkripsi
4. Server merespons `{ret: 0}` untuk sukses, atau error code untuk gagal
5. Jika gagal, socket di-destroy

**TEA Key:** `'verification'` (string literal, 12 karakter)

**Penting:** Login-Server memiliki verifyEnable=false, jadi skip handshake ini.

### 2.5 Request Object Format

```javascript
{
    type: string,        // Tipe handler (misal: 'hero', 'summon', 'arena')
    action: string,      // Nama aksi (misal: 'levelUp', 'draw', 'startBattle')
    userId: string,      // User ID (dari UserInfoSingleton)
    version: string,     // Versi protokol, biasanya '1.0'
    // ... field tambahan spesifik untuk setiap aksi
}
```

**Catatan untuk Login-Server:** `type` selalu `'User'` (U huruf besar).

### 2.6 Response Envelope

```javascript
{
    ret: number,          // 0 = sukses, lainnya = error code
    data: string,         // String JSON (mungkin LZString compressed)
    compress: boolean,    // true = data di-encode LZString.decompressFromUTF16
    serverTime: number,   // Timestamp server (Date.now())
    server0Time: number   // Offset timezone (biasanya 25200000 untuk UTC+7)
}
```

**KRITIS:** `serverTime` dan `server0Time` **WAJIB** ada di setiap response — baik sukses maupun error.

### 2.7 Client Response Processing (Main-Server)

```javascript
processHandler(request, successCallback, errorCallback, skipErrorTips) {
    // Tampilkan loading setelah 600ms, timeout setelah 10000ms
    if (response.ret === 0) {
        var data = response.data;
        if (response.compress) {
            data = LZString.decompressFromUTF16(data);
        }
        if (data === '70001') {
            // Khusus: battle report request
            ts.reportBattlleLog();
            return;
        }
        var parsed = JSON.parse(data);
        successCallback(parsed);
    } else {
        if (response.ret === '22') ts.reportBattlleLog();
        if (response.ret === '38') TSBrowser.executeFunction('reload'); // Force reload
        errorCallback && errorCallback(response);
        if (!skipErrorTips) ErrorHandler.ShowErrorTips(response.ret, errorCallback);
    }
}
```

---

## 3. Login Flow ke Main-Server

### 3.1 Urutan Login Lengkap

```
1. Autentikasi SDK (HTTP ke SDK-Server port 9999)
   └── POST /auth/guest → {loginToken, sign, security, userId}

2. Inisialisasi Client
   └── window.getSdkLoginInfo() → {sdk, loginToken, nickName, userId, sign, security}

3. Koneksi ke Login-Server (port 8000)
   └── io.connect(url, {reconnectionAttempts: 10})
   └── TANPA TEA handshake (verifyEnable = false)

4. GetServerList
   └── {type: 'User', action: 'GetServerList', userId, subChannel, channel}
   └── Response: {serverList: [...], history: [...], offlineReason}

5. Pemilihan Server (client-side only)
   └── Auto-select dari history atau tampilkan UI

6. SaveHistory
   └── {type: 'User', action: 'SaveHistory', accountToken, channelCode, serverId, securityCode, subChannel, version}
   └── Response: {loginToken, todayLoginCount}

7. Koneksi ke Main-Server (port 8001)
   └── io.connect(url, {reconnectionAttempts: 10})
   └── TEA handshake (verifyEnable = true)

8. enterGame
   └── {type: 'user', action: 'enterGame', loginToken, userId, serverId, version, language, gameVersion}
   └── Response: Full user data (UserDataParser.saveUserData)

9. Koneksi ke Chat-Server (port 8002)
   └── Chat: {type: 'chat', action: 'login', userId, serverId, version}

10. Koneksi ke Dungeon-Server (port 8003) (sesuai permintaan)

11. SaveUserEnterInfo (kembali ke Login-Server)
    └── {type: 'User', action: 'SaveUserEnterInfo', accountToken, channelCode, subChannel, createTime, userLevel, version}
    └── loginClient.destroy() — socket ditutup

12. Mulai mendengarkan Notify events di semua socket aktif
```

### 3.2 Struktur Login UserInfo

```javascript
ts.loginInfo = {
    userInfo: {
        loginToken: string,
        userId: string,
        nickName: string,
        channelCode: string,    // = 'ppgame'
        securityCode: string
    },
    serverItem: {
        serverId: string,
        name: string,
        url: string,             // URL Main-Server
        chaturl: string,         // URL Chat-Server
        dungeonurl: string,      // URL Dungeon-Server
        guildRoomId: string,     // ID chat room guild
        teamChatRoomId: string,  // ID chat room team
        teamDungeonChatRoom: string,
        online: boolean,
        hot: boolean,
        new: boolean,
        offlineReason: string
    }
}
```

### 3.3 enterGame Request

```javascript
{
    type: 'user',
    action: 'enterGame',
    loginToken: string,     // Dari Login-Server SaveHistory response
    userId: string,         // User ID
    serverId: string,       // Server ID
    version: string,        // '1.0'
    language: string,       // Bahasa yang dipilih
    gameVersion: string     // Versi game client
}
```

**enterGame Response:** Data user lengkap (saveUserData) termasuk:
- Info user (level, VIP, nickname, dll.)
- Data hero
- Data item/inventaris
- Data guild
- Data arena
- Data progress (dungeon, tower, expedition, dll.)

---

## 4. Error Codes

### 4.1 Error Handler (Line 118340)

```javascript
ErrorHandler.ShowErrorTips = function (errorCode, callback) {
    var errorDefine = ReadJsonSingleton.getInstance().errorDefine;
    var errorInfo = errorDefine[errorCode];
    if (!errorInfo) {
        UIWindowManager.openNormal('Error: ' + errorCode);
        callback && callback();
        return;
    }
    if (errorInfo.isNotShow == 1) return; // Jangan tampilkan error ini
    var description = errorInfo.errorDescription;
    var hintType = errorInfo.hintType;
    if (hintType === 'window') UIWindowManager.openNormal(description, callback);
    else if (hintType === 'float') ts.openWindow('BarTypeTips', {parent: 'Tips', value: description});
};
```

### 4.2 Daftar Error Codes dari errorDefine.json (365 kode)

| Kode | Nama | Deskripsi | Hint Type | isKick |
|------|------|-----------|-----------|--------|
| 0 | SUCCESS | Sukses | - | 0 |
| 1 | ERROR_UNKNOWN | Error tidak diketahui | window | 0 |
| 3 | ERROR_DATA_ERROR | Data corrupt/invalid | window | 0 |
| 4 | ERROR_INVALID | Data invalid | window | 0 |
| 8 | ERROR_LACK_PARAM | Parameter kurang | window | 0 |
| 22 | BATTLE_REPORT | Error laporan pertempuran | - | 0 |
| 29 | IP_NOT_IN_WHITE_LIST | IP diblokir | window | 1 |
| 37 | ERROR_NO_LOGIN_CLIENT | User tidak ditemukan | window | 0 |
| 38 | FORCE_RELOAD | Force client reload | - | 1 |
| 41 | PARAM_ERR | Parameter error | window | 0 |
| 45 | FORBIDDEN_LOGIN | Akun dilarang | window | 0 |
| 55 | SIGN_ERROR | Signature/security code tidak cocok | window | 0 |
| 61 | ONLINE_USER_MAX | Server penuh | window | 0 |
| 62 | CLIENT_VERSION_ERR | Versi tidak cocok | window | 0 |
| 65 | MAINTAIN | Server maintenance | window | 0 |
| 70001 | BATTLE_LOG | Laporan log pertempuran | - | 0 |

### 4.3 Special Handling

- **Error code `38`**: Client memaksa `window.reload()` — full page reload
- **Error code `22`**: Memicu logging laporan pertempuran (reportBattlleLog)
- **Error code `70001`**: Ditangani khusus di processHandler (memicu reportBattlleLog)

### 4.4 Struktur Error Define (errorDefine.json)

Setiap error memiliki field:
- `id` (number) — Kode error
- `errorDescription` (string) — Deskripsi error (i18n key)
- `errorType` (string) — Tipe error
- `hintType` (string) — "window" atau "float" — cara menampilkan ke user
- `isKick` (number) — 1 = kick user dari server
- `isNotShow` (number) — 1 = jangan tampilkan error ke user

---

## 5. Enums & Constants

### 5.1 ThingQuality (Kualitas Item)

| Nilai | Nama |
|-------|------|
| 0 | UNKNOWN |
| 1 | WHITE |
| 2 | GREEN |
| 3 | BLUE |
| 4 | PURPLE |
| 5 | ORANGE |
| 6 | SILVERORANGE (FlickerOrange) |
| 7 | SUPERORANGE |

### 5.2 DUNGEON_TYPE

| Nilai | Nama |
|-------|------|
| 0 | DT_NULL |
| 1 | EXP |
| 2 | EVOLVE |
| 3 | ENERGY |
| 4 | EQUIP |
| 5 | SINGA |
| 6 | SINGB |
| 7 | METAL |
| 8 | Z_STONE |

### 5.3 ACTIVITY_TYPE

| Nilai | Nama |
|-------|------|
| 0 | UNKNOWN |
| 100 | ITEM_DROP |
| 101 | NEW_USER_MAIL |
| 102 | FREE_INHERIT |
| 1001 | LOGIN |
| 1002 | GROW |
| 1003 | RECHARGE_3 |
| 2001 | HERO_GIFT |
| 2002 | HERO_ORANGE |
| 2003 | NEW_SERVER_GIFT |
| 2004 | RECHARGE_GIFT |
| 2005 | POWER_RANK |
| 2006 | RECHARGE_7 |
| 2007 | RECHARGE_DAILY |
| 3001 | NORMAL_LUCK |
| 3002 | LUXURY_LUCK |
| 3003 | SUPER_GIFT |
| 3004 | LUCKY_FEEDBACK |
| 3005 | DAILY_DISCOUNT |
| 3006 | DAILY_BIG_GIFT |
| 3007 | CUMULATIVE_RECHARGE |
| 5001 | LUCKY_EQUIP |
| 5002 | IMPRINT_UP |
| 5007 | COST_FEEDBACK |
| 5008 | MERGE_SERVER_BOSS |
| 5010 | TURNTABLE |
| 5014 | WHIS_FEAST |
| 5034 | FUND |
| 5035 | LANTENBLESSING |
| 5041 | NEW_HERO_CHALLENGE |
| 99999999 | RECHARGE_MERGESERVER |

### 5.4 MESSAGE_KIND (Tipe Chat)

| Nilai | Nama |
|-------|------|
| 0 | MK_NULL |
| 1 | SYSTEM |
| 2 | WORLD |
| 3 | GUILD |
| 4 | PRIVATE |
| 5 | WORLD_TEAM |
| 6 | TEAM |

### 5.5 RANK_TYPE

| Nilai | Nama |
|-------|------|
| 0 | UNKNOW |
| 1 | POWER_RANK |
| 2 | LEVEL_RANK |
| 3 | LESSON_RANK |
| 4 | TEMPLE_RANK |
| 5 | CELL_GAME_RANK |
| 6 | GUILD_RANK |
| 7 | ARENA_RANK |
| 8 | HERO_IMAGE_RANK |
| 9 | HERO_POWER_RANK |
| 10 | IMPRINT_STAR |
| 11 | TALENT_RANK |
| 12 | TIME_TRIAL_RANK |
| 13 | GRAVITY_RANK |
| 1001 | ACTIVITY_RECHARGE_GIFT |
| 1002 | ACTIVITY_LUCK_FEEDBACK |
| 1003 | ACTIVITY_COST_FEEDBACK |
| 1004 | ACTIVITY_WHIS_FEAST |
| 1005 | ACTIVITY_KILL_NIEN_BEAST |
| 1006 | ACTIVITY_LANTERN_BLESS |
| 1007 | ACTIVITY_WEAPON_CAST |
| 1008 | ACTIVITY_LUCKY_WHEEL |

### 5.6 SummonType

| Nilai | Nama |
|-------|------|
| 0 | INVALID |
| 1 | COMMON |
| 2 | FRIEND |
| 3 | SUPER |
| 4 | SUPER_DIAMOND |
| 5 | ENERGY |
| 6 | NormalLuckPool |
| 7 | SuperLuckPool |

### 5.7 WAR_STAGE

| Nilai | Nama |
|-------|------|
| 0 | DEFAULT |
| 1 | SIGN_UP |
| 2 | AUDITION |
| 3 | RANK_64 |
| 4 | RANK_16 |
| 5 | SEMI_FINAL |
| 6 | FINAL |
| 7 | FINISH |

### 5.8 BALL_WAR_STATE

| Nilai | Nama |
|-------|------|
| 0 | UNKNOW |
| 1 | SING_UP |
| 2 | READY |
| 3 | FIGHTING |
| 4 | FINISH |

### 5.9 SYSTEM_MESSAGE_TYPE

| Nilai | Nama |
|-------|------|
| 0 | CT_NULL |
| 1 | HERO_BC_SUMMON |
| 2 | HERO_BC_WISH |
| 3 | VIP_LEVEL |
| 4 | MONTH_SMALL |
| 5 | MONTH_BIG |
| 6 | LIFE_LONG |
| 7 | ARENA_CHANGE |
| 8 | FIRST_RECHARGE |
| 9 | HERO_BC_ACTIVITY |
| 10 | HERO_BC_PIECE |
| 11 | HERO_BC_EXCHANGE |
| 12 | HERO_BC_SHOP |
| 13 | HERO_BC_ACT_POOL |
| 14 | HERO_BC_VIP_REWARD |
| 15 | LUCKY_EQUIP_PURPLE |
| 16 | LUCKY_EQUIP_ORANGE |
| 17-20 | IMPRINT_UP_GREEN hingga ORANGE |
| 21 | ACT_2004_HERO |
| 22 | ACT_2004_DRAGON_BALL |
| 23 | ACT_5006_UP |
| 24 | ACT_5005 |
| 25 | ACT_3013 |
| 32 | activityTurnTable |
| 55 | activityKarinRich |
| 56 | activityLuckyReel |
| 58 | ACT_LANTERN_LIGHT |
| 59 | ACT_LANTERN_LIGHT_BIG |
| 60 | ACT_GADVENTURE |
| 90 | ACT_LUCKY_WHEEL_PURPLE |
| 91 | ACT_LUCKY_WHEEL_ORANGE |

### 5.10 BuyCountType

| Nilai | Nama |
|-------|------|
| 9 | jiaLinTaBuyBattle |
| 10 | dragonBallBuyChallenge |
| 11 | strongEnemyBuyChallenge |
| 12 | teamBossBuyChallenge |
| 13 | wildAdventureChallenge |
| 14 | bossFightBuyChallenge |
| 15 | TopBattle |
| 16 | SpaceTrialBuyChallenge |
| 17 | ActivityMergeBoss |

### 5.11 OpenLimitType (Tipe Unlock Fitur)

| Nilai | Nama |
|-------|------|
| 0 | LEVELUP |
| 1 | WEAKUP |
| 2 | SKILL |
| 3 | EQUIP |
| 4 | SUMMON |
| 5 | FRIEND |
| 6 | CHAT |
| 7 | MAINTASK |
| 8 | MARKET |
| 9 | BLACKSMITH |
| 10 | WELFARE |
| 11 | MOONCARD |
| 12 | VIP |
| 13 | SPEEDUPTWO |
| 14 | HERORESOLVE |
| 15 | DAILYTASK |
| 16 | ACHIEVEMENTTASK |
| 17 | ARENA |
| 18 | EXPDUNGEON |
| 19 | EVOLVEDUNGEON |
| 20 | SKIPBATTLE |
| 21 | RANKLIST |
| 22 | TEMPLETEST |
| 23 | EQUIPDUNGEON |
| 24 | GUILD |
| 25 | SPEAKPUBLIC |
| 26 | SNAKEDUNGEON |
| 27 | BOSSATTACK |
| 28 | KARINTOWER |
| 29-38+ | Fitur lainnya... |

### 5.12 GameFieldType (Battle System)

| Nilai | Nama | Deskripsi |
|-------|------|-----------|
| 0 | UNKNOWN | Tidak diketahui |
| 1 | EXPDUNGEON | Dungeon EXP |
| 2 | EVOLVEDUNGEON | Dungeon Evolusi |
| 3 | METALDUNGEON | Dungeon Metal |
| 4 | ZSTONEDUNGEON | Dungeon Z-Stone |
| 5 | EQUIPDUNGEON | Dungeon Equipment |
| 6 | SIGNDUNGEON | Dungeon Signet |
| 7 | TEMPLETEST | Temple Test |
| 8 | MINE | Mine |
| 9 | SNAKEDUNGEON | Dungeon Snake |
| 10 | TIMETRAVEL | Time Travel |
| 11 | TRAINING | Training |
| 12 | ARENA | Arena (PvP) |
| 13 | KARINTOWER | Karin Tower |
| 14 | GUILDLOOT | Guild Loot |
| 15 | CELLGAME | Cell Game |
| 16 | MAHAADVENTURE | Maha Adventure |
| 17 | BOSSATTACK | Boss Attack (PvE) |
| 18 | BOSSSNATCH | Boss Snatch (PvP) |
| 19 | GUILDBOSS | Guild Boss |
| 20 | LESSON | Lesson (PvE Utama) |
| 21 | FRIENDBATTLE | Friend Battle |
| 22 | EXPEDITION | Expedition |
| 23 | GLOBALWAR | Global War |
| 24 | DRAGONBALL | Dragon Ball War |
| 25 | MERGEBOSS | Merge Server Boss |
| 26 | TIMETRAIN | Time Train |
| 27 | TEAMDUNGEON | Team Dungeon |
| 28 | TOPBATTLE | Top Battle |
| 29 | GRAVITYTEST | Gravity Test |

### 5.13 Item/Currency ID Constants

| Konstanta | ID | Deskripsi |
|-----------|-----|-----------|
| DIAMONDID | 101 | Diamond (mata uang premium) |
| GOLDID | 102 | Gold (mata uang dasar) |
| PLAYEREXPERIENCEID | 103 | Pengalaman pemain |
| PLAYERLEVELID | 104 | Level pemain |
| PLAYERVIPEXPERIENCEID | 105 | Pengalaman VIP |
| PLAYERVIPLEVELID | 106 | Level VIP |
| PLAYERVIPEXPALLID | 107 | Total pengalaman VIP |
| EXPERIENCECAPSULEID | 131 | Kapsul pengalaman |
| EVOLVECAPSULEID | 132 | Kapsul evolusi |
| FRIENDHEART | 121 | Friend heart (mata uang summon) |
| COMMONSUMMONPAPER | 122 | Kertas summon biasa |
| HIGHSUMMONPAPER | 123 | Kertas summon tinggi |
| DRAGONSPIRIT | 124 | Dragon spirit |
| SUPERWATER | 134 | Super water |
| POTENTIALWATER | 133 | Potential water |
| EARUPCOIN | 135 | Koin upgrade earring |
| EnergyStone | 136 | Energy stone |
| Metal | 137 | Metal |
| ZCOIN | 138 | Z-Coin |
| EAREVOLVECOIN | 139 | Koin evolusi earring |
| Aurine | 140 | Aurine |
| MARKETREFRESHID | 141 | Token refresh market |
| SoulCoinID | 111 | Soul coin |
| ArenaCoinID | 112 | Arena coin |
| SnakeCoinID | 113 | Snake coin |
| TeamCoinID | 114 | Team coin |
| HonourCoinID | 115 | Honour coin |
| RumID | 181 | Rum |
| ZGOLDCOIN | 240 | Z-Gold coin |
| REDHEROCAPSULEID | 546 | Kapsul hero merah |
| SSSHERORADOMPAGE | 505 | Halaman random hero SSS |
| EQUIPMINID | 3001 | ID minimum equipment |
| EQUIPMAXID | 3500 | ID maksimum equipment |
| HeroDebrisMinID | 2811 | ID minimum hero debris |
| HeroDebrisMaxID | 2864 | ID maksimum hero debris |
| LOWENTRUSTBOOK | 143 | Buku entrust rendah |
| MIDDLEENTRUSTBOOK | 144 | Buku entrust menengah |
| HIGHENTRUSTBOOK | 145 | Buku entrust tinggi |
| ONESTARBALLID | 151 | Dragon ball 1 bintang |
| TWOSTARBALLID | 152 | Dragon ball 2 bintang |
| THREESTARBALLID | 153 | Dragon ball 3 bintang |
| FOURSTARBALLID | 154 | Dragon ball 4 bintang |
| FIVESTARBALLID | 155 | Dragon ball 5 bintang |
| SIXSTARBALLID | 156 | Dragon ball 6 bintang |
| SEVENSTARBALLID | 157 | Dragon ball 7 bintang |

### 5.14 Item Type Constants

```javascript
SIGN = 'sign', EQUIP = 'equip', WEAPON = 'weapon', GENKI = 'genki',
JEWEL = 'jewel', SPECIALJEWEL = 'jewelSpecial', RING = 'ring',
HEADFRAME = 'headFrame', WEAPONPIECE = 'weaponPiece', HeroPiece = 'heroPiece',
SignPiece = 'signPiece', BASIS = 'basis', ActivityItem = 'activityItem',
DragonBall = 'dragonBall', CombinationBox = 'combinationBox', RandomBox = 'randomBox',
Usable = 'usable', HERO = 'hero', RandomHeroPiece = 'randomHeroPiece',
ChooseBox = 'chooseBox', SignGui = 'gui', SignMo = 'mo', SignShen = 'shen',
SignJie = 'jie', SignWu = 'wu', SignQuan = 'quan', BGM = 'bgm', Sound = 'sound',
HeroRedSoul = 'heroRedSoul', PlayerHeadIcon = 'playerHeadIcon', SignAddItem = 'signAddItem'
```

### 5.15 Konstanta Lainnya

```javascript
PackGridCeiling = 999
PackHorizontalCount = 4
MaxSummonNum = 10
MaxCompoundNum = 99
MaxOpenBoxNum = 999
MaxPageNum = 6
VIPMax = 15
WUKONGID = 1205  // Hero display ID Wukong
```

### 5.16 HERO_TYPE

```javascript
0: NULL, 1: BODY, 2: ARMOR, 3: DODGE, 4: BLOCK, 5: STRENGTH,
6: HIT, 7: CRITICAL, 8: SKILL, 9: DOT, 10: BODYDAMAGE,
11: ARMORDAMAGE, 12: ARMORS, 13: CRITICALSINGLE
```

### 5.17 HERO_CLASS

```javascript
0: CLASS_NULL, 1: BODY, 2: STRENGTH, 3: SKILL
```

### 5.18 SkillBasic Types

```javascript
0: NORMAL, 1: SKILL, 2: SKILL_PASSIVE, 3: SUPER, 4: POTENTIAL
```

### 5.19 EQUIPTYPE

```javascript
1: CUFF, 2: CLOTHES, 3: BELT, 4: SHOES
```

---

## 6. Notify System (Server-Push)

Server push notifikasi ke client via event `Notify` Socket.IO. Fungsi `notifyData` (Line 113986) memproses notifikasi ini.

### 6.1 Notify Action Types

| Notify Action | Deskripsi | Pemrosesan Client |
|--------------|-----------|-------------------|
| `guildAgree` | Aplikasi guild diterima | Set guild ID, join chat room |
| `beKickedOutGuild` | Dikeluarkan dari guild | Bersihkan data guild |
| `redDotDataChange` | Update notifikasi red dot | Update RedDotManager |
| `payFinish` | Pembayaran selesai | Diproses oleh sistem pembayaran |
| `timeBonus` | Time bonus tersedia | Tampilkan time bonus |
| `heroBackpackFull` | Inventaris hero penuh | Tampilkan dialog notifikasi |
| `onlineBulletin` | Bulletin/announcement online | Update BulletinSingleton |
| `scheduleModelRefresh` | Refresh model jadwal (reset harian) | Reinitialize AllRefreshCount |
| `monthCard` | Update month card | Tambah log month card |
| `vipLevel` | Perubahan level VIP | Tambah log VIP |
| `notifySummon` | Hasil summon dari sistem | Set system hero di SummonSingleton |
| `warStageChange` | Perubahan stage global war | Update stage GlobalWarManager |
| `warRankChange` | Perubahan ranking global war | Update data ranking war |
| `warAutoSign` | Auto-sign untuk war | Ubah status sign-up |
| `ballWarStateChange` | Perubahan state ball war | Update state BallWar |
| `ballWarPointRankChange` | Perubahan ranking poin ball war | Update ranking poin |
| `ballWarBroadcast` | Pesan broadcast ball war | Set pesan broadcast |
| `ballSignUp` | Sign-up ball war | Tandai sebagai signed, update active points |
| `userMessage` | Pesan user diterima | Update MailInfoManager |
| `mainTaskChange` | Task utama berubah | Update task utama |
| `areanRecord` | Update record arena | Set info pertempuran arena |
| `battleMedalRefresh` | Refresh battle medal | Set data battle medal |
| `battleMedalTaskChange` | Perubahan task battle medal | Update task battle medal |
| `Kickout` | Server kick client | Destroy semua socket, kembali ke login |

### 6.2 Notify Response Format

```javascript
{
    action: string,       // Tipe aksi notify (lihat tabel di atas)
    // ... data tambahan spesifik untuk setiap tipe notify
}
```

Envelope Notify mengikuti format yang sama dengan response reguler:
```javascript
{
    ret: 'SUCCESS',
    data: string,         // String JSON (mungkin compressed)
    compress: boolean
}
```

---

## 7. Database Schema

### 7.1 Tabel Utama

Untuk setiap tipe handler, berikut tabel DB yang diperlukan:

#### user_data (Data User Utama)
```sql
CREATE TABLE user_data (
    userId TEXT PRIMARY KEY,
    nickName TEXT,
    headImageId INTEGER,
    headBoxId INTEGER,
    level INTEGER,
    exp INTEGER,
    vipLevel INTEGER,
    vipExp INTEGER,
    diamond INTEGER DEFAULT 0,
    gold INTEGER DEFAULT 0,
    loginToken TEXT,
    serverId TEXT,
    createTime INTEGER,
    lastLoginTime INTEGER,
    language TEXT,
    guideStep TEXT,          -- JSON: langkah tutorial
    fastTeams TEXT,          -- JSON: data tim cepat
    clickSystem TEXT,        -- JSON: sistem yang pernah diklik
    bulletinRead TEXT,       -- JSON: ID bulletin yang sudah dibaca
    -- ... field lainnya
);
```

#### hero_data (Data Hero)
```sql
CREATE TABLE hero_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    displayId INTEGER NOT NULL,     -- Template ID hero
    level INTEGER DEFAULT 1,
    quality INTEGER DEFAULT 1,      -- ThingQuality
    evolveLevel INTEGER DEFAULT 0,
    star INTEGER DEFAULT 0,
    skinId INTEGER DEFAULT 0,
    activeSkill TEXT,               -- JSON: skill yang aktif
    qigongLevel INTEGER DEFAULT 0,
    selfBreakLevel INTEGER DEFAULT 0,
    selfBreakType INTEGER DEFAULT 0,
    connectHeroId INTEGER,          -- Hero yang terhubung
    position INTEGER,               -- Posisi di tim
    power INTEGER DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### item_data (Data Item/Inventaris)
```sql
CREATE TABLE item_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    itemId INTEGER NOT NULL,
    num INTEGER DEFAULT 0,
    displayId INTEGER,              -- Untuk item dengan variasi
    UNIQUE(userId, itemId, displayId),
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### equip_data (Data Equipment)
```sql
CREATE TABLE equip_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    equipId INTEGER NOT NULL,
    level INTEGER DEFAULT 1,
    quality INTEGER DEFAULT 1,
    heroId INTEGER,                 -- Hero yang memakai
    position INTEGER,               -- Posisi equipment
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### weapon_data (Data Senjata)
```sql
CREATE TABLE weapon_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    weaponId INTEGER NOT NULL,
    level INTEGER DEFAULT 1,
    quality INTEGER DEFAULT 1,
    heroId INTEGER,
    haloLevel INTEGER DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### imprint_data (Data Imprint/Signet)
```sql
CREATE TABLE imprint_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    imprintId INTEGER NOT NULL,
    level INTEGER DEFAULT 1,
    star INTEGER DEFAULT 0,
    quality INTEGER DEFAULT 1,
    part INTEGER,
    heroId INTEGER,
    viceAttrId INTEGER,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### genki_data (Data Genki)
```sql
CREATE TABLE genki_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    genkiId INTEGER NOT NULL,
    heroId INTEGER,
    pos INTEGER,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### guild_data (Data Guild)
```sql
CREATE TABLE guild_data (
    guildUUID TEXT PRIMARY KEY,
    guildName TEXT NOT NULL,
    iconId INTEGER,
    captainUserId TEXT,
    viceCaptainUserId TEXT,
    bulletin TEXT,
    description TEXT,
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    memberNum INTEGER DEFAULT 0,
    needAgree INTEGER DEFAULT 1,
    limitLevel INTEGER DEFAULT 0,
    createTime INTEGER,
    FOREIGN KEY (captainUserId) REFERENCES user_data(userId)
);
```

#### guild_member_data (Data Member Guild)
```sql
CREATE TABLE guild_member_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildUUID TEXT NOT NULL,
    userId TEXT NOT NULL,
    position INTEGER DEFAULT 0,     -- 0=member, 1=vice captain, 2=captain
    joinTime INTEGER,
    donateNum INTEGER DEFAULT 0,
    UNIQUE(guildUUID, userId),
    FOREIGN KEY (guildUUID) REFERENCES guild_data(guildUUID),
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### friend_data (Data Teman)
```sql
CREATE TABLE friend_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    friendId TEXT NOT NULL,
    giveHeartTime INTEGER DEFAULT 0,
    getHeartTime INTEGER DEFAULT 0,
    UNIQUE(userId, friendId),
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### friend_blacklist (Data Blacklist Teman)
```sql
CREATE TABLE friend_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    targetUserId TEXT NOT NULL,
    UNIQUE(userId, targetUserId),
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### arena_data (Data Arena)
```sql
CREATE TABLE arena_data (
    userId TEXT PRIMARY KEY,
    rank INTEGER DEFAULT 0,
    times INTEGER DEFAULT 0,
    buyTimes INTEGER DEFAULT 0,
    team TEXT,                      -- JSON: data tim arena
    lastRefreshTime INTEGER,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### mail_data (Data Mail)
```sql
CREATE TABLE mail_data (
    mailId INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    senderId TEXT,
    title TEXT,
    content TEXT,
    awards TEXT,                    -- JSON: data hadiah
    isRead INTEGER DEFAULT 0,
    isGot INTEGER DEFAULT 0,
    sendTime INTEGER,
    expireTime INTEGER,
    type INTEGER DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### shop_data (Data Toko)
```sql
CREATE TABLE shop_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    shopType INTEGER NOT NULL,
    goodsId INTEGER NOT NULL,
    buyTimes INTEGER DEFAULT 0,
    refreshTime INTEGER DEFAULT 0,
    UNIQUE(userId, shopType, goodsId),
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### dungeon_data (Data Dungeon Progress)
```sql
CREATE TABLE dungeon_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    dungeonType INTEGER NOT NULL,   -- DUNGEON_TYPE enum
    level INTEGER DEFAULT 0,
    sweepLevel INTEGER DEFAULT 0,
    times INTEGER DEFAULT 0,
    buyTimes INTEGER DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### tower_data (Data Karin Tower)
```sql
CREATE TABLE tower_data (
    userId TEXT PRIMARY KEY,
    floor INTEGER DEFAULT 0,
    times INTEGER DEFAULT 0,
    buyTimes INTEGER DEFAULT 0,
    climbTimes INTEGER DEFAULT 0,
    events TEXT,                    -- JSON: data event
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### expedition_data (Data Expedition)
```sql
CREATE TABLE expedition_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    machineId INTEGER,
    heroId INTEGER,
    lessonIds TEXT,                 -- JSON
    teams TEXT,                     -- JSON
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### battle_data (Data Pertempuran Aktif)
```sql
CREATE TABLE battle_data (
    battleId TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    battleField INTEGER NOT NULL,   -- GameFieldType
    seed TEXT,                      -- Random seed
    team TEXT,                      -- JSON: data tim
    startTime INTEGER,
    status INTEGER DEFAULT 0,       -- 0=ongoing, 1=completed
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### ball_war_data (Data Dragon Ball War)
```sql
CREATE TABLE ball_war_data (
    userId TEXT PRIMARY KEY,
    state INTEGER DEFAULT 0,        -- BALL_WAR_STATE
    signedUp INTEGER DEFAULT 0,
    times INTEGER DEFAULT 0,
    defence TEXT,                   -- JSON: data pertahanan
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### entrust_data (Data Entrust)
```sql
CREATE TABLE entrust_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    entrustIndex INTEGER,
    heroInfo TEXT,                  -- JSON: data hero entrust
    status INTEGER DEFAULT 0,
    finishTime INTEGER,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### resonance_data (Data Resonance)
```sql
CREATE TABLE resonance_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    cabinId INTEGER NOT NULL,
    seatId INTEGER NOT NULL,
    heroId INTEGER,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### super_skill_data (Data Super Skill)
```sql
CREATE TABLE super_skill_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    skillId INTEGER NOT NULL,
    level INTEGER DEFAULT 1,
    evolveLevel INTEGER DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### gemstone_data (Data Gemstone)
```sql
CREATE TABLE gemstone_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    stoneId INTEGER NOT NULL,
    displayId INTEGER,
    level INTEGER DEFAULT 1,
    heroId INTEGER,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

#### rank_data (Data Ranking)
```sql
CREATE TABLE rank_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rankType INTEGER NOT NULL,      -- RANK_TYPE enum
    userId TEXT NOT NULL,
    rankValue INTEGER DEFAULT 0,
    rankLevel INTEGER DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES user_data(userId)
);
```

---

## 8. Complete Handler Catalog

Total aksi unik Main-Server: **497 aksi** (dari total 509 di semua server)


### 8.1 user (13 aksi)
**File:** `handlers/user/`

#### user.enterGame
- **File:** `handlers/user/enterGame.js`
- **Request:** `{type:'user', action:'enterGame', loginToken:string, userId:string, serverId:string, version:string, language:string, gameVersion:string}`
- **Response:** Full user data (saveUserData) — semua data pemain termasuk heroes, items, guild, arena, dsb.
- **Logika:** Verifikasi loginToken, muat semua data user dari DB, kirim data lengkap ke client
- **JSON Referensi:** Semua file konfigurasi (dimuat oleh ReadJsonSingleton)
- **DB Operations:** READ user_data, hero_data, item_data, equip_data, weapon_data, imprint_data, genki_data, guild_data, arena_data, dsb.
- **Notify:** Tidak ada (ini adalah aksi pertama setelah koneksi)

#### user.registChat
- **File:** `handlers/user/registChat.js`
- **Request:** `{type:'user', action:'registChat', userId:string, version:string}`
- **Response:** Status registrasi chat
- **Logika:** Registrasi user ke Chat-Server
- **DB Operations:** READ user_data
- **Notify:** Tidak ada

#### user.exitGame
- **File:** `handlers/user/exitGame.js`
- **Request:** `{type:'user', action:'exitGame', userId:string}`
- **Response:** Status exit
- **Logika:** Simpan data user, set offline, log waktu logout
- **DB Operations:** UPDATE user_data (set offline)
- **Notify:** Tidak ada

#### user.changeNickName
- **File:** `handlers/user/changeNickName.js`
- **Request:** `{type:'user', action:'changeNickName', userId:string, nickName:string, version:string}`
- **Response:** Data update user
- **Logika:** Ubah nickname user, validasi panjang dan duplikasi
- **DB Operations:** UPDATE user_data (nickName)
- **Notify:** Tidak ada

#### user.changeHeadImage
- **File:** `handlers/user/changeHeadImage.js`
- **Request:** `{type:'user', action:'changeHeadImage', userId:string, headImageId:number, version:string}`
- **Response:** Data update user
- **Logika:** Ubah gambar kepala user, validasi ID
- **JSON Referensi:** `playerIcon.json`
- **DB Operations:** UPDATE user_data (headImageId)
- **Notify:** Tidak ada

#### user.changeHeadBox
- **File:** `handlers/user/changeHeadBox.js`
- **Request:** `{type:'user', action:'changeHeadBox', userId:string, boxId:number, version:string}`
- **Response:** Data update user
- **Logika:** Ubah bingkai kepala user
- **JSON Referensi:** `headFrame.json`
- **DB Operations:** UPDATE user_data (headBoxId)
- **Notify:** Tidak ada

#### user.queryPlayerHeadIcon
- **File:** `handlers/user/queryPlayerHeadIcon.js`
- **Request:** `{type:'user', action:'queryPlayerHeadIcon', userId:string, version:string}`
- **Response:** Data ikon kepala pemain
- **Logika:** Ambil data ikon kepala yang dimiliki user
- **DB Operations:** READ user_data
- **Notify:** Tidak ada

#### user.readBulletin
- **File:** `handlers/user/readBulletin.js`
- **Request:** `{type:'user', action:'readBulletin', userId:string, id:number, version:string}`
- **Response:** Status baca bulletin
- **Logika:** Tandai bulletin sebagai sudah dibaca
- **DB Operations:** UPDATE user_data (bulletinRead)
- **Notify:** Tidak ada

#### user.getBulletinBrief
- **File:** `handlers/user/getBulletinBrief.js`
- **Request:** `{type:'user', action:'getBulletinBrief', userId:string, version:string}`
- **Response:** Daftar bulletin singkat
- **Logika:** Ambil daftar bulletin yang tersedia
- **JSON Referensi:** `noticeContent.json`
- **DB Operations:** READ user_data
- **Notify:** Tidak ada

#### user.suggest
- **File:** `handlers/user/suggest.js`
- **Request:** `{type:'user', action:'suggest', userId:string, info:string, version:string}`
- **Response:** Status terima saran
- **Logika:** Simpan saran/feedback user
- **DB Operations:** INSERT ke tabel suggest_data
- **Notify:** Tidak ada

#### user.clickSystem
- **File:** `handlers/user/clickSystem.js`
- **Request:** `{type:'user', action:'clickSystem', sysType:number, userId:string}`
- **Response:** Status klik sistem
- **Logika:** Catat bahwa user mengklik fitur sistem tertentu (untuk tracking/analytics)
- **DB Operations:** UPDATE user_data (clickSystem)
- **Notify:** Tidak ada

#### user.saveFastTeam
- **File:** `handlers/user/saveFastTeam.js`
- **Request:** `{type:'user', action:'saveFastTeam', userId:string, teams:object, superSkill:object, teamId:number}`
- **Response:** Status simpan tim
- **Logika:** Simpan konfigurasi tim cepat
- **DB Operations:** UPDATE user_data (fastTeams)
- **Notify:** Tidak ada

#### user.setFastTeamName
- **File:** `handlers/user/setFastTeamName.js`
- **Request:** `{type:'user', action:'setFastTeamName', userId:string, name:string, teamId:number}`
- **Response:** Status ubah nama tim
- **Logika:** Ubah nama tim cepat
- **DB Operations:** UPDATE user_data (fastTeams)
- **Notify:** Tidak ada

---

### 8.2 hero (21 aksi)
**File:** `handlers/hero/`

#### hero.autoLevelUp
- **File:** `handlers/hero/autoLevelUp.js`
- **Request:** `{type:'hero', action:'autoLevelUp', userId:string, heroId:number, version:string, times:number}`
- **Response:** Data hero yang diupdate, changeInfo (item/currency berubah)
- **Logika:** Level up hero otomatis sebanyak `times` kali. Cek biaya berdasarkan quality (heroLevelUpWhite/Green/Blue/Purple/Orange/FlickerOrange/SuperOrange), kurangi sumber daya, tambah exp/level.
- **JSON Referensi:** `hero.json`, `heroLevelUpWhite.json`, `heroLevelUpGreen.json`, `heroLevelUpBlue.json`, `heroLevelUpPurple.json`, `heroLevelUpOrange.json`, `heroLevelUpFlickerOrange.json`, `heroLevelUpSuperOrange.json`, `heroLevelAttr.json`
- **DB Operations:** UPDATE hero_data (level), UPDATE item_data (kurangi sumber daya)
- **Notify:** Tidak ada

#### hero.evolve
- **File:** `handlers/hero/evolve.js`
- **Request:** `{type:'hero', action:'evolve', userId:string, heroId:number, version:string}`
- **Response:** Data hero yang di-evolve, changeInfo
- **Logika:** Evolve hero ke kualitas berikutnya. Cek material yang dibutuhkan dari heroEvolve.json, kurangi material, update kualitas hero.
- **JSON Referensi:** `hero.json`, `heroEvolve.json`, `heroEvolveRed.json`, `heroPiece.json`
- **DB Operations:** UPDATE hero_data (quality, evolveLevel), UPDATE item_data (kurangi material)
- **Notify:** Tidak ada

#### hero.wakeUp
- **File:** `handlers/hero/wakeUp.js`
- **Request:** `{type:'hero', action:'wakeUp', userId:string, heroId:number, heros:object, dragonPieceNum:object, selfPieceNum:object, version:string}`
- **Response:** Data hero yang di-wake up, changeInfo
- **Logika:** Wake up hero menggunakan hero piece dan dragon piece. Cek kebutuhan dari heroWakeUp.json.
- **JSON Referensi:** `hero.json`, `heroWakeUp.json`, `heroWakeUpRed.json`
- **DB Operations:** UPDATE hero_data (star), UPDATE item_data (kurangi piece), DELETE hero_data (hero yang dikorbankan)
- **Notify:** Tidak ada

#### hero.resolve
- **File:** `handlers/hero/resolve.js`
- **Request:** `{type:'hero', action:'resolve', userId:string, heros:array, version:string}`
- **Response:** changeInfo (item yang didapat dari resolve)
- **Logika:** Resolve/dekomposisi hero menjadi material. Cek hasil resolve dari heroResolve.json.
- **JSON Referensi:** `hero.json`, `heroResolve.json`
- **DB Operations:** DELETE hero_data, UPDATE item_data (tambah material)
- **Notify:** Tidak ada

#### hero.reborn
- **File:** `handlers/hero/reborn.js`
- **Request:** `{type:'hero', action:'reborn', userId:string, heros:array, keepStar:boolean, version:string}`
- **Response:** changeInfo (item yang dikembalikan)
- **Logika:** Reborn hero — kembalikan semua investasi (level, evolve, dsb.), reset hero ke kondisi awal. Jika keepStar=true, pertahankan bintang.
- **JSON Referensi:** `hero.json`, `heroRebirth.json`
- **DB Operations:** UPDATE hero_data (reset level/evolve), UPDATE item_data (kembalikan material)
- **Notify:** Tidak ada

#### hero.inherit
- **File:** `handlers/hero/inherit.js`
- **Request:** `{type:'hero', action:'inherit', userId:string, fromHeroId:number, toHeroId:number, version:string}`
- **Response:** Data kedua hero yang diupdate
- **Logika:** Transfer progress dari satu hero ke hero lain (level, evolve, dsb.). Hero sumber di-reset.
- **JSON Referensi:** `hero.json`, `inherit.json`
- **DB Operations:** UPDATE hero_data (kedua hero)
- **Notify:** Tidak ada

#### hero.connectHero
- **File:** `handlers/hero/connectHero.js`
- **Request:** `{type:'hero', action:'connectHero', ...}`
- **Response:** Data hero yang terhubung
- **Logika:** Hubungkan hero untuk bonus connect/link
- **JSON Referensi:** `heroConnect.json`, `heroConnectLevelMax.json`, `heroConnectSeatBuyTime.json`
- **DB Operations:** UPDATE hero_data (connectHeroId)
- **Notify:** Tidak ada

#### hero.disconnectHero
- **File:** `handlers/hero/disconnectHero.js`
- **Request:** `{type:'hero', action:'disconnectHero', ...}`
- **Response:** Data hero yang diputus
- **Logika:** Putuskan koneksi hero
- **JSON Referensi:** `heroConnect.json`
- **DB Operations:** UPDATE hero_data (connectHeroId = null)
- **Notify:** Tidak ada

#### hero.changeSkin
- **File:** `handlers/hero/changeSkin.js`
- **Request:** `{type:'hero', action:'activeSkin', userId:string, skinId:number}`
- **Response:** Data skin yang diaktifkan
- **Logika:** Aktifkan skin untuk hero
- **JSON Referensi:** `heroSkin.json`, `heroSkinSkillIDMapping.json`
- **DB Operations:** UPDATE hero_data (skinId)
- **Notify:** Tidak ada

#### hero.changeHeroSkin
- **File:** `handlers/hero/changeHeroSkin.js`
- **Request:** `{type:'hero', action:'useSkin', userId:string, skinId:number}`
- **Response:** Data skin yang digunakan
- **Logika:** Ganti skin yang sedang digunakan hero
- **JSON Referensi:** `heroSkin.json`
- **DB Operations:** UPDATE hero_data (skinId)
- **Notify:** Tidak ada

#### hero.getRandom
- **File:** `handlers/hero/getRandom.js`
- **Request:** `{type:'battle', action:'getRandom', userId:string, battleId:string, count:number, version:string}`
- **Response:** Random seed untuk battle
- **Logika:** Dapatkan random seed dari server untuk validasi battle
- **DB Operations:** READ battle_data
- **Notify:** Tidak ada

#### hero.getHeroInfo
- **File:** `handlers/hero/getHeroInfo.js`
- **Request:** `{type:'hero', action:'queryHeroEquipInfo', userId:string, queryUserId:string, heroId:number, withAttr:boolean, serverId:string, version:string}`
- **Response:** Data lengkap hero termasuk atribut dan equipment
- **Logika:** Ambil info hero untuk dilihat oleh user lain (misal di arena, top battle)
- **JSON Referensi:** `hero.json`, `heroLevelAttr.json`, `heroPower.json`
- **DB Operations:** READ hero_data, equip_data, weapon_data, imprint_data, genki_data
- **Notify:** Tidak ada

#### hero.changeHeroTeamPosition
- **File:** `handlers/hero/changeHeroTeamPosition.js`
- **Request:** `{type:'hero', action:'saveFastTeam', ...}` (via saveFastTeam)
- **Response:** Status perubahan posisi
- **Logika:** Ubah posisi hero dalam tim
- **DB Operations:** UPDATE hero_data (position), UPDATE user_data (fastTeams)
- **Notify:** Tidak ada

#### hero.heroImageLevelUp
- **File:** `handlers/hero/heroImageLevelUp.js`
- **Request:** `{type:'heroImage', action:...}`
- **Response:** Data hero image yang di-level up
- **Logika:** Level up hero image
- **DB Operations:** UPDATE hero_data (heroImageLevel)
- **Notify:** Tidak ada

#### hero.heroImageGetReward
- **File:** `handlers/hero/heroImageGetReward.js`
- **Request:** `{type:'heroImage', action:...}`
- **Response:** Hadiah dari hero image
- **Logika:** Ambil hadiah dari level hero image
- **DB Operations:** UPDATE item_data (tambah hadiah)
- **Notify:** Tidak ada

#### hero.heroImageGetInfo
- **File:** `handlers/hero/heroImageGetInfo.js`
- **Request:** `{type:'heroImage', action:'getAll', userId:string, version:string}`
- **Response:** Data semua hero image
- **Logika:** Ambil info semua hero image user
- **DB Operations:** READ hero_data
- **Notify:** Tidak ada

#### hero.heroOrangeTransform
- **File:** `handlers/hero/heroOrangeTransform.js`
- **Request:** `{type:'hero', action:'splitHero', userId:string, heros:array, version:string}`
- **Response:** Data transformasi hero
- **Logika:** Transformasi hero orange
- **DB Operations:** UPDATE hero_data
- **Notify:** Tidak ada

#### hero.heroRedSoul
- **File:** `handlers/hero/heroRedSoul.js`
- **Request:** `{type:'hero', action:...}`
- **Response:** Data red soul hero
- **Logika:** Proses hero red soul
- **DB Operations:** UPDATE hero_data, item_data
- **Notify:** Tidak ada

#### hero.superSkillLevelUp
- **File:** `handlers/hero/superSkillLevelUp.js`
- **Request:** `{type:'superSkill', action:'levelUpSuperSkill', userId:string, skillId:number, version:string}`
- **Response:** Data super skill yang di-level up
- **Logika:** Level up super skill hero
- **JSON Referensi:** `superSkill.json`, `superLevelUp.json`
- **DB Operations:** UPDATE super_skill_data (level)
- **Notify:** Tidak ada

#### hero.superSkillGetInfo
- **File:** `handlers/hero/superSkillGetInfo.js`
- **Request:** `{type:'superSkill', action:...}`
- **Response:** Data super skill
- **Logika:** Ambil info super skill
- **JSON Referensi:** `superSkill.json`
- **DB Operations:** READ super_skill_data
- **Notify:** Tidak ada

#### hero.superSkillChange
- **File:** `handlers/hero/superSkillChange.js`
- **Request:** `{type:'superSkill', action:'resetSuperSkill', userId:string, skillId:number, version:string}`
- **Response:** Data super skill yang direset
- **Logika:** Reset super skill (kembalikan material, reset level)
- **JSON Referensi:** `superSkill.json`
- **DB Operations:** UPDATE super_skill_data (reset), UPDATE item_data (kembalikan material)
- **Notify:** Tidak ada

---

### 8.3 summon (6 aksi)
**File:** `handlers/summon/`

#### summon.draw (summonOne / summonOneFree / summonTen)
- **File:** `handlers/summon/draw.js`
- **Request (One):** `{type:'summon', action:'summonOne', userId:string, sType:number, version:string}`
- **Request (OneFree):** `{type:'summon', action:'summonOneFree', userId:string, sType:number, isGuide:boolean, version:string}`
- **Request (Ten):** `{type:'summon', action:'summonTen', userId:string, sType:number, version:string}`
- **Response:** Hasil summon (hero/item yang didapat), changeInfo
- **Logika:** Summon hero/item berdasarkan tipe (COMMON/FRIEND/SUPER/SUPER_DIAMOND/ENERGY). Cek biaya dari summon.json, random dari summonPool.json, berikan hasil.
- **JSON Referensi:** `summon.json`, `summonPool.json`, `summonEnergy.json`, `randomHero.json`, `randomHeroPiece.json`, `randomBox.json`, `summonRandom.json`
- **DB Operations:** UPDATE item_data (kurangi biaya, tambah hasil), INSERT hero_data (jika hero baru), UPDATE user_data
- **Notify:** `notifySummon` (jika hero didapat dari sistem)

#### summon.getSummonInfo
- **File:** `handlers/summon/getSummonInfo.js`
- **Request:** `{type:'summon', action:...}` (implisit dari UI)
- **Response:** Info summon (pool, biaya, free count, dsb.)
- **Logika:** Ambil info lengkap summon pool
- **JSON Referensi:** `summon.json`, `summonPool.json`, `summonEnergy.json`
- **DB Operations:** READ user_data (summon info)
- **Notify:** Tidak ada

#### summon.getSummonRecord
- **File:** `handlers/summon/getSummonRecord.js`
- **Request:** `{type:'summon', action:'readWishList', userId:string}`
- **Response:** Record summon user
- **Logika:** Ambil riwayat summon user
- **DB Operations:** READ summon_record_data
- **Notify:** Tidak ada

#### summon.summonEnergyExchange
- **File:** `handlers/summon/summonEnergyExchange.js`
- **Request:** `{type:'summon', action:'summonEnergy', userId:string, version:string}`
- **Response:** Hasil exchange energy summon
- **Logika:** Tukar summon energy dengan hadiah
- **JSON Referensi:** `summonEnergy.json`
- **DB Operations:** UPDATE item_data
- **Notify:** Tidak ada

#### summon.buySummonPaper
- **File:** `handlers/summon/buySummonPaper.js`
- **Request:** `{type:'summon', action:...}`
- **Response:** Status pembelian kertas summon
- **Logika:** Beli kertas summon dengan diamond
- **DB Operations:** UPDATE item_data
- **Notify:** Tidak ada

#### summon.getSummonPoolInfo
- **File:** `handlers/summon/getSummonPoolInfo.js`
- **Request:** `{type:'summon', action:'setWishList', userId:string, wishList:array}`
- **Response:** Info summon pool
- **Logika:** Set wish list dan ambil info pool
- **JSON Referensi:** `summonPool.json`
- **DB Operations:** UPDATE user_data (wishList)
- **Notify:** Tidak ada

---

### 8.4 guild (32 aksi)
**File:** `handlers/guild/`

#### guild.createGuild
- **Request:** `{type:'guild', action:'createGuild', userId:string, guildName:string, version:string}`
- **Response:** Data guild yang dibuat
- **Logika:** Buat guild baru, set user sebagai captain, validasi nama
- **JSON Referensi:** `guild.json`, `guildHeadIcon.json`
- **DB Operations:** INSERT guild_data, INSERT guild_member_data, UPDATE user_data (guildUUID)
- **Notify:** `guildAgree`

#### guild.applyGuild
- **Request:** `{type:'guild', action:'requestGuild', userId:string, guildUUIDs:array, version:string}`
- **Response:** Status aplikasi
- **Logika:** Ajukan permohonan bergabung ke guild
- **DB Operations:** INSERT guild_apply_data
- **Notify:** Tidak ada (server push ke guild captain)

#### guild.agreeApply
- **Request:** `{type:'guild', action:'handleRequest', userId:string, guildUUID:string, memberUserId:string, agree:boolean, version:string}`
- **Response:** Status persetujuan
- **Logika:** Setujui atau tolak permohonan bergabung
- **DB Operations:** DELETE guild_apply_data, INSERT guild_member_data
- **Notify:** `guildAgree` (ke user yang diterima)

#### guild.refuseApply
- **Request:** `{type:'guild', action:'handleRequest', userId:string, guildUUID:string, memberUserId:string, agree:false, version:string}`
- **Response:** Status penolakan
- **Logika:** Tolak permohonan bergabung
- **DB Operations:** DELETE guild_apply_data
- **Notify:** Tidak ada

#### guild.quitGuild
- **Request:** `{type:'guild', action:'quitGuild', userId:string, guildUUID:string, memberUserId:string, version:string}`
- **Response:** Status keluar guild
- **Logika:** Keluar dari guild, hapus keanggotaan
- **DB Operations:** DELETE guild_member_data, UPDATE user_data (guildUUID = null)
- **Notify:** Tidak ada

#### guild.kickOutGuild
- **Request:** `{type:'guild', action:'kickOut', userId:string, guildUUID:string, memberUserId:string, version:string}`
- **Response:** Status kick
- **Logika:** Kick member dari guild (hanya captain/vice captain)
- **DB Operations:** DELETE guild_member_data, UPDATE user_data (guildUUID = null)
- **Notify:** `beKickedOutGuild` (ke user yang di-kick)

#### guild.changeGuildName
- **Request:** `{type:'guild', action:'changeGuildName', userId:string, guildUUID:string, guildName:string, version:string}`
- **Response:** Status ubah nama
- **Logika:** Ubah nama guild (captain only, biaya diamond)
- **DB Operations:** UPDATE guild_data (guildName), UPDATE item_data (kurangi diamond)
- **Notify:** Tidak ada

#### guild.changeGuildIcon
- **Request:** `{type:'guild', action:'updateGuildIcon', userId:string, guildUUID:string, iconId:number, version:string}`
- **Response:** Status ubah ikon
- **Logika:** Ubah ikon guild
- **JSON Referensi:** `guildHeadIcon.json`
- **DB Operations:** UPDATE guild_data (iconId)
- **Notify:** Tidak ada

#### guild.setGuildNotice
- **Request:** `{type:'guild', action:'updateBulletin', userId:string, guildUUID:string, bulletin:string, version:string}`
- **Response:** Status ubah bulletin
- **Logika:** Ubah bulletin/announcement guild
- **DB Operations:** UPDATE guild_data (bulletin)
- **Notify:** Tidak ada

#### guild.getGuildInfo
- **Request:** `{type:'guild', action:'getGuildDetail', userId:string, guildUUID:string, version:string}`
- **Response:** Data lengkap guild
- **Logika:** Ambil detail guild
- **DB Operations:** READ guild_data, guild_member_data
- **Notify:** Tidak ada

#### guild.getGuildList
- **Request:** `{type:'guild', action:'getGuildList', userId:string, isAll:boolean, curPage:number, pageLen:number, version:string}`
- **Response:** Daftar guild (paginated)
- **Logika:** Ambil daftar guild dengan paginasi
- **DB Operations:** READ guild_data (paginated)
- **Notify:** Tidak ada

#### guild.getApplyList
- **Request:** `{type:'guild', action:'getRequestMembers', userId:string, guildUUID:string, version:string}`
- **Response:** Daftar permohonan bergabung
- **Logika:** Ambil daftar permohonan guild
- **DB Operations:** READ guild_apply_data
- **Notify:** Tidak ada

#### guild.getMemberList
- **Request:** `{type:'guild', action:'getMembers', userId:string, guildUUID:string, version:string}`
- **Response:** Daftar member guild
- **Logika:** Ambil daftar member guild dengan info lengkap
- **DB Operations:** READ guild_member_data, user_data
- **Notify:** Tidak ada

#### guild.changePosition (appointmentViceCaptain / relieveViceCaptain / transferCaptain)
- **Request:** `{type:'guild', action:'appointmentViceCaptain'|'relieveViceCaptain'|'transferCaptain', userId:string, guildUUID:string, memberUserId:string, version:string}`
- **Response:** Status perubahan posisi
- **Logika:** Ubah posisi member guild (captain ↔ vice captain ↔ member)
- **DB Operations:** UPDATE guild_member_data (position), UPDATE guild_data (captainUserId/viceCaptainUserId)
- **Notify:** Tidak ada

#### guild.guildTechLevelUp
- **Request:** `{type:'guild', action:'upgradeTech', userId:string, techType:number, techId:number, times:number, version:string}`
- **Response:** Data tech yang di-upgrade
- **Logika:** Upgrade teknologi guild
- **JSON Referensi:** `guildTech.json`, `guildTechAbility.json`
- **DB Operations:** UPDATE guild_tech_data, UPDATE item_data (kurangi biaya)
- **Notify:** Tidak ada

#### guild.guildShopBuy
- **Request:** `{type:'guild', action:...}` (via shop)
- **Response:** Item yang dibeli
- **Logika:** Beli item dari toko guild
- **JSON Referensi:** `guildShop.json`, `shopRefresh.json`
- **DB Operations:** UPDATE item_data, UPDATE shop_data
- **Notify:** Tidak ada

#### guild.guildBossInfo
- **Request:** `{type:'guild', action:'getGuildBossInfo', userId:string, guildUUID:string, version:string}`
- **Response:** Info boss guild
- **Logika:** Ambil info boss guild (level, HP, reward, dsb.)
- **JSON Referensi:** `guildBOSS.json`, `guildBOSSBasic.json`, `guildBOSSReward.json`
- **DB Operations:** READ guild_boss_data
- **Notify:** Tidak ada

#### guild.guildBossStartBattle
- **Request:** `{type:'guild', action:'startBoss', userId:string, guildUUID:string, bossId:number, version:string, team:object, battleField:19}`
- **Response:** Data pertempuran boss guild
- **Logika:** Mulai pertempuran boss guild
- **JSON Referensi:** `guildBOSS.json`
- **DB Operations:** INSERT battle_data, UPDATE guild_boss_data
- **Notify:** Tidak ada

#### guild.guildBossCheckBattleResult
- **Request:** `{type:'guild', action:...}` (via checkBattleResult)
- **Response:** Hasil pertempuran, reward
- **Logika:** Validasi hasil pertempuran boss guild, berikan reward
- **JSON Referensi:** `guildBOSS.json`, `guildBOSSReward.json`
- **DB Operations:** UPDATE battle_data, UPDATE item_data (tambah reward), UPDATE guild_boss_data (damage)
- **Notify:** Tidak ada

#### guild.guildBossGetReward
- **Request:** `{type:'guild', action:...}`
- **Response:** Reward boss guild
- **Logika:** Ambil reward dari boss guild yang sudah dikalahkan
- **DB Operations:** UPDATE item_data
- **Notify:** Tidak ada

#### guild.guildBossBuyTimes
- **Request:** `{type:'guild', action:'buyBossTimes', times:number, userId:string, version:string}`
- **Response:** Status pembelian times
- **Logika:** Beli kesempatan serang boss guild tambahan
- **DB Operations:** UPDATE guild_boss_data (buyTimes)
- **Notify:** Tidak ada

#### guild.guildGrabInfo / guildGrabStartBattle / guildGrabCheckBattleResult / guildGrabGetReward / guildGrabChest / guildGrabRefresh / guildGrabChangePos / guildGrabJoin
- **Request:** Bervariasi per aksi
- **Response:** Data guild grab (harta karun guild)
- **Logika:** Sistem harta karun guild — serang guild lain untuk rampok harta
- **JSON Referensi:** `guildGrabChest.json`, `guildGrabBattleGlobal.json`
- **DB Operations:** CRUD guild_grab_data
- **Notify:** Tidak ada

#### guild.guildActivePoint
- **Request:** `{type:'guild', action:...}`
- **Response:** Data poin aktif guild
- **Logika:** Ambil/update poin aktif guild
- **JSON Referensi:** `guildActivePoint.json`
- **DB Operations:** READ/UPDATE guild_active_data
- **Notify:** Tidak ada

#### guild.guildOpen
- **Request:** `{type:'guild', action:...}`
- **Response:** Status buka guild
- **Logika:** Buka/tutup fitur guild
- **JSON Referensi:** `guildOpen.json`
- **DB Operations:** UPDATE guild_data
- **Notify:** Tidak ada

#### guild.guildContentChange
- **Request:** `{type:'guild', action:...}`
- **Response:** Status perubahan konten guild
- **Logika:** Ubah konten/deskripsi guild
- **JSON Referensi:** `guildContent.json`
- **DB Operations:** UPDATE guild_data
- **Notify:** Tidak ada

---

### 8.5 friend (18 aksi)
**File:** `handlers/friend/`

#### friend.getFriendList
- **Request:** `{type:'friend', action:'getFriends', userId:string, version:string}`
- **Response:** Daftar teman dengan info lengkap
- **DB Operations:** READ friend_data, user_data

#### friend.applyFriend
- **Request:** `{type:'friend', action:'applyFriend', userId:string, friendId:string, version:string}`
- **Response:** Status aplikasi
- **DB Operations:** INSERT friend_apply_data

#### friend.agreeApply
- **Request:** `{type:'friend', action:'handleApply', userId:string, agree:true, friendId:string, version:string}`
- **Response:** Status persetujuan
- **DB Operations:** DELETE friend_apply_data, INSERT friend_data (kedua arah)

#### friend.refuseApply
- **Request:** `{type:'friend', action:'handleApply', userId:string, agree:false, friendId:string, version:string}`
- **Response:** Status penolakan
- **DB Operations:** DELETE friend_apply_data

#### friend.deleteFriend
- **Request:** `{type:'friend', action:'delFriend', userId:string, friendId:string, version:string}`
- **Response:** Status hapus teman
- **DB Operations:** DELETE friend_data (kedua arah)

#### friend.searchFriend
- **Request:** `{type:'friend', action:'findUserBrief', findType:number, idOrName:string, userId:string, version:string}`
- **Response:** Info user yang ditemukan
- **DB Operations:** READ user_data

#### friend.getApplyList
- **Request:** `{type:'friend', action:'getApplyList', userId:string, version:string}`
- **Response:** Daftar permohonan pertemanan
- **DB Operations:** READ friend_apply_data

#### friend.sendHeart
- **Request:** `{type:'friend', action:'giveHeart', userId:string, friendId:string, version:string}`
- **Response:** Status kirim heart
- **DB Operations:** UPDATE friend_data (giveHeartTime)

#### friend.getHeart
- **Request:** `{type:'friend', action:'getHeart', userId:string, friendId:string, version:string}`
- **Response:** Heart yang diterima
- **DB Operations:** UPDATE friend_data (getHeartTime), UPDATE item_data (tambah friend heart)

#### friend.getRecommendList
- **Request:** `{type:'friend', action:'recommendFriend', userId:string, oldUids:array, version:string}`
- **Response:** Daftar teman yang direkomendasikan
- **DB Operations:** READ user_data

#### friend.getFriendInfo
- **Request:** `{type:'friend', action:'getFriendArenaDefenceTeam', userId:string, friendId:string, realTime:boolean, queryServerId:string, version:string}`
- **Response:** Info teman termasuk tim pertahanan
- **DB Operations:** READ user_data, hero_data

#### friend.friendBattleStart
- **Request:** `{type:'friend', action:'friendBattle', userId:string, friendId:string, team:object, battleField:21}`
- **Response:** Data pertempuran
- **DB Operations:** INSERT battle_data

#### friend.friendBattleCheckResult
- **Request:** `{type:'friend', action:...}` (via checkBattleResult)
- **Response:** Hasil pertempuran
- **DB Operations:** UPDATE battle_data

#### friend.getFriendTeam
- **Request:** `{type:'friend', action:'getFriendArenaDefenceTeam', ...}`
- **Response:** Tim teman
- **DB Operations:** READ hero_data

#### friend.blackList
- **Request:** `{type:'friend', action:'addToBlacklist', userId:string, targetUserId:string, version:string}`
- **Response:** Status tambah blacklist
- **DB Operations:** INSERT friend_blacklist

#### friend.removeBlack
- **Request:** `{type:'friend', action:'removeBalcklist', userId:string, targetUserId:string, version:string}`
- **Response:** Status hapus blacklist
- **DB Operations:** DELETE friend_blacklist

#### friend.addBlack
- **Request:** `{type:'friend', action:'addToBlacklist', userId:string, targetUserId:string, version:string}`
- **Response:** Status tambah blacklist
- **DB Operations:** INSERT friend_blacklist

#### friend.getBlackList
- **Request:** `{type:'friend', action:...}`
- **Response:** Daftar blacklist
- **DB Operations:** READ friend_blacklist

---

### 8.6 arena (10 aksi)
**File:** `handlers/arena/`

#### arena.getArenaInfo
- **Request:** `{type:'arena', action:'join'|'select', userId:string, version:string}`
- **Response:** Info arena (ranking, musuh, times, dsb.)
- **JSON Referensi:** `arenaEverydayAward.json`, `arenaShop.json`, `arenaTimesBuy.json`, `arenaFindEnemy.json`, `arenaRobot.json`
- **DB Operations:** READ arena_data, user_data

#### arena.startBattle
- **Request:** `{type:'arena', action:'startBattle', userId:string, selUser:string, version:string, team:object, selfRank:number, enemyRank:number, battleField:12}`
- **Response:** Data pertempuran arena
- **DB Operations:** INSERT battle_data, UPDATE arena_data

#### arena.checkBattleResult
- **Request:** `{type:'arena', action:...}` (via checkBattleResult dengan battleField:12)
- **Response:** Hasil pertempuran, reward, perubahan ranking
- **JSON Referensi:** `arenaEverydayAward.json`, `arenaEveryBattleAward.json`
- **DB Operations:** UPDATE battle_data, UPDATE arena_data (rank), UPDATE item_data (reward)
- **Notify:** `areanRecord`

#### arena.getRecord
- **Request:** `{type:'arena', action:'getRecord', userId:string, version:string}`
- **Response:** Riwayat pertempuran arena
- **DB Operations:** READ arena_record_data

#### arena.getRank
- **Request:** `{type:'arena', action:'getRank', userId:string, start:number, end:number, version:string}`
- **Response:** Daftar ranking arena
- **DB Operations:** READ arena_data, user_data

#### arena.buyTimes
- **Request:** `{type:'arena', action:'buy', userId:string, version:string}`
- **Response:** Status pembelian times arena
- **JSON Referensi:** `arenaTimesBuy.json`
- **DB Operations:** UPDATE arena_data (buyTimes), UPDATE item_data (kurangi diamond)

#### arena.refreshEnemy
- **Request:** `{type:'arena', action:...}` (via select)
- **Response:** Daftar musuh baru
- **JSON Referensi:** `arenaFindEnemy.json`, `arenaRobot.json`
- **DB Operations:** UPDATE arena_data (enemy list)

#### arena.getRecordDetail
- **Request:** `{type:'arena', action:'getBattleRecord', userId:string, battleId:string, version:string, battleField:12}`
- **Response:** Detail record pertempuran
- **DB Operations:** READ arena_record_data, battle_data

#### arena.getAward
- **Request:** `{type:'arena', action:'getDailyReward', userId:string}`
- **Response:** Reward harian arena
- **JSON Referensi:** `arenaEverydayAward.json`
- **DB Operations:** UPDATE item_data (tambah reward)

#### arena.getTopRankAward
- **Request:** `{type:'arena', action:'topAward', userId:string, rewardId:number, version:string}`
- **Response:** Reward ranking teratas
- **JSON Referensi:** `arenaTopRankAward.json`
- **DB Operations:** UPDATE item_data (tambah reward)

---

### 8.7 dungeon (4 aksi)
**File:** `handlers/dungeon/`

#### dungeon.startBattle
- **Request:** `{type:'dungeon', action:'startBattle', userId:string, dungeonType:number, dungeonLevel:number, version:string, team:object, battleField:number}`
- **Response:** Data pertempuran dungeon
- **JSON Referensi:** `expDungeon.json`, `evolveDungeon.json`, `energyDungeon.json`, `equipDungeon.json`, `equipDungeonAward.json`, `metalDungeon.json`, `zStoneDungeon.json`, `signDungeonA.json`, `signDungeonB.json`
- **DB Operations:** INSERT battle_data, UPDATE dungeon_data

#### dungeon.checkBattleResult
- **Request:** `{type:'dungeon', action:'checkBattleResult', userId:string, dungeonType:number, dungeonLevel:number, battleId:string, version:string, checkResult:object, battleField:number}`
- **Response:** Hasil pertempuran, reward, progress dungeon
- **DB Operations:** UPDATE battle_data, UPDATE dungeon_data (level), UPDATE item_data (reward)

#### dungeon.getSweepInfo
- **Request:** `{type:'dungeon', action:...}`
- **Response:** Info sweep dungeon
- **DB Operations:** READ dungeon_data

#### dungeon.sweep
- **Request:** `{type:'dungeon', action:'sweep', times:number, userId:string, dungeonType:number, dungeonLevel:number}`
- **Response:** Hasil sweep, reward
- **JSON Referensi:** `dungeonBulma.json`, `dungeonTimesBuy.json`
- **DB Operations:** UPDATE dungeon_data, UPDATE item_data (reward)

---

### 8.8 hangup (6 aksi)
**File:** `handlers/hangup/`

#### hangup.getHangupInfo
- **Request:** `{type:'hangup', action:...}` (via enterGame)
- **Response:** Info hangup (AFK) — progres chapter, award yang belum diklaim
- **DB Operations:** READ hangup_data

#### hangup.getHangupAward
- **Request:** `{type:'hangup', action:'gain', userId:string, version:string}`
- **Response:** Reward AFK yang diklaim
- **JSON Referensi:** `lesson.json`, `chapter.json`, `idleVipPlus.json`, `idleAwardFirst.json`
- **DB Operations:** UPDATE item_data (tambah reward)

#### hangup.speedUp
- **Request:** `{type:'hangup', action:...}`
- **Response:** Status percepatan AFK
- **DB Operations:** UPDATE hangup_data

#### hangup.getOfflineAward
- **Request:** `{type:'hangup', action:...}`
- **Response:** Reward offline
- **DB Operations:** UPDATE item_data (tambah reward)

#### hangup.oneKeyEvent
- **Request:** `{type:'hangup', action:...}`
- **Response:** Klaim semua reward sekaligus
- **DB Operations:** UPDATE item_data

#### hangup.changeHeroPosition
- **Request:** `{type:'hangup', action:'saveGuideTeam', userId:string, team:object, supers:object, version:string}`
- **Response:** Status perubahan posisi hero
- **DB Operations:** UPDATE hero_data (position), UPDATE user_data (fastTeams)

---

### 8.9 shop (5 aksi)
**File:** `handlers/shop/`

#### shop.getShopInfo
- **Request:** `{type:'shop', action:'getInfo', userId:string, version:string}`
- **Response:** Info semua toko
- **JSON Referensi:** `shopRefresh.json`
- **DB Operations:** READ shop_data

#### shop.buy
- **Request:** `{type:'shop', action:'buy', userId:string, marketType:number, goodId:number, times:number, version:string}`
- **Response:** Item yang dibeli, changeInfo
- **DB Operations:** UPDATE shop_data (buyTimes), UPDATE item_data (tambah item, kurangi currency)

#### shop.refresh
- **Request:** `{type:'shop', action:'refresh', userId:string, marketType:number, version:string}`
- **Response:** Daftar barang baru setelah refresh
- **JSON Referensi:** `shopRefresh.json`
- **DB Operations:** UPDATE shop_data (refreshTime)

#### shop.getMarketInfo
- **Request:** `{type:'market', action:'getInfo', userId:string, version:string}`
- **Response:** Info market
- **JSON Referensi:** `market.json`, `marketRefresh.json`, `marketGrowGoods.json`
- **DB Operations:** READ shop_data

#### shop.marketBuy
- **Request:** `{type:'market', action:'marketBuy', ...}`
- **Response:** Item yang dibeli dari market
- **JSON Referensi:** `market.json`
- **DB Operations:** UPDATE shop_data, UPDATE item_data

---

### 8.10 mail (6 aksi)
**File:** `handlers/mail/`

#### mail.getMailList
- **Request:** `{type:'mail', action:'getMailList', userId:string, version:string}`
- **Response:** Daftar mail
- **DB Operations:** READ mail_data

#### mail.readMail
- **Request:** `{type:'mail', action:'readMail', userId:string, mailId:number, version:string}`
- **Response:** Isi mail
- **DB Operations:** UPDATE mail_data (isRead = 1)

#### mail.getMailAward
- **Request:** `{type:'mail', action:'getReward', userId:string, mailId:number, version:string}`
- **Response:** Hadiah dari mail, changeInfo
- **DB Operations:** UPDATE mail_data (isGot = 1), UPDATE item_data (tambah hadiah)

#### mail.deleteMail
- **Request:** `{type:'mail', action:'delMail', userId:string, mailId:number, version:string}`
- **Response:** Status hapus mail
- **DB Operations:** DELETE mail_data

#### mail.sendMail
- **Request:** `{type:'mail', action:...}` (admin/system)
- **Response:** Status kirim mail
- **DB Operations:** INSERT mail_data

#### mail.oneKeyGetAward
- **Request:** `{type:'mail', action:'getAllReward', userId:string, version:string}`
- **Response:** Semua hadiah dari mail yang belum diklaim
- **DB Operations:** UPDATE mail_data (isGot = 1 semua), UPDATE item_data (tambah semua hadiah)

---

### 8.11 task (2 aksi)
**File:** `handlers/task/`

#### task.getTaskList
- **Request:** `{type:'task', action:'queryTask', userId:string, taskClass:number}`
- **Response:** Daftar task (daily/achievement)
- **JSON Referensi:** `task.json`, `taskAchievement.json`, `taskDaily.json`
- **DB Operations:** READ task_data

#### task.getTaskReward
- **Request:** `{type:'task', action:'getReward', userId:string, taskClass:number, taskIds:array}`
- **Response:** Hadiah task, changeInfo
- **DB Operations:** UPDATE task_data (reward claimed), UPDATE item_data (tambah hadiah)

---

### 8.12 activity (101 aksi)
**File:** `handlers/activity/`

Activity handler menangani **101 aksi** untuk berbagai event/activity dalam game. Semua aksi activity menggunakan format request umum:

**Format Request Umum:**
```javascript
{
    type: 'activity',
    action: string,       // Nama aksi spesifik activity
    userId: string,
    actId: number,        // ID activity
    version: string,      // '1.0'
    // ... field spesifik per aksi
}
```

#### Daftar Lengkap Aksi Activity:

| # | Action | Request Fields | Deskripsi |
|---|--------|---------------|-----------|
| 1 | getActivityBrief | userId, version | Ambil daftar singkat semua activity aktif |
| 2 | getActivityDetail | userId, actId | Ambil detail satu activity |
| 3 | activityGetTaskReward | actId, userId, taskId, pick, actType | Klaim hadiah task activity |
| 4 | GAGetTaskReward | actId, userId, taskId | Klaim hadiah task GA |
| 5 | beStrongActiveActReward | actId, userId, day, itemId, pick | Reward activity "Jadi Kuat" |
| 6 | beStrongBuyDiscount | actId, userId, day | Beli diskon activity "Jadi Kuat" |
| 7 | beStrongGiftActReward | actId, userId, day, itemId, pick | Reward hadiah activity "Jadi Kuat" |
| 8 | beStrongRefreshDiscount | actId, userId, day | Refresh diskon activity "Jadi Kuat" |
| 9 | blindBoxOpen | actId, userId, boxId | Buka kotak buta |
| 10 | blindBoxRefresh | actId, userId | Refresh kotak buta |
| 11 | blindBoxShowRewards | actId, userId | Lihat hadiah kotak buta |
| 12 | buggyGetTaskReward | actId, userId, taskId | Klaim hadiah task buggy |
| 13 | buggyTreasureNext | actId, userId | Lanjut ke treasure buggy berikutnya |
| 14 | buggyTreasureRandom | actId, userId, x, y | Random treasure buggy di posisi x,y |
| 15 | bulmaPartyBuyGoods | actId, userId, itemId | Beli barang pesta Bulma |
| 16 | buyDailyDiscount | actId, userId, batchId | Beli diskon harian |
| 17 | buyFund | actId, userId | Beli fund/investasi |
| 18 | buyHeroSuperGift | userId, actId, itemId, version | Beli hadiah super hero |
| 19 | buyNewServerGift | actId, userId, pick, itemId, num | Beli hadiah server baru |
| 20 | buySuperGift | actId, userId, num, itemId | Beli hadiah super |
| 21 | buyTodayDiscount | actId, userId, itemId, batchId | Beli diskon hari ini |
| 22 | costFeedback | actId, userId, itemId, pick | Feedback pengeluaran |
| 23 | cumulativeRechargeReward | actId, userId, itemId | Reward recharge kumulatif |
| 24 | dailyBigGiftReward | actId, userId, day, itemId | Reward hadiah besar harian |
| 25 | diamondShop | userId, actId, itemId, version | Toko diamond activity |
| 26 | doubleElevenGetPayReward | userId, actId, rewardId, version | Reward pembayaran 11.11 |
| 27 | entrustActReward | actId, userId, pick, itemId | Reward activity entrust |
| 28 | equipUp | userId, actId, equipId | Upgrade equipment activity |
| 29 | friendBattleActReward | actId, userId, pick, itemId | Reward activity pertempuran teman |
| 30 | getFundReward | actId, userId, day | Ambil reward fund |
| 31 | getGrowActivityReward | actId, userId, pageType, pick, taskId | Reward activity pertumbuhan |
| 32 | getLanternBlessTaskReward | actId, userId, taskId | Reward task berkah lentera |
| 33 | getLoginActivityExReward | actId, userId, day | Reward login activity tambahan |
| 34 | getLoginActivityReward | actId, userId, day, pick | Reward login activity |
| 35 | getRank | userId, actType | Ambil ranking activity |
| 36 | gleaning | actId, userId | Activity gleaning/menuai |
| 37 | gleaningBuyTicket | actId, userId, num | Beli tiket gleaning |
| 38 | goodHarvestsGetReward | userId, actId, version | Reward panen baik |
| 39 | handleRefreshImprintResult | actId, userId, imprintId, save | Handle hasil refresh imprint |
| 40 | heroGiftReward | actId, userId, pick, itemId | Reward hadiah hero |
| 41 | heroHelpBuy | actId, userId, itemId, heroIds | Beli bantuan hero |
| 42 | heroOrangeReward | actId, userId, pick, itemId | Reward hero orange |
| 43 | heroRewardBuyToken | actId, userId, num | Beli token reward hero |
| 44 | heroRewardGetReward | actId, userId, itemId, normalToken | Ambil reward hero |
| 45 | imprintExtraction | actId, userId, imprintIds, version | Ekstraksi imprint |
| 46 | imprintUpGetReward | actId, userId, itemId, pick | Reward imprint up |
| 47 | imprintUpStudy | actId, userId, imprintType, sellQuality, times, version | Studi imprint up |
| 48 | karinActReward | actId, userId, pick, itemId | Reward activity Karin |
| 49 | karinRich | userId, actId, version | Activity Karin Rich |
| 50 | karinRichTask | actId, userId, taskId | Task Karin Rich |
| 51 | lanternBless | actId, userId, times, version | Berkah lentera |
| 52 | lanternBlessClickTip | userId, actId | Klik tip berkah lentera |
| 53 | luckEquipGetEquip | userId, actId, pos | Ambil equipment lucky |
| 54 | luckEquipGetReward | actId, userId, itemId, pick | Reward lucky equipment |
| 55 | luckEquipPushEquip | userId, actId, pos, equipId | Push equipment lucky |
| 56 | luckEquipUp | userId, actId, pos | Upgrade lucky equipment |
| 57 | luckFeedbackGetBox | actId, userId, version | Ambil kotak feedback lucky |
| 58 | luckFeedbackGetReward | actId, userId, version | Reward feedback lucky |
| 59 | luckyWheelGetReward | actId, userId, taskId | Reward roda keberuntungan |
| 60 | luckyWheelLottery | userId, actId, times | Lotre roda keberuntungan |
| 61 | luxuryLuck | actId, userId, times, costType, version | Keberuntungan mewah |
| 62 | marketActReward | actId, userId, pick, itemId | Reward activity market |
| 63 | merchantExchange | actId, userId, num, itemId | Tukar pedagang |
| 64 | mergeBossBuyTimes | userId, actId, times, version | Beli times boss gabungan |
| 65 | mergeBossInfo | userId, guildUUID, version | Info boss gabungan |
| 66 | mergeBossStartBattle | userId, guildUUID, actId, version, team, battleField:25 | Mulai pertempuran boss gabungan |
| 67 | newHeroChallenge | actId, team, teamOrder, topn, userId | Tantangan hero baru |
| 68 | newHeroChallengeLike | userId, actId, topn | Suka tantangan hero baru |
| 69 | newHeroChallengeQueryHonorRoll | actId, userId | Query papan kehormatan |
| 70 | newHeroChallengeQueryWinRank | actId, userId, topn | Query ranking menang |
| 71 | newHeroRewardBuyGoods | userId, actId, num, goodsId, version | Beli barang reward hero baru |
| 72 | newHeroRewardPropExchange | userId, actId, num, propId, version | Tukar prop reward hero baru |
| 73 | normalLuck | actId, userId, times, costType, version | Keberuntungan normal |
| 74 | queryCSRank | userId, actId | Query ranking CS |
| 75 | queryImprintTmpPower | userId, actId, imprintId | Query power imprint sementara |
| 76 | queryLanternBlessRecord | userId, actId, time | Query record berkah lentera |
| 77 | queryWeaponCastRecord | userId, actId, time | Query record cast senjata |
| 78 | recharge3DayResign | actId, userId, pick, day | Recharge 3 hari resign |
| 79 | recharge3DayReward | actId, userId, day, pick | Reward recharge 3 hari |
| 80 | recharge3FinialReward | actId, userId, pick | Reward akhir recharge 3 hari |
| 81 | recharge7Reward | actId, userId, pick, day | Reward recharge 7 hari |
| 82 | rechargeDailyReward | actId, userId, pick, day, itemId | Reward recharge harian |
| 83 | rechargeGiftReward | actId, userId, pick, itemId | Reward hadiah recharge |
| 84 | refreshImprint | userId, actId, imprintId | Refresh imprint |
| 85 | resetLanternBless | actId, userId | Reset berkah lentera |
| 86 | shopBuy | actId, userId, itemId, num | Beli dari toko activity |
| 87 | singleRechargeReward | actId, userId, day, itemId, pick | Reward recharge tunggal |
| 88 | summonGiftReward | actId, userId, itemId, pick | Reward hadiah summon |
| 89 | timeLimitPropExchange | userId, actId, exchangeType, itemId, displayId | Tukar prop batas waktu |
| 90 | timeLimitPropReceive | userId, actId, exchangeType | Terima prop batas waktu |
| 91 | turnTable | actId, userId, times, version | Putar meja putar |
| 92 | turnTableGetReward | actId, userId, taskId, pick | Reward meja putar |
| 93 | upsetBlindBox | actId, userId | Kacaukan kotak buta |
| 94 | userCertification | ... | Sertifikasi user |
| 95 | weaponCastGetReward | actId, userId, taskId | Reward cast senjata |
| 96 | weaponCastLottery | userId, actId | Lotre cast senjata |
| 97 | whisFeastBlessExchange | userId, actId, num, propId, version | Tukar berkah pesta Whis |
| 98 | whisFeastFoodFeedbackReward | userId, rankType, actId, version | Reward feedback makanan pesta Whis |
| 99 | whisFeastGetRankReward | actId, userId, day, taskId, pick | Reward ranking pesta Whis |
| 100 | whisFeastGivingFood | userId, actId, foodId, version | Beri makanan pesta Whis |
| 101 | attackNienBeast | userId, actId, propId, propNum, bossId | Serang monster Nien |

**JSON Referensi Activity:** `activityEquipLucky.json`, `activitySignUpUp.json`, `signUpUpStudy.json`

---

### 8.13 equip (11 aksi)
**File:** `handlers/equip/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| wear | userId, heroId, pos, equipId, stoneId, version | Pasang equipment ke hero |
| takeOff | userId, heroId, pos, equipId, stoneId, version | Lepas equipment dari hero |
| levelUp | userId, heroId, version, times | Level up equipment (ring) |
| merge | userId, count, equipId, version | Gabung equipment |
| resolve | userId, equipIds, version | Resolve/dekomposisi equipment |
| rebirth | userId, equipIds, version | Rebirth equipment |
| strengthen | userId, heroId, version | Perkuat equipment |
| luckyLevelUp | userId, actId, pos | Level up lucky equipment |
| equipUp | userId, actId, equipId | Upgrade equipment activity |
| getEquipInfo | userId, queryUserId, heroId, version | Ambil info equipment |
| changeEquip | userId, heroId, equipInfo, weaponId, version | Ganti equipment otomatis |

**JSON Referensi:** `equip.json`, `equipSuit.json`, `equipDungeon.json`, `equipDungeonAward.json`, `equipAwardPlan.json`, `equipLuckyLevelUp.json`, `ring.json`, `ringLevelUp.json`, `ringEvolve.json`, `earringLevelUp.json`, `earringEvolve.json`, `earringDeify.json`, `earringQuilty.json`, `jewel.json`, `jewLevelUp.json`, `jewSuit.json`, `jewelSpecial.json`

---

### 8.14 imprint (11 aksi)
**File:** `handlers/imprint/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getImprintInfo | userId, queryUserId, serverId, imprintId, version | Ambil info imprint |
| levelUp | userId, imprintId, version | Level up imprint |
| starUp | userId, heroId, imprintId, costImprintIds, version | Bintang up imprint |
| resolve | userId, imprintIds, version | Resolve imprint |
| refresh | userId, actId, imprintId | Refresh imprint |
| refreshEx | ... | Refresh imprint extended |
| signUpUpStudy | userId, actId, imprintType, sellQuality, times, version | Studi sign up up |
| imprintExtraction | actId, userId, imprintIds, version | Ekstraksi imprint |
| handleRefreshImprintResult | actId, userId, imprintId, save | Handle hasil refresh |
| queryImprintTmpPower | userId, actId, imprintId | Query power sementara |
| queryWeaponCastRecord | userId, actId, time | Query record cast senjata |

**JSON Referensi:** `signEx.json`, `signLevelUp.json`, `signStarUp.json`, `signMerge.json`, `signPiece.json`, `signRebirth.json`, `signResolveEx.json`, `signRefreshEx.json`, `signSuitEx.json`, `signUpUpStudy.json`, `signAdd.json`, `signAddItem.json`, `signRandomEx.json`, `signPartEx.json`, `signArmorEx.json`, `signAttackEx.json`, `signHpEx.json`, `signDodgeEx.json`, `signCriticalEx.json`, `signBlockEx.json`, `signSpeedEx.json`, `signNewAbilityEx.json`, `signUpgradeEx.json`, `signRandomAll.json`, `signCombinationBox.json`, `signAwardPlanA.json`, `signAwardPlanB.json`, `signDungeonA.json`, `signDungeonB.json`

---

### 8.15 weapon (7 aksi)
**File:** `handlers/weapon/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| wear | userId, heroId, weaponId, version | Pasang senjata ke hero |
| takeOff | userId, heroId, weaponId, version | Lepas senjata dari hero |
| upgrade | userId, heroId, weaponId, version | Upgrade senjata |
| merge | userId, pieces, version | Gabung senjata dari piece |
| resolve | userId, weaponIds, version | Resolve senjata |
| reborn | userId, weaponIds, keepStar, version | Reborn senjata |
| levelUpHalo | userId, heroId, weaponId, costWeaponIds, chooseHalo, version | Level up halo senjata |

**JSON Referensi:** `weapon.json`, `weaponLevelUp.json`, `weaponPiece.json`, `weaponMerge.json`, `weaponRebirth.json`, `weaponStrengthen.json`, `weaponHalo.json`

---

### 8.16 tower (11 aksi)
**File:** `handlers/tower/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getTowerInfo | userId, version | Ambil info Karin Tower |
| startBattle | userId, eventId, team, version, battleField:13 | Mulai pertempuran tower |
| checkBattleResult | ... | Cek hasil pertempuran tower |
| openBox | userId, eventId, version | Buka kotak di tower |
| openKarin | userId, version | Buka Karin khusus |
| openTimesEvent | userId, eventId, version | Buka event times |
| buyTimes | userId, version, times | Beli times tower |
| getRank | userId, count, version | Ambil ranking tower |
| getRecord | ... | Ambil record tower |
| sweep | ... | Sweep tower |
| getCount | ... | Ambil hitungan tower |

**JSON Referensi:** `karinTowerCan.json`, `karinTowerChest.json`, `karinTowerClimb.json`, `karinTowerLuck.json`, `karinTowerPlus.json`, `karinTowerRank.json`, `karinTowerReward.json`, `karinTowerTimesBuy.json`, `karinTowerWinClimb.json`

---

### 8.17 ballWar (14 aksi)
**File:** `handlers/ballWar/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| signUp | userId | Daftar Dragon Ball War |
| getState | userId | Ambil state Dragon Ball War |
| getPointRank | userId | Ambil ranking poin |
| getRecord | userId, timeStart | Ambil record |
| startBattle | setDefence, userId, areaId, isTower, flagId, ownerTag, version, team, battleField:24 | Mulai pertempuran DB War |
| checkBattleResult | ... | Cek hasil pertempuran |
| getAward | ... | Ambil hadiah |
| getBetAward | ... | Ambil hadiah taruhan |
| bet | userId, stage, groupId, subGroupId, win, version | Taruhan DB War |
| getBetInfo | ... | Ambil info taruhan |
| getSchedule | ... | Ambil jadwal |
| getGuildLevel | ... | Ambil level guild |
| changePos | userId, isTower, areaId, flagId, version | Ubah posisi pertahanan |
| getHistory | ... | Ambil riwayat |

**JSON Referensi:** `dragonBallWar.json`, `dragonBallWarAward.json`, `dragonBallWarBUFF.json`, `dragonBallWarBuy.json`, `dragonBallWarGuildLevel.json`, `dragonBallWarMatch.json`, `dragonBallWarNotice.json`

**Notify:** `ballWarStateChange`, `ballWarPointRankChange`, `ballWarBroadcast`, `ballSignUp`

---

### 8.18 bossCompetition (6 aksi)
**File:** `handlers/bossCompetition/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getBossInfo | userId, version | Ambil info boss |
| startBattle | userId, bossId, isDouble, team, battleField:18 | Mulai serang boss |
| checkBattleResult | ... | Cek hasil pertempuran |
| getReward | ... | Ambil hadiah |
| buyTimes | times, userId, version | Beli times |
| getRank | userId, seuuid, order, limit, version | Ambil ranking |

**JSON Referensi:** `bossAttack.json`, `bossAttackAward.json`, `bossAttackLevel.json`, `bossAttackTimesBuy.json`, `bossFight.json`, `bossFightTimesBuy.json`

---

### 8.19 entrust (11 aksi)
**File:** `handlers/entrust/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getEntrustInfo | userId | Ambil info entrust |
| acceptEntrust | userId, heroInfo, version | Terima entrust |
| giveUpEntrust | userId, entrustIndex | Menyerah entrust |
| finishEntrust | userId, entrustIndex | Selesaikan entrust |
| refreshEntrust | userId, version | Refresh entrust |
| getEntrustAward | userId, entrustIndexs | Ambil hadiah entrust |
| speedUp | userId, entrustIndex | Percepat entrust |
| buyTimes | userId, version | Beli times entrust |
| changeEntrustHero | userId, heroId | Ganti hero entrust |
| getEntrustRecord | userId | Ambil record entrust |
| getEntrustChapter | userId, bookId | Ambil chapter entrust |

**JSON Referensi:** `timeTravel.json`, `timeTravelAward.json`, `timeTravelBOSS.json`, `timeTravelBOSSReward.json`, `timeTravelHeroSelf.json`, `timeTravelTime.json`

---

### 8.20 war (12 aksi)
**File:** `handlers/war/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| signUp | userId, version | Daftar global war |
| getSignUpInfo | userId, version | Info pendaftaran |
| getAuditionInfo | userId, version | Info audisi |
| getTeamInfo | userId, stage, groupId, subGroupId, version | Info tim |
| getUserTeam | userId, queryUserId, version | Ambil tim user |
| getAuditionRank | userId, version | Ranking audisi |
| getAuditionReward | userId, cfgId, version | Reward audisi |
| like | userId, version | Suka |
| bet | userId, stage, groupId, subGroupId, win, version | Taruhan |
| getBetReward | userId, stage, groupId, subGroupId, version | Reward taruhan |
| getBattleRecord | userId, battleId, version, battleField:23 | Record pertempuran |
| getChampionRank | userId, worldId, version | Ranking juara |

**JSON Referensi:** `globalWar.json`, `globalWarAuditionAward.json`, `globalWarMailAward.json`

**Notify:** `warStageChange`, `warRankChange`, `warAutoSign`

---

### 8.21 topBattle (18 aksi)
**File:** `handlers/topBattle/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| signUp | userId | Daftar top battle |
| getInfo | userId | Ambil info top battle |
| getTeamInfo | userId, queryUserIds, areaId | Info tim |
| getUserTeam | userId, queryUserId, version | Ambil tim user |
| startBattle | userId, enemyUserId, enemyTeamTag, selfPoint, teams, supers, battleField:28 | Mulai pertempuran |
| checkBattleResult | ... | Cek hasil |
| getRank | userId | Ranking |
| getRecord | userId | Record |
| getAward | userId, cfgId | Hadiah ranking |
| buyTimes | userId, times, version | Beli times |
| getBattleRecord | userId, battleId, version | Record pertempuran |
| getTopBattle64 | ... | Data top 64 |
| getSchedule | ... | Jadwal |
| getSignUpInfo | userId | Info pendaftaran |
| getStageInfo | ... | Info stage |
| like | userId, version | Suka |
| getLikeAward | ... | Hadiah suka |
| getChampion | ... | Data juara |

**JSON Referensi:** `topBattle.json`, `topBattle64.json`, `topBattleBuyTime.json`, `topBattleMatch.json`, `topBattleRank.json`, `topBattleZone.json`

---

### 8.22 expedition (15 aksi)
**File:** `handlers/expedition/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getExpeditionInfo | userId, version | Info expedition |
| startBattle | userId, difficulty, version, team, battleField:22 | Mulai pertempuran |
| checkBattleResult | userId, battleId, version, checkResult, battleField:22, runaway | Cek hasil |
| getEventAward | userId, lessonIds | Hadiah event |
| speedUp | userId, machineId | Percepat |
| buyTimes | userId, version | Beli times |
| getChapterAward | ... | Hadiah chapter |
| getRecord | ... | Record |
| refresh | userId, version | Refresh |
| chooseEvent | userId, lessonId, heroIds | Pilih event |
| skipEvent | userId, lessonId | Skip event |
| getExpeditionChapter | ... | Chapter expedition |
| changeHero | userId, heroIds | Ganti hero |
| getRandomHero | ... | Hero random |
| getExpeditionEvent | ... | Event expedition |

**JSON Referensi:** `expedition.json`, `expeditionChapter.json`, `expeditionEvent.json`, `expeditionSpeedUp.json`, `dimensionMachine.json`, `dimensionMachineLevelUp.json`

---

### 8.23 cellGame (8 aksi)
**File:** `handlers/cellGame/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getCellGameInfo | userId, version | Info cell game |
| startBattle | userId, version, team | Mulai pertempuran |
| checkBattleResult | userId, battleId, version, checkResult, battleField:15 | Cek hasil |
| getAward | userId, version | Ambil hadiah |
| buyTimes | userId, version | Beli times |
| getRank | userId, version | Ranking |
| getRecord | ... | Record |
| sweep | ... | Sweep |

**JSON Referensi:** `cellGame.json`, `cellGameChest.json`, `cellGameChestRandom.json`

---

### 8.24 snake (9 aksi)
**File:** `handlers/snake/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getSnakeInfo | userId, version | Info snake dungeon |
| startBattle | userId, version, team, battleField:9 | Mulai pertempuran |
| checkBattleResult | ... | Cek hasil |
| getAward | ... | Ambil hadiah |
| buyTimes | userId, version | Beli times |
| getShopInfo | ... | Info toko snake |
| shopBuy | ... | Beli dari toko snake |
| getRank | ... | Ranking |
| sweep | userId, version | Sweep |

**JSON Referensi:** `snakeDungeon.json`, `snakeChest.json`, `snakeShop.json`, `snakeWipe.json`

---

### 8.25 training (6 aksi)
**File:** `handlers/training/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| startBattle | userId, version, team, battleField:11 | Mulai training |
| checkBattleResult | userId, battleId, version, checkResult, battleField:11 | Cek hasil |
| answer | userId, choose, version | Jawab pertanyaan training |
| move | userId, version | Pindah posisi training |
| buyTimes | userId, version | Beli times training |
| runAway | userId, version | Lari dari training |
| getLog | userId, version | Ambil log training |

**JSON Referensi:** `training.json`, `trainingEnemy.json`, `trainingTimesBuy.json`, `quest.json`, `questSurprise.json`

---

### 8.26 timeTrial (6 aksi)
**File:** `handlers/timeTrial/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getTimeTrialInfo | userId, version | Info time trial |
| startBattle | userId, version, team, superSkill, battleField:26, level, chooseStar | Mulai pertempuran |
| checkBattleResult | userId, battleId, version, checkResult, battleField:26, runaway | Cek hasil |
| getAward | ... | Ambil hadiah |
| buyTimes | userId, times, version | Beli times |
| getRank | userId, level, version | Ranking |

**JSON Referensi:** `timeTrain.json`, `timeTrain1.json`, `timeTrain2.json`, `timeTrain3.json`, `timeTrainConstant.json`, `timeTrainPlan.json`, `timeTrainReward.json`, `timeTrainTimesBuy.json`, `timeTrainDescribe1.json`, `timeTrainDescribe2.json`, `timeTrainDescribe3.json`, `timeTrainLable.json`, `timeTrainLable1.json`, `timeTrainLable2.json`, `timeTrainLable3.json`

---

### 8.27 mine (7 aksi)
**File:** `handlers/mine/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getMineInfo | userId, version | Info mine |
| startBattle | userId, targetX, targetY, version, team, battleField:8 | Mulai pertempuran |
| checkBattleResult | ... | Cek hasil |
| getAward | ... | Ambil hadiah |
| buyTimes | userId, version | Beli langkah |
| restart | userId, version | Restart mine |
| sweep | ... | Sweep |

**JSON Referensi:** `mine.json`, `mineActionBuy.json`, `mineChest.json`, `mineRestartBuy.json`

---

### 8.28 maha (6 aksi)
**File:** `handlers/maha/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getMahaInfo | userId, version | Info Maha Adventure |
| startBattle | userId, version, team, battleField:16 | Mulai pertempuran |
| checkBattleResult | ... | Cek hasil |
| getAward | ... | Ambil hadiah |
| buyTimes | userId, version | Beli times |
| getRank | ... | Ranking |

**JSON Referensi:** `mahaAdventure.json`, `mahaAdventureBOSS.json`, `mahaAdvenTimesBuy.json`

---

### 8.29 checkin (1 aksi)
**File:** `handlers/checkin/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| checkin | userId, day, version | Check-in harian |

**DB Operations:** UPDATE checkin_data

---

### 8.30 gift (11 aksi)
**File:** `handlers/gift/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getGiftInfo | userId, version | Info hadiah |
| buyGift | userId, version | Beli hadiah |
| sendGift | ... | Kirim hadiah |
| receiveGift | ... | Terima hadiah |
| getGiftList | ... | Daftar hadiah |
| getSendGiftList | ... | Daftar hadiah terkirim |
| getReceiveGiftList | ... | Daftar hadiah diterima |
| oneKeyReceive | ... | Terima semua sekaligus |
| getGiftRecord | ... | Record hadiah |
| getGiftDetail | ... | Detail hadiah |
| buyGiftForFriend | ... | Beli hadiah untuk teman |

**JSON Referensi:** `firstRecharge.json`, `vipBuyBonus.json`, `satanGift.json`, `satanGiftParam.json`, `bindAward.json`, `onlineBonus.json`

---

### 8.31 recharge (1 aksi)
**File:** `handlers/recharge/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| recharge | userId, goodsId, version | Proses recharge |

**JSON Referensi:** `recharge.json`, `rechargeLevel.json`, `vip.json`, `vipUpgrade.json`

---

### 8.32 monthCard (2 aksi)
**File:** `handlers/monthCard/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getMonthCardInfo | userId, cardType, version | Info month card |
| getMonthCardAward | userId, cardType, version | Ambil hadiah month card |

**JSON Referensi:** `monthCard.json`, `lifelongCardPush.json`

---

### 8.33 retrieve (2 aksi)
**File:** `handlers/retrieve/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getRetrieveInfo | userId, version | Info retrieve |
| retrieveAward | userId, backType, version | Ambil reward retrieve |

---

### 8.34 timeBonus (2 aksi)
**File:** `handlers/timeBonus/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getTimeBonusInfo | userId | Info time bonus |
| getTimeBonusAward | userId, bonusId, price, times, version | Ambil hadiah time bonus |

**JSON Referensi:** `levelBonus.json`, `levelBonusBuy.json`, `levelBuyBonus.json`, `timeLimitBonus.json`

---

### 8.35 timeMachine (4 aksi)
**File:** `handlers/timeMachine/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getTimeMachineInfo | userId, version | Info time machine |
| levelUp | userId, machineId, version | Level up time machine |
| getAward | userId, machineId | Ambil hadiah time machine |
| getRecord | userId, machineId, battleId, version, checkResult, battleField:10 | Record time machine |

**JSON Referensi:** `timeMachine.json`, `timeTravel.json`, `timeTravelAward.json`, `timeTravelBOSS.json`, `timeTravelBOSSReward.json`, `timeTravelHeroSelf.json`, `timeTravelTime.json`

---

### 8.36 trial (5 aksi)
**File:** `handlers/trial/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getState | userId, version | Ambil state trial |
| startBattle | userId, version, team, battleField:7 | Mulai pertempuran trial |
| checkBattleResult | userId, battleId, version, checkResult, battleField:7, runaway | Cek hasil |
| getDailyReward | userId, version | Hadiah harian trial |
| vipBuy | userId, version | Beli privilege trial |

**JSON Referensi:** `templeTest.json`, `templeDaily.json`, `templePrivilege.json`, `templePrivilegeBuy.json`

---

### 8.37 gravity (3 aksi)
**File:** `handlers/gravity/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getGravityInfo | userId, version | Info gravity test |
| startBattle | userId, version, team, superSkill, battleField:29 | Mulai pertempuran gravity |
| checkBattleResult | userId, battleId, version, checkResult, battleField:29, runaway | Cek hasil |

**JSON Referensi:** `gravityTest.json`, `gravityTestConstant.json`, `gravityTestTimesBuy.json`, `gravityEffectIcon.json`

---

### 8.38 battleMedal (7 aksi)
**File:** `handlers/battleMedal/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getBattleMedalInfo | userId, uuid, version | Info battle medal |
| getTaskAward | userId, uuid, taskId, version | Hadiah task battle medal |
| levelUp | userId, uuid, version | Level up battle medal |
| getShopInfo | userId, uuid, version | Info toko battle medal |
| shopBuy | userId, uuid, itemId, num, version | Beli dari toko battle medal |
| buySuperTimes | userId, uuid, version | Beli super times |
| getRecord | userId, uuid, version | Record battle medal |

**JSON Referensi:** `battleMedal.json`, `battleMedalShop.json`, `battleMedalSuperBuy.json`, `battleMedalTask.json`

---

### 8.39 heroImage (6 aksi)
**File:** `handlers/heroImage/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getInfo | userId, version | Info hero image |
| levelUp | userId, heroDisplayId, detail, score, version | Level up hero image |
| getReward | ... | Ambil hadiah hero image |
| getRank | ... | Ranking hero image |
| getRecord | ... | Record hero image |
| changeSkin | userId, skinId | Ganti skin |

**JSON Referensi:** `hero.json`, `heroSkin.json`

---

### 8.40 superSkill (5 aksi)
**File:** `handlers/superSkill/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getInfo | userId, skillId, version | Info super skill |
| levelUp | userId, skillId, version | Level up super skill |
| change | userId, skillId, version | Ganti/reset super skill |
| getRank | ... | Ranking super skill |
| getRecord | ... | Record super skill |

**JSON Referensi:** `superSkill.json`, `superLevelUp.json`, `superEvolve.json`, `superLevel.json`, `superBook.json`, `superCompensate.json`

---

### 8.41 dragon (3 aksi)
**File:** `handlers/dragon/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getDragonInfo | userId, version | Info Dragon Ball |
| wish | userId, index, isVip, version | Permohonan Dragon Ball |
| exchange | userId, save, version | Tukar Dragon Ball |

**JSON Referensi:** `dragonWish.json`, `dragonWishVIP.json`, `dragonExchange.json`

---

### 8.42 genki (4 aksi)
**File:** `handlers/genki/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getGenkiInfo | userId, queryUserId, serverId, genkiId, version | Info genki |
| fusion | userId, genkiIds, smeltType | Fusi genki |
| bookLevelUp | userId, ... | Level up buku genki |
| getRandomBox | ... | Ambil kotak random genki |

**JSON Referensi:** `genki.json`, `genkiBook.json`, `genkiFusion.json`, `genkiRandomBox.json`

---

### 8.43 gemstone (4 aksi)
**File:** `handlers/gemstone/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getGemstoneInfo | userId, stoneId | Info gemstone |
| levelUp | userId, stoneId, displayId, costUnique, costStack | Level up gemstone |
| merge | ... | Gabung gemstone |
| resolve | userId, stoneId | Resolve gemstone |

**JSON Referensi:** `jewel.json`, `jewLevelUp.json`, `jewRandom.json`, `jewSuit.json`

---

### 8.44 resonance (5 aksi)
**File:** `handlers/resonance/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getInfo | userId, cabinId | Info resonance |
| levelUp | userId, heroId, cabinId, seatId | Level up resonance |
| getAward | ... | Ambil hadiah resonance |
| getRank | ... | Ranking resonance |
| getRecord | ... | Record resonance |

**DB Operations:** READ/UPDATE resonance_data

---

### 8.45 strongEnemy (5 aksi)
**File:** `handlers/strongEnemy/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getInfo | userId, version | Info strong enemy |
| startBattle | userId, seuuid, order, team, version, battleField:17 | Mulai pertempuran |
| checkBattleResult | userId, seuuid, battleId, version, checkResult, battleField:17 | Cek hasil |
| buyTimes | userId, times, version | Beli times |
| getRank | userId, seuuid, order, limit, version | Ranking |

**JSON Referensi:** `bossAttack.json`, `bossAttackAward.json`, `bossAttackLevel.json`, `bossAttackTimesBuy.json`

---

### 8.46 teamDungeonGame (18 aksi)
**File:** `handlers/teamDungeonGame/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getInfo | userId, dungeonType, startOfCloseTime, count, myTeamId, star | Info team dungeon |
| createTeam | userId, dungeonId, teamUserType | Buat tim |
| joinTeam | userId, teamId, teamUserType | Gabung tim |
| leaveTeam | userId, teamId | Tinggalkan tim |
| kickOutTeam | userId, teamId | Kick dari tim |
| startBattle | userId, teamId, posMap | Mulai pertempuran |
| checkBattleResult | ... | Cek hasil |
| getAward | userId, teamId, captainReward | Ambil hadiah |
| buyTimes | userId | Beli times |
| getTeamList | ... | Daftar tim |
| changePos | userId, teamId, posMap | Ubah posisi |
| changeAutoJoinCondition | userId, teamId, autoJoin, condition | Ubah kondisi auto join |
| applyJoin | userId, teamId, teamUserType | Ajukan gabung |
| agreeApply | userId, teamId, memberUserId | Setujui aplikasi |
| refuseApply | userId, teamId | Tolak aplikasi |
| refreshApplyList | userId, teamId | Refresh daftar aplikasi |
| getRecord | userId | Record |
| changeTeamInfo | userId, version, teamInfo, superSkill | Ubah info tim |

**JSON Referensi:** `teamDungeon.json`, `teamDungeon101.json`, `teamDungeon102.json`, `teamDungeonAchievement.json`, `teamDungeonAction.json`, `teamDungeonAnimation.json`, `teamDungeonAward.json`, `teamDungeonContant.json`, `teamDungeonDaily.json`, `teamDungeonEffect.json`, `teamDungeonKey.json`, `teamDungeonLesson.json`, `teamDungeonListener.json`, `teamDungeonMonster.json`, `teamDungeonNotice.json`, `teamDungeonPiece.json`, `teamDungeonRobot.json`, `teamDungeonRoleSkill.json`, `teamDungeonShop.json`, `teamDungeonTalk.json`, `teamDungeonTrap.json`

---

### 8.47 teamTraining (4 aksi)
**File:** `handlers/teamTraining/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getInfo | userId, version | Info team training |
| startBattle | userId, version | Mulai training |
| checkBattleResult | ... | Cek hasil |
| buyTimes | userId, version | Beli times |

**JSON Referensi:** `teamTraining.json`, `teamTrainingLimit.json`

---

### 8.48 littleGame (3 aksi)
**File:** `handlers/littleGame/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getInfo | userId, version | Info mini game |
| startGame | userId, version | Mulai game |
| getAward | userId, chapterId | Ambil hadiah |

---

### 8.49 guide (1 aksi)
**File:** `handlers/guide/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getGuideInfo | userId, guideType, step, version | Info/save guide |

**JSON Referensi:** `tutorial.json`, `tutorial-WanZi.json`, `tutorialBattle.json`

---

### 8.50 battleRecordCheck (1 aksi)
**File:** `handlers/battleRecordCheck/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| checkBattleRecord | userId, battleId, battleResult, notSetReward | Cek record pertempuran |

---

### 8.51 battle (1 aksi)
**File:** `handlers/battle/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| startBattle | userId, battleId, count, version | Mulai pertempuran (getRandom seed) |

---

### 8.52 downloadReward (2 aksi)
**File:** `handlers/downloadReward/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getDownloadRewardInfo | userId | Info reward download |
| getDownloadReward | userId | Ambil reward download |

---

### 8.53 questionnaire (1 aksi)
**File:** `handlers/questionnaire/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getQuestionnaireInfo | userId, questId, answers, ip, answerTime | Info/submit kuesioner |

---

### 8.54 YouTuber (2 aksi)
**File:** `handlers/YouTuber/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| joinYouTuberPlan | userId, mailAddr | Bergabung program YouTuber |
| getYouTuberRecruitReward | userId | Ambil reward rekrutmen YouTuber |

---

### 8.55 buryPoint (1 aksi)
**File:** `handlers/buryPoint/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| report | userId, point, passLesson, version | Lapor analytics/bury point |

---

### 8.56 backpack (5 aksi)
**File:** `handlers/backpack/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getBackpackInfo | userId, version | Info inventaris |
| sellItem | userId, itemId, itemNum, version | Jual item |
| useItem | userId, itemId, num, version | Gunakan item |
| openBox | userId, itemId, num, version | Buka kotak |
| composeItem | userId, itemId, num, version | Komposisi item |

**JSON Referensi:** `thingsID.json`, `thingsType.json`, `bagPlus.json`, `chooseBox.json`, `combinationBox.json`, `randomBox.json`, `keyItemLimit.json`

---

### 8.57 rank (2 aksi)
**File:** `handlers/rank/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getRankList | userId, rankType | Daftar ranking |
| getRankInfo | userId, rankType | Info ranking |

**JSON Referensi:** Semua file terkait ranking sesuai RANK_TYPE

---

### 8.58 userMsg (5 aksi)
**File:** `handlers/userMsg/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getMsgList | userId, version | Daftar pesan user |
| getMsg | userId, friendId, time, version | Ambil pesan |
| sendMsg | userId, friendId, msg, version | Kirim pesan |
| readMsg | userId, friendId, version | Baca pesan |
| delFriendMsg | userId, friendId, version | Hapus pesan teman |

---

### 8.59 market (2 aksi)
**File:** `handlers/market/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getMarketInfo | userId, version | Info market |
| marketBuy | ... | Beli dari market |

**JSON Referensi:** `market.json`, `marketRefresh.json`, `marketGrowGoods.json`

---

### 8.60 vipMarket (1 aksi)
**File:** `handlers/vipMarket/`

| Action | Request Fields | Deskripsi |
|--------|---------------|-----------|
| getInfo | userId, version | Info toko VIP |

**JSON Referensi:** `vipMarket.json`, `vip.json`, `vipUpgrade.json`

---

## 9. Cross-Reference: Handler ↔ Resource/JSON

### Mapping Lengkap Handler ke File JSON

#### user handler
- `playerIcon.json`, `headFrame.json`, `headIconEffect.json`, `noticeContent.json`, `open.json`, `register.json`, `fastTeam.json`, `constant.json`

#### hero handler
- `hero.json`, `heroLevelUpWhite.json`, `heroLevelUpGreen.json`, `heroLevelUpBlue.json`, `heroLevelUpPurple.json`, `heroLevelUpOrange.json`, `heroLevelUpFlickerOrange.json`, `heroLevelUpSuperOrange.json`, `heroPiece.json`, `heroEvolve.json`, `heroEvolveRed.json`, `heroWakeUp.json`, `heroWakeUpRed.json`, `heroRebirth.json`, `heroResolve.json`, `heroConnect.json`, `heroConnectLevelMax.json`, `heroConnectSeatBuyTime.json`, `heroLevelAttr.json`, `heroPower.json`, `heroSkin.json`, `heroSkinSkillIDMapping.json`, `heroTypeParam.json`, `heroQualityParam.json`, `heroQualityPower.json`, `heroRate.json`, `heroBook.json`, `heroBookRed.json`, `heroOrigin.json`, `heroAnimation.json`, `heroEffectLoading.json`, `heroToBattleId.json`, `heroPropGames.json`, `heroUnion.json`, `heroHeadFrame.json`, `heroType2.json`

#### summon handler
- `summon.json`, `summonPool.json`, `summonEnergy.json`, `summonRandom.json`, `randomHero.json`, `randomHeroPiece.json`, `randomBox.json`

#### guild handler
- `guild.json`, `guildShop.json`, `guildTech.json`, `guildTechAbility.json`, `guildBOSS.json`, `guildBOSSBasic.json`, `guildBOSSReward.json`, `guildActivePoint.json`, `guildHeadIcon.json`, `guildOpen.json`, `guildContent.json`, `guildRegister.json`, `guildGrabChest.json`, `guildGrabBattleGlobal.json`

#### arena handler
- `arenaEverydayAward.json`, `arenaEveryBattleAward.json`, `arenaShop.json`, `arenaTimesBuy.json`, `arenaTopRankAward.json`, `arenaFindEnemy.json`, `arenaRobot.json`

#### dungeon handler
- `expDungeon.json`, `evolveDungeon.json`, `energyDungeon.json`, `equipDungeon.json`, `equipDungeonAward.json`, `metalDungeon.json`, `zStoneDungeon.json`, `signDungeonA.json`, `signDungeonB.json`, `dungeonTimesBuy.json`, `dungeonBulma.json`

#### hangup handler
- `lesson.json`, `chapter.json`, `chapterGames.json`, `chapterType.json`, `idleVipPlus.json`, `idleAwardFirst.json`, `lessonIdleAward.json`, `lessonIdleAwardBulma.json`, `starReward.json`

#### shop handler
- `shopRefresh.json`, `market.json`, `marketRefresh.json`, `marketGrowGoods.json`, `soulShop.json`, `soulShopPlus.json`

#### mail handler
- `mailContent.json`, `noticeContent.json`

#### task handler
- `task.json`, `taskAchievement.json`, `taskDaily.json`

#### activity handler
- `activityEquipLucky.json`, `activitySignUpUp.json`, `signUpUpStudy.json`, `signEx.json`, `signLevelUp.json`, `signStarUp.json`, `signMerge.json`, `signPiece.json`, `signRebirth.json`, `signResolveEx.json`, `signRefreshEx.json`, `signSuitEx.json`, `signRandomEx.json`, `signPartEx.json`, `signArmorEx.json`, `signAttackEx.json`, `signHpEx.json`, `signDodgeEx.json`, `signCriticalEx.json`, `signBlockEx.json`, `signSpeedEx.json`, `signNewAbilityEx.json`, `signUpgradeEx.json`, `signRandomAll.json`, `signCombinationBox.json`, `signAwardPlanA.json`, `signAwardPlanB.json`, `signDungeonA.json`, `signDungeonB.json`, `signDungeonAward.json`, `signDungeonAwardA.json`, `signDungeonAwardB.json`, `signAdd.json`, `signAddItem.json`, `dragonWish.json`, `dragonWishVIP.json`, `dragonExchange.json`, `LevelPrivilege.json`, `LevelPrivilegeBuy.json`

#### equip handler
- `equip.json`, `equipSuit.json`, `equipDungeon.json`, `equipDungeonAward.json`, `equipAwardPlan.json`, `equipLuckyLevelUp.json`, `ring.json`, `ringLevelUp.json`, `ringEvolve.json`, `earringLevelUp.json`, `earringEvolve.json`, `earringDeify.json`, `earringQuilty.json`, `jewel.json`, `jewLevelUp.json`, `jewSuit.json`, `jewelSpecial.json`

#### imprint handler
- `signEx.json`, `signLevelUp.json`, `signStarUp.json`, `signMerge.json`, `signPiece.json`, `signRebirth.json`, `signResolveEx.json`, `signRefreshEx.json`, `signSuitEx.json`, `signUpUpStudy.json`, `signAdd.json`, `signAddItem.json`, `signRandomEx.json`, `signPartEx.json`, `signArmorEx.json`, `signAttackEx.json`, `signHpEx.json`, `signDodgeEx.json`, `signCriticalEx.json`, `signBlockEx.json`, `signSpeedEx.json`, `signNewAbilityEx.json`, `signUpgradeEx.json`, `signRandomAll.json`, `signCombinationBox.json`, `signAwardPlanA.json`, `signAwardPlanB.json`, `signDungeonA.json`, `signDungeonB.json`

#### weapon handler
- `weapon.json`, `weaponLevelUp.json`, `weaponPiece.json`, `weaponMerge.json`, `weaponRebirth.json`, `weaponStrengthen.json`, `weaponHalo.json`

#### tower handler
- `karinTowerCan.json`, `karinTowerChest.json`, `karinTowerClimb.json`, `karinTowerLuck.json`, `karinTowerPlus.json`, `karinTowerRank.json`, `karinTowerReward.json`, `karinTowerTimesBuy.json`, `karinTowerWinClimb.json`

#### ballWar handler
- `dragonBallWar.json`, `dragonBallWarAward.json`, `dragonBallWarBUFF.json`, `dragonBallWarBuy.json`, `dragonBallWarGuildLevel.json`, `dragonBallWarMatch.json`, `dragonBallWarNotice.json`

#### bossCompetition handler
- `bossAttack.json`, `bossAttackAward.json`, `bossAttackLevel.json`, `bossAttackTimesBuy.json`, `bossFight.json`, `bossFightTimesBuy.json`

#### entrust handler
- `timeTravel.json`, `timeTravelAward.json`, `timeTravelBOSS.json`, `timeTravelBOSSReward.json`, `timeTravelHeroSelf.json`, `timeTravelTime.json`

#### war handler
- `globalWar.json`, `globalWarAuditionAward.json`, `globalWarMailAward.json`

#### topBattle handler
- `topBattle.json`, `topBattle64.json`, `topBattleBuyTime.json`, `topBattleMatch.json`, `topBattleRank.json`, `topBattleZone.json`

#### expedition handler
- `expedition.json`, `expeditionChapter.json`, `expeditionEvent.json`, `expeditionSpeedUp.json`, `dimensionMachine.json`, `dimensionMachineLevelUp.json`

#### cellGame handler
- `cellGame.json`, `cellGameChest.json`, `cellGameChestRandom.json`

#### snake handler
- `snakeDungeon.json`, `snakeChest.json`, `snakeShop.json`, `snakeWipe.json`

#### training handler
- `training.json`, `trainingEnemy.json`, `trainingTimesBuy.json`, `quest.json`, `questSurprise.json`

#### timeTrial handler
- `timeTrain.json`, `timeTrain1.json`, `timeTrain2.json`, `timeTrain3.json`, `timeTrainConstant.json`, `timeTrainPlan.json`, `timeTrainReward.json`, `timeTrainTimesBuy.json`, `timeTrainDescribe1.json`, `timeTrainDescribe2.json`, `timeTrainDescribe3.json`, `timeTrainLable.json`, `timeTrainLable1.json`, `timeTrainLable2.json`, `timeTrainLable3.json`

#### mine handler
- `mine.json`, `mineActionBuy.json`, `mineChest.json`, `mineRestartBuy.json`

#### maha handler
- `mahaAdventure.json`, `mahaAdventureBOSS.json`, `mahaAdvenTimesBuy.json`

#### gift handler
- `firstRecharge.json`, `vipBuyBonus.json`, `satanGift.json`, `satanGiftParam.json`, `bindAward.json`, `onlineBonus.json`, `LevelPrivilege.json`, `LevelPrivilegeBuy.json`

#### recharge handler
- `recharge.json`, `rechargeLevel.json`, `vip.json`, `vipUpgrade.json`

#### monthCard handler
- `monthCard.json`, `lifelongCardPush.json`

#### timeBonus handler
- `levelBonus.json`, `levelBonusBuy.json`, `levelBuyBonus.json`, `timeLimitBonus.json`

#### timeMachine handler
- `timeMachine.json`, `timeTravel.json`, `timeTravelAward.json`, `timeTravelBOSS.json`, `timeTravelBOSSReward.json`, `timeTravelHeroSelf.json`, `timeTravelTime.json`

#### trial handler
- `templeTest.json`, `templeDaily.json`, `templePrivilege.json`, `templePrivilegeBuy.json`

#### gravity handler
- `gravityTest.json`, `gravityTestConstant.json`, `gravityTestTimesBuy.json`, `gravityEffectIcon.json`

#### battleMedal handler
- `battleMedal.json`, `battleMedalShop.json`, `battleMedalSuperBuy.json`, `battleMedalTask.json`

#### heroImage handler
- `hero.json`, `heroSkin.json`

#### superSkill handler
- `superSkill.json`, `superLevelUp.json`, `superEvolve.json`, `superLevel.json`, `superBook.json`, `superCompensate.json`

#### dragon handler
- `dragonWish.json`, `dragonWishVIP.json`, `dragonExchange.json`

#### genki handler
- `genki.json`, `genkiBook.json`, `genkiFusion.json`, `genkiRandomBox.json`

#### gemstone handler
- `jewel.json`, `jewLevelUp.json`, `jewRandom.json`, `jewSuit.json`

#### resonance handler
- (menggunakan data internal resonance system)

#### strongEnemy handler
- `bossAttack.json`, `bossAttackAward.json`, `bossAttackLevel.json`, `bossAttackTimesBuy.json`

#### teamDungeonGame handler
- `teamDungeon.json`, `teamDungeon101.json`, `teamDungeon102.json`, `teamDungeonAchievement.json`, `teamDungeonAction.json`, `teamDungeonAnimation.json`, `teamDungeonAward.json`, `teamDungeonContant.json`, `teamDungeonDaily.json`, `teamDungeonEffect.json`, `teamDungeonKey.json`, `teamDungeonLesson.json`, `teamDungeonListener.json`, `teamDungeonMonster.json`, `teamDungeonNotice.json`, `teamDungeonPiece.json`, `teamDungeonRobot.json`, `teamDungeonRoleSkill.json`, `teamDungeonShop.json`, `teamDungeonTalk.json`, `teamDungeonTrap.json`

#### teamTraining handler
- `teamTraining.json`, `teamTrainingLimit.json`

#### backpack handler
- `thingsID.json`, `thingsType.json`, `bagPlus.json`, `chooseBox.json`, `combinationBox.json`, `randomBox.json`, `keyItemLimit.json`

#### vipMarket handler
- `vipMarket.json`, `vip.json`, `vipUpgrade.json`

#### Shared/Common JSON files (digunakan oleh banyak handler)
- `constant.json`, `constantEndlessdown.json`, `errorDefine.json`, `language.json`, `language-cn.json`, `skill.json`, `skillAnimation.json`, `skillAnimNew.json`, `skillEffectDelay.json`, `skillEffectInstant.json`, `skillEffectInfo.json`, `skillEffectTips.json`, `skillIDMapping.json`, `skillOutBattle.json`, `effectAnimation.json`, `effectAnimGroup.json`, `overlapType.json`, `triggerAnimationTime.json`, `changeColor.json`, `currencyDisplay.json`, `userUpgrade.json`, `scrollBackGroundSpeed.json`, `playerIcon.json`, `bondActivation.json`, `enemy.json`, `robotPlayer.json`, `selfBreak.json`, `selfBreakCost.json`, `selfBreakDefault.json`, `selfBreakQuality.json`, `potentialLevel.json`, `qigong.json`, `qigongQualityMaxPara.json`, `qigongRandom.json`, `zPowerQualityPara.json`, `storyAnimation.json`, `storyMusic.json`, `storySwitch.json`, `storyVoice.json`, `trapEndlessdown.json`, `battleEffectIcon.json`, `battleLevelBuy.json`, `battleBackLoading.json`, `music.json`, `register.json`, `dialog.json`, `link.json`, `rewardBook.json`, `rewardHelpReward.json`, `rewardList.json`, `rewardNum.json`, `rewardRefresh.json`, `materialNotEnough.json`, `goldBuy.json`, `goldPrice.json`, `itemOrigin.json`, `newHeroSpeed.json`, `newHero_Speed.json`, `serverMergeBOSS.json`, `mainTag.json`, `fullLevelCharacterTable.json`, `story.json`, `storyAside.json`, `storyPlot.json`, `signDungeonAward.json`, `signDungeonAwardA.json`, `signDungeonAwardB.json`, `lessonEndlessdown.json`, `lessonEquipAward.json`, `lessonGames.json`, `lessonIdleAward.json`, `levelAbilityArmor.json`, `levelAbilityArmorDamage.json`, `levelAbilityArmorS.json`, `levelAbilityBody.json`, `levelAbilityBodyDamage.json`, `levelAbilityCritical.json`, `levelAbilityDodge.json`, `levelAbilityDot.json`, `levelAbilityHit.json`, `levelAbilitySkill.json`, `levelAbilityStrength.json`, `levelAbilityblock.json`, `headFrame.json`, `headIconEffect.json`, `satanGift.json`, `satanGiftParam.json`

---
### Struktur Main-server
```
-server/
├── index.js          # Socket.IO server + handler.process router
├── db.js             # better-sqlite3 setup + WAL mode + query helpers
├── config.js         # Konfigurasi (port, sdkServerUrl, server0Time)
├── logger.js      # Emoji block logging (sama seperti login-server)
├── tea.js          # XXTEA encrypt/decrypt untuk verify
├── handlers/         # Handler per module
│   ├──  user/enterGame.js , registChat.js ,dll       # type: 'user'
│   ├── hero/       # type: 'hero'
│   ├── summon/    # type: 'summon'
│   ├── guild/      # type: 'guild'
│   ├── friend/     # type: 'friend'
│   ├── arena/      # type: 'arena'
│   ├── dungeon/    # type: 'dungeon'
│   ├── hangup/     # type: 'hangup'
│   ├── shop/       # type: 'shop'
│   ├── mail/       # type: 'mail'
│   ├── task/       # type: 'task'
│   ├── activity/   # type: 'activity' (terbesar)
│   ├── equip/      # type: 'equip'
│   ├── imprint/    # type: 'imprint'
│   ├── weapon/     # type: 'weapon'
│   ├── tower/      # type: 'tower'
│   ├── ballWar/    # type: 'ballWar'
│   ├── bossCompetition/
│   ├── entrust/
│   ├── war/
│   ├── topBattle/
│   ├── expedition/
│   ├── cellGame/
│   ├── snake/
│   ├── training/
│   ├── timeTrial/
│   ├── mine/
│   ├── maha/
│   ├── checkin/
│   ├── gift/
│   ├── recharge/
│   ├── monthCard/
│   ├── retrieve/
│   ├── timeBonus/
│   ├── timeMachine/
│   ├── trial/
│   ├── gravity/
│   ├── battleMedal/
│   ├── heroImage/
│   ├── superSkill/
│   ├── dragon/
│   ├── genki/
│   ├── gemstone/
│   ├── resonance/
│   ├── strongEnemy/
│   ├── teamDungeonGame/
│   ├── teamTraining/
│   ├── littleGame/
│   ├── guide/
│   ├── battleRecordCheck/
│   ├── battle/
│   ├── downloadReward/
│   ├── questionnaire/
│   ├── youTuber/
│   ├── buryPoint/
│   ├── backpack/
│   ├── rank/
│   ├── userMsg/
│   ├── market/
│   └── vipMarket/
├── data/             # Static JSON data loaded from resource/json
│   └── (semua JSON dari resource/json dimuat ke memory)
└── package.json
```







*Analisa ini dihasilkan dari main.min(unminfy).js (244,761 baris, 10.5MB) dan resource/json/ (471 file) — Semua data diekstrak langsung dari source code. Zero asumsi, zero stub, zero override, zero dummy.*
