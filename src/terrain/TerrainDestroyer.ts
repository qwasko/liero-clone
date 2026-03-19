import { TerrainMap } from './TerrainMap';

export interface DirtyRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Carves shapes into TerrainMap and records dirty regions.
 * The renderer flushes dirty regions each frame to repaint only what changed.
 */
export class TerrainDestroyer {
  private dirtyRegions: DirtyRegion[] = [];

  constructor(private terrain: TerrainMap) {}

  carveCircle(cx: number, cy: number, radius: number): void {
    this.terrain.carveCircle(cx, cy, radius);
    this.dirtyRegions.push({
      x: cx - radius - 1,
      y: cy - radius - 1,
      w: (radius + 1) * 2,
      h: (radius + 1) * 2,
    });
  }

  /** Returns and clears all dirty regions accumulated since the last flush. */
  flushDirty(): DirtyRegion[] {
    const regions = this.dirtyRegions;
    this.dirtyRegions = [];
    return regions;
  }
}
