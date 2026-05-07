/**
 * config.js — MAIN-SERVER Configuration
 *
 * Port: 8001
 * Transport: Socket.IO 2.5.1
 * TEA: ON (XXTEA, password: "verification")
 * Storage: In-memory (user.js) — "localStorage" approach
 * Resource: /var/www/html/resource/json (471 static files)
 * server0Time: 25200000 (UTC+7 offset)
 */

module.exports = {
    port: 8001,
    host: '0.0.0.0',
    server0Time: 25200000,                          // UTC+7 offset in ms

    // Resource JSON path — read-only static game data
    resourcePath: '/var/www/html/resource/json',

    // Cross-server URLs
    sdkServerUrl: 'http://127.0.0.1:9999',
    chatServerUrl: 'http://127.0.0.1:8002',
    dungeonServerUrl: 'http://127.0.0.1:8003',
    loginServerUrl: 'http://127.0.0.1:8000',

    // TEA/XXTEA verification
    teaPassword: 'verification',
    teaKey: [0x69726576, 0x61636966, 0x6E6F6974, 0x00000000],   // "verification" → strToLongs

    // TEA verify enable (must match client verifyEnable)
    verifyEnable: true,

    // Starting values from constant.json
    startHero: 1205,
    startHeroLevel: 3,
    startLesson: 10101,
    startChapter: 801,
    tutorialHighHero: 1309,
    tutorialNormalHero: 1206,
    playerIcon: 'hero_icon_1205',

    // Daily reset time
    resetTime: '6:00:00',

    // Auto-save interval (ms) — 0 = disabled
    autoSaveInterval: 0,
    autoSavePath: './data/backup.json'
};
