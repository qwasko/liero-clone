import { Worm } from '../entities/Worm';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';

/**
 * Handles the result of a projectile impact:
 *   1. Carves a crater in the terrain.
 *   2. Applies radius-based splash damage to all worms.
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
    ownerId?:        1 | 2,  // if set, owner takes 50% damage
  ): void {
    // Carve terrain (small crater)
    this.terrainDestroyer.carveCircle(x, y, explosionRadius);

    // Damage uses splashRadius (Liero detectRange) — separate from carve radius.
    // damage = splashDamage * (splashRadius - dist) / splashRadius
    // 50% self-damage for owner's own explosions.
    for (const worm of this.worms) {
      const dist = Math.hypot(worm.x - x, worm.y - y);
      if (dist < splashRadius) {
        const power = splashRadius - dist;
        let dmg = Math.round(splashDamage * power / splashRadius);
        if (ownerId !== undefined && worm.playerId === ownerId) dmg = Math.round(dmg * 0.5);
        if (dmg > 0) {
          worm.applyDamage(dmg);
        }
      }
    }
  }
}
