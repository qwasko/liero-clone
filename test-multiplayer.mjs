// Quick diagnostic: simulate two clients connecting, hosting, joining, and exchanging inputs
import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3001';

function connect(name) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER, { transports: ['websocket'] });
    socket.on('connect', () => {
      console.log(`[${name}] connected (id=${socket.id})`);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      console.log(`[${name}] connect_error:`, err.message);
      reject(err);
    });
    socket.on('disconnect', (reason) => {
      console.log(`[${name}] disconnected: ${reason}`);
    });
    socket.on('message', (msg) => {
      console.log(`[${name}] received:`, JSON.stringify(msg));
    });
  });
}

async function main() {
  console.log('--- Connecting two clients ---');
  const host = await connect('HOST');
  const joiner = await connect('JOIN');

  // Host creates room
  const settings = { lives: 3, reloadMultiplier: 1, matchDurationSeconds: 180, p1Hp: 100, p2Hp: 100, levelIndex: 0, gameMode: 'normal' };
  host.emit('message', { type: 'create_room', settings });

  // Wait for room_created
  const roomCode = await new Promise((resolve) => {
    host.once('message', (msg) => {
      console.log('[HOST] room code:', msg.code);
      resolve(msg.code);
    });
  });

  // Joiner joins
  joiner.emit('message', { type: 'join_room', code: roomCode });

  // Wait for both to receive game_start
  await new Promise(r => setTimeout(r, 500));

  // Simulate lockstep: send inputs for frames 0-10 from both sides
  console.log('\n--- Simulating lockstep inputs ---');
  const emptyInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, change: false };

  for (let f = 0; f < 10; f++) {
    host.emit('message', { type: 'input', frame: f, input: emptyInput });
    joiner.emit('message', { type: 'input', frame: f, input: emptyInput });
    await new Promise(r => setTimeout(r, 50));
  }

  console.log('\n--- Waiting 2s for any delayed messages ---');
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n--- Checking connection state ---');
  console.log('[HOST] connected:', host.connected);
  console.log('[JOIN] connected:', joiner.connected);

  host.disconnect();
  joiner.disconnect();
  console.log('\n--- Done ---');
  process.exit(0);
}

main().catch(console.error);
