let _nextId = 1;

class Bonus {
  constructor(type, x, y) {
    this.id = `bonus-${_nextId++}`;
    this.type = type;
    this.x = x;
    this.y = y;
  }

  serialize() {
    return { id: this.id, type: this.type, x: this.x, y: this.y };
  }
}

module.exports = Bonus;
