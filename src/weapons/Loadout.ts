import { WeaponDef } from './WeaponDef';

interface Slot {
  def:  WeaponDef;
  ammo: number;
}

/**
 * Holds a worm's weapon slots, tracks active weapon, ammo, and reload timer.
 * Designed for 5 slots (Liero standard) but works with any count.
 */
export class Loadout {
  private slots: Slot[];
  activeIndex: number = 0;
  private reloadTimer: number = 0; // ms remaining

  constructor(weapons: WeaponDef[]) {
    this.slots = weapons.map(def => ({ def, ammo: def.ammoMax }));
  }

  get activeWeapon(): WeaponDef { return this.slots[this.activeIndex].def; }
  get activeAmmo():   number    { return this.slots[this.activeIndex].ammo; }
  get isReloading():  boolean   { return this.reloadTimer > 0; }

  canFire(): boolean {
    return this.reloadTimer <= 0 && (this.activeWeapon.infiniteAmmo || this.activeAmmo > 0);
  }

  consumeAmmo(): void {
    if (!this.activeWeapon.infiniteAmmo) {
      this.slots[this.activeIndex].ammo = Math.max(0, this.activeAmmo - 1);
    }
    this.reloadTimer = this.activeWeapon.reloadMs;
  }

  update(dt: number): void {
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt * 1000);
    }
  }

  nextWeapon(): void {
    this.activeIndex = (this.activeIndex + 1) % this.slots.length;
  }

  prevWeapon(): void {
    this.activeIndex = (this.activeIndex - 1 + this.slots.length) % this.slots.length;
  }

  /** Replaces the active weapon slot with a new weapon (full ammo). Used by crate pickups. */
  replaceActiveWeapon(def: WeaponDef): void {
    this.slots[this.activeIndex] = { def, ammo: def.ammoMax };
    this.reloadTimer = 0;
  }
}
