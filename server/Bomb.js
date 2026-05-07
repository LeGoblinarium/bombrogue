const C = require('./constants');

let nextId = 1;

class Bomb {
  constructor(ownerId, x, y) {
    this.id = `b${nextId++}`;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.age = 0;
    this.previousPosition = null;
    this.placedOnTurn = null; // turn number when placed — used for detonation delay
  }

  ageTick() {
    if (this.age < C.AGE_MAX) this.age++;
  }

  moveTo(x, y) {
    this.previousPosition = { x: this.x, y: this.y };
    this.x = x;
    this.y = y;
  }

  getMultiplier() {
    return 1.0 + Math.min(this.age * C.AGE_BONUS_PER_TURN, C.AGE_MAX * C.AGE_BONUS_PER_TURN);
  }

  serialize() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      age: this.age,
      previousPosition: this.previousPosition,
      placedOnTurn: this.placedOnTurn,
    };
  }
}

module.exports = Bomb;
