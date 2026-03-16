import { TerrainMap } from '../terrain/TerrainMap';

/**
 * Low-level terrain probe helpers used by PhysicsSystem.
 * All functions work in integer pixel space.
 */
export class CollisionUtils {
  /** True if any pixel in the horizontal span (x1..x2, y) is solid. */
  static isRowBlocked(
    terrain: TerrainMap,
    x1: number, x2: number,
    y: number,
  ): boolean {
    const py = Math.round(y);
    for (let px = Math.round(x1); px <= Math.round(x2); px++) {
      if (terrain.isSolid(px, py)) return true;
    }
    return false;
  }

  /** True if any pixel in the vertical span (x, y1..y2) is solid. */
  static isColumnBlocked(
    terrain: TerrainMap,
    x: number,
    y1: number, y2: number,
  ): boolean {
    const px = Math.round(x);
    for (let py = Math.round(y1); py <= Math.round(y2); py++) {
      if (terrain.isSolid(px, py)) return true;
    }
    return false;
  }
}
