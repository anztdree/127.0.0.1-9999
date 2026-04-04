/**
 * ============================================================
 * SAVEGUIDETEAM.JS - Mock Handler for hangup.saveGuideTeam
 * ============================================================
 * 
 * Purpose: Saves the team composition during tutorial/hangup setup
 * Called when player sets their hangup (AFK) team
 * 
 * HAR Reference: s398-zd.pksilo.com_2026_04_01_22_14_53.har
 *   - 2 entries found (raw HAR entries 880 & 934)
 * 
 * HAR FACTS (Kamus):
 *   Request  = {type:"hangup", action:"saveGuideTeam", userId, team:[...], supers:[...], version:"1.0"}
 *   Response = EXACT ECHO of request (type stays "hangup", action stays "saveGuideTeam")
 * 
 * main.min.js FACTS (Hakim):
 *   - 2 call sites (offset 651802 guide flow, offset 664236 normal flow)
 *   - Response callback parameter `e` is NEVER READ
 *   - After callback fires, client immediately calls checkBattleResult
 * 
 * Flow:
 *   1. Client sends: {type:"hangup", action:"saveGuideTeam", userId, team, supers, version}
 *   2. Server echoes back EXACT same payload
 *   3. Client ignores response, proceeds to checkBattleResult
 * 
 * Version: 3.0.0
 * ============================================================
 */

(function(window) {
    'use strict';

    var LOG = {
        prefix: '[GUIDE-TEAM]',
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
     * Handler for hangup.saveGuideTeam
     * 
     * HAR: Response = exact echo of all request fields.
     * main.min.js: Response is never read by client (callback param unused).
     * 
     * team: array of 5 slots (heroId objects or null)
     * supers: array of super skill IDs
     */
    function handleSaveGuideTeam(request, playerData) {
        var team = request.team || [];
        var supers = request.supers || [];
        var heroCount = 0;
        for (var i = 0; i < team.length; i++) {
            if (team[i] && team[i].heroId) heroCount++;
        }

        LOG.info('saveGuideTeam | heroes: ' + heroCount + '/' + team.length + ' | supers: ' + supers.length);

        // Persist team data internally for later use (checkBattleResult etc.)
        if (playerData.hangup) {
            playerData.hangup._team = team;
            playerData.hangup._super = supers;
        }
        try {
            localStorage.setItem('dragonball_player_data_' + request.userId, JSON.stringify(playerData));
        } catch (e) {
            // silent
        }

        // HAR VERIFIED: Response = exact echo of all request fields
        // type stays "hangup", action stays "saveGuideTeam"
        // NO extra fields (guideType, step etc) — those belong to guide.saveGuide
        var responseData = {};
        for (var key in request) {
            responseData[key] = request[key];
        }

        LOG.success('echo done | type=' + responseData.type + ' action=' + responseData.action);

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
        window.MAIN_SERVER_HANDLERS['hangup.saveGuideTeam'] = handleSaveGuideTeam;
        LOG.success('registered: hangup.saveGuideTeam');
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
