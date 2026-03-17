import { Worm } from '../entities/Worm';
import { InputState } from '../input/InputState';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';

/**
 * Digging mechanic — faithful to original Liero.
 *
 * Trigger: hold a direction key + tap (rising edge) the OPPOSITE direction.
 *   hold LEFT  + tap RIGHT → dig LEFT
 *   hold RIGHT + tap LEFT  → dig RIGHT
 *   hold DOWN  + tap UP    → dig DOWN
 *
 * Dig direction = the HELD key direction (the one being held continuously),
 * NOT the tapped key. The tap is purely a trigger — it should not affect
 * movement, facing direction, or rope state.
 *
 * Digging straight up is blocked (hold UP + tap DOWN does nothing).
 * Digging is blocked while CHANGE is held (LEFT/RIGHT cycle weapons there).
 * Works on ground and while on the ninja rope.
 */
export class DiggingSystem {
  /** Radius of the carved circle per dig action. Must fit worm through the hole. */
  private static readonly DIG_RADIUS = 9;

  private prevLeft  = new Map<Worm, boolean>();
  private prevRight = new Map<Worm, boolean>();
  private prevUp    = new Map<Worm, boolean>();
  private prevDown  = new Map<Worm, boolean>();

  constructor(private terrainDestroyer: TerrainDestroyer) {}

  registerWorm(worm: Worm): void {
    this.prevLeft.set(worm, false);
    this.prevRight.set(worm, false);
    this.prevUp.set(worm, false);
    this.prevDown.set(worm, false);
  }

  update(worm: Worm, input: InputState): void {
    if (worm.isDead) return;

    // Rising-edge detection for each direction
    const tapLeft  = input.left  && !(this.prevLeft.get(worm)  ?? false);
    const tapRight = input.right && !(this.prevRight.get(worm) ?? false);
    const tapUp    = input.up    && !(this.prevUp.get(worm)    ?? false);
    // tapDown omitted — upward dig is blocked, so we never need it

    // Digging blocked while CHANGE is held (LEFT/RIGHT become weapon cycling)
    if (!input.change) {
      // Horizontal digs — dig in the HELD direction
      if (input.left  && tapRight) this.dig(worm, -1,  0);
      if (input.right && tapLeft)  this.dig(worm,  1,  0);

      // Vertical digs — dig downward only (straight up is blocked)
      if (input.down && tapUp) this.dig(worm, 0, 1);
      // input.up && tapDown intentionally omitted — cannot dig straight up
    }

    this.prevLeft.set(worm,  input.left);
    this.prevRight.set(worm, input.right);
    this.prevUp.set(worm,    input.up);
    this.prevDown.set(worm,  input.down);
  }

  private dig(worm: Worm, dx: number, dy: number): void {
    const r = DiggingSystem.DIG_RADIUS;
    // Carve centred at the worm's leading face + half a radius into the terrain
    const cx = worm.x + dx * (worm.width  / 2 + r * 0.6);
    const cy = worm.y + dy * (worm.height / 2 + r * 0.6);
    this.terrainDestroyer.carveCircle(cx, cy, r);
  }
}
