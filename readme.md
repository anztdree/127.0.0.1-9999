# Super Warrior Z — Full Server Reverse Engineering Analysis (100%)

> **Based on:** `main.min(unminfy).js` (244,761 lines) + 471 JSON config files  
> **Game Engine:** Egret Engine (WebGL, TypeScript)  
> **Client Version:** `2026-03-02143147`  
> **Title:** 超级战士Z (Super Warrior Z)  
> **Theme:** Dragon Ball Z Idle/RPG  
> **SDK:** PPGAME (multi-channel: TanWanH5, Huawei, Facebook, etc.)  
> **Total Handler Types:** ~66 unique module types  
> **Total (type, action) pairs:** ~450+ unique handlers  
> **Supported Languages:** 9 (CN, TW, EN, EN-ME, FR, DE, KR, PT, VI)  

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)  
2. [Login Server](#2-login-server)  
3. [Main Server — Complete Handler Reference](#3-main-server--complete-handler-reference)  
4. [Chat Server](#4-chat-server)  
5. [Dungeon Server (Multiplayer)](#5-dungeon-server-multiplayer)  
6. [TEA Encryption Implementation](#6-tea-encryption-implementation)  
7. [LZString Compression](#7-lzstring-compression)  
8. [Battle System](#8-battle-system)  
9. [Hero & Equipment Data Structures](#9-hero--equipment-data-structures)  
10. [Equipment System (equip)](#10-equipment-system-equip)  
11. [Weapon System (weapon)](#11-weapon-system-weapon)  
12. [Sign/Imprint System (imprint)](#12-signimprint-system-imprint)  
13. [Genki System (genki)](#13-genki-system-genki)  
14. [Gemstone System (gemstone)](#14-gemstone-system-gemstone)  
15. [Resonance / Hero Link System (resonance)](#15-resonance--hero-link-system-resonance)  
16. [Super Skill System (superSkill)](#16-super-skill-system-superskill)  
17. [Backpack System (backpack)](#17-backpack-system-backpack)  
18. [Mail System (mail)](#18-mail-system-mail)  
19. [Battle Medal System (battleMedal)](#19-battle-medal-system-battlemedal)  
20. [Team Training System (teamTraining)](#20-team-training-system-teamtraining)  
21. [Dragon Ball Wish System (dragon)](#21-dragon-ball-wish-system-dragon)  
22. [Check-in & Month Card System](#22-check-in--month-card-system)  
23. [VIP System](#23-vip-system)  
24. [Payment / IAP System](#24-payment--iap-system)  
25. [SDK Integration](#25-sdk-integration)  
26. [Daily Reset System](#26-daily-reset-system)  
27. [Red Dot Notification System](#27-red-dot-notification-system)  
28. [Tutorial / Guide System](#28-tutorial--guide-system)  
29. [Error Codes (Full Reference)](#29-error-codes-full-reference)  
30. [Game Constants & Config (Full)](#30-game-constants--config-full)  
31. [Item Type System](#31-item-type-system)  
32. [Notification / Push System](#32-notification--push-system)  
33. [Social Media Integration](#33-social-media-integration)  
34. [Energy System](#34-energy-system)  
35. [Resource Loading System](#35-resource-loading-system)  
36. [Shared Server Code](#36-shared-server-code)  
37. [Recommended Server Folder Structure](#37-recommended-server-folder-structure)  
38. [Database Schema Design](#38-database-schema-design)  
39. [Development Roadmap](#39-development-roadmap)  

---

## 1. Architecture Overview

### 1.1 Four-Server Architecture

The client creates **4 separate Socket.IO connections**, each with the `handler.process` event:

| Server | TEA Verify | Socket Method | Handler Count | Port (Default) |
|--------|-----------|---------------|---------------|----------------|
| **login-server** | NO | `processHandlerWithLogin()` | **5** | 8000 |
| **main-server** | YES | `processHandler()` | **~400+** | 8100 |
| **chat-server** | YES | `processHandlerWithChat()` | **5** | 8200 |
| **dungeon-server** | YES + HTTP | `processHandlerWithDungeon()` | **13** (11 socket + 2 HTTP) | 8300 |

### 1.2 Universal Protocol

**Event name:** `socket.emit('handler.process', data, callback)`

**Request format:**
```json
{
  "type": "string",
  "action": "string",
  "userId": "string",
  "...": "other parameters",
  "version": "1.0"
}
```

**Response format (login, main, dungeon):**
```json
{
  "ret": 0,
  "data": "<LZString compressed JSON>",
  "compress": true,
  "serverTime": 1714012345678,
  "server0Time": 1714012345678
}
```

**Response format (chat server — DIFFERENT):**
```json
{
  "ret": "SUCCESS",
  "data": "<LZString compressed JSON>",
  "compress": true
}
```

**Server→Client push (all servers):**
```
socket.emit('Notify', { ret: "SUCCESS", compress: true, data: "..." })
```

### 1.3 Complete Login Flow

```
1. Client reads serversetting.json → loginserver URL
2. Client connects to login-server (NO TEA verify)
3. Client sends loginGame {userId, password, fromChannel, subChannel}
4. Client sends GetServerList {userId, subChannel, channel}
5. User selects server from list
6. Client sends SaveHistory {accountToken, channelCode, serverId, securityCode}
7. Server returns loginToken
8. Client sends SaveUserEnterInfo
9. Login socket destroyed
10. Client connects to main-server URL (from GetServerList)
11. TEA verify handshake (see Section 6)
12. Client sends enterGame {userId, loginToken, serverId, securityCode}
13. Server returns full game state (57+ fields)
14. Client sends registChat → gets chatServerUrl + all roomIds
15. Client connects to chat-server → TEA verify → join all rooms
16. Game running
```

### 1.4 Server Configuration

**serversetting.json** — Single field:
```json
{ "loginserver": "http://127.0.0.1:8000" }
```

**clientversion.json** — Version stamp:
```json
{ "clientVersion": "2026-03-02143147" }
```

---

## 2. Login Server (5 Handlers, NO TEA)

### 2.1 Connection

- URL: `serversetting.json` → field `loginserver`
- `verifyEnable = false` → connect directly, no encryption handshake
- Socket destroyed after `SaveUserEnterInfo` completes

### 2.2 Handlers

| Action | Function | Key Request Fields | Key Response Fields |
|--------|----------|-------------------|-------------------|
| `loginGame` | Authenticate user | `userId`, `password`, `fromChannel`, `subChannel` | `userId`, `channelCode`, `loginToken`, `nickName`, `securityCode`, `createTime` |
| `GetServerList` | Get available servers | `userId`, `subChannel`, `channel` | `serverList[]` (url, serverId, serverName, chaturl, dungeonurl, worldRoomId, guildRoomId, teamDungeonChatRoom, teamChatRoomId), `history[]`, `offlineReason` |
| `SaveHistory` | Select server, get token | `accountToken`, `channelCode`, `serverId`, `securityCode`, `subChannel` | `loginToken` |
| `SaveUserEnterInfo` | Report game entry | `accountToken`, `channelCode`, `subChannel`, `createTime`, `userLevel` | — |
| `SaveLanguage` | Save language preference | `userid`, `sdk`, `appid`, `language` | — |

### 2.3 Non-SDK Login (Original)

```javascript
// Default login for non-SDK environments:
{
    type: "User",
    action: "loginGame",
    userId: username,           // user-chosen username
    password: "game_origin",    // HARDCODED default password
    fromChannel: "ppgame",       // from window.sdkChannel
    subChannel: "",             // from window.getAppId()
    version: "1.0"
}
```

---

## 3. Main Server — Complete Handler Reference

### 3.1 Connection

- URL: from `serverItem.url` (received in GetServerList response)
- `verifyEnable = true` → TEA verify handshake required (see Section 6)
- Persistent connection during gameplay

### 3.2 Complete Handler List by Module (ALL ~400+ handlers)

#### 3.2.1 user (13 actions)
`enterGame`, `exitGame`, `registChat`, `changeHeadImage`, `changeHeadBox`,
`changeNickName`, `queryPlayerHeadIcon`, `saveFastTeam`, `setFastTeamName`,
`suggest`, `clickSystem`, `getBulletinBrief`, `readBulletin`

#### 3.2.2 hero (21 actions)
`getAttrs`, `getAll`, `qigong`, `saveQigong`, `cancelQigong`, `evolve`, `resolve`,
`reborn`, `inherit`, `splitHero`, `activeSkill`, `useSkin`, `activeSkin`,
`wakeUp`, `autoLevelUp`, `autoHeroBreak`, `activeHeroBreak`, `heroBreak`,
`rebornSelfBreak`, `queryHeroEquipInfo`, `queryArenaHeroEquipInfo`

#### 3.2.3 summon (6 actions)
`summonOneFree`, `summonOne`, `summonTen`, `summonEnergy`, `setWishList`, `readWishList`

#### 3.2.4 dungeon — solo (4 actions)
`startBattle`, `checkBattleResult`, `sweep`, `buyCount`

#### 3.2.5 arena (10 actions)
`join`, `startBattle`, `getBattleRecord`, `setTeam`, `getRank`, `getRecord`,
`select`, `getDailyReward`, `topAward`, `buy`

#### 3.2.6 guild (34 actions)
`getGuildDetail`, `getGuildList`, `getGuildByIdOrName`, `createGuild`,
`requestGuild`, `handleRequest`, `quitGuild`, `kickOut`, `transferCaptain`,
`impeachCaptain`, `appointmentViceCaptain`, `relieveViceCaptain`, `getMembers`,
`getGuildLog`, `getRequestMembers`, `updateGuildIcon`, `updateBulletin`,
`updateDes`, `changeGuildName`, `checkPropaganda`, `updateRequestCondition`,
`readBulletin`, `getTreasureInfo`, `treasureStartBattle`, `updateTreasureDefenceTeam`,
`startBoss`, `checkBossResult`, `getGuildBossInfo`, `buyBossTimes`, `getSatanGift`,
`guildSign`, `getTreasurePoint`, `upgradeTech`, `resetTech`

#### 3.2.7 friend (16 actions)
`applyFriend`, `getFriends`, `getApplyList`, `recommendFriend`,
`handleApply`, `delFriend`, `addToBlacklist`, `removeBalcklist`,
`friendBattle`, `getFriendArenaDefenceTeam`, `findUserBrief`,
`giveHeart`, `getHeart`, `autoGiveGetHeart`, `friendServerAction`,
`delFriendMsg`, `recommendBattleFriend`

#### 3.2.8 war / Global War (12 actions)
`getSignUpInfo`, `signUp`, `getAuditionInfo`, `getAuditionRank`,
`getAuditionReward`, `getTeamInfo`, `getUserTeam`, `getChampionRank`,
`getBattleRecord`, `bet`, `like`, `getBetReward`

#### 3.2.9 topBattle (19 actions)
`getTeamInfo`, `setTeam`, `queryRank`, `queryHistoryList`, `queryHistory`,
`getBattleRecord`, `getTopBattleRecord`, `startBattle`, `tryMatch`,
`startSeason`, `like`, `bet`, `getBetReward`, `getRankReward`, `buyTimes`,
`queryBackupTeam`, `queryBackupTeamEquip`, `queryUserHistory`, `getPassRank`

#### 3.2.10 ballWar / Dragon Ball War (14 actions)
`getBriefInfo`, `getAreaInfo`, `getPointRank`, `getGuildMemberHonours`,
`getFinishInfo`, `getRecord`, `getFlagOwnerInfo`, `checkHaveDefence`,
`setDefence`, `removeDefence`, `startBattle`, `signUpBallWar`, `buyTimes`,
`setTopMsg`

#### 3.2.11 activity (105 actions — LARGEST MODULE)

| # | Action | Description |
|---|--------|-------------|
| 1 | `getActivityBrief` | Fetch activity summary list |
| 2 | `getActivityDetail` | Fetch full activity detail |
| 3 | `normalLuck` | Normal lucky draw |
| 4 | `luxuryLuck` | Luxury/premium lucky draw |
| 5 | `mergeBossStartBattle` | Merge boss battle |
| 6 | `mergeBossInfo` | Merge boss info |
| 7 | `mergeBossBuyTimes` | Buy merge boss times |
| 8 | `newHeroChallenge` | New hero challenge |
| 9 | `newHeroChallengeLike` | Like new hero challenge |
| 10 | `newHeroChallengeQueryWinRank` | Query win rank |
| 11 | `newHeroChallengeQueryHonorRoll` | Query honor roll |
| 12 | `heroRewardBuyToken` | Buy hero reward token |
| 13 | `heroRewardGetReward` | Get hero reward |
| 14 | `activityGetTaskReward` | Get activity task reward |
| 15 | `imprintUpGetReward` | Imprint upgrade reward |
| 16 | `imprintExtraction` | Imprint extraction |
| 17 | `refreshImprint` | Refresh imprint |
| 18 | `queryImprintTmpPower` | Query imprint temp power |
| 19 | `handleRefreshImprintResult` | Handle refresh imprint result |
| 20 | `imprintUpStudy` | Imprint up study |
| 21 | `luckEquipGetReward` | Lucky equip reward |
| 22 | `luckEquipPushEquip` | Push equip to slot |
| 23 | `luckEquipGetEquip` | Get equip from slot |
| 24 | `luckEquipUp` | Upgrade lucky equip |
| 25 | `beStrongGiftActReward` | Be strong gift reward |
| 26 | `beStrongActiveActReward` | Be strong active reward |
| 27 | `beStrongBuyDiscount` | Buy discount item |
| 28 | `beStrongRefreshDiscount` | Refresh discount list |
| 29 | `getLoginActivityReward` | Login activity reward |
| 30 | `getLoginActivityExReward` | Login extra reward |
| 31 | `getGrowActivityReward` | Growth activity reward |
| 32 | `recharge3DayReward` | 3-day recharge reward |
| 33 | `recharge3FinialReward` | 3-day recharge final reward |
| 34 | `recharge3DayResign` | 3-day recharge resign |
| 35 | `recharge7Reward` | 7-day recharge reward |
| 36 | `rechargeDailyReward` | Daily recharge reward |
| 37 | `heroGiftReward` | Hero gift reward |
| 38 | `heroOrangeReward` | Hero orange reward |
| 39 | `buyNewServerGift` | Buy new server gift |
| 40 | `rechargeGiftReward` | Recharge gift reward |
| 41 | `friendBattleActReward` | Friend battle activity reward |
| 42 | `marketActReward` | Market activity reward |
| 43 | `entrustActReward` | Entrust activity reward |
| 44 | `karinActReward` | Karin activity reward |
| 45 | `karinRichTask` | Karin rich task |
| 46 | `karinRich` | Karin rich action |
| 47 | `buySuperGift` | Buy super gift |
| 48 | `buyHeroSuperGift` | Buy hero super gift |
| 49 | `dailyBigGiftReward` | Daily big gift reward |
| 50 | `cumulativeRechargeReward` | Cumulative recharge reward |
| 51 | `singleRechargeReward` | Single recharge reward |
| 52 | `bulmaPartyBuyGoods` | Bulma party buy goods |
| 53 | `buyTodayDiscount` | Buy today's discount |
| 54 | `buyDailyDiscount` | Buy daily discount |
| 55 | `summonGiftReward` | Summon gift reward |
| 56 | `costFeedback` | Consumption feedback |
| 57 | `whisFeastGetRankReward` | Whis feast rank reward |
| 58 | `whisFeastFoodFeedbackReward` | Whis feast food feedback |
| 59 | `whisFeastGivingFood` | Whis feast giving food |
| 60 | `whisFeastBlessExchange` | Whis feast bless exchange |
| 61 | `turnTableGetReward` | Turntable reward |
| 62 | `turnTable` | Turntable spin |
| 63 | `buggyGetTaskReward` | Buggy treasure task reward |
| 64 | `buggyTreasureNext` | Buggy treasure next |
| 65 | `buggyTreasureRandom` | Buggy treasure random |
| 66 | `weaponCastGetReward` | Weapon cast reward |
| 67 | `queryWeaponCastRecord` | Query weapon cast record |
| 68 | `weaponCastLottery` | Weapon cast lottery |
| 69 | `shopBuy` | Shop buy (activity context) |
| 70 | `newHeroRewardBuyGoods` | New hero reward buy |
| 71 | `newHeroRewardPropExchange` | New hero reward prop exchange |
| 72 | `merchantExchange` | Merchant exchange |
| 73 | `luckyWheelGetReward` | Lucky wheel reward |
| 74 | `luckyWheelLottery` | Lucky wheel lottery |
| 75 | `getLanternBlessTaskReward` | Lantern bless task reward |
| 76 | `lanternBless` | Lantern bless action |
| 77 | `resetLanternBless` | Reset lantern bless |
| 78 | `lanternBlessClickTip` | Lantern bless click tip |
| 79 | `queryLanternBlessRecord` | Query lantern bless record |
| 80 | `getFundReward` | Get fund reward |
| 81 | `buyFund` | Buy fund |
| 82 | `GAGetTaskReward` | GA task reward |
| 83 | `GARoll` | GA roll |
| 84 | `GAOpenBox` | GA open box |
| 85 | `blindBoxShowRewards` | Blind box show rewards |
| 86 | `blindBoxRefresh` | Blind box refresh |
| 87 | `upsetBlindBox` | Upset blind box |
| 88 | `blindBoxOpen` | Blind box open |
| 89 | `queryCSRank` | Query cross-server rank |
| 90 | `getRank` | Get activity rank |
| 91 | `doubleElevenGetPayReward` | Double eleven pay reward |
| 92 | `heroHelpBuy` | Hero help buy |
| 93 | `gleaning` | Gleaning action |
| 94 | `gleaningBuyTicket` | Gleaning buy ticket |
| 95 | `goodHarvestsGetReward` | Good harvests reward |
| 96 | `attackNienBeast` | Attack nien beast |
| 97 | `userCertification` | User certification |
| 98 | `luckFeedbackGetBox` | Luck feedback get box |
| 99 | `luckFeedbackGetReward` | Luck feedback get reward |
| 100 | `timeLimitPropReceive` | Time limit prop receive |
| 101 | `timeLimitPropExchange` | Time limit prop exchange |
| 102 | `diamondShop` | Diamond shop |
| 103 | `equipUp` | Equipment upgrade (activity) |
| 104 | `fblike` | Facebook like reward |
| 105 | `iosComment` | iOS comment reward |

#### 3.2.12 hangup / Idle (8 actions)
`startGeneral`, `checkBattleResult`, `saveGuideTeam`, `buyLessonFund`,
`getLessonFundReward`, `nextChapter`, `getChapterReward`, `gain`

#### 3.2.13 All Other Modules (Complete)

| Module | Type | Actions | Description |
|--------|------|---------|-------------|
| tower | `tower` | 12 | Karin Tower: `startBattle`, `openBox`, `openTimesEvent`, `climb`, `autoGetEventsReward`, `openKarin`, `buyClimbTimes`, `getLocalRank`, `getAllRank`, `getFeetInfo`, `buyBattleTimes` |
| snake | `snake` | 9 | Snake Dungeon: `startBattle`, `recoverHero`, `getEnemyInfo`, `reset`, `getSnakeInfo`, `awardBox`, `sweep`, `getAllBoxReward` |
| expedition | `expedition` | 12 | Expedition: `clickExpedition`, `investigation`, `quickFinishEvent`, `finishEvent`, `collection`, `startEvent`, `startBattle`, `checkBattleResult`, `saveTeam`, `delTeam`, `takeOutMachine`, `levelUpMachine`, `unlockMachine`, `putInMachine` |
| trial | `trial` | 7 | Space Trial: `getState`, `startBattle`, `checkBattleResult`, `vipBuy`, `getDailyReward`, `buyFund`, `getFundReward`, `buyLessonFund`, `getLessonFundReward` |
| gravity | `gravity` | 4 | Gravity Test: `startBattle`, `checkBattleResult`, `buyTimes`, `getRank` |
| maha | `maha` | 6 | Maha Adventure: `join`, `getFriend`, `startBattle`, `friendBattle`, `risk`, `buyTimes` |
| mine | `mine` | 8 | Mine: `getInfo`, `getLog`, `startBattle`, `move`, `getChest`, `openAll`, `resetCurLevel`, `buyStep` |
| cellGame | `cellGame` | 8 | Cell Game: `reset`, `getInfo`, `startBattle`, `checkBattleResult`, `setTeam`, `recoverHero`, `getChest`, `resetCellGame` |
| bossCompetition | `bossCompetition` | 7 | Boss Competition: `getBossList`, `getComments`, `getDetail`, `attackOwner`, `attackBoss`, `autoFight`, `buyTimes` |
| training | `training` | 6 | Training: `getLog`, `clickExpedition`, `answer`, `runAway`, `move`, `buyTimes` |
| entrust | `entrust` | 12 | Entrust: `getInfo`, `reset`, `join`, `startEntrust`, `userEntrustBook`, `setHelpFriendHero`, `getFriendHeros`, `finishNow`, `getReward`, `refreshCurrent`, `getHelpRewardInfo`, `getHelpReward` |
| gemstone | `gemstone` | 4 | Gemstone: `appraisal`, `wear`, `levelUp`, `takeOff` |
| resonance | `resonance` | 6 | Hero Link: `clearSeatCD`, `buySeat`, `putChild`, `setMainHero`, `removeChild` |
| superSkill | `superSkill` | 5 | Super Skill: `evolveSuperSkill`, `levelUpSuperSkill`, `autoLevelUpSuperSkill`, `resetSuperSkill`, `activeSuperSkill` |
| backpack | `backpack` | 5 | Inventory: `randSummons`, `plus`, `openBox`, `useItem`, `sell` |
| mail | `mail` | 6 | Mail: `getReward`, `delMail`, `readMail`, `autoDelMail`, `getAllReward`, `getMailList` |
| battleMedal | `battleMedal` | 7 | Battle Medal: `buyLevel`, `getLevelReward`, `getAllLevelReward`, `getAllTaskReward`, `taskReward`, `buySuper`, `shop` |
| teamTraining | `teamTraining` | 4 | Team Training: `unlock`, `training`, `autoTraining`, `reborn` |
| dragon | `dragon` | 3 | Dragon Ball: `equip`, `wish`, `handleExchangeResult` |
| gift | `gift` | 12 | Gift/Welfare: `getRewardInfo`, `bsAddToHomeReward`, `useActiveCode`, `buyGold`, `getFrisetRechargeReward`, `getVipReward`, `buyVipGift`, `buyFund`, `getChannelWeeklyRewrd`, `getLevelReward`, `getOnlineGift`, `clickHonghuUrl` |
| timeBonus | `timeBonus` | 2 | Time Bonus: `triggerLackOfGoldBonus`, `buyBonus` |
| littleGame | `littleGame` | 3 | Mini Game: `getBattleReward`, `getChapterReward`, `click` |
| heroImage | `heroImage` | 7 | Hero Image: `getComments`, `readHeroVersion`, `likeComment`, `unlikeComment`, `addComment`, `getAll`, `getMsgList` |
| userMsg | `userMsg` | 6 | User Message: `getMsg`, `readMsg`, `friendServerAction`, `getMsgList`, `sendMsg`, `delFriendMsg` |
| market | `market` | 1 | Market: `getInfo` |
| vipMarket | `vipMarket` | 1 | VIP Market: `getInfo` |
| rank | `rank` | 2 | Rank: `getRank`, `like` |
| task | `task` | 2 | Task/Quest: `queryTask`, `getReward` |
| shop | `shop` | 4 | Shop: `getInfo`, `buy`, `readNew`, `refresh` |
| battle | `battle` | 1 | Battle: `getRandom` |
| timeMachine | `timeMachine` | 4 | Time Machine: `start`, `startBoss`, `checkBattleResult`, `getReward` |
| timeTrial | `timeTrial` | 6 | Time Trial: `getTimeTrialHeroPower`, `getPassRank`, `getStarReward`, `startBattle`, `checkBattleResult`, `buyTimes` |
| strongEnemy | `strongEnemy` | 5 | Strong Enemy: `startBattle`, `checkBattleResult`, `getRankInfo`, `getInfo`, `buyTimes` |
| teamDungeonGame | `teamDungeonGame` | 18 | Team Dungeon (relay): `createTeam`, `apply`, `queryTeamById`, `queryTeamByDisplayId`, `queryTeam`, `queryMyApplyList`, `queryMyRecord`, `queryTeamMembers`, `queryTeamsMember`, `queryUserTeam`, `queryKillRank`, `quitTeam`, `getAllReward`, `getReward`, `getAchReward`, `getDailyTaskReward`, `setTeamDungeonTeam`, `autoApply`, `addRobot` |
| checkin | `checkin` | 1 | Check-in: `checkin` |
| monthCard | `monthCard` | 2 | Month Card: `getReward`, `buyCard` |
| guide | `guide` | 1 | Tutorial save: `saveGuide` |
| recharge | `recharge` | 1 | Recharge: `recharge` |
| retrieve | `retrieve` | 2 | Resource Recovery: `hangupReward`, `dungeonReward` |
| questionnaire | `questionnaire` | 1 | Survey: `submitQuestionnaire` |
| battleRecordCheck | `battleRecordCheck` | 1 | Anti-cheat: `checkBattleRecord` |
| buryPoint | `buryPoint` | 1 | Analytics: `guideBattle` |
| downloadReward | `downloadReward` | 2 | Download reward: `getDownloadReward`, `clickDownload` |
| YouTuber | `YouTuber` | 2 | YouTube recruit: `getYouTuberRecruitReward`, `joinYouTuberPlan` |

#### 3.2.14 teamDungeonTeam (dungeon-server, 13 actions)
`clientConnect`, `refreshApplyList`, `changePos`, `startBattle`, `agree`,
`queryUserTeam`, `changeAutoJoinCondition`, `queryTodayMap`, `queryRobot`,
`queryHistoryMap`, `queryTeamRecord`, `queryBattleRecord`

### 3.3 Notify (Server→Client Push, 35+ actions)

Server pushes real-time events via `socket.emit('Notify', data)`:

| Action | Description | Key Data Fields |
|--------|-------------|----------------|
| `Kickout` | Force disconnect | — |
| `guildAgree` | Guild join accepted | teamID |
| `beKickedOutGuild` | Kicked from guild | teamID |
| `redDotDataChange` | UI red dot update | `redData` |
| `payFinish` | Payment completed | `_goodId`, `_detail._buyCount`, `_code` |
| `timeBonus` | Time bonus award | — |
| `heroBackpackFull` | Hero bag full warning | — |
| `onlineBulletin` | Server announcement | `bulletins[]` |
| `scheduleModelRefresh` | Schedule model update | `_model` (daily reset data) |
| `monthCard` | Month card update | activity data |
| `vipLevel` | VIP level change | activity data |
| `notifySummon` | Summon result | hero data |
| `warStageChange` | Global War stage change | `stage`, `signed`, `session`, `worldId`, `areaId` |
| `warRankChange` | Global War rank change | rank, buff data |
| `broadcast` | Server broadcast message | message data |
| `itemChange` | Items changed | change info |
| `joinTeamSuccess` | Team dungeon joined | team data |
| `teamDungeonFinish` | Team dungeon complete | result data |
| `teamDungeonTaskChange` | Team dungeon task | task data |
| `teamDungeonExpire` | Team dungeon expired | — |
| `teamDungeonBroadcast` | Team dungeon broadcast | message data |
| `teamDungeonHideChange` | Team dungeon hidden info | info data |
| `teamDungeonCloseTimeChange` | Team dungeon close time | time data |
| `userMessage` | New message/mail | message data |
| `mainTaskChange` | Main quest progress | task data |
| `areanRecord` | Arena record | arena data |
| `battleMedalRefresh` | Battle medal refresh | medal data |
| `topBattleBeAttack` | Top battle attacked | attack info |
| `topBattleStageChange` | Top battle stage change | stage data |
| `updateForbiddenChat` | Chat restriction | forbidden data |
| `addQuestionnaire` | New questionnaire | quest data |

### 3.4 enterGame Response (57+ fields — CRITICAL)

This is the most important response. When a player enters the game, the server must return ALL player state:

```json
{
  "newUser": true,
  "broadcastRecord": [],
  "user": {
    "level": 1, "exp": 0, "vip": 0, "diamond": 0, "gold": 0,
    "headImage": "", "headBox": 0, "nickName": "",
    "power": 0, "createTime": 0, "loginToken": ""
  },
  "heros": [ /* array of hero objects (see Section 9) */ ],
  "totalProps": [ /* inventory array */ ],
  "hangup": { "chapter": 801, "lesson": 10101, "state": 0, "startTime": 0 },
  "summon": { "freeTime": 0, "pool": "normal" },
  "equip": { /* equipment data */ },
  "dungeon": { /* dungeon progress */ },
  "guild": { /* guild info */ },
  "checkin": { /* checkin state */ },
  "guide": { /* tutorial progress */ },
  "task": { /* task/quest progress */ },
  "teamDungeon": { /* team dungeon login info */ },
  "teamDungeonOpenTime": 0,
  "teamDungeonTask": {},
  "teamDungeonSplBcst": {},
  "teamDungeonNormBcst": {},
  "teamDungeonHideInfo": {},
  "teamDungeonInvitedFriends": [],
  "teamServerHttpUrl": "http://127.0.0.1:8300",
  "myTeamServerSocketUrl": "http://127.0.0.1:8300",
  "vip": {},
  "sign": { /* sign/imprint data */ },
  "ring": { /* ring data */ },
  "weapon": { /* weapon data */ },
  "reward": { /* reward data */ },
  "rankData": {},
  "activityData": {},
  "battleMedal": {},
  "newPlayerLevel2": false,
  "newPlayerLevel3": false,
  "newPlayerLevel4": false,
  "newPlayerLevel5": false,
  "newPlayerLevel6": false,
  "redDotData": {}
}
```

### 3.5 Router Logic

```javascript
// Pseudocode for main-server router:
socket.on('handler.process', async (data, callback) => {
    const { type, action } = data;
    
    // Special: registChat is in user type but has custom handling
    // Special: exitGame disconnects player
    
    const handlerPath = `./${type}/${action}.js`;
    try {
        const handler = require(handlerPath);
        const result = await handler.execute(data, socket);
        callback(Response.success(result));
    } catch (err) {
        callback(Response.error(err.code || 1));
    }
});
```

**Example:** Client sends `{type:"hero", action:"evolve", heroId:"xxx"}` → loads `./hero/evolve.js`

**Incremental development possible:** Create folders + action files for the handlers being worked on. Missing handlers return error.

---

## 4. Chat Server (5 Handlers, WITH TEA)

### 4.1 Connection

- URL: from main-server `registChat` response → `_chatServerUrl`
- `verifyEnable = true` → TEA verify handshake
- `ret` field uses string `"SUCCESS"` instead of number `0`

### 4.2 Handlers

| Action | Function | Key Request Fields |
|--------|----------|-------------------|
| `login` | Authenticate chat session | `userId`, `serverId` |
| `sendMsg` | Send chat message | `userId`, `kind` (MESSAGE_KIND), `content`, `roomId` |
| `joinRoom` | Join a chat room | `userId`, `roomId` |
| `leaveRoom` | Leave a chat room | `userId`, `roomId` |
| `getRecord` | Get chat history | `userId`, `roomId`, `startTime` |

### 4.3 Room Types (MESSAGE_KIND)

| Kind | Value | Room ID Source |
|------|-------|---------------|
| SYSTEM | 1 | — |
| WORLD | 2 | `worldRoomId` (from GetServerList) |
| GUILD | 3 | `guildRoomId` (from GetServerList) |
| PRIVATE | 4 | — (dynamic target userId) |
| WORLD_TEAM | 5 | `teamDungeonChatRoom` (from GetServerList) |
| TEAM | 6 | `teamChatRoomId` (dynamic, per-team) |

### 4.4 Chat Message Format

```json
{
  "_msg": "Hello world",
  "_kind": 2,
  "_userId": "user123",
  "_name": "Player1",
  "_content": "Hello world",
  "_time": 1714012345,
  "_type": 1,
  "_param": ""
}
```

- Client stores max **60 messages per kind**
- Chat history retrieved via `getRecord` with `startTime` pagination

### 4.5 Chat Connection Flow

```
Main: registChat → get chatServerUrl + all roomIds
→ connect chat-server → TEA verify → chat login
→ joinRoom(worldRoomId) → joinRoom(guildRoomId)
→ joinRoom(teamDungeonChatRoom) → joinRoom(teamChatRoomId)
```

---

## 5. Dungeon Server (Multiplayer) (11 Socket + 2 HTTP, WITH TEA)

### 5.1 Connection

- URL: from `serverItem.dungeonurl` (GetServerList/enterGame/joinTeam)
- `verifyEnable = true` → TEA verify handshake
- **DYNAMIC URL** — changes when joining/creating a new team dungeon
- Also serves **HTTP endpoints** for queries

### 5.2 Socket Handlers (type: `teamDungeonTeam`)

| Action | Function |
|--------|----------|
| `clientConnect` | Confirm connection to dungeon instance |
| `refreshApplyList` | Refresh applicant list |
| `changePos` | Change member position on grid |
| `startBattle` | Start dungeon battle |
| `agree` | Accept an applicant |
| `queryUserTeam` | View a user's lineup |
| `changeAutoJoinCondition` | Set auto-join criteria |
| `queryTodayMap` | Get available dungeons for today |
| `queryRobot` | Get available robot teammates |
| `queryHistoryMap` | Get historical dungeon maps |
| `queryTeamRecord` | Get team record |
| `queryBattleRecord` | Get battle record |

### 5.3 Dungeon Notify (Server→Client)

`TDMemberJoin`, `TDMemberQuit`, `TDStartBattle`, `TDNewApply`, `TDChangePos`

### 5.4 Multiplayer Dungeon Flow

```
Main: createTeam/apply → get socketUrl + chatRoomId
→ disconnect old dungeon → connect new dungeon (dynamic URL)
→ dungeon: clientConnect → chat: joinRoom(teamChatRoomId)
→ dungeon: changePos → dungeon: startBattle → push TDStartBattle
→ Main push: teamDungeonFinish → rewards
→ dungeon disconnect → chat: leaveRoom
```

---

## 6. TEA Encryption Implementation

### 6.1 Overview

- **Key:** `"verification"` (hardcoded, 16 characters)
- **Algorithm:** Standard TEA in ECB mode, 64-bit blocks
- **Delta constant:** `2654435769` (0x9E3779B9)
- **Encoding:** UTF-8 plaintext → TEA encrypt → Base64 output
- **Used by:** main-server, chat-server, dungeon-server (NOT login-server)

### 6.2 TEA Verify Handshake Flow

```
1. Client connects to server
2. Server emits 'verify' event with a random challenge string
3. Client receives challenge, encrypts: new TEA().encrypt(challenge, "verification")
4. Client emits 'verify' event with encrypted string
5. Server decrypts with same key, compares with original challenge
6. If match: Server emits {ret: 0} → Client proceeds to handlers
7. If fail: Server emits error → Client disconnects
```

### 6.3 TEA Implementation (Ready to Port to Node.js)

```javascript
var TEA = (function () {
    function e() {}
    
    e.prototype.encrypt = function (plaintext, key) {
        if (0 == plaintext.length) return '';
        var n = this.strToLongs(Utf8.encode(plaintext));
        n.length <= 1 && (n[1] = 0);
        var o, a, r = this.strToLongs(Utf8.encode(key).slice(0, 16));
        var i = n.length, s = n[i - 1], l = n[0];
        var c = Math.floor(6 + 52 / i), p = 0;
        for (; c-- > 0;) {
            p += 2654435769;
            a = p >>> 2 & 3;
            for (var d = 0; i > d; d++) {
                l = n[(d + 1) % i];
                o = (s >>> 5 ^ l << 2) + (l >>> 3 ^ s << 4) ^ (p ^ l) + (r[3 & d ^ a] ^ s);
                s = n[d] += o;
            }
        }
        return Base64.encode(this.longsToStr(n));
    };

    e.prototype.decrypt = function (encrypted, key) {
        if (0 == encrypted.length) return '';
        var n = this.strToLongs(Base64.decode(encrypted));
        var r = this.strToLongs(Utf8.encode(key).slice(0, 16));
        var i = n.length, s = n[i - 1], l = n[0];
        var c = Math.floor(6 + 52 / i), p = c * 2654435769;
        for (; 0 != p;) {
            var o = p >>> 2 & 3;
            for (var d = i - 1; d >= 0; d--) {
                s = n[d > 0 ? d - 1 : i - 1];
                var n_val = (s >>> 5 ^ l << 2) + (l >>> 3 ^ s << 4) ^ (p ^ l) + (r[3 & d ^ o] ^ s);
                l = n[d] -= n_val;
            }
            p -= 2654435769;
        }
        var g = this.longsToStr(n);
        return g = g.replace(/\0+$/, ''), Utf8.decode(g);
    };

    e.prototype.strToLongs = function (str) {
        var t = new Array(Math.ceil(str.length / 4));
        for (var n = 0; n < t.length; n++) {
            t[n] = str.charCodeAt(4*n) + (str.charCodeAt(4*n+1) << 8) 
                 + (str.charCodeAt(4*n+2) << 16) + (str.charCodeAt(4*n+3) << 24);
        }
        return t;
    };

    e.prototype.longsToStr = function (arr) {
        var t = new Array(arr.length);
        for (var n = 0; n < arr.length; n++) {
            t[n] = String.fromCharCode(255 & arr[n], arr[n] >>> 8 & 255, 
                     arr[n] >>> 16 & 255, arr[n] >>> 24 & 255);
        }
        return t.join('');
    };
    return e;
}());
```

### 6.4 Dependencies

- `Utf8` class: Standard UTF-8 encode/decode
- `Base64` class: Standard Base64 encode/decode
- Both are defined inline in the client code (~line 37500-37590)

---

## 7. LZString Compression

### 7.1 Implementation

The client uses a **full inline LZString** implementation (lines 37591-37926):

| Method | Direction | Purpose |
|--------|-----------|---------|
| `compressToUTF16(str)` | Server→Client (response) | Compress JSON to UTF-16 string (ends with space `' '`) |
| `decompressFromUTF16(str)` | Client→Server (battle record) | Decompress UTF-16 back to original string |

### 7.2 Server-Side Implementation

```javascript
// npm install lz-string
const LZString = require('lz-string');

function buildResponse(data) {
    return {
        ret: 0,
        data: LZString.compressToUTF16(JSON.stringify(data)),
        compress: true,
        serverTime: Date.now(),
        server0Time: Date.now()
    };
}

function buildErrorResponse(errorCode) {
    return {
        ret: errorCode,
        data: "",
        compress: false,
        serverTime: Date.now(),
        server0Time: Date.now()
    };
}

// Chat server uses string ret:
function buildChatResponse(data) {
    return {
        ret: "SUCCESS",
        data: LZString.compressToUTF16(JSON.stringify(data)),
        compress: true
    };
}
```

### 7.3 Client Decompression (Reference)

```javascript
// From client line ~113853:
if (e.compress && (i = LZString.decompressFromUTF16(e.data))) {
    var parsed = JSON.parse(i);
    callback(parsed);
}
```

---

## 8. Battle System

### 8.1 KEY FINDING: Battle is CLIENT-SIDE

**Battle simulation runs entirely on the client.** The server provides enemy data, the client simulates the battle locally, then sends only the result back to the server for validation and reward distribution.

### 8.2 Battle Flow

```
1. Client → Server: startBattle { team[], super[], battleField }
2. Server → Client: { _battleId, _rightTeam[], _rightSuper[], ...enemyData }
3. Client: Runs full battle simulation locally (auto-battle / manual)
4. Client → Server: checkBattleResult { battleId, checkResult: 0|1, battleField, super[], runaway }
5. Server → Client: { _battleResult: 0|1, _curLess, rewards... }
```

- `checkResult: 0` = Win, `checkResult: 1` = Lose
- `_battleResult: 0` = Win, `_battleResult: 1` = Lose

### 8.3 Team Position System

```javascript
TEAMPOS_DEF.FRONT_1 = 0    // Front-left
TEAMPOS_DEF.FRONT_2 = 1    // Front-right
TEAMPOS_DEF.BACK_1  = 2    // Back-left
TEAMPOS_DEF.BACK_2  = 3    // Back-mid
TEAMPOS_DEF.BACK_3  = 4    // Back-right
// MAX 5 heroes per team
```

### 8.4 Battle Constants (from constant.json)

| Constant | Value | Description |
|----------|-------|-------------|
| `battleSkip` | 6 | Can skip battle after round 6 |
| `battleGiveUpRound` | 6 | Can give up after round 6 |
| `C_DEFUALT_ROUND_TOTAL` | 15 | Max rounds per battle |
| `C_criticalDouble` | 1.3 | Critical damage multiplier |
| `C_infiniteLoop` | 9999 | Infinite loop protection |
| `maxMana` | 100 | Max energy |
| `startMana` | 50 | Starting energy |
| `normalMana` | 50 | Energy from normal attack hit |
| `beHitMana` | 10 | Energy gained when hit |
| `beCriticalMana` | 20 | Energy gained when critically hit |
| `superMaxMana` | 100 | Super skill max energy |
| `superStartMana` | 0 | Super skill starting energy |
| `superEveryTurnMana` | 25 | Energy per round for super skill |
| `superSkillMana` | 15 | Cost to use super skill |
| `superDeathMana` | 25 | Energy from ally death |

### 8.5 Dungeon Types

| Type | Value | Description |
|------|-------|-------------|
| EXP | 1 | Experience dungeon |
| EVOLVE | 2 | Evolve material dungeon |
| ENERGY | 3 | Energy dungeon |
| EQUIP | 4 | Equipment dungeon |
| SINGA | 5 | Sign dungeon A |
| SINGB | 6 | Sign dungeon B |
| METAL | 7 | Metal dungeon |
| Z_STONE | 8 | Z-Stone dungeon |

### 8.6 GameFieldType Values

```
expDungeon, evolveDungeon, metalDungeon, zStoneDungeon, equipDungeon, signDungeon,
templeTest, mine, snakeDungeon, timeTravel, training, arena, karinTower, guildLoot,
cellGame, mahaAdventure, bossAttack, bossSnatch, guildBoss, lesson, friendBattle,
expedition, globalWar, dragonBallWar, mergeServerBoss, timeTrain, teamDungeon, 
topBattle, gravityTest
```

### 8.7 Battle Record Format (For Replay)

Battle records are LZString compressed JSON arrays. Each element:
```json
{ "dataType": 1, "dataJson": "..." }
```

| dataType | Name | Description |
|----------|------|-------------|
| 1 | SkillAnimationRecord | Skill animation trigger |
| 2 | SkillEffectRecord | Skill effect application |
| 3 | SkillAnimationBatchRecord | Batch animation |
| 4 | SkillHealthRecord | Health value record |
| 5 | SkillHealthChangeRecord | Health change event |
| 6 | SkillEnergyChangeRecord | Energy change event |
| 7 | SkillSuperEnergyRecord | Super energy record |
| 8 | SkillSuperEnergyChangeRecord | Super energy change |
| 9 | RoundRecord | Round marker |
| 10 | EffectMissRecord | Miss/dodge event |
| 11 | DeathRecord | Unit death event |
| 12 | FinaleResultRecord | Battle result + damage stats |
| 13 | JumpActionRecord | Jump action |
| 14 | RebornRecord | Rebirth event |

### 8.8 Hero Attribute List (48 attributes)

```
hp, attack, armor, speed, hit, dodge, block, blockEffect, skillDamage, critical,
criticalResist, criticalDamage, armorBreak, damageReduce, controlResist, trueDamage,
energy, hpPercent, armorPercent, attackPercent, speedPercent, power, orghp,
superDamage, healPlus, healerPlus, extraArmor, shielderPlus, damageUp, damageDown,
talent, superDamageResist, dragonBallWarDamageUp, dragonBallWarDamageDown,
bloodDamage, normalAttack, criticalDamageResist, blockThrough, controlAdd,
bloodResist, extraArmorBreak, energyMax, attackPercentInBattle, teamWarDamageUp,
teamWarDamageDown, additionArmor, corrosionResist
```

---

## 9. Hero & Equipment Data Structures

### 9.1 Hero Template (from hero.json)

```json
{
  "id": 1205,
  "clientType": "hero",
  "system": "英雄",
  "type": "strength",          // body | strength | skill
  "heroType": "critical",      // critical | skill | body | hit | block | dot | armorS | etc.
  "quality": "purple",         // white | green | blue | purple | orange | flickerOrange | superOrange
  "tag": "tortoise,saiyan,child,Goku",
  "wakeupMax": 3,              // Max awakening level
  "skill": "120501",           // Active skill ID
  "skillLevel": 4,             // Skill starting level
  "skillPassive1": "120511",   // Passive skill 1
  "passiveLevel1": 5,
  "skillPassive2": "120521",   // Passive skill 2
  "passiveLevel2": 5,
  "super": "120561",           // Super skill ID
  "potential1": "120541",      // Potential skill 1
  "potential2": "120542",      // Potential skill 2
  "defaultSkin": 1205000,
  "balancePower": 1.2,
  "balanceHp": 1,
  "balanceAttack": 1,
  "balanceArmor": 1,
  "talent": 0.4,
  "speed": 376,
  "name": "hero_name_15"
}
```

### 9.2 Hero Quality Tiers

| Quality | Numeric | Color | Star Cap |
|---------|---------|-------|----------|
| white | 0 | White (#EBEBEB) | 0 |
| green | 1 | Green (#71F13F) | 1 |
| blue | 2 | Blue (#81ABFF) | 2 |
| purple | 3 | Purple (#E371FF) | 3 |
| orange | 4 | Orange | 4 |
| flickerOrange | 5 | Silver-Orange | 5 |
| superOrange | 6 | Super Orange | 6 |

### 9.3 Hero Career Types

| Class | Type | Description |
|-------|------|-------------|
| BODY | `body` | Defense type |
| STRENGTH | `strength` | Attack type |
| SKILL | `skill` | Magic/skill type |

### 9.4 Hero Server Data (Player's hero instance)

All server hero data fields use `_` prefix:

```json
{
  "_heroId": "uuid-string",
  "_heroDisplayId": 1205,
  "_heroStar": 3,
  "_heroTag": ["saiyan", "tortoise"],
  "_fragment": 15,
  "_superSkillResetCount": 0,
  "_potentialResetCount": 0,
  "_heroBaseAttr": {
    "_level": 80,
    "_exp": 50000,
    "_items": [
      { "_id": "hp", "_num": 15000 },
      { "_id": "attack", "_num": 2500 },
      { "_id": "armor", "_num": 1200 },
      { "_id": "speed", "_num": 376 }
    ]
  },
  "_superSkillLevel": {
    "_items": { "_id": "120561", "_level": 3 }
  },
  "_potentialLevel": {
    "_items": { "_id": "120541", "_level": 2 }
  },
  "_qigong": {
    "_items": [{ "_id": "attack", "_num": 100 }]
  },
  "_qigongTmp": {
    "_items": []
  },
  "_qigongStage": 1,
  "_qigongTmpPower": 0,
  "_totalCost": {
    "_wakeUp": { "_items": [] },
    "_earring": { "_items": [] },
    "_levelUp": { "_items": [] },
    "_evolve": { "_items": [] },
    "_skill": { "_items": [] },
    "_qigong": { "_items": [] },
    "_heroBreak": { "_items": [] }
  },
  "_breakInfo": {
    "_breakLevel": 1,
    "_level": 0,
    "_attr": { "_items": [{ "_id": "attack", "_num": 50 }] }
  },
  "_gemstoneSuitId": 0,
  "_linkTo": [],
  "_linkFrom": "",
  "_expeditionMaxLevel": 0,
  "_skinId": 0,
  "_weaponHaloId": 0,
  "_weaponHaloLevel": 0
}
```

### 9.5 Team Data Format (Sent to Server)

```json
// team parameter in startBattle is an array of 5 hero references:
[
  { "heroId": "uuid-1" },  // position 0 (FRONT_1)
  { "heroId": "uuid-2" },  // position 1 (FRONT_2)
  { "heroId": "uuid-3" },  // position 2 (BACK_1)
  { "heroId": "uuid-4" },  // position 3 (BACK_2)
  { "heroId": "uuid-5" }   // position 4 (BACK_3)
]
```

---

## 10. Equipment System (equip)

**Type:** `'equip'` — 10 actions (includes ring actions)

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `wear` | `heroId`, `pos`, `equipId`, `stoneId?` | `_changeInfo`, `heroId`, `_delStoneId?`, full equip model |
| `takeOff` | `heroId`, `pos`, `equipId`, `stoneId?` | `_delStoneId?`, `_changeInfo`, heroId |
| `wearAuto` | `heroId`, `equipInfo` (object: `{pos: equipId}`), `weaponId` (array) | `_changeInfo`, `heroId`, full hero equip data |
| `takeOffAuto` | `heroId` | `_takeOffStoneIds`, `_delStoneIds`, `_changeInfo`, `heroId` |
| `activeWeapon` | `heroId` | Full equip model, `heroId`, total attrs |
| `activeRing` | `heroId` | `_equip` (earring data), `heroId`, `_openType`, `_changeInfo` |
| `ringEvolve` | `heroId` | `_equip`, `heroId`, `_openType`, `_changeInfo` |
| `autoRingLevelUp` | `heroId`, `times` (1 or 10) | `_equip`, `heroId`, `_changeInfo` |
| `merge` | `count`, `equipId` | `_changeItem._items` |
| `autoMerge` | `equipType`, `isRed` (boolean) | `_changeInfo._items` |

**Equipment Config (equip.json):** Each equip has `id`, `quality` (green/blue/purple/orange/red), `star` (0-5), `type` (1-4: wristband/clothes/belt/shoes), `mergeLevel`, `mergePlayerLevel`, `mergeResult`, `mergeCostID`, `mergeCostNum`, `abilityNum`, `ability{N}/value{N}`, `belongToSuit?`, `thingsType:"equip"`, `price`.

---

## 11. Weapon System (weapon)

**Type:** `'weapon'` — 9 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `resolve` | `weaponIds` (array) | `_changeItem._items`, `_addWeapons?` |
| `reborn` | `weaponIds` (array), `keepStar` (boolean) | `_changeItem._items`, `_addWeapons?` |
| `merge` | `pieces` (array of `{id, num}`) | `_changeInfo._items` |
| `wear` | `heroId`, `weaponId` | Full weapon model, `heroId` |
| `takeOff` | `heroId`, `weaponId` | Full weapon model, `heroId` |
| `strengthen` | `heroId`, `weaponId` | `_changeInfo`, `heroId`, weapon data |
| `autoStrengthen` | `heroId`, `weaponId` | Same as strengthen (batch) |
| `upgrade` | `heroId`, `weaponId` | `_changeInfo`, `_openType`, `heroId`, weapon data |
| `levelUpHalo` | `heroId`, `weaponId`, `costWeaponIds` (array), `chooseHalo` | Weapon data, `_changeInfo` |

**Weapon Config (weapon.json):** Weapons have `id`, `name`, `quality`, `thingsType:"weapon"`, `halo?` (e.g. "101,102"), `Deification?` (red weapon evolution target). Max weapon level up: 5. Weapon unlock level: 40.

---

## 12. Sign/Imprint System (imprint)

**Type:** `'imprint'` — 12 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `queryImprint` | `queryUserId?`, `serverId?`, `imprintId?` | `_imprint` (serialized ImprintItem) |
| `decompose` | `imprintIds` (array) | `_changeInfo._items`, `_imprints?` |
| `reborn` | `imprintIds` (array), `keepStar` (boolean) | `_changeInfo._items`, `_imprints?` |
| `takeOff` | `imprintId`, `heroId` | `imprintId`, `heroId` |
| `wear` | `heroId`, `imprintId` (or `imprintIds` for autoWear) | `heroId`, hero imprint data |
| `autoTakeOff` | `heroId` | `heroId`, imprint data |
| `autoWear` | `heroId`, `imprintIds` (array) | `heroId`, imprint data |
| `merge` | `pieces` (array of `{id, num}`) | `_changeInfo._items` |
| `addAttr` | `imprintId`, `viceAttrId`, `high` (boolean) | `imprintId`, `viceAttrId`, `_newAttr`, `_curRdNum`, `_heroTotalAttr?` |
| `starUp` | `heroId`, `imprintId`, `costImprintIds` (array) | `_changeInfo`, `heroId`, `_openType` |
| `levelUp` | `heroId`, `imprintId` | `_changeInfo`, `heroId` |
| `autoLevelUp` | `heroId`, `imprintId` | Same as levelUp (batch) |

**Sign constants:** Start star: 0, Max star: 4, Random ability num: 8, Random ability max: 4.

---

## 13. Genki System (genki)

**Type:** `'genki'` — 4 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `queryGenki` | `queryUserId?`, `serverId?`, `genkiId?` | `_genki` (serialized GenkiItem) |
| `wear` | `heroId`, `genkiId`, `pos` | `_changeInfo`, `heroId` |
| `takeOff` | `heroId`, `genkiId` | `_changeInfo`, `heroId` |
| `smelt` | `genkiIds` (array), `smeltType` | `_changeInfo`, genki smelt results |

**Fusion costs:** Normal fusion: 500 exp, 60 gold/exp. Super fusion: 1000 exp, 50 gold/exp. Materials: Normal ("1,2"), Super ("3,4,5").

---

## 14. Gemstone System (gemstone)

**Type:** `'gemstone'` — 4 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `appraisal` | `stoneId` | `_stone`, `_heroId`, `_heroSuitId?`, `_heroTotalAttr`, `_delStoneIds?` |
| `wear` | `heroId`, `stoneIds` (array), `displayIds` (array) | `_heroSuitId?`, `_delStoneIds?` |
| `levelUp` | `stoneId`, `displayId`, `costUnique` (array), `costStack` (array) | `_heroTotalAttr`, gem data |
| `takeOff` | `stoneId` | `_delStoneId?`, `_changeInfo`, `heroId` |

**Gemstone Config (jewel.json):** Gemstones have `id`, `jewName`, `jewPosition` (1=wristband, 2=clothes, 3=belt, 4=shoes), `mainTag` (Saiya/Angel/Hakai/Create/Demon/LegendSaiya), `type` (strength/body/skill), `suitNumber`, `clusiveValueType`, `eVTNumber`, `jewExp`. Activation needed: 4 gemstones. Exp values: small=100, big=500. Level up para: 0.8.

---

## 15. Resonance / Hero Link System (resonance)

**Type:** `'resonance'` — 6 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `clearSeatCD` | `cabinId`, `seatId` | `_nextCanPutTime`, `_changeInfo` |
| `buySeat` | `cabinId`, `isSpecial` (boolean) | `_buySeatCount`, `_cabinDiamondSeat`, `_cabinSpecialSeat`, `_changeInfo` |
| `putChild` | `heroId`, `cabinId`, `seatId` | `_totalTalent?`, `_linkHeroes`, hero data |
| `setMainHero` | `heroId`, `cabinId` | `_linkHeroes`, `_totalTalent?` |
| `removeChild` | `cabinId`, `seatId` | `_linkHeroes`, hero data |

---

## 16. Super Skill System (superSkill)

**Type:** `'superSkill'` — 5 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `evolveSuperSkill` | `skillId` | `_skill`, `_changeInfo` |
| `levelUpSuperSkill` | `skillId` | `_skill`, `_openType`, `_changeInfo` |
| `autoLevelUpSuperSkill` | `skillId`, `times` (e.g. 999) | `_skill`, `_openType`, `_changeInfo` |
| `resetSuperSkill` | `skillId` | `_skill`, `_changeInfo` |
| `activeSuperSkill` | `skillId` | `_skill` |

**Rebirth cost:** Super Skill Rebirth ID: 101, cost: 50.

---

## 17. Backpack System (backpack)

**Type:** `'backpack'` — 5 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `randSummons` | `itemId`, `num` | `_changeInfo._items` (summon results) |
| `plus` | — | `_level` (new bag level) |
| `openBox` | `itemId`, `num`, `chooseIndex?` | `_changeInfo._items` |
| `useItem` | `itemId`, `num` | `_changeInfo._items` |
| `sell` | `itemId`, `itemNum` | `_changeInfo._items` |

---

## 18. Mail System (mail)

**Type:** `'mail'` — 6 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `getReward` | `mailId` | `_changeInfo._items` |
| `delMail` | `mailId` | Delete success |
| `readMail` | `mailId` | `_mail` (mail detail object) |
| `autoDelMail` | — | `_delMail` (array of deleted IDs) |
| `getAllReward` | — | `_changeInfo._items`, `_addHeroes`, `_addSigns`, `_addWeapons` |
| `getMailList` | — | `_mails` (array of mail objects) |

---

## 19. Battle Medal System (battleMedal)

**Type:** `'battleMedal'` — 7 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `buyLevel` | `uuid` (battleMedalId) | `_level`, `_buyLevelCount`, `_changeInfo` |
| `getLevelReward` | `level`, `isSuper`, `uuid` | `_changeInfo._items` |
| `getAllLevelReward` | `uuid` | `_changeInfo._items` |
| `getAllTaskReward` | `uuid` | `_addExp`, `_level`, `_curExp`, `_task` |
| `taskReward` | `taskId`, `uuid` | `_level`, `_curExp`, task data |
| `buySuper` | `uuid` | `prePayRet` (payment data) |
| `shop` | `itemId`, `num`, `uuid` | `_buyTimes`, `_changeInfo._items` |

**Constants:** Level buy cost: 90 diamonds, Duration: 30 days.

---

## 20. Team Training System (teamTraining)

**Type:** `'teamTraining'` — 4 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `unlock` | — | `_model` (training model data) |
| `training` | — | `_model`, `_updateAttrs` (map of heroId → attrs), `_changeInfo` |
| `autoTraining` | `times` | `_model`, `_updateAttrs`, `_changeInfo` |
| `reborn` | — | training reborn results |

**Constants:** Unlock level: 1, Consume: 50 diamonds per training.

---

## 21. Dragon Ball Wish System (dragon)

**Type:** `'dragon'` — 3 actions

| Action | Request Fields | Response Fields |
|--------|---------------|---------------|
| `equip` | `itemId` | `_changeInfo` |
| `wish` | `index` (1-5) | `_heros` (array), hero data |
| `handleExchangeResult` | `save` (boolean) | If save=true: `_heros` array |

**Dragon Exchange:** Dragon Soul ID: 1600, Piece ID: 2600. S-pool random: 7000, SS-pool: 3000. Exchange needed: item 124, S: 10 pieces, SS: 50 pieces, SSS: 50 pieces. VIP 9 required for SSS pool.

---

## 22. Check-in & Month Card System

### 22.1 Check-in System

**Type:** `'checkin'` — 1 action

```json
{ "type": "checkin", "action": "checkin", "userId": "string", "day": 1-7 }
```
**Response:** `_changeInfo._items` (reward items). 7-day cycle, tracked via `WelfareInfoManager`.

### 22.2 Month Card System

**Type:** `'monthCard'` — 2 actions (`getReward`, `buyCard`)

| ID | Name | Price (USD) | Diamonds | Duration | Daily Award |
|----|------|-------------|----------|----------|-------------|
| 1 | Small Monthly | $4.99 | 300 | 30 days | 100 gold |
| 2 | Big Monthly | $14.99 | 820 | 30 days | 300 gold |
| 3 | Lifelong | $14.99 | 980 | 999999 days | 200 gold |
| 4 | Evo Monthly | $4.99 | 0 | 30 days | 1x item 499 |

**Multi-currency:** CNY, USD, KRW, VND, IRR supported. Each card grants VIP exp = price × 10.

---

## 23. VIP System

### 23.1 VIP Levels

VIP levels: 1 through 18 (defined in `vip.json`). Experience gained from purchases: `vipExp = price × vipExpPara (10)`.

### 23.2 Key VIP Benefits

| Benefit | VIP 1 | VIP 4 | VIP 8 | VIP 12 | VIP 16 | VIP 18 |
|---------|-------|-------|-------|--------|--------|--------|
| Idle Award Plus | +10% | +40% | +80% | +120% | +200% | +220% |
| Hero Bag Plus | +10 | +20 | +40 | +70 | +100 | +100 |
| Arena Times | +2 | +3 | +5 | +7 | +10 | +12 |
| Resource Dungeon | +2 | +3 | +5 | +7 | +10 | +10 |
| Equip Dungeon | +1 | +3 | +4 | +6 | +8 | +9 |
| Sign Dungeon | +1 | +3 | +5 | +7 | +10 | +12 |
| Gold Buy Times | +3 | +8 | +16 | +30 | +50 | +50 |
| Market Refresh | +5 | +10 | +15 | +20 | +40 | +50 |

### 23.3 Special VIP Unlocks

| VIP Level | Unlock |
|-----------|--------|
| VIP 1 | Double Speed, World Chat, Guild Diamond Sign |
| VIP 2 | Attack Skip, Guild Create |
| VIP 3 | Summon Energy bonus, Guild Luxury Sign |
| VIP 6 | Quick Battle Snake, Training +1, Time Travel No.3 |
| VIP 7 | Idle +12h, Snake Wipe, Cell Game skip |
| VIP 8 | Market VIP access, Karin Tower skip |
| VIP 9 | Dragon VIP Pool, Dungeon Sweep |
| VIP 10 | Idle +24h, Mine Explore |
| VIP 14 | Arena Skip Battle |

---

## 24. Payment / IAP System

### 24.1 Two-Phase Payment Flow

**Phase 1: Pre-pay (Server creates order)**
```
Client → Server: { type: "recharge", action: "recharge", goodsId: 1 }
Server → Client: { prePayRet: { errorCode: 0, data: {...} } }
```

**Phase 2: SDK Payment**
```javascript
window.paySdk(paymentData);
```

**Phase 3: Server Push Confirmation**
```
Server → Client: Notify { action: "payFinish", _goodId: 1, _detail: { _buyCount: 1 }, _code: 0 }
```

### 24.2 Recharge Packages

| ID | Price | Diamonds | First Bonus | Normal Bonus |
|----|-------|----------|-------------|--------------|
| 1  | $0.99 | 60 | 120 | 60 |
| 2  | $4.99 | 300 | 600 | 300 |
| 3  | $9.99 | 600 | 1200 | 300 |
| 4  | $19.99 | 1200 | 2400 | 1200 |
| 5  | $29.99 | 1800 | 3600 | 900 |
| 6  | $49.99 | 3000 | 6000 | 1500 |
| 7  | $99.99 | 6000 | 12000 | 6000 |
| 8  | $199.99 | 12000 | 24000 | 6000 |

---

## 25. SDK Integration

### 25.1 SDK Login Info Structure

```javascript
{
    userId: string,
    sdk: string,          // ppgame, TanWanH5, Huawei, etc.
    nickName: string,
    sign: string,
    loginToken: string,
    security: string
}
```

### 25.2 SDK Functions (Window API)

| Function | Purpose |
|----------|---------|
| `window.getSdkLoginInfo()` | Get SDK login data |
| `window.checkSDK()` | Check if running in SDK |
| `window.paySdk(data)` | Initiate payment |
| `window.checkFromNative()` | Check if native app |
| `window.getAppId()` | Get app ID |
| `window.switchAccount()` | Switch SDK account |
| `window.switchUser()` | Switch user (KR/VI channels) |
| `window.contactSdk()` | Open customer service |
| `window.userCenterSdk()` | Open user center |
| `window.gameReady()` | Signal game ready |
| `window.gameChapterFinish(ch)` | Report chapter progress |
| `window.report2Sdk(data)` | Report analytics |
| `window.fbGiveLiveSdk()` | Facebook live SDK |

### 25.3 Known SDK Channels

`ppgame`, `TanWanH5`, `Huawei`, `game_origin` (non-SDK), `kr` (Korean), `en` (English with Facebook/Google/Yahoo), `sylz`, `tanwan55en`, `jr`

---

## 26. Daily Reset System

### 26.1 Reset Time

`"6:00:00"` (from `constant.json` field `resetTime`)

### 26.2 Server Push: scheduleModelRefresh

Server pushes `scheduleModelRefresh` notification with `_model` containing all counters. Client calls `AllRefreshCount.getInstance().initData(e._model)` to refresh.

### 26.3 Data Reset Daily

| Field | What it resets |
|-------|----------------|
| Arena attack times | `_arenaAttackTimes` |
| Snake Dungeon | `_snakeResetTimes`, `_snakeSweepCount` |
| Cell Game | `_cellGameHaveTimes`, `_cellGameHaveGotReward` |
| Boss Attack | `_strongEnemyTimes` |
| Karin Tower | `_karinBattleTimes` |
| Entrust | `_entrustResetTimes` |
| Mine | `_mineResetTimes`, `_mineBuyResetTimesCount` |
| Guild Boss | `_guildBossTimes` |
| Guild Treasure | `_treasureTimes` |
| Dungeon times | `_dungeonTimes` (all types) |
| Market refresh | `_marketDiamondRefreshCount` |
| VIP Market refresh | `_vipMarketDiamondRefreshCount` |
| Gold purchase | `_goldBuyCount` |
| Top Battle | `_topBattleTimes`, `_topBattleBuyCount` |
| Space Trial | `_spaceTrialBuyCount` |
| Gravity Trial | `_gravityTrialBuyTimesCount` |
| Training | `_trainingBuyCount` |
| Boss Fight | `_bossCptTimes`, `_bossCptBuyCount` |
| Dragon Ball War | `_ballWarBuyCount` |
| Merge Server Boss | `_mergeBossBuyCount` |
| Month Card rewards | `_monthCardHaveGotReward` |
| Guild sign-in | `_guildCheckInType` |
| Dragon Exchange pools | `_dragonExchangeSSPoolId`, `_dragonExchangeSSSPoolId` |

---

## 27. Red Dot Notification System

### 27.1 Architecture

Tree-based system managed by `RedDotManager` (singleton). Each node is a `RedDotNode` with `_show` (boolean), `_isThrough` (boolean), `_children` (object), `_parent`.

### 27.2 Red Dot Categories

| Category | ID | Children |
|----------|------|----------|
| GOLD_BUY | 101 | |
| FIRST_RECHARGE | 102 | |
| MAIL | 103 | |
| FRIEND | 104 | FRIEND_APPLY (10401), FRIEND_HEART (10402) |
| GUILD | 105 | MAIN (10501), SATAN (10502), BOSS (10503), TREASURE (10504), FIGHT (10505), TEACH (10506), SHOP (10507), MAIN_APPLY (1050101) |
| TASK | 106 | DAILY (10601), ACHIEVEMENT (10602) |
| BACKPACK | 107 | MATERIAL (10701), SIGN (10702), WEAPON (10703), EQUIP (10704) |
| HERO | 108 | LIST (10801→SKILL, EQUIP, SIGN), PIECE (10802) |
| PLAY | 109 | DUNGEON (10901), PRACTICE (10902), SPORTS (10903), BOSS (10904) |
| FUNCTION | 110 | ENTRUST, MARKET, BLACKSMITH, SHOP |
| SUMMON | 111 | SUMMON, DRAGON, SUPERSKILL, HEROLINK, WISHLIST |
| GIFT | 112 | CHECK, LEVEL, VIPQQ, BATTLEMEDAL, CHANNEL |
| RANK | 113 | POWER, LEVEL, LESSON, ARENA, TEMPLE, CELL_GAME, GUILD |
| ACTIVITY | 114 | NU (new user), SO (server open), WEEK, RANK |
| MONTHCARD | 115 | SHORT (11501), FOREVER (11502), EVO (11503) |
| CHAPTER | 116 | DIFFICULTY 1-4 (11601-11604) |
| VIP | 117 | |

### 27.3 Propagation

When a child's `_show` changes to `true` and `_isThrough` is `true`, the parent automatically sets `_show = true`. Cascades up the tree.

---

## 28. Tutorial / Guide System

### 28.1 Data Structure

```json
{
  "_id": number,
  "_steps": { "tutorialLine": "currentGuideStepId" }
}
```

### 28.2 Guide Types (51 types)

| Type | Value | Description |
|------|-------|-------------|
| MAIN | 2 | Main story flow |
| TASK | 3 | Task system |
| ARENA | 4 | Arena |
| SOURCE_DUNGEON | 5 | Resource dungeon |
| TEMPLE_TEST | 6 | Temple test |
| EQUIP_DUNGEON | 7 | Equipment dungeon |
| GUILD | 8 | Guild |
| SNAKE | 9 | Snake dungeon |
| STRONG_ENEMY | 10 | Boss attack |
| KARIN | 11 | Karin Tower |
| DRAGON | 12 | Dragon system |
| ENTRUST | 13 | Entrust |
| MAHA | 14 | Maha Adventure |
| SIGN | 15 | Sign/Stamp |
| CELL_GAME | 16 | Cell game |
| QIGONG | 18 | Qigong |
| WEAPON | 19 | Weapon |
| EARRING | 20 | Earring |
| HEROWAKEUP | 21 | Hero awakening |
| Expedition | 31 | Expedition |
| Inherit | 33 | Inherit |
| TeamTraining | 34 | Team training |
| TeamDungeon | 38 | Team dungeon |
| TopBattle | 42 | Top battle |
| SummonList | 47 | Summon list |
| GuildTech | 49 | Guild tech |

### 28.3 Server Communication

**Save:** `{ type: 'guide', action: 'saveGuide', guideType: number, step: number }`

---

## 29. Error Codes (Full Reference)

### 29.1 Global Errors (0-65)

| Code | Type | Kick? | Description |
|------|------|-------|-------------|
| 0 | SUCCESS | No | Success |
| 1 | ERROR_UNKNOWN | No | Unknown error |
| 2 | ERROR_STATE_ERROR | No | State error |
| 3 | ERROR_DATA_ERROR | No | Data error |
| 4 | ERROR_INVALID | No | Invalid request |
| 5 | ERROR_INVALID_COMMAND | No | Invalid command |
| 6 | ERROR_LACK_HERO_POS | No | Missing hero position |
| 7 | ERROR_LACK_ITEM | No | Missing item |
| 8 | ERROR_LACK_PARAM | No | Missing parameter |
| 9 | ERROR_VIP_LIMIT | No | VIP level too low |
| 10 | ERROR_LEVEL_MAX | No | Level at max |
| 11 | ERROR_USER_LEVEL_NOT_ENOUGH | No | User level too low |
| 12 | ERROR_USER_LOGIN_BEFORE | No | Already logged in |
| 13 | ERROR_USER_NOT_LOGIN_BEFORE | No | Not logged in |
| 14 | ERROR_USER_NOT_LOGOUT | No | Not logged out |
| 15 | BATTLE_ID_ERR | No | Invalid battle ID |
| 16 | TIMES_NOT_ENOUGH | No | Not enough attempts |
| 17 | GM_IP_ERR | **Yes** | GM IP error |
| 20 | CONFIG_ERROR | **Yes** | Config error |
| 21 | THINGS_TYPE_ERR | **Yes** | Invalid item type |
| 22 | BATTLE_CHECK_ERR | No | Battle verification failed |
| 29 | IP_NOT_IN_WHITE_LIST | **Yes** | IP whitelist |
| 37 | ERROR_NO_LOGIN_CLIENT | No | No login client |
| 38 | ERROR_LOGIN_CHECK_FAILED | No | Login check failed |
| 42 | PAY_SERVER_NOT_CONNECT | No | Payment server down |
| 45 | FORBIDDEN_LOGIN | No | Account banned |
| 50 | SYS_LOCKED | No | System locked |
| 51 | GAME_SERVER_OFFLINE | No | Server offline |
| 62 | CLIENT_VERSION_ERR | No | Wrong client version |
| 65 | MAINTAIN | No | Server maintenance |

### 29.2 Hero Errors (10001-10061)

| Code | Type |
|------|------|
| 10001 | ERROR_UP_LACK_EXP |
| 10002 | ERROR_UP_LACK_GOLD |
| 10003 | ERROR_UP_LACK_EVOLVE |
| 10004 | ERROR_UP_STATE_ERROR |
| 10010 | ERROR_EVOLVE_STATE_ERROR |
| 10030 | ERROR_WAKEUP_STATE_ERROR |
| 10031 | ERROR_WAKEUP_MATERIAL_NOT_ENOUGH |
| 10032 | ERROR_NO_QIGONG_TO_SAVE |
| 10033 | HERO_SKILL_ALREADY_ACTIVED |
| 10040 | ERROR_SUPER_STATE_ERROR |
| 10041 | ERROR_SUPER_LACK_GOLD_WATER |
| 10042 | ERROR_SUPER_LACK_HOLY_WATER |
| 10050 | ERROR_SUMMON_LACK_ITEM |
| 10051 | ERROR_SUMMON_FREE_TIME_NOT_USED |
| 10052 | ERROR_SUMMON_REPEAT_GUIDE |
| 10060 | ERROR_BACKPACK_LACK_ITEM |
| 10061 | ERROR_BACKPACK_PLUS_EXCEED |

### 29.3 Dungeon Errors (22001-22010)

| Code | Type |
|------|------|
| 22001 | ERROR_DUNGEON_COUNT_NOT_ENOUGH |
| 22002 | ERROR_DUNGEON_USER_LEVEL_LIMIT |
| 22003 | ERROR_DUNGEON_PRE_LEVEL_LOCK |
| 22004 | ERROR_DUNGEON_DID_ERR |
| 22005 | ERROR_DUNGEON_TYPE_ERR |
| 22006 | ERROR_DUNGEON_BATTLE_ID_ERR |
| 22009 | ERROR_DUNGEON_SWEEP_LEVEL_NOT_PASSED |

### 29.4 Guild Errors (25001-25036)

| Code | Type | Kick? |
|------|------|-------|
| 25001 | ERROR_GUILD_NAME_ERR | No |
| 25003 | ERROR_GUILD_HAVE_JOIN | No |
| 25004 | ERROR_HAVE_NO_GUILD | No |
| 25007 | ERROR_GUILD_NO_PERMISSION | No |
| 25010 | ERROR_GUILD_CAPTAIN_CANNOT_QUIT | No |
| 25012 | ERROR_GUILD_MEMBER_MAX | No |
| 25028 | ERROR_GUILD_NOT_EXIST | **Yes** |

### 29.5 Error Response Format

```json
{
  "id": 22,
  "hintType": "window",
  "isKick": 0,
  "isNotShow": 0,
  "errorType": "BATTLE_CHECK_ERR",
  "errorDescription": "errorDefine_errorDescription_22"
}
```

---

## 30. Game Constants & Config (Full)

### 30.1 Player Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `startUserLevel` | 1 | Starting level |
| `maxUserLevel` | 300 | Max level |
| `startDiamond` | 0 | Starting diamonds |
| `startGold` | 0 | Starting gold |
| `startHero` | "1205" | Starting hero (Kid Goku) |
| `startHeroLevel` | "3" | Starting hero level |
| `startChapter` | 801 | Starting chapter |
| `startLesson` | 10101 | Starting lesson/stage |
| `changeNameNeeded` | 200 | Cost to change name (diamonds) |
| `playerNameLength` | 12 | Max name length |
| `resetTime` | "6:00:00" | Daily reset time |
| `newPlayerLevel` | 50 | New player milestone 1 |
| `newPlayerLevel2-6` | 25/20/25/50/30 | New player milestones 2-6 |
| `vipExpPara` | 10 | VIP exp multiplier per dollar |

### 30.2 Hero Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `heroZeroStarMaxLevel` | 100 | Max level at 0 stars |
| `heroMaxLevel` | 200 | Absolute max level |
| `selfBreakLevelNeeded` | 150 | Level needed for self-break |
| `selfBreakStarNeeded` | 3 | Stars needed for self-break |
| `selfBreakPlayerLevel` | 200 | Player level needed |
| `selfBreakHeroLevel` | 6 | Hero level above base |
| `heroSelfBreakLevel` | 10 | Break level cap |
| `selfBreakPointLevel` | 21 | Break point level |
| `selfBreakBeRebornConsume` | 50 | Reborn consume for self-break |
| `inheritStarNeeded` | 3 | Stars needed for inherit |
| `qigongAutoLevelNeeded` | 120 | Auto level up qigong level |

### 30.3 Rebirth Costs by Quality

| Quality | Cost |
|---------|------|
| white | 0 |
| green | 0 |
| blue | 0 |
| purple | 5 |
| orange | 20 |
| flickerOrange | 50 |
| superOrange | 100 |

### 30.4 Social Constants

| Constant | Value |
|----------|-------|
| `friendMax` | 30 |
| `friendPointGiveDailyMax` | 30 |
| `friendPointGetDailyMax` | 30 |
| `friendApplyMax` | 20 |
| `mailMax` | 999 |
| `mailExistTime` | 30 (days) |
| `mailWordsMax` | 200 |
| `friendMailOpen` | 50 (level) |
| `friendMailOpenVIP` | 2 |

### 30.5 Guild Constants

| Constant | Value |
|----------|-------|
| `guildCreatePrice` | 50 (diamonds) |
| `guildCreateVIP` | 2 |
| `guildChangeNameNeeded` | 800 |
| `guildApplyMax` | 20 |
| `guildNameLength` | 12 |
| `guildViceLeader` | 2 |
| `guildQuitTime` | 7200 (2h cooldown) |
| `guildBOSSTimes` | 2 |
| `guildBOSSTimesCanBuy` | 6 |
| `guildRecordNum` | 100 |
| `guildInviteCD` | 300 (seconds) |
| `guildLeaderImpeachTime` | 50 (days) |
| `guildLeaderImpeachCostID` | 102 |
| `guildLeaderImpeachCostNum` | 50000 |
| `guildLeaderImpeachVIPNeeded` | 2 |
| `guildScienceResetNeeded` | 200 |
| `guildScienceFatherLevelNeeded` | 3 |
| `teamDungeonMember` | 7 |
| `teamDungeonDuration` | 900 (15 min) |

### 30.6 Dungeon Attempt Limits

| Dungeon | Daily Free | Buy Increment | Max Buy |
|---------|-----------|--------------|---------|
| expDungeon | 2 | 1 | 10 |
| evolveDungeon | 2 | 1 | 10 |
| energyDungeon | 2 | 1 | 10 |
| metalDungeon | 2 | 1 | — |
| zStoneDungeon | 2 | 1 | — |
| equipDungeon | 2 | 1 | 8 |
| signDungeon | 2 | 1 | 8 |
| arena | 5 attacks | 3 | 6 |
| templeTest | 10 | 5 | 6 |
| karinTower | 5 | 1 | 6 |
| bossAttack | 6 | 1 | 6 |
| cellGame | 1 | 1 | 6 |
| mahaAdventure | 5 | 5 | 6 |
| snakeDungeon | 1 | — | — |
| training | 10 | 5 | — |
| gravity | — | — | — |
| topBattle | — | — | — |
| dragonBallWar | 3 | 1 | — |

### 30.7 Idle / Hangup System

| Constant | Value | Description |
|----------|-------|-------------|
| `idle` | 28800 | 8 hours max idle time |
| `idleAwardEveryTime` | 300 | 5 minutes per reward tick |
| `noAction` | 1 | Enable idle system |
| Chapter lessons | 809/831/853/874 | Normal/Difficult/Hell/Inferno max |
| `lessonChapterMax` | 4 | 4 difficulty tiers |

### 30.8 Z-Power Formula

```
zPower = A + B * level + C * star + D * qualityBonus
A = 100, B = 5, C = 10, D = 35
```

### 30.9 Shop Constants

| Shop | Refresh Price | Refresh Time (min) | Max Refresh |
|------|--------------|-------------------|-------------|
| Soul Shop | 1000 | 720 | — |
| Soul Shop Plus | 2000 | 720 | — |
| Snake Shop | 4000 | 720 | — |
| Arena Shop | 5000 | 720 | — |
| Guild Shop | 4000 | 720 | — |
| Team Dungeon Shop | 10000 | 720 | — |
| Market | — | 120 | 5 |
| VIP Market (VIP 8+) | — | 43200 | 5 |

### 30.10 Karin Tower Constants

| Constant | Value |
|----------|-------|
| Open time | 12:00:00 |
| Close time | 20:00:00 |
| Battle times | 10 (5 free + 6 buy) |
| Times refresh | 7200s |
| Max climbers | 5 players + 3 robots |
| Auto climb CD | 1800s |
| Player num | 5 |
| Robot num | 3 |
| Give up round | 7 |
| Win climb gain | 0.2 |
| Feet (chest) climb | 20 |
| Enemy exist time | 1800s |

### 30.11 Global War Constants

| Constant | Value |
|----------|-------|
| Sign up level needed | 18 |
| Auto sign up | 20 (servers) |
| Audition battle | 100 |
| Audition broadcast | 300s |
| Bet idle time | 54000s |
| Effect head icon time | 604800s (7 days) |

### 30.12 Dragon Ball War Constants

| Constant | Value |
|----------|-------|
| Sign up cost | 5000 diamonds |
| Max times | 3 |
| Times refresh | 14400s |
| Battle score | 50 |
| Win player score | 10 |
| Center score | 500 |
| Flag score | 100 |
| Protect time | 60s |
| Guild level start | 1000 |

### 30.13 Team Dungeon Constants

| Constant | Value |
|----------|-------|
| Member max | 7 |
| Apply max | 10 |
| Duration | 900s (15 min) |
| Record kept | 3 days |
| Apply interval | 60s |
| Hero level needed | 300 |
| Create CD | 1800s (30 min) |
| Open level | 120 |
| Daily opening hours | 12 |
| Exit CD | 5s |
| Join CD | 30s |

### 30.14 Resource Recovery (Retrieve System)

| Constant | Value |
|----------|-------|
| Idle recover max | 72 hours |
| Dungeon recover max | 3 days |
| Idle price | 0.00055 diamonds/sec |
| Resource dungeon price | 5 diamonds |
| Equip dungeon price | 5 diamonds |
| Sign dungeon price | 5 diamonds |
| Level needed | 50 |

### 30.15 Expedition Constants

| Constant | Value |
|----------|-------|
| Battle times | 10 |
| Times refresh | 14400s (4h) |
| Max events | 12 |
| Event speed-up min | 3600s |
| Favorites unlock level | 190 |
| Favorites slots | 12 |
| Team lineups | 12 |

### 30.16 Other Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `goldBuyTimesMax` | 10 | Gold purchase max |
| `goldBuyFree` | 20 | Free gold buy count |
| `equipMergeNum` | 3 | Equip merge pieces needed |
| `redequipMergeNum` | 2 | Red equip merge needed |
| `ringUnlockLevel` | 40 | Ring unlock level |
| `ringInitial` | 4501 | Initial ring ID |
| `weaponUnlockLevel` | 40 | Weapon unlock level |
| `weaponLevelUpMax` | 5 | Weapon level up max |
| `battleMedalLevelBuy` | 90 | Battle medal buy cost |
| `battleMedalDays` | 30 | Battle medal duration |
| `wishListOpenClass` | 10 | Wish list open class |
| `wishListMaxNum` | 15 | Wish list max heroes |

---

## 31. Item Type System

### 31.1 ThingsType Categories (28 types)

| ID | thingsType | In Bag? | Description |
|----|-----------|---------|-------------|
| 1 | basis | Yes | Basic currency (gold, diamond) |
| 2 | exp | No | Experience |
| 3 | level | No | Player level |
| 4 | special | No | Special items |
| 5 | other | No | Other |
| 6 | dragonBall | Yes | Dragon Balls |
| 7 | randomBox | Yes | Random loot box |
| 8 | combinationBox | Yes | Combination box |
| 9 | activityItem | Yes | Activity items |
| 10 | signPiece | No | Sign pieces |
| 11 | chooseBox | Yes | Choose reward box |
| 12 | buff | No | Buff |
| 13 | usable | Yes | Usable items |
| 14 | skinPiece | Yes | Skin fragments |
| 15 | hero | No | Hero (direct) |
| 16 | heroPiece | No | Hero fragments |
| 17 | randomHeroPiece | No | Random hero piece |
| 18 | equip | No | Equipment |
| 19 | weapon | No | Weapon |
| 20 | weaponPiece | No | Weapon pieces |
| 21 | jewel | No | Gemstone |
| 22 | ring | No | Ring |
| 23 | sign | No | Sign/imprint |
| 24 | heroRedSoul | Yes | Hero red soul |
| 25 | playerHeadIcon | No | Head icon |
| 26 | monster | No | Monster |
| 27 | teamDungeonKey | Yes | Team dungeon key |
| 28 | signAddItem | Yes | Sign add item |

---

## 32. Notification / Push System

### 32.1 Notify Handler (Client-side)

```javascript
socket.on('Notify', function(notifyData) {
    if ('SUCCESS' == notifyData.ret) {
        var data = notifyData.data;
        if (notifyData.compress) {
            data = LZString.decompressFromUTF16(data);
        }
        var parsed = JSON.parse(data);
        
        if ('Kickout' == parsed.action) {
            mainClient.destroy();
            chatClient.destroy();
            runScene('Login');
            return;
        }
        
        ts.notifyData(parsed);
        currentNode.notify && currentNode.notify(parsed);
        currentActivityNode && currentActivityNode.notify(parsed);
    }
});
```

### 32.2 Notify Format

```json
{
  "ret": "SUCCESS",
  "compress": true,
  "data": "<LZString.compressToUTF16(JSON.stringify(payload))>"
}
```

---

## 33. Social Media Integration

### 33.1 Facebook Like

**Type:** `'activity'`, **Action:** `'fblike'`
```json
{ "type": "activity", "action": "fblike", "userId": "string", "actId": number }
```
Opens like URL after claiming reward. Channel-specific via `window.fbGiveLiveSdk()` for `tanwan55en`.

### 33.2 iOS Comment

**Type:** `'activity'`, **Action:** `'iosComment'`
Same structure as fblike but for iOS App Store reviews.

### 33.3 YouTube Recruiter

**Type:** `'YouTuber'`
- `joinYouTuberPlan`: `{ userId, inviteCode }` — Join with invite code
- `getYouTuberRecruitReward`: `{ userId }` — Claim recruitment reward

### 33.4 Download Reward

**Type:** `'downloadReward'`
- `clickDownload`: Opens download URL, marks clicked
- `getDownloadReward`: Claims reward if clicked

### 33.5 Questionnaire

**Type:** `'questionnaire'`, **Action:** `'submitQuestionnaire'`
```json
{ "userId", "questId", "answers": {...}, "ip": "", "answerTime": milliseconds }
```

### 33.6 Analytics (BuryPoint)

**Type:** `'buryPoint'`, **Action:** `'guideBattle'`
```json
{ "userId", "point": number, "passLesson": number }
```

### 33.7 Battle Record Check (Anti-Cheat)

**Type:** `'battleRecordCheck'`, **Action:** `'checkBattleRecord'`
```json
{ "userId", "battleId", "battleResult": 0|1, "notSetReward": true }
```
Only used for `'TanWanH5'` channel.

---

## 34. Energy System

There is NO global stamina/energy resource. All activity systems use their own attempt counters (tracked in `AllRefreshCount`, reset daily).

**Per-hero battle energy** (in-combat mechanic):
- Normal attack hit: +50 energy
- Being hit: +10 energy
- Critical hit received: +20 energy
- Super skill per turn: +25
- Super skill use: -15
- Ally death: +25
- Max energy: 100, Starting: 50

---

## 35. Resource Loading System

### 35.1 Loading Flow

```
1. index.html loads JSZip + JSZipUtils
2. Client version check: /resource/properties/clientversion.json
3. Load main.min.js.zp (ZIP archive) → extract main.min.js → eval()
4. Load resource/json.zp (ZIP archive) → extract all JSON files → window[name] = JSON
5. Egret engine initializes with resource manifests (default.res.json)
```

### 35.2 Asset Loading

- `gameEui.json` — UI component definitions (EUI framework)
- `default.res.json` / `default.res-en.json` — Resource manifests
- `resource/assets/image/` — Login screens, UI images (3 language variants: zh_cn, public, en)
- `resource/language/` — 9 localization files
- `resource/json/` — 471 game config files

---

## 36. Shared Server Code

All 4 servers need:

| Module | Purpose | Used By |
|--------|---------|---------|
| `tea.js` | TEA encrypt/decrypt (key="verification") | main, chat, dungeon |
| `compress.js` | LZString compressToUTF16 | all 4 |
| `response.js` | Build {ret, data, compress, serverTime} | all 4 |
| `database.js` | Database connection pool | all 4 |
| `config.js` | Port, DB credentials, secret key | all 4 |
| `gameData.js` | Load JSON config from `../resource/json/` | main, dungeon |
| `dailyReset.js` | Daily reset scheduler (6:00 AM) | main |
| `redDot.js` | Red dot tree builder | main |
| `notification.js` | Notify push dispatcher | main, chat, dungeon |

---

## 37. Recommended Server Folder Structure

```
server/
├── index.js                    # Entry point — start all 4 servers
├── package.json                # Dependencies
├── config.js                   # Port, DB, secrets
├── database.js                 # Database pool
├── tea.js                      # TEA encrypt/decrypt
├── compress.js                 # LZString wrapper
├── response.js                 # Response builder
├── gameData.js                 # JSON config loader
├── dailyReset.js               # Daily reset scheduler
├── redDot.js                   # Red dot builder
├── notification.js             # Notify dispatcher
├── schema.sql                  # Full DB schema
│
├── login-server/
│   ├── index.js                # Socket.IO, NO TEA
│   └── handlers.js            # 5 handlers
│
├── main-server/
│   ├── index.js                # Socket.IO + TEA + router
│   ├── notify.js              # 35+ Notify push dispatcher
│   ├── user/                   # 13 actions
│   ├── hero/                   # 21 actions
│   ├── equip/                  # 10 actions (incl. ring)
│   ├── weapon/                 # 9 actions
│   ├── imprint/               # 12 actions
│   ├── genki/                 # 4 actions
│   ├── gemstone/              # 4 actions
│   ├── resonance/             # 6 actions
│   ├── superSkill/            # 5 actions
│   ├── backpack/              # 5 actions
│   ├── mail/                  # 6 actions
│   ├── battleMedal/           # 7 actions
│   ├── teamTraining/          # 4 actions
│   ├── dragon/                # 3 actions
│   ├── battle/                # 1 action
│   ├── dungeon/                # 4 solo dungeon actions
│   ├── hangup/                 # 8 idle actions
│   ├── shop/                   # 4 actions
│   ├── arena/                  # 10 actions
│   ├── summon/                 # 6 actions
│   ├── guild/                  # 34 actions
│   ├── friend/                 # 16 actions
│   ├── war/                    # 12 actions
│   ├── topBattle/              # 19 actions
│   ├── ballWar/                # 14 actions
│   ├── activity/               # 105 actions
│   ├── teamDungeonGame/        # 18 actions
│   ├── tower/                  # 12 actions
│   ├── snake/                  # 9 actions
│   ├── expedition/             # 12 actions
│   ├── trial/                  # 7 actions
│   ├── gravity/                # 4 actions
│   ├── maha/                   # 6 actions
│   ├── mine/                   # 8 actions
│   ├── cellGame/               # 8 actions
│   ├── bossCompetition/        # 7 actions
│   ├── training/               # 6 actions
│   ├── entrust/                # 12 actions
│   ├── gift/                   # 12 actions
│   ├── timeBonus/              # 2 actions
│   ├── littleGame/             # 3 actions
│   ├── heroImage/              # 7 actions
│   ├── userMsg/                # 6 actions
│   ├── market/                 # 1 action
│   ├── vipMarket/              # 1 action
│   ├── rank/                   # 2 actions
│   ├── task/                   # 2 actions
│   ├── strongEnemy/            # 5 actions
│   ├── timeMachine/            # 4 actions
│   ├── timeTrial/              # 6 actions
│   ├── checkin/                # 1 action
│   ├── monthCard/              # 2 actions
│   ├── guide/                  # 1 action
│   ├── recharge/               # 1 action
│   ├── retrieve/               # 2 actions
│   ├── questionnaire/          # 1 action
│   ├── battleRecordCheck/      # 1 action
│   ├── buryPoint/              # 1 action
│   ├── downloadReward/         # 2 actions
│   └── YouTuber/              # 2 actions
│
├── chat-server/
│   ├── index.js                # Socket.IO + TEA + rooms
│   ├── handlers.js            # 5 handlers
│   └── rooms.js                # Room management
│
└── dungeon-server/
    ├── index.js                # Socket.IO + TEA + HTTP
    └── handlers.js            # 13 handlers
```

---

## 38. Database Schema Design

### 38.1 Core Tables

```sql
-- Player accounts
CREATE TABLE users (
    user_id VARCHAR(64) PRIMARY KEY,
    channel_code VARCHAR(32),
    nick_name VARCHAR(32),
    security_code VARCHAR(128),
    password VARCHAR(128),
    vip_level INT DEFAULT 0,
    vip_exp INT DEFAULT 0,
    level INT DEFAULT 1,
    exp BIGINT DEFAULT 0,
    diamond BIGINT DEFAULT 0,
    gold BIGINT DEFAULT 0,
    power INT DEFAULT 0,
    head_image VARCHAR(64),
    head_box INT DEFAULT 0,
    create_time BIGINT,
    last_login_time BIGINT,
    last_login_server INT,
    is_banned TINYINT DEFAULT 0,
    login_token VARCHAR(128),
    register_server_id INT
);

-- Hero inventory
CREATE TABLE user_heros (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    hero_display_id INT,
    hero_star INT DEFAULT 0,
    fragment INT DEFAULT 0,
    super_skill_reset_count INT DEFAULT 0,
    potential_reset_count INT DEFAULT 0,
    hero_level INT DEFAULT 1,
    hero_exp BIGINT DEFAULT 0,
    hero_base_attr JSON,
    super_skill_level JSON,
    potential_level JSON,
    qigong JSON,
    qigong_tmp JSON,
    qigong_stage INT DEFAULT 1,
    qigong_tmp_power INT DEFAULT 0,
    total_cost JSON,
    break_info JSON,
    gemstone_suit_id INT DEFAULT 0,
    link_to JSON,
    link_from VARCHAR(64),
    expedition_max_level INT DEFAULT 0,
    skin_id INT DEFAULT 0,
    weapon_halo_id INT DEFAULT 0,
    weapon_halo_level INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Item inventory (totalProps)
CREATE TABLE user_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64),
    item_id INT,
    item_type INT,
    count INT DEFAULT 0,
    UNIQUE KEY (user_id, item_id)
);

-- Equipment
CREATE TABLE user_equips (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    equip_id INT,
    hero_id VARCHAR(64),
    level INT DEFAULT 0,
    lucky_level INT DEFAULT 0,
    suit_id INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Weapons
CREATE TABLE user_weapons (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    weapon_id INT,
    hero_id VARCHAR(64),
    level INT DEFAULT 0,
    star INT DEFAULT 0,
    halo_id INT DEFAULT 0,
    halo_level INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Signs/Imprints
CREATE TABLE user_imprints (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    imprint_id INT,
    hero_id VARCHAR(64),
    star INT DEFAULT 0,
    level INT DEFAULT 0,
    attrs JSON,
    vice_attrs JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Genki
CREATE TABLE user_genkis (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    genki_id INT,
    hero_id VARCHAR(64),
    exp INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gemstones
CREATE TABLE user_gemstones (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    stone_id INT,
    display_id INT,
    hero_id VARCHAR(64),
    exp INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rings
CREATE TABLE user_rings (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    ring_id INT,
    hero_id VARCHAR(64),
    level INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dungeon progress
CREATE TABLE user_dungeon (
    user_id VARCHAR(64),
    dungeon_type INT,
    dungeon_level INT,
    star_count INT DEFAULT 0,
    times_used INT DEFAULT 0,
    times_bought INT DEFAULT 0,
    sweep_available TINYINT DEFAULT 0,
    PRIMARY KEY (user_id, dungeon_type)
);

-- Guild
CREATE TABLE guilds (
    guild_id INT AUTO_INCREMENT PRIMARY KEY,
    guild_name VARCHAR(32),
    guild_icon VARCHAR(64),
    level INT DEFAULT 1,
    exp INT DEFAULT 0,
    captain_id VARCHAR(64),
    bulletin TEXT,
    description TEXT,
    request_condition INT DEFAULT 0,
    max_members INT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE guild_members (
    guild_id INT,
    user_id VARCHAR(64),
    role ENUM('captain', 'vice_captain', 'member') DEFAULT 'member',
    contribute INT DEFAULT 0,
    join_time BIGINT,
    PRIMARY KEY (guild_id, user_id)
);

-- Friend
CREATE TABLE friends (
    user_id VARCHAR(64),
    friend_id VARCHAR(64),
    status ENUM('pending', 'accepted') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, friend_id)
);

-- Arena
CREATE TABLE arena_rank (
    user_id VARCHAR(64) PRIMARY KEY,
    rank INT DEFAULT 0,
    attack_times INT DEFAULT 0,
    attack_times_bought INT DEFAULT 0,
    defence_team JSON,
    last_rank INT DEFAULT 0
);

-- Chat logs
CREATE TABLE chat_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(64),
    user_id VARCHAR(64),
    content TEXT,
    kind INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room_time (room_id, created_at)
);

-- Server list
CREATE TABLE servers (
    server_id INT PRIMARY KEY,
    server_name VARCHAR(64),
    url VARCHAR(256),
    chat_url VARCHAR(256),
    dungeon_url VARCHAR(256),
    world_room_id VARCHAR(64),
    guild_room_id VARCHAR(64),
    team_dungeon_chat_room VARCHAR(64),
    status TINYINT DEFAULT 1,
    open_time TIMESTAMP
);

-- Activity progress
CREATE TABLE user_activity (
    user_id VARCHAR(64),
    activity_id INT,
    progress INT DEFAULT 0,
    rewards_claimed JSON,
    PRIMARY KEY (user_id, activity_id)
);

-- Team dungeon
CREATE TABLE team_dungeon_teams (
    team_id VARCHAR(64) PRIMARY KEY,
    display_id INT,
    dungeon_id INT,
    creator_id VARCHAR(64),
    members JSON,
    status ENUM('waiting', 'in_progress', 'finished') DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Check-in / Welfare
CREATE TABLE user_welfare (
    user_id VARCHAR(64) PRIMARY KEY,
    checkin_days INT DEFAULT 0,
    checkin_last_time BIGINT DEFAULT 0,
    month_cards JSON,
    online_gift_claimed TINYINT DEFAULT 0
);

-- Hangup / Idle
CREATE TABLE user_hangup (
    user_id VARCHAR(64) PRIMARY KEY,
    chapter INT DEFAULT 801,
    lesson INT DEFAULT 10101,
    state INT DEFAULT 0,
    start_time BIGINT DEFAULT 0,
    guide_team JSON
);

-- Guild tech
CREATE TABLE guild_tech (
    guild_id INT,
    tech_id INT,
    level INT DEFAULT 0,
    PRIMARY KEY (guild_id, tech_id)
);

-- Login history
CREATE TABLE login_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64),
    server_id INT,
    channel_code VARCHAR(32),
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Battle medal
CREATE TABLE user_battle_medal (
    user_id VARCHAR(64) PRIMARY KEY,
    level INT DEFAULT 0,
    exp INT DEFAULT 0,
    task_progress JSON,
    start_time BIGINT
);

-- Top battle
CREATE TABLE top_battle_rank (
    user_id VARCHAR(64) PRIMARY KEY,
    rank INT DEFAULT 0,
    score INT DEFAULT 0,
    season INT DEFAULT 0,
    team JSON
);

-- Global war
CREATE TABLE global_war_signup (
    user_id VARCHAR(64) PRIMARY KEY,
    season INT DEFAULT 0,
    audition_rank INT DEFAULT 0,
    guild_id INT DEFAULT 0
);
```

---

## 39. Development Roadmap

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Set up Node.js project with Socket.IO, Express, database driver, lz-string
- [ ] Implement shared modules: tea.js, compress.js, response.js, database.js, config.js, gameData.js
- [ ] Implement TEA verify handshake
- [ ] Create database schema and seed data
- [ ] Test with gameData loader (load all 471 JSON configs)
- [ ] Implement daily reset scheduler

### Phase 2: Login Server (Week 2-3)
- [ ] `loginGame` handler (create/check user in DB)
- [ ] `GetServerList` handler (return server list from DB)
- [ ] `SaveHistory` handler (generate loginToken)
- [ ] `SaveUserEnterInfo` handler
- [ ] `SaveLanguage` handler
- [ ] Update `serversetting.json` to point to local login server
- [ ] Test full login flow from client

### Phase 3: Main Server — Basic Playable (Week 3-5)
- [ ] TEA verify handshake
- [ ] `enterGame` handler (return full game state for new/existing users — 57+ fields)
- [ ] `exitGame` handler (save and disconnect)
- [ ] `registChat` handler (return chat URL + room IDs)
- [ ] User module: changeNickName, changeHeadImage, saveFastTeam, queryPlayerHeadIcon
- [ ] Hero module: getAttrs, getAll, autoLevelUp, evolve, resolve, reborn, wakeUp
- [ ] Summon module: summonOneFree, summonOne, summonTen, summonEnergy, setWishList
- [ ] Dungeon module: startBattle, checkBattleResult, sweep, buyCount
- [ ] Idle/hangup module: startGeneral, checkBattleResult, gain, nextChapter
- [ ] Backpack: openBox, useItem, sell
- [ ] Shop: getInfo, buy, readNew, refresh
- [ ] Task: queryTask, getReward
- [ ] Gift: getRewardInfo, getLevelReward, getOnlineGift

### Phase 4: Equipment & Enhancement Systems (Week 5-7)
- [ ] Equip: wear, takeOff, wearAuto, takeOffAuto, activeWeapon, activeRing, merge
- [ ] Weapon: wear, takeOff, merge, strengthen, upgrade, levelUpHalo
- [ ] Imprint: wear, takeOff, merge, addAttr, starUp, levelUp
- [ ] Genki: wear, takeOff, smelt
- [ ] Gemstone: appraisal, wear, levelUp, takeOff
- [ ] Resonance: putChild, setMainHero, removeChild, buySeat
- [ ] Super Skill: evolve, levelUp, active, reset
- [ ] Check-in & Month Card

### Phase 5: Social Systems (Week 7-9)
- [ ] Friend: applyFriend, getFriends, handleApply, delFriend, giveHeart
- [ ] Guild: createGuild, requestGuild, getGuildDetail, guildBoss, upgradeTech
- [ ] Arena: join, startBattle, getRank, setTeam
- [ ] Mail: getMailList, readMail, getReward, getAllReward
- [ ] Chat server: login, sendMsg, joinRoom, leaveRoom, getRecord
- [ ] UserMsg: getMsg, sendMsg

### Phase 6: Advanced Game Systems (Week 9-14)
- [ ] Activity system (105 actions — implement common ones first)
- [ ] Team dungeon (main relay + dungeon server)
- [ ] Karin Tower, Snake Dungeon, Expedition
- [ ] Global War, Top Battle, Dragon Ball War
- [ ] Maha Adventure, Cell Game, Mine, Gravity
- [ ] Boss Competition, Strong Enemy, Training
- [ ] Time Machine, Time Trial
- [ ] Battle Medal, Team Training
- [ ] Dragon Ball Wish system
- [ ] Red dot notification system
- [ ] All Notify push events

### Phase 7: Polish & Optimization (Week 14-16)
- [ ] Payment integration (prePayRet → payFinish)
- [ ] VIP system (all 18 levels, benefits)
- [ ] Tutorial/Guide system
- [ ] Daily reset system (all counters)
- [ ] Error handling with all error codes
- [ ] Battle anti-cheat validation
- [ ] Social media integration
- [ ] Questionnaire & analytics
- [ ] Resource recovery system
- [ ] Performance optimization
- [ ] Rate limiting

### Minimum Viable Server (Quick Playtest)

To get the game **playable as soon as possible**, implement these handlers in order:
1. Login Server: all 5 handlers
2. Main Server: `enterGame`, `exitGame`, `registChat`
3. User: `changeNickName`, `queryPlayerHeadIcon`
4. Hero: `getAttrs`, `getAll`, `autoLevelUp`, `evolve`
5. Summon: `summonOneFree`, `summonOne`, `summonTen`
6. Dungeon: `startBattle`, `checkBattleResult`, `sweep`
7. Hangup: `startGeneral`, `checkBattleResult`, `gain`, `nextChapter`
8. Backpack: `openBox`, `useItem`
9. Shop: basic buy
10. Task: `queryTask`, `getReward`
11. Gift: `getRewardInfo`, `getLevelReward`
12. Chat Server: all 5 handlers

This subset (~35 handlers) allows basic gameplay loop: login → summon heroes → run dungeons → idle farm → chat.