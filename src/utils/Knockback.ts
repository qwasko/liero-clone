import {
  KNOCKBACK_FORCE_LARGE,
  KNOCKBACK_FORCE_MEDIUM,
  KNOCKBACK_FORCE_SMALL,
} from '../game/constants';

/**
 * Compute knockback velocity delta from an explosion.
 * Direction: away from blast center. Magnitude: scales with proximity.
 * Returns (0,0) if entity is outside radius.
 */
export function computeKnockback(
  entityX: number, entityY: number,
  blastX: number, blastY: number,
  baseForce: number, radius: number,
): { dvx: number; dvy: number } {
  const dx = entityX - blastX;
  const dy = entityY - blastY;
  const dist = Math.hypot(dx, dy);

  if (dist >= radius) return { dvx: 0, dvy: 0 };

  // Direction: away from blast center; straight up if at epicenter
  let nx: number, ny: number;
  if (dist < 1) {
    nx = 0;
    ny = -1;
  } else {
    nx = dx / dist;
    ny = dy / dist;
  }

  // Force scales linearly: full at center, zero at edge
  const force = baseForce * (1 - dist / radius);

  return { dvx: nx * force, dvy: ny * force };
}

/** Base knockback force for a given explosion crater radius. */
export function getKnockbackForce(explosionRadius: number): number {
  if (explosionRadius >= 8) return KNOCKBACK_FORCE_LARGE;
  if (explosionRadius >= 6) return KNOCKBACK_FORCE_MEDIUM;
  return KNOCKBACK_FORCE_SMALL;
}
