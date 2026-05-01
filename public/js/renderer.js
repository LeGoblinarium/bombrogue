const Renderer = (() => {
  let canvas = null;
  let ctx = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    // Double RAF: ensures CSS layout (flex) is fully computed before we measure
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resize();
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => resize()).observe(canvas);
      }
    }));
    window.addEventListener('resize', () => requestAnimationFrame(() => resize()));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    Camera.init(rect.width, rect.height);
  }

  function clear() {
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  function drawGrid(state) {
    const { cellSize, zoom } = Camera.getTransform();
    const cs = cellSize * zoom;
    const zoneDepth = state.currentTurn ? (state.currentTurn.zoneDepth || 0) : 0;
    const time = performance.now() / 400;
    const zonePulse = 0.25 + 0.12 * Math.sin(time);

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const s = Camera.gridToScreen(gx, gy);
        if (s.x + cs < 0 || s.y + cs < 0) continue;

        const isObstacle = state.obstacles.some(o => o.x === gx && o.y === gy);
        const distFromEdge = Math.min(gx, GRID_W - 1 - gx, gy, GRID_H - 1 - gy);
        const inZone = zoneDepth > 0 && distFromEdge < zoneDepth;

        if (inZone) {
          ctx.fillStyle = '#2a0a0a';
        } else if (isObstacle) {
          ctx.fillStyle = '#1a1a2e';
        } else {
          ctx.fillStyle = (gx + gy) % 2 === 0 ? '#16213e' : '#1c2545';
        }
        ctx.fillRect(s.x, s.y, cs, cs);

        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x, s.y, cs, cs);

        if (isObstacle && !inZone) {
          ctx.fillStyle = '#0a0a14';
          ctx.fillRect(s.x + 4, s.y + 4, cs - 8, cs - 8);
        }

        if (inZone) {
          ctx.fillStyle = `rgba(220, 40, 40, ${zonePulse})`;
          ctx.fillRect(s.x, s.y, cs, cs);
          // Brighter edge for the innermost ring of the zone
          if (distFromEdge === zoneDepth - 1) {
            ctx.strokeStyle = `rgba(255, 80, 80, 0.7)`;
            ctx.lineWidth = 2;
            ctx.strokeRect(s.x + 1, s.y + 1, cs - 2, cs - 2);
          }
        }
      }
    }
  }

  function drawWalls(state) {
    if (!state.walls) return;
    const { cellSize, zoom } = Camera.getTransform();
    const cs = cellSize * zoom;
    const time = performance.now() / 300;
    const pulse = 0.25 + 0.15 * Math.sin(time);

    for (const wall of state.walls) {
      const ownerColor = COLORS[getOwnerColorIndex(state, wall.ownerId)];
      for (const cell of wall.cells) {
        const s = Camera.gridToScreen(cell.x, cell.y);
        ctx.fillStyle = hexToRgba(ownerColor, pulse);
        ctx.fillRect(s.x + 2, s.y + 2, cs - 4, cs - 4);

        ctx.strokeStyle = hexToRgba(ownerColor, 0.5);
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x + 2, s.y + 2, cs - 4, cs - 4);
      }
    }
  }

  function drawBombs(state) {
    if (!state.bombs) return;
    const { cellSize, zoom } = Camera.getTransform();
    const cs = cellSize * zoom;
    const now = performance.now();

    for (const bomb of state.bombs) {
      let gx = bomb.x, gy = bomb.y;
      const animPos = Animations.getEntityAnimPos(bomb.id, now);
      if (animPos) { gx = animPos.x; gy = animPos.y; }

      const s = Camera.gridToScreen(gx, gy);
      const cx = s.x + cs / 2;
      const cy = s.y + cs / 2;
      const r = cs * 0.35;

      const ownerColor = COLORS[getOwnerColorIndex(state, bomb.ownerId)];

      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = ownerColor;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a2e';
      ctx.fill();

      ctx.fillStyle = ownerColor;
      ctx.font = `bold ${Math.round(cs * 0.45)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bomb.age.toString(), cx, cy);
    }
  }

  function drawPlayers(state) {
    if (!state.players) return;
    const { cellSize, zoom } = Camera.getTransform();
    const cs = cellSize * zoom;
    const now = performance.now();

    for (const p of state.players) {
      if (!p.alive) continue;

      let gx = p.x, gy = p.y;
      const animPos = Animations.getEntityAnimPos(p.id, now);
      if (animPos) { gx = animPos.x; gy = animPos.y; }

      const s = Camera.gridToScreen(gx, gy);
      const color = COLORS[p.colorIndex];

      ctx.fillStyle = color;
      ctx.fillRect(s.x + 4, s.y + 4, cs - 8, cs - 8);

      if (state.currentTurn && state.currentTurn.playerId === p.id) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(s.x + 2, s.y + 2, cs - 4, cs - 4);
      }

      ctx.fillStyle = '#000';
      ctx.font = `bold ${Math.round(cs * 0.45)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.name.charAt(0).toUpperCase(), s.x + cs / 2, s.y + cs / 2);
    }
  }

  function drawHighlights(highlights) {
    if (!highlights || highlights.length === 0) return;
    const { cellSize, zoom } = Camera.getTransform();
    const cs = cellSize * zoom;

    for (const h of highlights) {
      const s = Camera.gridToScreen(h.x, h.y);
      let color;
      if (h.type === 'reachable') color = 'rgba(78, 205, 196, 0.2)';
      else if (h.type === 'path-preview') color = 'rgba(78, 205, 196, 0.45)';
      else if (h.type === 'range') color = 'rgba(255, 230, 109, 0.15)';
      else if (h.type === 'select-green') color = 'rgba(80, 220, 100, 0.5)';
      else if (h.type === 'select-red') color = 'rgba(220, 60, 60, 0.5)';
      else if (h.type === 'aoe-preview') color = 'rgba(255, 107, 53, 0.3)';
      else continue;

      ctx.fillStyle = color;
      ctx.fillRect(s.x, s.y, cs, cs);

      if (h.type === 'select-green' || h.type === 'select-red') {
        ctx.strokeStyle = h.type === 'select-green' ? '#4adc60' : '#dc4040';
        ctx.lineWidth = 3;
        ctx.strokeRect(s.x + 1, s.y + 1, cs - 2, cs - 2);
      } else if (h.type === 'path-preview') {
        ctx.strokeStyle = 'rgba(78, 205, 196, 0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x + 1, s.y + 1, cs - 2, cs - 2);
      }
    }
  }

  function getOwnerColorIndex(state, ownerId) {
    const p = state.players.find(pp => pp.id === ownerId);
    return p ? p.colorIndex : 0;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function render(state, highlights) {
    if (!state) return;
    clear();
    drawGrid(state);
    drawHighlights(highlights);
    drawWalls(state);
    drawBombs(state);
    drawPlayers(state);
    Animations.update(performance.now());
    Animations.draw(ctx, Camera);
  }

  return { init, render, resize };
})();
