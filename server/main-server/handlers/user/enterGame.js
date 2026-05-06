/**
 * handlers/user/enterGame.js — enterGame Handler (REVISI LENGKAP)
 *
 * Semua field, sub-field & value diambil LANGSUNG dari game.md
 * yang ditelusuri dari main.min(unminfy).js UserDataParser.saveUserData()
 *
 * ATURAN:
 *   - Jika value diketahui dari main.min.js → pakai value itu
 *   - Jika value NOT FOUND → tulis NOT_FOUND (jangan 0, 1, null, asumsi)
 *   - Struktur sesuai persis apa yang client deserialize
 *
 * Request: { type: 'user', action: 'enterGame', loginToken, userId, serverId, version, language, gameVersion }
 * Response: Full user data untuk UserDataParser.saveUserData()
 */

module.exports = {
    // ─────────────────────────────────────────────────────────────
    // SCHEMA — tabel yang dikelola handler ini
    // ─────────────────────────────────────────────────────────────
    schema: {
        user: {
            _id:               'TEXT PRIMARY KEY',
            _nickName:         "TEXT DEFAULT ''",
            _pwd:              "TEXT DEFAULT ''",
            _headImage:        'INTEGER DEFAULT 0',
            _lastLoginTime:    'INTEGER DEFAULT 0',
            _createTime:       'INTEGER DEFAULT 0',
            _bulletinVersions: "TEXT DEFAULT '{}'",
            _oriServerId:      "TEXT DEFAULT ''",
            _nickChangeTimes:  'INTEGER DEFAULT 0',
            // ── JSON blob fields (di-parse saat response) ──
            _hangupJson:       "TEXT DEFAULT '{}'",
            _summonJson:       "TEXT DEFAULT '{}'",
            _scheduleInfoJson: "TEXT DEFAULT '{}'",
            _guideJson:        "TEXT DEFAULT '{}'",
            _clickSystemJson:  "TEXT DEFAULT '{}'",
            _giftInfoJson:     "TEXT DEFAULT '{}'",
            _timesInfoJson:    "TEXT DEFAULT '{}'",
            _miscJson:         "TEXT DEFAULT '{}'",
            _backpackLevel:    'INTEGER DEFAULT 1',    // ⚠️ MIN 1! bagPlus.json keys start from "1", client setter: n[e].max
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
            // ── QQ-related (di-assign langsung dari server) ──
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

        if (!user) {
            isNewUser = true;
            const constant = jsonLoader.get('constant');
            const c = constant && constant['1'] ? constant['1'] : {};
            const now = Date.now();

            db.user.create({
                _id: userId,
                _nickName: '',
                _headImage: 0,
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
                _scheduleInfoJson: JSON.stringify({
                    _marketDiamondRefreshCount: 0,
                    _vipMarketDiamondRefreshCount: 0,
                    _arenaAttackTimes: 0,
                    _arenaBuyTimesCount: 0,
                    _snakeResetTimes: 0,
                    _snakeSweepCount: 0,
                    _cellGameHaveGotReward: true,
                    _cellGameHaveTimes: 0,
                    _cellgameHaveSetHero: false,
                    _strongEnemyTimes: 0,
                    _strongEnemyBuyCount: 0,
                    _mergeBossBuyCount: 0,
                    _dungeonTimes: { '1': 2, '2': 2, '4': 2, '5': 2, '6': 2, '7': 2, '8': 2 },
                    _dungeonBuyTimesCount: { '1': 0, '2': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0 },
                    _karinBattleTimes: 0,
                    _karinBuyBattleTimesCount: 0,
                    _karinBuyFeetCount: 0,
                    _entrustResetTimes: 0,
                    _dragonExchangeSSPoolId: 0,
                    _dragonExchangeSSSPoolId: 0,
                    _teamDugeonUsedRobots: [],
                    _timeTrialBuyTimesCount: 0,
                    _monthCardHaveGotReward: {},
                    _goldBuyCount: 0,
                    _likeRank: {},
                    _mahaAttackTimes: 0,
                    _mahaBuyTimesCount: 0,
                    _mineResetTimes: 0,
                    _mineBuyResetTimesCount: 0,
                    _mineBuyStepCount: 0,
                    _guildBossTimes: 0,
                    _guildBossTimesBuyCount: 0,
                    _treasureTimes: 0,
                    _guildCheckInType: 0,
                    _templeBuyCount: 0,
                    _trainingBuyCount: 0,
                    _bossCptTimes: 0,
                    _bossCptBuyCount: 0,
                    _ballWarBuyCount: 0,
                    _expeditionEvents: {},
                    _clickExpedition: false,
                    _expeditionSpeedUpCost: 0,
                    _templeDailyReward: false,
                    _templeYesterdayLess: 0,
                    _topBattleTimes: 0,
                    _topBattleBuyCount: 0,
                    _gravityTrialBuyTimesCount: 0,
                    _hadBuytimes: 0,
                    _costMaterialCount: 0,
                    _clickTimeGift: false
                }),
                _guideJson: JSON.stringify({}),
                _clickSystemJson: JSON.stringify({}),
                _giftInfoJson: JSON.stringify({
                    _levelGiftCount: {},
                    _levelBuyGift: {},
                    _fristRecharge: { _canGetReward: false, _haveGotReward: false },
                    _haveGotVipRewrd: {},
                    _buyVipGiftCount: {},
                    _onlineGift: { _curId: 0, _nextTime: 0 },
                    _isBuyFund: false,
                    _fundGiftCount: {},
                    _gotBSAddToHomeReward: false,
                    _clickHonghuUrlTime: 0,
                    _gotChannelWeeklyRewardTag: ''
                }),
                _timesInfoJson: JSON.stringify({}),
                _miscJson: JSON.stringify({}),
                _serverOpenDate: now,
                _newUser: 1
            });

            // Start hero — dari constant JSON
            const heroData = jsonLoader.get('hero');
            const startHeroDisplayId = parseInt(c.startHero) || 1205;
            const startHeroLevel = parseInt(c.startHeroLevel) || 3;
            let startHeroBaseAttr = {};
            if (heroData && heroData[String(startHeroDisplayId)]) {
                const hInfo = heroData[String(startHeroDisplayId)];
                startHeroBaseAttr = {
                    _level: startHeroLevel,
                    _evolveLevel: 0,
                    _power: 0,
                    _hp: 0, _attack: 0, _armor: 0, _speed: 0,
                    _hit: 0, _dodge: 0, _block: 0, _damageReduce: 0,
                    _armorBreak: 0, _controlResist: 0, _skillDamage: 0,
                    _criticalDamage: 0, _blockEffect: 0, _critical: 0,
                    _criticalResist: 0, _trueDamage: 0, _energy: 0,
                    _extraArmor: 0, _hpPercent: 0, _armorPercent: 0,
                    _attackPercent: 0, _speedPercent: 0,
                    _orghp: 0, _superDamage: 0, _healPlus: 0,
                    _healerPlus: 0, _damageDown: 0, _shielderPlus: 0, _damageUp: 0, _talent: 0
                };
            }

            db.heros.create({
                _userId: userId,
                _heroId: 'hero_' + userId + '_' + startHeroDisplayId,
                _heroDisplayId: startHeroDisplayId,
                _heroStar: 0,
                _qigongStage: 1,
                _heroBaseAttrJson: JSON.stringify(startHeroBaseAttr),
                _totalCostJson: JSON.stringify({
                    _wakeUp: [],
                    _earring: [],
                    _levelUp: [],
                    _evolve: [],
                    _skill: [],
                    _qigong: [],
                    _heroBreak: []
                }),
                _breakInfoJson: JSON.stringify({ _breakLevel: 1, _level: 0, _attr: [] })
            });

            // Default currency items
            db.totalProps.createBatch([
                { _userId: userId, _itemId: 104, _num: 1 },   // PLAYERLEVELID
                { _userId: userId, _itemId: 103, _num: 0 },   // PLAYEREXPERIENCEID
                { _userId: userId, _itemId: 101, _num: 0 },   // DIAMONDID
                { _userId: userId, _itemId: 102, _num: 0 },   // GOLDID
                { _userId: userId, _itemId: 106, _num: 0 },   // PLAYERVIPLEVELID
                { _userId: userId, _itemId: 105, _num: 0 },   // PLAYERVIPEXPERIENCEID
                { _userId: userId, _itemId: 107, _num: 0 }    // PLAYERVIPEXPALLID
            ]);

            user = db.user.get(userId);
        }

        // ─── 3. UPDATE LOGIN ───
        db.user.update(userId, { _lastLoginTime: Date.now() });

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

        // Parse JSON fields dari user
        const hangup       = safeParse(user._hangupJson);
        const summon       = safeParse(user._summonJson);
        const scheduleInfo = safeParse(user._scheduleInfoJson);
        const guide        = safeParse(user._guideJson);
        const clickSystem  = safeParse(user._clickSystemJson);
        const giftInfo     = safeParse(user._giftInfoJson);
        const timesInfo    = safeParse(user._timesInfoJson);
        const miscJson     = safeParse(user._miscJson);

        // ─── 6. BUILD RESPONSE — SESUAI main.min.js UserDataParser.saveUserData() ───

        // #1 currency
        // Client: ts.currency = e.currency (no default, harus dikirim)
        const currency = 'IDR';

        // #2 user — HANYA field yang dibaca setUserInfo (Line 114874-114885)
        const userObj = {
            _id: user._id,
            _pwd: user._pwd || '',
            _nickName: user._nickName || '',
            _headImage: user._headImage || 0,
            _lastLoginTime: user._lastLoginTime || 0,
            _createTime: user._createTime || 0,
            _bulletinVersions: safeParse(user._bulletinVersions),
            _oriServerId: user._oriServerId || ''
            // _nickChangeTimes: hanya dikirim jika truthy
        };
        if (user._nickChangeTimes) {
            userObj._nickChangeTimes = user._nickChangeTimes;
        }

        // #5 totalProps._items
        const itemsDict = {};
        items.forEach((item) => {
            itemsDict[String(item._itemId)] = { _id: item._itemId, _num: item._num };
        });

        // #7 equip._suits — dict key=heroId
        const equipSuits = {};
        equips.forEach(eq => {
            equipSuits[String(eq._heroId)] = {
                _suitItems: safeParse(eq._suitItemsJson, []),
                _suitAttrs: safeParse(eq._suitAttrsJson, []),
                _equipAttrs: safeParse(eq._equipAttrsJson, []),
                _earrings: safeParse(eq._earringsJson, { _id: 0, _level: 0, _attrs: { _items: [] } }),
                _weaponState: eq._weaponState || 0
            };
        });

        // #8 weapon._items — dict key=weaponId
        const weaponItems = {};
        weapons.forEach(w => {
            weaponItems[String(w._weaponId)] = {
                _weaponId: w._weaponId || '',
                _displayId: w._displayId || 0,
                _heroId: w._heroId || '',
                _star: w._star || 0,
                _level: w._level || 1,          // ⚠️ default 1, BUKAN 0!
                _haloId: w._haloId || 0,
                _haloLevel: w._haloLevel || 0,
                _attrs: { _items: safeParse(w._attrsJson, []) },
                _strengthenCost: { _items: safeParse(w._strengthenCostJson, []) },
                _haloCost: { _items: safeParse(w._haloCostJson, []) }
            };
        });

        // #9 genki
        const genkiItems = {};
        let genkiModel = { _id: '', _curSmeltNormalExp: 0, _curSmeltSuperExp: 0, _items: {} };
        genkis.forEach(g => {
            genkiItems[String(g._genkiId)] = {
                _id: g._genkiId || '',
                _displayId: g._displayId || 0,
                _heroId: g._heroId || '',
                _heroPos: g._heroPos || 0,
                _disable: g._disable ? true : false,
                _mainAttr: safeParse(g._mainAttrJson, { _items: [] }),
                _viceAttr: safeParse(g._viceAttrJson, { _items: [] })
            };
            genkiModel._curSmeltNormalExp = g._curSmeltNormalExp || 0;
            genkiModel._curSmeltSuperExp = g._curSmeltSuperExp || 0;
        });
        genkiModel._items = genkiItems;

        // #10 gemstone._items
        const gemstoneItems = {};
        gemstones.forEach(gs => {
            gemstoneItems[String(gs._gemstoneId)] = {
                _id: gs._gemstoneId || '',
                _displayId: gs._displayId || 0,
                _heroId: gs._heroId || '',
                _level: gs._level || 1,          // ⚠️ default 1!
                _totalExp: gs._totalExp || 0,
                _version: gs._version || ''
            };
        });

        // #11 heros._heros — ⚠️ HARUS {_heros: [...]} BUKAN flat array!
        const herosArray = [];
        heros.forEach(h => {
            const heroBaseAttr = safeParse(h._heroBaseAttrJson, {});
            const heroObj = {
                _heroId: h._heroId || '',
                _heroDisplayId: h._heroDisplayId || 0,
                _heroStar: h._heroStar || 0,
                _expeditionMaxLevel: h._expeditionMaxLevel || 0,
                _fragment: h._fragment || 0,
                _superSkillResetCount: h._superSkillResetCount || 0,
                _potentialResetCount: h._potentialResetCount || 0,
                _heroBaseAttr: heroBaseAttr,
                _superSkillLevel: safeParse(h._superSkillLevelJson, []),
                _potentialLevel: safeParse(h._potentialLevelJson, [])
            };
            // Conditional fields — hanya kirim jika ada/bernilai
            if (h._qigongStage) heroObj._qigongStage = h._qigongStage;    // fallback client=1
            if (safeParse(h._qigongJson) && Object.keys(safeParse(h._qigongJson)).length > 0) {
                heroObj._qigong = safeParse(h._qigongJson);
            }
            if (safeParse(h._qigongTmpJson) && Object.keys(safeParse(h._qigongTmpJson)).length > 0) {
                heroObj._qigongTmp = safeParse(h._qigongTmpJson);
            }
            if (h._qigongTmpPower !== undefined && h._qigongTmpPower !== 0) {
                heroObj._qigongTmpPower = h._qigongTmpPower;
            }
            if (safeParse(h._totalCostJson) && Object.keys(safeParse(h._totalCostJson)).length > 0) {
                heroObj._totalCost = safeParse(h._totalCostJson);
            }
            if (safeParse(h._breakInfoJson) && Object.keys(safeParse(h._breakInfoJson)).length > 0) {
                heroObj._breakInfo = safeParse(h._breakInfoJson);
            }
            if (h._gemstoneSuitId) heroObj._gemstoneSuitId = h._gemstoneSuitId;
            const linkToArr = safeParse(h._linkTo, []);
            if (linkToArr.length > 0) heroObj._linkTo = linkToArr;
            if (h._linkFrom) heroObj._linkFrom = h._linkFrom;
            herosArray.push(heroObj);
        });

        // #12 summonLog — dari summon singleton (sementara kosong)
        const summonLog = [];

        // #6 imprint._items
        const imprintItems = {};
        imprints.forEach(imp => {
            imprintItems[String(imp._signId)] = {
                _id: imp._signId || '',
                _displayId: imp._displayId || 0,
                _heroId: imp._heroId || '',
                _level: imp._level || 1,      // ⚠️ default 1!
                _star: imp._star || 0,
                _mainAttr: safeParse(imp._mainAttrJson, { _items: [] }),
                _starAttr: safeParse(imp._starAttrJson, { _items: [] }),
                _viceAttr: safeParse(imp._viceAttrJson, []),
                _addAttr: safeParse(imp._addAttrJson, {}),
                _tmpViceAttr: safeParse(imp._tmpViceAttrJson, []),
                _totalCost: { _items: safeParse(imp._totalCostJson, []) }
            };
        });

        // #11 dungeon._dungeons — dict by type
        const dungeonDict = {};
        dungeons.forEach(d => {
            dungeonDict[String(d._type)] = {
                _type: d._type || 0,
                _curMaxLevel: d._curMaxLevel || 0,
                _lastLevel: d._lastLevel || 0
            };
        });

        // #13 superSkill._skills
        const superSkillDict = {};
        superSkills.forEach(ss => {
            if (ss._level > 0) {    // ⚠️ level 0 = SKIPPED oleh client!
                superSkillDict[String(ss._skillId)] = {
                    _skillId: ss._skillId,
                    _level: ss._level,
                    _needEvolve: ss._needEvolve ? true : false,    // ⚠️ Boolean, BUKAN Number! Client uses as boolean flag
                    _totalCost: safeParse(ss._totalCostJson, {})
                };
            }
        });

        // #14 heroSkin
        const heroSkinSkins = {};
        const heroSkinCurSkin = {};
        heroSkins.forEach(hs => {
            heroSkinSkins[String(hs._heroDisplayId)] = safeParse(hs._skinsJson, []);
            heroSkinCurSkin[String(hs._heroDisplayId)] = { _id: hs._curSkinId || 0 };
        });

        // #17 dragonEquiped — { '151': 1, '152': 1, ... } (key=ballId string, value=any)
        const dragonEquipedDict = {};
        dragonBalls.forEach(db2 => {
            if (db2._ballId) dragonEquipedDict[String(db2._ballId)] = 1;
        });

        // #20 vipLog
        const vipLogArray = vipLogs.map(v => ({ _displayId: v._displayId || 0, _userName: v._userName || '' }));

        // #21 cardLog
        const cardLogArray = cardLogs.map(c => ({ _userId: c._logUserId || '', _cardId: c._cardId || 0, _userName: c._userName || '', _time: c._time || 0 }));

        // #25 giftInfo — sudah di-parse, tambah fallback
        if (giftInfo) {
            if (!giftInfo._fristRecharge) giftInfo._fristRecharge = { _canGetReward: false, _haveGotReward: false };
            if (!giftInfo._fristRecharge._canGetReward) giftInfo._fristRecharge._canGetReward = false;
            if (!giftInfo._fristRecharge._haveGotReward) giftInfo._fristRecharge._haveGotReward = false;
            if (!giftInfo._haveGotVipRewrd) giftInfo._haveGotVipRewrd = {};
            if (!giftInfo._buyVipGiftCount) giftInfo._buyVipGiftCount = {};
            if (!giftInfo._onlineGift) giftInfo._onlineGift = { _curId: 0, _nextTime: 0 };
            if (giftInfo._gotBSAddToHomeReward === undefined) giftInfo._gotBSAddToHomeReward = false;
            if (!giftInfo._clickHonghuUrlTime) giftInfo._clickHonghuUrlTime = 0;
        }

        // #26 monthCard
        const monthCardObj = checkins.length > 0 ? null : null; // monthCard dari tabel sendiri
        const monthCardData = monthCards.length > 0 ? (() => {
            const card = {};
            monthCards.forEach(mc => { card[String(mc._cardId)] = { _endTime: mc._endTime || 0 }; });
            return { _id: 'monthCard_' + userId, _card: card };
        })() : {};

        // #27 recharge
        const rechargeData = recharges.length > 0 ? (() => {
            const haveBought = {};
            recharges.forEach(r => { haveBought[String(r._rechargeId)] = r._haveBoughtJson ? safeParse(r._haveBoughtJson) : false; });
            return { _id: 'recharge_' + userId, _haveBought: haveBought };
        })() : {};

        // #31 _arenaTeam — Array 5 slot, setiap slot { _id: 'heroId' } atau null
        const arenaTeam = [null, null, null, null, null];
        arenaTeamRows.forEach(at => {
            if (at._slot >= 0 && at._slot < 5 && at._heroId) {
                arenaTeam[at._slot] = { _id: at._heroId };
            }
        });

        // #32 _arenaSuper — Array of hero ID strings
        const arenaSuper = arenaSuperRows.map(as => as._heroId || '').filter(id => id);

        // #34 timeBonusInfo
        const timeBonusInfo = safeParse(miscJson._timeBonusInfo) || { _id: '', _timeBonus: [] };

        // #39 lastTeam._lastTeamInfo
        const lastTeamInfo = {};
        lastTeams.forEach(lt => {
            lastTeamInfo[String(lt._teamType)] = {
                _team: safeParse(lt._teamJson, []),
                _superSkill: safeParse(lt._superSkillJson, [])
            };
        });

        // #51 expedition
        const expeditionData = expeditions.length > 0 ? (() => {
            const e0 = expeditions[0];
            return {
                _id: e0._expeditionId || '',
                _passLesson: safeParse(e0._passLessonJson, {}),
                _machines: safeParse(e0._machinesJson, {}),
                _collection: safeParse(e0._collectionJson, []),
                _teams: safeParse(e0._teamsJson, {}),
                _times: e0._times || 0,
                _timesStartRecover: e0._timesStartRecover || 0
            };
        })() : {};

        // #52 timeTrial
        const timeTrialData = timeTrials.length > 0 ? (() => {
            const t0 = timeTrials[0];
            return {
                _id: t0._timeTrialId || '',
                _levelStars: safeParse(t0._levelStarsJson, {}),
                _level: t0._level || 1,       // ⚠️ default 1!
                _gotStarReward: safeParse(t0._gotStarRewardJson, {}),
                _haveTimes: t0._haveTimes || 0,
                _timesStartRecover: t0._timesStartRecover || 0,
                _lastRefreshTime: t0._lastRefreshTime || 0,
                _startTime: t0._startTime || 0
            };
        })() : {};

        // #53 retrieve
        const retrieveData = retrieves.length > 0 ? (() => {
            const r0 = retrieves[0];
            return {
                _id: r0._retrieveId || '',
                _finishDungeons: safeParse(r0._finishDungeonsJson, {}),
                _calHangupTime: r0._calHangupTime || 0,
                _retrieveHangupReward: safeParse(r0._retrieveHangupRewardJson, {}),
                _retrieveHangupTime: r0._retrieveHangupTime || 0,
                _retrieveDungeons: safeParse(r0._retrieveDungeonsJson, {}),
                _finishTime: r0._finishTime || 0
            };
        })() : {};

        // #54 battleMedal
        const battleMedalData = battleMedals.length > 0 ? (() => {
            const b0 = battleMedals[0];
            return {
                _id: b0._battleMedalId || '',
                _battleMedalId: b0._battleMedalId || '',
                _cycle: b0._cycle || 0,
                _nextRefreshTime: b0._nextRefreshTime || 0,
                _level: b0._level || 0,
                _curExp: b0._curExp || 0,
                _openSuper: b0._openSuper ? true : false,
                _buyLevelCount: b0._buyLevelCount || 0,
                _task: safeParse(b0._taskJson, {}),
                _levelReward: safeParse(b0._levelRewardJson, {}),
                _shopBuyTimes: safeParse(b0._shopBuyTimesJson, {})
            };
        })() : {};

        // #67 resonance
        const resonanceData = resonances.length > 0 ? (() => {
            const r0 = resonances[0];
            return {
                _id: r0._resonanceId || '',
                _diamondCabin: r0._diamondCabin || 0,
                _cabins: safeParse(r0._cabinsJson, {}),
                _buySeatCount: r0._buySeatCount || 0,
                _totalTalent: r0._totalTalent || 0,
                _unlockSpecial: r0._unlockSpecial ? true : false
            };
        })() : {};

        // #72 gravity
        const gravityData = gravities.length > 0 ? (() => {
            const g0 = gravities[0];
            return {
                _id: g0._gravityId || '',
                _haveTimes: g0._haveTimes || 0,
                _timesStartRecover: g0._timesStartRecover || 0,
                _lastLess: g0._lastLess || 0,
                _lastTime: g0._lastTime || 0
            };
        })() : {};

        // #76 userGuild
        const userGuildData = userGuilds.length > 0 ? (() => {
            const ug = userGuilds[0];
            return {
                _guildId: ug._guildId || '',
                _requestedGuild: safeParse(ug._requestedGuildJson, []),
                _satanGift: {
                    _exp: ug._satanGiftExp || 0,
                    _level: ug._satanGiftLevel || 1,    // ⚠️ default 1!
                    _canRewardTime: safeParse(ug._canRewardTimeJson, {})
                },
                _haveReadBulletin: ug._haveReadBulletin ? true : false,
                _canJoinGuildTime: ug._canJoinGuildTime || 0,
                _createGuildCD: ug._createGuildCD || 0,
                _ballWarJoin: ug._ballWarJoin ? true : false,
                _tech: safeParse(ug._techJson, {})
            };
        })() : {};

        // #71 forbiddenChat
        const forbiddenChatData = (() => {
            const users = [];
            const finishTime = {};
            forbiddenChats.forEach(fc => {
                users.push(fc._targetUserId);
                finishTime[fc._targetUserId] = fc._finishTime || 0;
            });
            return { users, finishTime };
        })();

        // #50 channelSpecial
        const channelSpecialData = channelSpecials.length > 0 ? (() => {
            const cs = channelSpecials[0];
            return {
                _show: cs._show ? true : false,
                _vip: cs._vip || 0,
                _bg: cs._bg || '',
                _icon: cs._icon || '',
                _btn1Url: cs._btn1Url || '',
                _btn2Url: cs._btn2Url || '',
                _honghuUrl: cs._honghuUrl || '',
                _honghuUrlStartTime: cs._honghuUrlStartTime || 0,
                _honghuUrlEndTime: cs._honghuUrlEndTime || 0,
                _weeklyRewardTag: cs._weeklyRewardTag || '',    // ⚠️ String, BUKAN Number! Client reads as string tag
                _hideHeroes: safeParse(cs._hideHeroesJson, [])
            };
        })() : {};

        // #69 fastTeam._teamInfo
        const fastTeamInfo = {};
        fastTeams.forEach(ft => {
            fastTeamInfo[ft._teamKey] = {
                _team: safeParse(ft._teamJson, {}),
                _superSkill: safeParse(ft._superSkillJson, []),
                _name: ft._name || ''
            };
        });

        // #70 blacklist
        const blacklistData = blacklists.map(b => b._targetUserId);

        // #75 checkin
        const checkinData = checkins.length > 0 ? (() => {
            const ck = checkins[0];
            return {
                _id: ck._checkinId || '',
                _activeItem: safeParse(ck._activeItemJson, []),
                _curCycle: ck._curCycle || 1,     // ⚠️ default 1!
                _maxActiveDay: ck._maxActiveDay || 0,
                _lastActiveDate: ck._lastActiveDate || 0
            };
        })() : {};

        // ─── 7. BUILD FINAL RESPONSE ───
        const enterGameData = {
            // #1
            currency: currency,

            // #2 — setUserInfo
            user: userObj,

            // #3 — setOnHook
            hangup: hangup,

            // #4 — setSummon
            summon: summon,

            // #5 — setBackpack
            totalProps: { _items: itemsDict },
            backpackLevel: user._backpackLevel || 1,    // ⚠️ MIN 1! bagPlus.json keys start from "1"

            // #6 — setSign (imprint)
            imprint: { _items: imprintItems },

            // #7 — setEquip
            equip: { _suits: equipSuits },

            // #8 — weapon
            weapon: { _items: weaponItems },

            // #9 — genki
            genki: genkiModel,

            // #10 — gemstone
            gemstone: { _items: gemstoneItems },

            // #11 — heros ⚠️ {_heros: [...]} BUKAN flat array!
            heros: { _heros: herosArray },

            // #12 — summonLog
            summonLog: summonLog,

            // #11 — dungeon
            dungeon: { _dungeons: dungeonDict },

            // #13 — superSkill
            superSkill: { _skills: superSkillDict },

            // #14 — heroSkin
            heroSkin: { _skins: heroSkinSkins, _curSkin: heroSkinCurSkin },

            // #15 — teamTraining
            teamTraining: teamTrainings.length > 0 ? (() => {
                const tt = teamTrainings[0];
                return {
                    _id: tt._trainId || '',
                    _levels: safeParse(tt._levelsJson, {}),
                    _unlock: tt._unlock ? true : false,
                    _version: tt._version || ''
                };
            })() : {},

            // #17 — cellgameHaveSetHero (top-level, di-copy ke scheduleInfo oleh client)
            // client: void 0 != e.cellgameHaveSetHero && (e.scheduleInfo._cellgameHaveSetHero = e.cellgameHaveSetHero)
            cellgameHaveSetHero: scheduleInfo._cellgameHaveSetHero || false,

            // #18 — scheduleInfo
            scheduleInfo: scheduleInfo,

            // #19 — dragonEquiped
            dragonEquiped: dragonEquipedDict,

            // #20 — vipLog
            vipLog: vipLogArray,

            // #21 — cardLog
            cardLog: cardLogArray,

            // #22 — guide
            guide: guide,

            // #23 — guildName (dari userGuild)
            guildName: userGuildData._guildId || undefined,

            // #24 — clickSystem
            clickSystem: clickSystem,

            // #25 — giftInfo — client: if (e.giftInfo) {...}
            // WAJIB: Jika giftInfo dikirim, _onlineGift HARUS object {_curId, _nextTime}
            giftInfo: giftInfo,

            // #26 — monthCard
            monthCard: monthCardData,

            // #27 — recharge
            recharge: rechargeData,

            // #28 — timesInfo (TANPA prefix _!)
            timesInfo: timesInfo,

            // #29 — userDownloadReward
            userDownloadReward: {
                _isClick: user._isClick ? true : false,
                _haveGotDlReward: user._haveGotDlReward ? true : false,
                _isBind: user._isBind ? true : false,
                _haveGotBindReward: user._haveGotBindReward ? true : false
            },

            // #31 — timeMachine
            timeMachine: safeParse(miscJson._timeMachine) || { _items: {} },

            // #32 — _arenaTeam ⚠️ Array(5) of { _id } or null
            _arenaTeam: arenaTeam,

            // #33 — _arenaSuper ⚠️ Array of hero ID strings (flat array, BUKAN [{ _id }])
            _arenaSuper: arenaSuper,

            // #34 — timeBonusInfo
            timeBonusInfo: timeBonusInfo,

            // #35 — onlineBulletin
            onlineBulletin: safeParse(miscJson._onlineBulletin) || [],

            // #36 — karinStartTime / karinEndTime
            karinStartTime: safeParse(miscJson._karinStartTime) || 0,
            karinEndTime: safeParse(miscJson._karinEndTime) || 0,

            // #37 — serverVersion
            serverVersion: user._serverVersion || config.serverVersion || '1.0',

            // #38 — serverOpenDate
            serverOpenDate: user._serverOpenDate || 0,

            // #39 — lastTeam — WAJIB selalu kirim { _lastTeamInfo: {...} } BUKAN undefined!
            // BUG FIX: Jika undefined, client skip firstLoginSetMyTeam → _lastTeamInfo stays undefined
            // → getMyTeamByType(9) crash: Cannot read properties of undefined (reading '9')
            // Dengan { _lastTeamInfo: {} }, client calls firstLoginSetMyTeam({}) → _lastTeamInfo = {} (aman)
            lastTeam: { _lastTeamInfo: lastTeamInfo },

            // #40 — heroImageVersion / superImageVersion (hanya jika ada)
            ...(user._heroImageVersion ? { heroImageVersion: user._heroImageVersion } : {}),
            ...(user._superImageVersion ? { superImageVersion: user._superImageVersion } : {}),

            // #41 — training — client: e.training && PadipataInfoManager.setPadipataModel(e.training)
            // JANGAN kirim {} kosong, biarkan undefined (aman karena ada guard)

            // #42 — warInfo / userWar
            warInfo: safeParse(miscJson._warInfo) || undefined,
            userWar: safeParse(miscJson._userWar) || undefined,

            // #43 — serverId
            serverId: String(serverId || config.serverId || '1'),

            // #44 — headEffect
            headEffect: safeParse(miscJson._headEffect) || undefined,

            // #45 — userBallWar / ballWarState / ballBroadcast
            userBallWar: safeParse(miscJson._userBallWar) || undefined,
            ballWarState: safeParse(miscJson._ballWarState) || undefined,
            ballBroadcast: safeParse(miscJson._ballBroadcast) || undefined,

            // #46 — ballWarInfo
            ballWarInfo: safeParse(miscJson._ballWarInfo) || undefined,

            // #47 — guildActivePoints
            guildActivePoints: safeParse(miscJson._guildActivePoints) || undefined,

            // #48 — QQ-related (di-assign langsung, tanpa default)
            enableShowQQ: user._enableShowQQ ? true : false,
            showQQVip: user._showQQVip || 0,
            showQQ: user._showQQ ? true : false,
            showQQImg1: user._showQQImg1 || '',
            showQQImg2: user._showQQImg2 || '',
            showQQUrl: user._showQQUrl || '',

            // #49 — hideHeroes — client: e.hideHeroes && setHideHeroes(e.hideHeroes)
            // JANGAN kirim [] kosong (truthy!) → masuk setHideHeroes → akses this.channelSpecial._hideHeroes
            // channelSpecial sudah di-set sebelumnya di line 114795, jadi aman kalau channelSpecial = object
            // Tapi lebih aman: hanya kirim kalau ada data

            // #50 — channelSpecial — WAJIB selalu object, JANGAN undefined!
            // client: WelfareInfoManager.getInstance().channelSpecial = e.channelSpecial
            // downstream: channelSpecial._weeklyRewardTag (line 126253) → crash jika undefined
            // downstream: channelSpecial._show, _vip, _bg, _icon (line 218803) → crash jika undefined
            channelSpecial: Object.keys(channelSpecialData).length > 0 ? channelSpecialData : { _show: false, _vip: 0, _bg: '', _icon: '', _btn1Url: '', _btn2Url: '', _honghuUrl: '', _honghuUrlStartTime: 0, _honghuUrlEndTime: 0, _weeklyRewardTag: '', _hideHeroes: [] },

            // #51 — expedition
            expedition: expeditionData,

            // #52 — timeTrial
            timeTrial: timeTrialData,
            timeTrialNextOpenTime: safeParse(miscJson._timeTrialNextOpenTime) || 0,

            // #53 — retrieve
            retrieve: retrieveData,

            // #54 — battleMedal
            battleMedal: Object.keys(battleMedalData).length > 0 ? battleMedalData : undefined,

            // #55 — shopNewHeroes
            shopNewHeroes: safeParse(miscJson._shopNewHeroes) || undefined,

            // #56 — teamDungeon
            teamDungeon: safeParse(miscJson._teamDungeon) || undefined,

            // #57 — teamServerHttpUrl
            teamServerHttpUrl: config.dungeonServerUrl || '',

            // #58-62 — teamDungeon related
            teamDungeonOpenTime: safeParse(miscJson._teamDungeonOpenTime) || undefined,
            teamDungeonTask: safeParse(miscJson._teamDungeonTask) || undefined,
            teamDungeonSplBcst: safeParse(miscJson._teamDungeonSplBcst) || undefined,
            teamDungeonNormBcst: safeParse(miscJson._teamDungeonNormBcst) || undefined,
            teamDungeonHideInfo: safeParse(miscJson._teamDungeonHideInfo) || undefined,

            // #63 — templeLess
            templeLess: safeParse(miscJson._templeLess) || undefined,

            // #64 — teamDungeonInvitedFriends
            teamDungeonInvitedFriends: safeParse(miscJson._teamDungeonInvitedFriends) || undefined,

            // #65 — myTeamServerSocketUrl
            myTeamServerSocketUrl: config.dungeonServerUrl || '',

            // #66 — questionnaires
            questionnaires: safeParse(miscJson._questionnaires) || undefined,

            // #67 — resonance
            resonance: resonanceData,

            // #68 — userTopBattle / topBattleInfo
            userTopBattle: safeParse(miscJson._userTopBattle) || undefined,
            topBattleInfo: safeParse(miscJson._topBattleInfo) || undefined,

            // #69 — fastTeam
            fastTeam: Object.keys(fastTeamInfo).length > 0 ? { _teamInfo: fastTeamInfo } : undefined,

            // #70 — blacklist
            blacklist: blacklistData,

            // #71 — forbiddenChat
            forbiddenChat: forbiddenChatData,

            // #72 — gravity
            gravity: gravityData,

            // #73 — littleGame
            littleGame: safeParse(miscJson._littleGame) || undefined,

            // #74 — curMainTask — WAJIB object! client: Object.keys(e.curMainTask) → crash jika null/undefined
            curMainTask: safeParse(miscJson._curMainTask, {}),

            // #75 — checkin
            checkin: checkinData,

            // #76 — userGuild / userGuildPub
            userGuild: Object.keys(userGuildData).length > 0 ? userGuildData : undefined,
            userGuildPub: undefined,

            // #78 — guildLevel / guildTreasureMatchRet
            guildLevel: undefined,
            guildTreasureMatchRet: undefined,

            // #79 — newUser
            newUser: isNewUser,

            // #80 — broadcastRecord
            broadcastRecord: safeParse(miscJson._broadcastRecord) || []
        };

        // NOTE: Response envelope HARUS menyertakan serverTime & server0Time:
        //   { ret: 0, data: JSON.stringify(enterGameData), serverTime: Date.now(), server0Time: 25200000, compress: false }
        //   Pastikan buildSuccess() menambahkan serverTime & server0Time di envelope!

        // Hapus field yang undefined (client guard: hanya di-parse jika truthy)
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

// Reference to socketIO for Kickout (set by index.js)
let socketIO = null;
module.exports.setSocketIO = function(io) { socketIO = io; };
