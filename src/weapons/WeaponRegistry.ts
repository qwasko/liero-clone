import { WeaponDef } from './WeaponDef';

/*
 * Liero-accurate weapon parameters.
 *
 * Unit conversion from original Liero (16.16 fixed-point, ~70 fps):
 *   Original speed 100 ≈ 1 px/frame ≈ 70 px/s → our speed = original * 0.7
 *   Original distribution is per-axis velocity jitter in fixed-point units.
 *   We convert: distribution_px_s = original_value * 0.7 / 100
 *   (since original speed/100 gives px/frame velocity at ~70fps)
 *
 * Explosion damage uses Liero's distance-based formula:
 *   actualDamage = damage * (detectRange - distance) / detectRange
 *   splashRadius = detectRange (same as explosion radius for damage calc)
 *
 * All ammo set to 10000 for testing.
 */
export const WeaponRegistry: Record<string, WeaponDef> = {

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=200, addSpeed=3, dist=0, grav=0, hitDmg=12
  //  splinterAmount=12, splinterType=particle__small_damage
  //  createOnExp=large_explosion (detectRange=20, damage=15)
  // ═══════════════════════════════════════════════════════════════════════════
  bazooka: {
    id: 'bazooka', name: 'Bazooka',
    fireMode: 'single',
    projectileSpeed: 300, projectileGravity: 0, projectileSize: 3, projectileColor: 0xffee44,
    pellets: 1, spread: 0, distribution: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    chiquitaFragments: 12,                              // 12 splinters (particle__small_damage)
    explosionRadius: 20, splashDamage: 15, splashRadius: 20,
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 1200,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=260, dist=6000, grav=700, hitDmg=2, parts=1
  //  delay=0 (fires every frame), createOnExp=small_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  minigun: {
    id: 'minigun', name: 'Minigun',
    fireMode: 'auto',
    projectileSpeed: 520, projectileGravity: 0.12, projectileSize: 2, projectileColor: 0xffee44,
    pellets: 1, spread: 0, distribution: 42,            // Liero 6000 → ~42 px/s
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 8, splashDamage: 5, splashRadius: 8,  // small_explosion on ground hit
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 50,     // fires nearly every frame
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=170, dist=7000, grav=1300, bounce=40
  //  timeToExplo=115, splinterAmount=50, splinterType=particle__larger_damage(4dmg)
  //  createOnExp=large_explosion (detectRange=20, damage=15)
  // ═══════════════════════════════════════════════════════════════════════════
  grenade: {
    id: 'grenade', name: 'Grenade',
    fireMode: 'single',
    projectileSpeed: 260, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0xffcc00,
    pellets: 1, spread: 0, distribution: 49,            // Liero 7000 → ~49 px/s
    behavior: 'bounce', maxBounces: 999, fuseMs: 1640,  // 115 frames @ 70fps ≈ 1640ms
    bouncePercent: 40,                                   // 40% velocity retained
    chiquitaFragments: 50,                               // 50 fragments! (particle__larger_damage)
    explosionRadius: 20, splashDamage: 15, splashRadius: 20,
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 1800,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=250, dist=12000, parts=15, grav=700
  //  hitDmg=1, blowAway=4, recoil=55, createOnExp=small_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  shotgun: {
    id: 'shotgun', name: 'Shotgun',
    fireMode: 'single',
    projectileSpeed: 400, projectileGravity: 0.12, projectileSize: 2, projectileColor: 0xffaa44,
    pellets: 15, spread: 0, distribution: 84,           // Liero 12000 → ~84 px/s
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 8, splashDamage: 5, splashRadius: 8,  // small_explosion
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 1400,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=220, grav=200, bounce=100 (perfect elastic)
  //  timeToExplo=380, splinterAmount=5, partTrail=particle__small_damage
  //  createOnExp=medium_explosion (detectRange=14, damage=10)
  // ═══════════════════════════════════════════════════════════════════════════
  larpa: {
    id: 'larpa', name: 'Bouncy Larpa',
    fireMode: 'single',
    projectileSpeed: 220, projectileGravity: 0.15, projectileSize: 4, projectileColor: 0xcc44ff,
    pellets: 1, spread: 0, distribution: 0,
    behavior: 'bounce', maxBounces: 999, fuseMs: 5430,  // 380 frames @ 70fps ≈ 5430ms
    bouncePercent: 100,                                  // perfect elastic bounce
    chiquitaFragments: 5,
    explosionRadius: 14, splashDamage: 10, splashRadius: 14,
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 1600,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=300, grav=0, bounce=100, hitDmg=49
  //  wormExplode=true, explGround=false (bounces off terrain!)
  //  timeToExplo=1000, createOnExp=zimm_flash (0 damage)
  // ═══════════════════════════════════════════════════════════════════════════
  zimm: {
    id: 'zimm', name: 'Zimm',
    fireMode: 'single',
    projectileSpeed: 600, projectileGravity: 0, projectileSize: 2, projectileColor: 0xffffff,
    pellets: 1, spread: 0, distribution: 0,
    behavior: 'zimm', maxBounces: 0, fuseMs: 14300,     // 1000 frames @ 70fps ≈ 14.3s
    explosionRadius: 4, splashDamage: 49, splashRadius: 8,  // zimm_flash: cosmetic + direct damage
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 700,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=170, dist=7000, grav=1300, bounce=50
  //  timeToExplo=135, splinterAmount=20, splinterType=clusterbomb_bombs
  //  createOnExp=large_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  cluster_bomb: {
    id: 'cluster_bomb', name: 'Cluster Bomb',
    fireMode: 'single',
    projectileSpeed: 240, projectileGravity: 1.0, projectileSize: 5, projectileColor: 0xff4400,
    pellets: 1, spread: 0, distribution: 49,            // Liero 7000
    behavior: 'bounce', maxBounces: 999, fuseMs: 1930,  // 135 frames @ 70fps
    bouncePercent: 50,
    clusterWeapon: 'cluster_bomblet', clusterCount: 20, // 20 bomblets!
    explosionRadius: 20, splashDamage: 15, splashRadius: 20,
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 2000,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero NObj: clusterbomb_bombs
  //  speed=220, speedV=140, dist=10000, grav=1000, hitDmg=1
  //  wormExplode=true, explGround=true, createOnExp=medium_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  cluster_bomblet: {
    id: 'cluster_bomblet', name: 'Bomblet',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 1.0, projectileSize: 3, projectileColor: 0xff6600,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 14, splashDamage: 10, splashRadius: 14,  // medium_explosion (carve+damage on hit)
    ammoMax: 0, infiniteAmmo: true, reloadMs: 0,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=95, dist=8000, grav=1000, bounce=40
  //  timeToExplo=15000 (essentially permanent), detectDistance=2
  //  hitDmg=12, blowAway=60, createOnExp=large_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  mine: {
    id: 'mine', name: 'Mine',
    fireMode: 'single',
    projectileSpeed: 130, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0x88bb22,
    pellets: 1, spread: 0, distribution: 56,            // Liero 8000
    behavior: 'mine', maxBounces: 0, fuseMs: 214000,    // 15000 frames ≈ 214s (essentially permanent)
    mineProximity: 22,
    explosionRadius: 20, splashDamage: 15, splashRadius: 20,  // large_explosion
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 1500,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero: speed=170, dist=7000, grav=1300, bounce=40
  //  timeToExplo=150, splinterAmount=22, splinterType=chiquitabomb_bombs
  //  createOnExp=large_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  chiquita: {
    id: 'chiquita', name: 'Chiquita Bomb',
    fireMode: 'single',
    projectileSpeed: 235, projectileGravity: 1.0, projectileSize: 5, projectileColor: 0xffee22,
    pellets: 1, spread: 0, distribution: 49,            // Liero 7000
    behavior: 'bounce', maxBounces: 999, fuseMs: 2140,  // 150 frames @ 70fps
    bouncePercent: 40,
    chiquitaFragments: 22,                               // 22 bomblets!
    explosionRadius: 20, splashDamage: 15, splashRadius: 20,
    ammoMax: 10000, infiniteAmmo: false, reloadMs: 2200,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero particle__larger_damage (used by grenade fragments):
  //  speed=220, speedV=180, dist=2000, grav=700, hitDmg=4
  //  createOnExp=small_explosion — chain damage!
  //
  //  Liero particle__small_damage (used by bazooka/larpa fragments):
  //  speed=160, speedV=140, dist=2000, grav=700, hitDmg=2
  //  createOnExp=small_explosion
  //
  //  We use a single fragment type with averaged values.
  // ═══════════════════════════════════════════════════════════════════════════
  chiquita_fragment: {
    id: 'chiquita_fragment', name: 'Fragment',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0.5, projectileSize: 2, projectileColor: 0xffdd00,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 8, splashDamage: 5, splashRadius: 8,  // small_explosion: chain damage (carve+damage on hit)
    ammoMax: 0, infiniteAmmo: true, reloadMs: 0,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Chiquita bomblet: like cluster bomblet but stronger
  //  Original: chiquitabomb_bombs — hitDmg=4, createOnExp=large_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  chiquita_bomblet: {
    id: 'chiquita_bomblet', name: 'Banana Fragment',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 1.0, projectileSize: 3, projectileColor: 0xffcc00,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    explosionRadius: 20, splashDamage: 15, splashRadius: 20,  // large_explosion! (carve+damage on hit)
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
