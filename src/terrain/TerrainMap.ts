/**
 * Owns the authoritative pixel-level solidity bitmap.
 * All terrain collision checks go through isSolid().
 * All terrain modifications go through setSolid() or carveCircle().
 *
 * Cell values:
 *   0 = air (empty)
 *   1 = dirt (destructible)
 *   2 = rock (indestructible — cannot be carved by explosions or digging)
 */
export class TerrainMap {
  private data: Uint8Array;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
  }

  /** Returns true for solid terrain (dirt or rock) and for out-of-bounds. */
  isSolid(x: number, y: number): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return true;
    return this.data[yi * this.width + xi] !== 0;
  }

  /**
   * Set a pixel to solid (dirt) or empty.
   * Rock pixels (value 2) are indestructible — setSolid(x, y, false) is a no-op on them.
   */
  setSolid(x: number, y: number, solid: boolean): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return;
    const idx = yi * this.width + xi;
    if (!solid && this.data[idx] === 2) return; // rock is indestructible
    this.data[idx] = solid ? 1 : 0;
  }

  carveCircle(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    const x0 = Math.floor(cx - radius);
    const x1 = Math.ceil(cx + radius);
    const y0 = Math.floor(cy - radius);
    const y1 = Math.ceil(cy + radius);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
          this.setSolid(x, y, false); // respects rock indestructibility
        }
      }
    }
  }

  /** Direct buffer access for TerrainRenderer and TerrainGenerator. */
  getData(): Uint8Array {
    return this.data;
  }
}
