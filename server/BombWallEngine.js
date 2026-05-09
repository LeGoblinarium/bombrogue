const C = require('./constants');

function computeWalls(bombs, gridMap) {
  // Group by owner
  const byOwner = new Map();
  for (const b of bombs) {
    if (!byOwner.has(b.ownerId)) byOwner.set(b.ownerId, []);
    byOwner.get(b.ownerId).push(b);
  }

  const allWalls = [];
  // Full component map: bombId → [bomb objects in connected component].
  // Includes lone bombs (component = [self]) so doDetonate can skip getConnectedBombIds.
  const globalCompByBomb = new Map();

  for (const [ownerId, ownerBombs] of byOwner) {
    if (ownerBombs.length < 2) {
      // Single bomb for this owner — its component is just itself
      globalCompByBomb.set(ownerBombs[0].id, ownerBombs);
      continue;
    }

    // Build edges: pairs that form a valid wall (1-6 cells gap, no obstacle in between)
    const edges = [];
    for (let i = 0; i < ownerBombs.length; i++) {
      for (let j = i + 1; j < ownerBombs.length; j++) {
        const a = ownerBombs[i], b = ownerBombs[j];
        const wall = checkWallPair(a, b, gridMap);
        if (wall) edges.push({ a, b, cells: wall });
      }
    }

    // Find connected components
    const components = findConnectedComponents(ownerBombs, edges);

    // Merge into global map
    for (const [bombId, comp] of components) {
      globalCompByBomb.set(bombId, comp);
    }

    // For each edge, determine wall cells & damage based on its component size
    for (const edge of edges) {
      const comp = components.get(edge.a.id);
      const compSize = comp.length;
      const baseDamage = compSize >= 3 ? C.DMG_WALL_3PLUS : C.DMG_WALL_2;
      const avgAge = comp.reduce((s, b) => s + b.age, 0) / compSize;
      const multiplier = 1.0 + Math.min(avgAge * C.AGE_BONUS_PER_TURN, C.AGE_MAX * C.AGE_BONUS_PER_TURN);
      const damage = Math.round(baseDamage * multiplier);

      allWalls.push({
        cells: edge.cells,
        ownerId,
        damage,
        bombIds: [edge.a.id, edge.b.id],
        compSize,
        avgAge,
      });
    }
  }

  // Build wall cell map for quick lookup (cell -> highest damage wall on it)
  const wallCellMap = new Map();
  for (const wall of allWalls) {
    for (const cell of wall.cells) {
      const key = `${cell.x},${cell.y}`;
      const existing = wallCellMap.get(key);
      if (!existing || wall.damage > existing.damage) {
        wallCellMap.set(key, {
          x: cell.x, y: cell.y,
          ownerId: wall.ownerId,
          damage: wall.damage,
        });
      }
    }
  }

  return { walls: allWalls, wallCellMap, compByBomb: globalCompByBomb };
}

function checkWallPair(a, b, gridMap) {
  // Walls form through obstacles: obstacle cells are simply skipped in the
  // damage-cell list (players can never stand on them anyway).

  // Same row?
  if (a.y === b.y) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const gap = maxX - minX - 1;
    if (gap < 1 || gap > C.WALL_MAX_GAP) return null;
    const cells = [];
    for (let x = minX + 1; x < maxX; x++) {
      if (!gridMap.isObstacle(x, a.y)) cells.push({ x, y: a.y });
    }
    return cells;
  }
  // Same column?
  if (a.x === b.x) {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const gap = maxY - minY - 1;
    if (gap < 1 || gap > C.WALL_MAX_GAP) return null;
    const cells = [];
    for (let y = minY + 1; y < maxY; y++) {
      if (!gridMap.isObstacle(a.x, y)) cells.push({ x: a.x, y });
    }
    return cells;
  }
  return null;
}

function findConnectedComponents(bombs, edges) {
  // Union-Find
  const parent = new Map();
  bombs.forEach(b => parent.set(b.id, b.id));

  function find(id) {
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
    return parent.get(id);
  }

  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const e of edges) union(e.a.id, e.b.id);

  // Group bombs by root
  const groups = new Map();
  for (const b of bombs) {
    const r = find(b.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(b);
  }

  // Map bomb.id -> its component (array of bombs)
  const compByBomb = new Map();
  for (const [, group] of groups) {
    for (const b of group) compByBomb.set(b.id, group);
  }
  return compByBomb;
}

module.exports = { computeWalls };
