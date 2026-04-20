'use strict';

/**
 * =====================================================
 *  shared/activityReward.js — Activity Reward Helper
 *  Super Warrior Z Game Server
 *
 *  buildReward() → { _changeInfo, _addHeroes, _addSigns,
 *                    _addWeapons, _addStones, _addGenkis }
 *  buildPrePayRet() → { errorCode, userId, orderId, data, ... }
 *
 *  Dari HAR: heroGiftReward (line 8020), buyTodayDiscount (line 3765)
 * =====================================================
 */

function buildReward(result) {
    var resp = {
        _addSigns: [],
        _addWeapons: [],
        _addHeroes: [],
        _addGenkis: [],
        _addStones: [],
        _changeInfo: { _items: {} }
    };

    if (!result) return resp;

    // _changeInfo: perubahan currency/item
    if (result.changeInfo && Array.isArray(result.changeInfo)) {
        for (var i = 0; i < result.changeInfo.length; i++) {
            var c = result.changeInfo[i];
            resp._changeInfo._items[String(c._id)] = { _id: c._id, _num: c._num };
        }
    }

    if (result.addHeroes) resp._addHeroes = result.addHeroes;
    if (result.addSigns) resp._addSigns = result.addSigns;
    if (result.addWeapons) resp._addWeapons = result.addWeapons;
    if (result.addStones) resp._addStones = result.addStones;
    if (result.addGenkis) resp._addGenkis = result.addGenkis;

    return resp;
}

function buildPrePayRet(params) {
    var orderId = _genOrderId();
    return {
        errorCode: 0,
        userId: params.userId || '',
        orderId: orderId,
        data: {
            appId: params.appId || 261,
            orderId: orderId,
            subject: params.subject || '',
            money: params.money || 0,
            userId: params.rawUserId || '',
            buyAmount: params.buyAmount || 1,
            extInfo: params.extInfo || '',
            sign: params.sign || ''
        },
        totalPay: 0,
        goodName: params.goodName || ''
    };
}

function _genOrderId() {
    var c = '0123456789abcdef', id = '';
    for (var i = 0; i < 32; i++) id += c[Math.floor(Math.random() * 16)];
    return id;
}

module.exports = { buildReward: buildReward, buildPrePayRet: buildPrePayRet };
