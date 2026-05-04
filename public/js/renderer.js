const Renderer = (() => {
  let canvas = null;
  let ctx = null;
  const sprites = {};
  let spritesReady = false;

  function loadSprites() {
    const FILES = [
      'tile-light', 'tile-dark', 'obstacle', 'bomb',
      'player', 'merlin', 'kael', 'borin', 'alaric', 'mordek',
      'bomb-bonus', 'range-bonus', 'explosion-bonus', 'move-bonus', 'action-bonus',
    ];
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
        // Idle pulse animation — each bomb has its own phase based on position
        const bombPhaseOffset = bomb.x * 0.31 + bomb.y * 0.19;
        const bombPulse = Math.sin((now / 1600) * Math.PI * 2 + bombPhaseOffset) * 0.5 + 0.5; // 0→1
        const bombBob   = -bombPulse * cs * 0.025;
        const bombScale =  1 + bombPulse * 0.04;

        const bcx = s.x + cs * 0.5;
        const bcy = s.y + cs * 0.5;

        // Shadow under bomb (shrinks when bomb floats up)
        ctx.beginPath();
        ctx.ellipse(bcx, s.y + cs * 0.88, cs * (0.3 - bombPulse * 0.06), cs * 0.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${0.4 - bombPulse * 0.15})`;
        ctx.fill();

        // Bomb sprite with pulse
        const pad = cs * 0.06;
        const bSize = (cs - pad * 2) * bombScale;
        ctx.drawImage(sprites['bomb'], bcx - bSize / 2, bcy - bSize / 2 + bombBob, bSize, bSize);

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

  function drawBonuses(state) {
    if (!state.bonuses || state.bonuses.length === 0) return;
    const { cellSize, zoom } = Camera.getTransform();
    const cs = cellSize * zoom;
    const time = performance.now() / 600;
    const pulse = 0.75 + 0.25 * Math.sin(time);

    for (const bonus of state.bonuses) {
      const s = Camera.gridToScreen(bonus.x, bonus.y);
      const spriteKey = bonus.type; // 'bomb-bonus', 'range-bonus', etc.
      const pad = cs * 0.15;
      const size = (cs - pad * 2) * pulse;
      const cx = s.x + cs / 2;
      const cy = s.y + cs / 2;

      // Glow halo
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 50, ${0.15 + 0.1 * Math.sin(time)})`;
      ctx.fill();

      if (spritesReady && sprites[spriteKey]) {
        ctx.drawImage(sprites[spriteKey], cx - size / 2, cy - size / 2, size, size);
      } else {
        // Fallback: colored star shape
        ctx.fillStyle = '#ffd700';
        ctx.font = `bold ${Math.round(cs * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', cx, cy);
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
        const cx = s.x + cs * 0.5;
        const cy = s.y + cs * 0.5;
        const bw = Math.max(2, Math.round(cs * 0.07));

        // ── Procedural walk animation ─────────────────────────────────────────
        const walkState = Animations.getPlayerAnimState(p.id, now);
        const angle = walkState ? walkState.currentAngle : Animations.getPlayerFacing(p.id);

        let bobOffset = 0, scaleX = 1, scaleY = 1;
        let shadowRx = 0.38, shadowAlpha = 0.40;

        if (walkState) {
          // air: 0 at landing, 1 at peak of hop (smooth arc per cell)
          const air = Math.sin(walkState.cellPhase * Math.PI);
          const gnd = 1 - air;

          // Bob: move sprite upward at peak
          bobOffset = -air * cs * 0.20;

          // Squash at landing, stretch at peak
          scaleX = 1 + gnd * 0.12 - air * 0.07;  // wide at landing, narrow at peak
          scaleY = 1 - gnd * 0.09 + air * 0.14;  // short at landing, tall at peak

          // Shadow: spread wider and fade when character is airborne
          shadowRx    = 0.38 + air * 0.12;
          shadowAlpha = 0.40 - air * 0.22;
        } else {
          // Idle breathing — each player has a different phase so they don't sync
          const phaseOffset = p.colorIndex * 1.3 + (p.x * 0.17 + p.y * 0.11);
          const breath = Math.sin((now / 2200) * Math.PI * 2 + phaseOffset);
          // Gentle inhale/exhale: slightly taller and narrower along local spine
          scaleY = 1 + breath * 0.025;
          scaleX = 1 - breath * 0.012;
          // No screen-space bobOffset during breathing: it would fight the local-space
          // horizontal scale when facing left/right, making the effect look vertical.
          bobOffset = 0;
        }

        // Hit reaction: single strong stretch-then-return along the spine,
        // triggered each time the player loses HP. Overrides walk/breathe scale.
        const hitIntensity = Animations.getHitScale(p.id, now);
        if (hitIntensity > 0) {
          scaleY = 1 + hitIntensity * 0.5;   // strong stretch along spine
          scaleX = 1 - hitIntensity * 0.38;  // strong squash across
          bobOffset = 0;
        }
        // ─────────────────────────────────────────────────────────────────────

        // Ground shadow (always at floor level, unaffected by bob)
        ctx.beginPath();
        ctx.ellipse(cx, s.y + cs * 0.92, cs * shadowRx, cs * 0.09, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
        ctx.fill();

        // Colored border FIRST so sprite draws on top of it
        ctx.strokeStyle = color;
        ctx.lineWidth = bw;
        ctx.strokeRect(s.x + bw / 2, s.y + bw / 2, cs - bw, cs - bw);

        // Extra white border for active turn (also under sprite)
        if (isActive) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1, bw - 1);
          ctx.strokeRect(s.x + bw + 1, s.y + bw + 1, cs - bw * 2 - 2, cs - bw * 2 - 2);
        }

        // Player sprite: deformation anchored at feet (local bottom of sprite)
        // so feet stay fixed and the head absorbs squash/stretch/breathing.
        // bobOffset lifts the whole character off the ground in screen space (hop arc).
        const halfH = cs / 2 - 1;
        ctx.save();
        if (isActive) { ctx.shadowColor = '#fff'; ctx.shadowBlur = cs * 0.3; }
        ctx.translate(cx, cy + bobOffset); // screen-space position + hop
        ctx.rotate(angle);                 // face direction
        ctx.translate(0, halfH);           // move origin to feet in local space
        ctx.scale(scaleX, scaleY);         // squash/stretch around feet
        // Image bottom at local y=0 (feet), top at -(cs-2), centred horizontally
        // Non-Bob characters are drawn 20% larger (sprite sheets are smaller)
        const charSprite = sprites[p.character] || sprites['player'];
        const spriteScale = (p.character && p.character !== 'player') ? 1.2 : 1;
        const sw = (cs - 2) * spriteScale;
        ctx.drawImage(charSprite, -sw / 2, -sw, sw, sw);
        ctx.restore();

        // Name initial badge — bobs with the sprite
        const fontSize = Math.max(7, Math.round(cs * 0.24));
        const bx = s.x + cs - fontSize * 0.75;
        const by = s.y + fontSize * 0.75 + bobOffset * 0.6;
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
      let fillColor, strokeColor = null, strokeWidth = 2;

      if (h.type === 'reachable') {
        fillColor = 'rgba(78, 205, 196, 0.45)';
        strokeColor = 'rgba(78, 205, 196, 0.6)';
        strokeWidth = 1;
      } else if (h.type === 'path-preview') {
        fillColor = 'rgba(78, 205, 196, 0.65)';
        strokeColor = 'rgba(120, 240, 230, 0.9)';
        strokeWidth = 2;
      } else if (h.type === 'range') {
        fillColor = 'rgba(255, 230, 109, 0.35)';
        strokeColor = 'rgba(255, 220, 80, 0.5)';
        strokeWidth = 1;
      } else if (h.type === 'select-green') {
        fillColor = 'rgba(80, 220, 100, 0.55)';
        strokeColor = '#4adc60';
        strokeWidth = 3;
      } else if (h.type === 'select-red') {
        fillColor = 'rgba(220, 60, 60, 0.55)';
        strokeColor = '#dc4040';
        strokeWidth = 3;
      } else if (h.type === 'aoe-preview') {
        fillColor = 'rgba(255, 107, 53, 0.4)';
        strokeColor = 'rgba(255, 130, 60, 0.6)';
        strokeWidth = 1;
      } else {
        continue;
      }

      ctx.fillStyle = fillColor;
      ctx.fillRect(s.x, s.y, cs, cs);

      if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect(s.x + strokeWidth / 2, s.y + strokeWidth / 2, cs - strokeWidth, cs - strokeWidth);
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

  function drawDeathAnimations() {
    const ids = Animations.getDeathAnimIds();
    if (!ids.length || !spritesReady) return;
    const now = performance.now();
    const { cellSize, zoom } = Camera.getTransform();
    const cs = cellSize * zoom;

    for (const id of ids) {
      const d = Animations.getDeathAnimState(id, now);
      if (!d) continue;
      const s = Camera.gridToScreen(d.x, d.y);
      const cx = s.x + cs * 0.5;
      const cy = s.y + cs * 0.5;
      const spriteScale = (d.character && d.character !== 'player') ? 1.2 : 1.0;
      const drawSize = (cs - 2) * d.scale * spriteScale;
      if (drawSize <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, d.alpha);
      ctx.translate(cx, cy + d.offsetY * cs);
      ctx.rotate(d.rotation);
      const charSprite = sprites[d.character] || sprites['player'];
      ctx.drawImage(charSprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      ctx.restore();
    }
  }

  function render(state, highlights) {
    if (!state) return;
    clear();
    drawGrid(state);
    drawHighlights(highlights);
    drawWalls(state);
    drawBombs(state);
    drawBonuses(state);
    drawPlayers(state);
    Animations.update(performance.now());
    Animations.draw(ctx, Camera);
    drawDeathAnimations();
  }

  return { init, render, resize };
})();
