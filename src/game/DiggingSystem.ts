import { Worm } from '../entities/Worm';
import { InputState } from '../input/InputState';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';

/**
 * Digging mechanic — faithful to original Liero.
 *
 * Trigger: hold a direction key + tap (rising edge) the OPPOSITE direction.
 *   dig left  = hold LEFT  + tap RIGHT
 *   dig right = hold RIGHT + tap LEFT
 *   dig up    = hold UP    + tap DOWN
 *   dig down  = hold DOWN  + tap UP
 *
 * Each tap carves one tunnel-sized circle at the worm's leading edge.
 * Works on ground and while on the ninja rope.
 * Suppressed while the weapon-modifier key is held (up/down = rope length there).
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
    const tapDown  = input.down  && !(this.prevDown.get(worm)  ?? false);

    // Horizontal digs (no modifier conflict)
    if (input.left  && tapRight) this.dig(worm, -1,  0);
    if (input.right && tapLeft)  this.dig(worm,  1,  0);

    // Vertical digs — suppressed while weapon-modifier is held
    // (up/down is used for rope-length adjustment in that mode)
    if (!input.weaponModifier) {
      if (input.up   && tapDown) this.dig(worm,  0, -1);
      if (input.down && tapUp)   this.dig(worm,  0,  1);
    }

    this.prevLeft.set(worm,  input.left);
    this.prevRight.set(worm, input.right);
    this.prevUp.set(worm,    input.up);
    this.prevDown.set(worm,  input.down);
  }

  private dig(worm: Worm, dx: number, dy: number): void {
    const r  = DiggingSystem.DIG_RADIUS;
    // Carve centred at the worm's leading face + half a radius into the terrain
    const cx = worm.x + dx * (worm.width  / 2 + r * 0.6);
    const cy = worm.y + dy * (worm.height / 2 + r * 0.6);
    this.terrainDestroyer.carveCircle(cx, cy, r);
  }
}
