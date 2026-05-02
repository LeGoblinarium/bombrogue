const Renderer = (() => {
  let canvas = null;
  let ctx = null;
  const sprites = {};
  let spritesReady = false;

  function loadSprites() {
    const FILES = ['tile-light', 'tile-dark', 'obstacle', 'bomb', 'player'];
    let loaded = 0;
    for (const name of FILES) {
      const img = new Image();
      img.onload = () => {
        sprites[name] = img;
        loaded++;
        if (loaded === FILES.length) spritesReady = true;
      };
      img.onerror = () => { loaded++; };
      img.src = `/images/${name}.png`;
    }
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    loadSprites();
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
    const zonePulse = 0.28 + 0.14 * Math.sin(time);

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const s = Camera.gridToScreen(gx, gy);
        if (s.x + cs < 0 || s.y + cs < 0) continue;

        const isObstacle = state.obstacles.some(o => o.x === gx && o.y === gy);
        const distFromEdge = Math.min(gx, GRID_W - 1 - gx, gy, GRID_H - 1 - gy);
        const inZone = zoneDepth > 0 && distFromEdge < zoneDepth;

        if (spritesReady) {
          if (isObstacle) {
            // Draw floor under obstacle so edges don't look empty
            ctx.drawImage(sprites[(gx + gy) % 2 === 0 ? 'tile-light' : 'tile-dark'], s.x, s.y, cs, cs);
            ctx.drawImage(sprites['obstacle'], s.x, s.y, cs, cs);
          } else {
            ctx.drawImage(sprites[(gx + gy) % 2 === 0 ? 'tile-light' : 'tile-dark'], s.x, s.y, cs, cs);
          }
        } else {
          // Fallback plain colors
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
        }

        // Zone red pulse overlay (on top of everything including obstacles)
        if (inZone) {
          ctx.fillStyle = `rgba(220, 40, 40, ${zonePulse})`;
          ctx.fillRect(s.x, s.y, cs, cs);
          if (distFromEdge === zoneDepth - 1) {
            ctx.strokeStyle = `rgba(255, 80, 80, 0.8)`;
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
      const ownerColor = COLORS[getOwnerColorIndex(state, bomb.ownerId)];

      if (spritesReady) {
        // Shadow under bomb
        ctx.beginPath();
        ctx.ellipse(s.x + cs * 0.5, s.y + cs * 0.88, cs * 0.3, cs * 0.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        // Bomb sprite (slightly padded)
        const pad = cs * 0.06;
        ctx.drawImage(sprites['bomb'], s.x + pad, s.y + pad, cs - pad * 2, cs - pad * 2);

        // Owner color dot — bottom-left
        const dotR = Math.max(3, cs * 0.13);
        const dotX = s.x + dotR + cs * 0.08;
        const dotY = s.y + cs - dotR - cs * 0.08;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = ownerColor;
        ctx.fill();

        // Age number — centered lower half, white with black shadow
        const fontSize = Math.max(8, Math.round(cs * 0.3));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = s.x + cs * 0.5;
        const ty = s.y + cs * 0.65;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillText(bomb.age.toString(), tx + 1, ty + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(bomb.age.toString(), tx, ty);

      } else {
        // Fallback circles
        const cx = s.x + cs / 2;
        const cy = s.y + cs / 2;
        const r = cs * 0.35;
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
      const isActive = state.currentTurn && state.currentTurn.playerId === p.id;

      if (spritesReady) {
        // Ground shadow
        ctx.beginPath();
        ctx.ellipse(s.x + cs * 0.5, s.y + cs * 0.92, cs * 0.38, cs * 0.09, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        // Active-turn glow (drawn behind the sprite)
        if (isActive) {
          ctx.shadowColor = '#fff';
          ctx.shadowBlur = cs * 0.3;
        }

        // Player sprite
        ctx.drawImage(sprites['player'], s.x + 1, s.y + 1, cs - 2, cs - 2);
        ctx.shadowBlur = 0;

        // Colored border showing ownership
        const bw = Math.max(2, Math.round(cs * 0.07));
        ctx.strokeStyle = color;
        ctx.lineWidth = bw;
        ctx.strokeRect(s.x + bw / 2, s.y + bw / 2, cs - bw, cs - bw);

        // Extra white border for active turn
        if (isActive) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1, bw - 1);
          ctx.strokeRect(s.x + bw + 1, s.y + bw + 1, cs - bw * 2 - 2, cs - bw * 2 - 2);
        }

        // Name initial — top-right corner badge
        const fontSize = Math.max(7, Math.round(cs * 0.24));
        const bx = s.x + cs - fontSize * 0.75;
        const by = s.y + fontSize * 0.75;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(p.name.charAt(0).toUpperCase(), bx + 1, by + 1);
        ctx.fillStyle = color;
        ctx.fillText(p.name.charAt(0).toUpperCase(), bx, by);

      } else {
        // Fallback squares
        ctx.fillStyle = color;
        ctx.fillRect(s.x + 4, s.y + 4, cs - 8, cs - 8);
        if (isActive) {
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
