const C = require('./constants');
const GameState = require('./GameState');
const Bomb = require('./Bomb');
const Spells = require('./SpellEngine');
const { resolveDetonation } = require('./DetonationEngine');

class Game {
  constructor(room, io) {
    this.room = room;
    this.io = io;
    this.state = new GameState(Array.from(room.players.values()));
    this.turnOrder = this.state.players.map(p => p.id);
    this.currentTurnIndex = 0;
    this.turnNumber = 1;
    this.cycleNumber = 1; // Increments when full cycle complete (for bomb aging)
    this.turnStartTime = 0;
    this.turnTimer = null;
    this.gameOver = false;
    this.actedThisTurn = false;
  }

  start() {
    // Initial wall compute (none yet, but for consistency)
    this.state.recomputeWalls();

    // Send initial game-start
    this.io.to(this.room.code).emit('game-start', {
      state: this.state.serializeFull(this.buildCurrentTurn()),
    });

    this.beginTurn();
  }

  buildCurrentTurn() {
    const playerId = this.turnOrder[this.currentTurnIndex];
    const player = this.state.players.find(p => p.id === playerId);
    return {
      playerId,
      turnNumber: this.turnNumber,
      paLeft: player ? player.paLeft : 0,
      pmLeft: player ? player.pmLeft : 0,
      timeLeft: C.TURN_TIME_MS,
    };
  }

  beginTurn() {
    if (this.gameOver) return;

    // Skip dead players
    let attempts = 0;
    while (attempts < this.turnOrder.length) {
      const pid = this.turnOrder[this.currentTurnIndex];
      const p = this.state.players.find(pp => pp.id === pid);
      if (p && p.alive) break;
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.turnOrder.length;
      attempts++;
    }

    const currentPlayer = this.state.players.find(p => p.id === this.turnOrder[this.currentTurnIndex]);
    if (!currentPlayer) return;

    currentPlayer.startTurn();

    // Apply wall damage if standing on a wall (turn start)
    this.checkWallDamageAt(currentPlayer, currentPlayer.x, currentPlayer.y);

    // Check if player died from wall damage
    if (!currentPlayer.alive) {
      this.checkGameOver();
      if (this.gameOver) return;
      this.endTurn(false);
      return;
    }

    // Anti-stalling: if player has been idle too many turns, deal damage
    if (currentPlayer.idleTurns >= C.STALL_TURNS) {
      currentPlayer.takeDamage(C.STALL_DAMAGE);
      currentPlayer.idleTurns = 0;
    }

    this.actedThisTurn = false;
    this.turnStartTime = Date.now();

    // Send turn start
    this.io.to(this.room.code).emit('turn-start', {
      currentTurn: this.buildCurrentTurn(),
      players: this.state.players.map(p => p.serialize()),
      bombs: this.state.bombs.map(b => b.serialize()),
      walls: this.state.walls.map(w => ({
        cells: w.cells, ownerId: w.ownerId, damage: w.damage, compSize: w.compSize,
      })),
    });

    // Set turn timer
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => this.endTurn(false), C.TURN_TIME_MS);
  }

  endTurn(playerInitiated) {
    if (this.gameOver) return;
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    const currentPlayer = this.state.players.find(p => p.id === this.turnOrder[this.currentTurnIndex]);
    if (currentPlayer) {
      currentPlayer.endTurn(this.actedThisTurn);
    }

    // Move to next player
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.turnOrder.length;

    // If we cycled back to start, age bombs and increment cycle
    if (this.currentTurnIndex === 0) {
      this.cycleNumber++;
      for (const bomb of this.state.bombs) {
        bomb.ageTick();
      }
    }

    this.turnNumber++;

    if (this.checkGameOver()) return;
    this.beginTurn();
  }

  checkGameOver() {
    const alive = this.state.players.filter(p => p.alive);
    if (alive.length <= 1) {
      this.gameOver = true;
      const winner = alive[0] || null;
      this.io.to(this.room.code).emit('game-over', {
        winner: winner ? { id: winner.id, name: winner.name, colorIndex: winner.colorIndex } : null,
        stats: this.state.players.map(p => ({
          id: p.id,
          name: p.name,
          colorIndex: p.colorIndex,
          hp: p.hp,
          alive: p.alive,
        })),
      });
      this.cleanup();
      return true;
    }
    return false;
  }

  handleAction(socketId, action) {
    if (this.gameOver) return;
    const currentPid = this.turnOrder[this.currentTurnIndex];
    if (socketId !== currentPid) return;
    const player = this.state.players.find(p => p.id === socketId);
    if (!player || !player.alive) return;

    let result = null;

    if (action.type === 'move') {
      result = this.doMove(player, action.x, action.y);
    } else if (action.type === 'place-bomb') {
      result = this.doPlaceBomb(player, action.x, action.y);
    } else if (action.type === 'detonate') {
      result = this.doDetonate(player);
    } else if (action.type === 'repulseur') {
      result = Spells.castRepulseur(player, action.x, action.y, this.state.bombs, this.state.players, this.state.gridMap);
    } else if (action.type === 'entourloupe') {
      result = Spells.castEntourloupe(player, action.x, action.y, this.state.bombs, this.state.players, this.state.gridMap);
    } else if (action.type === 'stratageme') {
      result = Spells.castStratageme(player, action.x, action.y, this.state.bombs, this.state.players, this.state.gridMap);
    } else if (action.type === 'liberation') {
      result = Spells.castLiberation(player, this.state.bombs, this.state.players, this.state.gridMap);
    } else if (action.type === 'aimant') {
      result = Spells.castAimant(player, action.x, action.y, this.state.bombs, this.state.players, this.state.gridMap);
    } else if (action.type === 'end-turn') {
      this.endTurn(true);
      return;
    }

    if (!result || !result.ok) return;

    this.actedThisTurn = true;

    // Recompute walls after any action that might affect bombs/positions
    this.state.recomputeWalls();

    // Check death (in case wall damage from movement etc.)
    if (this.checkGameOver()) return;

    // Broadcast state update
    this.io.to(this.room.code).emit('state-update', this.state.serializeDelta(this.buildCurrentTurn()));
  }

  doMove(player, x, y) {
    const path = this.state.gridMap.shortestPath(
      player.x, player.y, x, y, player.pmLeft,
      this.state.bombs, this.state.players, player.id
    );
    if (!path) return { ok: false };

    // Walk along path, applying wall damage on each cell entered
    const seenWallCells = new Set();
    for (const step of path.path) {
      player.x = step.x;
      player.y = step.y;
      const key = `${step.x},${step.y}`;
      if (!seenWallCells.has(key)) {
        seenWallCells.add(key);
        this.checkWallDamageAt(player, step.x, step.y);
        if (!player.alive) break;
      }
    }
    player.pmLeft -= path.dist;
    return { ok: true };
  }

  doPlaceBomb(player, x, y) {
    if (player.paLeft < C.COST_PLACE_BOMB) return { ok: false };
    const myBombs = this.state.bombs.filter(b => b.ownerId === player.id);
    if (myBombs.length >= C.MAX_BOMBS_PER_PLAYER) return { ok: false };
    if (this.state.gridMap.isObstacle(x, y)) return { ok: false };
    if (!this.state.gridMap.inBounds(x, y)) return { ok: false };
    if (this.state.bombs.some(b => b.x === x && b.y === y)) return { ok: false };
    if (this.state.players.some(p => p.alive && p.x === x && p.y === y)) return { ok: false };
    const md = Math.abs(x - player.x) + Math.abs(y - player.y);
    if (md < 1 || md > C.BOMB_PLACE_RANGE) return { ok: false };

    const bomb = new Bomb(player.id, x, y);
    this.state.bombs.push(bomb);
    player.paLeft -= C.COST_PLACE_BOMB;
    return { ok: true };
  }

  doDetonate(player) {
    if (player.paLeft < C.COST_DETONATE) return { ok: false };
    const myBombs = this.state.bombs.filter(b => b.ownerId === player.id);
    if (myBombs.length === 0) return { ok: false };

    player.paLeft -= C.COST_DETONATE;

    const result = resolveDetonation(player.id, this.state.bombs, this.state.players, this.state.gridMap);

    // Remove detonated bombs
    this.state.bombs = this.state.bombs.filter(b => !result.detonatedIds.includes(b.id));

    // Send detonation animation
    // Group sequence by step for client animation
    const stepGroups = new Map();
    for (const ev of result.sequence) {
      if (!stepGroups.has(ev.step)) stepGroups.set(ev.step, []);
      stepGroups.get(ev.step).push(ev);
    }
    const sequenceArr = Array.from(stepGroups.keys()).sort((a, b) => a - b).map(s => stepGroups.get(s));

    this.io.to(this.room.code).emit('detonation-result', {
      sequence: sequenceArr,
    });

    return { ok: true };
  }

  checkWallDamageAt(player, x, y) {
    const key = `${x},${y}`;
    const wall = this.state.wallCellMap.get(key);
    if (!wall) return;
    if (wall.ownerId === player.id) {
      // Own wall still damages (configurable - here we make it damage everyone for tactical depth)
    }
    player.takeDamage(wall.damage);
  }

  handleDisconnect(socketId) {
    const p = this.state.players.find(pp => pp.id === socketId);
    if (!p) return;
    p.alive = false;
    p.hp = 0;

    // If it was their turn, end it
    if (this.turnOrder[this.currentTurnIndex] === socketId) {
      this.endTurn(false);
    } else {
      this.checkGameOver();
    }
  }

  cleanup() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }
}

module.exports = Game;
