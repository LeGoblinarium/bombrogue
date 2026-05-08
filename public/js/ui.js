const UI = (() => {
  let activeSpell = null;

  // ── Spell tooltip ────────────────────────────────────────────────────────────
  const LONG_PRESS_MS  = 500;
  const HOVER_DELAY_MS = 600;
  let _ttLongTimer = null;
  let _ttHoverTimer = null;
  let _ttLongFired  = false;  // true while tooltip shown via long-press

  // Global release: hide tooltip wherever the finger/mouse lifts.
  // Necessary because mobile often fires pointercancel or routes pointerup
  // to document instead of the originating element after a long press.
  function _onGlobalRelease() {
    // Always cancel the pending long-press timer on release — without this,
    // a quick tap lets the timer fire 500ms later on a potentially stale
    // button reference, placing the tooltip at 0,0 with no one to hide it.
    clearTimeout(_ttLongTimer);
    _ttLongTimer = null;
    if (!_ttLongFired) return;
    setTimeout(() => {
      _hideTooltip();
      _ttLongFired = false;
    }, 40);
  }
  document.addEventListener('pointerup',     _onGlobalRelease);
  document.addEventListener('pointercancel', _onGlobalRelease);
  document.addEventListener('touchend',      _onGlobalRelease, { passive: true });

  function _showTooltip(btn, spell) {
    const tt = document.getElementById('spell-tooltip');
    tt.querySelector('.tt-title').textContent = spell.name;
    tt.querySelector('.tt-desc').textContent  = spell.desc || '';

    // Position off-screen first, then show — forces browser reflow so
    // offsetWidth/offsetHeight return real values (getBoundingClientRect
    // would return 0 if called immediately after display:none→block)
    tt.style.visibility = 'hidden';
    tt.style.left       = '0px';
    tt.style.top        = '0px';
    tt.style.display    = 'block';

    const ttW = tt.offsetWidth;   // forces reflow
    const ttH = tt.offsetHeight;

    // Safety: button may have been removed from DOM by a renderSpellBar refresh
    if (!document.body.contains(btn)) { _hideTooltip(); _ttLongFired = false; return; }

    const bRect = btn.getBoundingClientRect();
    const GAP   = 10;

    let left = bRect.left + bRect.width / 2 - ttW / 2;
    left = Math.max(6, Math.min(window.innerWidth - ttW - 6, left));

    let top = bRect.top - ttH - GAP;
    if (top < 6) top = bRect.bottom + GAP;

    tt.dataset.arrowSide = top < bRect.top ? 'bottom' : 'top';
    tt.style.left        = left + 'px';
    tt.style.top         = top  + 'px';
    tt.style.visibility  = 'visible';
  }

  function _hideTooltip() {
    const tt = document.getElementById('spell-tooltip');
    if (tt) tt.style.display = 'none';
  }

  function _attachTooltip(btn, spell) {
    // Long-press: start timer on pointerdown, cancel on move
    btn.addEventListener('pointerdown', () => {
      clearTimeout(_ttLongTimer);
      _ttLongFired = false;
      _ttLongTimer = setTimeout(() => {
        _ttLongFired = true;
        _showTooltip(btn, spell);
      }, LONG_PRESS_MS);
    });
    btn.addEventListener('pointermove', () => {
      // Drift → abort the pending timer (release hides via global listener)
      clearTimeout(_ttLongTimer);
    });

    // Hover (desktop only)
    btn.addEventListener('mouseenter', () => {
      _ttHoverTimer = setTimeout(() => _showTooltip(btn, spell), HOVER_DELAY_MS);
    });
    btn.addEventListener('mouseleave', () => {
      clearTimeout(_ttHoverTimer);
      if (!_ttLongFired) _hideTooltip();
    });
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function showError(msg) {
    const el = document.getElementById('error-msg');
    if (el) {
      el.textContent = msg;
      setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
    }
  }

  function renderPlayersList(players, hostId, myId) {
    const container = document.getElementById('players-list');
    container.innerHTML = '';
    players.forEach(p => {
      const card = document.createElement('div');
      card.className = `player-card pborder-${p.colorIndex}`;
      const charNames = { player: 'Bob', merlin: 'Merlin', kael: 'Kael', borin: 'Borin', alaric: 'Alaric', mordek: 'Mordek' };
      const charName = charNames[p.character] || 'Bob';
      card.innerHTML = `
        <img class="player-char-icon" src="/images/${escapeHtml(p.character || 'player')}.png" alt="${charName}">
        <div class="player-info">
          <div class="player-name">${escapeHtml(p.name)}${p.id === myId ? ' (toi)' : ''}</div>
          <div class="player-stats">${charName} · PA:${p.pa} PM:${p.pm}</div>
        </div>
        ${p.id === hostId ? '<span class="host-badge">HOST</span>' : ''}
      `;
      container.appendChild(card);
    });
  }

  function updateDistribution(pa, pm) {
    document.getElementById('pa-value').textContent = pa;
    document.getElementById('pm-value').textContent = pm;
  }

  function renderHpBars(state) {
    const container = document.getElementById('hp-bars');
    container.innerHTML = '';
    state.players.forEach(p => {
      const wrapper = document.createElement('div');
      wrapper.className = 'hp-bar-wrapper';
      const pct = Math.max(0, (p.hp / 100) * 100);
      wrapper.innerHTML = `
        <div class="hp-bar-name pcolor-${p.colorIndex}">${escapeHtml(p.name)}${!p.alive ? ' ☠' : ''}</div>
        <div class="hp-bar-track">
          <div class="hp-bar-fill pbg-${p.colorIndex}" style="width:${pct}%"></div>
        </div>
        <div class="hp-bar-value">${Math.max(0, p.hp)}</div>
      `;
      container.appendChild(wrapper);
    });
  }

  function updateTurnInfo(state) {
    const cur = state.currentTurn;
    if (!cur) return;
    const player = state.players.find(p => p.id === cur.playerId);
    const turnEl = document.getElementById('turn-player');
    if (player) {
      turnEl.textContent = `Tour de: ${player.name}`;
      turnEl.className = `pcolor-${player.colorIndex}`;
    }
  }

  function updateTimer(ms) {
    const s = Math.ceil(ms / 1000);
    document.getElementById('turn-timer').textContent = `⏱ ${s}s`;
  }

  function renderResources(me) {
    if (!me) return;
    const paEl = document.getElementById('pa-dots');
    const pmEl = document.getElementById('pm-dots');
    paEl.innerHTML = `PA: ${dots(me.paLeft, me.pa)}`;
    pmEl.innerHTML = `PM: ${dots(me.pmLeft, me.pm)}`;
  }

  function dots(filled, total) {
    let s = '';
    for (let i = 0; i < total; i++) {
      if (i < filled) s += '<span class="dot-filled">●</span>';
      else s += '<span class="dot-empty">○</span>';
    }
    return s;
  }

  function renderSpellBar(state, isMyTurn) {
    const me = state.players.find(p => p.id === GameClient.getMyId());
    if (!me) return;

    const bar = document.getElementById('spell-bar');
    bar.innerHTML = '';
    SPELLS.forEach(spell => {
      const btn = document.createElement('button');
      btn.className = 'spell-btn';
      const cd = me.cooldowns ? (me.cooldowns[spell.id] || 0) : 0;
      const usedThisTurn = me.usedThisTurn ? me.usedThisTurn[spell.id] : false;

      const onCooldown = cd > 0 || (spell.id === 'repulseur' && usedThisTurn);
      let disabled = !isMyTurn || !me.alive || onCooldown;
      if (spell.cost > 0 && me.paLeft < spell.cost) disabled = true;
      if (spell.id === 'place-bomb' && state.bombs.filter(b => b.ownerId === me.id).length >= (me.maxBombs || 3)) disabled = true;

      const cdDisplay = onCooldown ? (cd > 0 ? cd : 1) : 0;

      btn.innerHTML = `
        <div class="spell-icon-wrap">
          <img class="spell-icon" src="/images/icon-${spell.id}.png" alt="${spell.name}"
               draggable="false"
               onerror="this.style.display='none';this.nextElementSibling.style.display=''">
          <span class="spell-name-text" style="display:none">${spell.name}</span>
          ${spell.cost > 0 ? `<div class="spell-pa-badge">${spell.cost}</div>` : ''}
          ${cdDisplay > 0 ? `<div class="spell-cd-overlay">${cdDisplay}</div>` : ''}
        </div>
      `;

      if (disabled) btn.classList.add('disabled');
      if (onCooldown) btn.classList.add('on-cooldown');
      if (activeSpell === spell.id) btn.classList.add('active');

        // Prevent native mobile context menu (image save dialog, etc.)
      btn.addEventListener('contextmenu', (e) => e.preventDefault());

      _attachTooltip(btn, spell);

      btn.addEventListener('click', () => {
        // Never fire click if a long-press tooltip was just shown
        if (_ttLongFired) return;
        if (disabled) return;
        if (spell.id === 'end-turn') {
          Input.triggerSimpleAction('end-turn');
          return;
        }
        if (activeSpell === spell.id) {
          activeSpell = null;
          Input.setMode('move');
        } else {
          activeSpell = spell.id;
          Input.setMode(spell.id);
        }
        renderSpellBar(state, isMyTurn);
      });

      bar.appendChild(btn);
    });
  }

  function updateSpellSelection(spellId) {
    activeSpell = spellId;
  }

  function showTurnFlash(color) {
    const el = document.getElementById('screen-game');
    el.style.setProperty('--turn-flash-color', color);
    el.classList.add('my-turn');
  }

  function hideTurnFlash() {
    document.getElementById('screen-game').classList.remove('my-turn');
  }

  function renderGameOver(data) {
    hideTurnFlash();
    const winner = data.winner;
    document.getElementById('winner-text').textContent = winner ? `${winner.name} a gagné !` : 'Match nul !';
    const container = document.getElementById('final-stats');
    container.innerHTML = '';

    // Header row
    const header = document.createElement('div');
    header.className = 'stats-table-header';
    header.innerHTML = `
      <span class="stats-col-name">Joueur</span>
      <span class="stats-col" title="PV restants">PV</span>
      <span class="stats-col" title="Dégâts infligés">⚔️</span>
      <span class="stats-col" title="Dégâts reçus">🛡️</span>
      <span class="stats-col" title="Bombes posées">💣</span>
      <span class="stats-col" title="Sorts utilisés">✨</span>
    `;
    container.appendChild(header);

    data.stats.forEach(s => {
      const row = document.createElement('div');
      row.className = 'stats-table-row';
      const ps = s.stats || {};
      row.innerHTML = `
        <span class="stats-col-name pcolor-${s.colorIndex}">${escapeHtml(s.name)}</span>
        <span class="stats-col">${s.alive ? Math.max(0, s.hp) : '💀'}</span>
        <span class="stats-col">${ps.damageDealt || 0}</span>
        <span class="stats-col">${ps.damageReceived || 0}</span>
        <span class="stats-col">${ps.bombsPlaced || 0}</span>
        <span class="stats-col">${ps.spellsUsed || 0}</span>
      `;
      container.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  let _toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById('ui-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ui-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('toast-hidden');
    toast.classList.add('toast-visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      toast.classList.remove('toast-visible');
      toast.classList.add('toast-hidden');
    }, 3000);
  }

  return {
    showScreen, showError, showToast,
    renderPlayersList, updateDistribution,
    renderHpBars, updateTurnInfo, updateTimer, renderResources,
    renderSpellBar, updateSpellSelection,
    renderGameOver, showTurnFlash, hideTurnFlash,
  };
})();
