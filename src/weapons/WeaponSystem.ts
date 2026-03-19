import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { Loadout } from './Loadout';
import { WeaponDef } from './WeaponDef';

export class WeaponSystem {
  private prevFire = new Map<Worm, boolean>();

  /**
   * Called every frame. Returns newly spawned projectiles (may be >1 for shotgun).
   * Returns empty array for rope weapons — handled by RopeSystem.
   */
  tryFire(worm: Worm, loadout: Loadout, fireInput: boolean): Projectile[] {
    const wasDown = this.prevFire.get(worm) ?? false;
    this.prevFire.set(worm, fireInput);

    if (!fireInput || worm.isDead || !loadout.canFire()) return [];

    const weapon = loadout.activeWeapon;

    // Single-shot: only fire on the rising edge
    if (weapon.fireMode === 'single' && wasDown) return [];

    // Rope weapons are handled entirely by RopeSystem
    if (weapon.behavior === 'rope') return [];

    loadout.consumeAmmo();
    return this.spawnPellets(worm, weapon);
  }

  private spawnPellets(worm: Worm, weapon: WeaponDef): Projectile[] {
    const result: Projectile[] = [];

    // Base angle: respect facing direction
    const baseAngle = worm.facingRight ? worm.aimAngle : Math.PI - worm.aimAngle;
    const aimX = Math.cos(baseAngle);
    const aimY = Math.sin(baseAngle);

    const spawnX = worm.x + aimX * (worm.width  / 2 + 3);
    const spawnY = worm.y + aimY * (worm.height / 2 + 3);

    for (let i = 0; i < weapon.pellets; i++) {
      const speedMult = weapon.velocityVariance
        ? 1 + (Math.random() - 0.5) * weapon.velocityVariance
        : 1;

      const baseVx = Math.cos(baseAngle) * weapon.projectileSpeed * speedMult;
      const baseVy = Math.sin(baseAngle) * weapon.projectileSpeed * speedMult;

      let vx: number;
      let vy: number;

      if (weapon.distribution) {
        // ── Liero-style per-axis velocity jitter ──────────────────────
        // Applied independently to vx and vy: rand(-dist, +dist) on each axis.
        const dist = weapon.distribution;
        vx = baseVx + (Math.random() * 2 - 1) * dist;
        vy = baseVy + (Math.random() * 2 - 1) * dist;
      } else if (weapon.spread) {
        // ── Legacy angle-based spread (used if no distribution set) ───
        let angleOffset: number;
        if (weapon.pellets === 1) {
          angleOffset = (Math.random() - 0.5) * weapon.spread;
        } else if (weapon.randomSpread) {
          angleOffset = (Math.random() - 0.5) * weapon.spread;
        } else {
          angleOffset = (i / (weapon.pellets - 1) - 0.5) * weapon.spread;
        }
        const angle = baseAngle + angleOffset;
        vx = Math.cos(angle) * weapon.projectileSpeed * speedMult;
        vy = Math.sin(angle) * weapon.projectileSpeed * speedMult;
      } else {
        vx = baseVx;
        vy = baseVy;
      }

      result.push(new Projectile(
        spawnX, spawnY, vx, vy,
        worm.playerId,
        weapon,
      ));
    }

    return result;
  }
}
