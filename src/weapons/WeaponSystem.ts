import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { Loadout } from './Loadout';

/**
 * Converts a fire-button press into a Projectile.
 * Tracks previous fire state per worm to implement rising-edge detection
 * (single-shot weapons fire once per press, not once per frame held).
 */
export class WeaponSystem {
  private prevFire = new Map<Worm, boolean>();

  /**
   * Call every frame. Returns a new Projectile if the weapon fired,
   * or null if the shot was not taken (reloading, no ammo, button held).
   */
  tryFire(
    worm:      Worm,
    loadout:   Loadout,
    fireInput: boolean,
  ): Projectile | null {
    const wasDown = this.prevFire.get(worm) ?? false;
    this.prevFire.set(worm, fireInput);

    // Rising edge: button just pressed
    if (!fireInput || wasDown) return null;
    if (worm.isDead)           return null;
    if (!loadout.canFire())    return null;

    loadout.consumeAmmo();

    const weapon = loadout.activeWeapon;

    // Fire direction: horizontal component flips with facing
    const aimX = worm.facingRight
      ?  Math.cos(worm.aimAngle)
      : -Math.cos(worm.aimAngle);
    const aimY = Math.sin(worm.aimAngle);

    const vx = aimX * weapon.projectileSpeed;
    const vy = aimY * weapon.projectileSpeed;

    // Spawn slightly in front of the worm so it doesn't immediately hit its own terrain
    const spawnX = worm.x + aimX * (worm.width  / 2 + 3);
    const spawnY = worm.y + aimY * (worm.height / 2 + 3);

    return new Projectile(spawnX, spawnY, vx, vy, worm.playerId, weapon);
  }
}
