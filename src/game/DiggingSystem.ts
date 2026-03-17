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
  /** Radius of the carved circle per dig action. Must fit worm through the hole. */
  private static readonly DIG_RADIUS = 9;

  /** Aim angle threshold — block digging when aiming within 30° of straight up. */
  private static readonly DIG_BLOCK_ANGLE = -Math.PI / 3;

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

  /** Carve a hole in the worm's crosshair direction. */
  private dig(worm: Worm): void {
    // Block digging when aiming too close to straight up
    if (worm.aimAngle < DiggingSystem.DIG_BLOCK_ANGLE) return;

    const r = DiggingSystem.DIG_RADIUS;

    // Aim direction vector (same as weapon fire direction)
    const baseAngle = worm.facingRight ? worm.aimAngle : Math.PI - worm.aimAngle;
    const aimX = Math.cos(baseAngle);
    const aimY = Math.sin(baseAngle);

    // Carve centred at the worm's leading face in crosshair direction
    const cx = worm.x + aimX * (worm.width / 2 + r * 0.6);
    const cy = worm.y + aimY * (worm.height / 2 + r * 0.6);
    this.terrainDestroyer.carveCircle(cx, cy, r);
  }
}
