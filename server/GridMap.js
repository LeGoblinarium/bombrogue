const C = require('./constants');

// Default number of obstacles
const OBSTACLE_COUNT_DEFAULT = 30;

class GridMap {
  constructor(obstacleCount) {
    this.width  = C.GRID_W;
    this.height = C.GRID_H;

    const count = (obstacleCount != null) ? obstacleCount : OBSTACLE_COUNT_DEFAULT;

    // 1. Generate 4 random spawn points, each at least 12 Manhattan distance apart
    this._spawns = this._generateSpawns(4, 12);

    // 2. Generate obstacles, none within 3 cells (Manhattan) of any spawn
    const obstacleList = this._generateObstacles(count, 3);
    this.obstacleSet = new Set(obstacleList.map(o => `${o.x},${o.y}`));
  }

  // ── Spawn generation ─────────────────────────────────────────────────────────
  _generateSpawns(count, minDist) {
    const spawns = [];
    const MARGIN = 1; // keep spawns off the very edge
    const MAX_ATTEMPTS = 20000;

    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const x = MARGIN + Math.floor(Math.random() * (this.width  - MARGIN * 2));
        const y = MARGIN + Math.floor(Math.random() * (this.height - MARGIN * 2));

        // Must be at least minDist Manhattan distance from every already-placed spawn
        const tooClose = spawns.some(
          s => Math.abs(s.x - x) + Math.abs(s.y - y) < minDist
        );
        if (!tooClose) {
          spawns.push({ x, y });
          placed = true;
          break;
        }
      }

      if (!placed) {
        // Fallback: corners (should only happen if minDist is too large for the grid)
        const fallbacks = [
          { x: 1, y: 1 }, { x: 18, y: 18 },
          { x: 18, y: 1 }, { x: 1,  y: 18 },
        ];
        spawns.push(fallbacks[i] || { x: 1, y: 1 });
      }
    }
    return spawns;
  }

  // ── Obstacle generation ───────────────────────────────────────────────────────
  _generateObstacles(count, minDistFromSpawn) {
    const obstacles = [];
    const obstacleKeys = new Set();
    const spawnKeys    = new Set(this._spawns.map(s => `${s.x},${s.y}`));
    const MAX_ATTEMPTS = 10000;

    let placed = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && placed < count; attempt++) {
      // Keep obstacles off the border row/col so they don't hug walls
      const x = 1 + Math.floor(Math.random() * (this.width  - 2));
      const y = 1 + Math.floor(Math.random() * (this.height - 2));
      const key = `${x},${y}`;

      if (obstacleKeys.has(key)) continue; // already an obstacle here
      if (spawnKeys.has(key))    continue; // would overlap a spawn

      // Must be at least minDistFromSpawn Manhattan distance from every spawn
      const tooClose = this._spawns.some(
        s => Math.abs(s.x - x) + Math.abs(s.y - y) < minDistFromSpawn
      );
      if (tooClose) continue;

      obstacles.push({ x, y });
      obstacleKeys.add(key);
      placed++;
    }
    return obstacles;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  getObstacles() {
    return Array.from(this.obstacleSet).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
  }

  getSpawn(index) {
    return this._spawns[index] || { x: 1, y: 1 };
  }

  removeObstacle(x, y) {
    this.obstacleSet.delete(`${x},${y}`);
  }

  isObstacle(x, y) {
    return this.obstacleSet.has(`${x},${y}`);
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  // Returns true if no obstacle, bomb, or other alive player blocks the path
  // from (x1,y1) to (x2,y2). Only intermediate cells (not source/target) are checked.
  hasLineOfSight(x1, y1, x2, y2, bombs, players, selfId) {
    if (x1 === x2 && y1 === y2) return true;
    const dx = x2 - x1, dy = y2 - y1;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps <= 1) return true; // no intermediate cells
    // Build sets once to avoid O(n) scan per intermediate cell
    const bombSet = new Set(bombs.map(b => `${b.x},${b.y}`));
    const playerSet = new Set(
      players.filter(p => p.alive && p.id !== selfId).map(p => `${p.x},${p.y}`)
    );
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.round(x1 + dx * t);
      const cy = Math.round(y1 + dy * t);
      if (this.isObstacle(cx, cy)) return false;
      const key = `${cx},${cy}`;
      if (bombSet.has(key)) return false;
      if (playerSet.has(key)) return false;
    }
    return true;
  }

  computeReachable(startX, startY, pm, bombs, players, ignorePlayerId) {
    const visited = new Map();
    // Pre-build occupancy set to avoid O(n) scan per BFS neighbour
    const occupied = new Set(bombs.map(b => `${b.x},${b.y}`));
    for (const p of players) {
      if (p.alive && p.id !== ignorePlayerId) occupied.add(`${p.x},${p.y}`);
    }
    const queue = [{ x: startX, y: startY, dist: 0, path: [] }];
    visited.set(`${startX},${startY}`, { dist: 0, path: [] });

    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      if (cur.dist >= pm) continue;

      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (this.isObstacle(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (occupied.has(key)) continue;
        const newPath = [...cur.path, { x: nx, y: ny }];
        visited.set(key, { dist: cur.dist + 1, path: newPath });
        queue.push({ x: nx, y: ny, dist: cur.dist + 1, path: newPath });
      }
    }
    return visited;
  }

  shortestPath(startX, startY, endX, endY, pm, bombs, players, ignorePlayerId) {
    const reachable = this.computeReachable(startX, startY, pm, bombs, players, ignorePlayerId);
    const data = reachable.get(`${endX},${endY}`);
    if (!data) return null;
    return data;
  }
}

module.exports = GridMap;
