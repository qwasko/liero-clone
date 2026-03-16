/** Plain data object representing one player's input for a single frame. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  fire: boolean;
  nextWeapon: boolean;  // JustDown — suppressed while weaponModifier held
  prevWeapon: boolean;  // JustDown — suppressed while weaponModifier held
  /**
   * True while the weapon-change key is held.
   * Used as the rope modifier: hold + jump = toggle rope,
   * hold + up/down = adjust rope length.
   * While held, weapon switching is blocked (key conflict).
   */
  weaponModifier: boolean;
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
    weaponModifier: false,
  };
}
