const Socket = (() => {
  let socket = null;
  let handlers = {};

  function connect() {
    socket = io();

    socket.on('connect', () => {
      console.log('Connected:', socket.id);
    });

    socket.on('error', (data) => {
      if (handlers.onError) handlers.onError(data.message);
    });

    socket.on('room-created', (data) => {
      if (handlers.onRoomCreated) handlers.onRoomCreated(data);
    });

    socket.on('room-joined', (data) => {
      if (handlers.onRoomJoined) handlers.onRoomJoined(data);
    });

    socket.on('player-joined', (data) => {
      if (handlers.onPlayerJoined) handlers.onPlayerJoined(data);
    });

    socket.on('player-left', (data) => {
      if (handlers.onPlayerLeft) handlers.onPlayerLeft(data);
    });

    socket.on('distribution-updated', (data) => {
      if (handlers.onDistributionUpdated) handlers.onDistributionUpdated(data);
    });

    socket.on('game-start', (data) => {
      if (handlers.onGameStart) handlers.onGameStart(data);
    });

    socket.on('turn-start', (data) => {
      if (handlers.onTurnStart) handlers.onTurnStart(data);
    });

    socket.on('state-update', (data) => {
      if (handlers.onStateUpdate) handlers.onStateUpdate(data);
    });

    socket.on('action-result', (data) => {
      if (handlers.onActionResult) handlers.onActionResult(data);
    });

    socket.on('detonation-result', (data) => {
      if (handlers.onDetonationResult) handlers.onDetonationResult(data);
    });

    socket.on('player-damaged', (data) => {
      if (handlers.onPlayerDamaged) handlers.onPlayerDamaged(data);
    });

    socket.on('player-died', (data) => {
      if (handlers.onPlayerDied) handlers.onPlayerDied(data);
    });

    socket.on('game-over', (data) => {
      if (handlers.onGameOver) handlers.onGameOver(data);
    });

    socket.on('turn-tick', (data) => {
      if (handlers.onTurnTick) handlers.onTurnTick(data);
    });
  }

  function emit(event, data) {
    if (socket) socket.emit(event, data);
  }

  function getId() {
    return socket ? socket.id : null;
  }

  function on(name, fn) {
    handlers[name] = fn;
  }

  return { connect, emit, getId, on };
})();
