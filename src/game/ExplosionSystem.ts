import { Worm } from '../entities/Worm';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';
import { computeKnockback, getKnockbackForce } from '../utils/Knockback';
import { MAX_WORM_VX, MAX_WORM_VY } from './constants';

/**
 * Handles the result of a projectile impact:
 *   1. Carves a crater in the terrain.
 *   2. Applies radius-based splash damage to all worms.
 *   3. Applies knockback impulse to worms within blast radius.
 *
 * Called by GameScene's onHit callback; knows nothing about projectiles or weapons.
 */
export class ExplosionSystem {
  constructor(
    private terrainDestroyer: TerrainDestroyer,
    private worms: Worm[],
  ) {}

  detonate(
    x:               number,
    y:               number,
    explosionRadius: number,
    splashDamage:    number,
    splashRadius:    number,
    ownerId?:        1 | 2,
    fullSelfDamage?: boolean, // true = no self-damage reduction (e.g. bazooka)
    flatDamage?:     boolean, // true = full damage within radius, no distance falloff
  ): void {
    this.terrainDestroyer.carveCircle(x, y, explosionRadius);

    const kbForce = getKnockbackForce(splashDamage);

    for (const worm of this.worms) {
      if (worm.isDead) continue;
      const dist = Math.hypot(worm.x - x, worm.y - y);
      if (dist < splashRadius) {
        // ── Splash damage ─────────────────────────────────────────────
        let dmg = flatDamage
          ? splashDamage
          : Math.round(splashDamage * (splashRadius - dist) / splashRadius);
        if (!fullSelfDamage && ownerId !== undefined && worm.playerId === ownerId) {
          dmg = Math.round(dmg * 0.5);
        }
        if (dmg > 0) {
          worm.applyDamage(dmg);
        }

        // ── Knockback ─────────────────────────────────────────────────
        const kb = computeKnockback(worm.x, worm.y, x, y, kbForce, splashRadius);
        if (kb.dvx !== 0 || kb.dvy !== 0) {
          worm.vx += kb.dvx;
          worm.vy += kb.dvy;
          if (Math.abs(worm.vx) > MAX_WORM_VX) worm.vx = Math.sign(worm.vx) * MAX_WORM_VX;
          if (Math.abs(worm.vy) > MAX_WORM_VY) worm.vy = Math.sign(worm.vy) * MAX_WORM_VY;
        }
      }
    }
  }
}
