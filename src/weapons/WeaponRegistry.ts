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
 *   splashRadius = detectRange (damage falloff range, separate from carve radius)
 *
 * Liero explosion types (carve is texture-based ~16x16, approximated as radius):
 *   large_explosion:  carve ~8px,  detectRange=20, damage=15
 *   medium_explosion: carve ~6px,  detectRange=14, damage=10
 *   small_explosion:  carve ~4px,  detectRange=8,  damage=5
 *
 * Ammo/reload conversion from Liero (all timers are in frames at ~70fps):
 *   delayMs     = delay_frames × 1000 / 70
 *   loadingTimeMs = loadingTime_frames × 1000 / 70
 *   ammoPerMag  = ammo (direct from Liero)
 *   totalAmmo   = 10000 (effectively unlimited, for testing)
 */
export const WeaponRegistry: Record<string, WeaponDef> = {

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero: speed=200, addSpeed=3, dist=0, grav=0, hitDmg=12
  //  delay=75, loadingTime=410, ammo=3
  //  splinterAmount=12, splinterType=particle__small_damage
  //  createOnExp=large_explosion (detectRange=20, damage=15)
  // ═══════════════════════════════════════════════════════════════════════════
  bazooka: {
    id: 'bazooka', name: 'Bazooka',
    fireMode: 'single',
    projectileSpeed: 300, projectileGravity: 0.04, projectileSize: 3, projectileColor: 0xffee44,
    pellets: 1, spread: 0, distribution: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    hitDamage: 12,                                             // Liero: hitDmg=12
    chiquitaFragments: 12,                              // 12 splinters (particle__small_damage)
    explosionRadius: 8, splashDamage: 50, splashRadius: 20,   // large_explosion, boosted damage
    recoilForce: 100,
    ammoPerMag: 3, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 1071, loadingTimeMs: 5857,                 // Liero: delay=75, loadingTime=410
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero: speed=260, dist=6000, grav=700, hitDmg=2, parts=1
  //  delay=0, loadingTime=500, ammo=70
  //  createOnExp=small_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  minigun: {
    id: 'minigun', name: 'Minigun',
    fireMode: 'auto',
    projectileSpeed: 520, projectileGravity: 0.12, projectileSize: 2, projectileColor: 0xffee44,
    pellets: 1, spread: 0, distribution: 42,            // Liero 6000 → ~42 px/s
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    hitDamage: 1,                                              // tuned: 1 per bullet
    explosionRadius: 4, splashDamage: 0, splashRadius: 8,   // small_explosion: carve only, no worm damage
    recoilForce: 11,
    ammoPerMag: 70, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 0, loadingTimeMs: 7143,                    // Liero: delay=0, loadingTime=500
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero: speed=170, dist=7000, grav=1300, bounce=40, hitDmg=0
  //  delay=0, loadingTime=260, ammo=1
  //  timeToExplo=115 (+V=10), splinterAmount=50, particle__larger_damage
  //  createOnExp=large_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  grenade: {
    id: 'grenade', name: 'Grenade',
    fireMode: 'single',
    projectileSpeed: 260, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0xffcc00,
    pellets: 1, spread: 0, distribution: 49,            // Liero 7000 → ~49 px/s
    behavior: 'bounce', maxBounces: 999, fuseMs: 2390,  // 115+45 frames @ 70fps ≈ 2390ms
    bouncePercent: 40,                                   // 40% velocity retained
    wormCollide: false,                                  // passes through worms, fuse-only detonation
    chiquitaFragments: 50,                               // 50 fragments (Liero-accurate)
    explosionRadius: 8, splashDamage: 15, splashRadius: 20,   // large_explosion
    recoilForce: 50,
    ammoPerMag: 2, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 0, loadingTimeMs: 3714,                    // Liero: delay=0, loadingTime=260
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Proximity Grenade: same physics as grenade but explodes on worm proximity
  //  Triggers on fuse timer OR any worm within 20px
  // ═══════════════════════════════════════════════════════════════════════════
  proximity_grenade: {
    id: 'proximity_grenade', name: 'Prox. Grenade',
    fireMode: 'single',
    projectileSpeed: 260, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0xff6600,
    pellets: 1, spread: 0, distribution: 49,
    behavior: 'bounce', maxBounces: 999, fuseMs: 2390,
    bouncePercent: 40,
    mineProximity: 20,                                   // proximity trigger: 20px any worm
    proximityDelayMs: 857,                               // 60 frames @ 70fps — prevents self-trigger
    chiquitaFragments: 35,                               // weaker: 35 vs grenade's 50
    explosionRadius: 8, splashDamage: 15, splashRadius: 20,
    ammoPerMag: 1, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 0, loadingTimeMs: 5000,                     // loadingTime=350 frames (longer than grenade 260)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero: speed=250, dist=12000, parts=15, grav=700, hitDmg=1
  //  delay=57, loadingTime=235, ammo=5
  //  blowAway=4, recoil=55, createOnExp=small_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  shotgun: {
    id: 'shotgun', name: 'Shotgun',
    fireMode: 'single',
    projectileSpeed: 400, projectileGravity: 0.12, projectileSize: 2, projectileColor: 0xffaa44,
    pellets: 15, spread: 0, distribution: 84,           // Liero 12000 → ~84 px/s
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    hitDamage: 4,                                              // direct pellet hit only, no splash
    explosionRadius: 4, splashDamage: 0, splashRadius: 8,   // small_explosion: carve only
    recoilForce: 200,
    ammoPerMag: 3, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 814, loadingTimeMs: 3357,                  // Liero: delay=57, loadingTime=235
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Bouncy Larpa: elastic bounce with trail particles
  //  8s fuse, drops trail every 8 frames; trail deals area denial damage
  // ═══════════════════════════════════════════════════════════════════════════
  larpa: {
    id: 'larpa', name: 'Bouncy Larpa',
    fireMode: 'single',
    projectileSpeed: 220, projectileGravity: 0.15, projectileSize: 4, projectileColor: 0xcc44ff,
    pellets: 1, spread: 0, distribution: 0,
    behavior: 'bounce', maxBounces: 999, fuseMs: 8000,
    bouncePercent: 100,
    ownerGraceMs: 857,                                   // 60 frames — no self-damage initially
    trailWeaponId: 'larpa_trail', trailIntervalMs: 114,  // every 8 frames @ 70fps
    chiquitaFragments: 8,
    explosionRadius: 10, splashDamage: 50, splashRadius: 20,
    recoilForce: 40,
    ammoPerMag: 4, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 429, loadingTimeMs: 5571,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  LARPA trail particle: slow, low gravity, small area denial damage
  // ═══════════════════════════════════════════════════════════════════════════
  larpa_trail: {
    id: 'larpa_trail', name: 'Larpa Trail',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0.3, projectileSize: 2, projectileColor: 0xcc44ff,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,    // explodes on terrain/worm hit
    explosionRadius: 4, splashDamage: 5, splashRadius: 8,
    hitDamage: 3,
    ammoPerMag: 1, totalAmmo: 1, infiniteAmmo: true,
    delayMs: 0, loadingTimeMs: 0,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero: speed=300, grav=0, bounce=100, hitDmg=49
  //  delay=70, loadingTime=540, ammo=2
  //  wormExplode=true, explGround=false (bounces off terrain!)
  //  timeToExplo=1000 (+V=300), createOnExp=zimm_flash (0 damage)
  // ═══════════════════════════════════════════════════════════════════════════
  zimm: {
    id: 'zimm', name: 'Zimm',
    fireMode: 'single',
    projectileSpeed: 400, projectileGravity: 0.15, projectileSize: 2, projectileColor: 0xffffff,
    pellets: 1, spread: 0, distribution: 0,
    behavior: 'zimm', maxBounces: 0, fuseMs: 14300,     // 1000 frames @ 70fps ≈ 14.3s
    ownerGraceMs: 429,                                         // 30 frames — no self-hit on spawn
    hitDamage: 49,                                             // Liero: hitDmg=49
    explosionRadius: 4, splashDamage: 0, splashRadius: 8,  // zimm_flash: cosmetic only, damage is via hitDmg
    recoilForce: 60,
    ammoPerMag: 2, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 1000, loadingTimeMs: 7714,                 // Liero: delay=70, loadingTime=540
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero: speed=170, dist=7000, grav=1300, bounce=50, hitDmg=0
  //  delay=0, loadingTime=400, ammo=1
  //  timeToExplo=135 (+V=15), splinterAmount=20, clusterbomb_bombs
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
    explosionRadius: 8, splashDamage: 15, splashRadius: 20,   // large_explosion
    recoilForce: 40,
    ammoPerMag: 1, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 0, loadingTimeMs: 5714,                    // Liero: delay=0, loadingTime=400
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Original Liero NObj: clusterbomb_bombs
  //  speed=220, speedV=140, dist=10000, grav=1000, hitDmg=1
  //  wormExplode=true, createOnExp=medium_explosion
  //  Bounce off terrain, short fuse ~30 frames, explode on worm hit
  // ═══════════════════════════════════════════════════════════════════════════
  cluster_bomblet: {
    id: 'cluster_bomblet', name: 'Bomblet',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 1.0, projectileSize: 3, projectileColor: 0xff6600,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 999, fuseMs: 430,         // ~30 frames @ 70fps; bounce until fuse
    bouncePercent: 40,
    hitDamage: 1,                                              // Liero clusterbomb_bombs: hitDmg=1
    explosionRadius: 6, splashDamage: 10, splashRadius: 14,   // medium_explosion: carve 6, detect 14
    ammoPerMag: 1, totalAmmo: 0, infiniteAmmo: true, delayMs: 0, loadingTimeMs: 0,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero: speed=95, dist=8000, grav=1000, bounce=40, hitDmg=12
  //  delay=0, loadingTime=220, ammo=1
  //  timeToExplo=15000 (+V=600), detectDistance=2, blowAway=60
  //  splinterAmount=5, particle__small_damage, createOnExp=large_explosion
  // ═══════════════════════════════════════════════════════════════════════════
  mine: {
    id: 'mine', name: 'Mine',
    fireMode: 'single',
    projectileSpeed: 130, projectileGravity: 1.0, projectileSize: 4, projectileColor: 0x88bb22,
    pellets: 1, spread: 0, distribution: 56,            // Liero 8000
    behavior: 'mine', maxBounces: 0, fuseMs: 214000,    // 15000 frames ≈ 214s (essentially permanent)
    mineProximity: 22,
    proximityDelayMs: 857,                                // 60 frames — shooter safe initially
    hitDamage: 12,                                             // Liero: hitDmg=12 (in-flight worm hit)
    chiquitaFragments: 8,                               // 8 splinters (particle__small_damage)
    explosionRadius: 8, splashDamage: 20, splashRadius: 20,   // large_explosion
    ammoPerMag: 1, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 0, loadingTimeMs: 3143,                    // Liero: delay=0, loadingTime=220
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Sticky Mine: fires fast, sticks to terrain, detaches when terrain destroyed
  //  Proximity trigger (25px), activation delay 60 frames, damages all worms
  // ═══════════════════════════════════════════════════════════════════════════
  sticky_mine: {
    id: 'sticky_mine', name: 'Sticky Mine',
    fireMode: 'single',
    projectileSpeed: 400, projectileGravity: 0, projectileSize: 3, projectileColor: 0xff4400,
    pellets: 1, spread: 0, distribution: 0,
    behavior: 'mine', maxBounces: 0, fuseMs: 214000,     // effectively permanent
    sticky: true,
    mineProximity: 25,
    proximityDelayMs: 857,                                // 60 frames — shooter safe initially
    ownerGraceMs: 857,                                    // full self-damage after activation
    chiquitaFragments: 8,
    explosionRadius: 12, splashDamage: 60, splashRadius: 25,  // flat 60 HP within 25px
    ammoPerMag: 3, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 0, loadingTimeMs: 4000,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Sticky mine fragment: heavy shrapnel, hitDamage=8, damages all worms
  // ═══════════════════════════════════════════════════════════════════════════
  sticky_mine_fragment: {
    id: 'sticky_mine_fragment', name: 'Mine Shrapnel',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0.7, projectileSize: 2, projectileColor: 0xff4400,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    hitDamage: 8,
    explosionRadius: 4, splashDamage: 5, splashRadius: 8,
    ammoPerMag: 1, totalAmmo: 0, infiniteAmmo: true, delayMs: 0, loadingTimeMs: 0,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero: speed=170, dist=7000, grav=1300, bounce=40, hitDmg=0
  //  delay=0, loadingTime=600, ammo=1
  //  timeToExplo=150 (+V=15), splinterAmount=22, chiquitabomb_bombs
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
    explosionRadius: 8, splashDamage: 15, splashRadius: 20,   // large_explosion
    recoilForce: 40,
    ammoPerMag: 1, totalAmmo: 10000, infiniteAmmo: false,
    delayMs: 0, loadingTimeMs: 8571,                    // Liero: delay=0, loadingTime=600
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero particle__small_damage (used by bazooka/larpa/mine fragments):
  //  speed=160, speedV=140, dist=2000, grav=700, hitDmg=2, bounce=0
  //  createOnExp=small_explosion
  //  Heavy gravity, slow speed — fragments fall into crater and explode there.
  // ═══════════════════════════════════════════════════════════════════════════
  bazooka_fragment: {
    id: 'bazooka_fragment', name: 'Shrapnel',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0.7, projectileSize: 2, projectileColor: 0xff8833,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    hitDamage: 4,                                              // tuned from Liero hitDmg=2
    explosionRadius: 4, splashDamage: 5, splashRadius: 8,   // small_explosion
    ammoPerMag: 1, totalAmmo: 0, infiniteAmmo: true, delayMs: 0, loadingTimeMs: 0,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Liero particle__larger_damage (used by grenade fragments):
  //  speed=220, speedV=180, dist=2000, grav=700, hitDmg=4
  //  createOnExp=small_explosion — chain damage!
  // ═══════════════════════════════════════════════════════════════════════════
  chiquita_fragment: {
    id: 'chiquita_fragment', name: 'Fragment',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0.15, projectileSize: 2, projectileColor: 0xffdd00,
    pellets: 1, spread: 0,
    behavior: 'normal', maxBounces: 0, fuseMs: null,
    hitDamage: 4,                                              // Liero particle__larger_damage: hitDmg=4
    explosionRadius: 4, splashDamage: 5, splashRadius: 8,   // small_explosion: carve 4, detect 8
    ammoPerMag: 1, totalAmmo: 0, infiniteAmmo: true, delayMs: 0, loadingTimeMs: 0,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Chiquita bomblet: like cluster bomblet but stronger
  //  Original: chiquitabomb_bombs — hitDmg=4, createOnExp=large_explosion
  //  Bounce off terrain, short fuse ~30 frames, explode on worm hit
  // ═══════════════════════════════════════════════════════════════════════════
  chiquita_bomblet: {
    id: 'chiquita_bomblet', name: 'Banana Fragment',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 1.0, projectileSize: 3, projectileColor: 0xffcc00,
    pellets: 1, spread: 0,
    behavior: 'bounce', maxBounces: 999, fuseMs: 430,         // ~30 frames @ 70fps; bounce until fuse
    bouncePercent: 40,
    hitDamage: 4,                                              // Liero chiquitabomb_bombs: hitDmg=4
    explosionRadius: 8, splashDamage: 15, splashRadius: 20,   // large_explosion: carve 8, detect 20
    ammoPerMag: 1, totalAmmo: 0, infiniteAmmo: true, delayMs: 0, loadingTimeMs: 0,
  },

  rope: {
    id: 'rope', name: 'Ninja Rope',
    fireMode: 'single',
    projectileSpeed: 0, projectileGravity: 0, projectileSize: 0, projectileColor: 0xffffff,
    pellets: 1, spread: 0,
    behavior: 'rope', maxBounces: 0, fuseMs: null,
    explosionRadius: 0, splashDamage: 0, splashRadius: 0,
    ammoPerMag: 1, totalAmmo: 0, infiniteAmmo: true, delayMs: 0, loadingTimeMs: 400,
  },

};

/**
 * Default loadout given to each player.
 * Ninja rope is NOT included — always available via CHANGE+JUMP.
 * Internal weapons (cluster_bomblet, chiquita_fragment) are NOT included.
 */
export const DEFAULT_LOADOUT: WeaponDef[] = [
  WeaponRegistry.shotgun,
  WeaponRegistry.bazooka,
  WeaponRegistry.minigun,
  WeaponRegistry.grenade,
  WeaponRegistry.proximity_grenade,
  WeaponRegistry.larpa,
  WeaponRegistry.zimm,
  WeaponRegistry.cluster_bomb,
  WeaponRegistry.mine,
  WeaponRegistry.sticky_mine,
  WeaponRegistry.chiquita,
];
