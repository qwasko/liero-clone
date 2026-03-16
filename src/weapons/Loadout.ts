import { WeaponDef } from './WeaponDef';

interface Slot {
  def:         WeaponDef;
  ammo:        number;
  reloadTimer: number; // ms remaining for THIS slot — independent of other slots
}

/**
 * Holds a worm's weapon slots, each with its own independent reload timer.
 *
 * Load+Change: switching weapons never blocks firing the new weapon —
 * each slot remembers its own reload state so you can freely swap mid-reload.
 */
export class Loadout {
  private slots: Slot[];
  activeIndex: number = 0;

  constructor(weapons: WeaponDef[]) {
    this.slots = weapons.map(def => ({ def, ammo: def.ammoMax, reloadTimer: 0 }));
  }

  get activeWeapon(): WeaponDef { return this.slots[this.activeIndex].def; }
  get activeAmmo():   number    { return this.slots[this.activeIndex].ammo; }
  get isReloading():  boolean   { return this.slots[this.activeIndex].reloadTimer > 0; }

  canFire(): boolean {
    const slot = this.slots[this.activeIndex];
    return slot.reloadTimer <= 0 && (slot.def.infiniteAmmo || slot.ammo > 0);
  }

  consumeAmmo(): void {
    const slot = this.slots[this.activeIndex];
    if (!slot.def.infiniteAmmo) slot.ammo = Math.max(0, slot.ammo - 1);
    slot.reloadTimer = slot.def.reloadMs;
  }

  update(dt: number): void {
    const ms = dt * 1000;
    for (const slot of this.slots) {
      if (slot.reloadTimer > 0) slot.reloadTimer = Math.max(0, slot.reloadTimer - ms);
    }
  }

  nextWeapon(): void { this.activeIndex = (this.activeIndex + 1) % this.slots.length; }
  prevWeapon(): void { this.activeIndex = (this.activeIndex - 1 + this.slots.length) % this.slots.length; }

  replaceActiveWeapon(def: WeaponDef): void {
    this.slots[this.activeIndex] = { def, ammo: def.ammoMax, reloadTimer: 0 };
  }
}
