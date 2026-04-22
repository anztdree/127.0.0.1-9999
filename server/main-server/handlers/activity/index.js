/**
 * ============================================================================
 * Activity Handler — Main Server (Router)
 * ============================================================================
 * Actions: GAGetTaskReward, GAOpenBox, GARoll, SaveHistory, activityGetTaskReward, addAttr, attackNienBeast, beStrongActiveActReward, beStrongBuyDiscount, beStrongGiftActReward, beStrongRefreshDiscount, blindBoxOpen, blindBoxRefresh, blindBoxShowRewards, bsAddToHomeReward, buggyGetTaskReward, buggyTreasureNext, buggyTreasureRandom, bulmaPartyBuyGoods, buyBonus, buyCount, buyDailyDiscount, buyFund, buyHeroSuperGift, buyNewServerGift, buyStep, buySuperGift, buyTodayDiscount, clickHonghuUrl, costFeedback, cumulativeRechargeReward, dailyBigGiftReward, diamondShop, doubleElevenGetPayReward, dungeonReward, entrustActReward, equipUp, exitGame, friendBattleActReward, friendServerAction, getActivityBrief, getActivityDetail, getFundReward, getGrowActivityReward, getLanternBlessTaskReward, getLoginActivityExReward, getLoginActivityReward, getMailList, getPassRank, getRank, getTopBattleRecord, gleaning, gleaningBuyTicket, goodHarvestsGetReward, handleRefreshImprintResult, heroGiftReward, heroHelpBuy, heroOrangeReward, heroRewardBuyToken, heroRewardGetReward, imprintExtraction, imprintUpGetReward, imprintUpStudy, karinActReward, karinRich, karinRichTask, lanternBless, lanternBlessClickTip, luckEquipGetEquip, luckEquipGetReward, luckEquipPushEquip, luckEquipUp, luckFeedbackGetBox, luckFeedbackGetReward, luckyWheelGetReward, luckyWheelLottery, luxuryLuck, marketActReward, merchantExchange, mergeBossBuyTimes, mergeBossInfo, mergeBossStartBattle, newHeroChallenge, newHeroChallengeLike, newHeroChallengeQueryHonorRoll, newHeroChallengeQueryWinRank, newHeroRewardBuyGoods, newHeroRewardPropExchange, normalLuck, queryCSRank, queryImprintTmpPower, queryLanternBlessRecord, queryWeaponCastRecord, recharge3DayResign, recharge3DayReward, recharge3FinialReward, recharge7Reward, rechargeDailyReward, rechargeGiftReward, refreshImprint, resetLanternBless, shopBuy, singleRechargeReward, startBoss, submitQuestionnaire, summonGiftReward, summonTen, timeLimitPropExchange, timeLimitPropReceive, turnTable, turnTableGetReward, upsetBlindBox, userCertification, weaponCastGetReward, weaponCastLottery, whisFeastBlessExchange, whisFeastFoodFeedbackReward, whisFeastGetRankReward, whisFeastGivingFood
 */

var ResponseHelper = require('../../core/responseHelper');
var logger         = require('../../utils/logger');

// ============================================
// ACTION HANDLERS
// ============================================

var GAGetTaskReward = require('./GAGetTaskReward');
var GAOpenBox = require('./GAOpenBox');
var GARoll = require('./GARoll');
var SaveHistory = require('./SaveHistory');
var activityGetTaskReward = require('./activityGetTaskReward');
var addAttr = require('./addAttr');
var attackNienBeast = require('./attackNienBeast');
var beStrongActiveActReward = require('./beStrongActiveActReward');
var beStrongBuyDiscount = require('./beStrongBuyDiscount');
var beStrongGiftActReward = require('./beStrongGiftActReward');
var beStrongRefreshDiscount = require('./beStrongRefreshDiscount');
var blindBoxOpen = require('./blindBoxOpen');
var blindBoxRefresh = require('./blindBoxRefresh');
var blindBoxShowRewards = require('./blindBoxShowRewards');
var bsAddToHomeReward = require('./bsAddToHomeReward');
var buggyGetTaskReward = require('./buggyGetTaskReward');
var buggyTreasureNext = require('./buggyTreasureNext');
var buggyTreasureRandom = require('./buggyTreasureRandom');
var bulmaPartyBuyGoods = require('./bulmaPartyBuyGoods');
var buyBonus = require('./buyBonus');
var buyCount = require('./buyCount');
var buyDailyDiscount = require('./buyDailyDiscount');
var buyFund = require('./buyFund');
var buyHeroSuperGift = require('./buyHeroSuperGift');
var buyNewServerGift = require('./buyNewServerGift');
var buyStep = require('./buyStep');
var buySuperGift = require('./buySuperGift');
var buyTodayDiscount = require('./buyTodayDiscount');
var clickHonghuUrl = require('./clickHonghuUrl');
var costFeedback = require('./costFeedback');
var cumulativeRechargeReward = require('./cumulativeRechargeReward');
var dailyBigGiftReward = require('./dailyBigGiftReward');
var diamondShop = require('./diamondShop');
var doubleElevenGetPayReward = require('./doubleElevenGetPayReward');
var dungeonReward = require('./dungeonReward');
var entrustActReward = require('./entrustActReward');
var equipUp = require('./equipUp');
var exitGame = require('./exitGame');
var friendBattleActReward = require('./friendBattleActReward');
var friendServerAction = require('./friendServerAction');
var getActivityBrief = require('./getActivityBrief');
var getActivityDetail = require('./getActivityDetail');
var getFundReward = require('./getFundReward');
var getGrowActivityReward = require('./getGrowActivityReward');
var getLanternBlessTaskReward = require('./getLanternBlessTaskReward');
var getLoginActivityExReward = require('./getLoginActivityExReward');
var getLoginActivityReward = require('./getLoginActivityReward');
var getMailList = require('./getMailList');
var getPassRank = require('./getPassRank');
var getRank = require('./getRank');
var getTopBattleRecord = require('./getTopBattleRecord');
var gleaning = require('./gleaning');
var gleaningBuyTicket = require('./gleaningBuyTicket');
var goodHarvestsGetReward = require('./goodHarvestsGetReward');
var handleRefreshImprintResult = require('./handleRefreshImprintResult');
var heroGiftReward = require('./heroGiftReward');
var heroHelpBuy = require('./heroHelpBuy');
var heroOrangeReward = require('./heroOrangeReward');
var heroRewardBuyToken = require('./heroRewardBuyToken');
var heroRewardGetReward = require('./heroRewardGetReward');
var imprintExtraction = require('./imprintExtraction');
var imprintUpGetReward = require('./imprintUpGetReward');
var imprintUpStudy = require('./imprintUpStudy');
var karinActReward = require('./karinActReward');
var karinRich = require('./karinRich');
var karinRichTask = require('./karinRichTask');
var lanternBless = require('./lanternBless');
var lanternBlessClickTip = require('./lanternBlessClickTip');
var luckEquipGetEquip = require('./luckEquipGetEquip');
var luckEquipGetReward = require('./luckEquipGetReward');
var luckEquipPushEquip = require('./luckEquipPushEquip');
var luckEquipUp = require('./luckEquipUp');
var luckFeedbackGetBox = require('./luckFeedbackGetBox');
var luckFeedbackGetReward = require('./luckFeedbackGetReward');
var luckyWheelGetReward = require('./luckyWheelGetReward');
var luckyWheelLottery = require('./luckyWheelLottery');
var luxuryLuck = require('./luxuryLuck');
var marketActReward = require('./marketActReward');
var merchantExchange = require('./merchantExchange');
var mergeBossBuyTimes = require('./mergeBossBuyTimes');
var mergeBossInfo = require('./mergeBossInfo');
var mergeBossStartBattle = require('./mergeBossStartBattle');
var newHeroChallenge = require('./newHeroChallenge');
var newHeroChallengeLike = require('./newHeroChallengeLike');
var newHeroChallengeQueryHonorRoll = require('./newHeroChallengeQueryHonorRoll');
var newHeroChallengeQueryWinRank = require('./newHeroChallengeQueryWinRank');
var newHeroRewardBuyGoods = require('./newHeroRewardBuyGoods');
var newHeroRewardPropExchange = require('./newHeroRewardPropExchange');
var normalLuck = require('./normalLuck');
var queryCSRank = require('./queryCSRank');
var queryImprintTmpPower = require('./queryImprintTmpPower');
var queryLanternBlessRecord = require('./queryLanternBlessRecord');
var queryWeaponCastRecord = require('./queryWeaponCastRecord');
var recharge3DayResign = require('./recharge3DayResign');
var recharge3DayReward = require('./recharge3DayReward');
var recharge3FinialReward = require('./recharge3FinialReward');
var recharge7Reward = require('./recharge7Reward');
var rechargeDailyReward = require('./rechargeDailyReward');
var rechargeGiftReward = require('./rechargeGiftReward');
var refreshImprint = require('./refreshImprint');
var resetLanternBless = require('./resetLanternBless');
var shopBuy = require('./shopBuy');
var singleRechargeReward = require('./singleRechargeReward');
var startBoss = require('./startBoss');
var submitQuestionnaire = require('./submitQuestionnaire');
var summonGiftReward = require('./summonGiftReward');
var summonTen = require('./summonTen');
var timeLimitPropExchange = require('./timeLimitPropExchange');
var timeLimitPropReceive = require('./timeLimitPropReceive');
var turnTable = require('./turnTable');
var turnTableGetReward = require('./turnTableGetReward');
var upsetBlindBox = require('./upsetBlindBox');
var userCertification = require('./userCertification');
var weaponCastGetReward = require('./weaponCastGetReward');
var weaponCastLottery = require('./weaponCastLottery');
var whisFeastBlessExchange = require('./whisFeastBlessExchange');
var whisFeastFoodFeedbackReward = require('./whisFeastFoodFeedbackReward');
var whisFeastGetRankReward = require('./whisFeastGetRankReward');
var whisFeastGivingFood = require('./whisFeastGivingFood');

var actions = {
  GAGetTaskReward: GAGetTaskReward,
  GAOpenBox: GAOpenBox,
  GARoll: GARoll,
  SaveHistory: SaveHistory,
  activityGetTaskReward: activityGetTaskReward,
  addAttr: addAttr,
  attackNienBeast: attackNienBeast,
  beStrongActiveActReward: beStrongActiveActReward,
  beStrongBuyDiscount: beStrongBuyDiscount,
  beStrongGiftActReward: beStrongGiftActReward,
  beStrongRefreshDiscount: beStrongRefreshDiscount,
  blindBoxOpen: blindBoxOpen,
  blindBoxRefresh: blindBoxRefresh,
  blindBoxShowRewards: blindBoxShowRewards,
  bsAddToHomeReward: bsAddToHomeReward,
  buggyGetTaskReward: buggyGetTaskReward,
  buggyTreasureNext: buggyTreasureNext,
  buggyTreasureRandom: buggyTreasureRandom,
  bulmaPartyBuyGoods: bulmaPartyBuyGoods,
  buyBonus: buyBonus,
  buyCount: buyCount,
  buyDailyDiscount: buyDailyDiscount,
  buyFund: buyFund,
  buyHeroSuperGift: buyHeroSuperGift,
  buyNewServerGift: buyNewServerGift,
  buyStep: buyStep,
  buySuperGift: buySuperGift,
  buyTodayDiscount: buyTodayDiscount,
  clickHonghuUrl: clickHonghuUrl,
  costFeedback: costFeedback,
  cumulativeRechargeReward: cumulativeRechargeReward,
  dailyBigGiftReward: dailyBigGiftReward,
  diamondShop: diamondShop,
  doubleElevenGetPayReward: doubleElevenGetPayReward,
  dungeonReward: dungeonReward,
  entrustActReward: entrustActReward,
  equipUp: equipUp,
  exitGame: exitGame,
  friendBattleActReward: friendBattleActReward,
  friendServerAction: friendServerAction,
  getActivityBrief: getActivityBrief,
  getActivityDetail: getActivityDetail,
  getFundReward: getFundReward,
  getGrowActivityReward: getGrowActivityReward,
  getLanternBlessTaskReward: getLanternBlessTaskReward,
  getLoginActivityExReward: getLoginActivityExReward,
  getLoginActivityReward: getLoginActivityReward,
  getMailList: getMailList,
  getPassRank: getPassRank,
  getRank: getRank,
  getTopBattleRecord: getTopBattleRecord,
  gleaning: gleaning,
  gleaningBuyTicket: gleaningBuyTicket,
  goodHarvestsGetReward: goodHarvestsGetReward,
  handleRefreshImprintResult: handleRefreshImprintResult,
  heroGiftReward: heroGiftReward,
  heroHelpBuy: heroHelpBuy,
  heroOrangeReward: heroOrangeReward,
  heroRewardBuyToken: heroRewardBuyToken,
  heroRewardGetReward: heroRewardGetReward,
  imprintExtraction: imprintExtraction,
  imprintUpGetReward: imprintUpGetReward,
  imprintUpStudy: imprintUpStudy,
  karinActReward: karinActReward,
  karinRich: karinRich,
  karinRichTask: karinRichTask,
  lanternBless: lanternBless,
  lanternBlessClickTip: lanternBlessClickTip,
  luckEquipGetEquip: luckEquipGetEquip,
  luckEquipGetReward: luckEquipGetReward,
  luckEquipPushEquip: luckEquipPushEquip,
  luckEquipUp: luckEquipUp,
  luckFeedbackGetBox: luckFeedbackGetBox,
  luckFeedbackGetReward: luckFeedbackGetReward,
  luckyWheelGetReward: luckyWheelGetReward,
  luckyWheelLottery: luckyWheelLottery,
  luxuryLuck: luxuryLuck,
  marketActReward: marketActReward,
  merchantExchange: merchantExchange,
  mergeBossBuyTimes: mergeBossBuyTimes,
  mergeBossInfo: mergeBossInfo,
  mergeBossStartBattle: mergeBossStartBattle,
  newHeroChallenge: newHeroChallenge,
  newHeroChallengeLike: newHeroChallengeLike,
  newHeroChallengeQueryHonorRoll: newHeroChallengeQueryHonorRoll,
  newHeroChallengeQueryWinRank: newHeroChallengeQueryWinRank,
  newHeroRewardBuyGoods: newHeroRewardBuyGoods,
  newHeroRewardPropExchange: newHeroRewardPropExchange,
  normalLuck: normalLuck,
  queryCSRank: queryCSRank,
  queryImprintTmpPower: queryImprintTmpPower,
  queryLanternBlessRecord: queryLanternBlessRecord,
  queryWeaponCastRecord: queryWeaponCastRecord,
  recharge3DayResign: recharge3DayResign,
  recharge3DayReward: recharge3DayReward,
  recharge3FinialReward: recharge3FinialReward,
  recharge7Reward: recharge7Reward,
  rechargeDailyReward: rechargeDailyReward,
  rechargeGiftReward: rechargeGiftReward,
  refreshImprint: refreshImprint,
  resetLanternBless: resetLanternBless,
  shopBuy: shopBuy,
  singleRechargeReward: singleRechargeReward,
  startBoss: startBoss,
  submitQuestionnaire: submitQuestionnaire,
  summonGiftReward: summonGiftReward,
  summonTen: summonTen,
  timeLimitPropExchange: timeLimitPropExchange,
  timeLimitPropReceive: timeLimitPropReceive,
  turnTable: turnTable,
  turnTableGetReward: turnTableGetReward,
  upsetBlindBox: upsetBlindBox,
  userCertification: userCertification,
  weaponCastGetReward: weaponCastGetReward,
  weaponCastLottery: weaponCastLottery,
  whisFeastBlessExchange: whisFeastBlessExchange,
  whisFeastFoodFeedbackReward: whisFeastFoodFeedbackReward,
  whisFeastGetRankReward: whisFeastGetRankReward,
  whisFeastGivingFood: whisFeastGivingFood,
};

// ============================================
// ROUTER
// ============================================

function handle(socket, request, callback) {
  var action = request.action;

  if (!action) {
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.LACK_PARAM), callback);
    return;
  }

  var handler = actions[action];

  if (handler && typeof handler === 'function') {
    handler(socket, request, callback);
  } else {
    logger.warn('Activity', 'Unknown action: ' + action);
    ResponseHelper.sendResponse(socket, 'handler.process',
      ResponseHelper.error(ResponseHelper.ErrorCode.INVALID_COMMAND), callback);
  }
}

module.exports = { handle: handle };
