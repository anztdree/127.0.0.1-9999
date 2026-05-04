# enterGame — Analisis Lengkap Protocol Server

> **PRINSIP**: Semua field WAJIB. Tidak ada STUB, OVERRIDE, FORCE, BYPASS, DUMMY, atau ASUMSI.
> Setiap field yang client baca HARUS dikirim server dengan format wire yang benar dan `_` prefix.
> Setiap field HARUS menunjukkan format JSON wire yang eksak dan DEFAULT VALUE untuk user baru.
> Jika client deserialize pakai `Serializable`, semua key di wire HARUS pakai `_` prefix.
> Jika client baca langsung tanpa deserialize, ikuti format yang client harapkan.
> **Setiap default value HARUS cross-reference dengan resource/json atau client source — bukan asumsi.**

---

## 1. Overview

`enterGame` adalah handler pertama dan paling kritis di game server. Client memanggil:

```
{type:'user', action:'enterGame', loginToken, userId, serverId, version:'1.0', language, gameVersion}
```

Response diproses oleh `UserDataParser.saveUserData(e)` di `main.min(unminify).js:114793-114873`.
Total **102 field** wajib harus dikembalikan. Satu field hilang atau salah format = client crash atau data corrupt.

### Aturan Format Wire

1. **Serializable Model**: Client deserialize dengan `obj.deserialize(e)` → auto-strip `_` prefix. **Semua key di wire HARUS pakai `_` prefix.**
2. **Direct Read**: Client baca langsung `e.fieldName` → ikuti nama field yang client baca.
3. **Pengecualian**: Field `timesInfo` dan `forbiddenChat` TIDAK pakai `_` prefix (client baca langsung tanpa Serializable).
4. **Keyed Object**: Semua `_items` dan `_heros` dan `_suits` dll. adalah **object keyed** (bukan array indexed), kecuali jika dinyatakan sebagai array.
5. **Null vs Object**: Jika default adalah `null`, kirim `null`. Jika default adalah `{}` atau `[]`, kirim object/array kosong — JANGAN kirim `null`.
6. **isCommonType rule**: Client `Serializable.isCommonType` hanya menerima `string`, `number`, `boolean`. Semua field yang bukan primitive HARUS pakai deserialize khusus.

---

## 2. Complete Default Response JSON

Berikut adalah JSON lengkap yang HARUS dikembalikan server untuk **user baru**. Ini adalah sumber kebenaran untuk coding. Setiap default value sudah cross-reference dengan `constant.json` dan client source.

```json
{
  "currency": "",
  "user": {
    "_id": "<userId>",
    "_pwd": "",
    "_nickName": "Guest_XXXX",
    "_headImage": 0,
    "_lastLoginTime": 0,
    "_createTime": 0,
    "_bulletinVersions": "",
    "_oriServerId": "<serverId>",
    "_nickChangeTimes": 0
  },
  "hangup": {
    "_curLess": 10101,
    "_maxPassLesson": 10101,
    "_haveGotChapterReward": {},
    "_maxPassChapter": 0,
    "_clickGlobalWarBuffTag": "",
    "_buyFund": false,
    "_haveGotFundReward": {}
  },
  "globalWarBuffTag": "",
  "globalWarLastRank": 0,
  "globalWarBuff": 0,
  "globalWarBuffEndTime": 0,
  "summon": {
    "_energy": 0,
    "_wishList": [],
    "_wishVersion": 0,
    "_canCommonFreeTime": 0,
    "_canSuperFreeTime": 0,
    "_summonTimes": {}
  },
  "totalProps": {
    "_items": {}
  },
  "backpackLevel": 1,
  "imprint": {
    "_items": {}
  },
  "equip": {
    "_suits": {}
  },
  "weapon": {
    "_items": {}
  },
  "genki": {
    "_id": "0",
    "_items": [],
    "_curSmeltNormalExp": 0,
    "_curSmeltSuperExp": 0
  },
  "dungeon": {
    "_dungeons": [
      {"_type": 1, "_curMaxLevel": 0, "_lastLevel": 0},
      {"_type": 2, "_curMaxLevel": 0, "_lastLevel": 0},
      {"_type": 3, "_curMaxLevel": 0, "_lastLevel": 0},
      {"_type": 4, "_curMaxLevel": 0, "_lastLevel": 0},
      {"_type": 5, "_curMaxLevel": 0, "_lastLevel": 0},
      {"_type": 6, "_curMaxLevel": 0, "_lastLevel": 0},
      {"_type": 7, "_curMaxLevel": 0, "_lastLevel": 0},
      {"_type": 8, "_curMaxLevel": 0, "_lastLevel": 0}
    ]
  },
  "superSkill": {
    "_skills": {}
  },
  "heroSkin": {
    "_skins": {}
  },
  "heros": {
    "_heros": {}
  },
  "summonLog": [],
  "userGuild": null,
  "userGuildPub": null,
  "curMainTask": null,
  "checkin": {
    "_id": "",
    "_activeItem": [],
    "_curCycle": 1,
    "_maxActiveDay": 0,
    "_lastActiveDate": 0
  },
  "channelSpecial": {
    "_honghuUrl": "",
    "_honghuUrlStartTime": 0,
    "_honghuUrlEndTime": 0
  },
  "scheduleInfo": {
    "_marketDiamondRefreshCount": 0,
    "_vipMarketDiamondRefreshCount": 0,
    "_arenaAttackTimes": 5,
    "_arenaBuyTimesCount": 0,
    "_snakeResetTimes": 0,
    "_snakeSweepCount": 0,
    "_cellGameHaveGotReward": false,
    "_cellGameHaveTimes": 1,
    "_cellgameHaveSetHero": false,
    "_strongEnemyTimes": 6,
    "_strongEnemyBuyCount": 0,
    "_mergeBossBuyCount": 0,
    "_dungeonTimes": {},
    "_dungeonBuyTimesCount": {},
    "_karinBattleTimes": 10,
    "_karinBuyBattleTimesCount": 0,
    "_karinBuyFeetCount": 0,
    "_entrustResetTimes": 0,
    "_dragonExchangeSSPoolId": 0,
    "_dragonExchangeSSSPoolId": 0,
    "_teamDugeonUsedRobots": [],
    "_timeTrialBuyTimesCount": 0,
    "_monthCardHaveGotReward": {},
    "_goldBuyCount": 0,
    "_likeRank": 0,
    "_mahaAttackTimes": 5,
    "_mahaBuyTimesCount": 0,
    "_mineResetTimes": 0,
    "_mineBuyResetTimesCount": 0,
    "_mineBuyStepCount": 0,
    "_guildBossTimes": 2,
    "_guildBossTimesBuyCount": 0,
    "_treasureTimes": 0,
    "_guildCheckInType": 0,
    "_templeBuyCount": 0,
    "_trainingBuyCount": 0,
    "_bossCptTimes": 0,
    "_bossCptBuyCount": 0,
    "_ballWarBuyCount": 0,
    "_expeditionEvents": null,
    "_clickExpedition": 0,
    "_expeditionSpeedUpCost": 0,
    "_templeDailyReward": null,
    "_templeYesterdayLess": 0,
    "_topBattleTimes": 0,
    "_topBattleBuyCount": 0,
    "_gravityTrialBuyTimesCount": 0
  },
  "dragonEquiped": {},
  "vipLog": [],
  "cardLog": [],
  "guide": "",
  "guildName": "",
  "clickSystem": {
    "_clickSys": {}
  },
  "giftInfo": {
    "_id": "",
    "_levelGiftCount": {},
    "_levelBuyGift": {},
    "_goldBuyCount": 0,
    "_fristRecharge": {"_canGetReward": false, "_haveGotReward": false},
    "_buyVipGiftCount": {},
    "_onlineGift": {"_curId": 0, "_nextTime": 0},
    "_isBuyFund": false,
    "_fundGiftCount": {},
    "_gotChannelWeeklyRewardTag": "",
    "_haveGotVipRewrd": {},
    "_gotBSAddToHomeReward": false,
    "_clickHonghuUrlTime": 0
  },
  "monthCard": {
    "_id": "",
    "_card": {}
  },
  "recharge": {
    "_id": "",
    "_haveBought": {}
  },
  "timesInfo": {
    "marketRefreshTimes": 5,
    "marketRefreshTimesRecover": 0,
    "vipMarketRefreshTimes": 5,
    "vipMarketRefreshTimesRecover": 0,
    "templeTimes": 10,
    "templeTimesRecover": 0,
    "mahaTimes": 5,
    "mahaTimesRecover": 0,
    "mineSteps": 50,
    "mineStepsRecover": 0,
    "karinFeet": 5,
    "karinFeetRecover": 0
  },
  "userDownloadReward": {
    "_isClick": false,
    "_haveGotDlReward": false,
    "_isBind": false,
    "_haveGotBindReward": false
  },
  "YouTuberRecruit": null,
  "userYouTuberRecruit": null,
  "timeMachine": {
    "_items": {}
  },
  "_arenaTeam": {},
  "_arenaSuper": {},
  "timeBonusInfo": null,
  "onlineBulletin": null,
  "karinStartTime": 0,
  "karinEndTime": 0,
  "serverVersion": "1.0",
  "serverOpenDate": 0,
  "lastTeam": {
    "_lastTeamInfo": {}
  },
  "heroImageVersion": "",
  "superImageVersion": "",
  "training": {
    "_id": "",
    "_type": 0,
    "_times": 10,
    "_timesStartRecover": 0,
    "_surpriseReward": null,
    "_questionId": 0,
    "_enemyId": 0,
    "_cfgId": 0
  },
  "warInfo": null,
  "userWar": null,
  "serverId": 0,
  "headEffect": {
    "_effects": []
  },
  "userBallWar": {
    "_state": 0,
    "_signedUp": 0,
    "_times": 3,
    "_defence": {}
  },
  "ballWarState": 0,
  "ballBroadcast": "",
  "ballWarInfo": {
    "_signed": false,
    "_fieldId": "",
    "_point": 0,
    "_topMsg": ""
  },
  "guildActivePoints": 0,
  "expedition": {
    "_id": "",
    "_passLesson": {},
    "_machines": {},
    "_collection": [],
    "_teams": {},
    "_times": 10,
    "_timesStartRecover": 0
  },
  "timeTrial": {
    "_id": "",
    "_levelStars": {},
    "_level": 1,
    "_totalStars": 0,
    "_gotStarReward": {},
    "_haveTimes": 5,
    "_timesStartRecover": 0,
    "_lastRefreshTime": 0,
    "_startTime": 0
  },
  "timeTrialNextOpenTime": 0,
  "retrieve": {},
  "battleMedal": {
    "_id": "",
    "_battleMedalId": "",
    "_cycle": 0,
    "_nextRefreshTime": 0,
    "_level": 0,
    "_curExp": 0,
    "_openSuper": false,
    "_task": {},
    "_levelReward": {},
    "_shopBuyTimes": {},
    "_buyLevelCount": 0
  },
  "shopNewHeroes": {},
  "teamDungeon": {
    "_myTeam": null,
    "_canCreateTeamTime": 0,
    "_nextCanJoinTime": 0
  },
  "teamServerHttpUrl": "",
  "teamDungeonOpenTime": 0,
  "teamDungeonTask": null,
  "teamDungeonSplBcst": "",
  "teamDungeonNormBcst": "",
  "teamDungeonHideInfo": "",
  "teamDungeonInvitedFriends": null,
  "myTeamServerSocketUrl": "",
  "gemstone": {
    "_items": {}
  },
  "questionnaires": null,
  "resonance": {
    "_id": "",
    "_diamondCabin": 0,
    "_cabins": {},
    "_buySeatCount": 0,
    "_totalTalent": 0,
    "_unlockSpecial": false
  },
  "topBattleInfo": null,
  "userTopBattle": null,
  "fastTeam": {
    "_teamInfo": {}
  },
  "blacklist": [],
  "forbiddenChat": {
    "users": [],
    "finishTime": {}
  },
  "gravity": {
    "_id": "",
    "_haveTimes": 10,
    "_timesStartRecover": 0,
    "_lastLess": 0,
    "_lastTime": 0
  },
  "littleGame": {
    "_gotBattleReward": {},
    "_gotChapterReward": {},
    "_clickTime": 0
  },
  "guildLevel": 0,
  "guildTreasureMatchRet": null,
  "templeLess": null,
  "newUser": 1,
  "_firstEnter": 1,
  "_bulletinRead": "",
  "teamTraining": {
    "_id": "",
    "_levels": {},
    "_unlock": false,
    "_version": ""
  },
  "gameVersion": "",
  "enableShowQQ": 0,
  "showQQVip": 0,
  "showQQ": "",
  "showQQImg1": "",
  "showQQImg2": "",
  "showQQUrl": "",
  "hideHeroes": {},
  "cellgameHaveSetHero": 0,
  "broadcastRecord": []
}
```

---

## 3. Field Reference Table

Daftar lengkap 102 field dengan format wire, default value, dan resource/json source.

| # | Field | Wire Format | Default Value | resource/json Source | Client Handler |
|---|-------|-------------|---------------|---------------------|----------------|
| 1 | `currency` | `string` | `""` | `currencyDisplay.json` keys: "CNY","USD","KRW","VND","IRR" | `ts.currency = e.currency` |
| 2 | `user` | `object` (Serializable) | Lihat §4.2 | `constant.json`: startHero="1205", playerIcon="hero_icon_1205" | `setUserInfo(e)` → `n = e.user` |
| 3 | `hangup` | `object` (Serializable) | Lihat §4.3 | `constant.json`: startLesson=10101, startChapter=801 | `setOnHook(e)` → `n = e.hangup` |
| 4 | `globalWarBuffTag` | `string` | `""` | — | `t.setGlobalWarBuffTag(e.globalWarBuffTag)` |
| 5 | `globalWarLastRank` | `number` | `0` | — | `t.setGlobalWarLastRank(e.globalWarLastRank)` |
| 6 | `globalWarBuff` | `number` | `0` | — | `t.globalWarBuff = e.globalWarBuff` |
| 7 | `globalWarBuffEndTime` | `number` | `0` | — | `t.globalWarBuffEndTime = e.globalWarBuffEndTime` |
| 8 | `summon` | `object` (Serializable) | Lihat §4.8 | `constant.json`: wishListInitialHero="1519,1528,..." | `setSummon(e)` → `n = e.summon` |
| 9 | `totalProps` | `object` (`{_items:{}}`) | `{"_items": {}}` | `thingsID.json`: 101=diamond, 102=gold | `setBackpack(e)` → `n = e.totalProps._items` |
| 10 | `backpackLevel` | `number` | `1` | `constant.json`: startUserLevel=1 | `UserInfoSingleton.getInstance().heroBackPack = i` |
| 11 | `imprint` | `object` (`{_items:{}}`) | `{"_items": {}}` | `signAdd.json`: imprint configs | `setSign(e)` → `n = e.imprint._items` |
| 12 | `equip` | `object` (`{_suits:{}}`) | `{"_suits": {}}` | `equip.json`, `equipSuit.json`: equip configs | `setEquip(e)` → `e.equip._suits` |
| 13 | `weapon` | `object` (`{_items:{}}`) | `{"_items": {}}` | `weapon.json`, `weaponPiece.json`: weapon configs | `e.weapon._items` → keyed object |
| 14 | `genki` | `object` (Serializable) | Lihat §4.14 | `genki.json`: genki configs | `genkiDataModel.deserialize(e.genki)` |
| 15 | `dungeon` | `object` (`{_dungeons:[...]}`) | Lihat §4.15 | `expDungeon.json` dll: dungeon configs | `e.dungeon._dungeons` → array |
| 16 | `superSkill` | `object` (`{_skills:{}}`) | `{"_skills": {}}` | `superSkill.json`: super skill configs | `SuperSkillSingleton.initSuperSkill(e.superSkill)` |
| 17 | `heroSkin` | `object` (`{_skins:{}}`) | `{"_skins": {}}` | `heroSkin.json`: skin configs | `HerosManager.setSkinData(e.heroSkin)` |
| 18 | `heros` | `object` (`{_heros:{}}`) | `{"_heros": {}}` | `hero.json`: startHero="1205", `heroLevelUpWhite.json` | `HerosManager.readByData(e.heros)` |
| 19 | `summonLog` | `array` | `[]` | — | `SummonSingleton.setSummomLogList(e)` |
| 20 | `userGuild` | `object\|null` | `null` | `guild.json`, `guildTech.json` | `t.setUserTeamInfoModel(e.userGuild)` + `e.userGuild._tech` |
| 21 | `userGuildPub` | `object\|null` | `null` | `guild.json` | `t.setUserTeamInfoModel(e.userGuildPub)` |
| 22 | `curMainTask` | `object\|null` | `null` | — | `UserInfoSingleton.setMianTask(e.curMainTask)` |
| 23 | `checkin` | `object` (Serializable) | Lihat §4.23 | `register.json`: checkin reward configs | `WelfareInfoManager.setSignInInfo(e.checkin)` |
| 24 | `channelSpecial` | `object` | Lihat §4.24 | — | `WelfareInfoManager.channelSpecial = e.channelSpecial` |
| 25 | `scheduleInfo` | `object` (47 fields) | Lihat §4.25 | `constant.json`: semua *_times values | `AllRefreshCount.initData(e.scheduleInfo)` |
| 26 | `dragonEquiped` | `object` (keyed) | `{}` | `dragonBallWar.json`: dragon ball configs | `ItemsCommonSingleton.initDragonBallEquip(e.dragonEquiped)` |
| 27 | `vipLog` | `array` | `[]` | `vip.json`: VIP level configs | `WelfareInfoManager.setVipLogList(e.vipLog)` |
| 28 | `cardLog` | `array` | `[]` | `monthCard.json`: month card configs | `WelfareInfoManager.setMonthCardLogList(e.cardLog)` |
| 29 | `guide` | `string` | `""` | `tutorial.json`: tutorial configs | `GuideInfoManager.setGuideInfo(e.guide)` |
| 30 | `guildName` | `string` | `""` | `guild.json`: guildCreatePrice=50 | `TeamInfoManager.setTeamName(e.guildName)` |
| 31 | `clickSystem` | `object` | `{"_clickSys": {}}` | — | `for (n in e.clickSystem._clickSys)` |
| 32 | `giftInfo` | `object` (Serializable) | Lihat §4.32 | `firstRecharge.json`, `monthCard.json` | `WelfareInfoManager` (banyak sub-field) |
| 33 | `monthCard` | `object` (Serializable) | `{"_id":"","_card":{}}` | `monthCard.json`: card configs | `WelfareInfoManager.setMonthCardInfo(e.monthCard)` |
| 34 | `recharge` | `object` (Serializable) | `{"_id":"","_haveBought":{}}` | `recharge.json`: recharge configs | `WelfareInfoManager.setRechargeInfo(e.recharge)` |
| 35 | `timesInfo` | `object` (12 fields, **NO `_` prefix**) | Lihat §4.35 | `constant.json`: marketRefreshTimeMax=5, vipMarketRefreshTimeMax=5, templeTestTimes=10, mahaAdventureTimesMax=5, mineActionPointMax=50, karinTowerFeet=5 | `TimesInfoSingleton.initData(e.timesInfo)` |
| 36 | `userDownloadReward` | `object` | Lihat §4.36 | `downloadAward.json`: download reward configs | `UserInfoSingleton.userDownloadModel = {...}` |
| 37 | `YouTuberRecruit` | `object\|null` | `null` | — | `if (e.YouTuberRecruit && !e.YouTuberRecruit._hidden)` |
| 38 | `userYouTuberRecruit` | `object\|null` | `null` | — | `e.userYouTuberRecruit && ...` |
| 39 | `timeMachine` | `object` (`{_items:{}}`) | `{"_items": {}}` | `timeMachine.json`: time travel configs | `TimeLeapSingleton.initData(e.timeMachine)` |
| 40 | `_arenaTeam` | `object` | `{}` | `arenaRobot.json`: arena configs | `AltarInfoManger.setArenaTeamInfo(e._arenaTeam)` |
| 41 | `_arenaSuper` | `object` | `{}` | — | `AltarInfoManger.setArenaSuperInfo(e._arenaSuper)` |
| 42 | `timeBonusInfo` | `object\|null` | `null` | `timeLimitBonus.json`: bonus configs | `TimeLimitGiftBagManager.setTimeLimitGiftBag(e.timeBonusInfo)` |
| 43 | `onlineBulletin` | `object\|null` | `null` | — | `BulletinSingleton.setBulletInfo(e.onlineBulletin)` |
| 44 | `karinStartTime` | `number` | `0` | `constant.json`: karinTowerOpen="12:00:00", karinTowerEnd="20:00:00" | `TowerDataManager.setKarinTime(e.karinStartTime, e.karinEndTime)` |
| 45 | `karinEndTime` | `number` | `0` | `constant.json`: karinTowerEnd="20:00:00" | `TowerDataManager.setKarinTime(_, e.karinEndTime)` |
| 46 | `serverVersion` | `string` | `"1.0"` | — | `UserInfoSingleton.serverVersion = e.serverVersion` |
| 47 | `serverOpenDate` | `number` | `0` | — | `UserInfoSingleton.setServerOpenDate(e.serverOpenDate)` |
| 48 | `lastTeam` | `object` | `{"_lastTeamInfo": {}}` | — | `UserInfoSingleton.firstLoginSetMyTeam(e.lastTeam._lastTeamInfo)` |
| 49 | `heroImageVersion` | `string` | `""` | — | `UserInfoSingleton.heroImageVersion = e.heroImageVersion` |
| 50 | `superImageVersion` | `string` | `""` | — | `UserInfoSingleton.superImageVersion = e.superImageVersion` |
| 51 | `training` | `object` (Serializable) | Lihat §4.51 | `constant.json`: trainingTimesMax (via `training.json`), `trainingTimesBuy` | `PadipataInfoManager.setPadipataModel(e.training)` |
| 52 | `warInfo` | `object\|null` | `null` | `globalWar.json`: war configs | `GlobalWarManager.setWarLoginInfo(e.warInfo)` |
| 53 | `userWar` | `object\|null` | `null` | `globalWar.json` | `GlobalWarManager.setUserWarModel(e.userWar)` |
| 54 | `serverId` | `number` | dari request | — | `UserInfoSingleton.setServerId(e.serverId)` |
| 55 | `headEffect` | `object` (Serializable) | `{"_effects": []}` | `headFrame.json`, `headIconEffect.json` | `new HeadEffectModel().deserialize(e.headEffect)` |
| 56 | `userBallWar` | `object` | Lihat §4.56 | `dragonBallWar.json`: dragonBallWarTimesMax=3 | `TeamInfoManager.UserBallWar = e.userBallWar` |
| 57 | `ballWarState` | `number` | `0` | — | `TeamInfoManager.BallWarState = e.ballWarState` |
| 58 | `ballBroadcast` | `string` | `""` | — | `TeamInfoManager.setBallWarBrodecast(e.ballBroadcast)` |
| 59 | `ballWarInfo` | `object` (Serializable) | Lihat §4.59 | `dragonBallWar.json` | `new GuildBallWarInfo().deserialize(e.ballWarInfo)` |
| 60 | `guildActivePoints` | `number` | `0` | `guildActivePoint.json` | `TeamInfoManager.setActivePoints(e.guildActivePoints)` |
| 61 | `expedition` | `object` (Serializable) | Lihat §4.61 | `constant.json`: expeditionBattleTimes=10, `expedition.json` | `ExpeditionManager.setExpeditionModel(e.expedition)` |
| 62 | `timeTrial` | `object` (Serializable) | Lihat §4.62 | — | `SpaceTrialManager.setSpaceTrialModel(e.timeTrial, e.timeTrialNextOpenTime)` |
| 63 | `timeTrialNextOpenTime` | `number` | `0` | — | `n.SpaceTrialInfo.timeTrialNextOpenTime = t` |
| 64 | `retrieve` | `object` | `{}` | — | `GetBackReourceManager.setRetrieveModel(e.retrieve)` |
| 65 | `battleMedal` | `object` (Serializable) | Lihat §4.65 | `battleMedal.json`: medal configs | `BattleMedalManager.setBattleMedal(e.battleMedal)` |
| 66 | `shopNewHeroes` | `object` (keyed by heroDisplayId) | `{}` | `hero.json`: hero display IDs | `ShopInfoManager.shopNewHero = e.shopNewHeroes` |
| 67 | `teamDungeon` | `object` | Lihat §4.67 | `teamDungeon.json`: team dungeon configs | `TeamworkManager.setLoginInfo(e.teamDungeon)` |
| 68 | `teamServerHttpUrl` | `string` | `""` | — | `TeamworkManager.teamServerHttpUrl = e.teamServerHttpUrl` |
| 69 | `teamDungeonOpenTime` | `number` | `0` | — | `TeamworkManager.teamDungeonOpenTime = e.teamDungeonOpenTime` |
| 70 | `teamDungeonTask` | `object\|null` | `null` | — | `TeamworkManager.teamDungeonTask.deserialize(e.teamDungeonTask)` |
| 71 | `teamDungeonSplBcst` | `string` | `""` | — | `TeamworkManager.SetTeamDungeonBroadcast(e.teamDungeonSplBcst, true)` |
| 72 | `teamDungeonNormBcst` | `string` | `""` | — | `TeamworkManager.SetTeamDungeonBroadcast(e.teamDungeonNormBcst, false)` |
| 73 | `teamDungeonHideInfo` | `string` | `""` | — | `TeamworkManager.setTeamDungeonHideInfo(e.teamDungeonHideInfo)` |
| 74 | `teamDungeonInvitedFriends` | `array\|null` | `null` | — | `TeamworkManager.teamDungeonInvitedFriends = e.teamDungeonInvitedFriends` |
| 75 | `myTeamServerSocketUrl` | `string` | `""` | — | `ts.loginInfo.serverItem.dungeonurl = e.myTeamServerSocketUrl` |
| 76 | `gemstone` | `object` (`{_items:{}}`) | `{"_items": {}}` | `jewel.json`, `jewSuit.json`: jewel configs | `EquipInfoManager.saveGemStone(e)` → `e.gemstone._items` |
| 77 | `questionnaires` | `object\|null` | `null` | — | `UserInfoSingleton.setQuestData(e.questionnaires)` |
| 78 | `resonance` | `object` (Serializable) | Lihat §4.78 | — | `HerosManager.setResonanceModel(e.resonance)` |
| 79 | `topBattleInfo` | `object\|null` | `null` | `topBattle.json`: top battle configs | `TopBattleManager.topBattleInfo.deserialize(e.topBattleInfo)` |
| 80 | `userTopBattle` | `object\|null` | `null` | `topBattle.json` | `TopBattleManager.userTopBattle.deserialize(e.userTopBattle)` |
| 81 | `fastTeam` | `object` | `{"_teamInfo": {}}` | — | `HerosManager.saveLoginFastTeam(e.fastTeam)` → `e.fastTeam._teamInfo` |
| 82 | `blacklist` | `array` | `[]` | — | `BroadcastSingleton.setBlacklistPlayerInfo(e)` → `e.blacklist` |
| 83 | `forbiddenChat` | `object` (**NO `_` prefix**) | Lihat §4.83 | — | `BroadcastSingleton.setUserBidden(e.forbiddenChat)` |
| 84 | `gravity` | `object` (Serializable) | Lihat §4.84 | `gravityTest.json`, `gravityTestConstant.json` | `TrialManager.setGravityTrialInfo(e)` → `e.gravity` |
| 85 | `littleGame` | `object` | Lihat §4.85 | — | `LittleGameManager.saveData(e.littleGame)` |
| 86 | `guildLevel` | `number` | `0` | `guild.json`: guild level configs | `TeamInfoManager.setMyTeamLevel(e.guildLevel)` |
| 87 | `guildTreasureMatchRet` | `number\|null` | `null` | — | `GuildTreasureManager.setTreasureMatchState(e.guildTreasureMatchRet)` |
| 88 | `templeLess` | `object\|null` | `null` | `templeTest.json`: temple configs | `TrialManager.setTempleLess(e.templeLess)` |
| 89 | `newUser` | `number` | `1` | — | `if (e.newUser)` |
| 90 | `_firstEnter` | `number` | `1` | — | (internal flag) |
| 91 | `_bulletinRead` | `string` | `""` | — | (internal state) |
| 92 | `teamTraining` | `object` (Serializable) | Lihat §4.92 | `teamTraining.json`, `teamTrainingLimit.json` | `TeamTrainingManager.saveTeamTraining(e.teamTraining)` |
| 93 | `gameVersion` | `string` | `""` | — | (echo dari request) |
| 94 | `enableShowQQ` | `number` | `0` | — | `WelfareInfoManager.enableShowQQ = e.enableShowQQ` |
| 95 | `showQQVip` | `number` | `0` | — | `WelfareInfoManager.showQQVip = e.showQQVip` |
| 96 | `showQQ` | `string` | `""` | — | `WelfareInfoManager.showQQ = e.showQQ` |
| 97 | `showQQImg1` | `string` | `""` | — | `WelfareInfoManager.showQQImg1 = e.showQQImg1` |
| 98 | `showQQImg2` | `string` | `""` | — | `WelfareInfoManager.showQQImg2 = e.showQQImg2` |
| 99 | `showQQUrl` | `string` | `""` | — | `WelfareInfoManager.showQQUrl = e.showQQUrl` |
| 100 | `hideHeroes` | `object` | `{}` | — | `WelfareInfoManager.setHideHeroes(e.hideHeroes)` |
| 101 | `cellgameHaveSetHero` | `number` | `0` | — | `e.scheduleInfo._cellgameHaveSetHero = e.cellgameHaveSetHero` |
| 102 | `broadcastRecord` | `array` | `[]` | — | `ts.chatJoinRecord({_record: t.broadcastRecord})` |

---

## 4. Detail Format untuk Field Kompleks — dengan Default Values & resource/json Source

Setiap sub-section menunjukkan format JSON wire yang **eksak** sesuai yang client harapkan,
beserta **default value** dan **resource/json source** untuk setiap sub-field.

---

### 4.1 `currency` — String

```json
""
```

**Penjelasan**: Ini adalah **string** yang merupakan index ke `currencyDisplay.json`. Nilai yang valid:
- `"CNY"` — Chinese Yuan → `"{0}元"` (cn), `"￥{0}"` (en)
- `"USD"` — US Dollar → `"${0}"`
- `"KRW"` — Korean Won → `"₩{0}"`
- `"VND"` — Vietnamese Dong → `"{0}盾"` (cn), `"{0}₫"` (en)
- `"IRR"` — Iranian Rial → `"IRR{0}"`

**PENTING**: Ini BUKAN `{_diamond, _gold}`. Diamond dan gold adalah ITEMS di `totalProps._items` (itemId 101 = diamond, itemId 102 = gold, dari `thingsID.json`).

**Default user baru**: `""` (kosong = belum set currency)

---

### 4.2 `user` — UserInfoSingleton

Client baca (Line 114874-114884):
```javascript
t.userId = n._id;
t.userPassward = n._pwd;
t.userNickName = n._nickName;
t.userHeadImage = n._headImage;
t.userLastLoginTime = n._lastLoginTime;
t.createTime = n._createTime;
t.bulletinVersions = n._bulletinVersions;
t.setOriServerId(n._oriServerId);
n._nickChangeTimes && (t.nickChangeTimes = n._nickChangeTimes);
```

**Default untuk user baru**:
```json
{
  "_id": "<userId>",
  "_pwd": "",
  "_nickName": "Guest_XXXX",
  "_headImage": 0,
  "_lastLoginTime": 0,
  "_createTime": 0,
  "_bulletinVersions": "",
  "_oriServerId": "<serverId>",
  "_nickChangeTimes": 0
}
```

| Sub-field | Tipe | Default | resource/json Source | Catatan |
|-----------|------|---------|---------------------|---------|
| `_id` | string | `<userId>` | — | ID user dari DB |
| `_pwd` | string | `""` | — | Password (kosong untuk token auth) |
| `_nickName` | string | `"Guest_XXXX"` | `constant.json`: playerNameLength=12 | Max 12 karakter |
| `_headImage` | number | `0` | `constant.json`: playerIcon="hero_icon_1205", `playerIcon.json`: 87 icons (9001-9087) | Index avatar, 0 = default |
| `_lastLoginTime` | number | `0` | — | Timestamp login terakhir, diupdate saat enterGame |
| `_createTime` | number | `0` | — | Timestamp pembuatan akun |
| `_bulletinVersions` | string | `""` | — | Versi bulletin yang sudah dibaca |
| `_oriServerId` | string | `<serverId>` | — | Server ID asal |
| `_nickChangeTimes` | number | `0` | `constant.json`: changeNameNeeded="200" | Jumlah kali ganti nama |

---

### 4.3 `hangup` — OnHookSingleton

Client baca (Line 114886-114900):
```javascript
t.lastSection = n._curLess;
t.maxPassLesson = n._maxPassLesson;
t.battleBeforeLesson = n._curLess;
t.haveGotChapterReward = n._haveGotChapterReward;
t.maxPassChapter = n._maxPassChapter;
t.clickGlobalWarBuffTag = n._clickGlobalWarBuffTag;
t.buyFund = n._buyFund;
t.haveGotFundReward = n._haveGotFundReward;
```

**Default untuk user baru**:
```json
{
  "_curLess": 10101,
  "_maxPassLesson": 10101,
  "_haveGotChapterReward": {},
  "_maxPassChapter": 0,
  "_clickGlobalWarBuffTag": "",
  "_buyFund": false,
  "_haveGotFundReward": {}
}
```

| Sub-field | Tipe | Default | resource/json Source | Catatan |
|-----------|------|---------|---------------------|---------|
| `_curLess` | number | `10101` | `constant.json`: startLesson=**10101** | Lesson saat ini |
| `_maxPassLesson` | number | `10101` | `constant.json`: startLesson=**10101** | Lesson terbesar yang sudah pass |
| `_haveGotChapterReward` | object | `{}` | — | Keyed by chapterId → boolean |
| `_maxPassChapter` | number | `0` | — | Chapter terbesar yang sudah pass (startChapter=801 tapi maxPass=0 karena belum pass) |
| `_clickGlobalWarBuffTag` | string | `""` | — | Tag buff global war |
| `_buyFund` | boolean | `false` | — | Apakah sudah beli fund |
| `_haveGotFundReward` | object | `{}` | — | Keyed by fundId → boolean |

---

### 4.4–4.7 `globalWarBuffTag`, `globalWarLastRank`, `globalWarBuff`, `globalWarBuffEndTime`

Keempat field ini adalah **top-level** (BUKAN nested di dalam `hangup`).

| # | Field | Tipe | Default | resource/json Source |
|---|-------|------|---------|---------------------|
| 4 | `globalWarBuffTag` | string | `""` | — |
| 5 | `globalWarLastRank` | number | `0` | — |
| 6 | `globalWarBuff` | number | `0` | — |
| 7 | `globalWarBuffEndTime` | number | `0` | — |

---

### 4.8 `summon` — SummonSingleton

Client baca (Line 114901-114911):
```javascript
t.energy = n._energy;
t.WishList = n._wishList;
t.WishVersion = n._wishVersion;
t.canCommonFreeTime = n._canCommonFreeTime;
t.canSuperFreeTime = n._canSuperFreeTime;
t._summonTimes = {};
for (var o in n._summonTimes) t._summonTimes[o] = n._summonTimes[o];
```

**Default untuk user baru**:
```json
{
  "_energy": 0,
  "_wishList": [],
  "_wishVersion": 0,
  "_canCommonFreeTime": 0,
  "_canSuperFreeTime": 0,
  "_summonTimes": {}
}
```

| Sub-field | Tipe | Default | resource/json Source | Catatan |
|-----------|------|---------|---------------------|---------|
| `_energy` | number | `0` | `constant.json`: luckyPoolCostID=521 | Energy summon |
| `_wishList` | array | `[]` | `constant.json`: wishListInitialHero="1519,1528,1521,1501,1504,1518,1503,1541,1520,1401,1511,1507,1508,1509,1506" | Default wish list dari config, bukan kosong |
| `_wishVersion` | number | `0` | — | Versi wish list |
| `_canCommonFreeTime` | number | `0` | — | Sisa free common summon |
| `_canSuperFreeTime` | number | `0` | — | Sisa free super summon |
| `_summonTimes` | object | `{}` | `summonPool.json`: pool configs | Keyed by poolId → number of summons |

**CATATAN PENTING tentang `_wishList`**: Meskipun default wire `[]` (kosong), client akan mengisi wishList dari `constant.json` wishListInitialHero saat pertama kali. Server kirim `[]` untuk user baru yang belum set wish list.

---

### 4.9 `totalProps` — Backpack (Items)

Client baca (Line 114912-114921):
```javascript
if (e.totalProps) {
    var n = e.totalProps._items;
    for (var o in n) {
        t.addItem(n[o]._id, n[o]._num, !1, !1, !1);
    }
}
```

**Default untuk user baru**:
```json
{
  "_items": {}
}
```

**Contoh dengan item (user baru dari `constant.json`: startDiamond=0, startGold=0)**:
```json
{
  "_items": {
    "0": {"_id": 101, "_num": 0},
    "1": {"_id": 102, "_num": 0}
  }
}
```

**Item ID reference** (dari `thingsID.json`):

| Item ID | Nama | Deskripsi | thingsType |
|---------|------|-----------|------------|
| 101 | Diamond | 钻石 | basis |
| 102 | Gold | 金币 | basis |
| 103 | Player EXP | 玩家经验 | exp |
| 105 | VIP EXP | 玩家VIP经验 | — |
| 111 | Soul Stone | 灵魂石 | — |
| 112 | Arena Coin | 武道币 | — |
| 113 | Snake Coin | 蛇道币 | — |
| 114 | Guild Coin | 战队币 | — |
| 115 | Glory Coin | 荣耀币 | — |
| 521 | Summon Orb | — | — |
| 522 | Advanced Summon Orb | — | — |

**PENTING**:
- `_items` adalah **object keyed** (bukan array). Key adalah index string ("0", "1", "2", ...).
- Setiap item: `{_id: number, _num: number}`.
- `constant.json`: startDiamond=**0**, startGold=**0** — user baru mulai tanpa diamond/gold.
- `currency` BUKAN penyimpan diamond/gold. Diamond dan gold ada di sini.

---

### 4.10 `backpackLevel` — Number

```json
1
```

`constant.json`: startUserLevel=**1**. Level backpack user baru = 1.
Client: `UserInfoSingleton.getInstance().heroBackPack = i` (dari e.backpackLevel).

---

### 4.11 `imprint` — SignInfoManager

Client baca (Line 114922-114930):
```javascript
if (e.imprint) {
    var n = e.imprint._items;
    for (var o in n) {
        var a = t.setSignInfoModel(n[o]);
        t.addSigns(a.id, a);
    }
}
```

**Default untuk user baru**:
```json
{
  "_items": {}
}
```

**Contoh imprint item** (dari `ImprintItem` deserialize, L123402):
```json
{
  "_items": {
    "0": {
      "_id": "1",
      "_displayId": 1001,
      "_heroId": "0",
      "_level": 1,
      "_star": 0,
      "_mainAttr": {"_items": []},
      "_starAttr": {"_items": []},
      "_viceAttr": [],
      "_addAttr": {},
      "_tmpViceAttr": [],
      "_totalCost": {"_items": []}
    }
  }
}
```

| Sub-field ImprintItem | Tipe | Default | resource/json Source | Catatan |
|-----------------------|------|---------|---------------------|---------|
| `_id` | string | `"1"` | — | ID imprint unik |
| `_displayId` | number | dari config | `signAdd.json`, `signLevelUp.json` | Display ID → client derive signType, part, quality |
| `_heroId` | string | `"0"` | — | Hero yang equip (0 = none) |
| `_level` | number | `1` | — | Level imprint |
| `_star` | number | `0` | `constant.json`: signStartStar=**0**, signMaxStar=**4** | Star imprint |
| `_mainAttr` | object | `{"_items": []}` | — | `{_items:[{_id,_num}]}` - atribut utama |
| `_starAttr` | object | `{"_items": []}` | — | `{_items:[{_id,_num}]}` - atribut star |
| `_viceAttr` | array | `[]` | — | Array of `ImprintViceAttr {attrId, attrValue, level}` |
| `_addAttr` | object | `{}` | — | Keyed map of additional attributes |
| `_tmpViceAttr` | array | `[]` | — | Array of `ImprintViceAttr` (temporary) |
| `_totalCost` | object | `{"_items": []}` | — | `{_items:[{_id,_num}]}` - total cost upgrade |

---

### 4.12 `equip` — EquipInfoManager

Client baca (`SetEquipDataToModel`, L130957-130983):
```javascript
e.prototype.SetEquipDataToModel = function (e) {
    var t = new EquipInfoModel();
    // _suitItems → [{_id, _pos}]
    for (var n = 0, o = e._suitItems; n < o.length; n++) {
        var a = o[n], r = new EquipItem();
        r.id = a._id; r.pos = a._pos;
        t.suitItems.push(r);
    }
    // _suitAttrs → [{_id, _num}]
    // _equipAttrs → [{_id, _num}]
    t.earrings.deserialize(e._earrings);
    t.weaponState = e._weaponState;
    return t;
};
```

**Default untuk user baru**:
```json
{
  "_suits": {}
}
```

**Contoh equip suit**:
```json
{
  "_suits": {
    "heroId1": {
      "_suitItems": [{"_id": 101, "_pos": 1}],
      "_suitAttrs": [{"_id": 1, "_num": 10}],
      "_equipAttrs": [{"_id": 1, "_num": 5}],
      "_earrings": {"_id": 0, "_level": 0, "_attrs": {"_items": []}},
      "_weaponState": 0
    }
  }
}
```

| Sub-field EquipSuit | Tipe | Default | resource/json Source | Catatan |
|---------------------|------|---------|---------------------|---------|
| `_suitItems` | array | `[]` | `equip.json`, `equipSuit.json` | `[{_id, _pos}]` — item equip per posisi |
| `_suitAttrs` | array | `[]` | — | `[{_id, _num}]` — atribut suit bonus |
| `_equipAttrs` | array | `[]` | — | `[{_id, _num}]` — atribut equip total |
| `_earrings` | object | `{"_id":0,"_level":0,"_attrs":{"_items":[]}}` | `earringLevelUp.json`, `earringQuilty.json`, `earringDeify.json` | `EarringsItem` deserialize |
| `_weaponState` | number | `0` | — | State weapon |

**Key** di `_suits` = heroId (string).

---

### 4.13 `weapon` — WeaponDataModel

Client baca (`WeaponDataModel` deserialize, L137133):
```javascript
var i = e.weapon._items;
for (var s in i) {
    var l = new WeaponDataModel();
    l.deserialize(i[s]);
    t.addToWeap(l.weaponId, l);
}
```

**Default untuk user baru**:
```json
{
  "_items": {}
}
```

**Contoh weapon item**:
```json
{
  "_items": {
    "0": {
      "_weaponId": "1",
      "_displayId": 2001,
      "_heroId": "0",
      "_star": 0,
      "_level": 1,
      "_attrs": {"_items": []},
      "_strengthenCost": {"_items": []},
      "_haloId": 0,
      "_haloLevel": 0,
      "_haloCost": {"_items": []}
    }
  }
}
```

| Sub-field WeaponDataModel | Tipe | Default | resource/json Source | Catatan |
|---------------------------|------|---------|---------------------|---------|
| `_weaponId` | string | `"1"` | — | ID weapon unik |
| `_displayId` | number | dari config | `weapon.json`: weapon configs, `constant.json`: weaponUnlockLevel=**40** | Display ID |
| `_heroId` | string | `"0"` | — | Hero yang equip (0 = none) |
| `_star` | number | `0` | — | Star weapon |
| `_level` | number | `1` | — | Level weapon |
| `_attrs` | object | `{"_items": []}` | — | `{_items:[{_id,_num}]}` - atribut weapon |
| `_strengthenCost` | object | `{"_items": []}` | `weaponStrengthen.json`, `weaponLevelUp.json` | `{_items:[{_id,_num}]}` - cost strengthen |
| `_haloId` | number | `0` | `weaponHalo.json` | Halo ID |
| `_haloLevel` | number | `0` | — | Halo level |
| `_haloCost` | object | `{"_items": []}` | — | `{_items:[{_id,_num}]}` - cost halo upgrade |

---

### 4.14 `genki` — GenkiModel

Client baca (`GenkiModel` deserialize, L132147):
```javascript
e.genki && t.genkiDataModel.deserialize(e.genki);
// GenkiModel.deserialize reads: _id, _items (array of GenkiItem), _curSmeltNormalExp, _curSmeltSuperExp
```

**Default untuk user baru**:
```json
{
  "_id": "0",
  "_items": [],
  "_curSmeltNormalExp": 0,
  "_curSmeltSuperExp": 0
}
```

**Contoh GenkiItem di `_items`** (`GenkiItem` deserialize, L132134):
```json
[
  {
    "_id": "1",
    "_displayId": 3001,
    "_heroId": "0",
    "_heroPos": 0,
    "_mainAttr": {"_items": [{"_id": 1, "_num": 10}]},
    "_viceAttr": {"_items": []},
    "_disable": 0
  }
]
```

| Sub-field GenkiModel | Tipe | Default | resource/json Source | Catatan |
|----------------------|------|---------|---------------------|---------|
| `_id` | string | `"0"` | — | ID genki data |
| `_items` | array | `[]` | `genki.json`, `genkiRandomBox.json` | Array GenkiItem (BUKAN keyed object) |
| `_curSmeltNormalExp` | number | `0` | — | Exp smelt normal saat ini |
| `_curSmeltSuperExp` | number | `0` | — | Exp smelt super saat ini |

| Sub-field GenkiItem | Tipe | Default | Catatan |
|---------------------|------|---------|---------|
| `_id` | string | `"1"` | ID genki unik |
| `_displayId` | number | dari config | Display ID dari `genki.json` |
| `_heroId` | string | `"0"` | Hero yang equip |
| `_heroPos` | number | `0` | Posisi hero |
| `_mainAttr` | object | `{"_items": [{"_id":0,"_num":0}]}` | `{_items:[{_id,_num}]}` - atribut utama |
| `_viceAttr` | object | `{"_items": []}` | `{_items:[{_id,_num}]}` - atribut vice |
| `_disable` | number | `0` | Status disable |

---

### 4.15 `dungeon` — CounterpartSingleton

Client baca:
```javascript
if (e.dungeon) {
    var n = e.dungeon._dungeons;
    t.setCounterPart(n);
}
// scheduleInfo._dungeonTimes → CounterpartSingleton.setCounterPartTime()
// scheduleInfo._dungeonBuyTimesCount → CounterpartSingleton.setCounterPartBuyCount()
```

**Default untuk user baru**:
```json
{
  "_dungeons": [
    {"_type": 1, "_curMaxLevel": 0, "_lastLevel": 0},
    {"_type": 2, "_curMaxLevel": 0, "_lastLevel": 0},
    {"_type": 3, "_curMaxLevel": 0, "_lastLevel": 0},
    {"_type": 4, "_curMaxLevel": 0, "_lastLevel": 0},
    {"_type": 5, "_curMaxLevel": 0, "_lastLevel": 0},
    {"_type": 6, "_curMaxLevel": 0, "_lastLevel": 0},
    {"_type": 7, "_curMaxLevel": 0, "_lastLevel": 0},
    {"_type": 8, "_curMaxLevel": 0, "_lastLevel": 0}
  ]
}
```

**DUNGEON_TYPE enum** (cross-reference `constant.json`):

| Value | Nama | Default Times | resource/json Source | Config Key |
|-------|------|---------------|---------------------|------------|
| 1 | EXP | 2 | `expDungeon.json` | `constant.json`: expDungeonTimes=**2** |
| 2 | EVOLVE | 2 | `evolveDungeon.json` | `constant.json`: evolveDungeonTimes=**2** |
| 3 | ENERGY | 2 | `energyDungeon.json` | `constant.json`: energyDungeonTimes=**2** |
| 4 | EQUIP | 2 | `equipDungeon.json` | `constant.json`: equipDungeonTimes=**2** |
| 5 | SINGA | 2 | `signDungeonA.json` | `constant.json`: signDungeonTimes=**2** |
| 6 | SINGB | 2 | `signDungeonB.json` | `constant.json`: signDungeonTimes=**2** |
| 7 | METAL | 2 | `metalDungeon.json` | `constant.json`: metalDungeonTimes=**2** |
| 8 | Z_STONE | 2 | `zStoneDungeon.json` | `constant.json`: zStoneDungeonTimes=**2** |

**PENTING**: Harus selalu 8 entry (type 1-8) meskipun user belum main dungeon.

---

### 4.16 `superSkill` — SuperSkillSingleton

Client baca (`initSuperSkill`, L91229 area):
```javascript
if (e) {
    var n = e._skills;
    for (var o in n) {
        var a = n[o];
        if (0 != a._level) {
            var r = new SuperSkillData(a._skillId, a._level, a._needEvolve, a._totalCost);
        }
    }
}
```

**Default untuk user baru**:
```json
{
  "_skills": {}
}
```

**Contoh skill item**:
```json
{
  "_skills": {
    "0": {
      "_skillId": 1001,
      "_level": 1,
      "_needEvolve": 0,
      "_totalCost": {"_items": []}
    }
  }
}
```

| Sub-field SuperSkillItem | Tipe | Default | resource/json Source | Catatan |
|--------------------------|------|---------|---------------------|---------|
| `_skillId` | number | dari config | `superSkill.json`: skill configs | ID skill |
| `_level` | number | `1` | — | Level skill |
| `_needEvolve` | number | `0` | — | Evolve level yang dibutuhkan |
| `_totalCost` | object | `{"_items": []}` | — | `{_items:[{_id,_num}]}` - total cost upgrade |

**Catatan**: Client skip entry jika `_level == 0`.

---

### 4.17 `heroSkin` — HeroSkinModel

Client baca:
```javascript
e.prototype.setSkinsWithServerData = function (e) {
    var t = this, n = e._skins;
    for (var o in n)
        for (var a = 0; a < n[o].length; a++)
            t.skins[o].push(n[o][a]);
}
```

**Default untuk user baru**:
```json
{
  "_skins": {}
}
```

**Contoh**:
```json
{
  "_skins": {
    "1001": [10001, 10002],
    "2001": [20001]
  }
}
```

- Key = heroDisplayId (string), cross-reference `heroSkin.json`, `heroSkinSkillIDMapping.json`
- Value = array of skinId (number)

---

### 4.18 `heros` — HerosManager

Client baca (`SetHeroDataToModel`, L134052):
```javascript
e.prototype.readByData = function (e) {
    var t = this, n = e._heros;
    for (var o in n) {
        var a = n[o], r = t.SetHeroDataToModel(a);
        t.addToHeros(r.heroId, r, !1);
    }
}
```

**Default untuk user baru**:
```json
{
  "_heros": {}
}
```

**Format lengkap per hero** (`SetHeroDataToModel` L134052-134112, `HeroAttribute` L133445):
```json
{
  "_heros": {
    "heroDisplayId": {
      "_heroId": "uniqueHeroId",
      "_heroDisplayId": 1001,
      "_heroStar": 0,
      "_expeditionMaxLevel": 0,
      "_heroTag": "",
      "_fragment": 0,
      "_superSkillResetCount": 0,
      "_potentialResetCount": 0,
      "_heroBaseAttr": {
        "_level": 1,
        "_evolveLevel": 0,
        "_power": 0,
        "_hp": 0,
        "_attack": 0,
        "_armor": 0,
        "_speed": 0,
        "_hit": 0,
        "_dodge": 0,
        "_block": 0,
        "_damageReduce": 0,
        "_armorBreak": 0,
        "_controlResist": 0,
        "_skillDamage": 0,
        "_criticalDamage": 0,
        "_blockEffect": 0,
        "_critical": 0,
        "_criticalResist": 0,
        "_trueDamage": 0,
        "_energy": 0,
        "_extraArmor": 0,
        "_hpPercent": 0,
        "_armorPercent": 0,
        "_attackPercent": 0,
        "_speedPercent": 0,
        "_orghp": 0,
        "_superDamage": 0,
        "_healPlus": 0,
        "_healerPlus": 0,
        "_damageDown": 0,
        "_shielderPlus": 0,
        "_damageUp": 0
      },
      "_superSkillLevel": [],
      "_potentialLevel": [],
      "_qigong": {"_items": []},
      "_qigongTmp": {"_items": []},
      "_qigongStage": 1,
      "_qigongTmpPower": 0,
      "_totalCost": {
        "_wakeUp": {"_items": []},
        "_earring": {"_items": []},
        "_levelUp": {"_items": []},
        "_evolve": {"_items": []},
        "_skill": {"_items": []},
        "_qigong": {"_items": []},
        "_heroBreak": {"_items": []}
      },
      "_breakInfo": {
        "_breakLevel": 0,
        "_level": 0,
        "_attr": {"_items": []}
      },
      "_gemstoneSuitId": 0,
      "_linkTo": [],
      "_linkFrom": ""
    }
  }
}
```

| Sub-field Hero | Tipe | Default | resource/json Source | Catatan |
|----------------|------|---------|---------------------|---------|
| `_heroId` | string | unique | — | ID hero instance |
| `_heroDisplayId` | number | dari config | `hero.json`: startHero=**"1205"**, `heroOrigin.json` | Display ID hero |
| `_heroStar` | number | `0` | `constant.json`: heroZeroStarMaxLevel=**100** | Star hero |
| `_expeditionMaxLevel` | number | `0` | — | Level max expedition |
| `_heroTag` | string | `""` | `hero.json`: tag (evil, saiyan, android, dll.) | Tag hero, bisa array→join |
| `_fragment` | number | `0` | `heroPiece.json` | Jumlah fragment |
| `_superSkillResetCount` | number | `0` | `constant.json`: superSkillRebirthID=**101**, superSkillRebirthNum=**50** | Reset super skill count |
| `_potentialResetCount` | number | `0` | — | Reset potential count |
| `_heroBaseAttr` | object | Lihat di atas | `heroLevelAttr.json`, `heroPower.json`, `heroQualityParam.json` | 32 atribut hero, semua default 0 kecuali `_level`=1, `_evolveLevel`=0 |
| `_superSkillLevel` | array | `[]` | `hero.json`: skillLevel | Level super skill |
| `_potentialLevel` | array | `[]` | `hero.json`: potential1, potential2 | Level potential |
| `_qigong` | object | `{"_items": []}` | `qigong.json`, `qigongQualityMaxPara.json` | Qigong data |
| `_qigongTmp` | object | `{"_items": []}` | — | Qigong temporary |
| `_qigongStage` | number | `1` | — | Stage qigong (default 1 jika undefined) |
| `_qigongTmpPower` | number | `0` | — | Power qigong temporary |
| `_totalCost` | object | Lihat di atas | — | 7 kategori cost, masing-masing `{_items: []}` |
| `_breakInfo` | object | Lihat di atas | `selfBreak.json`, `selfBreakDefault.json`, `selfBreakQuality.json` | Break info |
| `_gemstoneSuitId` | number | `0` | `jewSuit.json` | Gemstone suit ID |
| `_linkTo` | array | `[]` | `heroConnect.json` | Link ke hero lain |
| `_linkFrom` | string | `""` | `heroConnect.json` | Link dari hero lain |

**HeroAttribute** semua 30 atribut (via `HeroAttribute` L133445 deserialize):
Client `deserialize` reads `_hp`, `_attack`, `_armor`, `_speed`, `_hit`, `_dodge`, `_block`, `_damageReduce`, `_armorBreak`, `_controlResist`, `_skillDamage`, `_criticalDamage`, `_blockEffect`, `_critical`, `_criticalResist`, `_trueDamage`, `_energy`, `_power`, `_extraArmor`, `_hpPercent`, `_armorPercent`, `_attackPercent`, `_speedPercent`, `_orghp`, `_superDamage`, `_healPlus`, `_healerPlus`, `_damageDown`, `_shielderPlus`, `_damageUp` — semua default `0` dalam constructor.

---

### 4.19 `summonLog` — SummonSingleton

Client baca:
```javascript
if (t.summomLogList = [], e.summonLog) {
    for (var n in e.summonLog) {
        var o = new SummonLog();
        o.deserialize(e.summonLog[n]);
        t.summomLogList.push(o);
    }
}
```

**Default untuk user baru**: `[]`

**Format setiap entry**:
```json
[
  {
    "_userId": "xxx",
    "_userName": "Guest",
    "_heroDisplayId": 1001,
    "_time": 1234567890
  }
]
```

---

### 4.20–4.21 `userGuild`, `userGuildPub`

Client baca:
```javascript
e.userGuild && t.setUserTeamInfoModel(e.userGuild);
e.userGuildPub && t.setUserTeamInfoModel(e.userGuildPub);
// Jika userGuild ada, baca tech:
if (e.userGuild) {
    for (var n in e.userGuild._tech) {
        var o = e.userGuild._tech[n];
        t.totalLevelList[n] = o._totalLevel;
        var a = new GuildTech();
        a.deserialize(o);
        t.guildTech[n] = a;
    }
}
```

**Default untuk user baru**: `null` (user baru tidak punya guild)

**Jika user punya guild**, `userGuild` format:
```json
{
  "_tech": {}
}
```
Cross-reference: `guild.json`, `guildTech.json`, `guildTechAbility.json`

---

### 4.22 `curMainTask`

**Default**: `null`

---

### 4.23 `checkin` — WelfareInfoManager

Client baca:
```javascript
e.checkin && WelfareInfoManager.getInstance().setSignInInfo(e.checkin);
```

**Default untuk user baru**:
```json
{
  "_id": "",
  "_activeItem": [],
  "_curCycle": 1,
  "_maxActiveDay": 0,
  "_lastActiveDate": 0
}
```

| Sub-field | Tipe | Default | resource/json Source | Catatan |
|-----------|------|---------|---------------------|---------|
| `_id` | string | `""` | — | ID checkin |
| `_activeItem` | array | `[]` | `register.json`: 6 tiers × 30 days reward configs | Item aktif checkin |
| `_curCycle` | number | `1` | — | Cycle saat ini |
| `_maxActiveDay` | number | `0` | — | Hari aktif max |
| `_lastActiveDate` | number | `0` | — | Tanggal aktif terakhir |

---

### 4.24 `channelSpecial`

Client baca:
```javascript
WelfareInfoManager.getInstance().channelSpecial = e.channelSpecial;
// Kemudian baca sub-field:
// e.channelSpecial._honghuUrl
// e.channelSpecial._honghuUrlStartTime
// e.channelSpecial._honghuUrlEndTime
```

**Default untuk user baru**:
```json
{
  "_honghuUrl": "",
  "_honghuUrlStartTime": 0,
  "_honghuUrlEndTime": 0
}
```

---

### 4.25 `scheduleInfo` — AllRefreshCount

Client baca (`AllRefreshCount.initData`, L91229-91323):
```javascript
t._marketDiamondRefreshCount = e._marketDiamondRefreshCount;
t._vipMarketDiamondRefreshCount = e._vipMarketDiamondRefreshCount;
t._arenaAttackTimes = e._arenaAttackTimes;
t._arenaBuyTimesCount = e._arenaBuyTimesCount;
// ... (45+ fields, see full list below)
```

**Default untuk user baru** (cross-reference `constant.json`):

| Sub-field | Tipe | Default | constant.json Source | Catatan |
|-----------|------|---------|---------------------|---------|
| `_marketDiamondRefreshCount` | number | `0` | — | Jumlah diamond refresh market hari ini |
| `_vipMarketDiamondRefreshCount` | number | `0` | — | Jumlah diamond refresh VIP market hari ini |
| `_arenaAttackTimes` | number | **5** | `arenaAttackTimes=5` | Sisa attack times arena |
| `_arenaBuyTimesCount` | number | `0` | — | Jumlah buy arena times |
| `_snakeResetTimes` | number | `0` | — | Snake reset times |
| `_snakeSweepCount` | number | `0` | — | Snake sweep count |
| `_cellGameHaveGotReward` | boolean | **false** | — | User baru belum pernah dapat reward cell game. Constructor client = true, tapi logic game: false = belum dapat. Diputuskan: **false** sesuai game logic. |
| `_cellGameHaveTimes` | number | **1** | `cellGameTimes=1` | Cell game times |
| `_cellgameHaveSetHero` | boolean | **false** | — | Apakah sudah set hero cell game |
| `_strongEnemyTimes` | number | **6** | `bossAttackTimes=6` | Boss attack times |
| `_strongEnemyBuyCount` | number | `0` | — | Boss attack buy count |
| `_mergeBossBuyCount` | number | `0` | — | Merge boss buy count |
| `_dungeonTimes` | object (keyed) | `{}` | `constant.json`: expDungeonTimes=2, dll. | → `CounterpartSingleton.setCounterPartTime()` — **HARUS object**, BUKAN number 0!
| `_dungeonBuyTimesCount` | object (keyed) | `{}` | — | → `CounterpartSingleton.setCounterPartBuyCount()` — **HARUS object**, BUKAN number 0!
| `_karinBattleTimes` | number | **10** | `karinTowerBattleTimes=10` | Karin tower battle times |
| `_karinBuyBattleTimesCount` | number | `0` | — | Karin buy battle times |
| `_karinBuyFeetCount` | number | `0` | — | Karin buy feet count |
| `_entrustResetTimes` | number | `0` | — | Entrust reset times |
| `_dragonExchangeSSPoolId` | number | `0` | — | Dragon exchange SS pool ID |
| `_dragonExchangeSSSPoolId` | number | `0` | — | Dragon exchange SSS pool ID |
| `_teamDugeonUsedRobots` | array | `[]` | — | Team dungeon used robots |
| `_timeTrialBuyTimesCount` | number | `0` | — | → `_spaceTrialBuyCount` di client |
| `_monthCardHaveGotReward` | object | `{}` | — | → `WelfareInfoManager.setMonthCardHaveGotReward()` |
| `_goldBuyCount` | number | `0` | — | → `WelfareInfoManager.setGoldBuyCount()` |
| `_likeRank` | number | `0` | — | → `UserInfoSingleton.setRankLike()` |
| `_mahaAttackTimes` | number | **5** | `mahaAdventureTimesMax=5` | → `MahaAdventureSingleton.attackTimes` |
| `_mahaBuyTimesCount` | number | `0` | — | → `MahaAdventureSingleton.buyTimesCount` |
| `_mineResetTimes` | number | `0` | — | → `TheWildAdventureManager.ResetTimes` |
| `_mineBuyResetTimesCount` | number | `0` | — | → `TheWildAdventureManager.BuyResetTimesCount` |
| `_mineBuyStepCount` | number | `0` | — | → `TheWildAdventureManager.BuyStepCount` |
| `_guildBossTimes` | number | **2** | `guildBOSSTimes=2` | Guild boss times |
| `_guildBossTimesBuyCount` | number | `0` | — | Guild boss buy times |
| `_treasureTimes` | number | `0` | — | Treasure times |
| `_guildCheckInType` | number | `0` | — | → `TeamInfoManager.playerSignInID()` |
| `_templeBuyCount` | number | `0` | — | → `TrialManager.setTempleBuyCount()` |
| `_trainingBuyCount` | number | `0` | — | → `PadipataInfoManager.setTrainingBuyCount()` |
| `_bossCptTimes` | number | `0` | — | Boss captain times |
| `_bossCptBuyCount` | number | `0` | — | Boss captain buy count |
| `_ballWarBuyCount` | number | `0` | — | Ball war buy count |
| `_expeditionEvents` | object\|null | `null` | — | → `ExpeditionManager.saveExpeditionEvent()` |
| `_clickExpedition` | number | `0` | — | → `ExpeditionManager.clickExpedition` |
| `_expeditionSpeedUpCost` | number | `0` | — | → `ExpeditionManager.expeditionSpeedUpCost` |
| `_templeDailyReward` | object\|null | `null` | — | → `TrialManager.templeDailyReward` |
| `_templeYesterdayLess` | number | `0` | — | → `TrialManager.templeYesterdayLess` |
| `_topBattleTimes` | number | `0` | — | Top battle times |
| `_topBattleBuyCount` | number | `0` | — | Top battle buy count |
| `_gravityTrialBuyTimesCount` | number | `0` | — | Gravity trial buy times count |

---

### 4.26 `dragonEquiped` — ItemsCommonSingleton

Client baca: `ItemsCommonSingleton.getInstance().initDragonBallEquip(e.dragonEquiped)`

**Default**: `{}`

Cross-reference: `dragonBallWar.json`, `dragonExchange.json`, `dragonWish.json`

Format: keyed by slot/position → dragon ball item data.

---

### 4.27 `vipLog` — Array

**Default**: `[]`

Cross-reference: `vip.json`: 18 VIP levels (1-18) configs.

Format: array of VIP log entries.

---

### 4.28 `cardLog` — Array

**Default**: `[]`

Cross-reference: `monthCard.json`: card configs.

Format: array of card log entries.

---

### 4.29 `guide` — String

**Default**: `""`

Cross-reference: `tutorial.json`: tutorial step configs.

---

### 4.30 `guildName` — String

**Default**: `""`

Cross-reference: `guild.json`: guildCreatePrice=**50**, guildNameLength=**12**.

---

### 4.31 `clickSystem` — Object

Client baca: `for (var n in e.clickSystem._clickSys) UserClickSingleton.getInstance().setClickSys(n, e.clickSystem._clickSys[n]);`

**Default**: `{"_clickSys": {}}`

Format: keyed by click system ID → value (number/string/boolean).

---

### 4.32 `giftInfo` — GiftModel

Client baca (L114799-114811):
```javascript
if (e.giftInfo) {
    WelfareInfoManager.getInstance().setGotChannelWeeklyRewardTag(e.giftInfo);
    WelfareInfoManager.getInstance().setFirstRecharge(e.giftInfo._fristRecharge);
    WelfareInfoManager.getInstance().setVIPRewrd(e.giftInfo._haveGotVipRewrd);
    WelfareInfoManager.getInstance().setVIPPrerogativeGift(e.giftInfo._buyVipGiftCount);
    WelfareInfoManager.getInstance().setOnlineGift(e.giftInfo._onlineGift);
    var o = e.giftInfo._gotBSAddToHomeReward;
    UserInfoSingleton.getInstance().gotBSAddToHomeReward = o;
    e.giftInfo._clickHonghuUrlTime = e.giftInfo._clickHonghuUrlTime || 0;
    UserInfoSingleton.getInstance().userRedFoxCommunityModel._clickHonghuUrlTime = e.giftInfo._clickHonghuUrlTime;
}
```

**Default untuk user baru** (`GiftModel` L137225):
```json
{
  "_id": "",
  "_levelGiftCount": {},
  "_levelBuyGift": {},
  "_goldBuyCount": 0,
  "_fristRecharge": {"_canGetReward": false, "_haveGotReward": false},
  "_buyVipGiftCount": {},
  "_onlineGift": {"_curId": 0, "_nextTime": 0},
  "_isBuyFund": false,
  "_fundGiftCount": {},
  "_gotChannelWeeklyRewardTag": "",
  "_haveGotVipRewrd": {},
  "_gotBSAddToHomeReward": false,
  "_clickHonghuUrlTime": 0
}
```

| Sub-field | Tipe | Default | resource/json Source | Catatan |
|-----------|------|---------|---------------------|---------|
| `_id` | string | `""` | — | ID gift info |
| `_levelGiftCount` | object | `{}` | `levelBonus.json`, `levelBuyBonus.json` | Keyed by level → count |
| `_levelBuyGift` | object | `{}` | — | Keyed by level → `LevelBuyGiftItem {_id, _buyCount, _finishTime}` |
| `_goldBuyCount` | number | `0` | `constant.json`: goldBuyFree=**20**, goldBuyTimesMax=**10** | Gold buy count |
| `_fristRecharge` | object | `{"_canGetReward":false,"_haveGotReward":false}` | `firstRecharge.json` | FirstRechargeReward |
| `_buyVipGiftCount` | object | `{}` | `vipMarket.json`, `VIPBag.json` | Keyed by VIP gift ID → count |
| `_onlineGift` | object | `{"_curId":0,"_nextTime":0}` | `onlineBonus.json` | OnlineGiftItem |
| `_isBuyFund` | boolean | `false` | — | Apakah sudah beli fund |
| `_fundGiftCount` | object | `{}` | — | Keyed by fund ID → count |
| `_gotChannelWeeklyRewardTag` | string | `""` | — | Channel weekly reward tag |
| `_haveGotVipRewrd` | object | `{}` | `vipUpgrade.json` | Keyed by VIP level → boolean |
| `_gotBSAddToHomeReward` | boolean | `false` | — | BS add to home reward |
| `_clickHonghuUrlTime` | number | `0` | — | Honghu URL click time |

---

### 4.33 `monthCard` — MonthCard

Client baca: `WelfareInfoManager.getInstance().setMonthCardInfo(e.monthCard)`

**Default**: `{"_id": "", "_card": {}}`

Cross-reference: `monthCard.json`: card configs (duration, dailyReward, dll).

`_card` keyed by cardId → `{_haveBought, _haveGotDays, ...}`.

---

### 4.34 `recharge` — Recharge

Client baca: `WelfareInfoManager.getInstance().setRechargeInfo(e.recharge)`

**Default**: `{"_id": "", "_haveBought": {}}`

Cross-reference: `recharge.json`, `rechargeLevel.json`: recharge configs.

`_haveBought` keyed by rechargeId → count/boolean.

---

### 4.35 `timesInfo` — TimesInfoSingleton (NO `_` prefix!)

Client baca (`TimesInfoSingleton.initData`, L96001):
```javascript
t._marketRefreshTimes = e.marketRefreshTimes;
t._marketRefreshTimesRecover = e.marketRefreshTimesRecover;
t._vipMarketRefreshTimes = e.vipMarketRefreshTimes;
t._vipMarketRefreshTimesRecover = e.vipMarketRefreshTimesRecover;
TrialManager.getInstance().setTrialCount(e.templeTimes, e.templeTimesRecover);
MahaAdventureSingleton.getInstance().initAdventureTime(e.mahaTimes, e.mahaTimesRecover);
TheWildAdventureManager.getInstance().setTheWildAdventureCount(e.mineSteps, e.mineStepsRecover);
TowerDataManager.getInstance().setTowerCount(e.karinFeet, e.karinFeetRecover);
```

**Default untuk user baru** (cross-reference `constant.json`):

| Sub-field | Tipe | Default | constant.json Source | Catatan |
|-----------|------|---------|---------------------|---------|
| `marketRefreshTimes` | number | **5** | `marketRefreshTimeMax=5` | Market refresh times |
| `marketRefreshTimesRecover` | number | `0` | `marketRefreshTime=7200` (ms) | Market refresh recover |
| `vipMarketRefreshTimes` | number | **5** | `vipMarketRefreshTimeMax=5` | VIP market refresh times |
| `vipMarketRefreshTimesRecover` | number | `0` | `vipMarketRefreshTime=43200` (ms) | VIP market refresh recover |
| `templeTimes` | number | **10** | `templeTestTimes=10` | → `TrialManager.setTrialCount()` |
| `templeTimesRecover` | number | `0` | `templeTestTimesRefresh=1800` (ms) | Temple times recover |
| `mahaTimes` | number | **5** | `mahaAdventureTimesMax=5` | → `MahaAdventureSingleton.initAdventureTime()` |
| `mahaTimesRecover` | number | `0` | `mahaAdventureCD=14400` (ms) | Maha times recover |
| `mineSteps` | number | **50** | `mineActionPointMax=50` | → `TheWildAdventureManager.setTheWildAdventureCount()` |
| `mineStepsRecover` | number | `0` | `mineActionPointRefreshTime=1800` (ms) | Mine steps recover |
| `karinFeet` | number | **5** | `karinTowerFeet=5` | → `TowerDataManager.setTowerCount()` |
| `karinFeetRecover` | number | `0` | `karinTowerFeetRefresh=7200` (ms) | Karin feet recover |

**PENTING**: Field `timesInfo` TIDAK pakai `_` prefix! Client baca langsung `e.marketRefreshTimes`, bukan `e._marketRefreshTimes`.

---

### 4.36 `userDownloadReward` — Object

Client baca:
```javascript
if (e.userDownloadReward) {
    var a = e.userDownloadReward;
    UserInfoSingleton.getInstance().userDownloadModel = {
        isClick: a._isClick || false,
        haveGotDlReward: a._haveGotDlReward || false,
        isBind: a._isBind,
        haveGotBindReward: a._haveGotBindReward
    };
}
```

**Default untuk user baru**:
```json
{
  "_isClick": false,
  "_haveGotDlReward": false,
  "_isBind": false,
  "_haveGotBindReward": false
}
```

Cross-reference: `downloadAward.json`, `bindAward.json`: reward configs.

---

### 4.37–4.38 `YouTuberRecruit`, `userYouTuberRecruit`

**Default**: `null`

Client: `if (e.YouTuberRecruit && !e.YouTuberRecruit._hidden)` — client skip jika null atau _hidden=true.

---

### 4.39 `timeMachine` — TimeLeapSingleton

Client baca: `TimeLeapSingleton.getInstance().initData(e.timeMachine)`

**Default**: `{"_items": {}}`

Cross-reference: `timeMachine.json`, `timeTravel.json`, `timeTravelTime.json`: time travel configs.

Format: keyed object of time travel items.

---

### 4.40–4.41 `_arenaTeam`, `_arenaSuper`

Client baca:
```javascript
AltarInfoManger.getInstance().setArenaTeamInfo(e._arenaTeam);
AltarInfoManger.getInstance().setArenaSuperInfo(e._arenaSuper);
```

**Default**: `{}`

Cross-reference: `arenaRobot.json`, `arenaFindEnemy.json`, `arenaShop.json`, `arenaEverydayAward.json`.

---

### 4.42 `timeBonusInfo` — Object|null

**Default**: `null`

Cross-reference: `timeLimitBonus.json`.

---

### 4.43 `onlineBulletin` — Object|null

**Default**: `null`

---

### 4.44–4.45 `karinStartTime`, `karinEndTime`

Client baca: `TowerDataManager.getInstance().setKarinTime(e.karinStartTime, e.karinEndTime)`

**Default**: `0`, `0`

Cross-reference: `constant.json`: karinTowerOpen=**"12:00:00"**, karinTowerEnd=**"20:00:00"** — ini adalah jadwal, bukan timestamp user.

---

### 4.46 `serverVersion` — String

**Default**: `"1.0"`

---

### 4.47 `serverOpenDate` — Number

**Default**: `0` (akan diisi timestamp server dibuka)

---

### 4.48 `lastTeam` — Object

Client baca: `e.lastTeam && UserInfoSingleton.getInstance().firstLoginSetMyTeam(e.lastTeam._lastTeamInfo)`

**Default**: `{"_lastTeamInfo": {}}`

Format: `_lastTeamInfo` keyed by team slot → hero data.

---

### 4.49–4.50 `heroImageVersion`, `superImageVersion` — String

**Default**: `""`

---

### 4.51 `training` — PadipataInfoManager

Client baca: `PadipataInfoManager.getInstance().setPadipataModel(e.training)`

**Default untuk user baru**:
```json
{
  "_id": "",
  "_type": 0,
  "_times": 10,
  "_timesStartRecover": 0,
  "_surpriseReward": null,
  "_questionId": 0,
  "_enemyId": 0,
  "_cfgId": 0
}
```

Cross-reference: `training.json`, `constant.json`: trainingTimesMax (via `training.json`), trainingTimesBuy=1, trainingEnemy.json.

| Sub-field | Tipe | Default | Catatan |
|-----------|------|---------|---------|
| `_id` | string | `""` | ID training |
| `_type` | number | `0` | Tipe training |
| `_times` | number | `10` | Sisa training times |
| `_timesStartRecover` | number | `0` | Timestamp mulai recover |
| `_surpriseReward` | object\|null | `null` | Reward kejutan |
| `_questionId` | number | `0` | ID pertanyaan quiz |
| `_enemyId` | number | `0` | ID enemy training |
| `_cfgId` | number | `0` | Config ID training stage |

---

### 4.52–4.53 `warInfo`, `userWar` — Object|null

**Default**: `null`

Cross-reference: `globalWar.json`.

---

### 4.54 `serverId` — Number

**Default**: dari request `serverId`

---

### 4.55 `headEffect` — HeadEffectModel

Client baca (`HeadEffectModel` deserialize, L96551):
```javascript
var r = new HeadEffectModel();
r.deserialize(e.headEffect);
// HeadEffectModel reads: _effects (array of HeadEffectItem)
```

**Default**: `{"_effects": []}`

Cross-reference: `headFrame.json`, `headIconEffect.json`.

HeadEffectItem: semua isCommonType fields (string/number/boolean).

---

### 4.56 `userBallWar` — Object

Client baca: `TeamInfoManager.getInstance().UserBallWar = e.userBallWar`

**Default**:
```json
{
  "_state": 0,
  "_signedUp": 0,
  "_times": 3,
  "_defence": {}
}
```

Cross-reference: `constant.json`: dragonBallWarTimesMax=**3**.

| Sub-field | Tipe | Default | constant.json Source |
|-----------|------|---------|---------------------|
| `_state` | number | `0` | — |
| `_signedUp` | number | `0` | — |
| `_times` | number | **3** | `dragonBallWarTimesMax=3` |
| `_defence` | object | `{}` | — |

---

### 4.57 `ballWarState` — Number

**Default**: `0`

---

### 4.58 `ballBroadcast` — String

**Default**: `""`

---

### 4.59 `ballWarInfo` — GuildBallWarInfo

Client baca (`GuildBallWarInfo` deserialize, L85154):
```javascript
var i = new GuildBallWarInfo();
i.deserialize(e.ballWarInfo);
// Reads: _signed, _fieldId, _point, _topMsg
```

**Default**:
```json
{
  "_signed": false,
  "_fieldId": "",
  "_point": 0,
  "_topMsg": ""
}
```

---

### 4.60 `guildActivePoints` — Number

**Default**: `0`

Cross-reference: `guildActivePoint.json`.

---

### 4.61 `expedition` — ExpeditionModel

Client baca (`ExpeditionModel` deserialize, L120001):
```javascript
e.expedition && ExpeditionManager.getInstance().setExpeditionModel(e.expedition);
```

**Default untuk user baru**:
```json
{
  "_id": "",
  "_passLesson": {},
  "_machines": {},
  "_collection": [],
  "_teams": {},
  "_times": 10,
  "_timesStartRecover": 0
}
```

Cross-reference: `constant.json`: expeditionBattleTimes=**10**, expeditionBattleTimesRefresh=**14400** (4 jam), expeditionEventMax=**12**.
Client menghitung recovery: `min(times + floor(elapsed / refreshInterval), expeditionBattleTimes)`.

| Sub-field | Tipe | Default | Catatan |
|-----------|------|---------|---------|
| `_id` | string | `""` | ID expedition |
| `_passLesson` | object | `{}` | Keyed by lessonId → boolean |
| `_machines` | object | `{}` | Keyed by machineId → `ExpeditionMachine {_level, _heroId, _outCount}` |
| `_collection` | array | `[]` | Array of collected items |
| `_teams` | object | `{}` | Keyed by team slot → hero array |
| `_times` | number | **10** | `constant.json`: expeditionBattleTimes=**10**, expeditionBattleTimesRefresh=14400 | Expedition battle times. Client menghitung recovery: `min(times + recoveryCycles, 10)` |
| `_timesStartRecover` | number | `0` | Timestamp mulai recover |

---

### 4.62 `timeTrial` — SpaceTrialModel

Client baca: `SpaceTrialManager.getInstance().setSpaceTrialModel(e.timeTrial, e.timeTrialNextOpenTime)`

**Default**:
```json
{
  "_id": "",
  "_levelStars": {},
  "_level": 1,
  "_totalStars": 0,
  "_gotStarReward": {},
  "_haveTimes": 5,
  "_timesStartRecover": 0,
  "_lastRefreshTime": 0,
  "_startTime": 0
}
```

Cross-reference: `timeTrainConstant.json`: timeTrainTimes=**5**, timeTrainTimesEvery=7200 (2 jam refresh).
Client menghitung recovery: `min(haveTimes + floor(elapsed / refreshInterval), timeTrainTimes)`.

---

### 4.63 `timeTrialNextOpenTime` — Number

**Default**: `0`

---

### 4.64 `retrieve` — Object

**Default**: `{}`

Client baca: `GetBackReourceManager.getInstance().setRetrieveModel(e.retrieve)`

---

### 4.65 `battleMedal` — BattleMedalModel

Client baca (`BattleMedalModel` deserialize, L119550):
```javascript
e.battleMedal && BattleMedalManager.getInstance().setBattleMedal(e.battleMedal);
```

**Default untuk user baru**:
```json
{
  "_id": "",
  "_battleMedalId": "",
  "_cycle": 0,
  "_nextRefreshTime": 0,
  "_level": 0,
  "_curExp": 0,
  "_openSuper": false,
  "_task": {},
  "_levelReward": {},
  "_shopBuyTimes": {},
  "_buyLevelCount": 0
}
```

Cross-reference: `battleMedal.json`, `battleMedalTask.json`, `battleMedalShop.json`, `battleMedalSuperBuy.json`.

| Sub-field | Tipe | Default | Catatan |
|-----------|------|---------|---------|
| `_id` | string | `""` | ID battle medal |
| `_battleMedalId` | string | `""` | Medal config ID |
| `_cycle` | number | `0` | Cycle saat ini |
| `_nextRefreshTime` | number | `0` | Timestamp refresh berikutnya |
| `_level` | number | `0` | Level medal |
| `_curExp` | number | `0` | Exp saat ini |
| `_openSuper` | boolean | `false` | Apakah super mode terbuka |
| `_task` | object | `{}` | Keyed by taskId → `BattleMedalTask {_id, _curCount, _haveGotReward}` |
| `_levelReward` | object | `{}` | Keyed by level → `BattleMedalLevelReward {_gotNormal, _gotSuper}` |
| `_shopBuyTimes` | object | `{}` | Keyed by shopId → buy count |
| `_buyLevelCount` | number | `0` | Buy level count |

---

### 4.66 `shopNewHeroes` — Object

**Default**: `{}`

Keyed by heroDisplayId → hero data.

---

### 4.67 `teamDungeon` — Object

Client baca: `TeamworkManager.getInstance().setLoginInfo(e.teamDungeon)`

**Default**:
```json
{
  "_myTeam": null,
  "_canCreateTeamTime": 0,
  "_nextCanJoinTime": 0
}
```

Cross-reference: `teamDungeon.json`, `teamDungeonContant.json`, `teamDungeonAction.json`.

---

### 4.68–4.75 Team Dungeon Fields

| # | Field | Tipe | Default | resource/json Source |
|---|-------|------|---------|---------------------|
| 68 | `teamServerHttpUrl` | string | `""` | — |
| 69 | `teamDungeonOpenTime` | number | `0` | — |
| 70 | `teamDungeonTask` | object\|null | `null` | `teamDungeon.json` |
| 71 | `teamDungeonSplBcst` | string | `""` | — |
| 72 | `teamDungeonNormBcst` | string | `""` | — |
| 73 | `teamDungeonHideInfo` | string | `""` | — |
| 74 | `teamDungeonInvitedFriends` | array\|null | `null` | — |
| 75 | `myTeamServerSocketUrl` | string | `""` | — |

---

### 4.76 `gemstone` — GemstoneItem

Client baca: `EquipInfoManager.getInstance().saveGemStone(e)` → `e.gemstone._items`

**Default**: `{"_items": {}}`

**Contoh GemstoneItem** (`GemstoneItem` deserialize, L132177):
```json
{
  "_items": {
    "0": {
      "_id": "1",
      "_displayId": 3001,
      "_heroId": "0",
      "_level": 1,
      "_totalExp": 0,
      "_version": ""
    }
  }
}
```

Cross-reference: `jewel.json`, `jewSuit.json`, `jewLevelUp.json`, `jewRandom.json`.

| Sub-field GemstoneItem | Tipe | Default | Catatan |
|------------------------|------|---------|---------|
| `_id` | string | `"1"` | ID gemstone unik |
| `_displayId` | number | dari config | Display ID dari `jewel.json` |
| `_heroId` | string | `"0"` | Hero yang equip |
| `_level` | number | `1` | Level gemstone |
| `_totalExp` | number | `0` | Total exp |
| `_version` | string | `""` | Version |

**PENTING**: Client `GemstoneItem.deserialize` membaca `jewPosition` dari `jewel.json[displayId].jewPosition`, bukan dari wire. Jadi `_jewPosition` TIDAK dikirim server.

---

### 4.77 `questionnaires` — Object|null

**Default**: `null`

---

### 4.78 `resonance` — ResonanceModel

Client baca (`ResonanceModel` deserialize, L135265):
```javascript
e.resonance && HerosManager.getInstance().setResonanceModel(e.resonance);
```

**Default**:
```json
{
  "_id": "",
  "_diamondCabin": 0,
  "_cabins": {},
  "_buySeatCount": 0,
  "_totalTalent": 0,
  "_unlockSpecial": false
}
```

| Sub-field | Tipe | Default | Catatan |
|-----------|------|---------|---------|
| `_id` | string | `""` | ID resonance |
| `_diamondCabin` | number | `0` | Diamond cabin index |
| `_cabins` | object | `{}` | Keyed by cabinId → `ResonanceCabin {_id, _mainHero, _diamondSeat, _seats:{}, _specialSeat}` |
| `_buySeatCount` | number | `0` | Jumlah seat yang dibeli |
| `_totalTalent` | number | `0` | Total talent |
| `_unlockSpecial` | boolean | `false` | Apakah special seat terbuka |

---

### 4.79–4.80 `topBattleInfo`, `userTopBattle` — Object|null

**Default**: `null`

Cross-reference: `topBattle.json`, `topBattleMatch.json`, `topBattleRank.json`, `topBattleZone.json`, `topBattle64.json`, `topBattleBuyTime.json`.

---

### 4.81 `fastTeam` — Object

Client baca: `HerosManager.getInstance().saveLoginFastTeam(e.fastTeam)` → `e.fastTeam._teamInfo`

**Default**: `{"_teamInfo": {}}`

---

### 4.82 `blacklist` — Array

Client baca: `BroadcastSingleton.getInstance().setBlacklistPlayerInfo(e)` → `e.blacklist`

**Default**: `[]`

---

### 4.83 `forbiddenChat` — Object (NO `_` prefix!)

Client baca: `BroadcastSingleton.getInstance().setUserBidden(e.forbiddenChat)`

**Default**:
```json
{
  "users": [],
  "finishTime": {}
}
```

**PENTING**: Field ini TIDAK pakai `_` prefix karena client baca langsung tanpa Serializable.

---

### 4.84 `gravity` — Object (Serializable)

Client baca: `TrialManager.getInstance().setGravityTrialInfo(e)` → `e.gravity`

**Default**:
```json
{
  "_id": "",
  "_haveTimes": 10,
  "_timesStartRecover": 0,
  "_lastLess": 0,
  "_lastTime": 0
}
```

Cross-reference: `gravityTestConstant.json`: gravityTestTimes=**10**, gravityTestTimesRefresh=1800 (30 menit refresh).
Client menghitung recovery: `min(haveTimes + floor(elapsed / refreshInterval), gravityTestTimes)`.

---

### 4.85 `littleGame` — Object

Client baca: `LittleGameManager.getInstance().saveData(e.littleGame)`

**Default**:
```json
{
  "_gotBattleReward": {},
  "_gotChapterReward": {},
  "_clickTime": 0
}
```

Cross-reference: `chapterGames.json`.

---

### 4.86 `guildLevel` — Number

**Default**: `0`

Cross-reference: `guild.json`, `guildOpen.json`: guildCreateVIP=**2**.

---

### 4.87 `guildTreasureMatchRet` — Number|null

**Default**: `null`

---

### 4.88 `templeLess` — Object|null

**Default**: `null`

Cross-reference: `templeTest.json`, `templeDaily.json`, `templePrivilege.json`.

---

### 4.89 `newUser` — Number

**Default**: `1` (user baru). Setelah first enter, jadi `0`.

---

### 4.90 `_firstEnter` — Number

**Default**: `1` (pertama kali). Setelah first enter, server update ke `0`.

---

### 4.91 `_bulletinRead` — String

**Default**: `""`

---

### 4.92 `teamTraining` — TeamTrainingModel

Client baca (`TeamTrainingModel` deserialize, L136057):
```javascript
e.prototype.saveTeamTraining = function (e) {
    t.trainingData.deserialize(e);
};
```

**Default**:
```json
{
  "_id": "",
  "_levels": {},
  "_unlock": false,
  "_version": ""
}
```

Cross-reference: `teamTraining.json`, `teamTrainingLimit.json`.

| Sub-field | Tipe | Default | Catatan |
|-----------|------|---------|---------|
| `_id` | string | `""` | ID team training |
| `_levels` | object | `{}` | Keyed by levelId → progress data |
| `_unlock` | boolean | `false` | Apakah team training terbuka |
| `_version` | string | `""` | Version string |

---

### 4.93 `gameVersion` — String

**Default**: `""` (echo dari request `gameVersion`)

---

### 4.94–4.99 QQ-specific Fields

| # | Field | Tipe | Default | Catatan |
|---|-------|------|---------|---------|
| 94 | `enableShowQQ` | number | `0` | QQ integration flag |
| 95 | `showQQVip` | number | `0` | QQ VIP flag |
| 96 | `showQQ` | string | `""` | QQ number |
| 97 | `showQQImg1` | string | `""` | QQ image 1 |
| 98 | `showQQImg2` | string | `""` | QQ image 2 |
| 99 | `showQQUrl` | string | `""` | QQ URL |

---

### 4.100 `hideHeroes` — Object

Client baca: `e.hideHeroes && WelfareInfoManager.getInstance().setHideHeroes(e.hideHeroes)`

**Default**: `{}`

Keyed by heroDisplayId → boolean (hero yang di-hide).

---

### 4.101 `cellgameHaveSetHero` — Number

Client baca: `void 0 != e.cellgameHaveSetHero && (e.scheduleInfo._cellgameHaveSetHero = e.cellgameHaveSetHero)`

**Default**: `0`

**PENTING**: Field ini di-merge ke `scheduleInfo._cellgameHaveSetHero` oleh client.

---

### 4.102 `broadcastRecord` — Array

Client baca: `ts.chatJoinRecord({_record: t.broadcastRecord})`

**Default**: `[]`

---

## 5. constant.json Quick Reference — Default Values untuk enterGame

Berikut ringkasan semua key `constant.json` yang relevan untuk default values enterGame:

| constant.json Key | Value | Digunakan oleh enterGame field |
|-------------------|-------|-------------------------------|
| `startChapter` | 801 | hangup._maxPassChapter context |
| `startLesson` | 10101 | hangup._curLess, hangup._maxPassLesson |
| `startUserLevel` | 1 | backpackLevel default |
| `startDiamond` | 0 | totalProps._items diamond count |
| `startGold` | 0 | totalProps._items gold count |
| `startHero` | "1205" | Starter hero displayId |
| `startHeroLevel` | "3" | Starter hero _level |
| `playerIcon` | "hero_icon_1205" | user._headImage context |
| `arenaAttackTimes` | 5 | scheduleInfo._arenaAttackTimes, timesInfo.templa default |
| `bossAttackTimes` | 6 | scheduleInfo._strongEnemyTimes |
| `karinTowerBattleTimes` | 10 | scheduleInfo._karinBattleTimes |
| `karinTowerFeet` | 5 | timesInfo.karinFeet, training._times default |
| `templeTestTimes` | 10 | timesInfo.templeTimes |
| `cellGameTimes` | 1 | scheduleInfo._cellGameHaveTimes |
| `marketRefreshTimeMax` | 5 | timesInfo.marketRefreshTimes |
| `vipMarketRefreshTimeMax` | 5 | timesInfo.vipMarketRefreshTimes |
| `expDungeonTimes` | 2 | dungeon type 1 default times |
| `evolveDungeonTimes` | 2 | dungeon type 2 default times |
| `energyDungeonTimes` | 2 | dungeon type 3 default times |
| `equipDungeonTimes` | 2 | dungeon type 4 default times |
| `signDungeonTimes` | 2 | dungeon type 5/6 default times |
| `metalDungeonTimes` | 2 | dungeon type 7 default times |
| `zStoneDungeonTimes` | 2 | dungeon type 8 default times |
| `mahaAdventureTimesMax` | 5 | scheduleInfo._mahaAttackTimes, timesInfo.mahaTimes |
| `mineActionPointMax` | 50 | timesInfo.mineSteps |
| `guildBOSSTimes` | 2 | scheduleInfo._guildBossTimes |
| `dragonBallWarTimesMax` | 3 | userBallWar._times |
| `expeditionBattleTimes` | 10 | expedition._times default |
| `snakeTimes` | 1 | scheduleInfo._snakeResetTimes context |
| `goldBuyFree` | 20 | giftInfo._goldBuyCount max |
| `rewardHelpRewardEveryday` | 10 | scheduleInfo context |
| `weaponUnlockLevel` | 40 | weapon unlock level |
| `ringUnlockLevel` | 40 | ring unlock level |
| `wishListInitialHero` | "1519,1528,..." | summon._wishList initial heroes |
| `signStartStar` | 0 | imprint._star default |
| `signMaxStar` | 4 | imprint._star max |

---

## 6. thingsID.json Quick Reference — Item IDs untuk enterGame

| Item ID | Nama | thingsType | Digunakan oleh |
|---------|------|------------|----------------|
| 101 | Diamond | basis | totalProps._items |
| 102 | Gold | basis | totalProps._items |
| 103 | Player EXP | exp | user level |
| 105 | VIP EXP | — | VIP level |
| 111 | Soul Stone | — | Altar/summon |
| 112 | Arena Coin | — | Arena shop |
| 113 | Snake Coin | — | Snake shop |
| 114 | Guild Coin | — | Guild shop |
| 115 | Glory Coin | — | Glory shop |
| 521 | Summon Orb | — | Normal summon |
| 522 | Advanced Summon Orb | — | Advanced summon |

---

## 7. Verification Report — Hasil Cross-Reference

> **Tanggal verifikasi**: 2026-05-04
> **Sumber**: `constant.json`, `gravityTestConstant.json`, `timeTrainConstant.json`, `thingsID.json`, `currencyDisplay.json`, `hero.json`, `main.min(unminfy).js` (Line 91229-91323, 114793-114873, 96001-96011)

### 7.1 BUG KRITIS YANG DITEMUKAN & DIPERBAIKI

| # | Field | Sebelum (SALAH) | Sesudah (BENAR) | Sumber Verifikasi | Dampak Jika Tidak Diperbaiki |
|---|-------|-----------------|------------------|-------------------|-------------------------------|
| 1 | `scheduleInfo._dungeonTimes` | `0` (number) | `{}` (object) | `setCounterPartTime(e)` iterates with `for-in` | Client tidak set dungeon timers — dungeon cooldown tidak berfungsi |
| 2 | `scheduleInfo._dungeonBuyTimesCount` | `0` (number) | `{}` (object) | `setCounterPartBuyCount(e)` iterates with `for-in` | Client tidak set buy counts — dungeon buy tidak berfungsi |
| 3 | `expedition._times` | `0` | `10` | `constant.json`: expeditionBattleTimes=10 | User baru tidak bisa main expedition |
| 4 | `gravity._haveTimes` | `0` | `10` | `gravityTestConstant.json`: gravityTestTimes=10 | User baru tidak bisa main gravity trial |
| 5 | `timeTrial._haveTimes` | `0` | `5` | `timeTrainConstant.json`: timeTrainTimes=5 | User baru tidak bisa main time trial |

**Catatan tentang recovery mechanism**: Client menghitung recovery untuk expedition/gravity/timeTrial dengan formula `min(storedTimes + floor(elapsed / refreshInterval), maxTimes)`. Jika `_timesStartRecover = 0` (epoch), recovery calculation akan menghasilkan max times otomatis. Tapi lebih benar untuk inisialisasi dengan max value langsung.

#### 7.1.2 BUG KRITIS: Key Name Mismatch di `buildInitialScheduleInfo()` (enterGame.js)

Audit cross-reference menemukan **4 key name mismatch** antara server kirim dan client baca di `scheduleInfo`. Ini menyebabkan client menerima `undefined` untuk field-field kritis — fitur game tidak berfungsi.

| # | Server Kirim (SALAH) | Client Baca (BENAR) | Config Source | Effect |
|---|----------------------|---------------------|---------------|--------|
| 6 | `_karinTowerBattleTimes` | `_karinBattleTimes` | `constant.json`: karinTowerBattleTimes=10 | Karin Tower times = undefined, tidak bisa battle |
| 7 | `_mahaAdventureTimes` | `_mahaAttackTimes` | `constant.json`: mahaAdventureTimesMax=5 | Maha adventure times = undefined, tidak bisa battle |
| 8 | `_guildBOSSTimes` (uppercase) | `_guildBossTimes` (camelCase) | `constant.json`: guildBOSSTimes=2 | Guild boss times = undefined, tidak bisa battle |
| 9 | `_cellGameTimes` | `_cellGameHaveTimes` | `constant.json`: cellGameTimes=1 | Cell game times = undefined, tidak bisa masuk |

**Fix di `enterGame.js` `buildInitialScheduleInfo()`**:
```javascript
// SALAH → BENAR (rename key):
_karinBattleTimes: Number(c1.karinTowerBattleTimes || 10),    // bukan _karinTowerBattleTimes
_mahaAttackTimes: Number(c1.mahaAdventureTimesMax || 5),       // bukan _mahaAdventureTimes
_guildBossTimes: Number(c1.guildBOSSTimes || 2),               // bukan _guildBOSSTimes
_cellGameHaveTimes: Number(c1.cellGameTimes || 1),             // bukan _cellGameTimes
```

#### 7.1.3 BUG: Missing `_treasureTimes` Field

`_treasureTimes` tidak ada di `buildInitialScheduleInfo()`. Client `initData` melakukan direct assignment `t._treasureTimes = e._treasureTimes` — jika field tidak ada, client mendapat `undefined` bukan `0`. Field ini harus ditambahkan:

```javascript
_treasureTimes: 0,   // ADD to buildInitialScheduleInfo
```

#### 7.1.4 BUG: Wrong Config Source untuk `_gravityTestTimes` dan `_timeTrainTimes`

Audit menemukan 2 field di `buildInitialScheduleInfo()` yang membaca dari config source yang salah:

| # | Field | Current Code (SALAH) | Current Value | Correct Source | Correct Value |
|---|-------|---------------------|---------------|----------------|---------------|
| 10 | `_gravityTestTimes` | `c1.gravityTestRewardpreview` | 50 | `gravityTestConstant[1].gravityTestTimes` | **10** |
| 11 | `_timeTrainTimes` | hardcoded `0` | 0 | `timeTrainConstant[1].timeTrainTimes` | **5** |

- `_gravityTestTimes` membaca `gravityTestRewardpreview` (50, jumlah UI preview) bukan `gravityTestTimes` (10, actual default times)
- `_timeTrainTimes` di-hardcode ke 0, padahal config `timeTrainConstant.json` menyatakan default = 5

### 7.2 FIELD YANG PERLU DISKUSI

| # | Field | Current Default | Pertanyaan | Alasan |
|---|-------|----------------|------------|--------|
| 1 | `scheduleInfo._cellGameHaveGotReward` | **false** | ✅ **RESOLVED** | Diputuskan: **false** — sesuai game logic, user baru belum pernah dapat reward. Meskipun client constructor default = `true`, `false` lebih benar secara logic. |

### 7.3 DEFAULT VALUES TERVERIFIKASI 100%

Semua default value berikut sudah cross-reference dengan `constant.json` dan/atau client source:

| Field | Default | Sumber |
|-------|---------|--------|
| `hangup._curLess` | `10101` | `constant.json`: startLesson=10101 |
| `hangup._maxPassLesson` | `10101` | `constant.json`: startLesson=10101 |
| `backpackLevel` | `1` | `constant.json`: startUserLevel=1 |
| `scheduleInfo._arenaAttackTimes` | `5` | `constant.json`: arenaAttackTimes=5 |
| `scheduleInfo._strongEnemyTimes` | `6` | `constant.json`: bossAttackTimes=6 |
| `scheduleInfo._cellGameHaveTimes` | `1` | `constant.json`: cellGameTimes=1 |
| `scheduleInfo._karinBattleTimes` | `10` | `constant.json`: karinTowerBattleTimes=10 |
| `scheduleInfo._mahaAttackTimes` | `5` | `constant.json`: mahaAdventureTimesMax=5 |
| `scheduleInfo._guildBossTimes` | `2` | `constant.json`: guildBOSSTimes=2 |
| `userBallWar._times` | `3` | `constant.json`: dragonBallWarTimesMax=3 |
| `training._times` | `10` | `constant.json`: trainingTimesMax=10 |
| `expedition._times` | `10` | `constant.json`: expeditionBattleTimes=10 |
| `gravity._haveTimes` | `10` | `gravityTestConstant.json`: gravityTestTimes=10 |
| `timeTrial._haveTimes` | `5` | `timeTrainConstant.json`: timeTrainTimes=5 |
| `timesInfo.marketRefreshTimes` | `5` | `constant.json`: marketRefreshTimeMax=5 |
| `timesInfo.vipMarketRefreshTimes` | `5` | `constant.json`: vipMarketRefreshTimeMax=5 |
| `timesInfo.templeTimes` | `10` | `constant.json`: templeTestTimes=10 |
| `timesInfo.mahaTimes` | `5` | `constant.json`: mahaAdventureTimesMax=5 |
| `timesInfo.mineSteps` | `50` | `constant.json`: mineActionPointMax=50 |
| `timesInfo.karinFeet` | `5` | `constant.json`: karinTowerFeet=5 |
| `currency` keys | CNY,USD,KRW,VND,IRR | `currencyDisplay.json`: 5 keys verified |
| `thingsID` 101 | Diamond | `thingsID.json`: thingsType=basis |
| `thingsID` 102 | Gold | `thingsID.json`: thingsType=basis |
| `startHero` | "1205" | `constant.json`: startHero="1205" |
| `startHeroLevel` | "3" | `constant.json`: startHeroLevel="3" |

### 7.4 DISCREPANCY: enterGame.js vs enterGame.md

Field berikut di `handlers/enterGame.js` **TIDAK SESUAI** dengan spesifikasi enterGame.md. Ini harus diperbaiki saat update enterGame.js:

| # | Field | enterGame.js (SALAH) | enterGame.md (BENAR) |
|---|-------|---------------------|---------------------|
| 1 | `currency` | `{_diamond, _gold}` (object) | `""` (string — index ke currencyDisplay.json) |
| 2 | `superSkill` | plain array `[]` | `{_skills: {}}` (object keyed) |
| 3 | `globalWarBuff` | `{}` (object) | `0` (number) |
| 4 | `expedition` | array dari DB rows | `{_id, _passLesson, _machines, _collection, _teams, _times, _timesStartRecover}` |
| 5 | `resonance` | array dari DB rows | `{_id, _diamondCabin, _cabins, _buySeatCount, _totalTalent, _unlockSpecial}` |
| 6 | `scheduleInfo._dungeonTimes` | tidak ada (omitted) | `{}` (empty object) |
| 7 | `scheduleInfo._dungeonBuyTimesCount` | tidak ada (omitted) | `{}` (empty object) |
| 8 | `userBallWar` default | `{}` jika null | `{_state:0, _signedUp:0, _times:3, _defence:{}}` |
| 9 | `scheduleInfo._cellGameHaveGotReward` | ✅ resolved | **false** (diputuskan user) |
| 10 | `scheduleInfo._cellGameHaveTimes` | tidak ada | `1` |
| 11 | `gravity._haveTimes` | default `0` | `10` (gravityTestConstant.json) |
| 12 | `timeTrial._haveTimes` | default `0` | `5` (timeTrainConstant.json) |
| 13 | `expedition._times` | default `0` | `10` (constant.json) |
