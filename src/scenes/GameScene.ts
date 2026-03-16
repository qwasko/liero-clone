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
import { HUD } from '../ui/HUD';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MATCH_DURATION_SECONDS } from '../game/constants';

const WORM_COLORS: Record<1 | 2, number> = { 1: 0x00ff88, 2: 0xff4444 };
const SPAWN_P1 = { x: 200, y: 220 };
const SPAWN_P2 = { x: 600, y: 220 };
const AIM_LINE_LEN = 22;

export class GameScene extends Phaser.Scene {
  private worms!: [Worm, Worm];
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
    const bazooka = WeaponRegistry.bazooka;
    this.loadouts.set(worm1, new Loadout([bazooka]));
    this.loadouts.set(worm2, new Loadout([bazooka]));

    this.weaponSystem    = new WeaponSystem();
    this.explosionSystem = new ExplosionSystem(this.terrainDestroyer, this.worms);

    // ── Input + controllers ────────────────────────────────────────────
    this.inputManager = new InputManager(this.input.keyboard!);
    this.controllers  = [new WormController(worm1), new WormController(worm2)];

    // ── Physics ────────────────────────────────────────────────────────
    this.physicsSystem = new PhysicsSystem();

    // ── Overlay + HUD (created last so they render on top) ─────────────
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

    // ── Controllers ────────────────────────────────────────────────────
    this.controllers[0].update(input1, dt);
    this.controllers[1].update(input2, dt);

    // ── Loadout timers ─────────────────────────────────────────────────
    this.loadouts.forEach(l => l.update(dt));

    // ── Weapon fire ────────────────────────────────────────────────────
    [input1.fire, input2.fire].forEach((fire, i) => {
      const worm    = this.worms[i];
      const loadout = this.loadouts.get(worm)!;
      const proj    = this.weaponSystem.tryFire(worm, loadout, fire);
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
    this.activeProjectiles = this.activeProjectiles.filter(p => p.active);

    // ── Sync worm visuals ─────────────────────────────────────────────
    for (const worm of this.worms) {
      const rect = this.wormGraphics.get(worm)!;
      rect.setPosition(worm.x, worm.y);
      rect.setVisible(!worm.isDead);
    }

    // ── Win condition check ────────────────────────────────────────────
    this.checkWinCondition();

    // ── HUD + overlay ─────────────────────────────────────────────────
    this.hud.update(worm1, this.loadouts.get(worm1)!, worm2, this.loadouts.get(worm2)!, this.timeRemaining);
    this.overlayGraphics.clear();
    this.drawAimLines();
    this.drawProjectiles();
  }

  private checkWinCondition(): void {
    const [worm1, worm2] = this.worms;
    const timedOut = this.timeRemaining <= 0;
    const bothDead = worm1.isDead && worm2.isDead;
    const oneDead  = worm1.isDead || worm2.isDead;

    if (!oneDead && !timedOut) return;

    this.matchOver = true;

    let winner: number; // 0 = draw
    if (bothDead) {
      winner = 0;
    } else if (worm1.isDead) {
      winner = 2;
    } else if (worm2.isDead) {
      winner = 1;
    } else {
      // Time ran out — higher HP wins
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
      g.fillStyle(0xffee44, 1);
      g.fillCircle(proj.x, proj.y, proj.weapon.projectileSize);
    }
  }
}
