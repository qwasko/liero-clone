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
    ownerId?:        1 | 2,
    fullSelfDamage?: boolean, // true = no self-damage reduction (e.g. bazooka)
    flatDamage?:     boolean, // true = full damage within radius, no distance falloff
  ): void {
    this.terrainDestroyer.carveCircle(x, y, explosionRadius);

    for (const worm of this.worms) {
      const dist = Math.hypot(worm.x - x, worm.y - y);
      if (dist < splashRadius) {
        let dmg = flatDamage
          ? splashDamage
          : Math.round(splashDamage * (splashRadius - dist) / splashRadius);
        if (!fullSelfDamage && ownerId !== undefined && worm.playerId === ownerId) {
          dmg = Math.round(dmg * 0.5);
        }
        if (dmg > 0) {
          worm.applyDamage(dmg);
        }
      }
    }
  }
}
