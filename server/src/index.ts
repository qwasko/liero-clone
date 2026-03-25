import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Room } from './Room';
import type {
  ClientMessage,
  ServerRoomCreated,
  ServerGameStart,
  ServerRemoteInput,
  ServerPlayerDisconnected,
  ServerError,
  NetGameSettings,
} from '../../src/network/protocol';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// ── Room storage ────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();
/** Map socket.id → room code for fast lookup on disconnect. */
const socketToRoom = new Map<string, string>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code: string;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

// ── Socket.io connection handling ───────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('message', (msg: ClientMessage) => {
    console.log(`[msg] ${socket.id} → ${msg.type}`, msg.type === 'input' ? `frame=${msg.frame}` : JSON.stringify(msg));
    switch (msg.type) {
      case 'create_room':
        handleCreateRoom(socket, msg.settings);
        break;
      case 'join_room':
        handleJoinRoom(socket, msg.code);
        break;
      case 'input':
        handleInput(socket, msg.frame, msg.input);
        break;
    }
  });

  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });
});

// ── Handlers ────────────────────────────────────────────────────────────

function handleCreateRoom(socket: import('socket.io').Socket, settings: NetGameSettings): void {
  // Clean up if already in a room
  leaveCurrentRoom(socket);

  const code = generateRoomCode();
  const room = new Room(code, settings);
  const playerIndex = room.addPlayer(socket);
  rooms.set(code, room);
  socketToRoom.set(socket.id, code);

  const reply: ServerRoomCreated = {
    type: 'room_created',
    code,
    playerIndex,
  };
  socket.emit('message', reply);
  console.log(`[room] ${socket.id} created room ${code}`);
}

function handleJoinRoom(socket: import('socket.io').Socket, code: string): void {
  leaveCurrentRoom(socket);

  const room = rooms.get(code.toUpperCase());
  if (!room) {
    const err: ServerError = { type: 'error', message: `Room "${code}" not found` };
    socket.emit('message', err);
    return;
  }
  if (room.isFull) {
    const err: ServerError = { type: 'error', message: `Room "${code}" is full` };
    socket.emit('message', err);
    return;
  }
  if (room.isStarted) {
    const err: ServerError = { type: 'error', message: `Room "${code}" game already in progress` };
    socket.emit('message', err);
    return;
  }

  room.addPlayer(socket);
  socketToRoom.set(socket.id, code);

  // Room is now full — start the game for both players
  console.log(`[room] ${code} now has ${room.players.length} players, isFull=${room.isFull}`);
  room.start();
  for (const p of room.players) {
    const start: ServerGameStart = {
      type: 'game_start',
      seed: room.seed,
      settings: room.settings,
      playerIndex: p.playerIndex,
    };
    console.log(`[room] emitting game_start to player ${p.playerIndex} (socket=${p.socket.id}, seed=${room.seed})`);
    p.socket.emit('message', start);
  }
  console.log(`[room] ${socket.id} joined room ${code} — game starting (seed=${room.seed})`);
}

function handleInput(
  socket: import('socket.io').Socket,
  frame: number,
  input: import('../../src/network/protocol').NetInputState,
): void {
  const code = socketToRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  const opponent = room.getOpponent(socket.id);
  if (!opponent) return;

  const relay: ServerRemoteInput = {
    type: 'remote_input',
    frame,
    input,
  };
  opponent.socket.emit('message', relay);
}

function handleDisconnect(socket: import('socket.io').Socket): void {
  console.log(`[disconnect] ${socket.id}`);
  leaveCurrentRoom(socket);
}

function leaveCurrentRoom(socket: import('socket.io').Socket): void {
  const code = socketToRoom.get(socket.id);
  if (!code) return;
  socketToRoom.delete(socket.id);

  const room = rooms.get(code);
  if (!room) return;

  const opponent = room.getOpponent(socket.id);
  room.removePlayer(socket.id);

  if (opponent) {
    const msg: ServerPlayerDisconnected = { type: 'player_disconnected' };
    opponent.socket.emit('message', msg);
  }

  if (room.isEmpty) {
    rooms.delete(code);
    console.log(`[room] ${code} destroyed (empty)`);
  }
}

// ── Health check ────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// ── Start ───────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Liero server listening on port ${PORT}`);
});
