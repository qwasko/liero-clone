import { WeaponDef } from '../weapons/WeaponDef';

export class Projectile {
  x:  number;
  y:  number;
  vx: number;
  vy: number;
  active: boolean = true;

  /** Counts bounces so far; triggers explosion when weapon.maxBounces is reached. */
  bounceCount: number = 0;

  /** Milliseconds until forced explosion. null if the weapon has no fuse. */
  fuseTimer: number | null;

  /** Mine-only: true once the projectile has landed and is waiting to trigger. */
  deployed: boolean = false;
  /** Mine-only: true after first deployment — enables re-attach logic after detach. */
  hasDeployed: boolean = false;

  /** Sticky mine: terrain attachment point. Checked each frame for terrain destruction. */
  attachX: number = 0;
  attachY: number = 0;

  /** Mine-only: ms remaining before the mine arms after deployment (avoids instant self-trigger). */
  armTimer: number = 0;

  /** Mine: cooldown (ms) after detaching before re-attachment is allowed. */
  detachCooldown: number = 0;

  /** Grace period (seconds) during which terrain collisions are ignored. Used by fragments spawning inside craters. */
  terrainGrace: number = 0;

  /** Proximity activation delay (ms). While > 0, proximity trigger is inactive. */
  proximityDelay: number = 0;

  /** Owner grace timer (ms). While > 0, owner is excluded from damage. */
  ownerGrace: number = 0;

  /** Trail spawn timer (ms). Counts down; when ≤ 0 a trail particle is spawned and timer resets. */
  trailTimer: number = 0;

  /** Set by PhysicsSystem just before onHit — reason for detonation. */
  hitReason: 'terrain' | 'worm' | 'timer' | 'oob' = 'terrain';

  readonly ownerId: 1 | 2;
  readonly weapon:  WeaponDef;

  constructor(
    x: number, y: number,
    vx: number, vy: number,
    ownerId: 1 | 2,
    weapon: WeaponDef,
  ) {
    this.x  = x;
    this.y  = y;
    this.vx = vx;
    this.vy = vy;
    this.ownerId = ownerId;
    this.weapon  = weapon;
    this.fuseTimer = weapon.fuseMs !== null ? weapon.fuseMs : null;
    this.proximityDelay = weapon.proximityDelayMs ?? 0;
    this.ownerGrace = weapon.ownerGraceMs ?? 0;
  }
}
