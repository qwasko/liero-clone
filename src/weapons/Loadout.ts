import { WeaponDef } from './WeaponDef';
import { LOADING_TIMES_MULTIPLIER } from '../game/constants';

interface Slot {
  def:          WeaponDef;
  magAmmo:      number;  // current magazine ammo
  totalAmmo:    number;  // reserve ammo pool
  delayTimer:   number;  // ms remaining between shots
  reloadTimer:  number;  // ms remaining for magazine reload
}

/**
 * Holds a worm's weapon slots with magazine-based ammo.
 *
 * Each slot has its own independent delay and reload timer.
 * Switching weapons never blocks firing — each slot remembers its own state.
 *
 * Flow: fire → consume 1 magAmmo → delayTimer starts →
 *       when magAmmo reaches 0 → auto-reload (reloadTimer = loadingTimeMs) →
 *       when reload completes → refill magazine from totalAmmo.
 */
export class Loadout {
  private slots: Slot[];
  activeIndex: number = 0;

  constructor(weapons: WeaponDef[]) {
    this.slots = weapons.map(def => ({
      def,
      magAmmo: def.ammoPerMag,
      totalAmmo: def.totalAmmo,
      delayTimer: 0,
      reloadTimer: 0,
    }));
  }

  get activeWeapon(): WeaponDef { return this.slots[this.activeIndex].def; }
  get activeAmmo():   number    { return this.slots[this.activeIndex].magAmmo; }
  get isReloading():  boolean   { return this.slots[this.activeIndex].reloadTimer > 0; }

  /** Reload progress 0→1 (0 = just started, 1 = done). Returns 0 if not reloading. */
  get reloadProgress(): number {
    const slot = this.slots[this.activeIndex];
    if (slot.reloadTimer <= 0 || slot.def.loadingTimeMs <= 0) return 0;
    const total = slot.def.loadingTimeMs * LOADING_TIMES_MULTIPLIER;
    return 1 - slot.reloadTimer / total;
  }

  canFire(): boolean {
    const slot = this.slots[this.activeIndex];
    if (slot.delayTimer > 0 || slot.reloadTimer > 0) return false;
    return slot.def.infiniteAmmo || slot.magAmmo > 0;
  }

  /** Check if weapon at a specific index has ammo and isn't mid-reload. */
  canFireAt(index: number): boolean {
    const slot = this.slots[index];
    if (!slot) return false;
    if (slot.reloadTimer > 0) return false;
    return slot.def.infiniteAmmo || slot.magAmmo > 0;
  }

  get weaponCount(): number { return this.slots.length; }

  consumeAmmo(): void {
    const slot = this.slots[this.activeIndex];
    if (!slot.def.infiniteAmmo) {
      slot.magAmmo = Math.max(0, slot.magAmmo - 1);
    }
    // Set between-shot delay
    slot.delayTimer = slot.def.delayMs;
    // Auto-reload when magazine is empty
    if (slot.magAmmo <= 0 && !slot.def.infiniteAmmo) {
      this.startReload(slot);
    }
  }

  update(dt: number): void {
    const ms = dt * 1000;
    for (const slot of this.slots) {
      if (slot.delayTimer > 0) {
        slot.delayTimer = Math.max(0, slot.delayTimer - ms);
      }
      if (slot.reloadTimer > 0) {
        slot.reloadTimer = Math.max(0, slot.reloadTimer - ms);
        if (slot.reloadTimer <= 0) {
          this.finishReload(slot);
        }
      }
    }
  }

  nextWeapon(): void { this.activeIndex = (this.activeIndex + 1) % this.slots.length; }
  prevWeapon(): void { this.activeIndex = (this.activeIndex - 1 + this.slots.length) % this.slots.length; }

  replaceActiveWeapon(def: WeaponDef): void {
    this.slots[this.activeIndex] = {
      def,
      magAmmo: def.ammoPerMag,
      totalAmmo: def.totalAmmo,
      delayTimer: 0,
      reloadTimer: 0,
    };
  }

  private startReload(slot: Slot): void {
    if (slot.totalAmmo <= 0 && !slot.def.infiniteAmmo) return; // no reserve left
    slot.reloadTimer = slot.def.loadingTimeMs * LOADING_TIMES_MULTIPLIER;
  }

  private finishReload(slot: Slot): void {
    if (slot.def.infiniteAmmo) {
      slot.magAmmo = slot.def.ammoPerMag;
      return;
    }
    const needed = slot.def.ammoPerMag;
    const fill = Math.min(needed, slot.totalAmmo);
    slot.magAmmo = fill;
    slot.totalAmmo -= fill;
  }
}
