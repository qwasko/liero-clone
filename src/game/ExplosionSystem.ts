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
  ): void {
    // Carve terrain
    this.terrainDestroyer.carveCircle(x, y, explosionRadius);

    // Damage worms within splash radius (linear falloff)
    for (const worm of this.worms) {
      const dist = Math.hypot(worm.x - x, worm.y - y);
      if (dist < splashRadius) {
        const falloff = 1 - dist / splashRadius;
        worm.applyDamage(Math.round(splashDamage * falloff));
      }
    }
  }
}
