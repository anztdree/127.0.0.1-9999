/**
 * handlers/user/enterGame.js — enterGame Handler (SEMPURNA)
 *
 * CROSS-REFERENCED:
 *   1. main.min(unminfy).js — UserDataParser.saveUserData() (line 114793-114873)
 *   2. HAR enterGame-response-pretty.json — real server response (79 top-level keys)
 *   3. resource/json — constant.json, hero.json, guildTech.json, etc.
 *
 * PRINSIP:
 *   - Semua field & struktur SESUAI PERSIS respons server asli dari HAR
 *   - Semua sub-object memiliki _id (userId UUID)
 *   - heros._heros = DICT (keyed by heroId UUID), BUKAN array
 *   - hero._superSkillLevel bisa number 0, BUKAN selalu array
 *   - hero._potentialLevel bisa object {}, BUKAN selalu array
 *   - hero._qigong / _qigongTmp = { _items: {} } BUKAN {} kosong
 *   - hero._totalCost sub-key = { _items: {} } BUKAN []
 *   - hero._breakInfo._attr = { _items: {} } BUKAN []
 *   - _arenaTeam = {} (dict by heroId), BUKAN array
 *   - _arenaSuper = [] (flat array of heroId strings)
 *   - currency = 'USD' (dari HAR real server)
 *   - user._headImage = STRING 'hero_icon_XXXX', BUKAN integer
 *   - user._attribute = { _items: { itemId: { _id, _num } } }
 *   - userGuildPub WAJIB selalu ada
 *   - guildLevel, guildTreasureMatchRet WAJIB selalu ada
 *   - globalWarBuffTag, globalWarLastRank, globalWarBuff, globalWarBuffEndTime WAJIB
 *   - training WAJIB selalu ada
 *   - headEffect WAJIB selalu ada
 *   - userWar WAJIB selalu ada
 *   - userBallWar WAJIB selalu ada
 *   - channelSpecial WAJIB selalu ada dengan semua sub-field
 *   - broadcastRecord WAJIB selalu [] (array)
 *   - scheduleInfo WAJIB memiliki _id, _refreshTime, _arenaHaveJoinToday, _giveHearts, _getHearts, dll
 *   - NO STUB, NO OVERRIDE, NO FORCE, NO BYPASS, NO DUMMY, NO ASSUMPTIONS
 *
 * Request: { type: 'user', action: 'enterGame', loginToken, userId, serverId, version, language, gameVersion }
 * Response: Full user data untuk UserDataParser.saveUserData()
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
    // ─────────────────────────────────────────────────────────────
    // SCHEMA — tabel yang dikelola handler ini
    // ─────────────────────────────────────────────────────────────
    schema: {
        user: {
            _id:               'TEXT PRIMARY KEY',
            _nickName:         "TEXT DEFAULT ''",
            _pwd:              "TEXT DEFAULT ''",
            _headImage:        "TEXT DEFAULT ''",         // ⚠️ STRING 'hero_icon_XXXX', BUKAN integer!
            _account:          "TEXT DEFAULT ''",          // ⚠️ BARU: account ID
            _channelId:        "TEXT DEFAULT ''",          // ⚠️ BARU: channel ID
            _privilege:        'INTEGER DEFAULT 0',        // ⚠️ BARU: privilege level
            _attributeJson:    "TEXT DEFAULT '{}'",        // ⚠️ BARU: { _items: { itemId: { _id, _num } } }
            _lastLoginTime:    'INTEGER DEFAULT 0',
            _offlineTime:      'INTEGER DEFAULT 0',        // ⚠️ BARU: last offline timestamp
            _createTime:       'INTEGER DEFAULT 0',
            _bulletinVersions: "TEXT DEFAULT '{}'",
            _oriServerId:      "TEXT DEFAULT ''",
            _nickChangeTimes:  'INTEGER DEFAULT 0',
            _levelChangeTime:  'INTEGER DEFAULT 0',        // ⚠️ BARU: level change timestamp
            _vipLevelVersion:  "TEXT DEFAULT ''",          // ⚠️ BARU: VIP level version string
            _os:               "TEXT DEFAULT ''",          // ⚠️ BARU: OS string
            _oldUserBackTime:  'INTEGER DEFAULT 0',        // ⚠️ BARU: old user back time
            _channelParam:     "TEXT DEFAULT '{}'",        // ⚠️ BARU: channel parameters
            _oldName:          "TEXT DEFAULT ''",           // ⚠️ BARU: old nickname
            // ── JSON blob fields (di-parse saat response) ──
            _hangupJson:       "TEXT DEFAULT '{}'",
            _summonJson:       "TEXT DEFAULT '{}'",
            _scheduleInfoJson: "TEXT DEFAULT '{}'",
            _guideJson:        "TEXT DEFAULT '{}'",
            _clickSystemJson:  "TEXT DEFAULT '{}'",
            _giftInfoJson:     "TEXT DEFAULT '{}'",
            _timesInfoJson:    "TEXT DEFAULT '{}'",
            _miscJson:         "TEXT DEFAULT '{}'",
            _backpackLevel:    'INTEGER DEFAULT 1',
            _serverVersion:    "TEXT DEFAULT ''",
            _serverOpenDate:   'INTEGER DEFAULT 0',
            _heroImageVersion: 'INTEGER DEFAULT 0',
            _superImageVersion:'INTEGER DEFAULT 0',
            // ── user.download model ──
            _isClick:          'INTEGER DEFAULT 0',
            _haveGotDlReward:  'INTEGER DEFAULT 0',
            _isBind:           'INTEGER DEFAULT 0',
            _haveGotBindReward:'INTEGER DEFAULT 0',
            // ── misc flags ──
            _newUser:          'INTEGER DEFAULT 1',
            // ── QQ-related ──
            _enableShowQQ:     'INTEGER DEFAULT 0',
            _showQQVip:        'INTEGER DEFAULT 0',
            _showQQ:           'INTEGER DEFAULT 0',
            _showQQImg1:       "TEXT DEFAULT ''",
            _showQQImg2:       "TEXT DEFAULT ''",
            _showQQUrl:        "TEXT DEFAULT ''"
        },
        heros: {
            _id:                    'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:                'TEXT NOT NULL',
            _heroId:                "TEXT DEFAULT ''",
            _heroDisplayId:         'INTEGER DEFAULT 0',
            _heroStar:              'INTEGER DEFAULT 0',
            _expeditionMaxLevel:    'INTEGER DEFAULT 0',
            _fragment:              'INTEGER DEFAULT 0',
            _superSkillResetCount:  'INTEGER DEFAULT 0',
            _potentialResetCount:   'INTEGER DEFAULT 0',
            _qigongStage:           'INTEGER DEFAULT 1',
            _gemstoneSuitId:        'INTEGER DEFAULT 0',
            _linkTo:                "TEXT DEFAULT '[]'",
            _linkFrom:              "TEXT DEFAULT ''",
            _heroTag:               "TEXT DEFAULT ''",
            _resonanceType:         'INTEGER DEFAULT 0',      // ⚠️ BARU: resonance type
            _version:               "TEXT DEFAULT ''",         // ⚠️ BARU: hero version string
            _heroBaseAttrJson:      "TEXT DEFAULT '{}'",
            _superSkillLevelJson:   "TEXT DEFAULT '[]'",
            _potentialLevelJson:    "TEXT DEFAULT '[]'",
            _qigongJson:            "TEXT DEFAULT '{}'",
            _qigongTmpJson:         "TEXT DEFAULT '{}'",
            _qigongTmpPower:        'INTEGER DEFAULT 0',
            _totalCostJson:         "TEXT DEFAULT '{}'",
            _breakInfoJson:         "TEXT DEFAULT '{}'",
            _foreignKey:            '_userId REFERENCES user(_id)',
            _indexes:               ['idx_heros_user ON(_userId)']
        },
        totalProps: {
            _id:         'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:     'TEXT NOT NULL',
            _itemId:     'INTEGER NOT NULL',
            _num:        'INTEGER DEFAULT 0',
            _unique:     '_userId, _itemId',
            _foreignKey: '_userId REFERENCES user(_id)',
            _indexes:    ['idx_totalProps_user ON(_userId)']
        },
        equip: {
            _id:              'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:          'TEXT NOT NULL',
            _heroId:          'TEXT NOT NULL',
            _suitItemsJson:   "TEXT DEFAULT '[]'",
            _suitAttrsJson:   "TEXT DEFAULT '[]'",
            _equipAttrsJson:  "TEXT DEFAULT '[]'",
            _earringsJson:    "TEXT DEFAULT '{}'",
            _weaponState:     'INTEGER DEFAULT 0',
            _foreignKey:      '_userId REFERENCES user(_id)',
            _indexes:         ['idx_equip_user ON(_userId)']
        },
        weapon: {
            _id:                'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:            'TEXT NOT NULL',
            _weaponId:          "TEXT DEFAULT ''",
            _displayId:         'INTEGER DEFAULT 0',
            _heroId:            "TEXT DEFAULT ''",
            _star:              'INTEGER DEFAULT 0',
            _level:             'INTEGER DEFAULT 1',
            _haloId:            'INTEGER DEFAULT 0',
            _haloLevel:         'INTEGER DEFAULT 0',
            _attrsJson:         "TEXT DEFAULT '[]'",
            _strengthenCostJson:"TEXT DEFAULT '[]'",
            _haloCostJson:      "TEXT DEFAULT '[]'",
            _foreignKey:        '_userId REFERENCES user(_id)',
            _indexes:           ['idx_weapon_user ON(_userId)']
        },
        imprint: {
            _id:              'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:          'TEXT NOT NULL',
            _signId:          "TEXT DEFAULT ''",
            _displayId:       'INTEGER DEFAULT 0',
            _heroId:          "TEXT DEFAULT ''",
            _level:           'INTEGER DEFAULT 1',
            _star:            'INTEGER DEFAULT 0',
            _mainAttrJson:    "TEXT DEFAULT '{}'",
            _starAttrJson:    "TEXT DEFAULT '{}'",
            _viceAttrJson:    "TEXT DEFAULT '[]'",
            _addAttrJson:     "TEXT DEFAULT '{}'",
            _tmpViceAttrJson: "TEXT DEFAULT '[]'",
            _totalCostJson:   "TEXT DEFAULT '[]'",
            _foreignKey:      '_userId REFERENCES user(_id)',
            _indexes:         ['idx_imprint_user ON(_userId)']
        },
        genki: {
            _id:                  'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:              'TEXT NOT NULL',
            _genkiId:             "TEXT DEFAULT ''",
            _displayId:           'INTEGER DEFAULT 0',
            _heroId:              "TEXT DEFAULT ''",
            _heroPos:             'INTEGER DEFAULT 0',
            _disable:             'INTEGER DEFAULT 0',
            _mainAttrJson:        "TEXT DEFAULT '{}'",
            _viceAttrJson:        "TEXT DEFAULT '{}'",
            _curSmeltNormalExp:   'INTEGER DEFAULT 0',
            _curSmeltSuperExp:    'INTEGER DEFAULT 0',
            _foreignKey:          '_userId REFERENCES user(_id)',
            _indexes:             ['idx_genki_user ON(_userId)']
        },
        gemstone: {
            _id:          'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:      'TEXT NOT NULL',
            _gemstoneId:  "TEXT DEFAULT ''",
            _displayId:   'INTEGER DEFAULT 0',
            _heroId:      "TEXT DEFAULT ''",
            _level:       'INTEGER DEFAULT 1',
            _totalExp:    'INTEGER DEFAULT 0',
            _version:     "TEXT DEFAULT ''",
            _foreignKey:  '_userId REFERENCES user(_id)',
            _indexes:     ['idx_gemstone_user ON(_userId)']
        },
        dungeon: {
            _id:            'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:        'TEXT NOT NULL',
            _type:          'INTEGER DEFAULT 0',
            _curMaxLevel:   'INTEGER DEFAULT 0',
            _lastLevel:     'INTEGER DEFAULT 0',
            _foreignKey:    '_userId REFERENCES user(_id)',
            _indexes:       ['idx_dungeon_user ON(_userId)']
        },
        superSkill: {
            _id:            'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:        'TEXT NOT NULL',
            _skillId:       'INTEGER DEFAULT 0',
            _level:         'INTEGER DEFAULT 0',
            _needEvolve:    'INTEGER DEFAULT 0',
            _totalCostJson: "TEXT DEFAULT '{}'",
            _foreignKey:    '_userId REFERENCES user(_id)',
            _indexes:       ['idx_superSkill_user ON(_userId)']
        },
        heroSkin: {
            _id:          'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:      'TEXT NOT NULL',
            _heroDisplayId: 'INTEGER DEFAULT 0',
            _skinsJson:   "TEXT DEFAULT '[]'",
            _curSkinId:   'INTEGER DEFAULT 0',
            _foreignKey:  '_userId REFERENCES user(_id)',
            _indexes:     ['idx_heroSkin_user ON(_userId)']
        },
        teamTraining: {
            _id:        'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:    'TEXT NOT NULL',
            _trainId:   "TEXT DEFAULT ''",
            _levelsJson:"TEXT DEFAULT '{}'",
            _unlock:    'INTEGER DEFAULT 0',
            _version:   "TEXT DEFAULT ''",
            _foreignKey:'_userId REFERENCES user(_id)',
            _indexes:   ['idx_teamTraining_user ON(_userId)']
        },
        lastTeam: {
            _id:                'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:            'TEXT NOT NULL',
            _teamType:          'INTEGER DEFAULT 0',
            _teamJson:          "TEXT DEFAULT '[]'",
            _superSkillJson:    "TEXT DEFAULT '[]'",
            _foreignKey:        '_userId REFERENCES user(_id)',
            _indexes:           ['idx_lastTeam_user ON(_userId)']
        },
        arenaTeam: {
            _id:        'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:    'TEXT NOT NULL',
            _slot:      'INTEGER DEFAULT 0',
            _heroId:    "TEXT DEFAULT ''",
            _foreignKey:'_userId REFERENCES user(_id)',
            _indexes:   ['idx_arenaTeam_user ON(_userId)']
        },
        arenaSuper: {
            _id:        'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:    'TEXT NOT NULL',
            _heroId:    "TEXT DEFAULT ''",
            _foreignKey:'_userId REFERENCES user(_id)',
            _indexes:   ['idx_arenaSuper_user ON(_userId)']
        },
        checkin: {
            _id:              'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:          'TEXT NOT NULL',
            _checkinId:       "TEXT DEFAULT ''",
            _activeItemJson:  "TEXT DEFAULT '[]'",
            _curCycle:        'INTEGER DEFAULT 1',
            _maxActiveDay:    'INTEGER DEFAULT 0',
            _lastActiveDate:  'INTEGER DEFAULT 0',
            _foreignKey:      '_userId REFERENCES user(_id)',
            _indexes:         ['idx_checkin_user ON(_userId)']
        },
        monthCard: {
            _id:          'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:      'TEXT NOT NULL',
            _cardId:      'INTEGER DEFAULT 0',
            _endTime:     'INTEGER DEFAULT 0',
            _foreignKey:  '_userId REFERENCES user(_id)',
            _indexes:     ['idx_monthCard_user ON(_userId)']
        },
        recharge: {
            _id:              'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:          'TEXT NOT NULL',
            _rechargeId:      "TEXT DEFAULT ''",
            _haveBoughtJson:  "TEXT DEFAULT '{}'",
            _foreignKey:      '_userId REFERENCES user(_id)',
            _indexes:         ['idx_recharge_user ON(_userId)']
        },
        expedition: {
            _id:                  'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:              'TEXT NOT NULL',
            _expeditionId:        "TEXT DEFAULT ''",
            _passLessonJson:      "TEXT DEFAULT '{}'",
            _machinesJson:        "TEXT DEFAULT '{}'",
            _collectionJson:      "TEXT DEFAULT '[]'",
            _teamsJson:           "TEXT DEFAULT '{}'",
            _times:               'INTEGER DEFAULT 0',
            _timesStartRecover:   'INTEGER DEFAULT 0',
            _foreignKey:          '_userId REFERENCES user(_id)',
            _indexes:             ['idx_expedition_user ON(_userId)']
        },
        timeTrial: {
            _id:                  'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:              'TEXT NOT NULL',
            _timeTrialId:         "TEXT DEFAULT ''",
            _levelStarsJson:      "TEXT DEFAULT '{}'",
            _level:               'INTEGER DEFAULT 1',
            _gotStarRewardJson:   "TEXT DEFAULT '{}'",
            _haveTimes:           'INTEGER DEFAULT 0',
            _timesStartRecover:   'INTEGER DEFAULT 0',
            _lastRefreshTime:     'INTEGER DEFAULT 0',
            _startTime:           'INTEGER DEFAULT 0',
            _foreignKey:          '_userId REFERENCES user(_id)',
            _indexes:             ['idx_timeTrial_user ON(_userId)']
        },
        retrieve: {
            _id:                      'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:                  'TEXT NOT NULL',
            _retrieveId:              "TEXT DEFAULT ''",
            _finishDungeonsJson:      "TEXT DEFAULT '{}'",
            _calHangupTime:           'INTEGER DEFAULT 0',
            _retrieveHangupRewardJson:"TEXT DEFAULT '{}'",
            _retrieveHangupTime:      'INTEGER DEFAULT 0',
            _retrieveDungeonsJson:    "TEXT DEFAULT '{}'",
            _finishTime:              'INTEGER DEFAULT 0',
            _foreignKey:              '_userId REFERENCES user(_id)',
            _indexes:                 ['idx_retrieve_user ON(_userId)']
        },
        battleMedal: {
            _id:              'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:          'TEXT NOT NULL',
            _battleMedalId:   "TEXT DEFAULT ''",
            _cycle:           'INTEGER DEFAULT 0',
            _nextRefreshTime: 'INTEGER DEFAULT 0',
            _level:           'INTEGER DEFAULT 0',
            _curExp:          'INTEGER DEFAULT 0',
            _openSuper:       'INTEGER DEFAULT 0',
            _buyLevelCount:   'INTEGER DEFAULT 0',
            _taskJson:        "TEXT DEFAULT '{}'",
            _levelRewardJson: "TEXT DEFAULT '{}'",
            _shopBuyTimesJson:"TEXT DEFAULT '{}'",
            _foreignKey:      '_userId REFERENCES user(_id)',
            _indexes:         ['idx_battleMedal_user ON(_userId)']
        },
        gravity: {
            _id:                'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:            'TEXT NOT NULL',
            _gravityId:         "TEXT DEFAULT ''",
            _haveTimes:         'INTEGER DEFAULT 0',
            _timesStartRecover: 'INTEGER DEFAULT 0',
            _lastLess:          'INTEGER DEFAULT 0',
            _lastTime:          'INTEGER DEFAULT 0',
            _foreignKey:        '_userId REFERENCES user(_id)',
            _indexes:           ['idx_gravity_user ON(_userId)']
        },
        resonance: {
            _id:              'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:          'TEXT NOT NULL',
            _resonanceId:     "TEXT DEFAULT ''",
            _diamondCabin:    'INTEGER DEFAULT 0',
            _cabinsJson:      "TEXT DEFAULT '{}'",
            _buySeatCount:    'INTEGER DEFAULT 0',
            _totalTalent:     'INTEGER DEFAULT 0',
            _unlockSpecial:   'INTEGER DEFAULT 0',
            _foreignKey:      '_userId REFERENCES user(_id)',
            _indexes:         ['idx_resonance_user ON(_userId)']
        },
        userGuild: {
            _id:                  'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:              'TEXT NOT NULL',
            _guildId:             "TEXT DEFAULT ''",
            _requestedGuildJson:  "TEXT DEFAULT '[]'",
            _satanGiftExp:        'INTEGER DEFAULT 0',
            _satanGiftLevel:      'INTEGER DEFAULT 1',
            _canRewardTimeJson:   "TEXT DEFAULT '{}'",
            _haveReadBulletin:    'INTEGER DEFAULT 0',
            _canJoinGuildTime:    'INTEGER DEFAULT 0',
            _createGuildCD:       'INTEGER DEFAULT 0',
            _ballWarJoin:         'INTEGER DEFAULT 0',
            _techJson:            "TEXT DEFAULT '{}'",
            _lastRefreshTime:     'INTEGER DEFAULT 0',      // ⚠️ BARU: for userGuildPub
            _foreignKey:          '_userId REFERENCES user(_id)',
            _indexes:             ['idx_userGuild_user ON(_userId)']
        },
        dragonEquiped: {
            _id:        'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:    'TEXT NOT NULL',
            _ballId:    'INTEGER DEFAULT 0',
            _foreignKey:'_userId REFERENCES user(_id)',
            _indexes:   ['idx_dragonEquiped_user ON(_userId)']
        },
        vipLog: {
            _id:        'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:    'TEXT NOT NULL',
            _displayId: 'INTEGER DEFAULT 0',
            _userName:  "TEXT DEFAULT ''",
            _foreignKey:'_userId REFERENCES user(_id)',
            _indexes:   ['idx_vipLog_user ON(_userId)']
        },
        cardLog: {
            _id:        'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:    'TEXT NOT NULL',
            _logUserId: "TEXT DEFAULT ''",
            _cardId:    'INTEGER DEFAULT 0',
            _userName:  "TEXT DEFAULT ''",
            _time:      'INTEGER DEFAULT 0',
            _foreignKey:'_userId REFERENCES user(_id)',
            _indexes:   ['idx_cardLog_user ON(_userId)']
        },
        forbiddenChat: {
            _id:            'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:        'TEXT NOT NULL',
            _targetUserId:  "TEXT DEFAULT ''",
            _finishTime:    'INTEGER DEFAULT 0',
            _foreignKey:    '_userId REFERENCES user(_id)',
            _indexes:       ['idx_forbiddenChat_user ON(_userId)']
        },
        channelSpecial: {
            _id:                  'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:              'TEXT NOT NULL',
            _show:                'INTEGER DEFAULT 0',
            _vip:                 'INTEGER DEFAULT 0',
            _bg:                  "TEXT DEFAULT ''",
            _icon:                "TEXT DEFAULT ''",
            _btn1Url:             "TEXT DEFAULT ''",
            _btn2Url:             "TEXT DEFAULT ''",
            _honghuUrl:           "TEXT DEFAULT ''",
            _honghuUrlStartTime:  'INTEGER DEFAULT 0',
            _honghuUrlEndTime:    'INTEGER DEFAULT 0',
            _weeklyRewardTag:     "TEXT DEFAULT ''",
            _hideHeroesJson:      "TEXT DEFAULT '[]'",
            _foreignKey:          '_userId REFERENCES user(_id)',
            _indexes:             ['idx_channelSpecial_user ON(_userId)']
        },
        fastTeam: {
            _id:              'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:          'TEXT NOT NULL',
            _teamKey:         "TEXT DEFAULT ''",
            _teamJson:        "TEXT DEFAULT '[]'",
            _superSkillJson:  "TEXT DEFAULT '[]'",
            _name:            "TEXT DEFAULT ''",
            _foreignKey:      '_userId REFERENCES user(_id)',
            _indexes:         ['idx_fastTeam_user ON(_userId)']
        },
        blacklist: {
            _id:            'INTEGER PRIMARY KEY AUTOINCREMENT',
            _userId:        'TEXT NOT NULL',
            _targetUserId:  "TEXT DEFAULT ''",
            _foreignKey:    '_userId REFERENCES user(_id)',
            _indexes:       ['idx_blacklist_user ON(_userId)']
        }
    },

    // ─────────────────────────────────────────────────────────────
    // EXECUTE — handler logic utama
    // ─────────────────────────────────────────────────────────────
    execute: async (request, socket, ctx) => {
        const { db, jsonLoader, responseBuilder, config, socketStates, userSockets } = ctx;
        const { buildError, buildSuccess } = responseBuilder;
        const { userId, loginToken, serverId, language } = request;

        // ─── 1. VALIDASI ───
        if (!userId) return buildError(8);

        // ─── 2. CHECK / CREATE USER ───
        let user = db.user.get(userId);
        let isNewUser = false;
        const now = Date.now();

        if (!user) {
            isNewUser = true;
            const constant = jsonLoader.get('constant');
            const c = constant && constant['1'] ? constant['1'] : {};
            const startHeroDisplayId = parseInt(c.startHero) || 1205;
            const startHeroLevel = parseInt(c.startHeroLevel) || 3;

            // ── Default currency items untuk user._attribute ──
            const defaultAttributeItems = {};
            defaultAttributeItems['101'] = { _id: 101, _num: 0 };   // DIAMONDID
            defaultAttributeItems['102'] = { _id: 102, _num: 0 };   // GOLDID
            defaultAttributeItems['103'] = { _id: 103, _num: 0 };   // PLAYEREXPERIENCEID
            defaultAttributeItems['104'] = { _id: 104, _num: 1 };   // PLAYERLEVELID
            defaultAttributeItems['105'] = { _id: 105, _num: 0 };   // PLAYERVIPEXPERIENCEID
            defaultAttributeItems['106'] = { _id: 106, _num: 0 };   // PLAYERVIPLEVELID
            defaultAttributeItems['111'] = { _id: 111, _num: 0 };   // extra currency
            defaultAttributeItems['112'] = { _id: 112, _num: 0 };
            defaultAttributeItems['113'] = { _id: 113, _num: 0 };
            defaultAttributeItems['114'] = { _id: 114, _num: 0 };

            // ── Build hangup JSON — sesuai HAR ──
            const hangupData = {
                _id: userId,
                _lastGainTime: now,
                _waitGain: { _items: {} },
                _waitRand: { _items: {} },
                _actReward: { _items: {} },
                _curLess: parseInt(c.startLesson) || 10101,
                _maxPassLesson: 0,
                _passLessonTime: now,
                _maxPassChapter: 0,    // ⚠️ 0 untuk user baru (HAR: 0)
                _lastNormalGainTime: now,
                _lastRandGainTime: now,
                _haveGotChapterReward: {},
                _firstGain: false,
                _clickGlobalWarBuffTag: '',
                _buyFund: false,
                _haveGotFundReward: {}
            };

            // ── Build summon JSON — sesuai HAR ──
            const summonData = {
                _id: userId,
                _energy: 10,
                _haveCommonGuide: true,
                _haveSuperGuide: true,
                _canCommonFreeTime: 0,
                _canSuperFreeTime: 0,
                _summonTimes: {},
                _logicInfo: { "1": { _summonSPCount: 0, _summonSPSubCount: 0, _noSPCount: 0, _noSSPCount: 0 } },
                _firstDiamond10: true,
                _wishList: [],
                _wishVersion: 0
            };

            // ── Build scheduleInfo JSON — sesuai HAR (54 sub-keys) ──
            const scheduleInfoData = {
                _id: userId,
                _refreshTime: now,
                _templeBuyCount: 0,
                _marketDiamondRefreshCount: 0,
                _vipMarketDiamondRefreshCount: 0,
                _arenaAttackTimes: 5,
                _arenaBuyTimesCount: 0,
                _arenaHaveJoinToday: false,
                _snakeResetTimes: 1,
                _snakeSweepCount: 0,
                _cellGameHaveGotReward: false,
                _cellGameHaveTimes: 1,
                _cellgameHaveSetHero: false,
                _strongEnemyTimes: 6,
                _strongEnemyBuyCount: 0,
                _mergeBossBuyCount: 0,
                _dungeonTimes: { '1': 2, '2': 2, '4': 2, '5': 2, '6': 2, '7': 2, '8': 2 },
                _dungeonBuyTimesCount: { '1': 0, '2': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0 },
                _karinBattleTimes: 10,
                _karinBuyBattleTimesCount: 0,
                _karinBuyFeetCount: 0,
                _entrustResetTimes: 1,
                _dragonExchangeSSPoolId: 1,
                _dragonExchangeSSSPoolId: 1,
                _teamDugeonUsedRobots: [],
                _timeTrialBuyTimesCount: 0,
                _monthCardHaveGotReward: {},
                _goldBuyCount: 1,
                _likeRank: {},
                _giveHearts: [],
                _getHearts: [],
                _mahaAttackTimes: 10,
                _mahaBuyTimesCount: 0,
                _mineResetTimes: 3,
                _mineBuyResetTimesCount: 0,
                _mineBuyStepCount: 0,
                _guildBossTimes: 2,
                _guildBossTimesBuyCount: 0,
                _treasureTimes: 3,
                _guildCheckInType: 0,
                _clickTimeGift: false,
                _trainingBuyCount: 0,
                _commentedHeroes: {},
                _bossCptTimes: 3,
                _bossCptBuyCount: 0,
                _ballWarBuyCount: 0,
                _expeditionEvents: {},
                _clickExpedition: false,
                _expeditionSpeedUpCost: 0,
                _templeDailyReward: false,
                _templeYesterdayLess: 0,
                _topBattleTimes: 5,
                _topBattleBuyCount: 0,
                _keyItemCount: {},
                _gravityTrialBuyTimesCount: 0,
                _hadBuytimes: 0,
                _costMaterialCount: 0
            };

            // ── Build giftInfo JSON — sesuai HAR ──
            const giftInfoData = {
                _id: userId,
                _isBuyFund: false,
                _levelGiftCount: {},
                _levelBuyGift: {},
                _fundGiftCount: {},
                _fristRecharge: { _canGetReward: false, _haveGotReward: false },
                _haveGotVipRewrd: {},
                _buyVipGiftCount: {},
                _onlineGift: { _curId: 0, _nextTime: now + 200000 },
                _gotChannelWeeklyRewardTag: '',
                _clickHonghuUrlTime: 0,
                _gotBSAddToHomeReward: false
            };

            // ── Build timesInfo JSON — sesuai HAR ──
            const timesInfoData = {
                templeTimes: 10,
                templeTimesRecover: 0,
                mineSteps: 0,
                mineStepsRecover: 0,
                karinFeet: 5,
                karinFeetRecover: 0,
                mahaTimes: 0,
                mahaTimesRecover: 0,
                marketRefreshTimes: 0,
                marketRefreshTimesRecover: 0,
                vipMarketRefreshTimes: 0,
                vipMarketRefreshTimesRecover: 0
            };

            // ── Build guild tech data — sesuai HAR ──
            const guildTechData = buildDefaultGuildTech();

            db.user.create({
                _id: userId,
                _nickName: 'New User' + userId.substring(0, 4),
                _headImage: 'hero_icon_' + startHeroDisplayId,    // ⚠️ STRING!
                _account: userId,
                _channelId: 'BSNative',
                _pwd: '1111',
                _privilege: 0,
                _attributeJson: JSON.stringify({ _items: defaultAttributeItems }),
                _createTime: now,
                _lastLoginTime: now,
                _offlineTime: now,
                _levelChangeTime: now,
                _vipLevelVersion: '201912301726',
                _os: 'Android',
                _oldUserBackTime: 0,
                _channelParam: '{}',
                _oldName: '',
                _hangupJson: JSON.stringify(hangupData),
                _summonJson: JSON.stringify(summonData),
                _scheduleInfoJson: JSON.stringify(scheduleInfoData),
                _guideJson: JSON.stringify({ _id: userId, _steps: {} }),
                _clickSystemJson: JSON.stringify({ _id: userId, _clickSys: {} }),
                _giftInfoJson: JSON.stringify(giftInfoData),
                _timesInfoJson: JSON.stringify(timesInfoData),
                _miscJson: JSON.stringify({}),
                _backpackLevel: 1,
                _serverOpenDate: now,
                _newUser: 1
            });

            // ── Start hero — sesuai HAR structure ──
            const startHeroId = uuidv4();
            const startHeroBaseAttr = {
                _level: startHeroLevel,
                _evolveLevel: 0
                // ⚠️ Sparse! Hanya kirim non-zero attrs, sesuai HAR
            };
            const startHeroTotalCost = {
                _wakeUp: { _items: {} },
                _earring: { _items: {} },
                _levelUp: { _items: {} },
                _evolve: { _items: {} },
                _skill: { _items: {} },
                _qigong: { _items: {} },
                _heroBreak: { _items: {} }
            };

            db.heros.create({
                _userId: userId,
                _heroId: startHeroId,
                _heroDisplayId: startHeroDisplayId,
                _heroStar: 0,
                _qigongStage: 1,
                _resonanceType: 0,
                _version: '202010131125',
                _heroBaseAttrJson: JSON.stringify(startHeroBaseAttr),
                _superSkillLevelJson: JSON.stringify(0),         // ⚠️ NUMBER 0, bukan array!
                _potentialLevelJson: JSON.stringify({}),          // ⚠️ OBJECT {}, bukan array!
                _qigongJson: JSON.stringify({ _items: {} }),
                _qigongTmpJson: JSON.stringify({ _items: {} }),
                _qigongTmpPower: 0,
                _totalCostJson: JSON.stringify(startHeroTotalCost),
                _breakInfoJson: JSON.stringify({ _breakLevel: 1, _level: 0, _attr: { _items: {} }, _version: '' })
            });

            // ── Default items ──
            db.totalProps.createBatch([
                { _userId: userId, _itemId: 101, _num: 0 },   // DIAMONDID
                { _userId: userId, _itemId: 102, _num: 0 },   // GOLDID
                { _userId: userId, _itemId: 103, _num: 0 },   // PLAYEREXPERIENCEID
                { _userId: userId, _itemId: 104, _num: 1 },   // PLAYERLEVELID
                { _userId: userId, _itemId: 105, _num: 0 },   // PLAYERVIPEXPERIENCEID
                { _userId: userId, _itemId: 106, _num: 0 },   // PLAYERVIPLEVELID
                { _userId: userId, _itemId: 111, _num: 0 },
                { _userId: userId, _itemId: 112, _num: 0 },
                { _userId: userId, _itemId: 113, _num: 0 },
                { _userId: userId, _itemId: 114, _num: 0 }
            ]);

            user = db.user.get(userId);
        }

        // ─── 3. UPDATE LOGIN ───
        const prevLoginTime = user._lastLoginTime || now;
        db.user.update(userId, { _lastLoginTime: now, _offlineTime: prevLoginTime });

        // ─── 4. KICK DUPLICATE LOGIN ───
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
        const state = socketStates.get(socket.id);
        if (state) state.userId = userId;
        userSockets.set(userId, socket.id);

        // Re-read user setelah update
        user = db.user.get(userId);

        // ─── 5. GATHER ALL USER DATA ───
        const heros       = db.heros.getByUser(userId) || [];
        const items       = db.totalProps.getByUser(userId) || [];
        const equips      = db.equip.getByUser(userId) || [];
        const weapons     = db.weapon.getByUser(userId) || [];
        const imprints    = db.imprint.getByUser(userId) || [];
        const genkis      = db.genki.getByUser(userId) || [];
        const gemstones   = db.gemstone.getByUser(userId) || [];
        const dungeons    = db.dungeon.getByUser(userId) || [];
        const superSkills = db.superSkill.getByUser(userId) || [];
        const heroSkins   = db.heroSkin.getByUser(userId) || [];
        const teamTrainings = db.teamTraining.getByUser(userId) || [];
        const lastTeams   = db.lastTeam.getByUser(userId) || [];
        const arenaTeamRows = db.arenaTeam.getByUser(userId) || [];
        const arenaSuperRows = db.arenaSuper.getByUser(userId) || [];
        const checkins    = db.checkin.getByUser(userId) || [];
        const monthCards  = db.monthCard.getByUser(userId) || [];
        const recharges   = db.recharge.getByUser(userId) || [];
        const expeditions = db.expedition.getByUser(userId) || [];
        const timeTrials  = db.timeTrial.getByUser(userId) || [];
        const retrieves   = db.retrieve.getByUser(userId) || [];
        const battleMedals = db.battleMedal.getByUser(userId) || [];
        const gravities   = db.gravity.getByUser(userId) || [];
        const resonances  = db.resonance.getByUser(userId) || [];
        const userGuilds  = db.userGuild.getByUser(userId) || [];
        const dragonBalls = db.dragonEquiped.getByUser(userId) || [];
        const vipLogs     = db.vipLog.getByUser(userId) || [];
        const cardLogs    = db.cardLog.getByUser(userId) || [];
        const forbiddenChats = db.forbiddenChat.getByUser(userId) || [];
        const channelSpecials = db.channelSpecial.getByUser(userId) || [];
        const fastTeams   = db.fastTeam.getByUser(userId) || [];
        const blacklists  = db.blacklist.getByUser(userId) || [];

        // Parse JSON fields
        const hangup       = safeParse(user._hangupJson);
        const summon       = safeParse(user._summonJson);
        const scheduleInfo = safeParse(user._scheduleInfoJson);
        const guide        = safeParse(user._guideJson);
        const clickSystem  = safeParse(user._clickSystemJson);
        const giftInfo     = safeParse(user._giftInfoJson);
        const timesInfo    = safeParse(user._timesInfoJson);
        const miscJson     = safeParse(user._miscJson);

        // ═══════════════════════════════════════════════════════════
        // 6. BUILD RESPONSE — SESUAI HAR REAL SERVER RESPONSE
        // ═══════════════════════════════════════════════════════════

        // ──────────────────────────────────────────
        // #1 currency — ⚠️ HAR: "USD" BUKAN "IDR"!
        // ──────────────────────────────────────────
        const currency = 'USD';

        // ──────────────────────────────────────────
        // #2 user — sesuai HAR (20 fields)
        // ──────────────────────────────────────────
        const userAttribute = safeParse(user._attributeJson, { _items: {} });
        const userObj = {
            _id: user._id,
            _nickName: user._nickName || '',
            _oldName: user._oldName || '',
            _headImage: user._headImage || 'hero_icon_1205',   // ⚠️ STRING!
            _account: user._account || userId,
            _channelId: user._channelId || 'BSNative',
            _pwd: user._pwd || '1111',
            _privilege: user._privilege || 0,
            _attribute: userAttribute,
            _lastLoginTime: user._lastLoginTime || 0,
            _offlineTime: user._offlineTime || 0,
            _nickChangeTimes: user._nickChangeTimes || 0,
            _levelChangeTime: user._levelChangeTime || 0,
            _createTime: user._createTime || 0,
            _oriServerId: user._oriServerId || serverId || 1,
            _vipLevelVersion: user._vipLevelVersion || '201912301726',
            _os: user._os || 'Android',
            _bulletinVersions: safeParse(user._bulletinVersions, {}),
            _oldUserBackTime: user._oldUserBackTime || 0,
            _channelParam: safeParse(user._channelParam, {})
        };

        // ──────────────────────────────────────────
        // #3 heros — ⚠️ DICT (keyed by heroId UUID), BUKAN array!
        // HAR: { _id, _heros: { heroId: heroObj }, _maxPower, _maxPowerChangeTime }
        // ──────────────────────────────────────────
        const herosDict = {};
        let maxPower = 0;
        heros.forEach(h => {
            const heroBaseAttr = safeParse(h._heroBaseAttrJson, {});
            const heroObj = {
                _heroId: h._heroId || '',
                _heroDisplayId: h._heroDisplayId || 0,
                _heroBaseAttr: heroBaseAttr,
                _heroStar: h._heroStar || 0,
                _superSkillLevel: safeParse(h._superSkillLevelJson, 0),    // ⚠️ bisa NUMBER 0!
                _potentialLevel: safeParse(h._potentialLevelJson, {}),      // ⚠️ bisa OBJECT {}!
                _superSkillResetCount: h._superSkillResetCount || 0,
                _potentialResetCount: h._potentialResetCount || 0,
                _qigong: safeParse(h._qigongJson, { _items: {} }),          // ⚠️ { _items: {} }
                _qigongTmp: safeParse(h._qigongTmpJson, { _items: {} }),    // ⚠️ { _items: {} }
                _qigongTmpPower: h._qigongTmpPower || 0,
                _qigongStage: h._qigongStage || 1,
                _breakInfo: safeParse(h._breakInfoJson, { _breakLevel: 1, _level: 0, _attr: { _items: {} }, _version: '' }),
                _totalCost: safeParse(h._totalCostJson, {
                    _wakeUp: { _items: {} }, _earring: { _items: {} }, _levelUp: { _items: {} },
                    _evolve: { _items: {} }, _skill: { _items: {} }, _qigong: { _items: {} }, _heroBreak: { _items: {} }
                }),
                _expeditionMaxLevel: h._expeditionMaxLevel || 0,
                _gemstoneSuitId: h._gemstoneSuitId || 0,
                _linkTo: safeParse(h._linkTo, []),
                _linkFrom: h._linkFrom || '',
                _resonanceType: h._resonanceType || 0,       // ⚠️ BARU
                _version: h._version || '202010131125'        // ⚠️ BARU
            };
            herosDict[h._heroId] = heroObj;
        });

        const herosObj = {
            _id: userId,
            _heros: herosDict,         // ⚠️ DICT, BUKAN array!
            _maxPower: maxPower,
            _maxPowerChangeTime: now
        };

        // ──────────────────────────────────────────
        // #4 hangup — sesuai HAR
        // ──────────────────────────────────────────
        const hangupObj = {
            _id: userId,
            _lastGainTime: hangup._lastGainTime || now,
            _waitGain: hangup._waitGain || { _items: {} },
            _waitRand: hangup._waitRand || { _items: {} },
            _actReward: hangup._actReward || { _items: {} },
            _curLess: hangup._curLess || 10101,
            _maxPassLesson: hangup._maxPassLesson || 0,
            _passLessonTime: hangup._passLessonTime || now,
            _maxPassChapter: hangup._maxPassChapter || 0,
            _lastNormalGainTime: hangup._lastNormalGainTime || now,
            _lastRandGainTime: hangup._lastRandGainTime || now,
            _haveGotChapterReward: hangup._haveGotChapterReward || {},
            _firstGain: hangup._firstGain || false,
            _clickGlobalWarBuffTag: hangup._clickGlobalWarBuffTag || '',
            _buyFund: hangup._buyFund || false,
            _haveGotFundReward: hangup._haveGotFundReward || {}
        };

        // ──────────────────────────────────────────
        // #5 totalProps — sesuai HAR
        // ──────────────────────────────────────────
        const itemsDict = {};
        items.forEach((item) => {
            itemsDict[String(item._itemId)] = { _id: item._itemId, _num: item._num };
        });

        // ──────────────────────────────────────────
        // #6 imprint — sesuai HAR: { _id, _items: [] }
        // ──────────────────────────────────────────
        const imprintItemsDict = {};
        imprints.forEach(imp => {
            imprintItemsDict[imp._signId] = {
                _id: imp._signId || '',
                _displayId: imp._displayId || 0,
                _heroId: imp._heroId || '',
                _level: imp._level || 1,
                _star: imp._star || 0,
                _mainAttr: safeParse(imp._mainAttrJson, { _items: [] }),
                _starAttr: safeParse(imp._starAttrJson, { _items: [] }),
                _viceAttr: safeParse(imp._viceAttrJson, []),
                _addAttr: safeParse(imp._addAttrJson, {}),
                _tmpViceAttr: safeParse(imp._tmpViceAttrJson, []),
                _totalCost: { _items: safeParse(imp._totalCostJson, []) }
            };
        });

        // ──────────────────────────────────────────
        // #7 equip — sesuai HAR: { _id, _suits: { heroId: suitObj } }
        // ──────────────────────────────────────────
        const equipSuits = {};
        equips.forEach(eq => {
            equipSuits[String(eq._heroId)] = {
                _suitItems: safeParse(eq._suitItemsJson, []),
                _earrings: safeParse(eq._earringsJson, { _id: 0, _level: 0, _attrs: { _items: {} }, _version: '' }),
                _suitAttrs: safeParse(eq._suitAttrsJson, []),
                _equipAttrs: safeParse(eq._equipAttrsJson, []),
                _weaponState: eq._weaponState || 0
            };
        });

        // ──────────────────────────────────────────
        // #8 weapon — sesuai HAR: { _id, _items: [] }
        // ──────────────────────────────────────────
        const weaponItemsDict = {};
        weapons.forEach(w => {
            weaponItemsDict[w._weaponId] = {
                _weaponId: w._weaponId || '',
                _displayId: w._displayId || 0,
                _heroId: w._heroId || '',
                _star: w._star || 0,
                _level: w._level || 1,
                _attrs: { _items: safeParse(w._attrsJson, []) },
                _strengthenCost: { _items: safeParse(w._strengthenCostJson, []) },
                _haloId: w._haloId || 0,
                _haloLevel: w._haloLevel || 0,
                _haloCost: { _items: safeParse(w._haloCostJson, []) }
            };
        });

        // ──────────────────────────────────────────
        // #9 summon — sesuai HAR
        // ──────────────────────────────────────────
        const summonObj = {
            _id: userId,
            _energy: summon._energy || 10,
            _haveCommonGuide: summon._haveCommonGuide !== undefined ? summon._haveCommonGuide : true,
            _haveSuperGuide: summon._haveSuperGuide !== undefined ? summon._haveSuperGuide : true,
            _canCommonFreeTime: summon._canCommonFreeTime || 0,
            _canSuperFreeTime: summon._canSuperFreeTime || 0,
            _summonTimes: summon._summonTimes || {},
            _logicInfo: summon._logicInfo || { "1": { _summonSPCount: 0, _summonSPSubCount: 0, _noSPCount: 0, _noSSPCount: 0 } },
            _firstDiamond10: summon._firstDiamond10 !== undefined ? summon._firstDiamond10 : true,
            _wishList: summon._wishList || [],
            _wishVersion: summon._wishVersion || 0
        };

        // ──────────────────────────────────────────
        // #10 dungeon — sesuai HAR: { _id, _dungeons: { type: obj } }
        // ──────────────────────────────────────────
        const dungeonDict = {};
        dungeons.forEach(d => {
            dungeonDict[String(d._type)] = {
                _type: d._type || 0,
                _lastLevel: d._lastLevel || 0,
                _curMaxLevel: d._curMaxLevel || 0
            };
        });

        // ──────────────────────────────────────────
        // #11 userGuild + userGuildPub — sesuai HAR
        // ──────────────────────────────────────────
        let userGuildData = {};
        let userGuildPubData = {};
        if (userGuilds.length > 0) {
            const ug = userGuilds[0];
            const techData = safeParse(ug._techJson, buildDefaultGuildTech());
            userGuildData = {
                _id: userId,
                _satanGift: {
                    _exp: ug._satanGiftExp || 0,
                    _level: ug._satanGiftLevel || 1,
                    _canRewardTime: safeParse(ug._canRewardTimeJson, {})
                },
                _tech: techData
            };
            userGuildPubData = {
                _id: userId,
                _guildId: ug._guildId || '',
                _haveReadBulletin: ug._haveReadBulletin ? true : false,
                _requestedGuild: safeParse(ug._requestedGuildJson, []),
                _canJoinGuildTime: ug._canJoinGuildTime || 0,
                _createGuildCD: ug._createGuildCD ? true : false,
                _ballWarJoin: ug._ballWarJoin ? true : false,
                _lastRefreshTime: ug._lastRefreshTime || now
            };
        } else {
            // ⚠️ HAR: userGuild dan userGuildPub SELALU dikirim, bahkan untuk user tanpa guild!
            userGuildData = {
                _id: userId,
                _satanGift: { _exp: 0, _level: 1, _canRewardTime: {} },
                _tech: buildDefaultGuildTech()
            };
            userGuildPubData = {
                _id: userId,
                _guildId: '',
                _haveReadBulletin: false,
                _requestedGuild: [],
                _canJoinGuildTime: 0,
                _createGuildCD: false,
                _ballWarJoin: false,
                _lastRefreshTime: now
            };
        }

        // ──────────────────────────────────────────
        // #12 giftInfo — sesuai HAR
        // ──────────────────────────────────────────
        if (giftInfo) {
            if (!giftInfo._fristRecharge) giftInfo._fristRecharge = { _canGetReward: false, _haveGotReward: false };
            if (giftInfo._fristRecharge._canGetReward === undefined) giftInfo._fristRecharge._canGetReward = false;
            if (giftInfo._fristRecharge._haveGotReward === undefined) giftInfo._fristRecharge._haveGotReward = false;
            if (!giftInfo._haveGotVipRewrd) giftInfo._haveGotVipRewrd = {};
            if (!giftInfo._buyVipGiftCount) giftInfo._buyVipGiftCount = {};
            if (!giftInfo._onlineGift) giftInfo._onlineGift = { _curId: 0, _nextTime: now + 200000 };
            if (giftInfo._gotBSAddToHomeReward === undefined) giftInfo._gotBSAddToHomeReward = false;
            if (!giftInfo._clickHonghuUrlTime) giftInfo._clickHonghuUrlTime = 0;
            if (!giftInfo._gotChannelWeeklyRewardTag) giftInfo._gotChannelWeeklyRewardTag = '';
            if (!giftInfo._isBuyFund) giftInfo._isBuyFund = false;
            if (!giftInfo._levelGiftCount) giftInfo._levelGiftCount = {};
            if (!giftInfo._fundGiftCount) giftInfo._fundGiftCount = {};
        }

        // ──────────────────────────────────────────
        // #13 superSkill — sesuai HAR: { _id, _skills: { skillId: obj } }
        // ──────────────────────────────────────────
        const superSkillDict = {};
        superSkills.forEach(ss => {
            if (ss._level > 0) {
                superSkillDict[String(ss._skillId)] = {
                    _skillId: ss._skillId,
                    _level: ss._level,
                    _needEvolve: ss._needEvolve ? true : false,
                    _totalCost: safeParse(ss._totalCostJson, { _items: {} })    // ⚠️ { _items: {} } BUKAN {}!
                };
            }
        });

        // ──────────────────────────────────────────
        // #14 heroSkin — sesuai HAR: { _id, _skins: {}, _curSkin: {} }
        // ──────────────────────────────────────────
        const heroSkinSkins = {};
        const heroSkinCurSkin = {};
        heroSkins.forEach(hs => {
            heroSkinSkins[String(hs._heroDisplayId)] = safeParse(hs._skinsJson, []);
            heroSkinCurSkin[String(hs._heroDisplayId)] = { _id: hs._curSkinId || 0 };
        });

        // ──────────────────────────────────────────
        // #15 _arenaTeam — ⚠️ HAR: {} (dict by heroId), BUKAN array!
        // ──────────────────────────────────────────
        const arenaTeamDict = {};
        arenaTeamRows.forEach(at => {
            if (at._heroId) {
                arenaTeamDict[at._heroId] = { _id: at._heroId };
            }
        });

        // ──────────────────────────────────────────
        // #16 _arenaSuper — HAR: [] (flat array of heroId strings)
        // ──────────────────────────────────────────
        const arenaSuperArray = arenaSuperRows.map(as => as._heroId || '').filter(id => id);

        // ──────────────────────────────────────────
        // #17 lastTeam — sesuai HAR: { _id, _lastTeamInfo: { type: { _team: {}, _superSkill: [] } } }
        // ⚠️ _team = DICT keyed by position string, BUKAN array!
        // ──────────────────────────────────────────
        const lastTeamInfo = {};
        lastTeams.forEach(lt => {
            const teamDict = {};
            const teamArray = safeParse(lt._teamJson, []);
            if (Array.isArray(teamArray)) {
                teamArray.forEach((member, idx) => {
                    teamDict[String(idx)] = { _heroId: member._heroId || '', _position: member._position || idx };
                });
            } else if (typeof teamArray === 'object') {
                // Sudah dalam format dict
                Object.assign(teamDict, teamArray);
            }
            lastTeamInfo[String(lt._teamType)] = {
                _team: teamDict,
                _superSkill: safeParse(lt._superSkillJson, [])
            };
        });

        // ──────────────────────────────────────────
        // #18 channelSpecial — sesuai HAR: SELALU dikirim dengan semua sub-field
        // ──────────────────────────────────────────
        let channelSpecialData = {
            _id: '',
            _show: false,
            _icon: '',
            _bg: '',
            _btn1Url: '',
            _btn2Url: '',
            _vip: 0,
            _hideHeroes: [],
            _weeklyReward: { _items: {} },
            _weeklyRewardTag: '',
            _honghuUrl: '',
            _honghuUrlStartTime: 0,
            _honghuUrlEndTime: 0,
            _bsAddToHomeIcon: '',
            _bsAddToHomeReward: { _items: {} }
        };
        if (channelSpecials.length > 0) {
            const cs = channelSpecials[0];
            channelSpecialData = {
                _id: '',
                _show: cs._show ? true : false,
                _icon: cs._icon || '',
                _bg: cs._bg || '',
                _btn1Url: cs._btn1Url || '',
                _btn2Url: cs._btn2Url || '',
                _vip: cs._vip || 0,
                _hideHeroes: safeParse(cs._hideHeroesJson, []),
                _weeklyReward: { _items: {} },
                _weeklyRewardTag: cs._weeklyRewardTag || '',
                _honghuUrl: cs._honghuUrl || '',
                _honghuUrlStartTime: cs._honghuUrlStartTime || 0,
                _honghuUrlEndTime: cs._honghuUrlEndTime || 0,
                _bsAddToHomeIcon: '',
                _bsAddToHomeReward: { _items: {} }
            };
        }

        // ──────────────────────────────────────────
        // #19 monthCard — sesuai HAR
        // ──────────────────────────────────────────
        let monthCardData = {};
        if (monthCards.length > 0) {
            const card = {};
            monthCards.forEach(mc => { card[String(mc._cardId)] = { _endTime: mc._endTime || 0 }; });
            monthCardData = { _id: 'monthCard_' + userId, _card: card };
        }

        // ──────────────────────────────────────────
        // #20 recharge — sesuai HAR
        // ──────────────────────────────────────────
        let rechargeData = {};
        if (recharges.length > 0) {
            const haveBought = {};
            recharges.forEach(r => { haveBought[String(r._rechargeId)] = safeParse(r._haveBoughtJson, false); });
            rechargeData = { _id: 'recharge_' + userId, _haveBought: haveBought };
        }

        // ──────────────────────────────────────────
        // #21 expedition — sesuai HAR: SELALU dikirim
        // ──────────────────────────────────────────
        let expeditionData = {
            _id: userId,
            _passLesson: { "1": 0, "2": 0, "3": 0 },
            _machines: {},
            _collection: [],
            _teams: {},
            _times: 10,
            _timesStartRecover: 0
        };
        if (expeditions.length > 0) {
            const e0 = expeditions[0];
            expeditionData = {
                _id: e0._expeditionId || userId,
                _passLesson: safeParse(e0._passLessonJson, { "1": 0, "2": 0, "3": 0 }),
                _machines: safeParse(e0._machinesJson, {}),
                _collection: safeParse(e0._collectionJson, []),
                _teams: safeParse(e0._teamsJson, {}),
                _times: e0._times || 10,
                _timesStartRecover: e0._timesStartRecover || 0
            };
        }

        // ──────────────────────────────────────────
        // #22 timeTrial — sesuai HAR
        // ──────────────────────────────────────────
        let timeTrialData = {};
        let timeTrialNextOpenTime = 0;
        if (timeTrials.length > 0) {
            const t0 = timeTrials[0];
            timeTrialData = {
                _id: t0._timeTrialId || userId,
                _levelStars: safeParse(t0._levelStarsJson, {}),
                _gotStarReward: safeParse(t0._gotStarRewardJson, {}),
                _totalStars: 0,
                _totalStarChangeTime: 0,
                _level: t0._level || 1,
                _haveTimes: t0._haveTimes || 0,
                _timesStartRecover: t0._timesStartRecover || 0,
                _lastRefreshTime: t0._lastRefreshTime || 0,
                _startTime: t0._startTime || 0
            };
        }

        // ──────────────────────────────────────────
        // #23 retrieve — sesuai HAR: SELALU dikirim
        // ──────────────────────────────────────────
        let retrieveData = {
            _id: userId,
            _finishDungeons: {},
            _calHangupTime: 0,
            _retrieveHangupReward: { _items: {} },   // ⚠️ { _items: {} } BUKAN {}!
            _retrieveHangupTime: 0,
            _retrieveDungeons: {},
            _finishTime: 0
        };
        if (retrieves.length > 0) {
            const r0 = retrieves[0];
            retrieveData = {
                _id: r0._retrieveId || userId,
                _finishDungeons: safeParse(r0._finishDungeonsJson, {}),
                _calHangupTime: r0._calHangupTime || 0,
                _retrieveHangupReward: safeParse(r0._retrieveHangupRewardJson, { _items: {} }),
                _retrieveHangupTime: r0._retrieveHangupTime || 0,
                _retrieveDungeons: safeParse(r0._retrieveDungeonsJson, {}),
                _finishTime: r0._finishTime || 0
            };
        }

        // ──────────────────────────────────────────
        // #24 battleMedal — sesuai HAR: SELALU dikirim
        // ──────────────────────────────────────────
        let battleMedalData = {
            _id: userId,
            _battleMedalId: uuidv4(),
            _cycle: 1,
            _nextRefreshTime: 0,
            _level: 0,
            _curExp: 0,
            _openSuper: false,
            _task: {},
            _levelReward: {},
            _shopBuyTimes: {},
            _buyLevelCount: 0
        };
        if (battleMedals.length > 0) {
            const b0 = battleMedals[0];
            battleMedalData = {
                _id: userId,
                _battleMedalId: b0._battleMedalId || uuidv4(),
                _cycle: b0._cycle || 1,
                _nextRefreshTime: b0._nextRefreshTime || 0,
                _level: b0._level || 0,
                _curExp: b0._curExp || 0,
                _openSuper: b0._openSuper ? true : false,
                _task: safeParse(b0._taskJson, {}),
                _levelReward: safeParse(b0._levelRewardJson, {}),
                _shopBuyTimes: safeParse(b0._shopBuyTimesJson, {}),
                _buyLevelCount: b0._buyLevelCount || 0
            };
        }

        // ──────────────────────────────────────────
        // #25 resonance — sesuai HAR
        // ──────────────────────────────────────────
        let resonanceData = {};
        if (resonances.length > 0) {
            const r0 = resonances[0];
            resonanceData = {
                _id: r0._resonanceId || userId,
                _diamondCabin: r0._diamondCabin || 0,
                _cabins: safeParse(r0._cabinsJson, {}),
                _buySeatCount: r0._buySeatCount || 0,
                _totalTalent: r0._totalTalent || 0,
                _unlockSpecial: r0._unlockSpecial ? true : false
            };
        }

        // ──────────────────────────────────────────
        // #26 gravity — sesuai HAR
        // ──────────────────────────────────────────
        let gravityData = {};
        if (gravities.length > 0) {
            const g0 = gravities[0];
            gravityData = {
                _id: g0._gravityId || userId,
                _haveTimes: g0._haveTimes || 0,
                _timesStartRecover: g0._timesStartRecover || 0,
                _lastLess: g0._lastLess || 0,
                _lastTime: g0._lastTime || 0
            };
        }

        // ──────────────────────────────────────────
        // #27 forbiddenChat — sesuai HAR: { users: [], finishTime: {} }
        // ──────────────────────────────────────────
        const forbiddenChatData = (() => {
            const users = [];
            const finishTime = {};
            forbiddenChats.forEach(fc => {
                users.push(fc._targetUserId);
                finishTime[fc._targetUserId] = fc._finishTime || 0;
            });
            return { users, finishTime };
        })();

        // ──────────────────────────────────────────
        // #28 fastTeam — sesuai HAR: { _teamInfo: { key: { _team, _superSkill, _name } } }
        // ──────────────────────────────────────────
        const fastTeamInfo = {};
        fastTeams.forEach(ft => {
            fastTeamInfo[ft._teamKey] = {
                _team: safeParse(ft._teamJson, {}),
                _superSkill: safeParse(ft._superSkillJson, []),
                _name: ft._name || ''
            };
        });

        // ──────────────────────────────────────────
        // #29 blacklist — sesuai HAR: []
        // ──────────────────────────────────────────
        const blacklistData = blacklists.map(b => b._targetUserId);

        // ──────────────────────────────────────────
        // #30 checkin — sesuai HAR
        // ──────────────────────────────────────────
        let checkinData = {};
        if (checkins.length > 0) {
            const ck = checkins[0];
            checkinData = {
                _id: ck._checkinId || userId,
                _activeItem: safeParse(ck._activeItemJson, []),
                _curCycle: ck._curCycle || 1,
                _maxActiveDay: ck._maxActiveDay || 0,
                _lastActiveDate: ck._lastActiveDate || 0
            };
        }

        // ──────────────────────────────────────────
        // #31 genki — sesuai HAR
        // ──────────────────────────────────────────
        const genkiItemsDict = {};
        let genkiModel = null;
        genkis.forEach(g => {
            genkiItemsDict[g._genkiId] = {
                _id: g._genkiId || '',
                _displayId: g._displayId || 0,
                _heroId: g._heroId || '',
                _heroPos: g._heroPos || 0,
                _disable: g._disable ? true : false,
                _mainAttr: safeParse(g._mainAttrJson, { _items: [] }),
                _viceAttr: safeParse(g._viceAttrJson, { _items: [] })
            };
        });
        if (genkis.length > 0) {
            const g0 = genkis[0];
            genkiModel = {
                _id: userId,
                _curSmeltNormalExp: g0._curSmeltNormalExp || 0,
                _curSmeltSuperExp: g0._curSmeltSuperExp || 0,
                _items: genkiItemsDict
            };
        }

        // ──────────────────────────────────────────
        // #32 gemstone — sesuai HAR
        // ──────────────────────────────────────────
        const gemstoneItemsDict = {};
        gemstones.forEach(gs => {
            gemstoneItemsDict[gs._gemstoneId] = {
                _id: gs._gemstoneId || '',
                _displayId: gs._displayId || 0,
                _heroId: gs._heroId || '',
                _level: gs._level || 1,
                _totalExp: gs._totalExp || 0,
                _version: gs._version || ''
            };
        });

        // ──────────────────────────────────────────
        // #33 dragonEquiped — sesuai HAR: {}
        // ──────────────────────────────────────────
        const dragonEquipedDict = {};
        dragonBalls.forEach(db2 => {
            if (db2._ballId) dragonEquipedDict[String(db2._ballId)] = 1;
        });

        // ──────────────────────────────────────────
        // #34 vipLog / cardLog — sesuai HAR
        // ──────────────────────────────────────────
        const vipLogArray = vipLogs.map(v => ({
            _userId: v._logUserId || '', _userName: v._userName || '', _vip: v._displayId || 0,
            _time: v._time || 0, _displayId: v._displayId || 0, type: 'Notify', action: 'vipLevel'
        }));
        const cardLogArray = cardLogs.map(c => ({
            _userId: c._logUserId || '', _userName: c._userName || '', _cardId: c._cardId || 0,
            _time: c._time || 0, type: 'Notify', action: 'monthCard'
        }));

        // ═══════════════════════════════════════════════════════════
        // 7. BUILD FINAL RESPONSE — SESUAI HAR (79 top-level keys)
        // ═══════════════════════════════════════════════════════════
        const enterGameData = {
            // ─── Core user data ───
            currency: currency,
            user: userObj,

            // ─── Game state ───
            heros: herosObj,
            hangup: hangupObj,
            totalProps: { _items: itemsDict },
            backpackLevel: user._backpackLevel || 1,
            summon: summonObj,
            dungeon: { _id: userId, _dungeons: dungeonDict },

            // ─── Equipment ───
            imprint: { _id: userId, _items: imprintItemsDict },
            equip: { _id: userId, _suits: equipSuits },
            weapon: { _id: userId, _items: weaponItemsDict },

            // ─── Guild ───
            userGuild: userGuildData,
            userGuildPub: userGuildPubData,
            guildLevel: 0,                                  // ⚠️ HAR: selalu 0 untuk no guild
            guildTreasureMatchRet: 0,                       // ⚠️ HAR: selalu 0

            // ─── Online/Bulletin ───
            onlineBulletin: safeParse(miscJson._onlineBulletin, []),

            // ─── Gift/Shop ───
            giftInfo: giftInfo || { _id: userId, _isBuyFund: false, _levelGiftCount: {}, _fundGiftCount: {}, _fristRecharge: { _canGetReward: false, _haveGotReward: false }, _haveGotVipRewrd: {}, _buyVipGiftCount: {}, _onlineGift: { _curId: 0, _nextTime: now + 200000 }, _gotChannelWeeklyRewardTag: '', _clickHonghuUrlTime: 0, _gotBSAddToHomeReward: false },

            // ─── Guide ───
            guide: guide || { _id: userId, _steps: {} },

            // ─── Summon log ───
            summonLog: [],

            // ─── VIP/Card logs ───
            vipLog: vipLogArray,
            cardLog: cardLogArray,

            // ─── Dragon balls ───
            dragonEquiped: dragonEquipedDict,

            // ─── Schedule info ───
            scheduleInfo: scheduleInfo,
            cellgameHaveSetHero: scheduleInfo._cellgameHaveSetHero || false,

            // ─── Times info ───
            timesInfo: timesInfo || {
                templeTimes: 10, templeTimesRecover: 0, mineSteps: 0, mineStepsRecover: 0,
                karinFeet: 5, karinFeetRecover: 0, mahaTimes: 0, mahaTimesRecover: 0,
                marketRefreshTimes: 0, marketRefreshTimesRecover: 0,
                vipMarketRefreshTimes: 0, vipMarketRefreshTimesRecover: 0
            },

            // ─── Server info ───
            serverVersion: user._serverVersion || 'v2024102918',
            serverOpenDate: user._serverOpenDate || now,
            serverId: parseInt(serverId) || parseInt(config.serverId) || 1,
            mergedServers: [],

            // ─── Last team ───
            lastTeam: { _id: userId, _lastTeamInfo: lastTeamInfo },
            heroImageVersion: user._heroImageVersion || 0,
            superImageVersion: user._superImageVersion || 0,

            // ─── Karin tower ───
            karinStartTime: safeParse(miscJson._karinStartTime) || now,
            karinEndTime: safeParse(miscJson._karinEndTime) || now + 144000000,

            // ─── Training — ⚠️ HAR: SELALU dikirim! ───
            training: safeParse(miscJson._training) || {
                _id: userId,
                _type: 0,
                _cfgId: 0,
                _questionId: 0,
                _enemyId: 0,
                _enemyHp: {},
                _times: 10,
                _timesStartRecover: now
            },

            // ─── Super skill ───
            superSkill: { _id: userId, _skills: superSkillDict },

            // ─── War info ───
            warInfo: safeParse(miscJson._warInfo) || null,    // ⚠️ HAR: null, bukan undefined!
            userWar: safeParse(miscJson._userWar) || {
                _id: userId, _session: 0, _worldId: 0, _areaId: 0,
                _auditionWinCount: 0, _gotAuditionReward: {}, _bet: {}, _liked: false, _championCount: 0
            },

            // ─── Global war ───
            globalWarBuffTag: safeParse(miscJson._globalWarBuffTag) || '',
            globalWarLastRank: safeParse(miscJson._globalWarLastRank) || {},
            globalWarBuff: safeParse(miscJson._globalWarBuff) || 0,
            globalWarBuffEndTime: safeParse(miscJson._globalWarBuffEndTime) || 0,

            // ─── Head effect — ⚠️ HAR: SELALU dikirim! ───
            headEffect: safeParse(miscJson._headEffect) || {
                _id: userId, _curBox: 0, _curEffect: 0, _effects: []
            },

            // ─── Ball war ───
            userBallWar: safeParse(miscJson._userBallWar) || {
                _id: userId, _times: 0, _timesStartRecover: 0, _fieldId: '', _readRecordTime: 0, _nextCanFightTime: 0
            },
            ballWarState: safeParse(miscJson._ballWarState) || 0,

            // ─── QQ/Platform display ───
            enableShowQQ: user._enableShowQQ ? true : false,
            showQQVip: user._showQQVip || 0,
            showQQ: user._showQQ || 0,
            showQQImg1: user._showQQImg1 || '',
            showQQImg2: user._showQQImg2 || '',
            showQQUrl: user._showQQUrl || '',

            // ─── Expedition ───
            expedition: expeditionData,

            // ─── Time trial ───
            timeTrial: timeTrialData,
            timeTrialNextOpenTime: timeTrialNextOpenTime,

            // ─── Retrieve ───
            retrieve: retrieveData,

            // ─── Battle medal ───
            battleMedal: battleMedalData,

            // ─── Currency display ───
            currency: currency,

            // ─── Team training ───
            teamTraining: teamTrainings.length > 0 ? (() => {
                const tt = teamTrainings[0];
                return { _id: tt._trainId || userId, _levels: safeParse(tt._levelsJson, {}), _unlock: tt._unlock ? true : false, _version: tt._version || '' };
            })() : { _id: userId, _levels: {}, _unlock: false, _version: '' },

            // ─── Hero skin ───
            heroSkin: { _id: userId, _skins: heroSkinSkins, _curSkin: heroSkinCurSkin },

            // ─── Shop ───
            shopNewHeroes: safeParse(miscJson._shopNewHeroes) || {},

            // ─── Channel special ───
            channelSpecial: channelSpecialData,
            hideHeroes: safeParse(miscJson._hideHeroes) || [],

            // ─── Broadcast ───
            broadcastRecord: safeParse(miscJson._broadcastRecord) || [],

            // ─── Team dungeon ───
            teamServerHttpUrl: config.dungeonServerUrl || '',
            teamDungeonOpenTime: safeParse(miscJson._teamDungeonOpenTime) || undefined,
            teamDungeonTask: safeParse(miscJson._teamDungeonTask) || undefined,
            teamDungeonSplBcst: safeParse(miscJson._teamDungeonSplBcst) || undefined,
            teamDungeonNormBcst: safeParse(miscJson._teamDungeonNormBcst) || undefined,
            teamDungeonHideInfo: safeParse(miscJson._teamDungeonHideInfo) || undefined,
            teamDungeonInvitedFriends: safeParse(miscJson._teamDungeonInvitedFriends) || undefined,

            // ─── Temple ───
            templeLess: safeParse(miscJson._templeLess) || undefined,

            // ─── Dungeon URL ───
            myTeamServerSocketUrl: config.dungeonServerUrl || '',

            // ─── Questionnaires ───
            questionnaires: safeParse(miscJson._questionnaires) || undefined,

            // ─── Resonance ───
            resonance: resonanceData,

            // ─── Top battle ───
            userTopBattle: safeParse(miscJson._userTopBattle) || undefined,
            topBattleInfo: safeParse(miscJson._topBattleInfo) || undefined,

            // ─── Fast team ───
            fastTeam: Object.keys(fastTeamInfo).length > 0 ? { _teamInfo: fastTeamInfo } : undefined,

            // ─── Blacklist / Forbidden chat ───
            blacklist: blacklistData,
            forbiddenChat: forbiddenChatData,

            // ─── Gravity ───
            gravity: gravityData,

            // ─── Little game ───
            littleGame: safeParse(miscJson._littleGame) || undefined,

            // ─── Main task ───
            curMainTask: safeParse(miscJson._curMainTask, {}),

            // ─── Checkin ───
            checkin: checkinData,

            // ─── Genki / Gemstone (conditional) ───
            ...(genkiModel ? { genki: genkiModel } : {}),
            ...(Object.keys(gemstoneItemsDict).length > 0 ? { gemstone: { _id: userId, _items: gemstoneItemsDict } } : {}),

            // ─── Month card / Recharge ───
            monthCard: monthCardData,
            recharge: rechargeData,

            // ─── Time machine ───
            timeMachine: safeParse(miscJson._timeMachine) || { _id: userId, _items: {} },

            // ─── Arena ───
            _arenaTeam: arenaTeamDict,
            _arenaSuper: arenaSuperArray,

            // ─── Time bonus ───
            timeBonusInfo: safeParse(miscJson._timeBonusInfo) || undefined,

            // ─── Click system ───
            clickSystem: clickSystem || { _id: userId, _clickSys: {} },

            // ─── Guild name ───
            guildName: userGuildData._guildId || undefined,

            // ─── New user flag ───
            newUser: isNewUser
        };

        // Hapus field yang undefined
        Object.keys(enterGameData).forEach(key => {
            if (enterGameData[key] === undefined) delete enterGameData[key];
        });

        return buildSuccess(enterGameData);
    }
};

// ─── HELPER FUNCTIONS ───

function safeParse(str, fallback) {
    if (!str) return fallback !== undefined ? fallback : {};
    if (typeof str === 'object') return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback !== undefined ? fallback : {};
    }
}

/**
 * Build default guild tech data — sesuai HAR
 * 3 categories: "1", "2", "3"
 * Each category: { _firstRest: true, _totalCost: { _items: {} }, _totalLevel: 0, _techItems: { itemId: { _level: 0, _attrs: { _items: {} }, _version: "201912101403" } } }
 */
function buildDefaultGuildTech() {
    const techItems1 = {};
    for (let i = 31; i <= 41; i++) {
        techItems1[String(i)] = { _level: 0, _attrs: { _items: {} }, _version: '201912101403' };
    }
    const techItems2 = {};
    for (let i = 1; i <= 11; i++) {
        techItems2[String(i)] = { _level: 0, _attrs: { _items: {} }, _version: '201912101403' };
    }
    const techItems3 = {};
    for (let i = 61; i <= 71; i++) {
        techItems3[String(i)] = { _level: 0, _attrs: { _items: {} }, _version: '201912101403' };
    }

    return {
        "1": { _firstRest: true, _totalCost: { _items: {} }, _totalLevel: 0, _techItems: techItems1 },
        "2": { _firstRest: true, _totalCost: { _items: {} }, _totalLevel: 0, _techItems: techItems2 },
        "3": { _firstRest: true, _totalCost: { _items: {} }, _totalLevel: 0, _techItems: techItems3 }
    };
}

// Reference to socketIO for Kickout (set by index.js)
let socketIO = null;
module.exports.setSocketIO = function(io) { socketIO = io; };
