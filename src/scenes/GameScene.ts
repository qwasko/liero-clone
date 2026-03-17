import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { WormController } from '../entities/WormController';
import { InputManager } from '../input/InputManager';
import { PhysicsSystem } from '../physics/PhysicsSystem';
import { TerrainMap } from '../terrain/TerrainMap';
import { TerrainGenerator } from '../terrain/TerrainGenerator';
import { TerrainRenderer } from '../terrain/TerrainRenderer';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';
import { DEFAULT_LOADOUT } from '../weapons/WeaponRegistry';
import { Loadout } from '../weapons/Loadout';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { ExplosionSystem } from '../game/ExplosionSystem';
import { RopeSystem } from '../game/RopeSystem';
import { DiggingSystem } from '../game/DiggingSystem';
import { CrateSystem } from '../game/CrateSystem';
import { AudioManager } from '../utils/AudioManager';
import { HUD } from '../ui/HUD';
import { TagSystem } from '../game/TagSystem';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MATCH_DURATION_SECONDS, DEFAULT_LIVES, RESPAWN_DELAY_MS, WORM_MAX_HP } from '../game/constants';

const WORM_COLORS: Record<1 | 2, number> = { 1: 0x00ff88, 2: 0xff4444 };
const SPAWN_P1 = { x: 200, y: 220 };
const SPAWN_P2 = { x: 600, y: 220 };
const AIM_LINE_LEN = 22;

export class GameScene extends Phaser.Scene {
  private worms!: [Worm, Worm];
  private controllers!: [WormController, WormController];
  private wormGraphics: Map<Worm, Phaser.GameObjects.Rectangle> = new Map();

  private inputManager!: InputManager;
  private physicsSystem!: PhysicsSystem;

  private terrain!: TerrainMap;
  private terrainRenderer!: TerrainRenderer;
  terrainDestroyer!: TerrainDestroyer;

  private loadouts: Map<Worm, Loadout> = new Map();
  private weaponSystem!: WeaponSystem;
  private explosionSystem!: ExplosionSystem;
  private ropeSystem!: RopeSystem;
  private diggingSystem!: DiggingSystem;
  private crateSystem!: CrateSystem;
  private activeProjectiles: Projectile[] = [];

  private audio!: AudioManager;
  private hud!: HUD;
  private overlayGraphics!: Phaser.GameObjects.Graphics;

  private timeRemaining: number = MATCH_DURATION_SECONDS;
  private matchOver: boolean = false;
  private gameMode: 'normal' | 'tag' = 'normal';

  // Lives + respawn
  private lives: Map<Worm, number> = new Map();
  private respawnTimers: Map<Worm, number | null> = new Map(); // ms remaining, null = not scheduled

  // Tag mode
  private tagSystem: TagSystem | null = null;
  private tagItGraphics: Phaser.GameObjects.Text | null = null;

  // Weapon cycling state for CHANGE + LEFT/RIGHT (per player)
  // dir: -1=prev, 1=next, 0=idle; holdMs: accumulated hold time; repeatMs: countdown to next repeat
  private cycleState: [
    { dir: -1 | 0 | 1; holdMs: number; repeatMs: number },
    { dir: -1 | 0 | 1; holdMs: number; repeatMs: number },
  ] = [
    { dir: 0, holdMs: 0, repeatMs: 0 },
    { dir: 0, holdMs: 0, repeatMs: 0 },
  ];

  constructor() {
    super({ key: 'GameScene' });
  }

  create(data?: { mode?: 'normal' | 'tag' }): void {
    // ── Clean up stale state from previous game ──────────────────────────
    if (this.textures.exists('terrain')) {
      this.textures.remove('terrain');
    }
    this.wormGraphics.clear();
    this.loadouts.clear();
    this.cycleState = [
      { dir: 0, holdMs: 0, repeatMs: 0 },
      { dir: 0, holdMs: 0, repeatMs: 0 },
    ];

    this.gameMode = data?.mode ?? 'normal';
    this.matchOver = false;
    this.timeRemaining = MATCH_DURATION_SECONDS;
    this.activeProjectiles = [];
    this.lives.clear();
    this.respawnTimers.clear();
    this.tagSystem = null;
    this.tagItGraphics = null;

    // ── Terrain ────────────────────────────────────────────────────────
    this.terrain = TerrainGenerator.generate(CANVAS_WIDTH, CANVAS_HEIGHT, [SPAWN_P1, SPAWN_P2]);
    this.terrainRenderer = new TerrainRenderer(this, this.terrain);
    this.terrainDestroyer = new TerrainDestroyer(this.terrain, this.terrainRenderer);

    // ── Worms ──────────────────────────────────────────────────────────
    const worm1 = new Worm(SPAWN_P1.x, SPAWN_P1.y, 1);
    const worm2 = new Worm(SPAWN_P2.x, SPAWN_P2.y, 2);
    this.worms = [worm1, worm2];

    for (const worm of this.worms) {
      const rect = this.add.rectangle(worm.x, worm.y, worm.width, worm.height, WORM_COLORS[worm.playerId])
        .setDepth(5);
      this.wormGraphics.set(worm, rect);
    }

    // ── Weapons ────────────────────────────────────────────────────────
    this.loadouts.set(worm1, new Loadout([...DEFAULT_LOADOUT]));
    this.loadouts.set(worm2, new Loadout([...DEFAULT_LOADOUT]));
    this.weaponSystem    = new WeaponSystem();
    this.explosionSystem = new ExplosionSystem(this.terrainDestroyer, this.worms);

    this.ropeSystem = new RopeSystem();
    this.ropeSystem.registerWorm(worm1);
    this.ropeSystem.registerWorm(worm2);

    this.diggingSystem = new DiggingSystem(this.terrainDestroyer);
    this.diggingSystem.registerWorm(worm1);
    this.diggingSystem.registerWorm(worm2);

    this.crateSystem = new CrateSystem(
      this, this.terrain, this.explosionSystem, this.worms, this.loadouts,
      (kind, _worm) => {
        if (kind !== 'booby') this.audio.playPickup();
        else                  this.audio.playExplosion(false);
      },
    );

    // ── Tag mode ───────────────────────────────────────────────────────
    if (this.gameMode === 'tag') {
      this.tagSystem = new TagSystem(this.worms);
      // "IT" indicator that floats above the tagged worm
      this.tagItGraphics = this.add.text(0, 0, '★ IT', {
        fontSize: '11px',
        color: '#ffaa00',
        fontFamily: 'monospace',
      }).setDepth(15).setVisible(false);
    }

    // ── Lives ──────────────────────────────────────────────────────────
    for (const worm of this.worms) {
      this.lives.set(worm, DEFAULT_LIVES);
      this.respawnTimers.set(worm, null);
    }

    // ── Input + controllers ────────────────────────────────────────────
    this.inputManager  = new InputManager(this.input.keyboard!);
    this.controllers   = [new WormController(worm1), new WormController(worm2)];

    // ── Physics + audio ────────────────────────────────────────────────
    this.physicsSystem = new PhysicsSystem();
    this.audio         = new AudioManager();

    // ── Overlay + HUD (last → render on top) ──────────────────────────
    this.overlayGraphics = this.add.graphics().setDepth(10);
    this.hud = new HUD(this, CANVAS_WIDTH);
  }

  update(_time: number, delta: number): void {
    if (this.matchOver) return;

    const dt = delta / 1000;
    this.timeRemaining -= dt;

    const [worm1, worm2] = this.worms;
    const input1 = this.inputManager.getPlayer1();
    const input2 = this.inputManager.getPlayer2();
    const load1  = this.loadouts.get(worm1)!;
    const load2  = this.loadouts.get(worm2)!;

    // ── Rope input + hook advancement ──────────────────────────────────
    // Must run before WormController so isOnRope reflects the current frame.
    if (this.ropeSystem.handleInput(worm1, input1, dt)) this.audio.playRopeShoot();
    if (this.ropeSystem.handleInput(worm2, input2, dt)) this.audio.playRopeShoot();
    this.ropeSystem.updateHooks(dt, this.terrain, this.worms);
    this.ropeSystem.checkAnchorDestroyed(this.terrain);

    // ── Controllers ────────────────────────────────────────────────────
    this.controllers[0].update(input1, dt, this.ropeSystem.hasRope(worm1));
    this.controllers[1].update(input2, dt, this.ropeSystem.hasRope(worm2));

    if (this.controllers[0].justJumped) this.audio.playJump();
    if (this.controllers[1].justJumped) this.audio.playJump();

    // ── Weapon cycling — CHANGE + LEFT/RIGHT with keyboard-repeat acceleration ──
    // Cycling is allowed even while on rope (per spec).
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

      // Determine desired direction (-1 = prev/left, 1 = next/right, 0 = none)
      const wantDir: -1 | 0 | 1 =
        inp.left && !inp.right  ? -1 :
        inp.right && !inp.left  ?  1 : 0;

      if (wantDir === 0) {
        cs.dir = 0; cs.holdMs = 0; cs.repeatMs = 0;
      } else if (wantDir !== cs.dir) {
        // Direction just started — cycle immediately
        cs.dir = wantDir;
        cs.holdMs = 0;
        cs.repeatMs = 350; // initial repeat delay ms
        if (wantDir === -1) load.prevWeapon();
        else                load.nextWeapon();
      } else {
        // Same direction held — accumulate and repeat
        cs.holdMs   += dt * 1000;
        cs.repeatMs -= dt * 1000;
        if (cs.repeatMs <= 0) {
          // Interval shrinks as hold time grows (min 80ms)
          const interval = Math.max(80, 280 - cs.holdMs * 0.4);
          cs.repeatMs = interval;
          if (wantDir === -1) load.prevWeapon();
          else                load.nextWeapon();
        }
      }
    }

    // ── Loadout timers ─────────────────────────────────────────────────
    load1.update(dt);
    load2.update(dt);

    // ── Tag timer ──────────────────────────────────────────────────────
    this.tagSystem?.update(dt);

    // ── Digging ────────────────────────────────────────────────────────
    this.diggingSystem.update(worm1, input1);
    this.diggingSystem.update(worm2, input2);

    // ── Crates ─────────────────────────────────────────────────────────
    this.crateSystem.update(dt);

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
        this.spawnMuzzleFlash(p.x, p.y);
        if (p.weapon.id === 'minigun') this.audio.playMinigunShot();
        else                           this.audio.playFire();
      }
    });

    // ── Physics ────────────────────────────────────────────────────────
    this.physicsSystem.update(this.worms, dt, this.terrain);

    // Rope constraints applied after normal physics
    this.ropeSystem.applyConstraint(worm1);
    this.ropeSystem.applyConstraint(worm2);
    this.ropeSystem.releaseOnDeath(worm1);
    this.ropeSystem.releaseOnDeath(worm2);

    this.physicsSystem.updateProjectiles(
      this.activeProjectiles, dt, this.terrain, this.worms,
      (proj, hitX, hitY) => {
        this.explosionSystem.detonate(
          hitX, hitY,
          proj.weapon.explosionRadius,
          proj.weapon.splashDamage,
          proj.weapon.splashRadius,
        );
        const big = proj.weapon.explosionRadius >= 20;
        this.audio.playExplosion(big);
        if (big) this.cameras.main.shake(180, 0.008);
        else     this.cameras.main.shake(60,  0.003);
      },
    );
    this.activeProjectiles = this.activeProjectiles.filter(p => p.active);

    // ── Respawn timers ────────────────────────────────────────────────
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
    // Only runs once per death (null = alive/unhandled; >0 = countdown; 0 = eliminated)
    for (const worm of this.worms) {
      if (!worm.isDead) continue;
      if (this.respawnTimers.get(worm) !== null) continue; // already handled
      this.tagSystem?.onDeath(worm);
      const remaining = (this.lives.get(worm) ?? 0) - 1;
      this.lives.set(worm, Math.max(0, remaining));
      if (remaining > 0) {
        this.respawnTimers.set(worm, RESPAWN_DELAY_MS); // countdown
      } else {
        this.respawnTimers.set(worm, 0); // sentinel: eliminated permanently
      }
    }

    // ── Sync worm visuals ─────────────────────────────────────────────
    for (const worm of this.worms) {
      const rect = this.wormGraphics.get(worm)!;
      rect.setPosition(worm.x, worm.y);
      rect.setVisible(!worm.isDead);
    }

    // ── Tag "IT" indicator ────────────────────────────────────────────
    if (this.tagSystem && this.tagItGraphics) {
      const itWorm = this.tagSystem.it;
      if (itWorm && !itWorm.isDead) {
        this.tagItGraphics
          .setPosition(itWorm.x - 10, itWorm.y - itWorm.height / 2 - 14)
          .setVisible(true);
      } else {
        this.tagItGraphics.setVisible(false);
      }
    }

    // ── Win condition ─────────────────────────────────────────────────
    this.checkWinCondition();

    // ── HUD + overlay ─────────────────────────────────────────────────
    this.hud.update(
      worm1, load1, this.lives.get(worm1) ?? 0,
      worm2, load2, this.lives.get(worm2) ?? 0,
      this.timeRemaining,
      this.tagSystem,
    );
    this.overlayGraphics.clear();
    this.ropeSystem.draw(this.overlayGraphics);
    this.drawAimLines();
    this.drawProjectiles();
  }

  private spawnMuzzleFlash(x: number, y: number): void {
    const flash = this.add.circle(x, y, 7, 0xffffff, 1).setDepth(12);
    this.tweens.add({
      targets:    flash,
      alpha:      0,
      scaleX:     2.5,
      scaleY:     2.5,
      duration:   90,
      onComplete: () => flash.destroy(),
    });
  }

  private checkWinCondition(): void {
    const [worm1, worm2] = this.worms;
    const lives1 = this.lives.get(worm1) ?? 0;
    const lives2 = this.lives.get(worm2) ?? 0;

    // Sentinel 0 means permanently eliminated (set when last life is spent)
    const eliminated1 = this.respawnTimers.get(worm1) === 0;
    const eliminated2 = this.respawnTimers.get(worm2) === 0;
    const timedOut    = this.timeRemaining <= 0;

    if (!eliminated1 && !eliminated2 && !timedOut) return;

    this.matchOver = true;

    if (this.tagSystem) {
      // Tag mode: winner = player with least time as "it"
      // If a player is eliminated, the other wins outright
      let winner: 0 | 1 | 2;
      if (eliminated1 && eliminated2) {
        winner = 0;
      } else if (eliminated1) {
        winner = 2;
      } else if (eliminated2) {
        winner = 1;
      } else {
        winner = this.tagSystem.result(worm1, worm2).winner;
      }
      const times = this.tagSystem.result(worm1, worm2).times;
      this.time.delayedCall(800, () => {
        this.scene.start('TagOverScene', { winner, times });
      });
      return;
    }

    // Normal mode
    let winner: number;
    if (eliminated1 && eliminated2) {
      winner = 0;
    } else if (eliminated1) {
      winner = 2;
    } else if (eliminated2) {
      winner = 1;
    } else {
      // Time ran out — most lives wins; tie-break on HP
      if      (lives1 > lives2) winner = 1;
      else if (lives2 > lives1) winner = 2;
      else if (worm1.hp > worm2.hp) winner = 1;
      else if (worm2.hp > worm1.hp) winner = 2;
      else winner = 0;
    }

    this.time.delayedCall(800, () => {
      this.scene.start('GameOverScene', { winner });
    });
  }

  private respawnWorm(worm: Worm): void {
    const pos = this.findRespawnPosition(worm);
    worm.x     = pos.x;
    worm.y     = pos.y;
    worm.vx    = 0;
    worm.vy    = 0;
    worm.hp    = WORM_MAX_HP;
    worm.state = 'airborne'; // isDead checks state==='dead'||hp<=0; both reset here
    this.respawnTimers.set(worm, null); // ready to handle next death
    // Restore loadout ammo
    this.loadouts.set(worm, new Loadout([...DEFAULT_LOADOUT]));
  }

  private findRespawnPosition(worm: Worm): { x: number; y: number } {
    const W = this.terrain.width;
    const H = this.terrain.height;
    const enemy = this.worms.find(w => w !== worm);

    for (let attempt = 0; attempt < 40; attempt++) {
      const x = Math.floor(20 + Math.random() * (W - 40));
      for (let y = 20; y < H - 20; y++) {
        if (!this.terrain.isSolid(x, y) && !this.terrain.isSolid(x, y - worm.height)) {
          // Prefer a spot away from the enemy
          if (enemy && Math.hypot(x - enemy.x, y - enemy.y) < 80) continue;
          return { x, y };
        }
      }
    }
    // Fallback to spawn points
    return worm.playerId === 1 ? SPAWN_P1 : SPAWN_P2;
  }

  private drawAimLines(): void {
    const g = this.overlayGraphics;
    for (const worm of this.worms) {
      if (worm.isDead) continue;
      const ax = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
      const ay = Math.sin(worm.aimAngle);
      g.lineStyle(1, worm.playerId === 1 ? 0x00ff88 : 0xff4444, 0.7);
      g.beginPath();
      g.moveTo(worm.x, worm.y);
      g.lineTo(worm.x + ax * AIM_LINE_LEN, worm.y + ay * AIM_LINE_LEN);
      g.strokePath();
    }
  }

  private drawProjectiles(): void {
    const g = this.overlayGraphics;
    for (const proj of this.activeProjectiles) {
      // Grenades pulse slightly while alive — tint based on fuse remaining
      if (proj.weapon.behavior === 'bounce' && proj.fuseTimer !== null) {
        const urgency = 1 - proj.fuseTimer / proj.weapon.fuseMs!;
        const col = urgency > 0.6 ? 0xff4400 : 0xffcc00;
        g.fillStyle(col, 1);
      } else {
        g.fillStyle(0xffee44, 1);
      }
      g.fillCircle(proj.x, proj.y, proj.weapon.projectileSize);
    }
  }
}
