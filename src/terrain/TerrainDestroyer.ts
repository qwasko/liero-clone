import { TerrainMap } from './TerrainMap';
import { TerrainRenderer } from './TerrainRenderer';

/**
 * Carves shapes into TerrainMap and triggers the renderer to update
 * only the affected region. Used by explosions in Phase 4+.
 */
export class TerrainDestroyer {
  constructor(
    private terrain: TerrainMap,
    private renderer: TerrainRenderer,
  ) {}

  carveCircle(cx: number, cy: number, radius: number): void {
    this.terrain.carveCircle(cx, cy, radius);
    this.renderer.redrawRegion(
      this.terrain,
      cx - radius - 1,
      cy - radius - 1,
      (radius + 1) * 2,
      (radius + 1) * 2,
    );
  }
}
