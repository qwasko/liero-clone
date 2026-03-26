import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { WormController } from '../entities/WormController';
import { InputState } from '../input/InputState';
import { PhysicsSystem } from '../physics/PhysicsSystem';
import { TerrainMap } from '../terrain/TerrainMap';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';
import { Loadout } from '../weapons/Loadout';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { WeaponRegistry, DEFAULT_LOADOUT } from '../weapons/WeaponRegistry';
import { ExplosionSystem } from './ExplosionSystem';
import { RopeSystem } from './RopeSystem';
import { DiggingSystem } from './DiggingSystem';
import { CrateSystem } from './CrateSystem';

import { TagSystem } from './TagSystem';
import { GameEvent } from './GameEvents';
import { LevelPreset } from './LevelPreset';
import {
  MATCH_DURATION_SECONDS,
  DEFAULT_LIVES,
  RESPAWN_DELAY_MS,
  WORM_MAX_HP,
  KNOCKBACK_MINE_FACTOR,
  MAX_WORM_VX,
  MAX_WORM_VY,
} from './constants';
import { computeKnockback, getKnockbackForce } from '../utils/Knockback';
import { SeededRNG } from '../utils/SeededRNG';

export interface GameStateOptions {
  lives?: number;
  reloadMultiplier?: number;
  matchDurationSeconds?: number;
  p1Hp?: number;
  p2Hp?: number;
  seed?: number;
}

/**
 * Pure game logic — owns all systems, has no Phaser dependency.
 * GameScene creates one GameState and calls update() each frame.
 */
export class GameState {
  // ── Entities ─────────────────────────────────────────────────────────
  readonly worms: [Worm, Worm];
  readonly loadouts: Map<Worm, Loadout> = new Map();
  activeProjectiles: Projectile[] = [];

  // ── Systems ──────────────────────────────────────────────────────────
  readonly physicsSystem:   PhysicsSystem;
  readonly weaponSystem:    WeaponSystem;
  readonly explosionSystem: ExplosionSystem;
  readonly ropeSystem:      RopeSystem;
  readonly diggingSystem:   DiggingSystem;
  readonly crateSystem:     CrateSystem;
  readonly tagSystem:       TagSystem | null;

  // ── Terrain ──────────────────────────────────────────────────────────
  readonly terrain:          TerrainMap;
  readonly terrainDestroyer: TerrainDestroyer;

  // ── Match state ──────────────────────────────────────────────────────
  timeRemaining: number;
  matchOver: boolean = false;
  readonly gameMode: 'normal' | 'tag';
  readonly spawnPoints: [{ x: number; y: number }, { x: number; y: number }];

  // ── Internal ─────────────────────────────────────────────────────────
  readonly rng: SeededRNG;
  private controllers: [WormController, WormController];
  private lives: Map<Worm, number> = new Map();
  private respawnTimers: Map<Worm, number | null> = new Map();
  private readonly reloadMultiplier: number;
  readonly maxHp: Map<Worm, number> = new Map();

  // Weapon cycling state per player
  private cycleState: [
    { dir: -1 | 0 | 1; holdMs: number; repeatMs: number },
    { dir: -1 | 0 | 1; holdMs: number; repeatMs: number },
  ] = [
    { dir: 0, holdMs: 0, repeatMs: 0 },
    { dir: 0, holdMs: 0, repeatMs: 0 },
  ];

  constructor(terrain: TerrainMap, level: LevelPreset, mode: 'normal' | 'tag', options?: GameStateOptions) {
    this.terrain = terrain;
    this.gameMode = mode;
    const lives = options?.lives ?? DEFAULT_LIVES;
    this.reloadMultiplier = options?.reloadMultiplier ?? 1.0;
    this.timeRemaining = options?.matchDurationSeconds ?? MATCH_DURATION_SECONDS;
    this.rng = new SeededRNG(options?.seed ?? (Math.random() * 0xffffffff) >>> 0);

    // ── Spawn points ───────────────────────────────────────────────────
    this.spawnPoints = [
      { x: level.width * 0.25, y: level.height * 0.44 },
      { x: level.width * 0.75, y: level.height * 0.44 },
    ];

    // ── Worms ──────────────────────────────────────────────────────────
    const worm1 = new Worm(this.spawnPoints[0].x, this.spawnPoints[0].y, 1);
    const worm2 = new Worm(this.spawnPoints[1].x, this.spawnPoints[1].y, 2);
    this.worms = [worm1, worm2];

    const p1Hp = options?.p1Hp ?? WORM_MAX_HP;
    const p2Hp = options?.p2Hp ?? WORM_MAX_HP;
    this.maxHp.set(worm1, p1Hp);
    this.maxHp.set(worm2, p2Hp);
    worm1.hp = p1Hp;
    worm2.hp = p2Hp;

    // ── Loadouts ───────────────────────────────────────────────────────
    this.loadouts.set(worm1, new Loadout([...DEFAULT_LOADOUT], this.reloadMultiplier));
    this.loadouts.set(worm2, new Loadout([...DEFAULT_LOADOUT], this.reloadMultiplier));

    // ── Systems ────────────────────────────────────────────────────────
    this.terrainDestroyer = new TerrainDestroyer(terrain);
    this.physicsSystem    = new PhysicsSystem(this.rng);
    this.weaponSystem     = new WeaponSystem(this.rng);
    this.explosionSystem  = new ExplosionSystem(this.terrainDestroyer, this.worms);

    this.ropeSystem = new RopeSystem(this.rng);
    this.ropeSystem.registerWorm(worm1);
    this.ropeSystem.registerWorm(worm2);

    this.diggingSystem = new DiggingSystem(this.terrainDestroyer);
    this.diggingSystem.registerWorm(worm1);
    this.diggingSystem.registerWorm(worm2);

    this.crateSystem = new CrateSystem(
      terrain, this.explosionSystem, this.worms, this.loadouts, this.maxHp, this.rng,
    );

    // ── Tag mode ───────────────────────────────────────────────────────
    this.tagSystem = mode === 'tag' ? new TagSystem(this.worms) : null;

    // ── Controllers ────────────────────────────────────────────────────
    this.controllers = [new WormController(worm1), new WormController(worm2)];

    // ── Lives ──────────────────────────────────────────────────────────
    for (const worm of this.worms) {
      this.lives.set(worm, lives);
      this.respawnTimers.set(worm, null);
    }
  }

  getLives(worm: Worm): number { return this.lives.get(worm) ?? 0; }

  // ════════════════════════════════════════════════════════════════════════
  //  Main update — returns events for audio/visual side-effects
  // ════════════════════════════════════════════════════════════════════════

  update(dt: number, input1: InputState, input2: InputState): GameEvent[] {
    const events: GameEvent[] = [];
    const [worm1, worm2] = this.worms;
    const load1 = this.loadouts.get(worm1)!;
    const load2 = this.loadouts.get(worm2)!;

    this.timeRemaining -= dt;

    // ── Rope input + hook advancement ──────────────────────────────────
    if (this.ropeSystem.handleInput(worm1, input1, dt)) events.push({ type: 'sound_rope' });
    if (this.ropeSystem.handleInput(worm2, input2, dt)) events.push({ type: 'sound_rope' });
    this.ropeSystem.updateHooks(dt, this.terrain, this.worms);
    this.ropeSystem.checkAnchorDestroyed(this.terrain);

    // ── Controllers ────────────────────────────────────────────────────
    this.controllers[0].update(input1, dt, this.ropeSystem.hasRope(worm1) || this.ropeSystem.isRopeTarget(worm1));
    this.controllers[1].update(input2, dt, this.ropeSystem.hasRope(worm2) || this.ropeSystem.isRopeTarget(worm2));

    if (this.controllers[0].justJumped) events.push({ type: 'sound_jump' });
    if (this.controllers[1].justJumped) events.push({ type: 'sound_jump' });

    // ── Weapon cycling — CHANGE + LEFT/RIGHT ───────────────────────────
    this.updateWeaponCycling(input1, input2, load1, load2, dt);

    // ── Loadout timers ─────────────────────────────────────────────────
    load1.update(dt);
    load2.update(dt);

    // ── Tag timer ──────────────────────────────────────────────────────
    this.tagSystem?.update(dt);

    // ── Digging ────────────────────────────────────────────────────────
    this.diggingSystem.update(worm1, input1);
    this.diggingSystem.update(worm2, input2);

    // ── Crates ─────────────────────────────────────────────────────────
    const crateEvents = this.crateSystem.update(dt);
    for (const ce of crateEvents) {
      if (ce.type === 'spawn') {
        events.push({ type: 'crate_spawn', crate: ce.crate });
      } else if (ce.type === 'collect') {
        events.push({ type: 'crate_collect', crateId: ce.crateId, kind: ce.kind });
        if (ce.kind === 'booby') {
          events.push({ type: 'sound_explosion', big: false });
          events.push({ type: 'camera_shake', duration: 200, intensity: 0.009 });
        } else {
          events.push({ type: 'sound_pickup' });
        }
      }
    }

    // ── Weapon fire — disabled while CHANGE is held ────────────────────
    const fireInputs: [boolean, boolean] = [
      input1.fire && !input1.change,
      input2.fire && !input2.change,
    ];
    this.worms.forEach((worm, i) => {
      const loadout = this.loadouts.get(worm)!;
      const projs   = this.weaponSystem.tryFire(worm, loadout, fireInputs[i]);
      for (const p of projs) {
        this.activeProjectiles.push(p);
        events.push({ type: 'muzzle_flash', x: p.x, y: p.y });
        events.push({ type: 'sound_fire', weaponId: p.weapon.id });
      }
      // ── Recoil: push shooter opposite to aim direction ───────────
      if (projs.length > 0) {
        const recoil = projs[0].weapon.recoilForce ?? 0;
        if (recoil > 0) {
          const baseAngle = worm.facingRight ? worm.aimAngle : Math.PI - worm.aimAngle;
          worm.vx -= Math.cos(baseAngle) * recoil;
          worm.vy -= Math.sin(baseAngle) * recoil;
          if (Math.abs(worm.vx) > MAX_WORM_VX) worm.vx = Math.sign(worm.vx) * MAX_WORM_VX;
          if (Math.abs(worm.vy) > MAX_WORM_VY) worm.vy = Math.sign(worm.vy) * MAX_WORM_VY;
        }
      }
    });

    // ── Physics ────────────────────────────────────────────────────────
    this.physicsSystem.update(this.worms, dt, this.terrain);

    // Rope constraints applied after normal physics
    this.ropeSystem.applyConstraint(worm1, dt);
    this.ropeSystem.applyConstraint(worm2, dt);
    this.ropeSystem.releaseOnDeath(worm1);
    this.ropeSystem.releaseOnDeath(worm2);

    // ── Trail particles — spawn before projectile update so they exist this frame ─
    const trailSpawns: Projectile[] = [];
    for (const proj of this.activeProjectiles) {
      if (!proj.active || !proj.weapon.trailWeaponId || !proj.weapon.trailIntervalMs) continue;
      proj.trailTimer -= dt * 1000;
      if (proj.trailTimer <= 0) {
        proj.trailTimer = proj.weapon.trailIntervalMs;
        const trailDef = WeaponRegistry[proj.weapon.trailWeaponId];
        if (trailDef) {
          const trail = new Projectile(
            proj.x, proj.y,
            proj.vx * 0.2,  // 20% of parent velocity
            proj.vy * 0.2,
            proj.ownerId,
            trailDef,
          );
          // Small jitter so trail particles spread out
          const jitter = 2.5;
          trail.vx += (this.rng.next() * 2 - 1) * jitter;
          trail.vy += (this.rng.next() * 2 - 1) * jitter;
          // Trail inherits parent's owner grace state
          trail.ownerGrace = Math.max(0, proj.ownerGrace);
          trailSpawns.push(trail);
        }
      }
    }
    for (const t of trailSpawns) this.activeProjectiles.push(t);

    this.physicsSystem.updateProjectiles(
      this.activeProjectiles, dt, this.terrain, this.worms,
      (proj, hitX, hitY) => {
        const hasOwnerGrace = proj.weapon.id === 'larpa' || proj.weapon.id === 'larpa_trail'
          || proj.weapon.id === 'sticky_mine' || proj.weapon.id === 'zimm';
        const fullSelfDmg = proj.weapon.id === 'bazooka'
          || (hasOwnerGrace && proj.ownerGrace <= 0);

        this.explosionSystem.detonate(
          hitX, hitY,
          proj.weapon.explosionRadius,
          proj.weapon.splashDamage,
          proj.weapon.splashRadius,
          proj.ownerId,
          fullSelfDmg,
          proj.weapon.id === 'sticky_mine', // flat damage — full 60 HP within radius
        );

        // ── Mine knockback: detach deployed mines and give them velocity ─
        const mineKbForce = getKnockbackForce(proj.weapon.splashDamage) * KNOCKBACK_MINE_FACTOR;
        for (const mine of this.activeProjectiles) {
          if (!mine.active || mine.weapon.behavior !== 'mine' || !mine.deployed) continue;
          if (mine === proj) continue; // skip the exploding projectile itself
          const mineDist = Math.hypot(mine.x - hitX, mine.y - hitY);
          if (mineDist < proj.weapon.splashRadius) {
            const kb = computeKnockback(
              mine.x, mine.y, hitX, hitY, mineKbForce, proj.weapon.splashRadius,
            );
            // 1. Apply knockback impulse
            mine.vx = kb.dvx;
            mine.vy = kb.dvy;
            mine.deployed = false;
            mine.hasDeployed = false;
            // 2. Resolve terrain at current position — push toward blast crater (carved open)
            if (this.terrain.isSolid(Math.round(mine.x), Math.round(mine.y))) {
              const toBlastDist = Math.hypot(hitX - mine.x, hitY - mine.y);
              if (toBlastDist > 1) {
                const nx = (hitX - mine.x) / toBlastDist;
                const ny = (hitY - mine.y) / toBlastDist;
                for (let s = 1; s <= 20; s++) {
                  if (!this.terrain.isSolid(Math.round(mine.x + nx * s), Math.round(mine.y + ny * s))) {
                    mine.x += nx * s;
                    mine.y += ny * s;
                    break;
                  }
                }
              }
            }
            // terrainGrace lets mine escape crater edge; clears once in air
            mine.terrainGrace = 0.15;
            mine.detachCooldown = 50; // tiny window to prevent instant re-attach
          }
        }

        // ── Cluster bomb: spray bomblets ──────────────────────────────
        if (proj.weapon.clusterCount && proj.weapon.clusterWeapon) {
          const bombletDef = WeaponRegistry[proj.weapon.clusterWeapon];
          if (bombletDef) {
            for (let i = 0; i < proj.weapon.clusterCount; i++) {
              const angle = this.rng.next() * Math.PI * 2;
              // Liero: speed=220, speedV=140, dist=10000 → scattered velocity
              const speed = 56 + this.rng.next() * 98;     // (220-140..220) * 0.7
              const dist = 70;                            // Liero 10000 → ~70 px/s
              const bomblet = new Projectile(
                hitX, hitY,
                Math.cos(angle) * speed + (this.rng.next() * 2 - 1) * dist,
                Math.sin(angle) * speed + (this.rng.next() * 2 - 1) * dist,
                proj.ownerId,
                bombletDef,
              );
              bomblet.terrainGrace = 0.15; // 150ms grace to escape crater
              this.activeProjectiles.push(bomblet);
            }
          }
        }

        // ── Fragment spray (chiquitaFragments) ────────────────────────
        if (proj.weapon.chiquitaFragments) {
          // Pick fragment type based on weapon:
          //   chiquita → chiquita_bomblet (strong, bouncy)
          //   sticky_mine → sticky_mine_fragment (heavy, hitDmg=8)
          //   bazooka/larpa/mine/larpa_trail → bazooka_fragment (slow, heavy)
          //   grenade/other → chiquita_fragment (medium speed, light gravity)
          const usesSmallDamage = proj.weapon.id === 'bazooka'
            || proj.weapon.id === 'larpa'
            || proj.weapon.id === 'larpa_trail'
            || proj.weapon.id === 'mine';
          const isChiquita = proj.weapon.id === 'chiquita';
          const isStickyMine = proj.weapon.id === 'sticky_mine';
          const fragId = isChiquita ? 'chiquita_bomblet'
            : isStickyMine ? 'sticky_mine_fragment'
            : usesSmallDamage ? 'bazooka_fragment'
            : 'chiquita_fragment';
          const fragDef = WeaponRegistry[fragId];
          if (fragDef) {
            const total = proj.weapon.chiquitaFragments;
            for (let i = 0; i < total; i++) {
              const angle = this.rng.next() * Math.PI * 2;
              // Liero particle__small_damage: speed=160, speedV=140, dist=2000
              // → ~10-78 px/s base, ~14 px/s jitter (slow, gravity-driven)
              // Liero particle__larger_damage: speed=220, speedV=180, dist=2000
              // → ~28-154 px/s base, ~14 px/s jitter (faster, wider spread)
              const speed = usesSmallDamage
                ? 10 + this.rng.next() * 68    // slow: 10-78 px/s (particle__small_damage)
                : (56 + this.rng.next() * 98) * 2; // fast: 112-308 px/s (particle__larger_damage)
              const dist = 14;               // Liero 2000 → ~14 px/s jitter
              const frag = new Projectile(
                hitX, hitY,
                Math.cos(angle) * speed + (this.rng.next() * 2 - 1) * dist,
                Math.sin(angle) * speed + (this.rng.next() * 2 - 1) * dist,
                proj.ownerId,
                fragDef,
              );
              frag.terrainGrace = 0.15; // 150ms grace to escape crater
              this.activeProjectiles.push(frag);
            }
          }
        }

        // ── Audio/visual events ───────────────────────────────────────
        const big = proj.weapon.explosionRadius >= 20;
        events.push({ type: 'sound_explosion', big });
        events.push({ type: 'screen_flash', alpha: big ? 0.18 : 0.08 });
        events.push({ type: 'impact_ring', x: hitX, y: hitY, radius: proj.weapon.splashRadius });
      },
    );
    this.activeProjectiles = this.activeProjectiles.filter(p => p.active);



    // ── Respawn timers ─────────────────────────────────────────────────
    for (const worm of this.worms) {
      if (!worm.isDead) continue;
      const timer = this.respawnTimers.get(worm);
      if (timer === undefined || timer === null) continue;
      const newTimer = timer - dt * 1000;
      if (newTimer <= 0) {
        this.respawnTimers.set(worm, null);
        this.respawnWorm(worm);
      } else {
        this.respawnTimers.set(worm, newTimer);
      }
    }

    // ── On-death: schedule respawn or eliminate ────────────────────────
    for (const worm of this.worms) {
      if (!worm.isDead) continue;
      if (this.respawnTimers.get(worm) !== null) continue;
      this.tagSystem?.onDeath(worm);
      const remaining = (this.lives.get(worm) ?? 0) - 1;
      this.lives.set(worm, Math.max(0, remaining));
      if (remaining > 0) {
        this.respawnTimers.set(worm, RESPAWN_DELAY_MS);
      } else {
        this.respawnTimers.set(worm, 0); // sentinel: eliminated permanently
      }
    }

    // ── Win condition ──────────────────────────────────────────────────
    this.checkWinCondition(events);

    return events;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Private helpers
  // ════════════════════════════════════════════════════════════════════════

  private updateWeaponCycling(
    input1: InputState, input2: InputState,
    load1: Loadout, load2: Loadout, dt: number,
  ): void {
    const inputs   = [input1, input2];
    const loadouts = [load1, load2];
    for (let p = 0; p < 2; p++) {
      const inp  = inputs[p];
      const load = loadouts[p];
      const cs   = this.cycleState[p];

      if (!inp.change) {
        cs.dir = 0; cs.holdMs = 0; cs.repeatMs = 0;
        continue;
      }

      const wantDir: -1 | 0 | 1 =
        inp.left && !inp.right  ? -1 :
        inp.right && !inp.left  ?  1 : 0;

      if (wantDir === 0) {
        cs.dir = 0; cs.holdMs = 0; cs.repeatMs = 0;
      } else if (wantDir !== cs.dir) {
        cs.dir = wantDir;
        cs.holdMs = 0;
        cs.repeatMs = 350;
        if (wantDir === -1) load.prevWeapon();
        else                load.nextWeapon();
      } else {
        cs.holdMs   += dt * 1000;
        cs.repeatMs -= dt * 1000;
        if (cs.repeatMs <= 0) {
          const interval = Math.max(80, 280 - cs.holdMs * 0.4);
          cs.repeatMs = interval;
          if (wantDir === -1) load.prevWeapon();
          else                load.nextWeapon();
        }
      }
    }
  }

  private checkWinCondition(events: GameEvent[]): void {
    const [worm1, worm2] = this.worms;
    const lives1 = this.lives.get(worm1) ?? 0;
    const lives2 = this.lives.get(worm2) ?? 0;

    const eliminated1 = this.respawnTimers.get(worm1) === 0;
    const eliminated2 = this.respawnTimers.get(worm2) === 0;
    const timedOut    = this.timeRemaining <= 0;

    if (!eliminated1 && !eliminated2 && !timedOut) return;

    this.matchOver = true;

    if (this.tagSystem) {
      let winner: 0 | 1 | 2;
      if (eliminated1 && eliminated2)       winner = 0;
      else if (eliminated1)                 winner = 2;
      else if (eliminated2)                 winner = 1;
      else winner = this.tagSystem.result(worm1, worm2).winner;

      const times = this.tagSystem.result(worm1, worm2).times;
      events.push({ type: 'match_over', winner, mode: 'tag', tagTimes: times });
      return;
    }

    let winner: number;
    if (eliminated1 && eliminated2)         winner = 0;
    else if (eliminated1)                   winner = 2;
    else if (eliminated2)                   winner = 1;
    else if (lives1 > lives2)               winner = 1;
    else if (lives2 > lives1)               winner = 2;
    else if (worm1.hp > worm2.hp)           winner = 1;
    else if (worm2.hp > worm1.hp)           winner = 2;
    else                                    winner = 0;

    events.push({ type: 'match_over', winner, mode: 'normal' });
  }

  private respawnWorm(worm: Worm): void {
    const pos = this.findRespawnPosition(worm);
    worm.x     = pos.x;
    worm.y     = pos.y;
    worm.vx    = 0;
    worm.vy    = 0;
    worm.hp    = this.maxHp.get(worm) ?? WORM_MAX_HP;
    worm.state = 'airborne';
    this.respawnTimers.set(worm, null);
    this.loadouts.set(worm, new Loadout([...DEFAULT_LOADOUT], this.reloadMultiplier));
  }

  private findRespawnPosition(worm: Worm): { x: number; y: number } {
    const W = this.terrain.width;
    const H = this.terrain.height;
    const enemy = this.worms.find(w => w !== worm);
    const MAX_GROUND_DIST = 30; // max air gap below spawn before solid ground

    // Try with full enemy distance (80px), then relaxed (40px), then no check
    const passes: { attempts: number; minDist: number }[] = [
      { attempts: 40, minDist: 80 },
      { attempts: 20, minDist: 40 },
      { attempts: 40, minDist: 0 },
    ];

    for (const pass of passes) {
      for (let attempt = 0; attempt < pass.attempts; attempt++) {
        const x = Math.floor(20 + this.rng.next() * (W - 40));
        for (let y = 20; y < H - 20; y++) {
          if (this.terrain.isSolid(x, y) || this.terrain.isSolid(x, y - worm.height)) continue;

          // Ground check: solid terrain must exist within MAX_GROUND_DIST below feet
          let hasGround = false;
          for (let dy = 1; dy <= MAX_GROUND_DIST; dy++) {
            if (this.terrain.isSolid(x, y + dy)) { hasGround = true; break; }
          }
          if (!hasGround) continue;

          // Enemy distance check (skipped when minDist is 0)
          if (pass.minDist > 0 && enemy && Math.hypot(x - enemy.x, y - enemy.y) < pass.minDist) continue;

          return { x, y };
        }
      }
    }

    // Absolute last resort: use hardcoded spawn point but push upward out of solid terrain
    const fallback = worm.playerId === 1 ? this.spawnPoints[0] : this.spawnPoints[1];
    let fy = fallback.y;
    while (fy > 0 && this.terrain.isSolid(fallback.x, fy)) {
      fy--;
    }
    return { x: fallback.x, y: fy };
  }
}
