(function () {
  let myName = '';
  let myRoomCode = '';
  let hostId = null;
  let myId = null;
  let pa = 10, pm = 2;
  let renderLoopStarted = false;

  Audio.init();
  Socket.connect();

  function setupLobbyHandlers() {
    document.getElementById('btn-create').addEventListener('click', () => {
      const name = document.getElementById('player-name').value.trim();
      if (!name) { UI.showError('Entre ton nom'); return; }
      myName = name;
      Socket.emit('create-room', { playerName: name });
    });

    document.getElementById('btn-join').addEventListener('click', () => {
      const name = document.getElementById('player-name').value.trim();
      const code = document.getElementById('room-code').value.trim().toUpperCase();
      if (!name) { UI.showError('Entre ton nom'); return; }
      if (!code || code.length !== 4) { UI.showError('Code à 4 caractères'); return; }
      myName = name;
      Socket.emit('join-room', { code, playerName: name });
    });

    document.getElementById('room-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
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

  function setupReplayHandler() {
    document.getElementById('btn-replay').addEventListener('click', () => {
      window.location.reload();
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
      }
      requestAnimationFrame(loop);
    }
    loop();
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
    if (me) { pa = me.pa; pm = me.pm; UI.updateDistribution(pa, pm); }
  });

  Socket.on('onPlayerJoined', ({ players }) => {
    UI.renderPlayersList(players, hostId, myId);
    updateStartButton(players);
  });

  Socket.on('onPlayerLeft', ({ players, hostId: hid }) => {
    hostId = hid;
    UI.renderPlayersList(players, hostId, myId);
    updateStartButton(players);
  });

  Socket.on('onDistributionUpdated', ({ players }) => {
    UI.renderPlayersList(players, hostId, myId);
  });

  function updateStartButton(players) {
    const btn = document.getElementById('btn-start');
    const wait = document.getElementById('waiting-msg');
    if (myId === hostId) {
      btn.style.display = 'block';
      wait.style.display = 'none';
      btn.disabled = players.length < 2;
      btn.textContent = players.length < 2 ? 'En attente de joueurs...' : 'Lancer la partie';
    } else {
      btn.style.display = 'none';
      wait.style.display = 'block';
    }
  }

  Socket.on('onGameStart', (data) => {
    GameClient.init(data.state, myId);
    UI.showScreen('screen-game');

    const canvas = document.getElementById('game-canvas');
    Renderer.init(canvas);
    Input.init(canvas);
    Input.setMode('move');

    UI.renderHpBars(data.state);
    UI.updateTurnInfo(data.state);
    UI.renderResources(data.state.players.find(p => p.id === myId));
    const isMine = data.state.currentTurn.playerId === myId;
    GameClient.setMyTurn(isMine, data.state.currentTurn.timeLeft || 60000);
    UI.renderSpellBar(data.state, isMine);
    UI.updateTimer(data.state.currentTurn.timeLeft || 60000);
    Input.refreshHighlights();
    startRenderLoop();
  });

  Socket.on('onTurnStart', (data) => {
    GameClient.patchState({ currentTurn: data.currentTurn, players: data.players, bombs: data.bombs, walls: data.walls });
    const state = GameClient.getState();
    UI.renderHpBars(state);
    UI.updateTurnInfo(state);
    UI.renderResources(state.players.find(p => p.id === myId));
    const isMine = data.currentTurn.playerId === myId;
    GameClient.setMyTurn(isMine, 60000);
    UI.renderSpellBar(state, isMine);
    UI.updateTimer(60000);
    Input.setMode('move');
    UI.updateSpellSelection(null);
    Input.refreshHighlights();
    if (isMine) Audio.play('Turn_start');
  });

  Socket.on('onStateUpdate', (delta) => {
    if (delta.movements) {
      for (const m of delta.movements) {
        if (m.path && m.path.length >= 2) {
          Animations.addEntityMovement(m.id, m.type, m.path);
        }
      }
    }
    if (delta.actionType) Audio.playForAction(delta.actionType, delta.wallsCreated);
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
    UI.renderGameOver(data);
    setTimeout(() => UI.showScreen('screen-gameover'), 1500);
  });

  setupLobbyHandlers();
  setupRoomHandlers();
  setupReplayHandler();
  setupHelpHandler();
})();
