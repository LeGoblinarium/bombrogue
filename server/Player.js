const C = require('./constants');

class Player {
  constructor(id, name, colorIndex, pa, pm, spawnX, spawnY) {
    this.id = id;
    this.name = name;
    this.colorIndex = colorIndex;
    this.pa = pa;
    this.pm = pm;
    this.paLeft = pa;
    this.pmLeft = pm;
    this.x = spawnX;
    this.y = spawnY;
    this.hp = C.START_HP;
    this.alive = true;
    this.cooldowns = {
      repulseur: 0,
      entourloupe: 0,
      stratageme: 0,
      liberation: 0,
    };
    this.usedThisTurn = {
      repulseur: false,
    };
    this.idleTurns = 0;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  startTurn() {
    this.paLeft = this.pa;
    this.pmLeft = this.pm;
    this.usedThisTurn.repulseur = false;
  }

  endTurn(actedThisTurn) {
    for (const k of Object.keys(this.cooldowns)) {
      if (this.cooldowns[k] > 0) this.cooldowns[k]--;
    }
    if (actedThisTurn) {
      this.idleTurns = 0;
    } else {
      this.idleTurns++;
    }
  }

  setCooldown(spellId) {
    if (spellId === 'entourloupe') this.cooldowns.entourloupe = C.CD_ENTOURLOUPE;
    else if (spellId === 'stratageme') this.cooldowns.stratageme = C.CD_STRATAGEME;
    else if (spellId === 'liberation') this.cooldowns.liberation = C.CD_LIBERATION;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      colorIndex: this.colorIndex,
      pa: this.pa,
      pm: this.pm,
      paLeft: this.paLeft,
      pmLeft: this.pmLeft,
      x: this.x,
      y: this.y,
      hp: this.hp,
      alive: this.alive,
      cooldowns: { ...this.cooldowns },
      usedThisTurn: { ...this.usedThisTurn },
    };
  }
}

module.exports = Player;
