import type { Socket } from 'socket.io';
import type { NetGameSettings } from '../../src/network/protocol';

export interface RoomPlayer {
  socket: Socket;
  playerIndex: 0 | 1;
}

export class Room {
  readonly code: string;
  readonly seed: number;
  readonly settings: NetGameSettings;
  readonly players: RoomPlayer[] = [];
  private started = false;

  constructor(code: string, settings: NetGameSettings) {
    this.code = code;
    this.settings = settings;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
  }

  get isFull(): boolean {
    return this.players.length >= 2;
  }

  get isStarted(): boolean {
    return this.started;
  }

  addPlayer(socket: Socket): 0 | 1 {
    if (this.isFull) throw new Error('Room is full');
    const playerIndex = this.players.length as 0 | 1;
    this.players.push({ socket, playerIndex });
    return playerIndex;
  }

  removePlayer(socketId: string): RoomPlayer | undefined {
    const idx = this.players.findIndex(p => p.socket.id === socketId);
    if (idx === -1) return undefined;
    return this.players.splice(idx, 1)[0];
  }

  getOpponent(socketId: string): RoomPlayer | undefined {
    return this.players.find(p => p.socket.id !== socketId);
  }

  start(): void {
    this.started = true;
  }

  get isEmpty(): boolean {
    return this.players.length === 0;
  }
}
