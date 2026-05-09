const Profile = (() => {
  const CHAR_NAMES = {
    player: 'Bob', merlin: 'Merlin', kael: 'Kael',
    borin: 'Borin', alaric: 'Alaric', mordek: 'Mordek',
  };
  const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

  // ── Public ────────────────────────────────────────────────────────────────

  async function show(username) {
    // Reset to Stats tab
    document.querySelectorAll('.profile-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.getElementById('profile-tab-stats').classList.remove('hidden');
    document.getElementById('profile-tab-history').classList.add('hidden');

    document.getElementById('profile-username-text').textContent = username;
    document.getElementById('stats-grid').innerHTML   = '<p class="profile-loading">Chargement…</p>';
    document.getElementById('history-list').innerHTML = '<p class="profile-loading">Chargement…</p>';

    UI.showScreen('screen-profile');

    try {
      const [stats, games] = await Promise.all([
        _apiFetch(`/api/profile/${encodeURIComponent(username)}`),
        _apiFetch(`/api/profile/${encodeURIComponent(username)}/games`),
      ]);
      _renderHeader(stats);
      _renderStats(stats);
      _renderHistory(games);
    } catch {
      document.getElementById('stats-grid').innerHTML   = '<p class="profile-error">Impossible de charger le profil.</p>';
      document.getElementById('history-list').innerHTML = '';
    }
  }

  function init() {
    _setupTabs();

    document.getElementById('btn-profile-back').addEventListener('click', () => {
      UI.showScreen('screen-lobby');
      Socket.emit('list-rooms');
    });

    document.getElementById('btn-profile-logout').addEventListener('click', () => {
      if (confirm('Se déconnecter ?')) {
        Auth.logout();
        location.reload();
      }
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  async function _apiFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res  = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur réseau');
    return data;
  }

  function _setupTabs() {
    document.querySelectorAll('.profile-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.add('hidden'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById(`profile-tab-${tab}`).classList.remove('hidden');
        if (tab === 'friends') _loadFriendsTab();
      });
    });
  }

  function _renderHeader(s) {
    const progress = ((s.rankPoints % 1) * 100).toFixed(0);
    document.getElementById('profile-rank-badge').textContent = s.rank > 0 ? `[${s.rank}]` : '';
    document.getElementById('profile-rank').textContent       = s.rank;
    document.getElementById('profile-rank-fill').style.width  = `${progress}%`;
    document.getElementById('profile-rank-pts').textContent   = `${s.rankPoints.toFixed(2)} pts • ${progress}% vers rang ${s.rank + 1}`;
  }

  function _stat(label, value, sub = '') {
    return `<div class="stat-card">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;
  }

  function _renderStats(s) {
    const fav = s.favouriteCharacter ? (CHAR_NAMES[s.favouriteCharacter] || s.favouriteCharacter) : '—';
    document.getElementById('stats-grid').innerHTML = [
      _stat('Victoires',        s.wins,    s.gamesPlayed > 0 ? `sur ${s.gamesPlayed} partie${s.gamesPlayed > 1 ? 's' : ''}` : ''),
      _stat('Win Rate',         `${s.winRate}%`),
      _stat('Dégâts infligés',  s.totalDamageDealt.toLocaleString('fr-FR')),
      _stat('Dégâts reçus',     s.totalDamageReceived.toLocaleString('fr-FR')),
      _stat('Bombes posées',    s.totalBombsPlaced.toLocaleString('fr-FR')),
      _stat('Sorts utilisés',   s.totalSpellsUsed.toLocaleString('fr-FR')),
      _stat('Personnage favori',fav),
    ].join('');
  }

  function _renderHistory(games) {
    const list = document.getElementById('history-list');
    if (!Array.isArray(games) || games.length === 0) {
      list.innerHTML = '<p class="profile-empty">Aucune partie enregistrée.</p>';
      return;
    }
    list.innerHTML = games.map(g => {
      const medal      = MEDALS[g.finishRank] || `${g.finishRank}e`;
      const charName   = CHAR_NAMES[g.character] || g.character;
      const date       = new Date(g.playedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const resultCls  = g.finishRank === 1 ? 'result-win' : g.finishRank === g.playerCount ? 'result-last' : '';
      return `<div class="history-entry ${resultCls}">
        <div class="history-rank">${medal}</div>
        <div class="history-info">
          <span class="history-char">${charName}</span>
          <span class="history-players">${g.playerCount} joueurs</span>
        </div>
        <div class="history-stats">
          <span title="Dégâts infligés">⚔️ ${g.damageDealt}</span>
          <span title="Bombes posées">💣 ${g.bombsPlaced}</span>
        </div>
        <div class="history-date">${date}</div>
      </div>`;
    }).join('');
  }

  // ── Friends tab ───────────────────────────────────────────────────────────

  const STATUS_ICON  = { lobby: '🟢', room: '🟡', playing: '🟠', offline: '⚫' };
  const STATUS_LABEL = { lobby: 'En ligne', room: 'En salle', playing: 'En partie', offline: 'Hors ligne' };

  async function _loadFriendsTab() {
    const box = document.getElementById('friends-content');
    box.innerHTML = '<p class="profile-loading">Chargement…</p>';
    try {
      const [friends, requests] = await Promise.all([
        _apiFetch('/api/friends'),
        _apiFetch('/api/friends/requests'),
      ]);
      _renderFriends(friends, requests);
    } catch (err) {
      box.innerHTML = `<p class="profile-error">${err.message}</p>`;
    }
  }

  function _renderFriends(friends, requests) {
    const box = document.getElementById('friends-content');
    let html = '';

    // Pending incoming requests
    if (requests.length) {
      html += `<div class="friends-section-title">Demandes reçues (${requests.length})</div>`;
      html += requests.map(r => `
        <div class="friend-entry">
          <div class="friend-info">
            <span class="friend-name">${r.username}</span>
            ${r.rank > 0 ? `<span class="rank-badge">[${r.rank}]</span>` : ''}
          </div>
          <div class="friend-btns">
            <button class="btn-friend-accept" data-id="${r.id}" title="Accepter">✓</button>
            <button class="btn-friend-decline" data-id="${r.id}" title="Refuser">✕</button>
          </div>
        </div>`).join('');
    }

    // Friend list
    html += `<div class="friends-section-title">Amis (${friends.length})</div>`;
    if (!friends.length) {
      html += '<p class="profile-empty">Aucun ami pour l\'instant.</p>';
    } else {
      html += friends.map(f => `
        <div class="friend-entry">
          <span class="friend-dot" title="${STATUS_LABEL[f.status] || 'Hors ligne'}">${STATUS_ICON[f.status] || '⚫'}</span>
          <div class="friend-info">
            <span class="friend-name">${f.username}</span>
            ${f.rank > 0 ? `<span class="rank-badge">[${f.rank}]</span>` : ''}
            <span class="friend-status-txt">${STATUS_LABEL[f.status] || 'Hors ligne'}</span>
          </div>
          <button class="btn-friend-remove" data-id="${f.id}" title="Supprimer">🗑</button>
        </div>`).join('');
    }

    // Add friend
    html += `
      <div class="friends-section-title">Ajouter un ami</div>
      <div class="friend-add-row">
        <input type="text" id="friend-add-input" placeholder="Pseudo exact…" autocomplete="off" maxlength="16">
        <button id="btn-friend-send">Envoyer</button>
      </div>
      <p id="friend-add-msg" class="friend-add-msg hidden"></p>`;

    box.innerHTML = html;

    // Wire events
    box.querySelectorAll('.btn-friend-accept').forEach(btn =>
      btn.addEventListener('click', async () => {
        await _apiFetch(`/api/friends/accept/${btn.dataset.id}`, { method: 'POST' });
        _loadFriendsTab();
      })
    );
    box.querySelectorAll('.btn-friend-decline').forEach(btn =>
      btn.addEventListener('click', async () => {
        await _apiFetch(`/api/friends/${btn.dataset.id}`, { method: 'DELETE' });
        _loadFriendsTab();
      })
    );
    box.querySelectorAll('.btn-friend-remove').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (confirm('Supprimer cet ami ?')) {
          await _apiFetch(`/api/friends/${btn.dataset.id}`, { method: 'DELETE' });
          _loadFriendsTab();
        }
      })
    );
    document.getElementById('btn-friend-send').addEventListener('click', async () => {
      const input = document.getElementById('friend-add-input');
      const msg   = document.getElementById('friend-add-msg');
      const name  = input.value.trim();
      if (!name) return;
      msg.className = 'friend-add-msg hidden';
      try {
        const res = await _apiFetch('/api/friends/request', {
          method: 'POST',
          body: JSON.stringify({ username: name }),
        });
        msg.textContent = res.message;
        msg.className = 'friend-add-msg ok';
        input.value = '';
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'friend-add-msg err';
      }
    });
    document.getElementById('friend-add-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-friend-send').click();
    });
  }

  // Called by main.js when a friend-status-changed event arrives
  function refreshFriendsIfOpen() {
    const friendsTab = document.getElementById('profile-tab-friends');
    if (!friendsTab || friendsTab.classList.contains('hidden')) return;
    _loadFriendsTab();
  }

  return { init, show, refreshFriendsIfOpen };
})();
