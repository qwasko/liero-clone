/** Plain data object representing one player's input for a single frame. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  fire: boolean;
  nextWeapon: boolean;
  prevWeapon: boolean;
}

export function emptyInputState(): InputState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    fire: false,
    nextWeapon: false,
    prevWeapon: false,
  };
}
