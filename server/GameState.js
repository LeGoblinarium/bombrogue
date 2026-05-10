const C = require('./constants');
const GridMap = require('./GridMap');
const Player = require('./Player');
const { computeWalls } = require('./BombWallEngine');

class GameState {
  constructor(roomPlayers, obstacleCount) {
    this.gridMap = new GridMap(obstacleCount, roomPlayers.length);
    this.players = [];
    this.bombs = [];
    this.bonuses = [];
    this.walls = [];
    this.wallCellMap = new Map();
    this.bombCompMap = new Map(); // bombId → component (array of bomb objects)

    let i = 0;
    for (const p of roomPlayers) {
      const spawn = this.gridMap.getSpawn(i);
      this.players.push(new Player(p.id, p.name, p.colorIndex, p.pa, p.pm, spawn.x, spawn.y, p.character || 'player'));
      i++;
    }
  }

  recomputeWalls() {
    const result = computeWalls(this.bombs, this.gridMap);
    this.walls = result.walls;
    this.wallCellMap = result.wallCellMap;
    this.bombCompMap = result.compByBomb;
  }

  serializeFull(currentTurn) {
    return {
      grid: { width: this.gridMap.width, height: this.gridMap.height },
      obstacles: this.gridMap.getObstacles(),
      players: this.players.map(p => p.serialize()),
      bombs: this.bombs.map(b => b.serialize()),
      bonuses: this.bonuses.map(b => b.serialize()),
      walls: this.walls.map(w => ({
        cells: w.cells,
        ownerId: w.ownerId,
        damage: w.damage,
        compSize: w.compSize,
      })),
      currentTurn,
    };
  }

  // omit: object whose truthy keys are excluded from the delta.
  // Callers pass only what actually changed, e.g. { obstacles: true, bonuses: true }
  // to skip those sections. Defaults to sending everything.
  serializeDelta(currentTurn, omit = {}) {
    const delta = { currentTurn };
    if (!omit.players)   delta.players   = this.players.map(p => p.serialize());
    if (!omit.bombs)     delta.bombs     = this.bombs.map(b => b.serialize());
    if (!omit.bonuses)   delta.bonuses   = this.bonuses.map(b => b.serialize());
    if (!omit.obstacles) delta.obstacles = this.gridMap.getObstacles();
    if (!omit.walls)     delta.walls     = this.walls.map(w => ({
      cells: w.cells, ownerId: w.ownerId, damage: w.damage, compSize: w.compSize,
    }));
    return delta;
  }
}

module.exports = GameState;
