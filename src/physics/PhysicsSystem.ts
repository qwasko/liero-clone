import { Worm } from '../entities/Worm';
import { GRAVITY, CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';

/**
 * Custom physics system. Phaser arcade physics is not used for worms —
 * terrain collision requires pixel-level queries which we handle ourselves.
 *
 * Phase 1: gravity + solid floor.
 * Phase 2: will add TerrainMap pixel collision.
 */
export class PhysicsSystem {
  update(worms: Worm[], dt: number): void {
    for (const worm of worms) {
      if (worm.isDead) continue;
      this.integrateWorm(worm, dt);
    }
  }

  private integrateWorm(worm: Worm, dt: number): void {
    // Apply gravity
    worm.vy += GRAVITY * dt;

    // Integrate velocity
    worm.x += worm.vx * dt;
    worm.y += worm.vy * dt;

    // --- Phase 1 floor collision (replaced in Phase 2 with terrain) ---
    const floorY = CANVAS_HEIGHT - 40;
    if (worm.bottom >= floorY) {
      worm.y = floorY - worm.height / 2;
      worm.vy = 0;
      worm.state = worm.vx !== 0 ? 'moving' : 'idle';
    } else {
      worm.state = 'airborne';
    }

    // Clamp horizontal to canvas
    const halfW = worm.width / 2;
    if (worm.x < halfW) { worm.x = halfW; worm.vx = 0; }
    if (worm.x > CANVAS_WIDTH - halfW) { worm.x = CANVAS_WIDTH - halfW; worm.vx = 0; }
  }
}
