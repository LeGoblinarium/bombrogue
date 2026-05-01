const C = require('./constants');

const OBSTACLES = [
  // Symmetric pattern on 20x20 grid
  // Pillars in 4-fold symmetry
  { x: 5, y: 5 }, { x: 14, y: 5 }, { x: 5, y: 14 }, { x: 14, y: 14 },
  { x: 5, y: 9 }, { x: 14, y: 9 }, { x: 5, y: 10 }, { x: 14, y: 10 },
  { x: 9, y: 5 }, { x: 10, y: 5 }, { x: 9, y: 14 }, { x: 10, y: 14 },
  { x: 8, y: 8 }, { x: 11, y: 8 }, { x: 8, y: 11 }, { x: 11, y: 11 },
  { x: 2, y: 7 }, { x: 17, y: 7 }, { x: 2, y: 12 }, { x: 17, y: 12 },
  { x: 7, y: 2 }, { x: 12, y: 2 }, { x: 7, y: 17 }, { x: 12, y: 17 },
];

const SPAWNS = [
  { x: 1, y: 1 },
  { x: 18, y: 18 },
  { x: 18, y: 1 },
  { x: 1, y: 18 },
];

class GridMap {
  constructor() {
    this.width = C.GRID_W;
    this.height = C.GRID_H;
    this.obstacleSet = new Set(OBSTACLES.map(o => `${o.x},${o.y}`));
  }

  getObstacles() {
    return OBSTACLES.map(o => ({ x: o.x, y: o.y }));
  }

  getSpawn(index) {
    return SPAWNS[index] || { x: 1, y: 1 };
  }

  isObstacle(x, y) {
    return this.obstacleSet.has(`${x},${y}`);
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  computeReachable(startX, startY, pm, bombs, players, ignorePlayerId) {
    const visited = new Map();
    const queue = [{ x: startX, y: startY, dist: 0, path: [] }];
    visited.set(`${startX},${startY}`, { dist: 0, path: [] });

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.dist >= pm) continue;

      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (this.isObstacle(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        if (bombs.some(b => b.x === nx && b.y === ny)) continue;
        if (players.some(p => p.alive && p.id !== ignorePlayerId && p.x === nx && p.y === ny)) continue;
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
