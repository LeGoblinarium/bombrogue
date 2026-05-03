const C = require('./constants');
const GridMap = require('./GridMap');
const Player = require('./Player');
const { computeWalls } = require('./BombWallEngine');

class GameState {
  constructor(roomPlayers) {
    this.gridMap = new GridMap();
    this.players = [];
    this.bombs = [];
    this.bonuses = [];
    this.walls = [];
    this.wallCellMap = new Map();

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

  serializeDelta(currentTurn) {
    return {
      players: this.players.map(p => p.serialize()),
      bombs: this.bombs.map(b => b.serialize()),
      bonuses: this.bonuses.map(b => b.serialize()),
      obstacles: this.gridMap.getObstacles(),
      walls: this.walls.map(w => ({
        cells: w.cells,
        ownerId: w.ownerId,
        damage: w.damage,
        compSize: w.compSize,
      })),
      currentTurn,
    };
  }
}

module.exports = GameState;
