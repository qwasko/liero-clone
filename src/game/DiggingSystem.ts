import { Worm } from '../entities/Worm';
import { InputState } from '../input/InputState';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';

/**
 * Digging mechanic — faithful to original Liero.
 *
 * Trigger: hold a direction key + tap (rising edge) the OPPOSITE direction.
 *   e.g. hold LEFT + tap RIGHT, or hold UP + tap DOWN
 *
 * The dig is carved in the worm's actual crosshair direction, NOT necessarily
 * the direction of the held key. This means all four trigger combos produce
 * the same dig (in aim direction) — matching original Liero behaviour where
 * you hold toward a wall in your aim direction and tap back.
 *
 * Restrictions:
 *   - Blocked while CHANGE is held (LEFT/RIGHT become weapon cycling)
 *   - Cannot dig when aiming too close to straight up (within ~30° of -90°)
 */
export class DiggingSystem {
  /** Radius of the carved circle per dig action. Must fit worm through the hole. */
  private static readonly DIG_RADIUS = 9;

  /**
   * Minimum aim angle (most upward) at which digging is still allowed.
   * -π/3 ≈ −60° (30° clearance from straight up at −90°).
   */
  private static readonly DIG_BLOCK_ANGLE = -Math.PI / 3;

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

    // Digging is blocked while CHANGE is held (those keys cycle weapons)
    if (!input.change) {
      const tapLeft  = input.left  && !(this.prevLeft.get(worm)  ?? false);
      const tapRight = input.right && !(this.prevRight.get(worm) ?? false);
      const tapUp    = input.up    && !(this.prevUp.get(worm)    ?? false);
      const tapDown  = input.down  && !(this.prevDown.get(worm)  ?? false);

      const triggered =
        (input.left  && tapRight) ||
        (input.right && tapLeft)  ||
        (input.up    && tapDown)  ||
        (input.down  && tapUp);

      if (triggered) this.tryDig(worm);
    }

    this.prevLeft.set(worm,  input.left);
    this.prevRight.set(worm, input.right);
    this.prevUp.set(worm,    input.up);
    this.prevDown.set(worm,  input.down);
  }

  private tryDig(worm: Worm): void {
    // Block digging when aiming too close to straight up
    if (worm.aimAngle < DiggingSystem.DIG_BLOCK_ANGLE) return;

    const r = DiggingSystem.DIG_RADIUS;

    // Compute aim direction vector (same as weapon spawn direction)
    const baseAngle = worm.facingRight ? worm.aimAngle : Math.PI - worm.aimAngle;
    const aimX = Math.cos(baseAngle);
    const aimY = Math.sin(baseAngle);

    // Carve centred at the worm's leading face + half a radius into the terrain
    const cx = worm.x + aimX * (worm.width  / 2 + r * 0.6);
    const cy = worm.y + aimY * (worm.height / 2 + r * 0.6);
    this.terrainDestroyer.carveCircle(cx, cy, r);
  }
}
