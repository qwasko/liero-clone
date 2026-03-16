import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { TerrainMap } from '../terrain/TerrainMap';
import { ExplosionSystem } from './ExplosionSystem';
import { Loadout } from '../weapons/Loadout';
import { WeaponRegistry } from '../weapons/WeaponRegistry';
import { WORM_MAX_HP } from '../game/constants';

type CrateKind = 'weapon' | 'health' | 'booby';

const CRATE_HALF       = 7;
const MAX_CRATES       = 5;
const SPAWN_INTERVAL   = 18;  // seconds between spawn attempts
const CRATE_WEAPONS    = ['bazooka', 'minigun', 'grenade', 'shotgun'] as const;

// Booby-trap explosion parameters
const BOOBY_EXP_RADIUS  = 28;
const BOOBY_SPLASH_DMG  = 45;
const BOOBY_SPLASH_RAD  = 58;

interface Crate {
  x: number;
  y: number;
  kind: CrateKind;
  weaponId?: string;
  healAmount?: number;
  body: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Text;
  active: boolean;
}

/**
 * Manages bonus crates that drop onto the terrain during a match.
 *
 * Crate kinds (player cannot tell them apart visually):
 *   weapon  — replaces the worm's current active weapon slot (full ammo)
 *   health  — restores 10–50 HP
 *   booby   — explodes when picked up
 */
export class CrateSystem {
  private crates: Crate[] = [];
  private spawnTimer = SPAWN_INTERVAL * 0.4; // first crate appears sooner

  constructor(
    private scene:           Phaser.Scene,
    private terrain:         TerrainMap,
    private explosionSystem: ExplosionSystem,
    private worms:           Worm[],
    private loadouts:        Map<Worm, Loadout>,
    private onPickup:        (kind: CrateKind, worm: Worm) => void,
  ) {}

  update(dt: number): void {
    // ── Spawn ─────────────────────────────────────────────────────────
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      const active = this.crates.filter(c => c.active).length;
      if (active < MAX_CRATES) this.trySpawn();
    }

    // ── Pickup detection ──────────────────────────────────────────────
    for (const crate of this.crates) {
      if (!crate.active) continue;
      for (const worm of this.worms) {
        if (worm.isDead) continue;
        if (
          Math.abs(worm.x - crate.x) < worm.width  / 2 + CRATE_HALF &&
          Math.abs(worm.y - crate.y) < worm.height / 2 + CRATE_HALF
        ) {
          this.collect(crate, worm);
          break;
        }
      }
    }
  }

  private trySpawn(): void {
    const pos = this.findSurface();
    if (!pos) return;

    const roll = Math.random();
    let kind: CrateKind;
    let weaponId: string | undefined;
    let healAmount: number | undefined;

    if (roll < 0.50) {
      kind     = 'weapon';
      weaponId = CRATE_WEAPONS[Math.floor(Math.random() * CRATE_WEAPONS.length)];
    } else if (roll < 0.80) {
      kind       = 'health';
      healAmount = 10 + Math.floor(Math.random() * 41); // 10–50
    } else {
      kind = 'booby';
    }

    // Visual: yellow box + "?" label — identical for all kinds
    const body = this.scene.add
      .rectangle(pos.x, pos.y, CRATE_HALF * 2, CRATE_HALF * 2, 0xddaa00)
      .setDepth(6);
    const icon = this.scene.add
      .text(pos.x, pos.y, '?', { fontSize: '10px', color: '#000000', fontFamily: 'monospace' })
      .setOrigin(0.5)
      .setDepth(7);

    this.crates.push({ x: pos.x, y: pos.y, kind, weaponId, healAmount, body, icon, active: true });
  }

  private collect(crate: Crate, worm: Worm): void {
    crate.active = false;
    crate.body.destroy();
    crate.icon.destroy();

    switch (crate.kind) {
      case 'weapon': {
        const def = WeaponRegistry[crate.weaponId!];
        this.loadouts.get(worm)!.replaceActiveWeapon(def);
        break;
      }
      case 'health': {
        worm.hp = Math.min(WORM_MAX_HP, worm.hp + crate.healAmount!);
        break;
      }
      case 'booby': {
        this.explosionSystem.detonate(crate.x, crate.y, BOOBY_EXP_RADIUS, BOOBY_SPLASH_DMG, BOOBY_SPLASH_RAD);
        this.scene.cameras.main.shake(200, 0.009);
        break;
      }
    }

    this.onPickup(crate.kind, worm);
  }

  private findSurface(): { x: number; y: number } | null {
    const W = this.terrain.width;
    const H = this.terrain.height;

    for (let attempt = 0; attempt < 30; attempt++) {
      const x = Math.floor(15 + Math.random() * (W - 30));
      for (let y = 15; y < H - 15; y++) {
        if (!this.terrain.isSolid(x, y) && this.terrain.isSolid(x, y + CRATE_HALF + 1)) {
          // Make sure there's vertical room above (crate won't be buried)
          if (!this.terrain.isSolid(x, y - CRATE_HALF)) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  destroyAll(): void {
    for (const crate of this.crates) {
      if (crate.active) { crate.body.destroy(); crate.icon.destroy(); }
    }
    this.crates = [];
  }
}
