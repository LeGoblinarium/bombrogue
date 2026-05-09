const Emotes = (() => {
  const EMOTES = ['😂', '👍', '👎', '😮', '😡', '🎉', '💀', '💣', '🤔', '😎', '❤️', '👋'];
  const EMOTE_DURATION   = 3000; // ms a floating emote stays visible
  const PLAYER_COOLDOWN  = 2500; // ms between emotes for the same player

  let container  = null;
  let canvasEl   = null;
  // playerId → { el, removeTimer }
  const activeEmotes    = new Map();
  // playerId → timestamp of last emote shown
  const playerCooldowns = new Map();

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    container = document.getElementById('emote-container');
    canvasEl  = document.getElementById('game-canvas');

    // Build picker buttons
    const picker = document.getElementById('emote-picker');
    for (const emoji of EMOTES) {
      const btn = document.createElement('button');
      btn.className   = 'emote-pick-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        Socket.emit('emote', { emoji });
        closePicker();
      });
      picker.appendChild(btn);
    }

    // Toggle picker on emote button click
    document.getElementById('btn-emote').addEventListener('click', (e) => {
      e.stopPropagation();
      picker.classList.toggle('open');
    });

    // Close picker when clicking anywhere else
    document.addEventListener('pointerdown', () => closePicker());
    picker.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  function closePicker() {
    const picker = document.getElementById('emote-picker');
    if (picker) picker.classList.remove('open');
  }

  // ── Show ─────────────────────────────────────────────────────────────────────

  // Called (for every player including self) when server broadcasts player-emote
  function show(playerId, emoji, state) {
    if (!container || !canvasEl || !state) return;
    if (!document.getElementById('screen-game').classList.contains('active')) return;

    const now      = Date.now();
    const lastTime = playerCooldowns.get(playerId) || 0;
    if (now - lastTime < PLAYER_COOLDOWN) return;
    playerCooldowns.set(playerId, now);

    const player = state.players.find(p => p.id === playerId);
    if (!player || !player.alive) return;

    // Replace any existing emote for this player
    const existing = activeEmotes.get(playerId);
    if (existing) {
      clearTimeout(existing.removeTimer);
      existing.el.remove();
    }

    const el = document.createElement('div');
    el.className   = 'floating-emote';
    el.textContent = emoji;
    container.appendChild(el);

    // Position immediately so it doesn't flash at 0,0
    _updatePosition(el, playerId, state);

    const removeTimer = setTimeout(() => {
      el.classList.add('emote-out');
      setTimeout(() => { el.remove(); activeEmotes.delete(playerId); }, 380);
    }, EMOTE_DURATION);

    activeEmotes.set(playerId, { el, removeTimer, playerId });
  }

  // ── Position update ──────────────────────────────────────────────────────────

  function _updatePosition(el, playerId, state) {
    if (!canvasEl) return;
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;

    const animPos = Animations.getEntityAnimPos('player', playerId);
    const px = animPos ? animPos.x : player.x;
    const py = animPos ? animPos.y : player.y;

    const rect     = canvasEl.getBoundingClientRect();
    const screenPos = Camera.gridToScreen(px, py);

    el.style.left = (rect.left + screenPos.x) + 'px';
    el.style.top  = (rect.top  + screenPos.y) + 'px';
  }

  // ── Tick (called every frame from render loop) ────────────────────────────────

  function tick(state) {
    if (!state) return;
    if (!document.getElementById('screen-game').classList.contains('active')) {
      clear();
      return;
    }
    for (const { el, playerId } of activeEmotes.values()) {
      _updatePosition(el, playerId, state);
    }
  }

  // ── Clear ────────────────────────────────────────────────────────────────────

  function clear() {
    for (const { el, removeTimer } of activeEmotes.values()) {
      clearTimeout(removeTimer);
      el.remove();
    }
    activeEmotes.clear();
    playerCooldowns.clear();
    closePicker();
  }

  return { init, show, tick, clear };
})();
