/**
 * Thin wrapper around a socket.io Socket for multiplayer communication.
 * Handles sending/receiving protocol messages and connection state.
 */
import type { Socket } from 'socket.io-client';
import type {
  ClientMessage,
  ServerMessage,
  NetInputState,
} from './protocol';

export type NetworkEventHandler = (msg: ServerMessage) => void;

export class NetworkClient {
  private socket: Socket;
  private handler: NetworkEventHandler | null = null;

  constructor(socket: Socket) {
    this.socket = socket;
    this.socket.on('message', (msg: ServerMessage) => {
      this.handler?.(msg);
    });
  }

  /** Set the handler for all incoming server messages. */
  onMessage(handler: NetworkEventHandler): void {
    this.handler = handler;
  }

  /** Send local player's input for a given frame. */
  sendInput(frame: number, input: NetInputState): void {
    const msg: ClientMessage = { type: 'input', frame, input };
    this.socket.emit('message', msg);
  }

  /** Clean disconnect. */
  disconnect(): void {
    this.socket.disconnect();
  }

  get connected(): boolean {
    return this.socket.connected;
  }
}
