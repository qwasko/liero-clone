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
  private reconnectingCb:   ((attempt: number) => void) | null = null;
  private reconnectedCb:    (() => void) | null = null;
  private reconnectFailedCb: (() => void) | null = null;

  constructor(socket: Socket) {
    this.socket = socket;
    this.socket.on('message', (msg: ServerMessage) => {
      this.handler?.(msg);
    });
    this.socket.on('disconnect', (reason: string) => {
      console.log('[net] disconnected, reason:', reason);
    });
    this.socket.on('reconnect_attempt', (attempt: number) => {
      console.log('[net] reconnect attempt', attempt);
      this.reconnectingCb?.(attempt);
    });
    this.socket.on('reconnect', () => {
      console.log('[net] reconnected');
      this.reconnectedCb?.();
    });
    this.socket.on('reconnect_failed', () => {
      console.log('[net] all reconnect attempts failed');
      this.reconnectFailedCb?.();
    });
  }

  /** Set the handler for all incoming server messages. */
  onMessage(handler: NetworkEventHandler): void {
    this.handler = handler;
  }

  /** Called on each reconnect attempt (attempt = 1-based index). */
  onReconnecting(cb: (attempt: number) => void): void { this.reconnectingCb = cb; }

  /** Called when transport reconnect succeeds. */
  onReconnected(cb: () => void): void { this.reconnectedCb = cb; }

  /** Called when all reconnect attempts are exhausted. */
  onReconnectFailed(cb: () => void): void { this.reconnectFailedCb = cb; }

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
