import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { InputState } from '../input/InputState';
import { TerrainMap } from '../terrain/TerrainMap';

const MAX_ROPE_LENGTH  = 220; // px
const MIN_ROPE_LENGTH  = 20;  // px — can't pull rope shorter than this
const ROPE_CAST_START  = 14;  // px from worm centre before we start sampling terrain
const LENGTH_ADJUST_SPEED = 70; // px/s (hold modifier + up/down)

interface Rope {
  anchorX: number;
  anchorY: number;
  length:  number;
}

/**
 * Ninja rope — always available, independent of the weapon loadout.
 *
 * Activation : hold [weapon-change key] + press [jump]
 * Release    : hold [weapon-change key] + press [jump] again
 * Lengthen   : hold [weapon-change key] + down
 * Shorten    : hold [weapon-change key] + up
 * Fire       : fully independent — rope state does not affect shooting
 * Weapons    : cannot be switched while rope is attached (caller responsibility)
 */
export class RopeSystem {
  private ropes    = new Map<Worm, Rope | null>();
  private prevJump = new Map<Worm, boolean>();

  registerWorm(worm: Worm): void {
    this.ropes.set(worm, null);
    this.prevJump.set(worm, false);
  }

  hasRope(worm: Worm): boolean {
    return (this.ropes.get(worm) ?? null) !== null;
  }

  /**
   * Call every frame before physics.
   * Returns true if a rope was just fired this frame.
   */
  handleInput(worm: Worm, input: InputState, terrain: TerrainMap, dt: number): boolean {
    const wasJump   = this.prevJump.get(worm) ?? false;
    const jumpEdge  = input.jump && !wasJump;
    this.prevJump.set(worm, input.jump);

    if (worm.isDead) {
      this.ropes.set(worm, null);
      return false;
    }

    const rope = this.ropes.get(worm) ?? null;

    // ── Toggle (modifier + jump rising edge) ─────────────────────────
    if (input.weaponModifier && jumpEdge) {
      if (rope) {
        // Release
        this.ropes.set(worm, null);
        return false;
      }
      // Shoot: raycast in aim direction
      return this.shoot(worm, terrain);
    }

    // ── Length adjustment (modifier + up/down, while attached) ───────
    if (rope && input.weaponModifier) {
      if (input.up) {
        rope.length = Math.max(MIN_ROPE_LENGTH, rope.length - LENGTH_ADJUST_SPEED * dt);
      } else if (input.down) {
        rope.length = Math.min(MAX_ROPE_LENGTH, rope.length + LENGTH_ADJUST_SPEED * dt);
      }
    }

    return false;
  }

  private shoot(worm: Worm, terrain: TerrainMap): boolean {
    const aimX = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
    const aimY = Math.sin(worm.aimAngle);

    for (let i = ROPE_CAST_START; i <= MAX_ROPE_LENGTH; i++) {
      const rx = worm.x + aimX * i;
      const ry = worm.y + aimY * i;
      if (terrain.isSolid(rx, ry)) {
        this.ropes.set(worm, { anchorX: rx, anchorY: ry, length: i });
        return true;
      }
    }
    return false; // no terrain found in range
  }

  /**
   * Apply pendulum constraint after PhysicsSystem has integrated the worm.
   * Called once per frame per worm.
   */
  applyConstraint(worm: Worm): void {
    const rope = this.ropes.get(worm) ?? null;
    if (!rope || worm.isDead) return;

    const dx   = worm.x - rope.anchorX;
    const dy   = worm.y - rope.anchorY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // Remove outward radial velocity (inelastic rope constraint)
    const radial = worm.vx * nx + worm.vy * ny;
    if (radial > 0) {
      worm.vx -= radial * nx;
      worm.vy -= radial * ny;
    }

    // Clamp position to rope length
    if (dist > rope.length) {
      worm.x = rope.anchorX + nx * rope.length;
      worm.y = rope.anchorY + ny * rope.length;
    }
  }

  releaseOnDeath(worm: Worm): void {
    if (worm.isDead) this.ropes.set(worm, null);
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    this.ropes.forEach((rope, worm) => {
      if (!rope || worm.isDead) return;
      g.lineStyle(1, 0xdddddd, 0.9);
      g.beginPath();
      g.moveTo(worm.x, worm.y);
      g.lineTo(rope.anchorX, rope.anchorY);
      g.strokePath();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(rope.anchorX, rope.anchorY, 3);
    });
  }
}
