import { WeaponDef } from './WeaponDef';

export const WeaponRegistry: Record<string, WeaponDef> = {

  bazooka: {
    id: 'bazooka', name: 'Bazooka',
    fireMode: 'single',
    projectileSpeed: 300, projectileGravity: 1.0, projectileSize: 3, projectileColor: 0xffee44,
    pellets: 1, spread: 0, velocityVariance: 0.08,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 30, splashDamage: 50, splashRadius: 60,
    ammoMax: 5, infiniteAmmo: false, reloadMs: 1200,
  },

  minigun: {
    id: 'minigun', name: 'Minigun',
    fireMode: 'auto',
    projectileSpeed: 650, projectileGravity: 0.05, projectileSize: 2, projectileColor: 0xffee44,
    pellets: 1, spread: 0.07,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 6, splashDamage: 8, splashRadius: 18,
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 75,
  },

  grenade: {
    id: 'grenade', name: 'Grenade',
    fireMode: 'single',
    projectileSpeed: 260, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0xffcc00,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 4, fuseMs: 3000,
    explosionRadius: 40, splashDamage: 70, splashRadius: 75,
    ammoMax: 3, infiniteAmmo: false, reloadMs: 1800,
  },

  shotgun: {
    id: 'shotgun', name: 'Shotgun',
    fireMode: 'single',
    projectileSpeed: 400, projectileGravity: 0.25, projectileSize: 2, projectileColor: 0xffaa44,
    pellets: 8, spread: 0.85, randomSpread: true,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 4, splashDamage: 16, splashRadius: 18,
    ammoMax: 4, infiniteAmmo: false, reloadMs: 1400,
  },

  // ── New weapons ────────────────────────────────────────────────────────────

  larpa: {
    id: 'larpa', name: 'Bouncy Larpa',
    fireMode: 'single',
    projectileSpeed: 220, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0xcc44ff,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 3, fuseMs: 3000,
    explosionRadius: 35, splashDamage: 60, splashRadius: 65,
    ammoMax: 4, infiniteAmmo: false, reloadMs: 1600,
  },

  zimm: {
    id: 'zimm', name: 'Zimm',
    fireMode: 'single',
    projectileSpeed: 600, projectileGravity: 0, projectileSize: 2, projectileColor: 0xffffff,
    pellets: 1, spread: 0,
    behavior: 'zimm', maxBounces: 0, fuseMs: null,
    explosionRadius: 22, splashDamage: 38, splashRadius: 44,
    ammoMax: 8, infiniteAmmo: false, reloadMs: 700,
  },

  cluster_bomb: {
    id: 'cluster_bomb', name: 'Cluster Bomb',
    fireMode: 'single',
    projectileSpeed: 240, projectileGravity: 1.0, projectileSize: 5, projectileColor: 0xff4400,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 2, fuseMs: 2500,
    clusterWeapon: 'cluster_bomblet', clusterCount: 7,
    explosionRadius: 15, splashDamage: 20, splashRadius: 30,
    ammoMax: 2, infiniteAmmo: false, reloadMs: 2000,
  },

  /** Internal: child projectile spawned by cluster_bomb. Not in loadout. */
  cluster_bomblet: {
    id: 'cluster_bomblet', name: 'Bomblet',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 1.0, projectileSize: 3, projectileColor: 0xff6600,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 2, fuseMs: 1200,
    explosionRadius: 22, splashDamage: 30, splashRadius: 42,
    ammoMax: 0, infiniteAmmo: true, reloadMs: 0,
  },

  mine: {
    id: 'mine', name: 'Mine',
    fireMode: 'single',
    projectileSpeed: 130, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0x88bb22,
    pellets: 1, spread: 0,
    behavior: 'mine', maxBounces: 0, fuseMs: null,
    mineProximity: 22,
    explosionRadius: 45, splashDamage: 80, splashRadius: 80,
    ammoMax: 3, infiniteAmmo: false, reloadMs: 1500,
  },

  chiquita: {
    id: 'chiquita', name: 'Chiquita Bomb',
    fireMode: 'single',
    projectileSpeed: 235, projectileGravity: 1.0, projectileSize: 5, projectileColor: 0xffee22,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 2, fuseMs: 3000,
    chiquitaFragments: 11,
    explosionRadius: 25, splashDamage: 28, splashRadius: 38,
    ammoMax: 2, infiniteAmmo: false, reloadMs: 2200,
  },

  /** Internal: banana fragment spawned by chiquita on explosion. Not in loadout. */
  chiquita_fragment: {
    id: 'chiquita_fragment', name: 'Banana',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0.35, projectileSize: 2, projectileColor: 0xffdd00,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 10, splashDamage: 15, splashRadius: 22,
    ammoMax: 0, infiniteAmmo: true, reloadMs: 0,
  },

  rope: {
    id: 'rope', name: 'Ninja Rope',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0, projectileSize: 0, projectileColor: 0xffffff,
    pellets: 1, spread: 0,
    behavior: 'rope', maxBounces: 0, fuseMs: null,
    explosionRadius: 0, splashDamage: 0, splashRadius: 0,
    ammoMax: 0, infiniteAmmo: true, reloadMs: 400,
  },

};

/**
 * Default loadout given to each player.
 * Ninja rope is NOT included — always available via CHANGE+JUMP.
 * Internal weapons (cluster_bomblet, chiquita_fragment) are NOT included.
 */
export const DEFAULT_LOADOUT: WeaponDef[] = [
  WeaponRegistry.bazooka,
  WeaponRegistry.minigun,
  WeaponRegistry.grenade,
  WeaponRegistry.shotgun,
  WeaponRegistry.larpa,
  WeaponRegistry.zimm,
  WeaponRegistry.cluster_bomb,
  WeaponRegistry.mine,
  WeaponRegistry.chiquita,
];
