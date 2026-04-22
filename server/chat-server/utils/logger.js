/**
 * ============================================================================
 *  Logger — Chat Server (Standalone)
 *  Simple console logger with [Chat] prefix
 * ============================================================================
 */

var PREFIX = '[Chat]';

function info(tag, msg) {
    var now = new Date().toISOString();
    console.log(now + ' ' + PREFIX + ' [' + tag + '] ' + msg);
}

function warn(tag, msg) {
    var now = new Date().toISOString();
    console.warn(now + ' ' + PREFIX + ' [' + tag + '] ' + msg);
}

function error(tag, msg) {
    var now = new Date().toISOString();
    console.error(now + ' ' + PREFIX + ' [' + tag + '] ' + msg);
}

function debug(tag, msg) {
    if (process.env.DEBUG) {
        var now = new Date().toISOString();
        console.log(now + ' ' + PREFIX + ' [DBG:' + tag + '] ' + msg);
    }
}

module.exports = {
    info: info,
    warn: warn,
    error: error,
    debug: debug,
};
