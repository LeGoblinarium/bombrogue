const UI = (() => {
  let activeSpell = null;

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
      card.innerHTML = `
        <div class="player-color pbg-${p.colorIndex}"></div>
        <div class="player-name">${escapeHtml(p.name)}${p.id === myId ? ' (toi)' : ''}</div>
        <div class="player-stats">PA:${p.pa} PM:${p.pm}</div>
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
      if (spell.id === 'place-bomb' && state.bombs.filter(b => b.ownerId === me.id).length >= 3) disabled = true;

      const cdDisplay = onCooldown ? (cd > 0 ? cd : 1) : 0;

      btn.innerHTML = `
        <div class="spell-icon-wrap">
          <img class="spell-icon" src="/images/icon-${spell.id}.png" alt="${spell.name}"
               onerror="this.style.display='none';this.nextElementSibling.style.display=''">
          <span class="spell-name-text" style="display:none">${spell.name}</span>
          ${cdDisplay > 0 ? `<div class="spell-cd-overlay">${cdDisplay}</div>` : ''}
        </div>
        <span class="spell-cost">${spell.cost > 0 ? spell.cost + ' PA' : ''}</span>
      `;

      if (disabled) btn.classList.add('disabled');
      if (onCooldown) btn.classList.add('on-cooldown');
      if (activeSpell === spell.id) btn.classList.add('active');

      btn.addEventListener('click', () => {
        if (disabled) return;
        if (spell.id === 'detonate') {
          Input.triggerSimpleAction('detonate');
          return;
        }
        if (spell.id === 'end-turn') {
          Input.triggerSimpleAction('end-turn');
          return;
        }
        if (spell.id === 'liberation') {
          Input.triggerSimpleAction('liberation');
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

  function renderGameOver(data) {
    const winner = data.winner;
    document.getElementById('winner-text').textContent = winner ? `${winner.name} a gagné !` : 'Match nul !';
    const stats = document.getElementById('final-stats');
    stats.innerHTML = '';
    data.stats.forEach(s => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `<span class="pcolor-${s.colorIndex}">${escapeHtml(s.name)}</span><span>${s.alive ? Math.max(0, s.hp) + ' PV' : 'Éliminé'}</span>`;
      stats.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  return {
    showScreen, showError,
    renderPlayersList, updateDistribution,
    renderHpBars, updateTurnInfo, updateTimer, renderResources,
    renderSpellBar, updateSpellSelection,
    renderGameOver,
  };
})();
