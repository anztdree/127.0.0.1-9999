/**
 * chat-server/rooms.js — Room Management
 *
 * Rooms: world, guild, teamDungeon, team
 * Setiap room menyimpan socket ID → user info mapping.
 * Broadcast message ke semua member di room via 'Notify' event.
 *
 * MESSAGE_KIND: 0=NULL, 1=SYSTEM, 2=WORLD, 3=GUILD, 4=PRIVATE, 5=WORLD_TEAM, 6=TEAM
 */

var LZString = require('lz-string');

function Rooms() {
    this.rooms = {};  // roomId → { sockets: { socketId → userId }, messages: [] }
}

Rooms.prototype.join = function (roomId, socketId, userId) {
    if (!this.rooms[roomId]) {
        this.rooms[roomId] = { sockets: {}, messages: [] };
    }
    this.rooms[roomId].sockets[socketId] = userId;
    console.log('[ROOMS] ' + userId + ' joined ' + roomId + ' (total: ' + this.getMemberCount(roomId) + ')');
};

Rooms.prototype.leave = function (roomId, socketId) {
    if (!this.rooms[roomId]) return null;
    var userId = this.rooms[roomId].sockets[socketId] || null;
    delete this.rooms[roomId].sockets[socketId];
    console.log('[ROOMS] ' + (userId || socketId) + ' left ' + roomId + ' (total: ' + this.getMemberCount(roomId) + ')');
    return userId;
};

Rooms.prototype.getMembers = function (roomId) {
    if (!this.rooms[roomId]) return [];
    return Object.keys(this.rooms[roomId].sockets);
};

Rooms.prototype.getMemberCount = function (roomId) {
    if (!this.rooms[roomId]) return 0;
    return Object.keys(this.rooms[roomId].sockets).length;
};

Rooms.prototype.isMember = function (roomId, socketId) {
    return !!(this.rooms[roomId] && this.rooms[roomId].sockets[socketId]);
};

Rooms.prototype.getUserId = function (roomId, socketId) {
    if (!this.rooms[roomId]) return null;
    return this.rooms[roomId].sockets[socketId] || null;
};

Rooms.prototype.getMessages = function (roomId, startTime, limit) {
    if (!this.rooms[roomId]) return [];
    var msgs = this.rooms[roomId].messages;
    limit = limit || 50;
    if (startTime && startTime > 0) {
        return msgs.filter(function (m) { return m._time < startTime; }).slice(-limit);
    }
    return msgs.slice(-limit);
};

Rooms.prototype.addMessage = function (roomId, msg) {
    if (!this.rooms[roomId]) {
        this.rooms[roomId] = { sockets: {}, messages: [] };
    }
    this.rooms[roomId].messages.push(msg);
    // Max 200 messages per room in memory
    if (this.rooms[roomId].messages.length > 200) {
        this.rooms[roomId].messages = this.rooms[roomId].messages.slice(-200);
    }
};

/**
 * Broadcast message ke semua socket di room (kecuali sender).
 * Notify format: {ret:'SUCCESS', data:LZString({_msg: messageObj}), compress:true}
 */
Rooms.prototype.broadcast = function (io, roomId, msg, senderSocketId) {
    if (!this.rooms[roomId]) return 0;
    var notifyData = {
        ret: 'SUCCESS',
        data: LZString.compressToUTF16(JSON.stringify({ _msg: msg })),
        compress: true,
        serverTime: Date.now(),
        server0Time: Date.now()
    };
    var count = 0;
    var sockets = this.rooms[roomId].sockets;
    for (var socketId in sockets) {
        if (socketId !== senderSocketId) {
            var sock = io.sockets.connected[socketId];
            if (sock) {
                sock.emit('Notify', notifyData);
                count++;
            }
        }
    }
    return count;
};

/**
 * Broadcast system message ke semua socket di room (termasuk sender).
 */
Rooms.prototype.broadcastSystem = function (io, roomId, msg) {
    if (!this.rooms[roomId]) return 0;
    var notifyData = {
        ret: 'SUCCESS',
        data: LZString.compressToUTF16(JSON.stringify({ _msg: msg })),
        compress: true,
        serverTime: Date.now(),
        server0Time: Date.now()
    };
    var count = 0;
    var sockets = this.rooms[roomId].sockets;
    for (var socketId in sockets) {
        var sock = io.sockets.connected[socketId];
        if (sock) {
            sock.emit('Notify', notifyData);
            count++;
        }
    }
    return count;
};

/**
 * Cleanup semua referensi socket saat disconnect.
 */
Rooms.prototype.removeSocket = function (socketId) {
    for (var roomId in this.rooms) {
        this.leave(roomId, socketId);
    }
};

// Singleton
var rooms = new Rooms();
module.exports = rooms;
