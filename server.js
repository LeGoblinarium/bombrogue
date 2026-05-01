const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Room, generateCode } = require('./server/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function getRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', ({ playerName }) => {
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
    const room = new Room(code);
    room.addPlayer(socket.id, playerName.trim());
    rooms.set(code, room);
    socket.join(code);

    socket.emit('room-created', { code });
    socket.emit('room-joined', {
      players: room.getPlayerList(),
      you: socket.id,
      hostId: room.hostId,
    });
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

    if (!room.addPlayer(socket.id, playerName.trim())) {
      socket.emit('error', { message: room.status !== 'waiting' ? 'Partie en cours' : 'Room pleine' });
      return;
    }

    socket.join(upperCode);

    socket.emit('room-joined', {
      players: room.getPlayerList(),
      you: socket.id,
      hostId: room.hostId,
    });

    socket.to(upperCode).emit('player-joined', {
      players: room.getPlayerList(),
    });
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
    room.game = new Game(room, io);
    room.game.start();
  });

  socket.on('action', (data) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;
    room.game.handleAction(socket.id, data);
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    if (room.game) {
      room.game.handleDisconnect(socket.id);
    }

    room.removePlayer(socket.id);
    socket.to(room.code).emit('player-left', {
      playerId: socket.id,
      players: room.getPlayerList(),
      hostId: room.hostId,
    });

    if (room.isEmpty()) {
      if (room.game) room.game.cleanup();
      rooms.delete(room.code);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.isEmpty() && now - room.createdAt > 30 * 60 * 1000) {
      if (room.game) room.game.cleanup();
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`BombRogue running on port ${PORT}`);
});
