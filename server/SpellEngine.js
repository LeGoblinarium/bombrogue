const C = require('./constants');

function isCellOccupied(x, y, bombs, players, ignoreId, gridMap) {
  if (!gridMap.inBounds(x, y)) return true;
  if (gridMap.isObstacle(x, y)) return true;
  if (bombs.some(b => b.id !== ignoreId && b.x === x && b.y === y)) return true;
  if (players.some(p => p.alive && p.id !== ignoreId && p.x === x && p.y === y)) return true;
  return false;
}

function pushEntityInDirection(entity, dirX, dirY, distance, bombs, players, gridMap) {
  const fromX = entity.x, fromY = entity.y;
  let curX = entity.x;
  let curY = entity.y;
  let actuallyMoved = 0;
  const isPlayer = entity.hp !== undefined;
  const ignoreId = entity.id;
  const path = [{ x: fromX, y: fromY }];

  for (let i = 0; i < distance; i++) {
    const nx = curX + dirX;
    const ny = curY + dirY;
    if (isCellOccupied(nx, ny, bombs, players, ignoreId, gridMap)) break;
    curX = nx;
    curY = ny;
    actuallyMoved++;
    path.push({ x: curX, y: curY });
  }

  if (actuallyMoved > 0) {
    if (!isPlayer) {
      entity.previousPosition = { x: fromX, y: fromY };
    }
    entity.x = curX;
    entity.y = curY;
    return { moved: true, path };
  }
  return { moved: false, path };
}

// Repulseur : centered on target cell, pushes everything in a 3-cell radius outward
function castRepulseur(caster, targetX, targetY, bombs, players, gridMap) {
  if (caster.x !== targetX && caster.y !== targetY) return { ok: false, error: 'Pas en ligne droite' };
  const md = Math.abs(targetX - caster.x) + Math.abs(targetY - caster.y);
  if (md > C.REPULSEUR_RANGE + (caster.rangeBonus || 0)) return { ok: false, error: 'Hors portée' };
  if (caster.paLeft < C.COST_REPULSEUR) return { ok: false, error: 'PA insuffisant' };
  if (caster.usedThisTurn.repulseur) return { ok: false, error: 'Déjà utilisé ce tour' };

  const targets = [];
  for (const b of bombs) {
    const dx = b.x - targetX;
    const dy = b.y - targetY;
    if (dx !== 0 && dy !== 0) continue;
    if (dx === 0 && dy === 0) continue;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 3) continue;
    targets.push({ entity: b, dx, dy, dist });
  }
  for (const p of players) {
    if (!p.alive) continue;
    if (p.id === caster.id) continue;
    const dx = p.x - targetX;
    const dy = p.y - targetY;
    if (dx !== 0 && dy !== 0) continue;
    if (dx === 0 && dy === 0) continue;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 3) continue;
    targets.push({ entity: p, dx, dy, dist });
  }

  targets.sort((a, b) => b.dist - a.dist);

  const movements = [];
  for (const t of targets) {
    const pushDist = C.REPULSEUR_PUSH[t.dist];
    if (!pushDist) continue;
    const dirX = Math.sign(t.dx);
    const dirY = Math.sign(t.dy);
    const result = pushEntityInDirection(t.entity, dirX, dirY, pushDist, bombs, players, gridMap);
    if (result.moved) {
      movements.push({
        id: t.entity.id,
        type: t.entity.hp !== undefined ? 'player' : 'bomb',
        path: result.path,
      });
    }
  }

  caster.paLeft -= C.COST_REPULSEUR;
  caster.usedThisTurn.repulseur = true;
  return { ok: true, movements };
}

// Entourloupe : swap caster's position with one of caster's bombs
function castEntourloupe(caster, targetX, targetY, bombs, players, gridMap) {
  if (caster.paLeft < C.COST_ENTOURLOUPE) return { ok: false, error: 'PA insuffisant' };
  if (caster.cooldowns.entourloupe > 0) return { ok: false, error: 'En cooldown' };
  const md = Math.abs(targetX - caster.x) + Math.abs(targetY - caster.y);
  if (md < 1 || md > C.ENTOURLOUPE_RANGE + (caster.rangeBonus || 0)) return { ok: false, error: 'Hors portée' };

  const bomb = bombs.find(b => b.x === targetX && b.y === targetY && b.ownerId === caster.id);
  if (!bomb) return { ok: false, error: 'Pas de bombe à toi sur cette case' };

  const casterFrom = { x: caster.x, y: caster.y };
  const bombFrom = { x: bomb.x, y: bomb.y };

  bomb.previousPosition = { x: bomb.x, y: bomb.y };
  caster.x = bomb.x;
  caster.y = bomb.y;
  bomb.x = casterFrom.x;
  bomb.y = casterFrom.y;

  caster.paLeft -= C.COST_ENTOURLOUPE;
  caster.cooldowns.entourloupe = C.CD_ENTOURLOUPE;

  return { ok: true, movements: [
    { id: caster.id, type: 'player', path: [casterFrom, { x: caster.x, y: caster.y }] },
    { id: bomb.id, type: 'bomb', path: [bombFrom, { x: bomb.x, y: bomb.y }] },
  ]};
}

// Stratagème : teleport bomb to its previous position
function castStratageme(caster, targetX, targetY, bombs, players, gridMap) {
  if (caster.paLeft < C.COST_STRATAGEME) return { ok: false, error: 'PA insuffisant' };
  if (caster.cooldowns.stratageme > 0) return { ok: false, error: 'En cooldown' };
  const md = Math.abs(targetX - caster.x) + Math.abs(targetY - caster.y);
  if (md < 1 || md > C.STRATAGEME_RANGE + (caster.rangeBonus || 0)) return { ok: false, error: 'Hors portée' };

  const bomb = bombs.find(b => b.x === targetX && b.y === targetY);
  if (!bomb) return { ok: false, error: 'Pas de bombe ici' };
  if (!bomb.previousPosition) return { ok: false, error: 'Pas de position précédente' };
  const prev = bomb.previousPosition;
  if (isCellOccupied(prev.x, prev.y, bombs, players, bomb.id, gridMap)) {
    return { ok: false, error: 'Position précédente occupée' };
  }

  const bombFrom = { x: bomb.x, y: bomb.y };
  bomb.previousPosition = { x: bomb.x, y: bomb.y };
  bomb.x = prev.x;
  bomb.y = prev.y;

  caster.paLeft -= C.COST_STRATAGEME;
  caster.cooldowns.stratageme = C.CD_STRATAGEME;

  return { ok: true, movements: [
    { id: bomb.id, type: 'bomb', path: [bombFrom, { x: bomb.x, y: bomb.y }] },
  ]};
}

// Libération : push all adjacent (CàC) bombs and entities 3 cells away from caster, on self only
function castLiberation(caster, bombs, players, gridMap) {
  if (caster.paLeft < C.COST_LIBERATION) return { ok: false, error: 'PA insuffisant' };
  if (caster.cooldowns.liberation > 0) return { ok: false, error: 'En cooldown' };

  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  const movements = [];

  for (const [dx, dy] of dirs) {
    const nx = caster.x + dx;
    const ny = caster.y + dy;
    const bomb = bombs.find(b => b.x === nx && b.y === ny);
    if (bomb) {
      const result = pushEntityInDirection(bomb, dx, dy, C.LIBERATION_PUSH, bombs, players, gridMap);
      if (result.moved) movements.push({ id: bomb.id, type: 'bomb', path: result.path });
      continue;
    }
    const player = players.find(p => p.alive && p.id !== caster.id && p.x === nx && p.y === ny);
    if (player) {
      const result = pushEntityInDirection(player, dx, dy, C.LIBERATION_PUSH, bombs, players, gridMap);
      if (result.moved) movements.push({ id: player.id, type: 'player', path: result.path });
    }
  }

  caster.paLeft -= C.COST_LIBERATION;
  caster.cooldowns.liberation = C.CD_LIBERATION;
  return { ok: true, movements };
}

// Aimant : pull bombs and players toward target cell along cardinal axes
function castAimant(caster, targetX, targetY, bombs, players, gridMap) {
  if (caster.paLeft < C.COST_AIMANT) return { ok: false, error: 'PA insuffisant' };
  const md = Math.abs(targetX - caster.x) + Math.abs(targetY - caster.y);
  if (md > C.AIMANT_RANGE + (caster.rangeBonus || 0)) return { ok: false, error: 'Hors portée' };

  const candidates = [];

  for (const b of bombs) {
    const dx = targetX - b.x;
    const dy = targetY - b.y;
    if (dx !== 0 && dy !== 0) continue;
    if (dx === 0 && dy === 0) continue;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 8) continue;
    candidates.push({ entity: b, dx, dy, dist });
  }

  for (const p of players) {
    if (!p.alive) continue;
    if (p.id === caster.id) continue;
    const dx = targetX - p.x;
    const dy = targetY - p.y;
    if (dx !== 0 && dy !== 0) continue;
    if (dx === 0 && dy === 0) continue;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist > 8) continue;
    candidates.push({ entity: p, dx, dy, dist });
  }

  candidates.sort((a, b) => a.dist - b.dist);

  const movements = [];
  for (const c of candidates) {
    const dirX = Math.sign(c.dx);
    const dirY = Math.sign(c.dy);
    const pullDist = Math.min(C.AIMANT_PULL, c.dist - 1);
    if (pullDist <= 0) continue;
    const result = pushEntityInDirection(c.entity, dirX, dirY, pullDist, bombs, players, gridMap);
    if (result.moved) {
      movements.push({
        id: c.entity.id,
        type: c.entity.hp !== undefined ? 'player' : 'bomb',
        path: result.path,
      });
    }
  }

  caster.paLeft -= C.COST_AIMANT;
  return { ok: true, movements };
}

module.exports = {
  castRepulseur,
  castEntourloupe,
  castStratageme,
  castLiberation,
  castAimant,
};
