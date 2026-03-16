import { WeaponDef } from '../weapons/WeaponDef';

/**
 * Represents one in-flight projectile.
 * Physics are updated by PhysicsSystem; explosion is handled by ExplosionSystem.
 */
export class Projectile {
  x:  number;
  y:  number;
  vx: number;
  vy: number;
  active: boolean = true;

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
  }
}
