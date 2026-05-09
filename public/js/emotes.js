const Emotes = (() => {
  const EMOTES = ['😂', '👍', '👎', '😮', '😡', '🎉', '💀', '💣', '🤔', '😎', '❤️', '👋'];
  const EMOTE_DURATION  = 3000; // ms a floating emote stays visible
  const PLAYER_COOLDOWN = 2500; // ms between emotes for the same player
  const DRAG_THRESHOLD  = 6;   // px before a pointerdown is treated as a drag

  let container = null;
  let canvasEl  = null;
  // playerId → { el, removeTimer }
  const activeEmotes    = new Map();
  // playerId → timestamp of last emote shown
  const playerCooldowns = new Map();

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    container = document.getElementById('emote-container');
    canvasEl  = document.getElementById('game-canvas');

    // Build picker emoji buttons
    const picker = document.getElementById('emote-picker');
    for (const emoji of EMOTES) {
      const btn = document.createElement('button');
      btn.className   = 'emote-pick-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        Socket.emit('emote', { emoji });
        _closePicker();
      });
      picker.appendChild(btn);
    }

    // ── Draggable emote button ────────────────────────────────────────────────
    const emoteBtn = document.getElementById('btn-emote');

    // Restore saved position or keep CSS defaults
    const saved = JSON.parse(localStorage.getItem('emoteBtnPos') || 'null');
    if (saved) {
      emoteBtn.style.right  = 'auto';
      emoteBtn.style.bottom = 'auto';
      emoteBtn.style.left   = saved.x + 'px';
      emoteBtn.style.top    = saved.y + 'px';
    }

    let startX, startY, startLeft, startTop, dragged;

    emoteBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      emoteBtn.setPointerCapture(e.pointerId);
      dragged = false;

      const rect = emoteBtn.getBoundingClientRect();
      startX    = e.clientX;
      startY    = e.clientY;
      startLeft = rect.left;
      startTop  = rect.top;

      // Switch from right/bottom anchoring to left/top for smooth dragging
      emoteBtn.style.right  = 'auto';
      emoteBtn.style.bottom = 'auto';
      emoteBtn.style.left   = startLeft + 'px';
      emoteBtn.style.top    = startTop  + 'px';
    });

    emoteBtn.addEventListener('pointermove', (e) => {
      if (!emoteBtn.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragged && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        dragged = true;
        emoteBtn.classList.add('dragging');
        _closePicker(); // close picker while dragging
      }
      if (!dragged) return;

      const W = window.innerWidth, H = window.innerHeight;
      const x = Math.max(0, Math.min(W - emoteBtn.offsetWidth,  startLeft + dx));
      const y = Math.max(0, Math.min(H - emoteBtn.offsetHeight, startTop  + dy));
      emoteBtn.style.left = x + 'px';
      emoteBtn.style.top  = y + 'px';
    });

    emoteBtn.addEventListener('pointerup', () => {
      emoteBtn.classList.remove('dragging');
      if (!dragged) {
        // Tap: toggle picker
        if (!picker.classList.contains('open')) {
          _positionPicker();
          picker.classList.add('open');
        } else {
          _closePicker();
        }
      } else {
        localStorage.setItem('emoteBtnPos', JSON.stringify({
          x: parseFloat(emoteBtn.style.left),
          y: parseFloat(emoteBtn.style.top),
        }));
      }
    });

    // Close picker on any tap outside the picker or button
    document.addEventListener('pointerdown', (e) => {
      if (!picker.contains(e.target) && e.target !== emoteBtn) {
        _closePicker();
      }
    });
  }

  // ── Picker helpers ───────────────────────────────────────────────────────────

  function _closePicker() {
    const picker = document.getElementById('emote-picker');
    if (picker) picker.classList.remove('open');
  }

  // Position the picker smartly relative to the emote button
  function _positionPicker() {
    const emoteBtn = document.getElementById('btn-emote');
    const picker   = document.getElementById('emote-picker');
    if (!emoteBtn || !picker) return;

    const btnRect  = emoteBtn.getBoundingClientRect();
    const pickerW  = 200; // 4 cols × ~42px + padding
    const pickerH  = 190; // 3 rows × ~42px + padding
    const gap      = 8;

    // Prefer appearing above the button; fall back to below
    let top  = btnRect.top - pickerH - gap;
    if (top < 0) top = btnRect.bottom + gap;

    // Align left edge to button, clamp to viewport
    let left = btnRect.left;
    if (left + pickerW > window.innerWidth)  left = window.innerWidth  - pickerW - gap;
    if (left < gap) left = gap;

    picker.style.left   = left + 'px';
    picker.style.top    = top  + 'px';
    picker.style.right  = 'auto';
    picker.style.bottom = 'auto';
  }

  // ── Show emote ───────────────────────────────────────────────────────────────

  // Called for every player (including self) when server broadcasts player-emote
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

    // Position before first paint so it doesn't flash at 0,0
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
    const gx = animPos ? animPos.x : player.x;
    const gy = animPos ? animPos.y : player.y;

    const rect      = canvasEl.getBoundingClientRect();
    const screenPos = Camera.gridToScreen(gx, gy);

    // Anchor at the horizontal centre and top of the cell (= character's head area)
    el.style.left = (rect.left + screenPos.x + screenPos.size / 2) + 'px';
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
    _closePicker();
  }

  return { init, show, tick, clear };
})();
