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
import { WeaponRegistry } from '../weapons/WeaponRegistry';
import { Loadout } from '../weapons/Loadout';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { ExplosionSystem } from '../game/ExplosionSystem';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';

const WORM_COLORS: Record<1 | 2, number> = { 1: 0x00ff88, 2: 0xff4444 };
const SPAWN_P1 = { x: 200, y: 220 };
const SPAWN_P2 = { x: 600, y: 220 };

/** Length of the aim direction line drawn from worm centre. */
const AIM_LINE_LEN = 22;

export class GameScene extends Phaser.Scene {
  private worms: Worm[] = [];
  private controllers: WormController[] = [];
  private wormGraphics: Map<Worm, Phaser.GameObjects.Rectangle> = new Map();

  private inputManager!: InputManager;
  private physicsSystem!: PhysicsSystem;

  private terrain!: TerrainMap;
  private terrainRenderer!: TerrainRenderer;
  terrainDestroyer!: TerrainDestroyer;

  private loadouts: Map<Worm, Loadout> = new Map();
  private weaponSystem!: WeaponSystem;
  private explosionSystem!: ExplosionSystem;
  private activeProjectiles: Projectile[] = [];

  /** Single Graphics object redrawn every frame for projectiles + aim lines. */
  private overlayGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // ── Terrain ────────────────────────────────────────────────────────
    this.terrain = TerrainGenerator.generate(CANVAS_WIDTH, CANVAS_HEIGHT, [
      SPAWN_P1, SPAWN_P2,
    ]);
    this.terrainRenderer = new TerrainRenderer(this, this.terrain);
    this.terrainDestroyer = new TerrainDestroyer(this.terrain, this.terrainRenderer);

    // ── Worms ──────────────────────────────────────────────────────────
    const worm1 = new Worm(SPAWN_P1.x, SPAWN_P1.y, 1);
    const worm2 = new Worm(SPAWN_P2.x, SPAWN_P2.y, 2);
    this.worms = [worm1, worm2];

    for (const worm of this.worms) {
      const rect = this.add.rectangle(worm.x, worm.y, worm.width, worm.height, WORM_COLORS[worm.playerId]);
      this.wormGraphics.set(worm, rect);
    }

    // ── Weapons ────────────────────────────────────────────────────────
    const bazooka = WeaponRegistry.bazooka;
    this.loadouts.set(worm1, new Loadout([bazooka]));
    this.loadouts.set(worm2, new Loadout([bazooka]));

    this.weaponSystem   = new WeaponSystem();
    this.explosionSystem = new ExplosionSystem(this.terrainDestroyer, this.worms);

    // ── Input + controllers ────────────────────────────────────────────
    this.inputManager = new InputManager(this.input.keyboard!);
    this.controllers  = [
      new WormController(worm1),
      new WormController(worm2),
    ];

    // ── Physics ────────────────────────────────────────────────────────
    this.physicsSystem = new PhysicsSystem();

    // ── Overlay (projectiles + aim lines) — drawn on top of everything ─
    this.overlayGraphics = this.add.graphics();

    // ── HUD hint ───────────────────────────────────────────────────────
    this.add.text(10, 10, 'P1: Arrows + Shift(jump) + Ctrl(fire) + Up/Dn(aim)', { fontSize: '10px', color: '#00ff88' });
    this.add.text(10, 23, 'P2: WASD   + Space(jump) + F(fire)    + W/S(aim)',   { fontSize: '10px', color: '#ff4444' });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    const input1 = this.inputManager.getPlayer1();
    const input2 = this.inputManager.getPlayer2();

    // ── Controllers ────────────────────────────────────────────────────
    this.controllers[0].update(input1, dt);
    this.controllers[1].update(input2, dt);

    // ── Loadout timers ─────────────────────────────────────────────────
    for (const loadout of this.loadouts.values()) {
      loadout.update(dt);
    }

    // ── Weapon fire ────────────────────────────────────────────────────
    const fireInputs = [input1.fire, input2.fire];
    this.worms.forEach((worm, i) => {
      const loadout = this.loadouts.get(worm)!;
      const proj = this.weaponSystem.tryFire(worm, loadout, fireInputs[i]);
      if (proj) this.activeProjectiles.push(proj);
    });

    // ── Physics ────────────────────────────────────────────────────────
    this.physicsSystem.update(this.worms, dt, this.terrain);

    this.physicsSystem.updateProjectiles(
      this.activeProjectiles, dt, this.terrain,
      (proj, hitX, hitY) => {
        this.explosionSystem.detonate(
          hitX, hitY,
          proj.weapon.explosionRadius,
          proj.weapon.splashDamage,
          proj.weapon.splashRadius,
        );
        this.cameras.main.shake(180, 0.008);
      },
    );

    // Prune inactive projectiles
    this.activeProjectiles = this.activeProjectiles.filter(p => p.active);

    // ── Sync worm visuals ─────────────────────────────────────────────
    for (const worm of this.worms) {
      const rect = this.wormGraphics.get(worm)!;
      rect.setPosition(worm.x, worm.y);
    }

    // ── Overlay: aim lines + projectiles ──────────────────────────────
    this.overlayGraphics.clear();
    this.drawAimLines();
    this.drawProjectiles();
  }

  private drawAimLines(): void {
    const g = this.overlayGraphics;
    for (const worm of this.worms) {
      if (worm.isDead) continue;
      const aimX = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
      const aimY = Math.sin(worm.aimAngle);
      const color = worm.playerId === 1 ? 0x00ff88 : 0xff4444;
      g.lineStyle(1, color, 0.7);
      g.beginPath();
      g.moveTo(worm.x, worm.y);
      g.lineTo(worm.x + aimX * AIM_LINE_LEN, worm.y + aimY * AIM_LINE_LEN);
      g.strokePath();
    }
  }

  private drawProjectiles(): void {
    const g = this.overlayGraphics;
    for (const proj of this.activeProjectiles) {
      g.fillStyle(0xffee44, 1);
      g.fillCircle(proj.x, proj.y, proj.weapon.projectileSize);
    }
  }
}
