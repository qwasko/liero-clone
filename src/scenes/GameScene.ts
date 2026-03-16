import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { WormController } from '../entities/WormController';
import { InputManager } from '../input/InputManager';
import { PhysicsSystem } from '../physics/PhysicsSystem';
import { TerrainMap } from '../terrain/TerrainMap';
import { TerrainGenerator } from '../terrain/TerrainGenerator';
import { TerrainRenderer } from '../terrain/TerrainRenderer';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';

/** Colours used to draw worms as filled rectangles. */
const WORM_COLORS: Record<1 | 2, number> = {
  1: 0x00ff88,
  2: 0xff4444,
};

/** Worm spawn positions — must match spawn-clear positions in TerrainGenerator. */
const SPAWN_P1 = { x: 200, y: 220 };
const SPAWN_P2 = { x: 600, y: 220 };

export class GameScene extends Phaser.Scene {
  private worms: Worm[] = [];
  private controllers: WormController[] = [];
  private wormGraphics: Map<Worm, Phaser.GameObjects.Rectangle> = new Map();

  private inputManager!: InputManager;
  private physicsSystem!: PhysicsSystem;

  private terrain!: TerrainMap;
  private terrainRenderer!: TerrainRenderer;
  terrainDestroyer!: TerrainDestroyer; // public so future systems can reference it

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // ── Terrain ────────────────────────────────────────────────────────
    this.terrain = TerrainGenerator.generate(CANVAS_WIDTH, CANVAS_HEIGHT, [
      SPAWN_P1, SPAWN_P2,
    ]);
    // TerrainRenderer adds its own image to the scene; drawn first → behind worms
    this.terrainRenderer = new TerrainRenderer(this, this.terrain);
    this.terrainDestroyer = new TerrainDestroyer(this.terrain, this.terrainRenderer);

    // ── Worms ──────────────────────────────────────────────────────────
    const worm1 = new Worm(SPAWN_P1.x, SPAWN_P1.y, 1);
    const worm2 = new Worm(SPAWN_P2.x, SPAWN_P2.y, 2);
    this.worms = [worm1, worm2];

    for (const worm of this.worms) {
      const rect = this.add.rectangle(
        worm.x, worm.y,
        worm.width, worm.height,
        WORM_COLORS[worm.playerId],
      );
      this.wormGraphics.set(worm, rect);
    }

    // ── Input + controllers ────────────────────────────────────────────
    this.inputManager = new InputManager(this.input.keyboard!);
    this.controllers  = [
      new WormController(worm1),
      new WormController(worm2),
    ];

    // ── Physics ────────────────────────────────────────────────────────
    this.physicsSystem = new PhysicsSystem();

    // ── HUD hint ───────────────────────────────────────────────────────
    this.add.text(10, 10, 'P1: Arrows + Shift(jump)', { fontSize: '11px', color: '#00ff88' });
    this.add.text(10, 24, 'P2: WASD   + Space(jump)', { fontSize: '11px', color: '#ff4444' });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    this.controllers[0].update(this.inputManager.getPlayer1());
    this.controllers[1].update(this.inputManager.getPlayer2());

    this.physicsSystem.update(this.worms, dt, this.terrain);

    for (const worm of this.worms) {
      const rect = this.wormGraphics.get(worm)!;
      rect.setPosition(worm.x, worm.y);
    }
  }
}
