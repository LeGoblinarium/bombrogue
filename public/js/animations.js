const Animations = (() => {
  let active = [];

  // Entity sliding animations: id -> animation data
  const entityMovements = new Map();
  const MS_PER_CELL = 180;

  // Persistent facing angles per player (survives after animation ends)
  // Angle in radians: 0 = south (default sprite), π/2 = east, π = north, -π/2 = west
  const playerFacing = new Map();

  function add(type, params) {
    active.push({
      type,
      startTime: performance.now(),
      ...params,
    });
  }

  function addExplosionSequence(sequence) {
    sequence.forEach(step => {
      step.forEach(event => {
        add('explosion', {
          x: event.x,
          y: event.y,
          aoe: event.aoe,
          delay: event.step * 400,
          duration: 600,
        });
        if (event.hits) {
          event.hits.forEach(hit => {
            add('damage', {
              x: hit.x,
              y: hit.y,
              amount: hit.damage,
              delay: event.step * 400 + 200,
              duration: 800,
            });
          });
        }
      });
    });
  }

  function addDamageNumber(gx, gy, amount) {
    add('damage', {
      x: gx,
      y: gy,
      amount,
      delay: 0,
      duration: 800,
    });
  }

  function addEntityMovement(id, type, path) {
    if (!path || path.length < 2) return;
    entityMovements.set(id, {
      id, type, path,
      startTime: performance.now(),
      duration: (path.length - 1) * MS_PER_CELL,
    });
    // Store facing direction from last step of the path (persistent after anim)
    if (type === 'player') {
      const last = path[path.length - 1];
      const prev = path[path.length - 2];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      // Sprite default = facing south (down). Angles clockwise from south.
      let angle = 0;
      if      (dy > 0 && dx === 0) angle = 0;          // south
      else if (dy < 0 && dx === 0) angle = Math.PI;    // north
      else if (dx > 0 && dy === 0) angle = Math.PI / 2; // east
      else if (dx < 0 && dy === 0) angle = -Math.PI / 2; // west
      else if (dx > 0 && dy > 0)   angle = Math.PI / 4;  // SE
      else if (dx < 0 && dy > 0)   angle = -Math.PI / 4; // SW
      else if (dx > 0 && dy < 0)   angle = 3 * Math.PI / 4; // NE
      else if (dx < 0 && dy < 0)   angle = -3 * Math.PI / 4; // NW
      playerFacing.set(id, angle);
    }
  }

  // Returns the last facing angle for a player (radians), defaulting to 0 (south)
  function getPlayerFacing(id) {
    return playerFacing.has(id) ? playerFacing.get(id) : 0;
  }

  // Returns walk state for procedural character animation, or null when not moving.
  // cellPhase: 0→1 within the current cell hop (drives bob/squash).
  // currentAngle: facing direction right now (may differ from final facing during multi-step path).
  function getPlayerAnimState(id, now) {
    const anim = entityMovements.get(id);
    if (!anim || anim.type !== 'player') return null;
    const elapsed = now - anim.startTime;
    if (elapsed >= anim.duration) return null;

    const cellProgress = elapsed / MS_PER_CELL;
    const cellIdx = Math.min(Math.floor(cellProgress), anim.path.length - 2);
    const cellPhase = cellProgress - cellIdx; // 0..1 within current cell

    const from = anim.path[cellIdx];
    const to   = anim.path[cellIdx + 1];
    const dx = to.x - from.x, dy = to.y - from.y;
    let currentAngle = 0;
    if      (dy > 0 && dx === 0) currentAngle = 0;
    else if (dy < 0 && dx === 0) currentAngle = Math.PI;
    else if (dx > 0 && dy === 0) currentAngle = Math.PI / 2;
    else if (dx < 0 && dy === 0) currentAngle = -Math.PI / 2;

    return { cellPhase, currentAngle };
  }

  // Returns fractional grid position {x, y} during animation, or null when done
  function getEntityAnimPos(id, now) {
    const anim = entityMovements.get(id);
    if (!anim) return null;
    const elapsed = now - anim.startTime;
    if (elapsed >= anim.duration) {
      entityMovements.delete(id);
      return null;
    }
    const progress = elapsed / MS_PER_CELL;
    const cellIdx = Math.min(Math.floor(progress), anim.path.length - 2);
    const fraction = progress - cellIdx;
    const from = anim.path[cellIdx];
    const to = anim.path[cellIdx + 1];
    return {
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
    };
  }

  function update(now) {
    active = active.filter(a => {
      const elapsed = now - a.startTime - (a.delay || 0);
      return elapsed < a.duration;
    });
    for (const [id, anim] of entityMovements) {
      if (now - anim.startTime >= anim.duration) entityMovements.delete(id);
    }
  }

  function draw(ctx, cam) {
    const now = performance.now();

    for (const a of active) {
      const elapsed = now - a.startTime - (a.delay || 0);
      if (elapsed < 0) continue;
      const t = Math.min(1, elapsed / a.duration);

      if (a.type === 'explosion') {
        drawExplosion(ctx, cam, a, t);
      } else if (a.type === 'damage') {
        drawDamageNumber(ctx, cam, a, t);
      }
    }
  }

  function drawExplosion(ctx, cam, a, t) {
    if (!a.aoe) return;
    const alpha = 1 - t;
    const scale = 0.5 + t * 0.5;

    for (const cell of a.aoe) {
      const s = cam.gridToScreen(cell.x, cell.y);
      ctx.fillStyle = `rgba(255, 107, 53, ${alpha * 0.6})`;
      const shrink = (1 - scale) * s.size / 2;
      ctx.fillRect(s.x + shrink, s.y + shrink, s.size * scale, s.size * scale);
    }

    const center = cam.gridToScreen(a.x, a.y);
    const radius = center.size * (0.3 + t * 0.7);
    ctx.beginPath();
    ctx.arc(center.x + center.size / 2, center.y + center.size / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 200, 50, ${alpha * 0.8})`;
    ctx.fill();
  }

  function drawDamageNumber(ctx, cam, a, t) {
    const s = cam.gridToScreen(a.x, a.y);
    const alpha = 1 - t;
    const yOffset = -30 * t;

    ctx.save();
    ctx.font = `bold ${Math.round(14 * cam.getTransform().zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 70, 70, ${alpha})`;
    ctx.fillText(`-${a.amount}`, s.x + s.size / 2, s.y + yOffset);
    ctx.restore();
  }

  function hasActive() {
    return active.length > 0 || entityMovements.size > 0;
  }

  return { add, addExplosionSequence, addDamageNumber, addEntityMovement, getEntityAnimPos, getPlayerFacing, getPlayerAnimState, update, draw, hasActive };
})();
