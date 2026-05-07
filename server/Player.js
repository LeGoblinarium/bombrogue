const C = require('./constants');

class Player {
  constructor(id, name, colorIndex, pa, pm, spawnX, spawnY, character = 'player') {
    this.id = id;
    this.name = name;
    this.colorIndex = colorIndex;
    this.character = character;
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
    this.maxBombs = C.MAX_BOMBS_PER_PLAYER;
    this.rangeBonus = 0;
    this.explosionRange = C.EXPLOSION_RANGE;
    // Cells where this player already took instant wall-formation damage.
    // Cleared at the start of their own turn so they take damage again if they stay.
    this.wallImmuneCells = new Set();
    // Per-game statistics
    this.stats = { damageDealt: 0, damageReceived: 0, bombsPlaced: 0, spellsUsed: 0 };
  }

  takeDamage(amount) {
    const actual = Math.min(amount, this.hp);
    this.stats.damageReceived += actual;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return actual; // callers can attribute this to an attacker
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

  applyBonus(type) {
    switch (type) {
      case 'bomb-bonus':
        this.maxBombs++;
        break;
      case 'range-bonus':
        this.rangeBonus++;
        break;
      case 'explosion-bonus':
        this.explosionRange++;
        break;
      case 'move-bonus':
        this.pm++;
        this.pmLeft++;
        break;
      case 'action-bonus':
        this.pa++;
        this.paLeft++;
        break;
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
      character: this.character,
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
      maxBombs: this.maxBombs,
      rangeBonus: this.rangeBonus,
      explosionRange: this.explosionRange,
      stats: { ...this.stats },
    };
  }
}

module.exports = Player;
