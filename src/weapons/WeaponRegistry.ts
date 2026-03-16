import { WeaponDef } from './WeaponDef';

/**
 * Single source of truth for all weapon definitions.
 * Phases 4-6 add entries here; core logic never changes.
 */
export const WeaponRegistry: Record<string, WeaponDef> = {
  bazooka: {
    id:                 'bazooka',
    name:               'Bazooka',
    projectileSpeed:    300,
    projectileGravity:  1.0,
    projectileSize:     3,
    explosionRadius:    30,
    splashDamage:       50,
    splashRadius:       60,
    ammoMax:            5,
    reloadMs:           1200,
  },
};
