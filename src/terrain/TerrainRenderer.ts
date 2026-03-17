import Phaser from 'phaser';
import { TerrainMap } from './TerrainMap';

// Earth palette
const COLOR_SURFACE = { r: 82, g: 130, b: 50  };  // dark green — top edge of solid
const COLOR_EARTH   = { r: 110, g: 75,  b: 40  };  // brown interior
const COLOR_ROCK_INNER = { r: 150, g: 148, b: 140 };  // lighter grey — rock interior
const COLOR_ROCK_EDGE  = { r: 55,  g: 52,  b: 50  };  // near-black — rock outline

/**
 * Maintains a Phaser CanvasTexture that mirrors the TerrainMap bitmap.
 * Call redrawFull() once on init, redrawRegion() after any carve.
 */
export class TerrainRenderer {
  private canvasTexture: Phaser.Textures.CanvasTexture;

  constructor(scene: Phaser.Scene, terrain: TerrainMap) {
    this.canvasTexture = scene.textures.createCanvas(
      'terrain', terrain.width, terrain.height,
    ) as Phaser.Textures.CanvasTexture;

    // Display centred in scene
    scene.add.image(terrain.width / 2, terrain.height / 2, 'terrain');

    this.redrawFull(terrain);
  }

  redrawFull(terrain: TerrainMap): void {
    const ctx = this.canvasTexture.context;
    const imageData = ctx.createImageData(terrain.width, terrain.height);
    this.fillImageData(imageData.data, terrain, 0, 0, terrain.width, terrain.height);
    ctx.putImageData(imageData, 0, 0);
    this.canvasTexture.refresh();
  }

  /**
   * Cheaply re-renders only the rectangular region affected by a carve.
   * cx/cy = carve centre, r = carve radius.
   */
  redrawRegion(terrain: TerrainMap, rx: number, ry: number, rw: number, rh: number): void {
    const x0 = Math.max(0, Math.floor(rx));
    const y0 = Math.max(0, Math.floor(ry));
    const x1 = Math.min(terrain.width,  Math.ceil(rx + rw));
    const y1 = Math.min(terrain.height, Math.ceil(ry + rh));
    if (x1 <= x0 || y1 <= y0) return;

    const ctx = this.canvasTexture.context;
    const imageData = ctx.createImageData(x1 - x0, y1 - y0);
    this.fillImageData(imageData.data, terrain, x0, y0, x1, y1);
    ctx.putImageData(imageData, x0, y0);
    this.canvasTexture.refresh();
  }

  private fillImageData(
    pixels: Uint8ClampedArray,
    terrain: TerrainMap,
    x0: number, y0: number, x1: number, y1: number,
  ): void {
    const data = terrain.getData();
    const W = terrain.width;
    let pi = 0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const v = data[y * W + x];
        if (v === 2) {
          // Indestructible rock — dark outline where adjacent to non-rock
          const isEdge =
            (x > 0     && data[y * W + x - 1] !== 2) ||
            (x < W - 1 && data[y * W + x + 1] !== 2) ||
            (y > 0     && data[(y - 1) * W + x] !== 2) ||
            (y < terrain.height - 1 && data[(y + 1) * W + x] !== 2);
          const c = isEdge ? COLOR_ROCK_EDGE : COLOR_ROCK_INNER;
          pixels[pi]     = c.r;
          pixels[pi + 1] = c.g;
          pixels[pi + 2] = c.b;
          pixels[pi + 3] = 255;
        } else if (v === 1) {
          // Surface pixel: solid here, empty above → darker green cap
          const above = y > 0 ? data[(y - 1) * W + x] : 1;
          const isSurface = above === 0;
          const c = isSurface ? COLOR_SURFACE : COLOR_EARTH;
          pixels[pi]     = c.r;
          pixels[pi + 1] = c.g;
          pixels[pi + 2] = c.b;
          pixels[pi + 3] = 255;
        } else {
          pixels[pi + 3] = 0; // transparent — background shows through
        }
        pi += 4;
      }
    }
  }
}
