/**
 * handlers/user/enterGame.js — enterGame Handler
 *
 * KRITIS: Ini adalah handler paling penting.
 * Tanpa ini, client stuck di loading forever.
 *
 * Request: { type: 'user', action: 'enterGame', loginToken, userId, serverId, version, language, gameVersion }
 * Response: Full user data (97 field) untuk UserDataParser.saveUserData()
 *
 * Naming ikuti main.min.js persis:
 *   - e.user → table user, field _nickName, _headImage, dll.
 *   - e.heros → table heros, field _displayId, _level, dll.
 *   - e.totalProps → table totalProps, field _itemId, _num, dll.
 */

module.exports = {
    schema: {
        user: {
            _id:               'TEXT PRIMARY KEY',
            _nickName:         "TEXT DEFAULT ''",
            _pwd:              "TEXT DEFAULT ''",
            _headImage:        'INTEGER DEFAULT 0',
            _headBoxId:        'INTEGER DEFAULT 0',
            _lastLoginTime:    'INTEGER DEFAULT 0',
            _createTime:       'INTEGER DEFAULT 0',
            _bulletinVersions: "TEXT DEFAULT '[]'",
            _oriServerId:      "TEXT DEFAULT ''",
            _nickChangeTimes:  'INTEGER DEFAULT 0',
            _level:            'INTEGER DEFAULT 1',
            _diamond:          'INTEGER DEFAULT 0',
            _gold:             'INTEGER DEFAULT 0',
            _exp:              'INTEGER DEFAULT 0',
            _vipLevel:         'INTEGER DEFAULT 0',
            _vipExp:           'INTEGER DEFAULT 0',
            _vipTotalExp:      'INTEGER DEFAULT 0',
            _chapterId:        'INTEGER DEFAULT 801',
            _lessonId:         'INTEGER DEFAULT 10101',
            _maxPassLesson:    'INTEGER DEFAULT 0',
            _maxPassChapter:   'INTEGER DEFAULT 0',
            _backpackLevel:    'INTEGER DEFAULT 0',
            _loginToken:       "TEXT DEFAULT ''",
            _serverId:         "TEXT DEFAULT '1'",
            _language:         "TEXT DEFAULT 'en'",
            _hangupJson:       "TEXT DEFAULT '{}'",
            _summonJson:       "TEXT DEFAULT '{}'",
            _scheduleInfoJson: "TEXT DEFAULT '{}'",
            _guideJson:        "TEXT DEFAULT '{}'",
            _fastTeamJson:     "TEXT DEFAULT '[]'",
            _clickSystemJson:  "TEXT DEFAULT '{}'",
            _giftInfoJson:     "TEXT DEFAULT '{}'",
            _timesInfoJson:    "TEXT DEFAULT '{}'",
            _miscJson:         "TEXT DEFAULT '{}'"
        },
        heros: {
            _id:              'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:          'TEXT NOT NULL',
            _displayId:       'INTEGER NOT NULL',
            _level:           'INTEGER DEFAULT 1',
            _quality:         'INTEGER DEFAULT 1',
            _evolveLevel:     'INTEGER DEFAULT 0',
            _star:            'INTEGER DEFAULT 0',
            _skinId:          'INTEGER DEFAULT 0',
            _power:           'INTEGER DEFAULT 0',
            _position:        'INTEGER DEFAULT -1',
            _activeSkill:     "TEXT DEFAULT '[]'",
            _qigongLevel:     'INTEGER DEFAULT 0',
            _selfBreakLevel:  'INTEGER DEFAULT 0',
            _selfBreakType:   'INTEGER DEFAULT 0',
            _connectHeroId:   'INTEGER DEFAULT 0',
            _heroJson:        "TEXT DEFAULT '{}'",
            _foreignKey:      '_userId REFERENCES user(_id)',
            _indexes:         ['idx_heros_user ON(_userId)']
        },
        totalProps: {
            _id:         'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:     'TEXT NOT NULL',
            _itemId:     'INTEGER NOT NULL',
            _num:        'INTEGER DEFAULT 0',
            _displayId:  'INTEGER DEFAULT 0',
            _unique:     '_userId, _itemId, _displayId',
            _foreignKey: '_userId REFERENCES user(_id)',
            _indexes:    ['idx_totalProps_user ON(_userId)']
        },
        equip: {
            _id:         'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:     'TEXT NOT NULL',
            _equipId:    'INTEGER NOT NULL',
            _level:      'INTEGER DEFAULT 1',
            _quality:    'INTEGER DEFAULT 1',
            _heroId:     'INTEGER DEFAULT 0',
            _equipType:  'INTEGER DEFAULT 0',
            _equipJson:  "TEXT DEFAULT '{}'",
            _foreignKey: '_userId REFERENCES user(_id)',
            _indexes:    ['idx_equip_user ON(_userId)']
        },
        weapon: {
            _id:         'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:     'TEXT NOT NULL',
            _weaponId:   'INTEGER NOT NULL',
            _level:      'INTEGER DEFAULT 1',
            _quality:    'INTEGER DEFAULT 1',
            _heroId:     'INTEGER DEFAULT 0',
            _haloLevel:  'INTEGER DEFAULT 0',
            _weaponJson: "TEXT DEFAULT '{}'",
            _foreignKey: '_userId REFERENCES user(_id)',
            _indexes:    ['idx_weapon_user ON(_userId)']
        },
        imprint: {
            _id:          'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:      'TEXT NOT NULL',
            _imprintId:   'INTEGER NOT NULL',
            _level:       'INTEGER DEFAULT 1',
            _star:        'INTEGER DEFAULT 0',
            _quality:     'INTEGER DEFAULT 1',
            _part:        'INTEGER DEFAULT 0',
            _heroId:      'INTEGER DEFAULT 0',
            _viceAttrId:  'INTEGER DEFAULT 0',
            _imprintJson: "TEXT DEFAULT '{}'",
            _foreignKey:  '_userId REFERENCES user(_id)',
            _indexes:     ['idx_imprint_user ON(_userId)']
        },
        genki: {
            _id:        'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:    'TEXT NOT NULL',
            _genkiId:   'INTEGER NOT NULL',
            _heroId:    'INTEGER DEFAULT 0',
            _pos:       'INTEGER DEFAULT 0',
            _genkiJson: "TEXT DEFAULT '{}'",
            _foreignKey:'_userId REFERENCES user(_id)',
            _indexes:   ['idx_genki_user ON(_userId)']
        }
    },

    execute: async (request, socket, ctx) => {
        const { db, jsonLoader, responseBuilder, config, socketStates, userSockets } = ctx;
        const { buildResponse, buildError, buildSuccess } = responseBuilder;
        const { userId, loginToken, serverId, language } = request;

        // ─── 1. VALIDASI PARAMETER ───
        if (!userId) {
            return buildError(8);  // ERROR_LACK_PARAM
        }

        // ─── 2. CHECK / CREATE USER ───
        let user = db.user.get(userId);
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            const constant = jsonLoader.get('constant');
            const c = constant && constant['1'] ? constant['1'] : {};

            const now = Date.now();

            // Create user
            db.user.create({
                _id: userId,
                _nickName: '',
                _headImage: 0,
                _level: parseInt(c.startUserLevel) || 1,
                _diamond: parseInt(c.startDiamond) || 0,
                _gold: parseInt(c.startGold) || 0,
                _exp: 0,
                _vipLevel: 0,
                _vipExp: 0,
                _vipTotalExp: 0,
                _chapterId: parseInt(c.startChapter) || 801,
                _lessonId: parseInt(c.startLesson) || 10101,
                _maxPassLesson: 0,
                _maxPassChapter: (parseInt(c.startChapter) || 801) - 1,
                _backpackLevel: 0,
                _loginToken: loginToken || '',
                _serverId: String(serverId || '1'),
                _language: language || 'en',
                _createTime: now,
                _lastLoginTime: now,
                _hangupJson: JSON.stringify({
                    _curLess: parseInt(c.startLesson) || 10101,
                    _maxPassLesson: 0,
                    _maxPassChapter: (parseInt(c.startChapter) || 801) - 1,
                    _haveGotChapterReward: {},
                    _clickGlobalWarBuffTag: '',
                    _buyFund: false,
                    _haveGotFundReward: {}
                }),
                _summonJson: JSON.stringify({
                    _energy: 0,
                    _wishList: [],
                    _wishVersion: 0,
                    _canCommonFreeTime: 0,
                    _canSuperFreeTime: 0,
                    _summonTimes: {}
                }),
                _scheduleInfoJson: JSON.stringify({}),
                _guideJson: JSON.stringify({}),
                _fastTeamJson: JSON.stringify([]),
                _clickSystemJson: JSON.stringify({}),
                _giftInfoJson: JSON.stringify({
                    _fristRecharge: {},
                    _haveGotVipRewrd: {},
                    _buyVipGiftCount: {},
                    _onlineGift: { _curId: 0, _nextTime: 0 },
                    _gotBSAddToHomeReward: false,
                    _clickHonghuUrlTime: 0,
                    _gotChannelWeeklyRewardTag: ''
                }),
                _timesInfoJson: JSON.stringify({}),
                _miscJson: JSON.stringify({})
            });

            // Create start hero
            db.heros.create({
                _userId: userId,
                _displayId: parseInt(c.startHero) || 1205,
                _level: parseInt(c.startHeroLevel) || 3,
                _quality: 1,
                _evolveLevel: 0,
                _star: 0,
                _skinId: 0,
                _power: 0,
                _position: 0
            });

            // Create default items (currencies) — KRITIS! Jangan kosong!
            db.totalProps.createBatch([
                { _userId: userId, _itemId: 104, _num: 1 },   // PLAYERLEVELID = 1
                { _userId: userId, _itemId: 103, _num: 0 },   // PLAYEREXPERIENCEID = 0
                { _userId: userId, _itemId: 101, _num: 0 },   // DIAMONDID = 0
                { _userId: userId, _itemId: 102, _num: 0 },   // GOLDID = 0
                { _userId: userId, _itemId: 106, _num: 0 },   // PLAYERVIPLEVELID = 0
                { _userId: userId, _itemId: 105, _num: 0 },   // PLAYERVIPEXPERIENCEID = 0
                { _userId: userId, _itemId: 107, _num: 0 }    // PLAYERVIPEXPALLID = 0
            ]);

            user = db.user.get(userId);
        }

        // ─── 3. UPDATE LOGIN ───
        const updateData = { _lastLoginTime: Date.now() };
        if (language) updateData._language = language;
        if (loginToken) updateData._loginToken = loginToken;
        db.user.update(userId, updateData);

        // ─── 4. HANDLE DUPLICATE LOGIN (KICKOUT) ───
        const existingSocketId = userSockets.get(userId);
        if (existingSocketId && existingSocketId !== socket.id) {
            const existingSocket = socketIO.sockets.connected[existingSocketId];
            if (existingSocket) {
                existingSocket.emit('Notify', {
                    ret: 'SUCCESS',
                    data: JSON.stringify({ action: 'Kickout' }),
                    compress: false
                });
                setTimeout(() => existingSocket.disconnect(true), 100);
            }
        }

        // Register this socket as active for this user
        const state = socketStates.get(socket.id);
        if (state) state.userId = userId;
        userSockets.set(userId, socket.id);

        // ─── 5. GATHER ALL USER DATA ───
        const heros = db.heros.getByUser(userId) || [];
        const items = db.totalProps.getByUser(userId) || [];
        const equips = db.equip.getByUser(userId) || [];
        const weapons = db.weapon.getByUser(userId) || [];
        const imprints = db.imprint.getByUser(userId) || [];
        const genkis = db.genki.getByUser(userId) || [];

        // Parse JSON fields
        const hangup = safeParse(user._hangupJson);
        const summon = safeParse(user._summonJson);
        const scheduleInfo = safeParse(user._scheduleInfoJson);
        const guide = safeParse(user._guideJson);
        const clickSystem = safeParse(user._clickSystemJson);
        const giftInfo = safeParse(user._giftInfoJson);
        const timesInfo = safeParse(user._timesInfoJson);

        // Build totalProps._items dict
        const itemsDict = {};
        items.forEach((item, index) => {
            itemsDict[String(index)] = { _id: item._itemId, _num: item._num };
        });

        // Build heros array (dengan nama field yang sama seperti main.min.js)
        const herosArray = heros.map(h => ({
            _displayId: h._displayId,
            _level: h._level,
            _quality: h._quality,
            _evolveLevel: h._evolveLevel,
            _star: h._star,
            _skinId: h._skinId,
            _power: h._power,
            _position: h._position,
            _activeSkill: safeParse(h._activeSkill),
            _qigongLevel: h._qigongLevel,
            _selfBreakLevel: h._selfBreakLevel,
            _selfBreakType: h._selfBreakType,
            _connectHeroId: h._connectHeroId
        }));

        // ─── 6. BUILD ENTERGAME RESPONSE ───
        const enterGameData = {
            // Tier 1: WAJIB (client selalu read)
            currency: 'IDR',
            user: {
                _id: user._id,
                _pwd: user._pwd || '',
                _nickName: user._nickName || '',
                _headImage: user._headImage || 0,
                _lastLoginTime: user._lastLoginTime,
                _createTime: user._createTime,
                _bulletinVersions: safeParse(user._bulletinVersions),
                _oriServerId: user._oriServerId || '',
                _nickChangeTimes: user._nickChangeTimes || 0
            },
            hangup: hangup,
            summon: summon,
            totalProps: {
                _items: itemsDict
            },
            backpackLevel: user._backpackLevel || 0,
            equip: {
                equips: equips.map(e => ({
                    _equipId: e._equipId,
                    _level: e._level,
                    _quality: e._quality,
                    _heroId: e._heroId,
                    _equipType: e._equipType
                })),
                weapons: weapons.map(w => ({
                    _weaponId: w._weaponId,
                    _level: w._level,
                    _quality: w._quality,
                    _heroId: w._heroId,
                    _haloLevel: w._haloLevel
                })),
                genkis: genkis.map(g => ({
                    _genkiId: g._genkiId,
                    _heroId: g._heroId,
                    _pos: g._pos
                })),
                rings: []
            },
            superSkill: {},
            heros: herosArray,
            summonLog: [],
            curMainTask: {},
            scheduleInfo: scheduleInfo,
            dragonEquiped: {},
            _arenaTeam: ['', '', '', '', ''],
            _arenaSuper: {},
            karinStartTime: 0,
            karinEndTime: 0,
            retrieve: {},
            globalWarBuffTag: '',
            globalWarLastRank: 0,
            globalWarBuff: {},
            globalWarBuffEndTime: 0,
            userTopBattle: {},
            topBattleInfo: {},
            blacklist: [],
            forbiddenChat: {},
            enableShowQQ: 0,
            showQQVip: 0,
            showQQ: 0,
            broadcastRecord: [],
            newUser: isNewUser,

            // Tier 2: Conditional (aman jika ada)
            imprint: { imprints: imprints.map(i => ({
                _imprintId: i._imprintId,
                _level: i._level,
                _star: i._star,
                _quality: i._quality,
                _part: i._part,
                _heroId: i._heroId,
                _viceAttrId: i._viceAttrId
            })) },
            dungeon: {},
            teamTraining: {},
            heroSkin: {},
            userGuild: {},
            userGuildPub: {},
            checkin: {},
            channelSpecial: {},
            vipLog: [],
            cardLog: [],
            guide: guide,
            clickSystem: clickSystem,
            giftInfo: giftInfo,
            monthCard: {},
            recharge: {},
            timesInfo: timesInfo,
            timeMachine: {},
            timeBonusInfo: [],
            onlineBulletin: {},
            serverVersion: '1.0',
            serverOpenDate: user._createTime,
            lastTeam: [],
            heroImageVersion: 0,
            superImageVersion: 0,
            training: {},
            warInfo: {},
            userWar: {},
            serverId: String(serverId || '1'),
            headEffect: {},
            userBallWar: {},
            ballWarState: {},
            ballBroadcast: {},
            ballWarInfo: {},
            guildActivePoints: 0,
            hideHeroes: [],
            expedition: {},
            timeTrial: {},
            battleMedal: {},
            shopNewHeroes: {},
            teamDungeon: {},
            teamServerHttpUrl: '',
            teamDungeonOpenTime: {},
            teamDungeonTask: {},
            teamDungeonSplBcst: {},
            teamDungeonNormBcst: {},
            teamDungeonHideInfo: {},
            templatest: {},
            resonance: {},
            registerPlan: 0,
            registerDay: 0
        };

        return buildSuccess(enterGameData);
    }
};

// ─── HELPER FUNCTIONS ───

function safeParse(str) {
    if (!str) return {};
    if (typeof str === 'object') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return {};
    }
}

// Reference to socketIO for Kickout (set by index.js)
let socketIO = null;
module.exports.setSocketIO = function(io) { socketIO = io; };
