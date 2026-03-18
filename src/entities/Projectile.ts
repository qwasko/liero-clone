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
  }
}
