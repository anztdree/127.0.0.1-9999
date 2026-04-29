/**
 * handlers/hangup/saveGuideTeam.js — Save Guide Team Handler
 *
 * =============================================================================
 * CLIENT REQUEST (exact dari client code):
 * =============================================================================
 *   Dua lokasi pemanggilan, keduanya di tutorial/guide:
 *
 *   1) Guide step 2107 (line 104867-104874):
 *      type: 'hangup'
 *      action: 'saveGuideTeam'
 *      userId: string
 *      team: array<{heroId: string} | null>   — 5 slot (0-4), null = kosong
 *      supers: array<number>                    — [skillId, ...]
 *      version: '1.0'
 *      → supers sumber: [constant[1].tutorialSuperSkill] (hardcoded 1 skill)
 *
 *   2) Guide step 2508 (line 105806-105813):
 *      Sama format, tapi supers dari e.superSkillArray() (user-chosen skills)
 *
 * =============================================================================
 * TEAM FORMAT (dari getBattleHero — line 86658-86662):
 * =============================================================================
 *   team = [
 *     { heroId: "uuid-xxx" },    // slot 0 — hero instance UUID
 *     null,                       // slot 1 — kosong
 *     { heroId: "uuid-yyy" },    // slot 2
 *     null,                       // slot 3
 *     null                        // slot 4
 *   ]
 *   - Array panjangnya selalu 5 (slot 0-4)
 *   - heroId = hero INSTANCE UUID (bukan displayId 1205)
 *   - null = slot kosong, tidak ada hero
 *
 * =============================================================================
 * SUPERS FORMAT (dari superSkillArray / tutorialSuperSkill):
 * =============================================================================
 *   supers = [1001, 1002]   — array of super skill ID (number)
 *   Step 2107: [constant[1].tutorialSuperSkill] — 1 elemen dari konstanta
 *   Step 2508: dari e.superSkillArray() — skill ID dari battle scene
 *
 * =============================================================================
 * CLIENT CALLBACK (line 104874):
 * =============================================================================
 *   Success → langsung chain ke checkBattleResult (TIDAK baca response data)
 *   Fail    → Logger.serverDebugLog('失败！！！')
 *   Jadi response cukup {} asal ret: 0
 *
 * =============================================================================
 * CHAIN SETELAH SUKSES:
 * =============================================================================
 *   Setelah saveGuideTeam sukses, client langsung memanggil:
 *     type: 'hangup', action: 'checkBattleResult', isGuide: true
 *   Response checkBattleResult yang diharapkan:
 *     _battleResult, _changeInfo._items, _curLess, _maxPassLesson, _maxPassChapter
 *
 * =============================================================================
 * SERVER STORAGE (teams table):
 * =============================================================================
 *   CREATE TABLE teams (
 *       userId     TEXT NOT NULL,
 *       teamType   INTEGER NOT NULL,
 *       teamData   TEXT NOT NULL DEFAULT '[]',
 *       superSkill TEXT NOT NULL DEFAULT '[]',
 *       PRIMARY KEY (userId, teamType)
 *   )
 *
 *   teamType = 9 (LAST_TEAM_TYPE.HANGUP)
 *   teamData = JSON array: [{"_heroId":"uuid","_position":0}, ...]
 *   superSkill = JSON array: [{"_id":1001}, {"_id":1002}]
 *
 *   Konversi dari client format → DB format:
 *     Client: [{heroId:"uuid1"}, null, {heroId:"uuid2"}]
 *     DB:     [{"_heroId":"uuid1","_position":0},{"_heroId":"uuid2","_position":2}]
 *
 *     Client: [1001, 1002]
 *     DB:     [{"_id":1001},{"_id":1002}]
 *
 * =============================================================================
 * VALIDATION (natural — original server behavior):
 * =============================================================================
 *   1. userId harus ada di users table
 *   2. team harus array (maks 5 elemen)
 *   3. setiap heroId di team harus ada di heroes table milik user ini
 *   4. tidak boleh ada heroId duplikat dalam satu team
 *   5. supers harus array of numbers
 *
 * =============================================================================
 */

// LAST_TEAM_TYPE.HANGUP = 9 (proven from client enum, line 96503)
var TEAM_TYPE_HANGUP = 9;

module.exports = {
    execute: function (data, socket, ctx) {
        return new Promise(function (resolve) {
            try {
                // ================================================================
                // 1. VALIDATE userId
                // ================================================================
                var userId = data.userId;
                if (!userId) {
                    console.warn('[hangup/saveGuideTeam] Missing userId');
                    return resolve(ctx.buildErrorResponse(1));
                }

                // Cek user ada di database
                var user = ctx.db.getUser(userId);
                if (!user) {
                    console.warn('[hangup/saveGuideTeam] User not found: ' + userId);
                    return resolve(ctx.buildErrorResponse(1));
                }

                // ================================================================
                // 2. VALIDATE team structure
                // ================================================================
                var team = data.team;
                if (!Array.isArray(team)) {
                    console.warn('[hangup/saveGuideTeam] team is not array: ' + typeof team);
                    return resolve(ctx.buildErrorResponse(1));
                }
                if (team.length > 5) {
                    console.warn('[hangup/saveGuideTeam] team exceeds 5 slots: ' + team.length);
                    return resolve(ctx.buildErrorResponse(1));
                }

                // ================================================================
                // 3. VALIDATE supers structure
                // ================================================================
                var supers = data.supers;
                if (!Array.isArray(supers)) {
                    console.warn('[hangup/saveGuideTeam] supers is not array: ' + typeof supers);
                    return resolve(ctx.buildErrorResponse(1));
                }

                // ================================================================
                // 4. VALIDATE heroId exists dan tidak duplikat
                // ================================================================
                // Ambil semua hero milik user ini untuk validasi
                var userHeroes = ctx.db.getHeroes(userId);
                // Build Set of heroId untuk O(1) lookup
                var heroIdSet = {};
                for (var h = 0; h < userHeroes.length; h++) {
                    heroIdSet[userHeroes[h].heroId] = true;
                }

                // Validasi setiap hero di team
                var seenHeroIds = {};  // detect duplikat
                var validTeamData = [];
                var heroCount = 0;

                for (var i = 0; i < team.length; i++) {
                    var slot = team[i];
                    if (slot === null || slot === undefined) {
                        // Slot kosong — skip
                        continue;
                    }
                    if (typeof slot !== 'object' || !slot.heroId) {
                        console.warn('[hangup/saveGuideTeam] Invalid team slot[' + i + ']: ' + JSON.stringify(slot));
                        return resolve(ctx.buildErrorResponse(1));
                    }
                    var heroId = slot.heroId;
                    // Cek hero ada di milik user
                    if (!heroIdSet[heroId]) {
                        console.warn('[hangup/saveGuideTeam] Hero not owned by user: ' + heroId);
                        return resolve(ctx.buildErrorResponse(1));
                    }
                    // Cek duplikat
                    if (seenHeroIds[heroId]) {
                        console.warn('[hangup/saveGuideTeam] Duplicate hero in team: ' + heroId);
                        return resolve(ctx.buildErrorResponse(1));
                    }
                    seenHeroIds[heroId] = true;
                    validTeamData.push({
                        _heroId: heroId,
                        _position: i
                    });
                    heroCount++;
                }

                // Minimal harus ada 1 hero (client tidak akan kirim kosong,
                // tapi validasi tetap bagus untuk keamanan)
                if (heroCount === 0) {
                    console.warn('[hangup/saveGuideTeam] Empty team — no heroes');
                    return resolve(ctx.buildErrorResponse(1));
                }

                // ================================================================
                // 5. KONVERSI supers → DB format
                // ================================================================
                // Client: [1001, 1002]
                // DB:     [{"_id": 1001}, {"_id": 1002}]
                var validSuperSkill = [];
                for (var s = 0; s < supers.length; s++) {
                    var skillId = supers[s];
                    if (typeof skillId !== 'number') {
                        console.warn('[hangup/saveGuideTeam] Invalid super skill ID at index ' + s + ': ' + typeof skillId);
                        return resolve(ctx.buildErrorResponse(1));
                    }
                    validSuperSkill.push({ _id: skillId });
                }

                // ================================================================
                // 6. SIMPAN KE DATABASE
                // ================================================================
                // teamType = 9 (LAST_TEAM_TYPE.HANGUP)
                // db.setTeam(userId, teamType, teamData_json, superSkill_json)
                ctx.db.setTeam(
                    userId,
                    TEAM_TYPE_HANGUP,
                    JSON.stringify(validTeamData),
                    JSON.stringify(validSuperSkill)
                );

                // ================================================================
                // 7. RETURN SUCCESS
                // ================================================================
                // Client TIDAK membaca response data — hanya cek ret code.
                // Langsung chain ke checkBattleResult setelah ini.
                resolve(ctx.buildResponse({}));

            } catch (err) {
                console.error('[hangup/saveGuideTeam] Error:', err);
                resolve(ctx.buildErrorResponse(1));
            }
        });
    }
};
