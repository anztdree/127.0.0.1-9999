/**
 * config.js — Main Server Environment Configuration
 */

require('dotenv').config();

var config = {
    port: parseInt(process.env.PORT) || 8001,

    // Main server own DB (heroes, items, schedule, etc.)
    dbFile: process.env.DB_FILE || './data/main_server.db',

    // Login server DB (READ-ONLY — loginToken validation)
    loginDbFile: process.env.LOGIN_DB_FILE || '../login-server/data/super_warrior_z.db',

    // Server meta
    serverId: parseInt(process.env.SERVER_ID) || 1,
    currency: process.env.CURRENCY || 'USD',
    serverOpenDate: process.env.SERVER_OPEN_DATE || '2024-01-01'
};

module.exports = config;
