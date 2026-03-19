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
    // Carve terrain
    this.terrainDestroyer.carveCircle(x, y, explosionRadius);

    // Damage falloff scales with explosion size: bigger blast → wider damage zone.
    // effectiveRadius = craterRadius * 3, so an 8px fragment hurts within 24px
    // and a 20px large_explosion hurts within 60px.
    const effectiveRadius = Math.max(splashRadius, explosionRadius * 3);

    // damage = splashDamage * (effectiveRadius - dist) / effectiveRadius
    // 50% self-damage for owner's own explosions.
    for (const worm of this.worms) {
      const dist = Math.hypot(worm.x - x, worm.y - y);
      if (dist < effectiveRadius) {
        const power = effectiveRadius - dist;
        let dmg = Math.round(splashDamage * power / effectiveRadius);
        if (ownerId !== undefined && worm.playerId === ownerId) dmg = Math.round(dmg * 0.5);
        if (dmg > 0) {
          worm.applyDamage(dmg);
          console.log(`[explosion] P${worm.playerId} at ${Math.round(x)},${Math.round(y)} dist=${Math.round(dist)} dmg=${dmg} radius=${explosionRadius} carved=yes`);
        }
      }
    }
  }
}
