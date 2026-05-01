const C = require('./constants');

function getAoeCells(centerX, centerY, gridMap) {
  // AoE circulaire : portée 2 en ligne droite, 1 en diagonale
  // Pattern : losange/diamant sans le centre (le centre = bombe elle-même)
  const cells = [{ x: centerX, y: centerY }];
  const offsets = [
    // Cardinal directions, range 2 (blocked by obstacles)
    [0, -1], [0, -2],
    [0, 1], [0, 2],
    [-1, 0], [-2, 0],
    [1, 0], [2, 0],
    // Diagonals, range 1
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];

  // Cardinal: must walk through cells, blocked by obstacles
  const directions = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];

  for (const dir of directions) {
    for (let dist = 1; dist <= 2; dist++) {
      const x = centerX + dir.dx * dist;
      const y = centerY + dir.dy * dist;
      if (!gridMap.inBounds(x, y)) break;
      if (gridMap.isObstacle(x, y)) break;
      cells.push({ x, y });
    }
  }

  // Diagonals, range 1 (blocked individually)
  for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const x = centerX + dx, y = centerY + dy;
    if (!gridMap.inBounds(x, y)) continue;
    if (gridMap.isObstacle(x, y)) continue;
    cells.push({ x, y });
  }

  return cells;
}

function resolveDetonation(triggerPlayerId, bombs, players, gridMap) {
  const detonated = new Set();
  const queue = [];
  const sequence = [];

  // Seed with triggering player's bombs
  for (const b of bombs) {
    if (b.ownerId === triggerPlayerId) {
      queue.push({ bomb: b, step: 0 });
      detonated.add(b.id);
    }
  }

  while (queue.length > 0) {
    queue.sort((a, b) => a.step - b.step);
    const currentStep = queue[0].step;
    const batch = [];
    while (queue.length > 0 && queue[0].step === currentStep) {
      batch.push(queue.shift());
    }

    for (const { bomb, step } of batch) {
      const aoe = getAoeCells(bomb.x, bomb.y, gridMap);
      const damage = Math.round(C.DMG_EXPLOSION * bomb.getMultiplier());

      const hits = [];
      const chained = [];

      for (const cell of aoe) {
        // Players hit
        for (const p of players) {
          if (p.alive && p.x === cell.x && p.y === cell.y) {
            hits.push({ playerId: p.id, x: cell.x, y: cell.y, damage });
          }
        }
        // Other bombs chained
        for (const ob of bombs) {
          if (ob.id !== bomb.id && !detonated.has(ob.id) && ob.x === cell.x && ob.y === cell.y) {
            chained.push(ob);
            detonated.add(ob.id);
          }
        }
      }

      sequence.push({
        step,
        bombId: bomb.id,
        x: bomb.x,
        y: bomb.y,
        aoe,
        hits,
      });

      for (const c of chained) {
        queue.push({ bomb: c, step: step + 1 });
      }
    }
  }

  // Accumulate damage by player
  const damageByPlayer = new Map();
  for (const ev of sequence) {
    for (const hit of ev.hits) {
      damageByPlayer.set(hit.playerId, (damageByPlayer.get(hit.playerId) || 0) + hit.damage);
    }
  }

  // Apply damage
  for (const [pid, dmg] of damageByPlayer) {
    const p = players.find(pp => pp.id === pid);
    if (p) p.takeDamage(dmg);
  }

  return {
    sequence,
    detonatedIds: Array.from(detonated),
    damageByPlayer,
  };
}

module.exports = { resolveDetonation, getAoeCells };
