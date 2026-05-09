require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Room, generateCode } = require('./server/Room');
const { verifyToken } = require('./server/auth');
const authRoutes    = require('./server/routes/auth');
const profileRoutes = require('./server/routes/profile');
const { saveGame }  = require('./server/ranks');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth',    authRoutes);
app.use('/api/profile', profileRoutes);

const rooms = new Map();
// Map userId → socketId for live rank-up notifications
const socketByUserId = new Map();

const VALID_EMOTES = new Set(['😂','👍','👎','😮','😡','🎉','💀','💣','🤔','😎','❤️','👋']);

function getRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

// Returns the effective player ID for a socket (handles reconnected players whose
// socket.id differs from their original player.id).
function getEffectivePlayerId(room, socketId) {
  const entry = room.players.get(socketId);
  return entry ? entry.id : socketId;
}

function getPublicRoomsList() {
  const list = [];
  for (const room of rooms.values()) {
    if (!room.isPublic) continue;
    if (room.status === 'waiting') {
      list.push(room.publicInfo());
    } else if (room.status === 'playing' && room.disconnectedPlayers.size > 0) {
      // In-progress room with open slots — visible so anyone can claim them
      list.push(room.publicInfo());
    }
  }
  return list.sort((a, b) => b.playerCount - a.playerCount);
}

function broadcastRoomsList() {
  io.to('_lobby').emit('rooms-updated', getPublicRoomsList());
}

// Socket.io JWT middleware — attaches userId/username/rank/hasMordek if token valid
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    try {
      const p = verifyToken(token);
      socket.userId    = p.userId;
      socket.username  = p.username;
      socket.userRank  = p.rank || 0;
      socket.hasMordek = p.hasMordek || false;
    } catch (_) { /* token invalide → invité */ }
  }
  next();
});

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}${socket.userId ? ` (${socket.username})` : ' (guest)'}`);
  if (socket.userId) socketByUserId.set(socket.userId, socket.id);
  socket.join('_lobby'); // All clients start in the lobby channel

  socket.on('list-rooms', () => {
    socket.emit('rooms-updated', getPublicRoomsList());
  });

  socket.on('create-room', ({ playerName, roomName, isPublic }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit('error', { message: 'Nom requis' });
      return;
    }

    const existingRoom = getRoomBySocket(socket.id);
    if (existingRoom) {
      socket.emit('error', { message: 'Déjà dans une room' });
      return;
    }

    const code = generateCode(new Set(rooms.keys()));
    const room = new Room(code, roomName, isPublic);
    room.addPlayer(socket.id, playerName.trim(), socket.userId || null, socket.userRank || 0);
    rooms.set(code, room);
    socket.leave('_lobby');
    socket.join(code);

    socket.emit('room-created', { code });
    socket.emit('room-joined', {
      players: room.getPlayerList(),
      you: socket.id,
      hostId: room.hostId,
    });
    broadcastRoomsList();
  });

  socket.on('join-room', ({ code, playerName }) => {
    if (!playerName || playerName.trim().length === 0) {
      socket.emit('error', { message: 'Nom requis' });
      return;
    }

    const upperCode = (code || '').toUpperCase().trim();
    const room = rooms.get(upperCode);

    if (!room) {
      socket.emit('error', { message: 'Room introuvable' });
      return;
    }

    // Game already in progress — offer disconnected slots if any
    if (room.status === 'playing') {
      const slots = room.getDisconnectedSlots();
      if (slots.length === 0) {
        socket.emit('error', { message: 'Partie en cours, aucun personnage disponible' });
        return;
      }
      socket.emit('game-in-progress', {
        code: upperCode,
        name: room.name,
        slots,
        playerName: playerName.trim(),
      });
      return;
    }

    if (!room.addPlayer(socket.id, playerName.trim(), socket.userId || null, socket.userRank || 0)) {
      socket.emit('error', { message: 'Room pleine' });
      return;
    }

    socket.leave('_lobby');
    socket.join(upperCode);

    socket.emit('room-joined', {
      players: room.getPlayerList(),
      you: socket.id,
      hostId: room.hostId,
    });

    socket.to(upperCode).emit('player-joined', {
      players: room.getPlayerList(),
    });
    broadcastRoomsList();
  });

  // Claim a disconnected player's slot in an in-progress game
  socket.on('claim-slot', ({ code, targetPlayerId }) => {
    const upperCode = (code || '').toUpperCase().trim();
    const room = rooms.get(upperCode);

    if (!room || room.status !== 'playing') {
      socket.emit('error', { message: 'Partie introuvable' });
      return;
    }

    if (!room.claimSlot(socket.id, targetPlayerId)) {
      socket.emit('error', { message: 'Personnage non disponible' });
      return;
    }

    socket.leave('_lobby');
    socket.join(upperCode);

    if (room.game) {
      room.game.handleRejoin(socket.id, targetPlayerId);
    }

    broadcastRoomsList();
  });

  socket.on('leave-room', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const effectiveId = getEffectivePlayerId(room, socket.id);
    if (room.game && !room.game.gameOver) room.game.handleDisconnect(effectiveId);
    room.replayVotes.delete(socket.id);
    room.removePlayer(socket.id);

    socket.to(room.code).emit('player-left', {
      playerId: effectiveId,
      players: room.getPlayerList(),
      hostId: room.hostId,
    });

    socket.leave(room.code);
    socket.join('_lobby');

    if (room.isEmpty()) {
      if (room.game) room.game.cleanup();
      rooms.delete(room.code);
    } else if (room.status === 'playing' && room.replayVotes.size > 0 &&
               room.replayVotes.size >= room.players.size) {
      room.resetForReplay();
      io.to(room.code).emit('replay-ready', {
        players: room.getPlayerList(),
        hostId: room.hostId,
      });
    }

    broadcastRoomsList();
    socket.emit('rooms-updated', getPublicRoomsList());
  });

  socket.on('set-obstacle-count', ({ count }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'waiting' || socket.id !== room.hostId) return;
    if (room.setObstacleCount(count)) {
      io.to(room.code).emit('obstacle-count-updated', { obstacleCount: room.obstacleCount });
    }
  });

  socket.on('set-turn-duration', ({ seconds }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'waiting' || socket.id !== room.hostId) return;
    if (room.setTurnDuration(seconds)) {
      io.to(room.code).emit('turn-duration-updated', { turnDurationMs: room.turnDurationMs });
    }
  });

  socket.on('set-name', ({ name }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'waiting') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const trimmed = (name || '').trim().substring(0, 16);
    if (!trimmed) return;
    player.name = trimmed;
    io.to(room.code).emit('distribution-updated', { players: room.getPlayerList() });
  });

  socket.on('set-character', ({ character }) => {
    const VALID_CHARS = ['player', 'merlin', 'kael', 'borin', 'alaric', 'mordek'];
    if (!VALID_CHARS.includes(character)) return;

    // Rank requirements (server-side enforcement)
    const CHAR_RANK_REQ = { player: 0, merlin: 2, kael: 5, borin: 15, alaric: 30, mordek: 0 };
    const playerRank = socket.userRank || 0;
    const isAuthenticated = !!socket.userId;

    // Guests can only play Bob
    if (!isAuthenticated && character !== 'player') {
      socket.emit('error', { message: 'Créez un compte pour jouer ce personnage' });
      return;
    }
    // Mordek requires hasMordek flag (purchase) — enforced in Phase 5
    if (character === 'mordek' && !socket.hasMordek) {
      socket.emit('error', { message: 'Mordek nécessite un achat' });
      return;
    }
    if (playerRank < (CHAR_RANK_REQ[character] || 0)) {
      socket.emit('error', { message: `Rang ${CHAR_RANK_REQ[character]} requis pour ce personnage` });
      return;
    }

    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'waiting') return;
    if (room.setCharacter(socket.id, character)) {
      io.to(room.code).emit('distribution-updated', {
        players: room.getPlayerList(),
      });
    }
  });

  socket.on('set-distribution', ({ pa, pm }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    if (room.setDistribution(socket.id, pa, pm)) {
      io.to(room.code).emit('distribution-updated', {
        players: room.getPlayerList(),
      });
    }
  });

  socket.on('start-game', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (socket.id !== room.hostId) return;
    if (!room.canStart()) return;

    room.status = 'playing';

    const Game = require('./server/Game');
    room.game = new Game(room, io, socketByUserId);
    room.game.start();
    broadcastRoomsList(); // Room is no longer available in browser
  });

  socket.on('action', (data) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    const effectiveId = getEffectivePlayerId(room, socket.id);
    room.game.handleAction(effectiveId, data);
  });

  socket.on('propose-replay', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    if (!room.game || !room.game.gameOver) return;

    room.replayVotes.add(socket.id);

    const voterNames = Array.from(room.replayVotes)
      .map(id => { const p = room.players.get(id); return p ? p.name : null; })
      .filter(Boolean);

    io.to(room.code).emit('replay-proposed', {
      voterNames,
      total: room.players.size,
    });

    // All players voted → reset to distribution phase
    if (room.replayVotes.size >= room.players.size) {
      room.resetForReplay();
      io.to(room.code).emit('replay-ready', {
        players: room.getPlayerList(),
        hostId: room.hostId,
      });
    }
  });

  socket.on('emote', ({ emoji }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    if (!VALID_EMOTES.has(emoji)) return;
    const effectiveId = getEffectivePlayerId(room, socket.id);
    io.to(room.code).emit('player-emote', { playerId: effectiveId, emoji });
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    if (socket.userId && socketByUserId.get(socket.userId) === socket.id) {
      socketByUserId.delete(socket.userId);
    }
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    if (room.game && room.status === 'playing') {
      // Involuntary disconnect during an active game: keep character alive
      const effectiveId = getEffectivePlayerId(room, socket.id);
      room.moveToDisconnected(socket.id);
      room.game.handleConnectionLost(effectiveId);

      socket.to(room.code).emit('player-left', {
        playerId: effectiveId,
        players: room.getPlayerList(),
        hostId: room.hostId,
      });

      broadcastRoomsList(); // Room now appears in lobby with open slot
      return;
    }

    // Not in a game (waiting room) → remove and potentially kill
    const effectiveId = getEffectivePlayerId(room, socket.id);
    if (room.game) room.game.handleDisconnect(effectiveId);

    room.replayVotes.delete(socket.id);
    room.removePlayer(socket.id);

    socket.to(room.code).emit('player-left', {
      playerId: effectiveId,
      players: room.getPlayerList(),
      hostId: room.hostId,
    });

    if (room.isEmpty()) {
      if (room.game) room.game.cleanup();
      rooms.delete(room.code);
      broadcastRoomsList();
      return;
    }

    // If all remaining players already voted for replay, trigger it
    if (room.status === 'playing' && room.replayVotes.size > 0 &&
        room.replayVotes.size >= room.players.size) {
      room.resetForReplay();
      io.to(room.code).emit('replay-ready', {
        players: room.getPlayerList(),
        hostId: room.hostId,
      });
    }
    broadcastRoomsList();
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Remove empty waiting rooms older than 30 minutes
    if (room.isEmpty() && now - room.createdAt > 30 * 60 * 1000) {
      if (room.game) room.game.cleanup();
      rooms.delete(code);
      continue;
    }
    // Remove paused games where all players have been gone for more than 15 minutes
    if (room.game && room.game.gamePaused && room.game.pausedAt &&
        now - room.game.pausedAt > 15 * 60 * 1000) {
      console.log(`Cleaning up abandoned paused game: ${code}`);
      room.game.cleanup();
      rooms.delete(code);
      broadcastRoomsList();
    }
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`BombRogue running on port ${PORT}`);
});
