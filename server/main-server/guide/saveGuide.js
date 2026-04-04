/**
 * ============================================================
 * SAVEGUIDE.JS - Mock Handler for guide.saveGuide
 * ============================================================
 * 
 * Purpose: Saves guide/tutorial progress step
 * Called frequently during new player tutorial flow
 * 
 * HAR Reference: s398-zd.pksilo.com_2026_04_01_22_14_53.har
 *   - 19 entries verified (raw HAR)
 *   - guideType values: 2, 3, 4, 5, 21, 47
 *   - step values vary (2102, 2107, 2206, 2210, 2304, 2308, 2508, 2601, 2603, 2708, 2717, 3102, 4103, 4201, 4301, 47105, 5105, 21104, 21105)
 * 
 * HAR FACTS (Kamus):
 *   Request  = {type:"guide", action:"saveGuide", userId, guideType, step, version:"1.0"}
 *   Response = EXACT ECHO of request (all 19 entries confirmed)
 * 
 * main.min.js FACTS (Hakim):
 *   - 1 call site (offset 991073, finishGuide)
 *   - Request: {type:"guide", action:"saveGuide", userId, guideType:o.tutorialLine, step:e, version:"1.0"}
 *   - Success callback: Logger.serverDebugLog("成功！！！") — response `e` NEVER READ
 *   - Error callback:   Logger.serverDebugLog("失败！！！") — only logs error
 * 
 * Version: 2.0.0
 * ============================================================
 */

(function(window) {
    'use strict';

    var LOG = {
        prefix: '[GUIDE]',
        _log: function(level, icon, message, data) {
            var timestamp = new Date().toISOString().substr(11, 12);
            var styles = {
                success: 'color: #22c55e; font-weight: bold;',
                info: 'color: #6b7280;',
                warn: 'color: #f59e0b; font-weight: bold;',
                error: 'color: #ef4444; font-weight: bold;'
            };
            var style = styles[level] || styles.info;
            var format = '%c' + this.prefix + ' ' + icon + ' [' + timestamp + '] ' + message;
            if (data !== undefined) {
                console.log(format + ' %o', style, data);
            } else {
                console.log(format, style);
            }
        },
        success: function(msg, data) { this._log('success', 'OK', msg, data); },
        info: function(msg, data) { this._log('info', 'i', msg, data); },
        warn: function(msg, data) { this._log('warn', '!!', msg, data); },
        error: function(msg, data) { this._log('error', 'ERR', msg, data); }
    };

    /**
     * Handler for guide.saveGuide
     * 
     * HAR: Response = exact echo of all request fields.
     * main.min.js: Response never read by client (callback only logs success/error).
     */
    function handleSaveGuide(request, playerData) {
        LOG.info('saveGuide | guideType=' + request.guideType + ' step=' + request.step);

        // HAR VERIFIED: Response = exact echo of all request fields
        var responseData = {};
        for (var key in request) {
            responseData[key] = request[key];
        }

        LOG.success('echo done | guideType=' + responseData.guideType + ' step=' + responseData.step);

        return responseData;
    }

    // ========================================================
    // REGISTER
    // ========================================================
    function register() {
        if (typeof window === 'undefined') {
            return;
        }

        window.MAIN_SERVER_HANDLERS = window.MAIN_SERVER_HANDLERS || {};
        window.MAIN_SERVER_HANDLERS['guide.saveGuide'] = handleSaveGuide;

        LOG.success('registered: guide.saveGuide');
    }

    if (typeof window !== 'undefined') {
        register();
    } else {
        var _check = setInterval(function() {
            if (typeof window !== 'undefined') {
                clearInterval(_check);
                register();
            }
        }, 50);
        setTimeout(function() { clearInterval(_check); }, 10000);
    }

})(window);
