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
  constructor(code, name, isPublic, isTutorial = false) {
    this.code = code;
    this.name = (name || '').trim() || 'Partie sans nom';
    this.isPublic = isPublic !== false; // default true
    this.isTutorial = isTutorial;
    this.obstacleCount = 30;   // default obstacle count
    this.turnDurationMs = isTutorial ? 300_000 : 60000; // 5 min for tutorial, 60 s default
    this.players = new Map();
    this.disconnectedPlayers = new Map(); // originalSocketId → player data (during active game)
    this.hostId = null;
    this.status = 'waiting';
    this.game = null;
    this.replayVotes = new Set();
    this.createdAt = Date.now();
  }

  publicInfo() {
    return {
      code: this.code,
      name: this.name,
      playerCount: this.players.size,
      maxPlayers: C.MAX_PLAYERS,
      inProgress: this.status === 'playing',
      disconnectedCount: this.disconnectedPlayers.size,
    };
  }

  addPlayer(socketId, name, userId = null, userRank = 0, username = null) {
    if (this.players.size >= C.MAX_PLAYERS) return false;
    if (this.status !== 'waiting') return false;

    const pa = C.DEFAULT_PA;
    const pm = C.DEFAULT_PM;

    // Assign the first colorIndex (0-3) not already taken by a current player
    const usedColors = new Set(Array.from(this.players.values()).map(p => p.colorIndex));
    let colorIndex = 0;
    while (usedColors.has(colorIndex)) colorIndex++;

    this.players.set(socketId, {
      id: socketId,
      name: name.substring(0, 16),
      pa,
      pm,
      ready: false,
      colorIndex,
      character: 'player',
      userId,
      username,   // real account username (null for guests)
      rank: userRank,
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

  // Move a player to the disconnected pool (used when they drop during an active game).
  // Their character stays alive and the slot can be claimed by anyone.
  moveToDisconnected(socketId) {
    const player = this.players.get(socketId);
    if (!player) return false;
    this.disconnectedPlayers.set(socketId, player); // key = original socket id = player.id
    this.players.delete(socketId);
    // Reassign host if necessary
    if (this.hostId === socketId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
    }
    return true;
  }

  // Let a new socket claim a disconnected player's slot.
  // The original player ID is preserved so game state lookup still works.
  claimSlot(newSocketId, targetPlayerId) {
    // targetPlayerId == original socketId of the disconnected player
    const player = this.disconnectedPlayers.get(targetPlayerId);
    if (!player) return false;
    this.disconnectedPlayers.delete(targetPlayerId);
    // Re-add under new socket key but keep player.id = original socket id
    this.players.set(newSocketId, { ...player });
    return true;
  }

  isPlayerDisconnected(playerId) {
    return this.disconnectedPlayers.has(playerId);
  }

  getDisconnectedSlots() {
    return Array.from(this.disconnectedPlayers.values()).map(p => ({
      id: p.id,
      name: p.name,
      colorIndex: p.colorIndex,
      character: p.character || 'player',
    }));
  }

  setObstacleCount(count) {
    const n = Math.round(Number(count));
    if (isNaN(n) || n < 0 || n > 90) return false;
    this.obstacleCount = n;
    return true;
  }

  setTurnDuration(seconds) {
    if (this.isTutorial) return false; // fixed 5-min duration for tutorial
    const s = Math.round(Number(seconds));
    if (isNaN(s) || s < 30 || s > 120) return false;
    this.turnDurationMs = s * 1000;
    return true;
  }

  setCharacter(socketId, character) {
    const player = this.players.get(socketId);
    if (!player) return false;
    player.character = character;
    return true;
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
      character: p.character || 'player',
      rank:      p.rank || 0,
      username:  p.username || null,
    }));
  }

  resetForReplay() {
    this.status = 'waiting';
    this.game = null;
    this.replayVotes = new Set();
    this.disconnectedPlayers = new Map();
    for (const player of this.players.values()) {
      player.pa = C.DEFAULT_PA;
      player.pm = C.DEFAULT_PM;
    }
  }

  isEmpty() {
    return this.players.size === 0 && this.disconnectedPlayers.size === 0;
  }

  canStart() {
    if (this.isTutorial) return this.players.size >= 1 && this.status === 'waiting';
    return this.players.size >= 2 && this.status === 'waiting';
  }
}

module.exports = { Room, generateCode };
