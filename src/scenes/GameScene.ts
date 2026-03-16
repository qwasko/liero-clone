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
import { AudioManager } from '../utils/AudioManager';
import { HUD } from '../ui/HUD';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MATCH_DURATION_SECONDS } from '../game/constants';

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
  private activeProjectiles: Projectile[] = [];

  private audio!: AudioManager;
  private hud!: HUD;
  private overlayGraphics!: Phaser.GameObjects.Graphics;

  private timeRemaining: number = MATCH_DURATION_SECONDS;
  private matchOver: boolean = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.matchOver = false;
    this.timeRemaining = MATCH_DURATION_SECONDS;
    this.activeProjectiles = [];

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

    // ── Controllers ────────────────────────────────────────────────────
    this.controllers[0].update(input1, dt);
    this.controllers[1].update(input2, dt);

    if (this.controllers[0].justJumped) this.audio.playJump();
    if (this.controllers[1].justJumped) this.audio.playJump();

    // ── Weapon switching — blocked while rope is attached ──────────────
    if (!this.ropeSystem.hasRope(worm1)) {
      if (input1.nextWeapon) load1.nextWeapon();
      if (input1.prevWeapon) load1.prevWeapon();
    }
    if (!this.ropeSystem.hasRope(worm2)) {
      if (input2.nextWeapon) load2.nextWeapon();
      if (input2.prevWeapon) load2.prevWeapon();
    }

    // ── Loadout timers ─────────────────────────────────────────────────
    load1.update(dt);
    load2.update(dt);

    // ── Digging ────────────────────────────────────────────────────────
    this.diggingSystem.update(worm1, input1);
    this.diggingSystem.update(worm2, input2);

    // ── Rope handling (independent of weapon loadout) ──────────────────
    if (this.ropeSystem.handleInput(worm1, input1, this.terrain, dt)) this.audio.playRopeShoot();
    if (this.ropeSystem.handleInput(worm2, input2, this.terrain, dt)) this.audio.playRopeShoot();

    // ── Weapon fire ────────────────────────────────────────────────────
    const fireInputs: [boolean, boolean] = [input1.fire, input2.fire];
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

    // ── Sync worm visuals ─────────────────────────────────────────────
    for (const worm of this.worms) {
      const rect = this.wormGraphics.get(worm)!;
      rect.setPosition(worm.x, worm.y);
      rect.setVisible(!worm.isDead);
    }

    // ── Win condition ─────────────────────────────────────────────────
    this.checkWinCondition();

    // ── HUD + overlay ─────────────────────────────────────────────────
    this.hud.update(worm1, load1, worm2, load2, this.timeRemaining);
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
    const timedOut = this.timeRemaining <= 0;
    const oneDead  = worm1.isDead || worm2.isDead;

    if (!oneDead && !timedOut) return;

    this.matchOver = true;

    let winner: number;
    if (worm1.isDead && worm2.isDead) {
      winner = 0;
    } else if (worm1.isDead) {
      winner = 2;
    } else if (worm2.isDead) {
      winner = 1;
    } else {
      if      (worm1.hp > worm2.hp) winner = 1;
      else if (worm2.hp > worm1.hp) winner = 2;
      else                          winner = 0;
    }

    this.time.delayedCall(800, () => {
      this.scene.start('GameOverScene', { winner });
    });
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
