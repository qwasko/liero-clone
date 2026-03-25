/**
 * Shared protocol types for lockstep multiplayer.
 * Used by both client (src/) and server (server/).
 */

/** Minimal input snapshot — matches InputState but plain object for serialization. */
export interface NetInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  fire: boolean;
  change: boolean;
}

// ── Client → Server ───────────────────────────────────────────────────

export interface ClientCreateRoom {
  type: 'create_room';
  settings: NetGameSettings;
}

export interface ClientJoinRoom {
  type: 'join_room';
  code: string;
}

export interface ClientInput {
  type: 'input';
  frame: number;
  input: NetInputState;
}

export type ClientMessage = ClientCreateRoom | ClientJoinRoom | ClientInput;

// ── Server → Client ───────────────────────────────────────────────────

export interface ServerRoomCreated {
  type: 'room_created';
  code: string;
  playerIndex: 0 | 1;
}

export interface ServerGameStart {
  type: 'game_start';
  seed: number;
  settings: NetGameSettings;
  playerIndex: 0 | 1;
}

export interface ServerRemoteInput {
  type: 'remote_input';
  frame: number;
  input: NetInputState;
}

export interface ServerPlayerDisconnected {
  type: 'player_disconnected';
}

export interface ServerError {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | ServerRoomCreated
  | ServerGameStart
  | ServerRemoteInput
  | ServerPlayerDisconnected
  | ServerError;

// ── Shared settings (subset of GameSettings relevant for network) ─────

export interface NetGameSettings {
  lives: number;
  reloadMultiplier: number;
  matchDurationSeconds: number;
  p1Hp: number;
  p2Hp: number;
  levelIndex: number;
  gameMode: 'normal' | 'tag';
}
