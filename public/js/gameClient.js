const GameClient = (() => {
  let state = null;
  let myId = null;
  let myTurn = false;
  let turnTimeLeft = 0;
  let turnTimerInterval = null;

  function init(gameState, playerId) {
    state = gameState;
    myId = playerId;
  }

  function updateState(newState) {
    state = newState;
  }

  function patchState(delta) {
    if (!state) return;
    if (delta.players) state.players = delta.players;
    if (delta.bombs) state.bombs = delta.bombs;
    if (delta.walls) state.walls = delta.walls;
    if (delta.currentTurn) state.currentTurn = delta.currentTurn;
  }

  function setMyTurn(isMine, timeLeft) {
    myTurn = isMine;
    turnTimeLeft = timeLeft;

    if (turnTimerInterval) clearInterval(turnTimerInterval);
    if (isMine || timeLeft > 0) {
      turnTimerInterval = setInterval(() => {
        turnTimeLeft = Math.max(0, turnTimeLeft - 1000);
        UI.updateTimer(turnTimeLeft);
      }, 1000);
    }
  }

  function getState() { return state; }
  function getMyId() { return myId; }
  function isMyTurn() { return myTurn; }
  function getTimeLeft() { return turnTimeLeft; }

  function getMyPlayer() {
    if (!state) return null;
    return state.players.find(p => p.id === myId);
  }

  function getMyBombs() {
    if (!state) return [];
    return state.bombs.filter(b => b.ownerId === myId);
  }

  return {
    init, updateState, patchState, setMyTurn,
    getState, getMyId, isMyTurn, getTimeLeft,
    getMyPlayer, getMyBombs,
  };
})();
