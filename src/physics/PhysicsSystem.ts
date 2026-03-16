import { Worm } from '../entities/Worm';
import { TerrainMap } from '../terrain/TerrainMap';
import { CollisionUtils } from './CollisionUtils';
import { GRAVITY, CANVAS_WIDTH } from '../game/constants';

/** Maximum pixels a worm can "step up" to climb a slope in one frame. */
const MAX_STEP_HEIGHT = 8;

/**
 * Custom physics system.
 * Phaser arcade physics is NOT used — terrain collision requires
 * pixel-level queries against the TerrainMap bitmap.
 *
 * Per-tick order: horizontal move → horizontal resolve → gravity →
 *                 vertical move → vertical resolve → grounded check.
 */
export class PhysicsSystem {
  /**
   * Pass terrain = null during Phase 1 (floor-only mode).
   * Phase 2+ always passes a TerrainMap.
   */
  update(worms: Worm[], dt: number, terrain: TerrainMap | null): void {
    for (const worm of worms) {
      if (worm.isDead) continue;
      this.stepWorm(worm, dt, terrain);
    }
  }

  private stepWorm(worm: Worm, dt: number, terrain: TerrainMap | null): void {
    // ── Horizontal move ─────────────────────────────────────────────
    worm.x += worm.vx * dt;

    if (terrain) {
      this.resolveHorizontal(worm, terrain);
    }

    // Clamp to canvas sides
    const halfW = worm.width / 2;
    if (worm.x < halfW)                { worm.x = halfW; worm.vx = 0; }
    if (worm.x > CANVAS_WIDTH - halfW) { worm.x = CANVAS_WIDTH - halfW; worm.vx = 0; }

    // ── Gravity + vertical move ──────────────────────────────────────
    worm.vy += GRAVITY * dt;
    worm.y  += worm.vy * dt;

    if (terrain) {
      this.resolveVertical(worm, terrain);
    } else {
      this.resolveFloor(worm);
    }

    // ── Grounded state ───────────────────────────────────────────────
    if (terrain) {
      const grounded = CollisionUtils.isRowBlocked(
        terrain, worm.left + 1, worm.right - 1, worm.bottom + 1,
      );
      worm.state = grounded ? (worm.vx !== 0 ? 'moving' : 'idle') : 'airborne';
    }
  }

  // ── Horizontal collision with step-up slope climbing ──────────────

  private resolveHorizontal(worm: Worm, terrain: TerrainMap): void {
    if (worm.vx === 0) return;

    const faceX = worm.vx > 0 ? worm.right : worm.left;

    if (!CollisionUtils.isColumnBlocked(terrain, faceX, worm.top + 1, worm.bottom - 1)) {
      return; // clear, nothing to do
    }

    // Try stepping up pixel by pixel
    for (let step = 1; step <= MAX_STEP_HEIGHT; step++) {
      worm.y -= 1;
      if (!CollisionUtils.isColumnBlocked(terrain, faceX, worm.top + 1, worm.bottom - 1)) {
        return; // stepped up — keep new x and y
      }
    }

    // Couldn't step up — revert horizontal movement and restore y
    worm.x  -= worm.vx * (1 / 60); // approximate 1-frame revert
    worm.y  += MAX_STEP_HEIGHT;     // undo the failed step attempts
    worm.vx  = 0;
  }

  // ── Vertical collision ─────────────────────────────────────────────

  private resolveVertical(worm: Worm, terrain: TerrainMap): void {
    if (worm.vy >= 0) {
      // Falling — check bottom edge
      if (CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.bottom)) {
        // Push up until feet are clear
        let pushes = 0;
        while (
          CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.bottom) &&
          pushes < worm.height + 2
        ) {
          worm.y -= 1;
          pushes++;
        }
        worm.vy = 0;
      }
    } else {
      // Rising — check top edge against ceiling
      if (CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.top)) {
        let pushes = 0;
        while (
          CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.top) &&
          pushes < worm.height + 2
        ) {
          worm.y += 1;
          pushes++;
        }
        worm.vy = 0;
      }
    }
  }

  // ── Phase 1 fallback: solid floor at bottom ────────────────────────

  private resolveFloor(worm: Worm): void {
    const floorY = 460; // CANVAS_HEIGHT - 40
    if (worm.bottom >= floorY) {
      worm.y  = floorY - worm.height / 2;
      worm.vy = 0;
      worm.state = worm.vx !== 0 ? 'moving' : 'idle';
    } else {
      worm.state = 'airborne';
    }
  }
}
