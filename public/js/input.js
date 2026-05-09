const Input = (() => {
  let canvas = null;
  let mode = 'idle';
  let pendingAction = null;
  let pendingCell = null;
  let highlights = [];
  let touchStartTime = 0;
  let touchStartX = 0, touchStartY = 0;
  let moved = false;

  const TAP_THRESHOLD_MS = 250;
  const TAP_THRESHOLD_PX = 10;

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
  }

  function onTouchStart(e) {
    e.preventDefault();
    Camera.handleTouchStart(e.touches);
    if (e.touches.length === 1) {
      touchStartTime = performance.now();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      moved = false;
    } else {
      moved = true;
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      // Always check the drag threshold so taps are detected even when zoomed
      if (Math.sqrt(dx * dx + dy * dy) > TAP_THRESHOLD_PX) moved = true;
      // Pan camera only when zoomed
      if (Camera.isZoomed()) Camera.handleTouchMove(e.touches);
      return;
    }
    // Two-finger pinch
    Camera.handleTouchMove(e.touches);
    moved = true;
  }

  function onTouchEnd(e) {
    e.preventDefault();
    Camera.handleTouchEnd(e.touches);

    if (!moved && e.changedTouches.length > 0) {
      const elapsed = performance.now() - touchStartTime;
      if (elapsed < TAP_THRESHOLD_MS * 3) {
        // Use changedTouches (position at lift time) + fresh getBoundingClientRect
        // to avoid any drift between touchstart and touchend
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const sx = touch.clientX - rect.left;
        const sy = touch.clientY - rect.top;
        handleTap(sx, sy);
      }
    }
  }

  function onMouseDown(e) {
    touchStartTime = performance.now();
    touchStartX = e.clientX;
    touchStartY = e.clientY;
    moved = false;
  }

  function onMouseUp(e) {
    if (!moved) {
      const rect = canvas.getBoundingClientRect();
      handleTap(e.clientX - rect.left, e.clientY - rect.top);
    }
  }

  function handleTap(sx, sy) {
    const cell = Camera.screenToGrid(sx, sy);
    if (!cell) return;

    if (!GameClient.isMyTurn()) return;

    if (pendingCell && pendingCell.x === cell.x && pendingCell.y === cell.y) {
      confirmAction(cell);
    } else {
      previewAction(cell);
    }
  }

  function previewAction(cell) {
    pendingCell = cell;
    const state = GameClient.getState();
    const me = GameClient.getMyPlayer();
    if (!me) return;

    let valid = false;
    let aoe = null;
    let movePath = null;

    if (mode === 'move') {
      valid = isReachable(cell, me);
      if (valid) movePath = computeMovePath(cell, me);
    } else if (mode === 'place-bomb') {
      valid = canPlaceBomb(cell, me, state);
    } else if (mode === 'repulseur') {
      valid = canCastRepulseur(cell, me, state);
      if (valid) aoe = computeRepulseurAoe(cell);
    } else if (mode === 'entourloupe') {
      valid = canCastEntourloupe(cell, me, state);
    } else if (mode === 'stratageme') {
      valid = canCastStratageme(cell, me, state);
    } else if (mode === 'aimant') {
      valid = canCastAimant(cell, me, state);
      aoe = computeAimantAoe(cell);
    } else if (mode === 'detonate') {
      valid = canCastDetonate(cell, me, state);
      if (valid) aoe = computeDetonationAoe(cell.x, cell.y, me, state);
    } else if (mode === 'liberation') {
      valid = canCastLiberation(cell, me);
    }

    highlights = [];
    addRangeHighlights();
    if (movePath) {
      for (const c of movePath) highlights.push({ x: c.x, y: c.y, type: 'path-preview' });
    }
    if (aoe) {
      for (const c of aoe) highlights.push({ x: c.x, y: c.y, type: 'aoe-preview' });
    }
    highlights.push({ x: cell.x, y: cell.y, type: valid ? 'select-green' : 'select-red' });
  }

  function computeMovePath(cell, me) {
    const state = GameClient.getState();
    const visited = new Map();
    // Pre-build occupancy set to avoid O(n) scan per BFS neighbour
    const occupied = new Set(state.obstacles.map(o => `${o.x},${o.y}`));
    for (const b of state.bombs) occupied.add(`${b.x},${b.y}`);
    for (const p of state.players) {
      if (p.alive && p.id !== me.id) occupied.add(`${p.x},${p.y}`);
    }
    const queue = [{ x: me.x, y: me.y, dist: 0, path: [] }];
    visited.set(`${me.x},${me.y}`, true);

    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      if (cur.x === cell.x && cur.y === cell.y) return cur.path;
      if (cur.dist >= me.pmLeft) continue;

      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (occupied.has(key)) continue;
        visited.set(key, true);
        queue.push({ x: nx, y: ny, dist: cur.dist + 1, path: [...cur.path, { x: nx, y: ny }] });
      }
    }
    return null;
  }

  function confirmAction(cell) {
    const state = GameClient.getState();
    const me = GameClient.getMyPlayer();
    if (!me) return;

    let valid = false;
    let action = null;

    if (mode === 'move') {
      valid = isReachable(cell, me);
      if (valid) action = { type: 'move', x: cell.x, y: cell.y };
    } else if (mode === 'place-bomb') {
      valid = canPlaceBomb(cell, me, state);
      if (valid) action = { type: 'place-bomb', x: cell.x, y: cell.y };
    } else if (mode === 'repulseur') {
      valid = canCastRepulseur(cell, me, state);
      if (valid) action = { type: 'repulseur', x: cell.x, y: cell.y };
    } else if (mode === 'entourloupe') {
      valid = canCastEntourloupe(cell, me, state);
      if (valid) action = { type: 'entourloupe', x: cell.x, y: cell.y };
    } else if (mode === 'stratageme') {
      valid = canCastStratageme(cell, me, state);
      if (valid) action = { type: 'stratageme', x: cell.x, y: cell.y };
    } else if (mode === 'aimant') {
      valid = canCastAimant(cell, me, state);
      if (valid) action = { type: 'aimant', x: cell.x, y: cell.y };
    } else if (mode === 'detonate') {
      valid = canCastDetonate(cell, me, state);
      if (valid) action = { type: 'detonate', x: cell.x, y: cell.y };
    } else if (mode === 'liberation') {
      valid = canCastLiberation(cell, me);
      if (valid) action = { type: 'liberation' };
    }

    if (valid && action) {
      Socket.emit('action', action);
      clearSelection();
    }
  }

  function clearSelection() {
    pendingCell = null;
    highlights = [];
    if (mode !== 'move') {
      mode = 'move';
      addRangeHighlights();
      UI.updateSpellSelection(null);
    }
  }

  function setMode(newMode) {
    mode = newMode;
    pendingCell = null;
    highlights = [];
    addRangeHighlights();
  }

  function addRangeHighlights() {
    const me = GameClient.getMyPlayer();
    if (!me || !GameClient.isMyTurn()) return;
    const state = GameClient.getState();

    if (mode === 'move') {
      const reachable = computeReachable(me, state);
      for (const c of reachable) {
        highlights.push({ x: c.x, y: c.y, type: 'reachable' });
      }
    } else if (mode === 'place-bomb') {
      const bombRange = 3 + (me.rangeBonus || 0);
      for (let dx = -bombRange; dx <= bombRange; dx++) {
        for (let dy = -bombRange; dy <= bombRange; dy++) {
          const md = Math.abs(dx) + Math.abs(dy);
          if (md === 0 || md > bombRange) continue;
          const x = me.x + dx, y = me.y + dy;
          if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H
              && clientHasLoS(me.x, me.y, x, y, state, me.id)) {
            highlights.push({ x, y, type: 'range' });
          }
        }
      }
    } else if (mode === 'detonate') {
      const detRange = 10 + (me.rangeBonus || 0);
      // Background: all cells in range with line-of-sight
      for (let dx = -detRange; dx <= detRange; dx++) {
        for (let dy = -detRange; dy <= detRange; dy++) {
          const md = Math.abs(dx) + Math.abs(dy);
          if (md === 0 || md > detRange) continue;
          const x = me.x + dx, y = me.y + dy;
          if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
          if (clientHasLoS(me.x, me.y, x, y, state, me.id)) {
            highlights.push({ x, y, type: 'range' });
          }
        }
      }
      // Foreground: detonable bombs highlighted more prominently
      for (const bomb of state.bombs) {
        if (bomb.ownerId !== me.id) continue;
        const md = Math.abs(bomb.x - me.x) + Math.abs(bomb.y - me.y);
        if (md < 1 || md > detRange) continue;
        const otherBombs = state.bombs.filter(b => b.id !== bomb.id);
        const losState = { ...state, bombs: otherBombs };
        if (clientHasLoS(me.x, me.y, bomb.x, bomb.y, losState, me.id)) {
          highlights.push({ x: bomb.x, y: bomb.y, type: 'range-active' });
        }
      }
    } else if (mode === 'liberation') {
      highlights.push({ x: me.x, y: me.y, type: 'range' });
    } else if (['repulseur', 'entourloupe', 'stratageme', 'aimant'].includes(mode)) {
      const rb = me.rangeBonus || 0;
      const ranges = { repulseur: 6 + rb, entourloupe: 8 + rb, stratageme: 6 + rb, aimant: 6 + rb };
      const r = ranges[mode];
      const casterCrossOnly = mode === 'repulseur';
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (dx === 0 && dy === 0) continue;
          if (casterCrossOnly && dx !== 0 && dy !== 0) continue;
          const md = Math.abs(dx) + Math.abs(dy);
          if (md > r) continue;
          const x = me.x + dx, y = me.y + dy;
          if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H
              && clientHasLoS(me.x, me.y, x, y, state, me.id)) {
            highlights.push({ x, y, type: 'range' });
          }
        }
      }
    }
  }

  function computeReachable(me, state) {
    const visited = new Map();
    const occupied = new Set(state.obstacles.map(o => `${o.x},${o.y}`));
    for (const b of state.bombs) occupied.add(`${b.x},${b.y}`);
    for (const p of state.players) {
      if (p.alive && p.id !== me.id) occupied.add(`${p.x},${p.y}`);
    }
    const queue = [{ x: me.x, y: me.y, dist: 0 }];
    visited.set(`${me.x},${me.y}`, 0);
    const out = [];

    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      if (cur.dist > 0) out.push({ x: cur.x, y: cur.y });
      if (cur.dist >= me.pmLeft) continue;

      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (occupied.has(key)) continue;
        visited.set(key, cur.dist + 1);
        queue.push({ x: nx, y: ny, dist: cur.dist + 1 });
      }
    }
    return out;
  }

  function isReachable(cell, me) {
    const state = GameClient.getState();
    return computeReachable(me, state).some(c => c.x === cell.x && c.y === cell.y);
  }

  function canPlaceBomb(cell, me, state) {
    if (me.paLeft < 4) return false;
    if (state.bombs.filter(b => b.ownerId === me.id).length >= (me.maxBombs || 3)) return false;
    if (state.obstacles.some(o => o.x === cell.x && o.y === cell.y)) return false;
    if (state.bombs.some(b => b.x === cell.x && b.y === cell.y)) return false;
    if (state.bonuses && state.bonuses.some(b => b.x === cell.x && b.y === cell.y)) return false;
    if (state.players.some(p => p.alive && p.x === cell.x && p.y === cell.y)) return false;
    const md = Math.abs(cell.x - me.x) + Math.abs(cell.y - me.y);
    if (md < 1 || md > 3 + (me.rangeBonus || 0)) return false;
    if (!clientHasLoS(me.x, me.y, cell.x, cell.y, state, me.id)) return false;
    return true;
  }

  function canCastRepulseur(cell, me, state) {
    if (me.paLeft < 2) return false;
    if (me.usedThisTurn && me.usedThisTurn.repulseur) return false;
    if (me.cooldowns && me.cooldowns.repulseur > 0) return false;
    if (cell.x !== me.x && cell.y !== me.y) return false;
    const md = Math.abs(cell.x - me.x) + Math.abs(cell.y - me.y);
    if (md > 6 + (me.rangeBonus || 0)) return false;
    if (md > 0 && !clientHasLoS(me.x, me.y, cell.x, cell.y, state, me.id)) return false;
    return true;
  }

  function canCastEntourloupe(cell, me, state) {
    if (me.paLeft < 3) return false;
    if (me.cooldowns && me.cooldowns.entourloupe > 0) return false;
    const md = Math.abs(cell.x - me.x) + Math.abs(cell.y - me.y);
    if (md < 1 || md > 8 + (me.rangeBonus || 0)) return false;
    const bomb = state.bombs.find(b => b.x === cell.x && b.y === cell.y && b.ownerId === me.id);
    if (!bomb) return false;
    // No line-of-sight required: Entourloupe can be cast through obstacles and entities.
    return true;
  }

  function canCastStratageme(cell, me, state) {
    if (me.paLeft < 1) return false;
    if (me.cooldowns && me.cooldowns.stratageme > 0) return false;
    const md = Math.abs(cell.x - me.x) + Math.abs(cell.y - me.y);
    if (md < 1 || md > 6 + (me.rangeBonus || 0)) return false;
    const bomb = state.bombs.find(b => b.x === cell.x && b.y === cell.y);
    if (!bomb) return false;
    if (!bomb.previousPosition) return false;
    const prev = bomb.previousPosition;
    if (state.obstacles.some(o => o.x === prev.x && o.y === prev.y)) return false;
    if (state.bombs.some(b => b.x === prev.x && b.y === prev.y && b.id !== bomb.id)) return false;
    if (state.players.some(p => p.alive && p.x === prev.x && p.y === prev.y)) return false;
    const otherBombsStrat = state.bombs.filter(b => b.id !== bomb.id);
    if (!clientHasLoS(me.x, me.y, cell.x, cell.y, { ...state, bombs: otherBombsStrat }, me.id)) return false;
    return true;
  }

  function canCastDetonate(cell, me, state) {
    if (me.paLeft < 2) return false;
    const md = Math.abs(cell.x - me.x) + Math.abs(cell.y - me.y);
    if (md < 1 || md > 10 + (me.rangeBonus || 0)) return false;
    const bomb = state.bombs.find(b => b.x === cell.x && b.y === cell.y && b.ownerId === me.id);
    if (!bomb) return false;
    // Cannot detonate a bomb placed this same turn
    if (bomb.placedOnTurn != null && state.currentTurn && bomb.placedOnTurn === state.currentTurn.turnNumber) return false;
    const otherBombs = state.bombs.filter(b => b.id !== bomb.id);
    if (!clientHasLoS(me.x, me.y, cell.x, cell.y, { ...state, bombs: otherBombs }, me.id)) return false;
    return true;
  }

  function canCastLiberation(cell, me) {
    return cell.x === me.x && cell.y === me.y;
  }

  function canCastAimant(cell, me, state) {
    if (me.paLeft < 2) return false;
    const md = Math.abs(cell.x - me.x) + Math.abs(cell.y - me.y);
    if (md > 6 + (me.rangeBonus || 0)) return false;
    const hasBomb = state.bombs.some(b => b.x === cell.x && b.y === cell.y);
    const hasPlayer = state.players.some(p => p.alive && p.x === cell.x && p.y === cell.y);
    if (!hasBomb && !hasPlayer) return false;
    if (md > 0 && !clientHasLoS(me.x, me.y, cell.x, cell.y, state, me.id)) return false;
    return true;
  }

  function computeRepulseurAoe(cell) {
    // Cross pattern only: dx=0 or dy=0 (no diagonals), up to 3 cells from center
    const cells = [];
    for (let d = 1; d <= 3; d++) {
      for (const [dx, dy] of [[d,0],[-d,0],[0,d],[0,-d]]) {
        const x = cell.x + dx, y = cell.y + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        cells.push({ x, y });
      }
    }
    return cells;
  }

  function computeAimantAoe(cell) {
    // Cross pattern, up to 8 cells from center
    const cells = [];
    for (let d = 1; d <= 8; d++) {
      for (const [dx, dy] of [[d,0],[-d,0],[0,d],[0,-d]]) {
        const x = cell.x + dx, y = cell.y + dy;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
        cells.push({ x, y });
      }
    }
    return cells;
  }

  // Replicates server GridMap.hasLineOfSight — checks intermediate cells only
  function clientHasLoS(x1, y1, x2, y2, state, selfId) {
    if (x1 === x2 && y1 === y2) return true;
    const dx = x2 - x1, dy = y2 - y1;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps <= 1) return true; // no intermediate cells
    const obstacleSet = new Set(state.obstacles.map(o => `${o.x},${o.y}`));
    const bombSet = new Set(state.bombs.map(b => `${b.x},${b.y}`));
    const playerSet = new Set(
      state.players.filter(p => p.alive && p.id !== selfId).map(p => `${p.x},${p.y}`)
    );
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const key = `${Math.round(x1 + dx * t)},${Math.round(y1 + dy * t)}`;
      if (obstacleSet.has(key)) return false;
      if (bombSet.has(key)) return false;
      if (playerSet.has(key)) return false;
    }
    return true;
  }

  function clientGetBombAoe(bx, by, expRange, obstacles) {
    const obstacleSet = new Set(obstacles.map(o => `${o.x},${o.y}`));
    const cells = [];
    for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      for (let d = 1; d <= expRange; d++) {
        const x = bx + ddx * d, y = by + ddy * d;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) break;
        cells.push({ x, y });
        if (obstacleSet.has(`${x},${y}`)) break;
      }
    }
    for (const [ddx, ddy] of [[1,1],[-1,1],[1,-1],[-1,-1]]) {
      const x = bx + ddx, y = by + ddy;
      if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) continue;
      if (!obstacleSet.has(`${x},${y}`)) cells.push({ x, y });
    }
    return cells;
  }

  function clientGetConnectedBombIds(targetBomb, myBombs, obstacles) {
    const obstacleSet = new Set(obstacles.map(o => `${o.x},${o.y}`));
    const adj = new Map();
    for (const b of myBombs) adj.set(b.id, []);
    for (let i = 0; i < myBombs.length; i++) {
      for (let j = i + 1; j < myBombs.length; j++) {
        const a = myBombs[i], b = myBombs[j];
        if (a.x === b.x) {
          const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
          if (maxY - minY - 1 > WALL_MAX_GAP) continue;
          let blocked = false;
          for (let y = minY + 1; y < maxY; y++) {
            if (obstacleSet.has(`${a.x},${y}`)) { blocked = true; break; }
          }
          if (!blocked) { adj.get(a.id).push(b.id); adj.get(b.id).push(a.id); }
        } else if (a.y === b.y) {
          const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
          if (maxX - minX - 1 > WALL_MAX_GAP) continue;
          let blocked = false;
          for (let x = minX + 1; x < maxX; x++) {
            if (obstacleSet.has(`${x},${a.y}`)) { blocked = true; break; }
          }
          if (!blocked) { adj.get(a.id).push(b.id); adj.get(b.id).push(a.id); }
        }
      }
    }
    const visited = new Set([targetBomb.id]);
    const queue = [targetBomb.id];
    let qi = 0;
    while (qi < queue.length) {
      for (const nb of (adj.get(queue[qi++]) || [])) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    return visited;
  }

  function computeDetonationAoe(bx, by, me, state) {
    const targetBomb = state.bombs.find(b => b.ownerId === me.id && b.x === bx && b.y === by);
    if (!targetBomb) return [];
    const myBombs = state.bombs.filter(b => b.ownerId === me.id);
    const connectedIds = clientGetConnectedBombIds(targetBomb, myBombs, state.obstacles);
    const explodedIds = new Set(connectedIds);
    const queue = state.bombs.filter(b => connectedIds.has(b.id));
    const affectedCells = new Set();
    let qi = 0;
    while (qi < queue.length) {
      const bomb = queue[qi++];
      const expRange = me.explosionRange || 2;
      for (const cell of clientGetBombAoe(bomb.x, bomb.y, expRange, state.obstacles)) {
        affectedCells.add(`${cell.x},${cell.y}`);
        const chain = state.bombs.find(b => b.x === cell.x && b.y === cell.y && !explodedIds.has(b.id));
        if (chain) { explodedIds.add(chain.id); queue.push(chain); }
      }
    }
    return Array.from(affectedCells).map(k => { const [x,y]=k.split(',').map(Number); return {x,y}; });
  }

  function getHighlights() {
    return highlights;
  }

  function refreshHighlights() {
    highlights = [];
    addRangeHighlights();
  }

  function triggerSimpleAction(type) {
    Socket.emit('action', { type });
  }

  return { init, setMode, getHighlights, clearSelection, refreshHighlights, triggerSimpleAction };
})();
