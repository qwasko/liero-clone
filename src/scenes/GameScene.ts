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
import { DEFAULT_LOADOUT, WeaponRegistry } from '../weapons/WeaponRegistry';
import { Loadout } from '../weapons/Loadout';
import { ParticleSystem } from '../game/ParticleSystem';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { ExplosionSystem } from '../game/ExplosionSystem';
import { RopeSystem } from '../game/RopeSystem';
import { DiggingSystem } from '../game/DiggingSystem';
import { CrateSystem } from '../game/CrateSystem';
import { AudioManager } from '../utils/AudioManager';
import { HUD } from '../ui/HUD';
import { TagSystem } from '../game/TagSystem';
import { LevelPreset, LEVEL_PRESETS } from '../game/LevelPreset';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MATCH_DURATION_SECONDS, DEFAULT_LIVES, RESPAWN_DELAY_MS, WORM_MAX_HP } from '../game/constants';


const AIM_LINE_LEN = 22;

export class GameScene extends Phaser.Scene {
  private worms!: [Worm, Worm];
  private controllers!: [WormController, WormController];
  private wormLayer!: Phaser.GameObjects.Graphics;

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
  private particleSystem!: ParticleSystem;
  private particleLayer!: Phaser.GameObjects.Graphics;

  private audio!: AudioManager;
  private hud!: HUD;
  private overlayGraphics!: Phaser.GameObjects.Graphics;

  private timeRemaining: number = MATCH_DURATION_SECONDS;
  private matchOver: boolean = false;
  private gameMode: 'normal' | 'tag' = 'normal';
  private spawnPoints!: [{ x: number; y: number }, { x: number; y: number }];

  // Lives + respawn
  private lives: Map<Worm, number> = new Map();
  private respawnTimers: Map<Worm, number | null> = new Map(); // ms remaining, null = not scheduled

  // Tag mode
  private tagSystem: TagSystem | null = null;
  private tagItGraphics: Phaser.GameObjects.Text | null = null;

  // Invisible point that the camera follows; updated each frame to worm midpoint
  private cameraFocus!: Phaser.GameObjects.Zone;

  // Explosion flash overlay (screen-space rect, fades out via tween)
  private flashRect!: Phaser.GameObjects.Rectangle;

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

  create(data?: { mode?: 'normal' | 'tag'; level?: LevelPreset }): void {
    // ── Clean up stale state from previous game ──────────────────────────
    if (this.textures.exists('terrain')) {
      this.textures.remove('terrain');
    }
    this.loadouts.clear();
    this.cycleState = [
      { dir: 0, holdMs: 0, repeatMs: 0 },
      { dir: 0, holdMs: 0, repeatMs: 0 },
    ];

    this.gameMode          = data?.mode ?? 'normal';
    this.matchOver         = false;
    this.timeRemaining     = MATCH_DURATION_SECONDS;
    this.activeProjectiles = [];
    this.particleSystem    = new ParticleSystem();
    this.lives.clear();
    this.respawnTimers.clear();
    this.tagSystem = null;
    this.tagItGraphics = null;

    // ── Level preset ───────────────────────────────────────────────────
    const level = data?.level ?? LEVEL_PRESETS[0];
    this.spawnPoints = [
      { x: level.width * 0.25, y: level.height * 0.44 },
      { x: level.width * 0.75, y: level.height * 0.44 },
    ];
    const spawnP1 = this.spawnPoints[0];
    const spawnP2 = this.spawnPoints[1];

    // Camera: 1:1 scale, follow invisible focus point, bounded to map
    this.cameras.main.setZoom(1);

    // ── Terrain ────────────────────────────────────────────────────────
    this.terrain = TerrainGenerator.generate(level.width, level.height, [spawnP1, spawnP2], level.terrain);
    this.terrainRenderer = new TerrainRenderer(this, this.terrain);
    this.terrainDestroyer = new TerrainDestroyer(this.terrain, this.terrainRenderer);

    // ── Worms ──────────────────────────────────────────────────────────
    const worm1 = new Worm(spawnP1.x, spawnP1.y, 1);
    const worm2 = new Worm(spawnP2.x, spawnP2.y, 2);
    this.worms = [worm1, worm2];

    this.wormLayer = this.add.graphics().setDepth(5);

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

    // ── Camera follow setup ────────────────────────────────────────────
    // Zone has zero display size — no texture offset to interfere with follow.
    this.cameraFocus = this.add.zone(spawnP1.x, spawnP1.y, 1, 1);
    this.cameras.main.setBounds(0, 0, level.width, level.height);
    this.cameras.main.startFollow(this.cameraFocus);

// ── Overlay + HUD (last → render on top) ──────────────────────────
    this.particleLayer   = this.add.graphics().setDepth(9);
    this.overlayGraphics = this.add.graphics().setDepth(10);

    // Screen-space flash rect for explosion feedback (replaces camera shake)
    this.flashRect = this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0xff2200, 0)
      .setOrigin(0, 0).setDepth(50).setScrollFactor(0);

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

        // ── Cluster bomb: spray bomblets ──────────────────────────────
        if (proj.weapon.clusterCount && proj.weapon.clusterWeapon) {
          const bombletDef = WeaponRegistry[proj.weapon.clusterWeapon];
          if (bombletDef) {
            for (let i = 0; i < proj.weapon.clusterCount; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 90 + Math.random() * 160;
              this.activeProjectiles.push(new Projectile(
                hitX, hitY,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                proj.ownerId,
                bombletDef,
              ));
            }
          }
        }

        // ── Chiquita: spray banana fragments ─────────────────────────
        if (proj.weapon.chiquitaFragments) {
          const fragDef = WeaponRegistry['chiquita_fragment'];
          if (fragDef) {
            const total = proj.weapon.chiquitaFragments;
            for (let i = 0; i < total; i++) {
              const angle = (i / total) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
              const speed = 180 + Math.random() * 220;
              this.activeProjectiles.push(new Projectile(
                hitX, hitY,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                proj.ownerId,
                fragDef,
              ));
            }
          }
        }

        // ── Particles ─────────────────────────────────────────────────
        this.spawnExplosionParticles(hitX, hitY);

        const big = proj.weapon.explosionRadius >= 20;
        this.audio.playExplosion(big);
        this.triggerFlash(big ? 0.18 : 0.08);
      },
    );
    this.activeProjectiles = this.activeProjectiles.filter(p => p.active);

    // ── Particles ──────────────────────────────────────────────────────
    this.particleSystem.update(dt, this.terrain, this.worms, this.terrainDestroyer);
    this.particleSystem.draw(this.particleLayer);

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

    // ── Worm sprites ──────────────────────────────────────────────────
    this.drawWorms();

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

    // ── Camera: follow P1 worm (both players share one screen) ────────
    this.cameraFocus.setPosition(worm1.x, worm1.y);

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

  private triggerFlash(alpha: number): void {
    this.tweens.killTweensOf(this.flashRect);
    this.flashRect.setAlpha(alpha);
    this.tweens.add({
      targets:  this.flashRect,
      alpha:    0,
      duration: 120,
      ease:     'Quad.easeOut',
    });
  }

  private spawnExplosionParticles(x: number, y: number): void {
    const count = 6 + Math.floor(Math.random() * 5); // 6–10 shrapnel pieces
    this.particleSystem.spawnExplosion(x, y, count);
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
    return worm.playerId === 1 ? this.spawnPoints[0] : this.spawnPoints[1];
  }

  private drawWorms(): void {
    const g = this.wormLayer;
    g.clear();
    for (const worm of this.worms) {
      if (worm.isDead) continue;
      this.drawWormSprite(g, worm);
    }
  }

  private drawWormSprite(g: Phaser.GameObjects.Graphics, worm: Worm): void {
    const p1 = worm.playerId === 1;

    // Segment colors tail→head (dark to light)
    const colors = p1
      ? [0x0a5c25, 0x178a38, 0x22bb4e, 0x33ee66]   // green shades
      : [0x6b1111, 0x991a1a, 0xcc2727, 0xee4444];   // red shades

    const x = worm.x;
    const y = worm.y;

    // Body axis: tail at back, head at front (in aim direction)
    const aimDX = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
    const aimDY = Math.sin(worm.aimAngle);
    // Perpendicular axis for S-curve offsets
    const perpDX = -aimDY;
    const perpDY =  aimDX;

    // [along-axis offset, perp offset, radius]
    const segs: [number, number, number][] = [
      [-6,  0.5, 2.0],  // tail   (darkest, smallest)
      [-2, -1.5, 2.5],  // body2
      [ 2,  1.5, 3.0],  // body1
      [ 6,  0.0, 3.5],  // head   (brightest, largest)
    ];

    // Pass 1: dark outline — draw all slightly larger circles first
    g.fillStyle(0x0a0a0a, 1);
    for (const [a, p, r] of segs) {
      g.fillCircle(x + aimDX * a + perpDX * p, y + aimDY * a + perpDY * p, r + 1.2);
    }

    // Pass 2: colored segments, tail first so head renders on top
    segs.forEach(([a, p, r], i) => {
      g.fillStyle(colors[i], 1);
      g.fillCircle(x + aimDX * a + perpDX * p, y + aimDY * a + perpDY * p, r);
    });

    // Eye: on head surface, looking in aim direction
    const hx = x + aimDX * 6;  // head centre
    const hy = y + aimDY * 6;
    const ex = hx + aimDX * 2.2;
    const ey = hy + aimDY * 2.2;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(ex, ey, 1.5);
    g.fillStyle(0x111111, 1);
    g.fillCircle(ex + aimDX * 0.6, ey + aimDY * 0.6, 0.8);
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
      if (!proj.active) continue;

      // ── Mine: deployed → draw as small brown rectangle ───────────
      if (proj.weapon.behavior === 'mine' && proj.deployed) {
        g.fillStyle(0x8B5513, 1);
        g.fillRect(proj.x - 5, proj.y - 3, 10, 6);
        // Blinking red light
        const blink = Math.floor(this.time.now / 300) % 2 === 0;
        if (blink) {
          g.fillStyle(0xff2200, 1);
          g.fillCircle(proj.x, proj.y - 3, 1.5);
        }
        continue;
      }

      // ── Bounce weapons with fuse: pulse red when nearly expiring ─
      let color = proj.weapon.projectileColor;
      if (proj.fuseTimer !== null && proj.weapon.fuseMs !== null) {
        const urgency = 1 - proj.fuseTimer / proj.weapon.fuseMs;
        if (urgency > 0.65) color = 0xff3300;
      }

      g.fillStyle(color, 1);
      g.fillCircle(proj.x, proj.y, proj.weapon.projectileSize);
    }
  }
}
