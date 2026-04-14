/**
 * Default Data Generator for New Users
 * 
 * 100% derived from client code analysis and resource/json config files.
 * 
 * Sources:
 * - resource/json/constant.json -> initial values
 * - resource/json/summonEnergy.json -> initial summon energy
 * - UserDataParser.saveUserData() (line 77643-77724) -> field structure
 * - HeroAttribute defaults (line 84951-84961) -> attribute structure
 * - Serializable base class (line 51891-51894) -> _prefix stripping
 * 
 * Every field in this file is derived from client code analysis.
 * The client reads these fields in UserDataParser.saveUserData(e)
 * where `e` is the parsed JSON from the enterGame response.
 */

const GAME_CONSTANTS = {
    // From resource/json/constant.json[1]
    startUserLevel: 1,
    maxUserLevel: 300,
    startUserExp: 0,
    startDiamond: 0,
    startGold: 0,
    startHero: '1205',          // Starting hero displayId
    startHeroLevel: '3',        // Starting hero level
    startChapter: 801,          // Starting chapter
    startLesson: 10101,         // Starting lesson
    playerIcon: 'hero_icon_1205',
    idle: 28800,                // Max idle time (8h in seconds)
    changeNameNeeded: '200',    // Diamonds needed to change name
    playerNameLength: 12,
    resetTime: '6:00:00',      // Daily reset at 6 AM
};

// Item IDs from client (hardcoded in item configs)
const ITEM_IDS = {
    DIAMONDID: 101,
    GOLDID: 102,
    PLAYEREXPERIENCEID: 103,
    PLAYERLEVELID: 104,
    PLAYERVIPEXPERIENCEID: 105,
    PLAYERVIPLEVELID: 106,
    PLAYERVIPEXPALLID: 107,
    SoulCoinID: 111,
    ArenaCoinID: 112,
    SnakeCoinID: 113,
    TeamCoinID: 114,
    HonourCoinID: 115,
    EXPERIENCECAPSULEID: 131,
    EVOLVECAPSULEID: 132,
    EnergyStone: 136,
};

/**
 * Generate default totalProps (inventory) for new user
 * 
 * Client: setBackpack(e) reads e.totalProps._items as {[itemId]: {_id, _num}}
 * From constant.json: startDiamond=0, startGold=0, startUserLevel=1
 */
function generateDefaultTotalProps() {
    return {
        _items: {
            [ITEM_IDS.DIAMONDID]: { _id: ITEM_IDS.DIAMONDID, _num: GAME_CONSTANTS.startDiamond },
            [ITEM_IDS.GOLDID]: { _id: ITEM_IDS.GOLDID, _num: GAME_CONSTANTS.startGold },
            [ITEM_IDS.PLAYEREXPERIENCEID]: { _id: ITEM_IDS.PLAYEREXPERIENCEID, _num: GAME_CONSTANTS.startUserExp },
            [ITEM_IDS.PLAYERLEVELID]: { _id: ITEM_IDS.PLAYERLEVELID, _num: GAME_CONSTANTS.startUserLevel },
            [ITEM_IDS.PLAYERVIPEXPERIENCEID]: { _id: ITEM_IDS.PLAYERVIPEXPERIENCEID, _num: 0 },
            [ITEM_IDS.PLAYERVIPLEVELID]: { _id: ITEM_IDS.PLAYERVIPLEVELID, _num: 0 },
            [ITEM_IDS.PLAYERVIPEXPALLID]: { _id: ITEM_IDS.PLAYERVIPEXPALLID, _num: 0 },
            [ITEM_IDS.SoulCoinID]: { _id: ITEM_IDS.SoulCoinID, _num: 0 },
            [ITEM_IDS.ArenaCoinID]: { _id: ITEM_IDS.ArenaCoinID, _num: 0 },
            [ITEM_IDS.SnakeCoinID]: { _id: ITEM_IDS.SnakeCoinID, _num: 0 },
            [ITEM_IDS.TeamCoinID]: { _id: ITEM_IDS.TeamCoinID, _num: 0 },
            [ITEM_IDS.HonourCoinID]: { _id: ITEM_IDS.HonourCoinID, _num: 0 },
            [ITEM_IDS.EXPERIENCECAPSULEID]: { _id: ITEM_IDS.EXPERIENCECAPSULEID, _num: 0 },
            [ITEM_IDS.EVOLVECAPSULEID]: { _id: ITEM_IDS.EVOLVECAPSULEID, _num: 0 },
            [ITEM_IDS.EnergyStone]: { _id: ITEM_IDS.EnergyStone, _num: 0 },
        },
    };
}

/**
 * Generate default hero data for new user
 * 
 * Client: HerosManager.readByData(e.heros) reads e.heros._heros
 * From constant.json: startHero="1205", startHeroLevel="3"
 * From HeroAttribute (line 84951): 31 attributes, all default 0 except _level
 */
function generateDefaultHero(userId) {
    const heroId = userId; // hero instance ID = userId

    return {
        _heros: {
            [heroId]: {
                _heroId: heroId,
                _heroDisplayId: GAME_CONSTANTS.startHero,
                _heroStar: 0,
                _heroTag: [0],
                _fragment: 0,
                _superSkillResetCount: 0,
                _potentialResetCount: 0,
                _expeditionMaxLevel: 0,
                _heroBaseAttr: {
                    _level: parseInt(GAME_CONSTANTS.startHeroLevel),
                    _evolveLevel: 0,
                    // All 31 attributes default to 0 (from HeroAttribute constructor line 84951)
                    _hp: 0, _attack: 0, _armor: 0, _speed: 0,
                    _hit: 0, _dodge: 0, _block: 0, _blockEffect: 0,
                    _skillDamage: 0, _critical: 0, _criticalResist: 0,
                    _criticalDamage: 0, _armorBreak: 0, _damageReduce: 0,
                    _controlResist: 0, _trueDamage: 0, _energy: 0,
                    _power: 0, _extraArmor: 0, _hpPercent: 0,
                    _armorPercent: 0, _attackPercent: 0, _speedPercent: 0,
                    _orghp: 0, _superDamage: 0, _healPlus: 0,
                    _healerPlus: 0, _damageDown: 0, _shielderPlus: 0,
                    _damageUp: 0,
                },
                _superSkillLevel: {},
                _potentialLevel: {},
                _qigong: null,
                _qigongTmp: null,
                _qigongStage: 1,
                _qigongTmpPower: 0,
                _totalCost: null,
                _breakInfo: null,
                _gemstoneSuitId: null,
                _linkTo: null,
                _linkFrom: null,
            },
        },
    };
}

/**
 * Generate complete enterGame response for a NEW user
 * 
 * 100% from UserDataParser.saveUserData() (line 77643-77724)
 * and constant.json initial values.
 * 
 * @param {string} userId
 * @param {string} nickName
 * @param {number} serverId
 * @returns {object} Complete enterGame response data
 */
function generateNewUserData(userId, nickName, serverId) {
    const now = Date.now();

    return {
        // ==========================================
        // CORE FIELDS (unconditional, no null check)
        // ==========================================

        // currency (line 77642): ts.currency = e.currency
        // Client reads unconditionally: ts.currency = e.currency
        currency: {
            _diamond: GAME_CONSTANTS.startDiamond,
            _gold: GAME_CONSTANTS.startGold,
        },

        // newUser flag (line 77433): loginSuccessCallBack checks e.newUser
        newUser: true,

        // broadcastRecord (line 77449): ts.chatJoinRecord({_record: t.broadcastRecord})
        // Used unconditionally in callback
        broadcastRecord: {},

        // user (line 77670-77673): setUserInfo(e)
        // Reads e.user._id, e.user._nickName, etc. unconditionally
        user: {
            _id: userId,
            _pwd: '',
            _nickName: nickName || userId,
            _headImage: GAME_CONSTANTS.playerIcon,
            _lastLoginTime: now,
            _createTime: now,
            _bulletinVersions: {},
            _oriServerId: serverId || 1,
            _nickChangeTimes: 0,
        },

        // hangup (line 77674-77678): setOnHook(e)
        // Reads e.hangup._curLess, e.hangup._maxPassLesson, etc.
        hangup: {
            _curLess: GAME_CONSTANTS.startLesson,
            _maxPassLesson: GAME_CONSTANTS.startLesson,
            _maxPassChapter: GAME_CONSTANTS.startChapter,
            _haveGotChapterReward: {},
            _clickGlobalWarBuffTag: '',
            _buyFund: false,
            _haveGotFundReward: {},
        },

        // summon (line 77678-77682): setSummon(e)
        // From summonEnergy.json: summonEnergy = 800
        summon: {
            _energy: 800,
            _wishList: [],
            _wishVersion: 0,
            _canCommonFreeTime: 0,
            _canSuperFreeTime: 0,
            _summonTimes: {},
        },

        // totalProps (line 77683-77692): setBackpack(e)
        // Reads e.totalProps._items as {[itemId]: {_id, _num}}
        totalProps: generateDefaultTotalProps(),

        // backpackLevel (line 77692): e.backpackLevel -> UserInfoSingleton.heroBackPack
        // Top-level field, NOT inside totalProps
        backpackLevel: 1,

        // imprint (line 77693-77701): setSign(e)
        // Reads e.imprint._items
        imprint: { _items: [] },

        // equip (line 77703-77709): setEquip(e)
        // Reads e.equip._suits as {[heroId]: {_suitItems, _suitAttrs, ...}}
        equip: { _suits: {} },

        // weapon (line 77704): weapon._items -> WeaponDataModel.deserialize
        weapon: { _items: {} },

        // genki (line 77705): genkiDataModel.deserialize(e.genki)
        genki: null,

        // heros (line 77687): HerosManager.readByData(e.heros)
        // Reads e.heros._heros as {[heroId]: {hero data}}
        heros: generateDefaultHero(userId),

        // superSkill (line 77685): superSkill._skills -> iterated, stored if _level != 0
        superSkill: { _skills: {} },

        // heroSkin (line 77686): HeroSkinModel.setSkinsWithServerData(e.heroSkin)
        heroSkin: null,

        // scheduleInfo (line 58004-58006): AllRefreshCount.initData(e.scheduleInfo)
        // ALL fields below are read from e.scheduleInfo in initData().
        // Fields WITHOUT void 0 != guard are read UNCONDITIONALLY — must exist or crash!
        // Verified against client constructor (line 58000) for default values.
        scheduleInfo: {
            // === UNCONDITIONAL (no guard) — CRASH if missing ===
            _marketDiamondRefreshCount: 0,
            _vipMarketDiamondRefreshCount: 0,
            _arenaAttackTimes: 0,
            _arenaBuyTimesCount: 0,
            _snakeResetTimes: 0,
            _snakeSweepCount: 0,
            _cellGameHaveGotReward: true,       // boolean, default true in constructor
            _cellGameHaveTimes: 0,
            _cellgameHaveSetHero: false,         // boolean, default false in constructor
            _strongEnemyTimes: 0,
            _strongEnemyBuyCount: 0,
            _mergeBossBuyCount: 0,
            // CounterpartSingleton.setCounterPartTime(e._dungeonTimes) — unconditional
            _dungeonTimes: 0,
            // CounterpartSingleton.setCounterPartBuyCount(e._dungeonBuyTimesCount) — unconditional
            _dungeonBuyTimesCount: 0,
            _karinBattleTimes: 0,
            _karinBuyBattleTimesCount: 0,
            _karinBuyFeetCount: 0,
            _entrustResetTimes: 0,
            // Dragon exchange — unconditional
            _dragonExchangeSSPoolId: 0,
            _dragonExchangeSSSPoolId: 0,
            // Team dungeon robots — unconditional, default [] in constructor
            _teamDugeonUsedRobots: [],
            // Space trial — unconditional (stored as _spaceTrialBuyCount on client)
            _timeTrialBuyTimesCount: 0,
            // Month card — unconditional
            _monthCardHaveGotReward: {},
            // Gold buy — unconditional
            _goldBuyCount: 0,
            // Like rank — unconditional
            _likeRank: {},
            // Maha adventure — unconditional
            _mahaAttackTimes: 0,
            _mahaBuyTimesCount: 0,
            // Guild — unconditional
            _guildBossTimes: 0,
            _guildBossTimesBuyCount: 0,
            _treasureTimes: 0,
            // Guild check-in — unconditional, passed to TeamInfoManager.playerSignInID()
            _guildCheckInType: 0,
            // Top battle — unconditional
            _topBattleTimes: 0,
            _topBattleBuyCount: 0,
            // Temple — unconditional
            _templeDailyReward: null,
            _templeYesterdayLess: null,
            // Click time gift — unconditional, boolean default false in constructor
            _clickTimeGift: false,
            // Expedition — unconditional assignments (not guarded)
            _clickExpedition: false,
            _expeditionSpeedUpCost: 0,
            // Gravity trial — unconditional
            _gravityTrialBuyTimesCount: 0,

            // === GUARDED with void 0 != (safe if missing, but include for completeness) ===
            _mineResetTimes: 0,
            _mineBuyResetTimesCount: 0,
            _mineBuyStepCount: 0,
            _templeBuyCount: 0,
            _trainingBuyCount: 0,
            _bossCptTimes: 0,
            _bossCptBuyCount: 0,
            _ballWarBuyCount: 0,
            // Expedition events — guarded (e._expeditionEvents &&)
            _expeditionEvents: null,
        },

        // dungeon (line 77710-77714): setCounterpart(e)
        // Reads e.dungeon._dungeons
        dungeon: { _dungeons: {} },

        // serverId (line 77723): UserInfoSingleton.getInstance().setServerId(e.serverId)
        // Top-level field, read unconditionally
        serverId: serverId || 1,

        // curMainTask (line 77720-77721): UserInfoSingleton.setMianTask(e.curMainTask)
        // Line 62521-62523: setMianTask does Object.keys(e).length check
        // CANNOT be null! Object.keys(null) throws TypeError
        // Empty array [] is safe: Object.keys([]).length === 0 -> sets _mainTask = null
        curMainTask: [],

        // ==========================================
        // WELFARE / GIFT FIELDS
        // ==========================================

        // giftInfo (line 77647-77650): WelfareInfoManager
        // Reads e.giftInfo._fristRecharge, e.giftInfo._haveGotVipRewrd, etc.
        giftInfo: {
            _fristRecharge: 0,
            _haveGotVipRewrd: 0,
            _buyVipGiftCount: 0,
            _onlineGift: 0,
            _gotBSAddToHomeReward: 0,
            _clickHonghuUrlTime: 0,
        },

        // checkin (line 77702-77703): WelfareInfoManager.setSignInInfo(e.checkin)
        checkin: null,

        // monthCard (line 77651): WelfareInfoManager.setMonthCardInfo(e.monthCard)
        monthCard: null,

        // recharge (line 77652): WelfareInfoManager.setRechargeInfo(e.recharge)
        recharge: null,

        // vipLog: WelfareInfoManager.setVipLogList(e.vipLog)
        vipLog: null,

        // cardLog: WelfareInfoManager.setMonthCardLogList(e.cardLog)
        cardLog: null,

        // timeBonusInfo: TimeLimitGiftBagManager.setTimeLimitGiftBag(e.timeBonusInfo)
        timeBonusInfo: null,

        // userDownloadReward: contains _isClick, _haveGotDlReward, _isBind, _haveGotBindReward
        userDownloadReward: null,

        // channelSpecial (line 77689): WelfareInfoManager.channelSpecial = e.channelSpecial
        channelSpecial: null,

        // hideHeroes: WelfareInfoManager.setHideHeroes(e.hideHeroes)
        hideHeroes: null,

        // enableShowQQ, showQQVip, showQQ, showQQImg1, showQQImg2, showQQUrl
        // QQ platform-specific fields
        enableShowQQ: false,
        showQQVip: false,
        showQQ: false,
        showQQImg1: null,
        showQQImg2: null,
        showQQUrl: null,

        // ==========================================
        // GUILD / TEAM FIELDS
        // ==========================================

        // userGuild (line 77715): TeamInfoManager.setUserTeamInfoModel(e.userGuild)
        userGuild: null,

        // userGuildPub (line 77716): TeamInfoManager.setUserTeamInfoModel(e.userGuildPub)
        userGuildPub: null,

        // guildLevel (line 77716): TeamInfoManager.setMyTeamLevel(e.guildLevel)
        guildLevel: null,

        // guildTreasureMatchRet: GuildTreasureManager.setTreasureMatchState()
        guildTreasureMatchRet: null,

        // guildName (line): TeamInfoManager.setTeamName(e.guildName)
        guildName: null,

        // guildActivePoints: TeamInfoManager.setActivePoints(e.guildActivePoints)
        guildActivePoints: null,

        // teamTraining: TeamTrainingManager.saveTeamTraining(e.teamTraining)
        teamTraining: null,

        // ==========================================
        // ARENA / PVP FIELDS
        // ==========================================

        // _arenaTeam (line 77656): AltarInfoManger.setArenaTeamInfo(e._arenaTeam)
        // NOTE: Leading underscore - client reads e._arenaTeam directly
        _arenaTeam: null,

        // _arenaSuper (line 77657): AltarInfoManger.setArenaSuperInfo(e._arenaSuper)
        // NOTE: Leading underscore - client reads e._arenaSuper directly
        _arenaSuper: null,

        // lastTeam (line 77661): reads e.lastTeam._lastTeamInfo -> firstLoginSetMyTeam()
        // Line 62326-62342: firstLoginSetMyTeam iterates keys, creates LastTeamInfo per type
        // Line 62343: getMyTeamByType(e) accesses t._lastTeamInfo[e]
        // Line 62606: LAST_TEAM_TYPE.HANGUP = 9 (used by OnHookSingleton.getLastOnHookTeam)
        //
        // IMPORTANT: New user starts with EMPTY HANGUP team (no pre-placed heroes).
        // The tutorial (steps 2105-2107) teaches the user to manually select heroes.
        // If a hero is pre-placed here, initGotoBattle() will pre-place it in formation,
        // then clickHeroListItem() will toggle-REMOVE it instead of adding it (BUG).
        // Client safely handles empty team: battleTeamRemoveDecomposeHero() returns []
        // when team is undefined/empty (line 54713: if(!t) return n).
        // Team is saved properly after tutorial step 2107 via saveGuideTeam.
        lastTeam: {
            _lastTeamInfo: {
                9: {  // LAST_TEAM_TYPE.HANGUP
                    _team: [],
                    _superSkill: [],
                },
            },
        },

        // ==========================================
        // EXPEDITION / DUNGEON FIELDS
        // ==========================================

        // expedition (line 77669): ExpeditionManager.setExpeditionModel(e.expedition)
        expedition: null,

        // teamDungeon: TeamworkManager.setLoginInfo(e.teamDungeon)
        teamDungeon: null,

        // teamServerHttpUrl: TeamworkManager.teamServerHttpUrl
        // From ts.loginInfo.serverItem.dungeonurl (not from enterGame response)
        teamServerHttpUrl: null,

        // teamDungeonOpenTime: TeamworkManager.teamDungeonOpenTime
        teamDungeonOpenTime: null,

        // teamDungeonTask: TeamworkManager.teamDungeonTask.deserialize(e.teamDungeonTask)
        teamDungeonTask: null,

        // teamDungeonSplBcst: SetTeamDungeonBroadcast(e.teamDungeonSplBcst, true)
        teamDungeonSplBcst: null,

        // teamDungeonNormBcst: SetTeamDungeonBroadcast(e.teamDungeonNormBcst, false)
        teamDungeonNormBcst: null,

        // teamDungeonHideInfo: TeamworkManager.setTeamDungeonHideInfo(e.teamDungeonHideInfo)
        teamDungeonHideInfo: null,

        // teamDungeonInvitedFriends: TeamworkManager.teamDungeonInvitedFriends
        teamDungeonInvitedFriends: null,

        // myTeamServerSocketUrl: ts.loginInfo.serverItem.dungeonurl
        // NOTE: This comes from loginInfo, NOT enterGame response
        // But client may still read it from response, include as null
        myTeamServerSocketUrl: null,

        // ==========================================
        // TRIAL / TOWER FIELDS
        // ==========================================

        // templeLess: TrialManager.setTempleLess(e.templeLess)
        templeLess: null,

        // timeTrial: SpaceTrialManager.setSpaceTrialModel(e.timeTrial, e.timeTrialNextOpenTime)
        timeTrial: null,

        // timeTrialNextOpenTime: (see above)
        timeTrialNextOpenTime: null,

        // gravity: TrialManager.setGravityTrialInfo(e) -- reads e.gravity from full response
        gravity: null,

        // littleGame: LittleGameManager.saveData(e.littleGame)
        // Reads _gotBattleReward, _gotChapterReward, _clickTime
        littleGame: null,

        // cellgameHaveSetHero: scheduleInfo._cellgameHaveSetHero = e.cellgameHaveSetHero
        // Top-level boolean field
        cellgameHaveSetHero: false,

        // ==========================================
        // GLOBAL WAR FIELDS (top-level, NOT inside hangup)
        // Source: UserDataParser reads e.globalWarBuffTag etc. directly
        // ==========================================

        globalWarBuffTag: null,
        globalWarLastRank: null,
        globalWarBuff: null,
        globalWarBuffEndTime: null,

        // ==========================================
        // BALL WAR FIELDS
        // ==========================================

        userBallWar: null,
        ballWarState: null,
        ballBroadcast: null,
        ballWarInfo: null,

        // ==========================================
        // TOP BATTLE FIELDS
        // ==========================================

        topBattleInfo: null,
        userTopBattle: null,

        // summonLog (line 61545-61551): SummonSingleton.setSummomLogList(e)
        // Reads e.summonLog -> array of SummonLog objects
        summonLog: null,

        // blacklist (line 58622-58625): BroadcastSingleton.setBlacklistPlayerInfo(e)
        // Reads e.blacklist -> array of player info objects
        blacklist: null,

        // ==========================================
        // MISC GAME FIELDS
        // ==========================================

        // clickSystem (line 77656): UserClickSingleton
        // Reads e.clickSystem._clickSys -> iterates key->value
        clickSystem: {
            _clickSys: { 1: false, 2: false },
        },

        // dragonEquiped (line 77716): ItemsCommonSingleton.initDragonBallEquip(e.dragonEquiped)
        dragonEquiped: {},

        // timesInfo (line 77653): TimesInfoSingleton.initData(e.timesInfo)
        timesInfo: null,

        // guide (line 77654): GuideInfoManager.setGuideInfo(e.guide)
        guide: null,

        // timeMachine (line 77655): TimeLeapSingleton.initData(e.timeMachine)
        timeMachine: null,

        // gemstone: EquipInfoManager.saveGemStone(e) reads e.gemstone._items
        gemstone: null,

        // resonance (line 77675): HerosManager.setResonanceModel(e.resonance)
        resonance: null,

        // fastTeam (line 77676): HerosManager.saveLoginFastTeam(e.fastTeam)
        fastTeam: null,

        // battleMedal (line 77672): BattleMedalManager.setBattleMedal(e.battleMedal)
        battleMedal: null,

        // retrieve: GetBackReourceManager.setRetrieveModel(e.retrieve)
        retrieve: null,

        // training: PadipataInfoManager.setPadipataModel(e.training)
        training: null,

        // warInfo: GlobalWarManager.setWarLoginInfo(e.warInfo)
        warInfo: null,

        // userWar: GlobalWarManager.setUserWarModel(e.userWar)
        userWar: null,

        // headEffect: new HeadEffectModel; r.deserialize(e.headEffect)
        headEffect: null,

        // questionnaires: UserInfoSingleton.setQuestData(e.questionnaires)
        questionnaires: null,

        // YouTuberRecruit: contains _hidden field
        YouTuberRecruit: null,

        // userYouTuberRecruit: YouTuberModel.initUserInfo(e.userYouTuberRecruit)
        userYouTuberRecruit: null,

        // forbiddenChat: BroadcastSingleton.setUserBidden(e.forbiddenChat)
        forbiddenChat: null,

        // shopNewHeroes: ShopInfoManager.shopNewHeroes = e.shopNewHeroes
        shopNewHeroes: null,

        // ==========================================
        // SERVER INFO FIELDS
        // ==========================================

        // serverVersion: UserInfoSingleton.serverVersion = e.serverVersion
        serverVersion: null,

        // serverOpenDate (line 77724): UserInfoSingleton.setServerOpenDate(e.serverOpenDate)
        serverOpenDate: now,

        // heroImageVersion: UserInfoSingleton.heroImageVersion = e.heroImageVersion
        heroImageVersion: null,

        // superImageVersion: UserInfoSingleton.superImageVersion = e.superImageVersion
        superImageVersion: null,

        // onlineBulletin: BulletinSingleton.setBulletInfo(e.onlineBulletin)
        onlineBulletin: null,

        // karinStartTime: TowerDataManager.setKarinTime(e.karinStartTime, e.karinEndTime)
        karinStartTime: null,

        // karinEndTime: (see above)
        karinEndTime: null,
    };
}

/**
 * Merge loaded user data with defaults to prevent null crashes
 * 
 * PROBLEM: When loading existing user data from database, some fields
 * may be null/undefined from previous test runs or data corruption.
 * The client's UserDataParser.saveUserData() reads many fields UNCONDITIONALLY
 * (no null check), causing TypeError crashes like:
 *   Object.keys(null) -> TypeError: can't convert null to object (setMainTask)
 *   e.currency._diamond -> TypeError: cannot read property '_diamond' of null
 *   e.hangup._curLess -> TypeError: cannot read property '_curLess' of null
 * 
 * FIELDS THAT MUST NOT BE NULL (client reads unconditionally):
 *   currency, user, hangup, summon, totalProps, heros, superSkill,
 *   scheduleInfo, dragonEquiped, clickSystem, curMainTask
 * 
 * @param {object|null} loadedData - Data loaded from database (may have nulls)
 * @param {string} userId - User ID for generating fresh defaults
 * @param {string} nickName - Nickname for defaults
 * @param {number} serverId - Server ID for defaults
 * @returns {object} Sanitized data safe for client consumption
 */
function mergeWithDefaults(loadedData, userId, nickName, serverId) {
    // Generate fresh defaults as the base
    const defaults = generateNewUserData(userId, nickName, serverId);
    
    if (!loadedData || typeof loadedData !== 'object') {
        return defaults;
    }
    
    // For each key in defaults, use loaded value only if non-null
    for (const key of Object.keys(defaults)) {
        if (loadedData.hasOwnProperty(key) && loadedData[key] !== null && loadedData[key] !== undefined) {
            defaults[key] = loadedData[key];
        }
    }
    
    // Also preserve any extra keys from loadedData that aren't in defaults
    // (future-proofing for new fields added in updates)
    for (const key of Object.keys(loadedData)) {
        if (!defaults.hasOwnProperty(key)) {
            defaults[key] = loadedData[key];
        }
    }
    
    return defaults;
}

module.exports = { generateNewUserData, generateDefaultTotalProps, generateDefaultHero, mergeWithDefaults, GAME_CONSTANTS, ITEM_IDS };