/**
 * logger.js — MAIN-SERVER Emoji Block Logging System
 * Same pattern as login-server, adapted for main-server modules
 *
 * Format: [LEVEL_EMOJI] HH:mm:ss.SSS LEVEL  [MODULE_EMOJI] MODULE ▸ Message
 *   └ [DETAIL_EMOJI] key: value · key: value
 */

const chalk = require('chalk');

// ─── Level Configuration ───
const LEVELS = {
    INFO:  { emoji: '🟢', color: chalk.green,  label: 'INFO ', priority: 1 },
    WARN:  { emoji: '🟡', color: chalk.yellow, label: 'WARN ', priority: 2 },
    ERROR: { emoji: '🔴', color: chalk.red,    label: 'ERROR', priority: 3 },
    DEBUG: { emoji: '🔵', color: chalk.cyan,   label: 'DEBUG', priority: 0 },
};

// ─── Module Configuration ───
const MODULES = {
    AUTH:     { emoji: '🛡️', color: chalk.magenta },   // user authentication
    SOCKET:   { emoji: '🔌', color: chalk.blue },       // socket connect/disconnect
    HANDLER:  { emoji: '⚙️', color: chalk.yellow },     // handler.process dispatcher
    ENTER:    { emoji: '🎮', color: chalk.green },       // enterGame handler
    STORAGE:  { emoji: '💾', color: chalk.cyan },        // user.js game data
    TEA:      { emoji: '🔐', color: chalk.yellow },      // XXTEA verification
    SERVER:   { emoji: '🚀', color: chalk.green },       // server startup/shutdown
    RESOURCE: { emoji: '📦', color: chalk.magenta },     // resource JSON loading
    SDKAPI:   { emoji: '📡', color: chalk.yellow },      // SDK-Server API calls
    NOTIFY:   { emoji: '🔔', color: chalk.blue },        // server push notifications
    GAIN:     { emoji: '💰', color: chalk.green },       // gain/idle rewards
    SUMMON:   { emoji: '🎰', color: chalk.magenta },     // summon/gacha
    HERO:     { emoji: '⚔️', color: chalk.yellow },      // hero operations
};

// ─── Detail Emoji ───
const DETAILS = {
    data:      '📋',
    important: '📌',
    duration:  '⏱️',
    location:  '📍',
    database:  '💾',
    config:    '⚙️',
    request:   '📤',
    response:  '📥',
    session:   '🔗',
    user:      '👤',
};

// ─── Log Level Control ───
const LOG_LEVEL = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
const MIN_PRIORITY = LEVELS[LOG_LEVEL] ? LEVELS[LOG_LEVEL].priority : 1;

// ─── Timestamp ───
function ts() {
    const d = new Date();
    return chalk.gray(
        d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
    );
}

// ─── Main log function — header line ───
function log(level, module, message) {
    const lv = LEVELS[level] || LEVELS.INFO;
    if (lv.priority < MIN_PRIORITY) return;

    const md = MODULES[module] || { emoji: '⚪', color: chalk.white };
    const levelStr = lv.color(lv.label);
    const modStr = md.color(module.padEnd(8));

    console.log(
        `${lv.emoji} ${ts()} ${levelStr} ${md.emoji} ${modStr} ▸ ${chalk.white.bold(message)}`
    );
}

// ─── Detail line — single ───
function detail(type, ...pairs) {
    const emoji = DETAILS[type] || DETAILS.data;
    const line = pairs.map(p => `${chalk.dim(p[0])}: ${chalk.white(p[1])}`).join(` ${chalk.dim('·')} `);
    console.log(`  └ ${emoji} ${line}`);
}

// ─── Multi-detail with tree connector ───
function details(type, ...pairs) {
    const emoji = DETAILS[type] || DETAILS.data;
    pairs.forEach((p, i) => {
        const connector = i < pairs.length - 1 ? '├' : '└';
        const line = `${chalk.dim(p[0])}: ${chalk.white(p[1])}`;
        console.log(`  ${connector} ${emoji} ${line}`);
    });
}

// ─── Boundary — startup/shutdown banner ───
function boundary(emoji, message) {
    console.log(`${emoji} ${chalk.magenta.bold('═'.repeat(60))}`);
    console.log(`   ${chalk.white.bold(message)}`);
}

function boundaryEnd(emoji) {
    console.log(`${emoji} ${chalk.magenta.bold('═'.repeat(60))}`);
}

// ─── Socket event log — connect/disconnect ───
function socketEvent(event, socketId, ip, transport, extra) {
    const eventEmojis = {
        connect: '🟢',
        disconnect: '🔴',
        reconnect: '🟡'
    };
    const eEmoji = eventEmojis[event] || '⚪';
    console.log(
        `  ${eEmoji} ${chalk.gray(ts())} ${chalk.blue('SOCKET')} ${chalk.dim(socketId.substring(0, 8))} ${chalk.white(event.padEnd(12))} ${chalk.dim('🌐')} ${chalk.white(ip)} ${chalk.dim('📡')} ${chalk.white(transport)}${extra ? '  ' + chalk.dim(extra) : ''}`
    );
}

// ─── Action log — handler.process request/response ───
function actionLog(direction, action, status, duration, detailsStr) {
    const dirEmoji = direction === 'req' ? '📤' : '📥';
    const statusEmoji = status === 'OK' ? '✅' : status === 'ERR' ? '❌' : '⏳';
    const durStr = duration !== null && duration !== undefined ? `${duration}ms` : '─────';
    console.log(
        `  ${dirEmoji} ${chalk.cyan(action.padEnd(18))} ${statusEmoji} ${chalk.white(status.padEnd(6))} ${chalk.dim('⏱️')} ${chalk.white(durStr.padStart(6))}${detailsStr ? '  ' + chalk.dim(detailsStr) : ''}`
    );
}

module.exports = {
    log,
    detail,
    details,
    boundary,
    boundaryEnd,
    socketEvent,
    actionLog,
    LEVELS,
    MODULES,
    DETAILS,
    chalk
};
