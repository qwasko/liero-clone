export type PlayerType = 'human' | 'ai_easy' | 'ai_medium' | 'ai_hard';

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
}

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
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { /* ignore corrupt data */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* localStorage full or blocked */ }
}
