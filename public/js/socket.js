const Socket = (() => {
  let socket = null;
  let handlers = {};

  function connect() {
    const token = Auth.getToken();
    socket = io({ auth: token ? { token } : {} });

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

    socket.on('replay-proposed', (data) => {
      if (handlers.onReplayProposed) handlers.onReplayProposed(data);
    });

    socket.on('replay-ready', (data) => {
      if (handlers.onReplayReady) handlers.onReplayReady(data);
    });

    socket.on('turn-tick', (data) => {
      if (handlers.onTurnTick) handlers.onTurnTick(data);
    });

    socket.on('rooms-updated', (data) => {
      if (handlers.onRoomsUpdated) handlers.onRoomsUpdated(data);
    });

    socket.on('obstacle-count-updated', (data) => {
      if (handlers.onObstacleCountUpdated) handlers.onObstacleCountUpdated(data);
    });

    socket.on('turn-duration-updated', (data) => {
      if (handlers.onTurnDurationUpdated) handlers.onTurnDurationUpdated(data);
    });

    socket.on('game-in-progress', (data) => {
      if (handlers.onGameInProgress) handlers.onGameInProgress(data);
    });

    socket.on('game-rejoin', (data) => {
      if (handlers.onGameRejoin) handlers.onGameRejoin(data);
    });

    socket.on('player-disconnected', (data) => {
      if (handlers.onPlayerDisconnected) handlers.onPlayerDisconnected(data);
    });

    socket.on('player-reconnected', (data) => {
      if (handlers.onPlayerReconnected) handlers.onPlayerReconnected(data);
    });

    socket.on('rank-updated', (data) => {
      if (handlers.onRankUpdated) handlers.onRankUpdated(data);
    });

    socket.on('game-paused', () => {
      if (handlers.onGamePaused) handlers.onGamePaused();
    });

    socket.on('game-resumed', () => {
      if (handlers.onGameResumed) handlers.onGameResumed();
    });

    socket.on('turn-skipped', (data) => {
      if (handlers.onTurnSkipped) handlers.onTurnSkipped(data);
    });

    socket.on('player-emote', (data) => {
      if (handlers.onPlayerEmote) handlers.onPlayerEmote(data);
    });

    socket.on('friends-status', (data) => {
      if (handlers.onFriendsStatus) handlers.onFriendsStatus(data);
    });

    socket.on('friend-status-changed', (data) => {
      if (handlers.onFriendStatusChanged) handlers.onFriendStatusChanged(data);
    });

    socket.on('room-invite', (data) => {
      if (handlers.onRoomInvite) handlers.onRoomInvite(data);
    });

    socket.on('friend-request-received', (data) => {
      if (handlers.onFriendRequestReceived) handlers.onFriendRequestReceived(data);
    });

    socket.on('friend-request-accepted', (data) => {
      if (handlers.onFriendRequestAccepted) handlers.onFriendRequestAccepted(data);
    });

    socket.on('mordek-unlocked', (data) => {
      if (handlers.onMordekUnlocked) handlers.onMordekUnlocked(data);
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
