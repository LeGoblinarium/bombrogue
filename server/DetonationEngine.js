const C = require('./constants');

/**
 * Compute explosion AoE cells for a bomb.
 *
 * destroyedInChain: Set of "x,y" keys for obstacles already destroyed by earlier
 * steps in this same chain — rays pass through them freely.
 *
 * When a ray hits an intact obstacle it is added to destroyedInChain, the obstacle
 * cell is included in the returned cells (for visual), and the ray stops there.
 */
function getAoeCells(centerX, centerY, gridMap, destroyedInChain) {
  const cells = [{ x: centerX, y: centerY }];

  const directions = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];

  for (const dir of directions) {
    for (let dist = 1; dist <= 2; dist++) {
      const x = centerX + dir.dx * dist;
      const y = centerY + dir.dy * dist;
      if (!gridMap.inBounds(x, y)) break;

      const key = `${x},${y}`;
      const isIntactObstacle = gridMap.isObstacle(x, y) && !destroyedInChain.has(key);

      if (isIntactObstacle) {
        // Explosion hits the obstacle: destroy it, include cell for visual, stop ray
        destroyedInChain.add(key);
        cells.push({ x, y, destroyedObstacle: true });
        break;
      }
      cells.push({ x, y });
    }
  }

  // Diagonals, range 1
  for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const x = centerX + dx, y = centerY + dy;
    if (!gridMap.inBounds(x, y)) continue;
    const key = `${x},${y}`;
    const isIntactObstacle = gridMap.isObstacle(x, y) && !destroyedInChain.has(key);
    if (isIntactObstacle) {
      destroyedInChain.add(key);
      cells.push({ x, y, destroyedObstacle: true });
      continue;
    }
    cells.push({ x, y });
  }

  return cells;
}

/**
 * seedBombIds: array of bomb IDs to start the chain with.
 * These are the explicitly triggered bombs; chain reactions can add others.
 */
function resolveDetonation(seedBombIds, bombs, players, gridMap) {
  const detonated = new Set();
  const queue = [];
  const sequence = [];

  // Obstacles destroyed across the whole chain (passed through by later steps)
  const destroyedInChain = new Set();

  // Seed with the specified bombs
  const seedSet = new Set(seedBombIds);
  for (const b of bombs) {
    if (seedSet.has(b.id)) {
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
      const aoe = getAoeCells(bomb.x, bomb.y, gridMap, destroyedInChain);
      const damage = Math.round(C.DMG_EXPLOSION * bomb.getMultiplier());

      const hits = [];
      const chained = [];

      for (const cell of aoe) {
        if (cell.destroyedObstacle) continue; // no player damage on obstacle cells

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

  // Convert destroyed obstacle keys to {x, y} objects
  const destroyedObstacles = Array.from(destroyedInChain).map(key => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });

  return {
    sequence,
    detonatedIds: Array.from(detonated),
    damageByPlayer,
    destroyedObstacles,
  };
}

module.exports = { resolveDetonation, getAoeCells };
