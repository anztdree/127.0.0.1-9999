/**
 * Super Warrior Z - Global Configuration
 *
 * 100% derived from client code analysis. NO assumptions.
 *
 * === CLIENT SOURCE EVIDENCE ===
 *
 * Port assignment (main.min.js line 76751):
 *   t.loginClient   = new TSSocketClient("login-server", false)   → port 8000, NO TEA
 *   t.mainClient    = new TSSocketClient("main-server", true)     → port 8001, TEA verify
 *   t.chatClient    = new TSSocketClient("chat-server", true)     → port 8002, TEA verify
 *   t.dungeonClient = new TSSocketClient("dungeon-server", true)  → port 8003, TEA verify
 *
 * TEA verify handshake (line 52006-52013):
 *   socket.on("verify", function(n) {
 *     var o = (new TEA).encrypt(n, "verification");
 *     socket.emit("verify", o, function(n) {
 *       0 == n.ret ? e() : ErrorHandler.ShowErrorTips(n.ret)
 *     })
 *   })
 *
 * SDK channel (all 15 existing users in sdk-server/data/users.json):
 *   "sdk": "ppgame", "appId": "288"
 *
 * === IMPORT STYLES ===
 *
 * Style A (module object) — chat-server, dungeon-server:
 *   var config = require('../shared/config');
 *   config.validateConfig();
 *   var SERVER_PORT = config.config.servers.chat.port;
 *   // Note: double .config because `config` = the module, .config = the config object
 *
 * Style B (destructured) — main-server, login-server:
 *   var configModule = require('../shared/config');
 *   configModule.validateConfig();
 *   var config = configModule.config;
 *   var SERVER_PORT = config.servers.main.port;
 *
 * Both styles work. Style B avoids the double .config access.
 *
 * === CALLERS ===
 *
 * config object (used by ALL servers):
 *   - main-server/index.js:57   → config.servers.main.port, .host, config.security.teaKey
 *   - chat-server/index.js:48   → config.config.servers.chat.port, .host, config.config.security.teaKey
 *   - dungeon-server/index.js:47 → config.config.servers.dungeon.port, .host, config.config.security.teaKey
 *   - login-server/index.js:503 → config.ports.login
 *   - database/connection.js     → config.database.* (host, port, user, password, database, connectionLimit)
 *   - main-server/handlers/user.js:301 → configModule.config.ports.chat
 *
 * getServerList (used by login-server only):
 *   - login-server/index.js:338 → const serverListData = getServerList();
 *
 * validateConfig (used by main, chat, dungeon):
 *   - main-server/index.js:56   → configModule.validateConfig()
 *   - chat-server/index.js:46   → config.validateConfig()
 *   - dungeon-server/index.js:45 → config.validateConfig()
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

var config = {
    // ============================================
    // Server ports (from client TSSocketClient init, line 76751)
    // Used by login-server: config.ports.login
    // Used by main-server/handlers/user.js: configModule.config.ports.chat
    // ============================================
    ports: {
        login: parseInt(process.env.LOGIN_PORT) || 8000,
        main: parseInt(process.env.MAIN_PORT) || 8001,
        chat: parseInt(process.env.CHAT_PORT) || 8002,
        dungeon: parseInt(process.env.DUNGEON_PORT) || 8003,
    },

    // ============================================
    // Server bind configs
    // host = address the server LISTENS on (bind address)
    //   Default: '0.0.0.0' (listen on all interfaces)
    //   Override: LOGIN_HOST=192.168.1.100 in .env
    //
    // Per-server env vars override SERVER_HOST fallback.
    // Evidence: chat-server/index.js:48 uses config.config.servers.chat.host
    //           dungeon-server/index.js:47 uses config.config.servers.dungeon.host
    //           main-server/index.js:59-60 uses config.servers.main.port/.host
    // ============================================
    servers: {
        login: {
            port: parseInt(process.env.LOGIN_PORT) || 8000,
            host: process.env.LOGIN_HOST || process.env.SERVER_HOST || '0.0.0.0',
        },
        main: {
            port: parseInt(process.env.MAIN_PORT) || 8001,
            host: process.env.MAIN_HOST || process.env.SERVER_HOST || '0.0.0.0',
        },
        chat: {
            port: parseInt(process.env.CHAT_PORT) || 8002,
            host: process.env.CHAT_HOST || process.env.SERVER_HOST || '0.0.0.0',
        },
        dungeon: {
            port: parseInt(process.env.DUNGEON_PORT) || 8003,
            host: process.env.DUNGEON_HOST || process.env.SERVER_HOST || '0.0.0.0',
        },
    },

    // ============================================
    // TEA encryption key
    // MUST be "verification" — client hardcodes this value.
    // Source: main.min.js line 52008:
    //   var o = (new TEA).encrypt(n, "verification");
    //
    // Used by:
    //   main-server/index.js:61   → config.security.teaKey
    //   chat-server/index.js:50   → config.config.security.teaKey
    //   dungeon-server/index.js:49 → config.config.security.teaKey
    //
    // NOTE: Previous version had a duplicate config.teaKey field.
    // That field was NEVER used by any caller (verified across 82 files).
    // Removed to prevent confusion about which field is canonical.
    // ============================================
    security: {
        teaKey: process.env.TEA_KEY || 'verification',
    },

    // ============================================
    // Public host for client-facing URLs
    //
    // This is the hostname/IP that the CLIENT BROWSER uses to connect.
    // Different from bind host (0.0.0.0) which is the server listen address.
    //
    // Default: 127.0.0.1 (localhost — for private server / local testing)
    // Override: SERVER_PUBLIC_HOST=192.168.1.100 in .env (for LAN play)
    //
    // Used by:
    //   getServerList() → url, dungeonurl, chaturl
    //   main-server/handlers/user.js:301 → chat server URL for registChat
    //
    // Evidence from client: client receives URLs in GetServerList response
    // and uses them to create Socket.IO connections. The URL must be reachable
    // from the browser, not from the server.
    // ============================================
    serverPublicHost: process.env.SERVER_PUBLIC_HOST || '127.0.0.1',

    // ============================================
    // MariaDB configuration
    // Used by: database/connection.js init()
    // ============================================
    database: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'admin',
        password: process.env.DB_PASSWORD || 'admin',
        database: process.env.DB_DATABASE || 'super_warrior_z',
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    },

    // ============================================
    // SDK configuration
    // Evidence: ALL 15 users in sdk-server/data/users.json have:
    //   "sdk": "ppgame", "appId": "288"
    // Source: client sdk.js → APP_ID = '288'
    //
    // Used by: sdk-server/config/constants.js (separate config,
    // reads from env or defaults to these same values)
    // ============================================
    sdkChannel: process.env.SDK_CHANNEL || 'ppgame',
    appId: process.env.APP_ID || '288',

    // ============================================
    // Protocol version (from client: version: "1.0")
    // Source: loginGame request (line 77300-77315)
    // ============================================
    version: '1.0',

    // ============================================
    // Game version (from client: sent as gameVersion field)
    // ============================================
    gameVersion: '1.0.0',
};

// ============================================
// SERVER_URL_HELPER
// Builds a client-facing URL for a given port.
// Centralizes URL construction so all servers use the same format.
//
// Used by:
//   getServerList()     → main, chat, dungeon URLs
//   (callers needing client URLs should use this helper)
// ============================================
function buildServerUrl(port) {
    return 'http://' + config.serverPublicHost + ':' + port;
}


/**
 * Validate all required configuration values.
 *
 * Called on startup by:
 *   main-server/index.js:56   → configModule.validateConfig()
 *   chat-server/index.js:46   → config.validateConfig()
 *   dungeon-server/index.js:45 → config.validateConfig()
 *
 * Checks:
 *   1. Required config objects exist
 *   2. TEA key matches client expectation (WARNING, not error)
 *   3. Database config is present
 *
 * @returns {boolean} true if all required fields are present
 * @throws {Error} if critical config is missing
 */
function validateConfig() {
    var errors = [];

    // --- Critical: these MUST exist ---
    if (!config.ports) errors.push('config.ports is missing');
    if (!config.ports.login) errors.push('config.ports.login is missing');
    if (!config.ports.main) errors.push('config.ports.main is missing');

    if (!config.servers) errors.push('config.servers is missing');
    if (!config.servers.main) errors.push('config.servers.main is missing');
    if (!config.servers.main.port) errors.push('config.servers.main.port is missing');

    if (!config.security) errors.push('config.security is missing');
    if (!config.security.teaKey) errors.push('config.security.teaKey is missing');

    if (!config.database) errors.push('config.database is missing');
    if (!config.database.host) errors.push('config.database.host is missing');
    if (!config.database.user) errors.push('config.database.user is missing');
    if (!config.database.database) errors.push('config.database.database is missing');

    if (errors.length > 0) {
        throw new Error('[Config] Validation failed:\n  - ' + errors.join('\n  - '));
    }

    // --- Warning: TEA key mismatch ---
    // Client hardcodes "verification" (line 52008).
    // If TEA_KEY env is set to something else, ALL TEA handshakes will fail
    // and clients CANNOT connect to main/chat/dungeon servers.
    // This is a WARNING, not an error, because someone might intentionally
    // change the key on both client and server (advanced use).
    if (config.security.teaKey !== 'verification') {
        console.warn('');
        console.warn('  ╔══════════════════════════════════════════════════════════════╗');
        console.warn('  ║  WARNING: TEA_KEY is set to "' + config.security.teaKey + '"                        ║');
        console.warn('  ║  Client expects "verification" (line 52008).                  ║');
        console.warn('  ║  If client is not modified, TEA handshake will FAIL.           ║');
        console.warn('  ║  Set TEA_KEY=verification in .env to fix.                     ║');
        console.warn('  ╚══════════════════════════════════════════════════════════════╝');
        console.warn('');
    }

    return true;
}

/**
 * Get server list for client
 *
 * Called by login-server ONLY:
 *   login-server/index.js:338 → const serverListData = getServerList();
 *
 * 100% from client code analysis:
 *
 * Client request (line 77332):
 *   { type:"User", action:"GetServerList", userId, subChannel, channel }
 *
 * Client processes response in selectNewServer (line 88652-88660):
 *   this.filterByWhiteList(t.serverList);
 *   var o = !t.history || t.history.length == 0 ? t.history[0] : t.serverList[0].serverId;
 *   var r = n.matchServerUrl(a, t.serverList);
 *   r ? n.onLoginSuccess(e, r, o) : n.selectServer(e, t)
 *
 * matchServerUrl (line 88666-88678):
 *   Finds server by serverId in serverList array
 *   Returns server object with: serverId, name, url, dungeonurl, chaturl, online, hot, "new"
 *
 * changeServerInfo (line 88663-88665):
 *   Copies offlineReason to each server item if present
 *
 * EXPECTED RESPONSE (parsed JSON):
 * {
 *   serverList: [
 *     {
 *       serverId: number,
 *       name: string,
 *       url: string (main server URL, e.g. "http://127.0.0.1:8001"),
 *       dungeonurl: string (dungeon server URL),
 *       chaturl: string (chat server URL),
 *       online: boolean,
 *       hot: boolean,
 *       "new": boolean
 *     }
 *   ],
 *   history: [serverId, ...],  // Array of server IDs user played on
 *   offlineReason: string       // Optional maintenance message
 * }
 */
function getServerList() {
    return {
        // CRITICAL: key must be "serverList" NOT "servers"
        // Client: t.serverList (line 88653)
        serverList: [
            {
                serverId: 1,
                name: 'Server 1',
                // FIX: SH-2 — Use config.serverPublicHost instead of hardcoded 127.0.0.1
                // Now configurable via SERVER_PUBLIC_HOST env var
                url: buildServerUrl(config.ports.main),
                dungeonurl: buildServerUrl(config.ports.dungeon),
                chaturl: buildServerUrl(config.ports.chat),
                online: true,
                hot: false,
                "new": true,
            },
        ],
        // CRITICAL: key must be "history"
        // Client: t.history.length (line 88656)
        history: [],
        // Optional: maintenance message
        offlineReason: '',
    };
}

module.exports = { config, getServerList, validateConfig };
