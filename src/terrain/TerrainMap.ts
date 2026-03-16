/**
 * Owns the authoritative pixel-level solidity bitmap.
 * All terrain collision checks go through isSolid().
 * All terrain modifications go through setSolid() or carveCircle().
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

  /** Returns true for solid terrain and for any out-of-bounds coordinate. */
  isSolid(x: number, y: number): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return true;
    return this.data[yi * this.width + xi] === 1;
  }

  setSolid(x: number, y: number, solid: boolean): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return;
    this.data[yi * this.width + xi] = solid ? 1 : 0;
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
          this.setSolid(x, y, false);
        }
      }
    }
  }

  /** Direct buffer access for TerrainRenderer — do not modify externally. */
  getData(): Uint8Array {
    return this.data;
  }
}
