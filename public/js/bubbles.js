const Bubbles = (() => {
  let container = null;
  let canvasEl = null;
  let activeBubbles = []; // { id, playerId, el, removeTimer }
  let lastCheckTime = 0;

  const CHECK_INTERVAL  = 6500;  // ms between proximity scans
  const TRIGGER_CHANCE  = 0.38;  // probability a scan fires dialogue
  const BUBBLE_DURATION = 4800;  // ms before auto-dismiss
  const RESPONSE_DELAY  = 2600;  // ms before response bubble appears
  const PROXIMITY_CELLS = 5;     // Manhattan distance threshold
  const MAX_BUBBLES     = 3;     // max simultaneous bubbles on screen
  const PAIR_COOLDOWN   = 22000; // ms before same pair can chat again

  const pairCooldowns  = {};  // pairKey → timestamp
  const dialogueIndex  = {};  // pairKey → rotation index

  // ── Dialogue database ───────────────────────────────────────────────────────
  // Keys are alphabetically sorted character ids joined by '-'

  const PAIR_DIALOGUES = {
    'merlin-mordek': [
      [
        { speaker: 'merlin', text: "J'ai toujours détesté la nécromancie." },
        { speaker: 'mordek', text: "La nécromancie est la plus puissante des magies." },
      ],
      [
        { speaker: 'merlin', text: "Tu sens le tombeau fraîchement ouvert, Mordek." },
        { speaker: 'mordek', text: "Et toi tu sens l'arrogance. C'est bien pire." },
      ],
      [
        { speaker: 'merlin', text: "Retourne dans ta tombe !" },
        { speaker: 'mordek', text: "Je l'ai quittée exprès pour te réduire en cendres." },
      ],
      [
        { speaker: 'mordek', text: "Tes sorts sont impressionnants... pour un vivant." },
        { speaker: 'merlin', text: "Tais-toi donc, cadavre ambulant !" },
      ],
    ],

    'borin-merlin': [
      [
        { speaker: 'merlin', text: "Nain, as-tu seulement lu un livre de ta vie ?" },
        { speaker: 'borin', text: "J'ai pas besoin de livres pour t'assommer." },
      ],
      [
        { speaker: 'borin', text: "Ta magie c'est du flan, sorcier !" },
        { speaker: 'merlin', text: "Tu n'as pas l'intellect pour comprendre le flan non plus." },
      ],
      [
        { speaker: 'merlin', text: "Recule, Borin, tu bloques ma ligne de vue." },
        { speaker: 'borin', text: "Encore un problème que ton cerveau de génie résout pas." },
      ],
    ],

    'kael-merlin': [
      [
        { speaker: 'merlin', text: "La magie elfique manque cruellement de rigueur." },
        { speaker: 'kael', text: "La forêt n'a pas besoin de rigueur pour être éternelle." },
      ],
      [
        { speaker: 'kael', text: "Tu ne trouveras pas la sagesse dans tes grimoires, Merlin." },
        { speaker: 'merlin', text: "Et toi pas davantage en parlant aux arbres." },
      ],
    ],

    'alaric-mordek': [
      [
        { speaker: 'alaric', text: "Rends-toi ! Tu mourras avec honneur." },
        { speaker: 'mordek', text: "J'ai déjà essayé la mort. C'était décevant." },
      ],
      [
        { speaker: 'mordek', text: "Ton armure est jolie. Je la volerai sur ton cadavre." },
        { speaker: 'alaric', text: "Il faudra me tuer d'abord, créature !" },
      ],
      [
        { speaker: 'alaric', text: "Par mon épée, je te renverrai dans les ténèbres !" },
        { speaker: 'mordek', text: "Mais je les aime, moi, les ténèbres." },
      ],
    ],

    'alaric-bob': [
      [
        { speaker: 'alaric', text: "Brave Bob, tiens-toi droit en présence d'un chevalier !" },
        { speaker: 'bob', text: "...Je me tiens comment là ?" },
      ],
      [
        { speaker: 'bob', text: "T'as pas chaud avec toute cette armure ?" },
        { speaker: 'alaric', text: "La chaleur ne touche pas celui qui combat avec honneur." },
      ],
    ],

    'borin-kael': [
      [
        { speaker: 'borin', text: "Les elfes ça parle aux arbres. C'est pathétique." },
        { speaker: 'kael', text: "Les arbres répondent. Contrairement aux nains." },
      ],
      [
        { speaker: 'kael', text: "Ta barbe cache-t-elle une âme, Borin ?" },
        { speaker: 'borin', text: "Ma barbe cache mon visage. Ça suffit amplement." },
      ],
      [
        { speaker: 'borin', text: "Tes oreilles pointues me donnent le vertige." },
        { speaker: 'kael', text: "Et ta taille me donne des courbatures." },
      ],
    ],

    'bob-mordek': [
      [
        { speaker: 'bob', text: "Tu es... vraiment mort ou c'est un déguisement ?" },
        { speaker: 'mordek', text: "..." },
      ],
      [
        { speaker: 'mordek', text: "Quelle âme fade tu as, Bob." },
        { speaker: 'bob', text: "Merci ? Je crois ?" },
      ],
    ],

    'bob-kael': [
      [
        { speaker: 'bob', text: "Hé, t'as vraiment des oreilles pointues ?" },
        { speaker: 'kael', text: "...Oui." },
      ],
      [
        { speaker: 'kael', text: "Sens-tu la forêt parler, Bob ?" },
        { speaker: 'bob', text: "J'entends surtout les bombes exploser." },
      ],
    ],

    'alaric-borin': [
      [
        { speaker: 'alaric', text: "Nain, je respecte ton courage." },
        { speaker: 'borin', text: "Garde tes compliments. Donne-moi de l'or." },
      ],
      [
        { speaker: 'borin', text: "Une armure pareille, ça doit valoir une fortune." },
        { speaker: 'alaric', text: "Elle n'est pas à vendre, Borin." },
      ],
    ],

    'bob-merlin': [
      [
        { speaker: 'bob', text: "Merlin, tu peux me transformer en quelque chose d'utile ?" },
        { speaker: 'merlin', text: "Ma magie a ses limites, hélas." },
      ],
      [
        { speaker: 'merlin', text: "Bob, es-tu même conscient de ce que tu fais ?" },
        { speaker: 'bob', text: "Pas vraiment, non." },
      ],
    ],

    'kael-mordek': [
      [
        { speaker: 'kael', text: "La mort n'est qu'un passage vers la forêt éternelle." },
        { speaker: 'mordek', text: "Et moi je bloque le passage. Avec plaisir." },
      ],
      [
        { speaker: 'mordek', text: "Tu mourras comme tous les vivants, elfe." },
        { speaker: 'kael', text: "Et je renaîtrai. Comme tous les arbres." },
      ],
    ],

    'borin-mordek': [
      [
        { speaker: 'borin', text: "Les morts-vivants méritent pas d'or." },
        { speaker: 'mordek', text: "L'or n'a aucune valeur quand on est réduit en poussière." },
      ],
      [
        { speaker: 'mordek', text: "Tu creuses des tunnels. Je creuse des tombes. On se ressemble." },
        { speaker: 'borin', text: "JAMAIS." },
      ],
    ],

    'alaric-kael': [
      [
        { speaker: 'alaric', text: "Elfe, combats-tu pour l'honneur ou pour la nature ?" },
        { speaker: 'kael', text: "Les deux sont la même chose, chevalier." },
      ],
    ],

    'bob-borin': [
      [
        { speaker: 'bob', text: "Borin, t'es un nain en vrai ? Genre... vraiment ?" },
        { speaker: 'borin', text: "Encore une question et tu finiras sous une bombe." },
      ],
    ],
  };

  // Solo lines per character (when no suitable pair is nearby)
  const SOLO_LINES = {
    player: [
      "Je suis sûr que c'est une bonne idée.",
      "Pourquoi y'a des bombes partout ?",
      "J'aurais dû rester chez moi.",
      "Hm. C'est quoi le plan déjà ?",
      "Ça va aller.",
      "OK panique pas, panique pas...",
    ],
    merlin: [
      "Pathétique.",
      "Je n'attendais rien de mieux.",
      "Mon intelligence est votre malheur.",
      "La magie résout tout. Sauf la bêtise.",
      "Vous n'êtes que des obstacles temporaires.",
      "Je pourrais tous vous effacer d'un claquement de doigts.",
    ],
    kael: [
      "La forêt me regarde.",
      "Le vent tourne...",
      "Je sens vos peurs.",
      "La terre a de la mémoire.",
      "Chaque bombe est un arbre qui brûle.",
    ],
    borin: [
      "Bande de mauviettes !",
      "Je préfère mon marteau à la magie.",
      "Qu'est-ce que je ferais pas pour de l'or...",
      "Ma mère tapait plus fort que vous.",
      "Avancez ou reculez, mais bougez-vous !",
      "Par Durgin le Profond !",
    ],
    alaric: [
      "L'honneur guidera mon bras.",
      "Je ne recule devant rien.",
      "Qu'il en soit ainsi.",
      "Par mon épée, je vous aurai tous.",
      "La victoire appartient aux vertueux.",
    ],
    mordek: [
      "...",
      "Vous souffrirez.",
      "La mort est inévitable. Pour vous.",
      "Vos cendres feront d'excellents serviteurs.",
      "Je me souviens de tous mes ennemis. Très longtemps.",
      "Intéressant.",
    ],
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function pairKey(charA, charB) {
    return [charA, charB].sort().join('-');
  }

  function randomOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────

  function init() {
    container = document.createElement('div');
    container.id = 'bubble-container';
    document.body.appendChild(container);
    canvasEl = document.getElementById('game-canvas');
  }

  function clear() {
    activeBubbles.forEach(b => {
      clearTimeout(b.removeTimer);
      if (b.el && b.el.parentNode) b.el.parentNode.removeChild(b.el);
    });
    activeBubbles = [];
  }

  function _dismiss(id) {
    const idx = activeBubbles.findIndex(b => b.id === id);
    if (idx === -1) return;
    const b = activeBubbles[idx];
    clearTimeout(b.removeTimer);
    b.el.classList.add('bubble-out');
    setTimeout(() => { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); }, 350);
    activeBubbles.splice(idx, 1);
  }

  function _spawn(playerId, charKey, text) {
    if (activeBubbles.length >= MAX_BUBBLES) return null;
    // At most one bubble per player at a time
    if (activeBubbles.some(b => b.playerId === playerId)) return null;

    const id = Math.random().toString(36).slice(2);
    const el = document.createElement('div');
    el.className = 'speech-bubble';

    const color = (typeof COLORS !== 'undefined' && COLORS.length) ? COLORS[_colorIndexFor(playerId)] : '#4ECDC4';
    const CHAR_NAMES = { player: 'Bob', merlin: 'Merlin', kael: 'Kael', borin: 'Borin', alaric: 'Alaric', mordek: 'Mordek' };
    const displayName = CHAR_NAMES[charKey] || charKey;

    el.innerHTML =
      `<span class="bubble-name" style="color:${color}">${displayName}</span>` +
      `<span class="bubble-text">${text}</span>`;

    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); _dismiss(id); });

    container.appendChild(el);

    const removeTimer = setTimeout(() => _dismiss(id), BUBBLE_DURATION);
    activeBubbles.push({ id, playerId, el, removeTimer });
    return id;
  }

  // Cache for color lookup — avoid scanning state every frame
  let _colorCache = {};  // playerId → colorIndex

  function _colorIndexFor(playerId) {
    return _colorCache[playerId] !== undefined ? _colorCache[playerId] : 0;
  }

  // ── Position update (called every frame) ────────────────────────────────────

  function _updatePositions(state) {
    if (!activeBubbles.length || !state || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const now  = performance.now();

    for (const b of activeBubbles) {
      const player = state.players.find(p => p.id === b.playerId);
      if (!player) continue;

      let gx = player.x, gy = player.y;
      if (typeof Animations !== 'undefined') {
        const animPos = Animations.getEntityAnimPos(player.id, now);
        if (animPos) { gx = animPos.x; gy = animPos.y; }
      }

      if (typeof Camera === 'undefined') continue;
      const s  = Camera.gridToScreen(gx, gy);
      const cs = Camera.getTransform().cellSize * Camera.getTransform().zoom;

      // Anchor point: top-centre of the character cell
      const screenX = rect.left + s.x + cs * 0.5;
      const screenY = rect.top  + s.y - 8;

      b.el.style.left = screenX + 'px';
      b.el.style.top  = screenY + 'px';
    }
  }

  // ── Proximity check + dialogue selection ────────────────────────────────────

  function _tryFireDialogue(state) {
    const now   = Date.now();
    const alive = state.players.filter(p => p.alive);
    if (alive.length === 0) return;

    // Rebuild color cache
    _colorCache = {};
    for (const p of alive) _colorCache[p.id] = p.colorIndex;

    // Find pairs within proximity
    const nearPairs = [];
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= PROXIMITY_CELLS) {
          nearPairs.push([a, b]);
        }
      }
    }

    if (nearPairs.length === 0) {
      // Solo line — any alive player
      const p     = randomOf(alive);
      const char  = p.character || 'player';
      const lines = SOLO_LINES[char] || SOLO_LINES['player'];
      _spawn(p.id, char, randomOf(lines));
      return;
    }

    // Shuffle pairs and try until one fires (respects cooldowns)
    const shuffled = nearPairs.slice().sort(() => Math.random() - 0.5);

    for (const [pa, pb] of shuffled) {
      const charA = pa.character || 'player';
      const charB = pb.character || 'player';
      const key   = pairKey(charA, charB);

      if (pairCooldowns[key] && now - pairCooldowns[key] < PAIR_COOLDOWN) continue;

      const dialogues = PAIR_DIALOGUES[key];
      if (!dialogues || dialogues.length === 0) {
        // No pair dialogue — solo line for one of them
        const p     = Math.random() < 0.5 ? pa : pb;
        const char  = p.character || 'player';
        const lines = SOLO_LINES[char] || SOLO_LINES['player'];
        _spawn(p.id, char, randomOf(lines));
        return;
      }

      // Rotate through dialogues to avoid repeating
      if (!dialogueIndex[key]) dialogueIndex[key] = 0;
      const dialogue = dialogues[dialogueIndex[key] % dialogues.length];
      dialogueIndex[key]++;
      pairCooldowns[key] = now;

      const [lineA, lineB] = dialogue;

      // Resolve which live player plays each speaker
      const speakerA = alive.find(p => (p.character || 'player') === lineA.speaker);
      const speakerB = alive.find(p => (p.character || 'player') === lineB.speaker);
      if (!speakerA || !speakerB) continue;

      _spawn(speakerA.id, lineA.speaker, lineA.text);

      // Response after a short delay
      const sidB    = speakerB.id;
      const charSB  = lineB.speaker;
      const textSB  = lineB.text;
      setTimeout(() => {
        const s = (typeof GameClient !== 'undefined') ? GameClient.getState() : null;
        if (!s) return;
        const respPlayer = s.players.find(p => p.id === sidB && p.alive);
        if (!respPlayer) return;
        _spawn(sidB, charSB, textSB);
      }, RESPONSE_DELAY);

      return; // fired successfully
    }

    // All pairs on cooldown → solo line
    const p     = randomOf(alive);
    const char  = p.character || 'player';
    const lines = SOLO_LINES[char] || SOLO_LINES['player'];
    _spawn(p.id, char, randomOf(lines));
  }

  // ── Main tick (called every animation frame) ─────────────────────────────────

  function tick(state) {
    if (!state || !container) return;
    _updatePositions(state);

    const now = Date.now();
    if (now - lastCheckTime < CHECK_INTERVAL) return;
    lastCheckTime = now;

    if (activeBubbles.length >= MAX_BUBBLES) return;
    if (Math.random() > TRIGGER_CHANCE) return;

    _tryFireDialogue(state);
  }

  return { init, tick, clear };
})();
