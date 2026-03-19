import { Worm } from '../entities/Worm';
import { TerrainMap } from '../terrain/TerrainMap';
import { ExplosionSystem } from './ExplosionSystem';
import { Loadout } from '../weapons/Loadout';
import { WeaponRegistry } from '../weapons/WeaponRegistry';
import { WORM_MAX_HP } from '../game/constants';

export type CrateKind = 'weapon' | 'health' | 'booby';

const CRATE_HALF       = 7;
const MAX_CRATES       = 5;
const SPAWN_INTERVAL   = 18;  // seconds between spawn attempts
const CRATE_WEAPONS    = ['bazooka', 'minigun', 'grenade', 'shotgun'] as const;

// Booby-trap explosion parameters
const BOOBY_EXP_RADIUS  = 28;
const BOOBY_SPLASH_DMG  = 45;
const BOOBY_SPLASH_RAD  = 58;

/** Pure data — no Phaser objects. */
export interface CrateData {
  id:          number;
  x:           number;
  y:           number;
  kind:        CrateKind;
  weaponId?:   string;
  healAmount?: number;
  active:      boolean;
}

export type CrateEvent =
  | { type: 'spawn'; crate: CrateData }
  | { type: 'collect'; crateId: number; kind: CrateKind; worm: Worm };

export { CRATE_HALF };

/**
 * Manages bonus crates that drop onto the terrain during a match.
 * Pure game logic — no Phaser dependency. Visual sync handled by GameScene.
 */
export class CrateSystem {
  private crates: CrateData[] = [];
  private spawnTimer = SPAWN_INTERVAL * 0.4; // first crate appears sooner
  private nextId = 0;
  private pendingEvents: CrateEvent[] = [];

  constructor(
    private terrain:         TerrainMap,
    private explosionSystem: ExplosionSystem,
    private worms:           Worm[],
    private loadouts:        Map<Worm, Loadout>,
  ) {}

  getCrates(): readonly CrateData[] { return this.crates; }

  update(dt: number): CrateEvent[] {
    this.pendingEvents = [];

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

    return this.pendingEvents;
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

    const crate: CrateData = {
      id: this.nextId++,
      x: pos.x, y: pos.y,
      kind, weaponId, healAmount,
      active: true,
    };
    this.crates.push(crate);
    this.pendingEvents.push({ type: 'spawn', crate });
  }

  private collect(crate: CrateData, worm: Worm): void {
    crate.active = false;

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
        break;
      }
    }

    this.pendingEvents.push({ type: 'collect', crateId: crate.id, kind: crate.kind, worm });
  }

  private findSurface(): { x: number; y: number } | null {
    const W = this.terrain.width;
    const H = this.terrain.height;

    for (let attempt = 0; attempt < 30; attempt++) {
      const x = Math.floor(15 + Math.random() * (W - 30));
      for (let y = 15; y < H - 15; y++) {
        if (!this.terrain.isSolid(x, y) && this.terrain.isSolid(x, y + CRATE_HALF + 1)) {
          if (!this.terrain.isSolid(x, y - CRATE_HALF)) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  destroyAll(): void {
    this.crates = [];
  }
}
