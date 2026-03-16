import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { WormController } from '../entities/WormController';
import { InputManager } from '../input/InputManager';
import { PhysicsSystem } from '../physics/PhysicsSystem';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';

/** Colours used to draw worms as rectangles in Phase 1. */
const WORM_COLORS: Record<1 | 2, number> = {
  1: 0x00ff88,
  2: 0xff4444,
};

export class GameScene extends Phaser.Scene {
  private worms: Worm[] = [];
  private controllers: WormController[] = [];
  private wormGraphics: Map<Worm, Phaser.GameObjects.Rectangle> = new Map();

  private inputManager!: InputManager;
  private physicsSystem!: PhysicsSystem;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Floor visual (Phase 1 placeholder — local var, not stored as field)
    this.add.rectangle(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20,
      CANVAS_WIDTH, 40,
      0x5c3a1e
    );

    // Spawn worms
    const worm1 = new Worm(200, 100, 1);
    const worm2 = new Worm(600, 100, 2);
    this.worms = [worm1, worm2];

    // Visual rectangles for each worm
    for (const worm of this.worms) {
      const rect = this.add.rectangle(
        worm.x, worm.y,
        worm.width, worm.height,
        WORM_COLORS[worm.playerId]
      );
      this.wormGraphics.set(worm, rect);
    }

    // Input + controllers
    this.inputManager = new InputManager(this.input.keyboard!);
    this.controllers = [
      new WormController(worm1),
      new WormController(worm2),
    ];

    // Custom physics (separate from Phaser's built-in this.physics)
    this.physicsSystem = new PhysicsSystem();

    // Player labels
    this.add.text(10, 10, 'P1: Arrows + Shift(jump) + Ctrl(fire)', {
      fontSize: '11px', color: '#00ff88',
    });
    this.add.text(10, 26, 'P2: WASD   + Space(jump) + F(fire)', {
      fontSize: '11px', color: '#ff4444',
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000; // ms → seconds

    // Read input and update controllers
    this.controllers[0].update(this.inputManager.getPlayer1());
    this.controllers[1].update(this.inputManager.getPlayer2());

    // Simulate physics
    this.physicsSystem.update(this.worms, dt);

    // Sync visual rectangles to worm positions
    for (const worm of this.worms) {
      const rect = this.wormGraphics.get(worm)!;
      rect.setPosition(worm.x, worm.y);
    }
  }
}
