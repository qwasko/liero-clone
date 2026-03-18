import { WeaponDef } from './WeaponDef';

export const WeaponRegistry: Record<string, WeaponDef> = {

  bazooka: {
    id: 'bazooka', name: 'Bazooka',
    fireMode: 'single',
    projectileSpeed: 300, projectileGravity: 1.0, projectileSize: 3, projectileColor: 0xffee44,
    pellets: 1, spread: 0, velocityVariance: 0.08,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 30, splashDamage: 35, splashRadius: 60,
    ammoMax: 5, infiniteAmmo: false, reloadMs: 1200,
  },

  minigun: {
    id: 'minigun', name: 'Minigun',
    fireMode: 'auto',
    projectileSpeed: 650, projectileGravity: 0.05, projectileSize: 2, projectileColor: 0xffee44,
    pellets: 1, spread: 0.07,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 2, splashDamage: 4, splashRadius: 10,
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 75,
  },

  grenade: {
    id: 'grenade', name: 'Grenade',
    fireMode: 'single',
    projectileSpeed: 260, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0xffcc00,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 4, fuseMs: 3000,
    chiquitaFragments: 7,
    explosionRadius: 40, splashDamage: 50, splashRadius: 75,
    ammoMax: 3, infiniteAmmo: false, reloadMs: 1800,
  },

  shotgun: {
    id: 'shotgun', name: 'Shotgun',
    fireMode: 'single',
    projectileSpeed: 400, projectileGravity: 0.25, projectileSize: 2, projectileColor: 0xffaa44,
    pellets: 8, spread: 0.70, randomSpread: true,   // ±20° cone (was ±24°)
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 4, splashDamage: 9, splashRadius: 18,
    ammoMax: 4, infiniteAmmo: false, reloadMs: 1400,
  },

  // ── New weapons ────────────────────────────────────────────────────────────

  larpa: {
    id: 'larpa', name: 'Bouncy Larpa',
    fireMode: 'single',
    projectileSpeed: 220, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0xcc44ff,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 3, fuseMs: 3000,
    explosionRadius: 35, splashDamage: 42, splashRadius: 65,
    ammoMax: 4, infiniteAmmo: false, reloadMs: 1600,
  },

  zimm: {
    id: 'zimm', name: 'Zimm',
    fireMode: 'single',
    projectileSpeed: 600, projectileGravity: 0, projectileSize: 2, projectileColor: 0xffffff,
    pellets: 1, spread: 0,
    behavior: 'zimm', maxBounces: 0, fuseMs: null,
    explosionRadius: 22, splashDamage: 27, splashRadius: 44,
    ammoMax: 8, infiniteAmmo: false, reloadMs: 700,
  },

  cluster_bomb: {
    id: 'cluster_bomb', name: 'Cluster Bomb',
    fireMode: 'single',
    projectileSpeed: 240, projectileGravity: 1.0, projectileSize: 5, projectileColor: 0xff4400,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 2, fuseMs: 2500,
    clusterWeapon: 'cluster_bomblet', clusterCount: 5,   // 4-6 grenades
    explosionRadius: 15, splashDamage: 14, splashRadius: 30,
    ammoMax: 2, infiniteAmmo: false, reloadMs: 2000,
  },

  /** Internal: grenade-like child spawned by cluster_bomb, then itself spawns fragments. */
  cluster_bomblet: {
    id: 'cluster_bomblet', name: 'Bomblet',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 1.0, projectileSize: 3, projectileColor: 0xff6600,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 2, fuseMs: 1200,
    chiquitaFragments: 5,                              // each bomblet → 4-6 fragments
    explosionRadius: 18, splashDamage: 20, splashRadius: 36,
    ammoMax: 0, infiniteAmmo: true, reloadMs: 0,
  },

  mine: {
    id: 'mine', name: 'Mine',
    fireMode: 'single',
    projectileSpeed: 130, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0x88bb22,
    pellets: 1, spread: 0,
    behavior: 'mine', maxBounces: 0, fuseMs: null,
    mineProximity: 22,
    explosionRadius: 45, splashDamage: 56, splashRadius: 80,
    ammoMax: 3, infiniteAmmo: false, reloadMs: 1500,
  },

  chiquita: {
    id: 'chiquita', name: 'Chiquita Bomb',
    fireMode: 'single',
    projectileSpeed: 235, projectileGravity: 1.0, projectileSize: 5, projectileColor: 0xffee22,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 2, fuseMs: 3000,
    chiquitaFragments: 7,                              // reduced from 11
    explosionRadius: 25, splashDamage: 20, splashRadius: 38,
    ammoMax: 2, infiniteAmmo: false, reloadMs: 2200,
  },

  /**
   * Internal: generic fragment spawned by grenade, cluster_bomblet, and chiquita.
   * Small explosion only — no further fragment spawning.
   */
  chiquita_fragment: {
    id: 'chiquita_fragment', name: 'Fragment',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0.35, projectileSize: 2, projectileColor: 0xffdd00,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 17, splashDamage: 6, splashRadius: 30,
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
