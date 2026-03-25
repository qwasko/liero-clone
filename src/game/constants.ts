export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 500;

// Physics
export const GRAVITY = 600;          // px/s²
export const MOVE_SPEED = 68;        // px/s horizontal (45 × 1.5)
export const JUMP_VELOCITY = -240;   // px/s upward (−160 × 1.5)

// Worm
export const WORM_WIDTH = 10;
export const WORM_HEIGHT = 14;
export const WORM_MAX_HP = 100;

// Weapon reload
export const LOADING_TIMES_MULTIPLIER = 1.0; // global multiplier for magazine reload times

// Knockback
export const KNOCKBACK_FORCE_LARGE  = 300; // px/s — large explosion (crater >= 8px)
export const KNOCKBACK_FORCE_MEDIUM = 200; // px/s — medium explosion (crater >= 6px)
export const KNOCKBACK_FORCE_SMALL  = 80;  // px/s — small explosion (crater < 6px)
export const KNOCKBACK_MINE_FACTOR  = 0.5; // deployed mines receive 50% knockback

// Velocity caps
export const MAX_WORM_VX = 600; // px/s horizontal
export const MAX_WORM_VY = 700; // px/s vertical

// Match
export const MATCH_DURATION_SECONDS = 180;
export const DEFAULT_LIVES = 3;
export const RESPAWN_DELAY_MS = 2000; // ms before a dead worm respawns
