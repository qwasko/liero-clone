import { Worm } from '../entities/Worm';
import { InputState } from '../input/InputState';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';

/**
 * Digging mechanic — faithful to original Liero.
 *
 * Trigger: hold a direction key + tap (rising edge) the OPPOSITE direction.
 *   hold LEFT  + tap RIGHT → dig
 *   hold RIGHT + tap LEFT  → dig
 *   hold DOWN  + tap UP    → dig
 *
 * The trigger keys only determine WHEN a dig happens.
 * The dig always carves in the worm's crosshair direction.
 *
 * Digging straight up is blocked (aimAngle within ~30° of -90°).
 * Digging is blocked while CHANGE is held (LEFT/RIGHT cycle weapons there).
 * Works on ground and while on the ninja rope.
 */
export class DiggingSystem {
  /** Radius of each carved circle. Worm is 10x14, diameter 20 fits snugly. */
  private static readonly DIG_RADIUS = 10;

  /** How far ahead of the worm center the tunnel extends. */
  private static readonly DIG_REACH = 20;

  /** Spacing between circles along the tunnel path. Overlap keeps it connected. */
  private static readonly DIG_STEP = 5;

  /** Aim angle threshold — block digging when aiming within 30° of straight up. */
  /** Block digging only within 10° of straight up (−80° threshold). */
  private static readonly DIG_BLOCK_ANGLE = -(Math.PI / 2 - Math.PI / 18);

  private prevLeft  = new Map<Worm, boolean>();
  private prevRight = new Map<Worm, boolean>();
  private prevUp    = new Map<Worm, boolean>();

  constructor(private terrainDestroyer: TerrainDestroyer) {}

  registerWorm(worm: Worm): void {
    this.prevLeft.set(worm, false);
    this.prevRight.set(worm, false);
    this.prevUp.set(worm, false);
  }

  update(worm: Worm, input: InputState): void {
    if (worm.isDead) return;

    // Rising-edge detection
    const tapLeft  = input.left  && !(this.prevLeft.get(worm)  ?? false);
    const tapRight = input.right && !(this.prevRight.get(worm) ?? false);
    const tapUp    = input.up    && !(this.prevUp.get(worm)    ?? false);

    // Digging blocked while CHANGE is held (LEFT/RIGHT become weapon cycling)
    if (!input.change) {
      const triggered =
        (input.left  && tapRight) ||
        (input.right && tapLeft)  ||
        (input.down  && tapUp);

      if (triggered) this.dig(worm);
    }

    this.prevLeft.set(worm,  input.left);
    this.prevRight.set(worm, input.right);
    this.prevUp.set(worm,    input.up);
  }

  /**
   * Carve a continuous tunnel from the worm center outward in crosshair
   * direction. Overlapping circles along the path guarantee connectivity.
   */
  private dig(worm: Worm): void {
    // Block digging when aiming too close to straight up
    if (worm.aimAngle < DiggingSystem.DIG_BLOCK_ANGLE) return;

    const r    = DiggingSystem.DIG_RADIUS;
    const step = DiggingSystem.DIG_STEP;

    // Aim direction vector (same as weapon fire direction)
    const baseAngle = worm.facingRight ? worm.aimAngle : Math.PI - worm.aimAngle;
    const aimX = Math.cos(baseAngle);
    const aimY = Math.sin(baseAngle);

    // Carve overlapping circles from worm center to DIG_REACH ahead
    const numSteps = Math.ceil(DiggingSystem.DIG_REACH / step);
    for (let i = 0; i <= numSteps; i++) {
      const dist = i * step;
      const cx = worm.x + aimX * dist;
      const cy = worm.y + aimY * dist;
      this.terrainDestroyer.carveCircle(cx, cy, r);
    }
  }
}
