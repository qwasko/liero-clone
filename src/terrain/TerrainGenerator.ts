import { TerrainMap } from './TerrainMap';

interface Point { x: number; y: number }

/**
 * Generates terrain using cellular automata.
 * Result: organic cave-like underground with guaranteed open spawn areas.
 */
export class TerrainGenerator {
  private static readonly FILL_CHANCE  = 0.46;
  private static readonly SMOOTH_PASSES = 5;
  private static readonly BORDER_SIZE   = 4;
  private static readonly SPAWN_CLEAR_RADIUS = 32;

  static generate(
    width: number,
    height: number,
    spawnPoints: Point[],
  ): TerrainMap {
    const map = new TerrainMap(width, height);
    const data = map.getData();

    // 1. Random fill
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() < this.FILL_CHANCE ? 1 : 0;
    }

    // 2. Solid borders
    this.fillBorders(data, width, height);

    // 3. Cellular automata smoothing
    for (let p = 0; p < this.SMOOTH_PASSES; p++) {
      this.smooth(data, width, height);
    }

    // 4. Borders must survive smoothing
    this.fillBorders(data, width, height);

    // 5. Clear spawn areas so worms have open space
    for (const pt of spawnPoints) {
      map.carveCircle(pt.x, pt.y, this.SPAWN_CLEAR_RADIUS);
    }

    return map;
  }

  private static fillBorders(data: Uint8Array, width: number, height: number): void {
    const b = this.BORDER_SIZE;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < b || x >= width - b || y < b || y >= height - b) {
          data[y * width + x] = 1;
        }
      }
    }
  }

  private static smooth(data: Uint8Array, width: number, height: number): void {
    const next = new Uint8Array(data.length);
    const b = this.BORDER_SIZE;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < b || x >= width - b || y < b || y >= height - b) {
          next[y * width + x] = 1;
          continue;
        }
        const n = this.countSolidNeighbors(data, width, height, x, y);
        next[y * width + x] = n >= 5 ? 1 : 0;
      }
    }

    data.set(next);
  }

  private static countSolidNeighbors(
    data: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
  ): number {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          count++;
        } else {
          count += data[ny * width + nx];
        }
      }
    }
    return count;
  }
}
