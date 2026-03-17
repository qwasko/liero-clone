import { WeaponDef } from './WeaponDef';

export const WeaponRegistry: Record<string, WeaponDef> = {

  bazooka: {
    id: 'bazooka', name: 'Bazooka',
    fireMode: 'single',
    projectileSpeed: 300, projectileGravity: 1.0, projectileSize: 3,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 30, splashDamage: 50, splashRadius: 60,
    ammoMax: 5, infiniteAmmo: false, reloadMs: 1200,
  },

  minigun: {
    id: 'minigun', name: 'Minigun',
    fireMode: 'auto',
    projectileSpeed: 650, projectileGravity: 0.05, projectileSize: 2,
    pellets: 1, spread: 0.07,           // slight random spread per bullet
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 6, splashDamage: 8, splashRadius: 18,
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 75,
  },

  grenade: {
    id: 'grenade', name: 'Grenade',
    fireMode: 'single',
    projectileSpeed: 260, projectileGravity: 1.0, projectileSize: 4,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 4, fuseMs: 3000,
    explosionRadius: 40, splashDamage: 70, splashRadius: 75,
    ammoMax: 3, infiniteAmmo: false, reloadMs: 1800,
  },

  shotgun: {
    id: 'shotgun', name: 'Shotgun',
    fireMode: 'single',
    projectileSpeed: 420, projectileGravity: 0.25, projectileSize: 2,
    pellets: 7, spread: 0.28,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 4, splashDamage: 16, splashRadius: 18,
    ammoMax: 4, infiniteAmmo: false, reloadMs: 1400,
  },

  rope: {
    id: 'rope', name: 'Ninja Rope',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0, projectileSize: 0,
    pellets: 1, spread: 0,
    behavior: 'rope', maxBounces: 0, fuseMs: null,
    explosionRadius: 0, splashDamage: 0, splashRadius: 0,
    ammoMax: 0, infiniteAmmo: true, reloadMs: 400,
  },

};

/**
 * Default 5-weapon loadout given to each player.
 * Ninja rope is NOT included — it is always available separately via
 * hold [weapon-change] + [jump].
 */
export const DEFAULT_LOADOUT: WeaponDef[] = [
  WeaponRegistry.bazooka,
  WeaponRegistry.minigun,
  WeaponRegistry.grenade,
  WeaponRegistry.shotgun,
];
