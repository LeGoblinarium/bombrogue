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

  async function _apiFetch(url) {
    const res  = await fetch(url);
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
        document.getElementById(`profile-tab-${btn.dataset.tab}`).classList.remove('hidden');
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

  return { init, show };
})();
