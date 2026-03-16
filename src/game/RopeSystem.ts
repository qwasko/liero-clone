import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { Loadout } from '../weapons/Loadout';
import { TerrainMap } from '../terrain/TerrainMap';

const MAX_ROPE_LENGTH = 220; // px
const ROPE_START_OFFSET = 12; // skip pixels around worm when casting

interface Rope {
  anchorX: number;
  anchorY: number;
  length:  number;
}

/**
 * Manages the ninja rope for all worms.
 *
 * Fire press:  shoot rope (attaches to first terrain pixel in aim direction).
 * Fire press again OR weapon change: release rope.
 * While attached: worm swings as a pendulum constrained by rope length.
 */
export class RopeSystem {
  private ropes    = new Map<Worm, Rope | null>();
  private prevFire = new Map<Worm, boolean>();

  registerWorm(worm: Worm): void {
    this.ropes.set(worm, null);
    this.prevFire.set(worm, false);
  }

  hasRope(worm: Worm): boolean {
    return this.ropes.get(worm) !== null;
  }

  /**
   * Call every frame. Handles shoot / release toggle for this worm.
   * Returns true if a rope was just fired.
   */
  handleInput(
    worm:      Worm,
    loadout:   Loadout,
    fireInput: boolean,
    terrain:   TerrainMap,
  ): boolean {
    if (loadout.activeWeapon.behavior !== 'rope') {
      // Switched away — release if active
      this.ropes.set(worm, null);
      this.prevFire.set(worm, fireInput);
      return false;
    }

    const wasDown = this.prevFire.get(worm) ?? false;
    this.prevFire.set(worm, fireInput);

    // Rising edge only
    if (!fireInput || wasDown || worm.isDead) return false;

    if (this.ropes.get(worm)) {
      // Already attached — release
      this.ropes.set(worm, null);
      loadout.consumeAmmo(); // triggers reload cooldown
      return false;
    }

    // Shoot: raycast in aim direction
    if (!loadout.canFire()) return false;

    const aimX = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
    const aimY = Math.sin(worm.aimAngle);

    for (let i = ROPE_START_OFFSET; i <= MAX_ROPE_LENGTH; i++) {
      const rx = worm.x + aimX * i;
      const ry = worm.y + aimY * i;
      if (terrain.isSolid(rx, ry)) {
        this.ropes.set(worm, { anchorX: rx, anchorY: ry, length: i });
        loadout.consumeAmmo();
        return true;
      }
    }

    // No terrain found in range — consume reload cooldown anyway
    loadout.consumeAmmo();
    return false;
  }

  /**
   * Apply pendulum constraint after normal physics have been integrated.
   * Call this after PhysicsSystem.update().
   */
  applyConstraints(worm: Worm): void {
    const rope = this.ropes.get(worm);
    if (!rope || worm.isDead) return;

    const dx   = worm.x - rope.anchorX;
    const dy   = worm.y - rope.anchorY;
    const dist = Math.hypot(dx, dy);

    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // Remove outward radial velocity component (inelastic constraint)
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

  /** Draw all active ropes. Call inside the overlay graphics clear/redraw loop. */
  draw(g: Phaser.GameObjects.Graphics): void {
    this.ropes.forEach((rope, worm) => {
      if (!rope || worm.isDead) return;
      g.lineStyle(1, 0xcccccc, 0.9);
      g.beginPath();
      g.moveTo(worm.x, worm.y);
      g.lineTo(rope.anchorX, rope.anchorY);
      g.strokePath();
      // Anchor dot
      g.fillStyle(0xffffff, 1);
      g.fillCircle(rope.anchorX, rope.anchorY, 3);
    });
  }
}
