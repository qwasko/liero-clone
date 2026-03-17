/** Plain data object representing one player's input for a single frame. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  fire: boolean;
  /**
   * True while the CHANGE key is held.
   * Roles while held:
   *   - LEFT/RIGHT  → cycle weapons (with acceleration)
   *   - JUMP        → fire ninja rope (in crosshair direction)
   *   - UP/DOWN     → still rotates crosshair; also adjusts rope length if on rope
   *   - FIRE        → disabled
   *   - Movement    → disabled (LEFT/RIGHT become weapon cycle)
   */
  change: boolean;
}

export function emptyInputState(): InputState {
  return {
    left:   false,
    right:  false,
    up:     false,
    down:   false,
    jump:   false,
    fire:   false,
    change: false,
  };
}
