const C = require('./constants');
const GameState = require('./GameState');
const Bomb = require('./Bomb');
const Bonus = require('./Bonus');
const Spells = require('./SpellEngine');
const { resolveDetonation } = require('./DetonationEngine');
const { saveGame } = require('./ranks');

class Game {
  constructor(room, io, socketByUserId = new Map()) {
    this.room = room;
    this.io = io;
    this.socketByUserId = socketByUserId;
    this.state = new GameState(Array.from(room.players.values()), room.obstacleCount);
    // Randomise turn order so the host doesn't always go first
    this.turnOrder = this.state.players.map(p => p.id);
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }
    this.currentTurnIndex = 0;
    this.turnNumber = 1;
    this.cycleNumber = 1; // Increments when full cycle complete (for bomb aging)
    this.turnStartTime = 0;
    this.turnTimer = null;
    this.gameOver = false;
    this.gamePaused = false; // true when all alive players are disconnected
    this.pausedAt = null;    // timestamp when gamePaused became true
    this.actedThisTurn = false;
    // Tracks wall cells where each player already took spell-induced damage this turn
    // Resets each turn. Voluntary movement (doMove) bypasses this tracker.
    this.spellWallDamageTaken = new Map();
  }

  start() {
    // Initial wall compute (none yet, but for consistency)
    this.state.recomputeWalls();

    // For tutorial: room-joined is skipped, so include the player ID so the client
    // can set myId correctly (otherwise highlights and turn detection break).
    const tutorialPlayerId = this.room.isTutorial
      ? (this.room.players.keys().next().value || null)
      : null;

    // Send initial game-start
    this.io.to(this.room.code).emit('game-start', {
      state: this.state.serializeFull(this.buildCurrentTurn()),
      isTutorial: this.room.isTutorial || false,
      yourPlayerId: tutorialPlayerId,
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
      timeLeft: this.room.turnDurationMs,
      zoneDepth: this.getZoneDepth(),
    };
  }

  getZoneDepth() {
    // Zone appears after ZONE_START_CYCLE complete cycles (depth 1 = outer border),
    // then grows 1 cell inward every 2 additional complete cycles.
    return Math.max(0, Math.ceil((this.cycleNumber - C.ZONE_START_CYCLE) / 2));
  }

  isInZone(x, y) {
    const depth = this.getZoneDepth();
    if (depth === 0) return false;
    const gw = this.state.gridMap.width;
    const gh = this.state.gridMap.height;
    return Math.min(x, gw - 1 - x, y, gh - 1 - y) < depth;
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

    // Auto-skip disconnected players (their character stays alive but no one is playing them)
    if (this.room.isPlayerDisconnected(currentPlayer.id)) {
      // If ALL alive players are disconnected, pause the game until someone reconnects
      const alive = this.state.players.filter(p => p.alive);
      const allDisconnected = alive.every(p => this.room.isPlayerDisconnected(p.id));
      if (allDisconnected) {
        this.gamePaused = true;
        this.pausedAt = Date.now();
        this.io.to(this.room.code).emit('game-paused');
        return;
      }
      // Skip this disconnected player's turn
      this.io.to(this.room.code).emit('turn-skipped', { playerId: currentPlayer.id, reason: 'disconnected' });
      this.endTurn(false);
      return;
    }

    currentPlayer.startTurn();
    this.spellWallDamageTaken.clear();

    // Zone damage: applied before wall damage
    if (this.isInZone(currentPlayer.x, currentPlayer.y)) {
      currentPlayer.takeDamage(C.ZONE_DAMAGE);
    }

    // Apply wall damage at turn start — skip if the wall just formed under them
    // (they already took instant damage when it appeared). Clear immunity after so
    // that staying on the wall next turn deals damage again.
    const wallStartKey = `${currentPlayer.x},${currentPlayer.y}`;
    if (!currentPlayer.wallImmuneCells.has(wallStartKey)) {
      this.checkWallDamageAt(currentPlayer, currentPlayer.x, currentPlayer.y);
    }
    currentPlayer.wallImmuneCells.clear();

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
      if (!currentPlayer.alive) {
        this.checkGameOver();
        if (this.gameOver) return;
        this.endTurn(false);
        return;
      }
    }

    this.actedThisTurn = false;
    this.turnStartTime = Date.now();

    // Send turn start
    this.io.to(this.room.code).emit('turn-start', {
      currentTurn: this.buildCurrentTurn(),
      players: this.state.players.map(p => p.serialize()),
      bombs: this.state.bombs.map(b => b.serialize()),
      bonuses: this.state.bonuses.map(b => b.serialize()),
      obstacles: this.state.gridMap.getObstacles(),
      walls: this.state.walls.map(w => ({
        cells: w.cells, ownerId: w.ownerId, damage: w.damage, compSize: w.compSize,
      })),
    });

    // Set turn timer
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => this.endTurn(false), this.room.turnDurationMs);
  }

  endTurn(playerInitiated) {
    if (this.gameOver) return;
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    const currentPlayer = this.state.players.find(p => p.id === this.turnOrder[this.currentTurnIndex]);
    if (currentPlayer && currentPlayer.alive) {
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
    // Tutorial has 1 player: revive instead of ending.
    // In normal games, end when ≤ 1 survivor remains.
    if (this.room.isTutorial && alive.length === 0) {
      const player = this.state.players[0];
      if (player) {
        player.hp = C.START_HP;
        player.alive = true;
        const s = this.io.sockets.sockets.get(player.id);
        if (s) s.emit('error', { message: '💀 Tu es mort ! Tes PV sont restaurés — continue le tutoriel.' });
      }
      return false;
    }
    if (alive.length <= 1) {
      this.gameOver = true;
      const winner = alive[0] || null;
      const stats = this.state.players.map(p => ({
        id: p.id,
        name: p.name,
        colorIndex: p.colorIndex,
        hp: p.hp,
        alive: p.alive,
        stats: { ...p.stats },
      }));
      this.io.to(this.room.code).emit('game-over', {
        winner: winner ? { id: winner.id, name: winner.name, colorIndex: winner.colorIndex } : null,
        stats,
      });
      // Skip DB save for tutorial sessions
      if (!this.room.isTutorial) {
        saveGame(this.room, stats, winner ? winner.id : null, this.io, this.socketByUserId);
      }
      this.cleanup();
      return true;
    }
    return false;
  }

  // Dispatch table: action type → handler function + flags.
  // mutatesBombs: whether this action can change bomb positions/count
  //               (gates the recomputeWalls call).
  // omit:         sections to omit from the state-update delta
  //               (only include what actually changed).
  static ACTION_HANDLERS = {
    'move':        { fn: (g, p, a) => g.doMove(p, a.x, a.y),
                     mutatesBombs: false,
                     omit: { bombs: true, obstacles: true, walls: true } },
    'place-bomb':  { fn: (g, p, a) => g.doPlaceBomb(p, a.x, a.y),
                     mutatesBombs: true,
                     omit: { obstacles: true, bonuses: true } },
    'detonate':    { fn: (g, p, a) => g.doDetonate(p, a.x, a.y),
                     mutatesBombs: true,
                     omit: {} },
    'repulseur':   { fn: (g, p, a) => Spells.castRepulseur(p, a.x, a.y, g.state.bombs, g.state.players, g.state.gridMap),
                     mutatesBombs: true,
                     omit: { obstacles: true, bonuses: true } },
    'substitution': { fn: (g, p, a) => Spells.castSubstitution(p, a.x, a.y, g.state.bombs, g.state.players, g.state.gridMap),
                     mutatesBombs: true,
                     omit: { obstacles: true, bonuses: true } },
    'rappel':      { fn: (g, p, a) => Spells.castRappel(p, a.x, a.y, g.state.bombs, g.state.players, g.state.gridMap),
                     mutatesBombs: true,
                     omit: { obstacles: true, bonuses: true } },
    'expulsion':   { fn: (g, p, a) => Spells.castExpulsion(p, g.state.bombs, g.state.players, g.state.gridMap),
                     mutatesBombs: true,
                     omit: { obstacles: true, bonuses: true } },
    'aimant':      { fn: (g, p, a) => Spells.castAimant(p, a.x, a.y, g.state.bombs, g.state.players, g.state.gridMap),
                     mutatesBombs: true,
                     omit: { obstacles: true, bonuses: true } },
  };

  _dbg(socketId, msg) {
    if (!this.room.isTutorial) return;
    const s = this.io.sockets.sockets.get(socketId);
    if (s) s.emit('error', { message: `[DBG] ${msg}` });
  }

  handleAction(socketId, action) {
    if (this.gameOver) return;
    const currentPid = this.turnOrder[this.currentTurnIndex];
    if (socketId !== currentPid) {
      this._dbg(socketId, `Not your turn. socketId=${socketId} currentPid=${currentPid}`);
      return;
    }
    const player = this.state.players.find(p => p.id === socketId);
    if (!player || !player.alive) {
      this._dbg(socketId, `Player not found or dead. found=${!!player}`);
      return;
    }

    if (action.type === 'end-turn') {
      this.endTurn(true);
      return;
    }

    const handler = Game.ACTION_HANDLERS[action.type];
    if (!handler) {
      this._dbg(socketId, `Unknown action type: ${action.type}`);
      return;
    }

    const result = handler.fn(this, player, action);
    if (!result || !result.ok) {
      this._dbg(socketId, `Action rejected: type=${action.type} x=${action.x} y=${action.y} px=${player.x} py=${player.y} pmLeft=${player.pmLeft} paLeft=${player.paLeft}`);
      return;
    }

    this.actedThisTurn = true;
    if (action.type !== 'move') player.stats.spellsUsed++;

    // Apply wall damage for players moved by spells along their path.
    // Spell tracker: a given wall cell only damages a player once per turn
    // from spell-induced movement. Voluntary movement (doMove) bypasses this.
    if (result.movements && action.type !== 'move') {
      for (const m of result.movements) {
        if (m.type !== 'player') continue;
        const p = this.state.players.find(pp => pp.id === m.id);
        if (!p || !p.alive) continue;
        for (let i = 1; i < m.path.length; i++) {
          this.checkSpellWallDamageAt(p, m.path[i].x, m.path[i].y);
          if (!p.alive) break;
        }
      }
    }

    // Pick up any bonus at the final position of each player moved by a spell
    // (teleport like Substitution, or push like Repulseur/Expulsion)
    if (result.movements && action.type !== 'move') {
      for (const m of result.movements) {
        if (m.type !== 'player') continue;
        const movedPlayer = this.state.players.find(p => p.id === m.id);
        if (!movedPlayer || !movedPlayer.alive) continue;
        const bonusIdx = this.state.bonuses.findIndex(b => b.x === movedPlayer.x && b.y === movedPlayer.y);
        if (bonusIdx !== -1) {
          movedPlayer.applyBonus(this.state.bonuses[bonusIdx].type);
          this.state.bonuses.splice(bonusIdx, 1);
          result.bonusPickedUp = true;
        }
      }
    }

    // Destroy any bonus that a bomb has been pushed/teleported onto
    if (handler.mutatesBombs) {
      for (const bomb of this.state.bombs) {
        const bonusIdx = this.state.bonuses.findIndex(b => b.x === bomb.x && b.y === bomb.y);
        if (bonusIdx !== -1) this.state.bonuses.splice(bonusIdx, 1);
      }
    }

    let wallsCreated = false;
    if (handler.mutatesBombs) {
      const wallsBefore = this.state.walls.length;
      this.state.recomputeWalls();
      wallsCreated = this.state.walls.length > wallsBefore;
      this.pruneStaleWallImmunity();
      this.applyInstantWallDamage();
    }

    if (this.checkGameOver()) return;

    this.io.to(this.room.code).emit('state-update', {
      ...this.state.serializeDelta(this.buildCurrentTurn(), handler.omit),
      movements: result.movements || [],
      actionType: action.type,
      wallsCreated,
      bonusPickedUp: result.bonusPickedUp || false,
      bonusPickups: result.bonusPickups || [],
    });
  }

  doMove(player, x, y) {
    const fromX = player.x, fromY = player.y;
    const pathData = this.state.gridMap.shortestPath(
      player.x, player.y, x, y, player.pmLeft,
      this.state.bombs, this.state.players, player.id
    );
    if (!pathData) return { ok: false };

    const seenWallCells = new Set();
    const bonusPickups = []; // [{x, y, type, stepIndex}] for deferred client-side pickup
    for (let si = 0; si < pathData.path.length; si++) {
      const step = pathData.path[si];
      player.x = step.x;
      player.y = step.y;
      const key = `${step.x},${step.y}`;
      if (!seenWallCells.has(key)) {
        seenWallCells.add(key);
        const hasWall = this.state.wallCellMap.has(key);
        this.checkWallDamageAt(player, step.x, step.y);
        if (!player.alive) break;
        // Grant immunity only if a wall currently exists here, to prevent
        // applyInstantWallDamage from double-hitting the same cell.
        // Non-wall cells must NOT get immunity — otherwise a wall forming later
        // (e.g. from an opponent's bomb placement) would be incorrectly skipped.
        if (hasWall) {
          player.wallImmuneCells.add(key);
        }
      }
      // Bonus pickup: apply effect now but record step for client-side timing
      const bonusIdx = this.state.bonuses.findIndex(b => b.x === step.x && b.y === step.y);
      if (bonusIdx !== -1) {
        const bonus = this.state.bonuses[bonusIdx];
        bonusPickups.push({ x: bonus.x, y: bonus.y, type: bonus.type, stepIndex: si });
        player.applyBonus(bonus.type);
        this.state.bonuses.splice(bonusIdx, 1);
      }
    }
    player.pmLeft -= pathData.dist;

    const fullPath = [{ x: fromX, y: fromY }, ...pathData.path];
    return { ok: true, movements: [{ id: player.id, type: 'player', path: fullPath }], bonusPickups };
  }

  doPlaceBomb(player, x, y) {
    if (player.paLeft < C.COST_PLACE_BOMB) return { ok: false };
    const myBombs = this.state.bombs.filter(b => b.ownerId === player.id);
    if (myBombs.length >= player.maxBombs) return { ok: false };
    if (this.state.gridMap.isObstacle(x, y)) return { ok: false };
    if (!this.state.gridMap.inBounds(x, y)) return { ok: false };
    if (this.state.bombs.some(b => b.x === x && b.y === y)) return { ok: false };
    if (this.state.bonuses.some(b => b.x === x && b.y === y)) return { ok: false };
    if (this.state.players.some(p => p.alive && p.x === x && p.y === y)) return { ok: false };
    const md = Math.abs(x - player.x) + Math.abs(y - player.y);
    if (md < 1 || md > C.BOMB_PLACE_RANGE + (player.rangeBonus || 0)) return { ok: false };
    if (!this.state.gridMap.hasLineOfSight(player.x, player.y, x, y, this.state.bombs, this.state.players, player.id)) return { ok: false };

    const bomb = new Bomb(player.id, x, y);
    bomb.placedOnTurn = this.turnNumber;
    this.state.bombs.push(bomb);
    player.paLeft -= C.COST_PLACE_BOMB;
    player.stats.bombsPlaced++;
    return { ok: true };
  }

  doDetonate(player, x, y) {
    if (player.paLeft < C.COST_DETONATE) return { ok: false };

    // Target must be one of the player's own bombs
    const targetBomb = this.state.bombs.find(
      b => b.ownerId === player.id && b.x === x && b.y === y
    );
    if (!targetBomb) return { ok: false };

    // Cannot detonate a bomb placed on the same turn (anti-cheese)
    if (targetBomb.placedOnTurn === this.turnNumber) return { ok: false };

    // Range check (Manhattan distance 1–DETONATE_RANGE, extended by rangeBonus)
    const md = Math.abs(x - player.x) + Math.abs(y - player.y);
    if (md < 1 || md > C.DETONATE_RANGE + (player.rangeBonus || 0)) return { ok: false };
    // LoS: exclude the target bomb itself from blockers so it doesn't block its own LoS
    const otherBombs = this.state.bombs.filter(b => b.id !== targetBomb.id);
    if (!this.state.gridMap.hasLineOfSight(player.x, player.y, x, y, otherBombs, this.state.players, player.id)) return { ok: false };

    player.paLeft -= C.COST_DETONATE;

    // Use the component map cached by the last recomputeWalls() call —
    // it reflects the current bomb layout without rebuilding the graph.
    const comp = this.state.bombCompMap.get(targetBomb.id);
    const seedIds = comp ? comp.map(b => b.id) : [targetBomb.id];

    // Build owner map before resolution (bombs still present in array)
    const bombOwnerMap = new Map(this.state.bombs.map(b => [b.id, b.ownerId]));

    const result = resolveDetonation(seedIds, this.state.bombs, this.state.players, this.state.gridMap);

    // Attribute explosion damage dealt to each bomb's owner
    for (const ev of result.sequence) {
      const ownerId = bombOwnerMap.get(ev.bombId);
      const owner = this.state.players.find(p => p.id === ownerId);
      if (!owner) continue;
      for (const hit of ev.hits) {
        owner.stats.damageDealt += hit.damage;
      }
    }

    // Remove detonated bombs
    this.state.bombs = this.state.bombs.filter(b => !result.detonatedIds.includes(b.id));

    // Destroy any bonus caught in the explosion AoE
    const explodedCells = new Set();
    for (const ev of result.sequence) {
      for (const cell of ev.aoe) {
        if (!cell.destroyedObstacle) explodedCells.add(`${cell.x},${cell.y}`);
      }
    }
    this.state.bonuses = this.state.bonuses.filter(b => !explodedCells.has(`${b.x},${b.y}`));

    // Remove obstacles destroyed by the explosion; chance to spawn a bonus
    for (const obs of result.destroyedObstacles) {
      this.state.gridMap.removeObstacle(obs.x, obs.y);
      // Don't spawn a bonus if a bomb already occupies that cell
      const bombOnCell = this.state.bombs.some(b => b.x === obs.x && b.y === obs.y);
      if (!bombOnCell && Math.random() < C.BONUS_SPAWN_CHANCE) {
        const type = C.BONUS_TYPES[Math.floor(Math.random() * C.BONUS_TYPES.length)];
        this.state.bonuses.push(new Bonus(type, obs.x, obs.y));
      }
    }

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
    const wall = this.state.wallCellMap.get(`${x},${y}`);
    if (!wall) return;
    const actual = player.takeDamage(wall.damage);
    this._attributeWallDamage(wall, player, actual);
  }

  // Spell-induced wall damage: each wall cell only damages a player once per turn.
  // Also grants wallImmuneCells so applyInstantWallDamage won't double-hit the same cell.
  checkSpellWallDamageAt(player, x, y) {
    const wall = this.state.wallCellMap.get(`${x},${y}`);
    if (!wall) return;
    if (!this.spellWallDamageTaken.has(player.id)) {
      this.spellWallDamageTaken.set(player.id, new Set());
    }
    const taken = this.spellWallDamageTaken.get(player.id);
    const key = `${x},${y}`;
    if (taken.has(key)) return;
    taken.add(key);
    player.wallImmuneCells.add(key);
    const actual = player.takeDamage(wall.damage);
    this._attributeWallDamage(wall, player, actual);
  }

  _attributeWallDamage(wall, target, actual) {
    if (wall.ownerId === target.id) return;
    const owner = this.state.players.find(p => p.id === wall.ownerId);
    if (owner) owner.stats.damageDealt += actual;
  }

  // After recomputeWalls(), remove wall immunity for cells that are no longer walls.
  // This prevents stale immunity (earned while a wall existed) from blocking damage
  // when a different wall later forms at the same cell.
  pruneStaleWallImmunity() {
    for (const p of this.state.players) {
      for (const key of Array.from(p.wallImmuneCells)) {
        if (!this.state.wallCellMap.has(key)) {
          p.wallImmuneCells.delete(key);
        }
      }
    }
  }

  // Called after every recomputeWalls(): any player now standing on a wall cell
  // that they haven't been immunised against takes immediate damage.
  applyInstantWallDamage() {
    for (const p of this.state.players) {
      if (!p.alive) continue;
      const key = `${p.x},${p.y}`;
      const wall = this.state.wallCellMap.get(key);
      if (!wall) continue;
      if (p.wallImmuneCells.has(key)) continue;
      const actual = p.takeDamage(wall.damage);
      p.wallImmuneCells.add(key);
      this._attributeWallDamage(wall, p, actual);
    }
  }

  // Intentional leave (leave-room button) — kills the player immediately.
  handleDisconnect(playerId) {
    const p = this.state.players.find(pp => pp.id === playerId);
    if (!p) return;
    p.alive = false;
    p.hp = 0;

    if (this.turnOrder[this.currentTurnIndex] === playerId) {
      this.endTurn(false);
    } else {
      this.checkGameOver();
    }
  }

  // Involuntary disconnect (socket drop) — character stays alive, turn is auto-skipped.
  handleConnectionLost(socketId) {
    this.io.to(this.room.code).emit('player-disconnected', { playerId: socketId });

    // If it was their turn, end it immediately (beginTurn will then auto-skip future turns)
    if (this.turnOrder[this.currentTurnIndex] === socketId) {
      this.endTurn(false);
    }
    // Otherwise beginTurn will handle auto-skip when this player's turn comes around
  }

  // A new socket has claimed a disconnected player's slot. Resume the game if it was paused.
  handleRejoin(newSocketId, originalPlayerId) {
    this.io.to(this.room.code).emit('player-reconnected', { playerId: originalPlayerId });

    // Send full game state to the rejoining socket
    const rejoiningSocket = this.io.sockets.sockets.get(newSocketId);
    if (rejoiningSocket) {
      rejoiningSocket.emit('game-rejoin', {
        state: this.state.serializeFull(this.buildCurrentTurn()),
        yourPlayerId: originalPlayerId,
      });
    }

    // Resume if paused (all-disconnected situation resolved)
    if (this.gamePaused) {
      this.gamePaused = false;
      this.pausedAt = null;
      this.io.to(this.room.code).emit('game-resumed');
      this.beginTurn();
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
