(function () {
  let myName = '';
  let myRoomCode = '';
  let hostId = null;
  let myId = null;
  let pa = 8, pm = 4;
  let myCharacter = 'player';
  let renderLoopStarted = false;
  let gameInitialized = false;
  let isPublic = true; // room visibility

  Audio.init();
  Bubbles.init();
  Emotes.init();

  // Init auth before socket so token is ready for handshake
  Auth.init().then(updateAuthButton);
  Socket.connect();

  // Start music on first user interaction (browser autoplay policy)
  document.addEventListener('pointerdown', () => Audio.startMusic(), { once: true, passive: true });

  const CHAR_NAMES = { player: 'Bob', merlin: 'Merlin', kael: 'Kael', borin: 'Borin', alaric: 'Alaric', mordek: 'Mordek' };
  let hasCustomName = false; // true if player typed a name manually

  function resolvePlayerName() {
    const typed = document.getElementById('player-name').value.trim();
    if (typed) {
      hasCustomName = true;
      return typed;
    }
    hasCustomName = false;
    return CHAR_NAMES[myCharacter] || 'Bob';
  }

  function updateAuthButton() {
    const btn = document.getElementById('btn-auth');
    const user = Auth.getUser();
    if (user) {
      btn.textContent = `👤 ${user.username} [${user.rank}]`;
      btn.classList.add('logged-in');
      // Pre-fill player name with account username if not already customised
      const nameInput = document.getElementById('player-name');
      if (!hasCustomName && nameInput && !nameInput.value) nameInput.value = user.username;
    } else {
      btn.textContent = '👤 Connexion';
      btn.classList.remove('logged-in');
    }
  }

  function setupAuthHandler() {
    const modal   = document.getElementById('auth-modal');
    const btnAuth = document.getElementById('btn-auth');
    const btnClose = document.getElementById('auth-modal-close');
    const tabs    = document.querySelectorAll('.auth-tab');
    const formLogin = document.getElementById('auth-form-login');
    const formReg   = document.getElementById('auth-form-register');
    const errLogin  = document.getElementById('auth-error');
    const errReg    = document.getElementById('auth-error-reg');

    function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
    function clearErrors() { errLogin.classList.add('hidden'); errReg.classList.add('hidden'); }

    btnAuth.addEventListener('click', () => {
      if (Auth.isLoggedIn()) {
        // Already logged in → show logout option via quick toast for now
        if (confirm(`Déconnexion de ${Auth.getUser().username} ?`)) {
          Auth.logout();
          updateAuthButton();
          UI.showToast('Déconnecté');
        }
        return;
      }
      clearErrors();
      modal.classList.remove('hidden');
    });

    btnClose.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        clearErrors();
        if (tab.dataset.tab === 'login') {
          formLogin.classList.remove('hidden');
          formReg.classList.add('hidden');
        } else {
          formReg.classList.remove('hidden');
          formLogin.classList.add('hidden');
        }
      });
    });

    document.getElementById('btn-login').addEventListener('click', async () => {
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (!username || !password) { showError(errLogin, 'Remplis tous les champs'); return; }
      try {
        await Auth.login(username, password);
        modal.classList.add('hidden');
        updateAuthButton();
        UI.showToast(`Connecté en tant que ${Auth.getUser().username}`);
      } catch (e) { showError(errLogin, e.message); }
    });

    document.getElementById('btn-register').addEventListener('click', async () => {
      const username = document.getElementById('register-username').value.trim();
      const password = document.getElementById('register-password').value;
      const confirm  = document.getElementById('register-password-confirm').value;
      if (!username || !password || !confirm) { showError(errReg, 'Remplis tous les champs'); return; }
      if (password !== confirm) { showError(errReg, 'Les mots de passe ne correspondent pas'); return; }
      try {
        await Auth.register(username, password);
        modal.classList.add('hidden');
        updateAuthButton();
        UI.showToast(`Compte créé ! Bienvenue ${Auth.getUser().username}`);
      } catch (e) { showError(errReg, e.message); }
    });

    // Enter key support
    document.getElementById('login-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-login').click();
    });
    document.getElementById('register-password-confirm').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-register').click();
    });
    document.getElementById('register-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('register-password-confirm').focus();
    });
  }

  function setupLobbyHandlers() {
    document.getElementById('btn-create').addEventListener('click', () => {
      const name = resolvePlayerName();
      const roomName = document.getElementById('room-name').value.trim() || `Partie de ${name}`;
      myName = name;
      Socket.emit('create-room', { playerName: name, roomName, isPublic });
    });

    document.getElementById('btn-join').addEventListener('click', () => {
      const name = resolvePlayerName();
      const code = document.getElementById('room-code').value.trim().toUpperCase();
      if (!code || code.length !== 4) { UI.showError('Code à 4 caractères'); return; }
      myName = name;
      Socket.emit('join-room', { code, playerName: name });
    });

    document.getElementById('room-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    // Visibility toggle
    document.getElementById('vis-public').addEventListener('click', () => {
      isPublic = true;
      document.getElementById('vis-public').classList.add('active');
      document.getElementById('vis-private').classList.remove('active');
    });
    document.getElementById('vis-private').addEventListener('click', () => {
      isPublic = false;
      document.getElementById('vis-private').classList.add('active');
      document.getElementById('vis-public').classList.remove('active');
    });

    // Room browser
    document.getElementById('btn-refresh-rooms').addEventListener('click', () => {
      Socket.emit('list-rooms');
    });

    // Request initial room list
    Socket.emit('list-rooms');
  }

  function renderRoomList(rooms) {
    const list = document.getElementById('room-list');
    if (!rooms || rooms.length === 0) {
      list.innerHTML = '<div class="room-list-empty">Aucune partie disponible</div>';
      return;
    }
    list.innerHTML = '';
    for (const room of rooms) {
      const entry = document.createElement('div');
      entry.className = 'room-entry';

      if (room.inProgress) {
        // In-progress room with available disconnected slots
        const n = room.disconnectedCount;
        entry.innerHTML = `
          <div class="room-entry-info">
            <div class="room-entry-name">${escapeHtml(room.name)} <span class="badge-inprogress">En cours</span></div>
            <div class="room-entry-count">${n} personnage${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}</div>
          </div>
          <button class="btn-join-room">Rejoindre</button>
        `;
        entry.querySelector('.btn-join-room').addEventListener('click', () => {
          const name = resolvePlayerName();
          myName = name;
          Socket.emit('join-room', { code: room.code, playerName: name });
        });
      } else {
        const full = room.playerCount >= room.maxPlayers;
        entry.innerHTML = `
          <div class="room-entry-info">
            <div class="room-entry-name">${escapeHtml(room.name)}</div>
            <div class="room-entry-count">${room.playerCount}/${room.maxPlayers} joueurs</div>
          </div>
          <button class="btn-join-room" ${full ? 'disabled' : ''}>Rejoindre</button>
        `;
        if (!full) {
          entry.querySelector('.btn-join-room').addEventListener('click', () => {
            const name = resolvePlayerName();
            myName = name;
            Socket.emit('join-room', { code: room.code, playerName: name });
          });
        }
      }
      list.appendChild(entry);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function setupObstacleSlider() {
    const slider = document.getElementById('obstacle-slider');
    const valueEl = document.getElementById('obstacle-value');

    function syncSliderUI(val) {
      slider.value = val;
      slider.style.setProperty('--val', val);
      valueEl.textContent = val;
    }

    syncSliderUI(30); // default

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value);
      syncSliderUI(val);
      Socket.emit('set-obstacle-count', { count: val });
    });
  }

  function setupTurnDurationSlider() {
    const slider  = document.getElementById('turn-duration-slider');
    const valueEl = document.getElementById('turn-duration-value');

    function syncSliderUI(seconds) {
      slider.value = seconds;
      slider.style.setProperty('--val', seconds);
      valueEl.textContent = seconds + 's';
    }

    syncSliderUI(60); // default

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value);
      syncSliderUI(val);
      Socket.emit('set-turn-duration', { seconds: val });
    });
  }

  function setupRoomHandlers() {
    document.getElementById('pa-plus').addEventListener('click', () => {
      if (pm > 2) { pm--; pa++; sendDistribution(); }
    });
    document.getElementById('pa-minus').addEventListener('click', () => {
      if (pm < 6) { pm++; pa--; sendDistribution(); }
    });
    document.getElementById('pm-plus').addEventListener('click', () => {
      if (pm < 6) { pm++; pa--; sendDistribution(); }
    });
    document.getElementById('pm-minus').addEventListener('click', () => {
      if (pm > 2) { pm--; pa++; sendDistribution(); }
    });
    document.getElementById('btn-start').addEventListener('click', () => {
      Socket.emit('start-game');
    });
  }

  function setupCharacterHandler() {
    document.getElementById('char-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.char-card');
      if (!card) return;
      const char = card.dataset.char;
      if (!char || char === myCharacter) return;
      myCharacter = char;
      // Update selected state visually
      document.querySelectorAll('.char-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.char === myCharacter);
      });
      Socket.emit('set-character', { character: myCharacter });

      // If no custom name, sync name to new character name
      if (!hasCustomName) {
        myName = CHAR_NAMES[myCharacter] || 'Bob';
        Socket.emit('set-name', { name: myName });
      }
    });
  }

  function syncCharacterUI(character) {
    myCharacter = character || 'player';
    document.querySelectorAll('.char-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.char === myCharacter);
    });
  }

  function setupLeaveRoomHandler() {
    document.getElementById('btn-leave-room').addEventListener('click', () => {
      Socket.emit('leave-room');
      myId = null; myRoomCode = ''; hostId = null;
      pa = 10; pm = 2; myCharacter = 'player';
      UI.showScreen('screen-lobby');
      Socket.emit('list-rooms');
    });
  }

  function setupReplayHandler() {
    document.getElementById('btn-replay').addEventListener('click', () => {
      const btn = document.getElementById('btn-replay');
      btn.disabled = true;
      btn.textContent = 'En attente...';
      Socket.emit('propose-replay');
    });
  }

  function setupMainMenuHandler() {
    document.getElementById('btn-main-menu').addEventListener('click', () => {
      Bubbles.clear();
      Emotes.clear();
      // Leave current room
      Socket.emit('leave-room');
      // Reset local state
      myId = null;
      myRoomCode = '';
      hostId = null;
      pa = 10; pm = 2;
      myCharacter = 'player';
      // Hide game over overlay
      document.getElementById('gameover-overlay').classList.remove('visible');
      // Return to lobby and refresh room list
      UI.showScreen('screen-lobby');
      Socket.emit('list-rooms');
    });
  }

  function setupMusicHandler() {
    const btn = document.getElementById('btn-music');

    // Apply initial muted state (restored from localStorage inside Audio)
    function syncMusicBtn() {
      btn.classList.toggle('muted', Audio.isMusicMuted());
      btn.setAttribute('aria-label', Audio.isMusicMuted() ? 'Musique coupée' : 'Musique');
    }
    syncMusicBtn();

    btn.addEventListener('click', () => {
      // Start music on first interaction (satisfies browser autoplay policy)
      Audio.startMusic();
      Audio.toggleMusic();
      syncMusicBtn();
    });
  }

  function setupHelpHandler() {
    const btn = document.getElementById('btn-help');
    const overlay = document.getElementById('help-overlay');

    // Restore saved position or default to bottom-right
    const saved = JSON.parse(localStorage.getItem('helpBtnPos') || 'null');
    if (saved) {
      btn.style.left = saved.x + 'px';
      btn.style.top  = saved.y + 'px';
    } else {
      btn.style.right  = '12px';
      btn.style.bottom = '80px';
    }

    let startX, startY, startLeft, startTop, dragged;
    const DRAG_THRESHOLD = 6;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      dragged = false;

      const rect = btn.getBoundingClientRect();
      startX    = e.clientX;
      startY    = e.clientY;
      startLeft = rect.left;
      startTop  = rect.top;

      // Switch from right/bottom anchoring to left/top for dragging
      btn.style.right  = 'auto';
      btn.style.bottom = 'auto';
      btn.style.left   = startLeft + 'px';
      btn.style.top    = startTop  + 'px';
    });

    btn.addEventListener('pointermove', (e) => {
      if (!btn.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragged && Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) {
        dragged = true;
        btn.classList.add('dragging');
      }
      if (!dragged) return;

      const W = window.innerWidth, H = window.innerHeight;
      const x = Math.max(0, Math.min(W - btn.offsetWidth,  startLeft + dx));
      const y = Math.max(0, Math.min(H - btn.offsetHeight, startTop  + dy));
      btn.style.left = x + 'px';
      btn.style.top  = y + 'px';
    });

    btn.addEventListener('pointerup', (e) => {
      btn.classList.remove('dragging');
      if (!dragged) {
        overlay.classList.remove('hidden');
      } else {
        localStorage.setItem('helpBtnPos', JSON.stringify({
          x: parseFloat(btn.style.left),
          y: parseFloat(btn.style.top),
        }));
      }
    });

    document.getElementById('btn-help-close').addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }

  function sendDistribution() {
    UI.updateDistribution(pa, pm);
    Socket.emit('set-distribution', { pa, pm });
  }

  function startRenderLoop() {
    if (renderLoopStarted) return;
    renderLoopStarted = true;
    function loop() {
      const state = GameClient.getState();
      if (state) {
        Renderer.render(state, Input.getHighlights());
        Bubbles.tick(state);
        Emotes.tick(state);
      }
      requestAnimationFrame(loop);
    }
    loop();
  }

  function resetGameOverOverlay() {
    const overlay = document.getElementById('gameover-overlay');
    overlay.classList.remove('visible');
    const btn = document.getElementById('btn-replay');
    btn.disabled = false;
    btn.textContent = 'Rejouer';
    document.getElementById('replay-votes-msg').textContent = '';
  }

  // --- Socket handlers ---
  Socket.on('onError', (msg) => UI.showError(msg));

  Socket.on('onRoomCreated', ({ code }) => {
    myRoomCode = code;
    document.getElementById('room-code-display').textContent = code;
    UI.showScreen('screen-room');
  });

  Socket.on('onRoomJoined', ({ players, you, hostId: hid }) => {
    myId = you;
    hostId = hid;
    if (!myRoomCode) {
      const codeFromInput = document.getElementById('room-code').value.trim().toUpperCase();
      myRoomCode = codeFromInput;
    }
    document.getElementById('room-code-display').textContent = myRoomCode;
    UI.showScreen('screen-room');
    UI.renderPlayersList(players, hostId, myId);
    updateStartButton(players);
    const me = players.find(p => p.id === myId);
    if (me) { pa = me.pa; pm = me.pm; UI.updateDistribution(pa, pm); syncCharacterUI(me.character); }
  });

  Socket.on('onPlayerJoined', ({ players }) => {
    UI.renderPlayersList(players, hostId, myId);
    updateStartButton(players);
  });

  Socket.on('onPlayerLeft', ({ players, hostId: hid }) => {
    hostId = hid;
    UI.renderPlayersList(players, hostId, myId);
    updateStartButton(players);

    // If we're on the game-over screen, keep players informed of departures
    const overlay = document.getElementById('gameover-overlay');
    if (!overlay.classList.contains('visible')) return;

    const others = players.filter(p => p.id !== myId);
    if (others.length === 0) {
      // Everyone left — no point waiting, bring us back to lobby
      Bubbles.clear();
      Emotes.clear();
      Socket.emit('leave-room');
      myId = null; myRoomCode = ''; hostId = null;
      pa = 10; pm = 2; myCharacter = 'player';
      overlay.classList.remove('visible');
      UI.showScreen('screen-lobby');
      Socket.emit('list-rooms');
      UI.showToast('Tous les joueurs ont quitté.');
    } else {
      // Some left — update the waiting message
      const msg = document.getElementById('replay-votes-msg');
      if (msg) {
        const n = others.length;
        msg.textContent = `Un joueur a quitté — ${n} joueur${n > 1 ? 's' : ''} encore en partie.`;
      }
    }
  });

  Socket.on('onDistributionUpdated', ({ players }) => {
    UI.renderPlayersList(players, hostId, myId);
  });

  function updateStartButton(players) {
    const btn = document.getElementById('btn-start');
    const wait = document.getElementById('waiting-msg');
    const obstacleSection = document.getElementById('obstacle-section');
    const turnDurSection  = document.getElementById('turn-duration-section');
    const isHost = myId === hostId;
    if (isHost) {
      btn.style.display = 'block';
      wait.style.display = 'none';
      obstacleSection.style.display = 'block';
      turnDurSection.style.display  = 'block';
      btn.disabled = players.length < 2;
      btn.textContent = players.length < 2 ? 'En attente de joueurs...' : 'Lancer la partie';
    } else {
      btn.style.display = 'none';
      wait.style.display = 'block';
      obstacleSection.style.display = 'none';
      turnDurSection.style.display  = 'none';
    }
  }

  Socket.on('onGameStart', (data) => {
    resetGameOverOverlay();
    Animations.resetDeadIds();
    Bubbles.clear();
    Emotes.clear();
    GameClient.init(data.state, myId);
    UI.showScreen('screen-game');

    const canvas = document.getElementById('game-canvas');
    if (!gameInitialized) {
      Renderer.init(canvas);
      Input.init(canvas);
      gameInitialized = true;
      startRenderLoop();
    } else {
      // Canvas was hidden during room screen — recompute its size
      requestAnimationFrame(() => Renderer.resize());
    }

    Input.setMode('move');
    UI.renderHpBars(data.state);
    UI.updateTurnInfo(data.state);
    UI.renderResources(data.state.players.find(p => p.id === myId));
    const isMine = data.state.currentTurn.playerId === myId;
    GameClient.setMyTurn(isMine, data.state.currentTurn.timeLeft);
    UI.renderSpellBar(data.state, isMine);
    UI.updateTimer(data.state.currentTurn.timeLeft);
    Input.refreshHighlights();
  });

  function detectAndAnimateDeaths(newPlayers) {
    const prevState = GameClient.getState();
    if (!prevState || !newPlayers) return;
    for (const np of newPlayers) {
      const op = prevState.players.find(p => p.id === np.id);
      if (op && op.alive && !np.alive) {
        Animations.addDeathAnimation(
          np.id, op.x, op.y,
          op.character || 'player',
          op.colorIndex,
          Animations.getPlayerFacing(np.id)
        );
      }
    }
  }

  Socket.on('onTurnStart', (data) => {
    // Detect zone/wall damage applied at turn start
    const prevStateTurn = GameClient.getState();
    if (prevStateTurn && data.players) {
      for (const np of data.players) {
        const op = prevStateTurn.players.find(p => p.id === np.id);
        if (op && np.hp < op.hp) {
          Animations.addHitReaction(np.id);
          if (np.id === myId && navigator.vibrate) navigator.vibrate(150);
        }
      }
    }
    detectAndAnimateDeaths(data.players);
    GameClient.patchState({ currentTurn: data.currentTurn, players: data.players, bombs: data.bombs, bonuses: data.bonuses, obstacles: data.obstacles, walls: data.walls });
    const state = GameClient.getState();
    UI.renderHpBars(state);
    UI.updateTurnInfo(state);
    UI.renderResources(state.players.find(p => p.id === myId));
    const isMine = data.currentTurn.playerId === myId;
    GameClient.setMyTurn(isMine, data.currentTurn.timeLeft);
    UI.renderSpellBar(state, isMine);
    UI.updateTimer(data.currentTurn.timeLeft);
    Input.setMode('move');
    UI.updateSpellSelection(null);
    Input.refreshHighlights();
    if (isMine) {
      Audio.play('Turn_start');
      // Flash the border with my player color to signal it's my turn
      const me = state.players.find(p => p.id === myId);
      UI.showTurnFlash(me ? COLORS[me.colorIndex] : '#4ECDC4');
    } else {
      UI.hideTurnFlash();
    }
  });

  Socket.on('onStateUpdate', (delta) => {
    // Detect damage from spells/explosions/wall crossings
    if (delta.players) {
      const prevStateUpd = GameClient.getState();
      if (prevStateUpd) {
        for (const np of delta.players) {
          const op = prevStateUpd.players.find(p => p.id === np.id);
          if (op && np.hp < op.hp) {
            Animations.addHitReaction(np.id);
            if (np.id === myId && navigator.vibrate) navigator.vibrate(150);
          }
        }
      }
    }
    detectAndAnimateDeaths(delta.players);
    if (delta.movements) {
      for (const m of delta.movements) {
        if (m.path && m.path.length >= 2) {
          Animations.addEntityMovement(m.id, m.type, m.path);
        }
      }
    }
    if (delta.actionType) Audio.playForAction(delta.actionType, delta.wallsCreated);

    // Deferred bonus pickup: re-add picked-up bonuses to delta so they stay
    // visible during the walk animation, then remove them step by step.
    const MS_PER_CELL = 180;
    if (delta.bonusPickups && delta.bonusPickups.length > 0 && delta.bonuses !== undefined) {
      for (const pu of delta.bonusPickups) {
        delta.bonuses.push({ x: pu.x, y: pu.y, type: pu.type });
      }
      for (const pu of delta.bonusPickups) {
        // Player reaches pathData.path[stepIndex] after (stepIndex+1) cells of travel
        const delay = (pu.stepIndex + 1) * MS_PER_CELL;
        setTimeout(() => {
          const s = GameClient.getState();
          if (!s) return;
          const idx = s.bonuses.findIndex(b => b.x === pu.x && b.y === pu.y);
          if (idx !== -1) s.bonuses.splice(idx, 1);
          Audio.play('Bonus');
        }, delay);
      }
    } else if (delta.bonusPickedUp) {
      // Instant pickup (e.g. player teleported onto a bonus)
      Audio.play('Bonus');
    }

    // Bomb throw animation: detect newly placed bomb before state is patched
    if (delta.actionType === 'place-bomb' && delta.bombs) {
      const prevStateBomb = GameClient.getState();
      if (prevStateBomb && prevStateBomb.bombs) {
        for (const bomb of delta.bombs) {
          const wasPresent = prevStateBomb.bombs.some(b => b.id === bomb.id);
          if (!wasPresent) {
            const currentTurn = prevStateBomb.currentTurn;
            if (currentTurn) {
              const placer = prevStateBomb.players.find(p => p.id === currentTurn.playerId);
              if (placer) {
                Animations.addBombThrow(bomb.id, placer.x, placer.y, bomb.x, bomb.y);
              }
            }
          }
        }
      }
    }

    GameClient.patchState(delta);
    const state = GameClient.getState();
    UI.renderHpBars(state);
    UI.renderResources(state.players.find(p => p.id === myId));
    const isMine = state.currentTurn && state.currentTurn.playerId === myId;
    UI.renderSpellBar(state, isMine);
    Input.refreshHighlights();
  });

  Socket.on('onDetonationResult', (data) => {
    Animations.addExplosionSequence(data.sequence);
    Audio.play('Explosion');
  });

  Socket.on('onGameOver', (data) => {
    Bubbles.clear();
    Emotes.clear();
    // Trigger death animations for players who just died
    const state = GameClient.getState();
    if (state) {
      for (const stat of data.stats) {
        if (!stat.alive) {
          const p = state.players.find(pp => pp.id === stat.id);
          if (p && p.alive) {
            Animations.addDeathAnimation(p.id, p.x, p.y, p.character || 'player', p.colorIndex, Animations.getPlayerFacing(p.id));
          }
        }
      }
    }
    UI.renderGameOver(data);
    setTimeout(() => {
      document.getElementById('gameover-overlay').classList.add('visible');
    }, 2000);
  });

  Socket.on('onReplayProposed', ({ voterNames, total }) => {
    const msg = document.getElementById('replay-votes-msg');
    if (!msg) return;
    const waiting = total - voterNames.length;
    if (waiting > 0) {
      msg.textContent = `${voterNames.join(', ')} ${voterNames.length > 1 ? 'proposent' : 'propose'} de rejouer — en attente de ${waiting} joueur${waiting > 1 ? 's' : ''}`;
    }
  });

  Socket.on('onReplayReady', (data) => {
    resetGameOverOverlay();
    hostId = data.hostId;
    const me = data.players.find(p => p.id === myId);
    if (me) { pa = me.pa; pm = me.pm; UI.updateDistribution(pa, pm); syncCharacterUI(me.character); }
    UI.renderPlayersList(data.players, data.hostId, myId);
    updateStartButton(data.players);
    UI.showScreen('screen-room');
  });

  Socket.on('onRoomsUpdated', (rooms) => {
    renderRoomList(rooms);
  });

  Socket.on('onPlayerEmote', ({ playerId, emoji }) => {
    Emotes.show(playerId, emoji, GameClient.getState());
  });

  // --- Reconnection / disconnect handlers ---

  let pendingRejoinCode = null;

  Socket.on('onGameInProgress', ({ code, name, slots }) => {
    pendingRejoinCode = code;
    // Populate the rejoin modal with available character slots
    const container = document.getElementById('rejoin-slots');
    container.innerHTML = '';
    for (const slot of slots) {
      const color = COLORS[slot.colorIndex] || '#ffffff';
      const card = document.createElement('button');
      card.className = 'rejoin-card';
      card.innerHTML = `
        <img src="/images/${escapeHtml(slot.character || 'player')}.png" alt="${escapeHtml(slot.name)}" draggable="false">
        <span class="rejoin-card-name">${escapeHtml(slot.name)}</span>
        <span class="rejoin-card-dot" style="background:${color}"></span>
      `;
      card.addEventListener('click', () => {
        Socket.emit('claim-slot', { code: pendingRejoinCode, targetPlayerId: slot.id });
        document.getElementById('rejoin-modal').classList.add('hidden');
      });
      container.appendChild(card);
    }
    document.getElementById('rejoin-modal').classList.remove('hidden');
  });

  Socket.on('onGameRejoin', ({ state, yourPlayerId }) => {
    // Enter the game as the reclaimed character
    myId = yourPlayerId;
    resetGameOverOverlay();
    Animations.resetDeadIds();
    GameClient.init(state, myId);
    UI.showScreen('screen-game');

    const canvas = document.getElementById('game-canvas');
    if (!gameInitialized) {
      Renderer.init(canvas);
      Input.init(canvas);
      gameInitialized = true;
      startRenderLoop();
    } else {
      requestAnimationFrame(() => Renderer.resize());
    }

    Input.setMode('move');
    UI.renderHpBars(state);
    UI.updateTurnInfo(state);
    UI.renderResources(state.players.find(p => p.id === myId));
    const isMine = state.currentTurn.playerId === myId;
    GameClient.setMyTurn(isMine, state.currentTurn.timeLeft);
    UI.renderSpellBar(state, isMine);
    UI.updateTimer(state.currentTurn.timeLeft);
    Input.refreshHighlights();
  });

  Socket.on('onPlayerDisconnected', ({ playerId }) => {
    const state = GameClient.getState();
    if (!state) return;
    const p = state.players.find(pp => pp.id === playerId);
    if (p) UI.showToast(`${p.name} s'est déconnecté(e)`);
  });

  Socket.on('onPlayerReconnected', ({ playerId }) => {
    const state = GameClient.getState();
    // Hide pause overlay if visible
    document.getElementById('game-paused-overlay').classList.add('hidden');
    if (!state) return;
    const p = state.players.find(pp => pp.id === playerId);
    if (p) UI.showToast(`${p.name} a rejoint la partie`);
  });

  Socket.on('onGamePaused', () => {
    document.getElementById('game-paused-overlay').classList.remove('hidden');
  });

  Socket.on('onGameResumed', () => {
    document.getElementById('game-paused-overlay').classList.add('hidden');
  });

  Socket.on('onTurnSkipped', ({ playerId }) => {
    const state = GameClient.getState();
    if (!state) return;
    const p = state.players.find(pp => pp.id === playerId);
    if (p) UI.showToast(`Tour de ${p.name} passé (déconnecté)`);
  });

  Socket.on('onObstacleCountUpdated', ({ obstacleCount }) => {
    // Non-host players see the updated value display (slider stays hidden)
    document.getElementById('obstacle-value').textContent = obstacleCount;
    const slider = document.getElementById('obstacle-slider');
    slider.value = obstacleCount;
    slider.style.setProperty('--val', obstacleCount);
  });

  Socket.on('onTurnDurationUpdated', ({ turnDurationMs }) => {
    const seconds = turnDurationMs / 1000;
    document.getElementById('turn-duration-value').textContent = seconds + 's';
    const slider = document.getElementById('turn-duration-slider');
    slider.value = seconds;
    slider.style.setProperty('--val', seconds);
  });

  // Rejoin modal cancel button
  document.getElementById('btn-rejoin-cancel').addEventListener('click', () => {
    document.getElementById('rejoin-modal').classList.add('hidden');
    pendingRejoinCode = null;
  });

  setupAuthHandler();
  setupLobbyHandlers();
  setupRoomHandlers();
  setupLeaveRoomHandler();
  setupObstacleSlider();
  setupTurnDurationSlider();
  setupCharacterHandler();
  setupReplayHandler();
  setupMainMenuHandler();
  setupMusicHandler();
  setupHelpHandler();
})();
