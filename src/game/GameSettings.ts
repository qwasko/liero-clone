export type PlayerType = 'human' | 'ai_easy' | 'ai_medium' | 'ai_hard';

export interface KeyBindings {
  left: number;    // Phaser KeyCode
  right: number;
  up: number;
  down: number;
  jump: number;
  fire: number;
  change: number;
}

export interface GameSettings {
  // Game
  reloadSpeedPercent: number;  // 0-500, step 10 (100=normal, 500=5x slower, 0=instant)
  matchTimerMinutes: number;   // 1, 2, 3, 5, or 0=unlimited
  lives: number;               // 1-10

  // Players
  player1Type: PlayerType;
  player2Type: PlayerType;

  // Camera
  p1Zoom: number;  // 0.5-3.0
  p2Zoom: number;  // 0.5-3.0

  // Minimap
  minimapEnabled: boolean;
  botUseMinimap: boolean;  // true = full map vision for bots

  // Map
  levelIndex: number;          // index into LEVEL_PRESETS
  gameMode: 'normal' | 'tag';

  // Controls
  p1Keys: KeyBindings;
  p2Keys: KeyBindings;
}

// Standard browser keycodes
export const DEFAULT_P1_KEYS: Readonly<KeyBindings> = {
  left: 37, right: 39, up: 38, down: 40,  // Arrow keys
  jump: 16, fire: 17, change: 191,         // Shift, Ctrl, /
};

export const DEFAULT_P2_KEYS: Readonly<KeyBindings> = {
  left: 65, right: 68, up: 87, down: 83,  // A, D, W, S
  jump: 32, fire: 70, change: 69,          // Space, F, E
};

const STORAGE_KEY = 'liero-settings';

export const DEFAULT_SETTINGS: Readonly<GameSettings> = {
  reloadSpeedPercent: 100,
  matchTimerMinutes: 3,
  lives: 3,
  player1Type: 'human',
  player2Type: 'ai_medium',
  p1Zoom: 2.5,
  p2Zoom: 2.5,
  minimapEnabled: true,
  botUseMinimap: false,
  levelIndex: 0,
  gameMode: 'normal',
  p1Keys: { ...DEFAULT_P1_KEYS },
  p2Keys: { ...DEFAULT_P2_KEYS },
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        p1Keys: { ...DEFAULT_P1_KEYS, ...parsed.p1Keys },
        p2Keys: { ...DEFAULT_P2_KEYS, ...parsed.p2Keys },
      };
    }
  } catch { /* ignore corrupt data */ }
  return { ...DEFAULT_SETTINGS, p1Keys: { ...DEFAULT_P1_KEYS }, p2Keys: { ...DEFAULT_P2_KEYS } };
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* localStorage full or blocked */ }
}

/** Human-readable name for a browser keycode. */
export function keyCodeName(code: number): string {
  const specials: Record<number, string> = {
    8: 'BKSP', 9: 'TAB', 13: 'ENTER', 16: 'SHIFT', 17: 'CTRL', 18: 'ALT',
    20: 'CAPS', 27: 'ESC', 32: 'SPACE', 37: 'LEFT', 38: 'UP', 39: 'RIGHT', 40: 'DOWN',
    45: 'INS', 46: 'DEL', 186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/',
    192: '`', 219: '[', 220: '\\', 221: ']', 222: "'",
  };
  if (specials[code]) return specials[code];
  if (code >= 65 && code <= 90) return String.fromCharCode(code);
  if (code >= 48 && code <= 57) return String(code - 48);
  if (code >= 96 && code <= 105) return `NUM${code - 96}`;
  if (code >= 112 && code <= 123) return `F${code - 111}`;
  return `KEY${code}`;
}
