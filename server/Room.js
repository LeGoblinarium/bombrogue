const C = require('./constants');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(existingCodes) {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
  } while (existingCodes.has(code));
  return code;
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.hostId = null;
    this.status = 'waiting';
    this.game = null;
    this.createdAt = Date.now();
  }

  addPlayer(socketId, name) {
    if (this.players.size >= C.MAX_PLAYERS) return false;
    if (this.status !== 'waiting') return false;

    const pa = C.TOTAL_POINTS - C.MIN_PM;
    const pm = C.MIN_PM;

    this.players.set(socketId, {
      id: socketId,
      name: name.substring(0, 16),
      pa,
      pm,
      ready: false,
      colorIndex: this.players.size,
    });

    if (!this.hostId) this.hostId = socketId;
    return true;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.hostId === socketId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
    }
  }

  setDistribution(socketId, pa, pm) {
    const player = this.players.get(socketId);
    if (!player) return false;
    if (pa + pm !== C.TOTAL_POINTS) return false;
    if (pm < C.MIN_PM || pm > C.MAX_PM) return false;
    player.pa = pa;
    player.pm = pm;
    return true;
  }

  getPlayerList() {
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      pa: p.pa,
      pm: p.pm,
      colorIndex: p.colorIndex,
    }));
  }

  isEmpty() {
    return this.players.size === 0;
  }

  canStart() {
    return this.players.size >= 2 && this.status === 'waiting';
  }
}

module.exports = { Room, generateCode };
