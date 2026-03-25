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

  // Flat force — full knockback for anything within blast radius (Liero behavior)
  return { dvx: nx * baseForce, dvy: ny * baseForce };
}

/** Base knockback force based on splash damage. */
export function getKnockbackForce(splashDamage: number): number {
  if (splashDamage > 30) return KNOCKBACK_FORCE_LARGE;
  if (splashDamage >= 10) return KNOCKBACK_FORCE_MEDIUM;
  return KNOCKBACK_FORCE_SMALL;
}
