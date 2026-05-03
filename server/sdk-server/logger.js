/**
 * logger.js — SDK-SERVER Emoji Block Logging System
 * Referensi: sdk.md Section 21
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
    AUTH:   { emoji: '🛡️', color: chalk.magenta },
    PAY:    { emoji: '💳', color: chalk.yellow },
    SIGN:   { emoji: '🔑', color: chalk.blue },
    NOTIFY: { emoji: '📨', color: chalk.magenta },
    SERVER: { emoji: '🚀', color: chalk.green },
    DB:     { emoji: '💾', color: chalk.cyan },
    ROUTE:  { emoji: '🛤️', color: chalk.gray },
};

// ─── Detail Emoji ───
const DETAILS = {
    data:      '📋',
    important: '📌',
    duration:  '⏱️',
    location:  '📍',
    database:  '💾',
    config:    '⚙️',
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
    const modStr = md.color(module.padEnd(6));

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
    console.log(`${emoji} ${chalk.magenta.bold('═'.repeat(55))}`);
    console.log(`   ${chalk.white.bold(message)}`);
}

function boundaryEnd(emoji) {
    console.log(`${emoji} ${chalk.magenta.bold('═'.repeat(55))}`);
}

// ─── Route list ───
function route(method, path) {
    console.log(`  ├ 📋 ${chalk.cyan(method.padEnd(5))} ${chalk.white(path)}`);
}

function routeLast(method, path) {
    console.log(`  └ 📋 ${chalk.cyan(method.padEnd(5))} ${chalk.white(path)}`);
}

module.exports = {
    log,
    detail,
    details,
    boundary,
    boundaryEnd,
    route,
    routeLast,
    LEVELS,
    MODULES,
    DETAILS,
    chalk
};
