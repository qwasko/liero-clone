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
      let angleOffset: number;
      if (weapon.pellets === 1) {
        // Single pellet: random spread (gives minigun its natural drift)
        angleOffset = (Math.random() - 0.5) * weapon.spread;
      } else {
        // Multiple pellets: evenly distributed across spread arc
        angleOffset = (i / (weapon.pellets - 1) - 0.5) * weapon.spread;
      }

      const angle = baseAngle + angleOffset;
      result.push(new Projectile(
        spawnX, spawnY,
        Math.cos(angle) * weapon.projectileSpeed,
        Math.sin(angle) * weapon.projectileSpeed,
        worm.playerId,
        weapon,
      ));
    }

    return result;
  }
}
