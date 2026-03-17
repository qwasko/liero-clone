import { TerrainMap } from './TerrainMap';

interface Point { x: number; y: number }

/**
 * Generates mostly-solid underground terrain with a few large irregular
 * caverns, connecting tunnels, and scattered indestructible rocks.
 *
 * Target: ~80-85% solid fill — claustrophobic, players must dig to move.
 * Cave shapes are built from overlapping random circles for an organic feel.
 */
export class TerrainGenerator {
  private static readonly BORDER       = 4;
  private static readonly SPAWN_CLEAR  = 32;

  // Cave parameters
  private static readonly EXTRA_CAVES  = 3;  // additional caves beyond spawn caves
  private static readonly CAVE_MARGIN  = 50; // minimum distance from edge for cave centers
  private static readonly BLOBS_MIN    = 8;
  private static readonly BLOBS_MAX    = 14;
  private static readonly BLOB_R_MIN   = 18;
  private static readonly BLOB_R_MAX   = 42;
  private static readonly BLOB_SPREAD  = 40; // max offset from cave center

  // Tunnel parameters
  private static readonly TUNNEL_R     = 5;
  private static readonly TUNNEL_WANDER = 1.0; // radians of random wander

  // Rock parameters
  private static readonly ROCK_CLUSTERS = 30;
  private static readonly ROCK_R_MIN    = 6;
  private static readonly ROCK_R_MAX    = 14;

  static generate(
    width: number,
    height: number,
    spawnPoints: Point[],
  ): TerrainMap {
    const map  = new TerrainMap(width, height);
    const data = map.getData();

    // 1. Fill everything with dirt
    data.fill(1);

    // 2. Choose cave centers — spawn points become caves, plus a few extras
    const caves: Point[] = spawnPoints.map(p => ({ x: p.x, y: p.y }));
    const extra = this.EXTRA_CAVES + Math.floor(Math.random() * 3); // 3-5 extra
    for (let i = 0; i < extra; i++) {
      caves.push(this.randomCaveCenter(width, height, caves));
    }

    // 3. Carve cave bubbles
    for (const c of caves) {
      this.carveCaveBubble(data, width, height, c);
    }

    // 4. Connect caves with winding tunnels (spanning tree + 1 extra)
    this.connectCaves(data, width, height, caves);

    // 5. Clear spawn areas (guaranteed open, directly in data — ignores rocks)
    for (const pt of spawnPoints) {
      this.carveInData(data, width, height, pt.x, pt.y, this.SPAWN_CLEAR);
    }

    // 6. Scatter indestructible rock clusters (only in solid dirt, away from spawns)
    this.scatterRocks(data, width, height, spawnPoints);

    // 7. Solid borders (must survive everything above)
    this.fillBorders(data, width, height);

    return map;
  }

  // ── Cave placement ──────────────────────────────────────────────────

  /** Pick a center that's reasonably far from existing caves. */
  private static randomCaveCenter(
    width: number, height: number, existing: Point[],
  ): Point {
    const m = this.CAVE_MARGIN;
    let bestPt: Point = { x: width / 2, y: height / 2 };
    let bestDist = 0;

    for (let attempt = 0; attempt < 30; attempt++) {
      const pt: Point = {
        x: m + Math.random() * (width  - 2 * m),
        y: m + Math.random() * (height - 2 * m),
      };
      const minDist = existing.reduce(
        (min, e) => Math.min(min, Math.hypot(pt.x - e.x, pt.y - e.y)), Infinity,
      );
      if (minDist > bestDist) { bestDist = minDist; bestPt = pt; }
    }
    return bestPt;
  }

  /** Carve one large irregular cavern from overlapping circles. */
  private static carveCaveBubble(
    data: Uint8Array, w: number, h: number, center: Point,
  ): void {
    const n = this.BLOBS_MIN + Math.floor(Math.random() * (this.BLOBS_MAX - this.BLOBS_MIN + 1));
    for (let i = 0; i < n; i++) {
      const r  = this.BLOB_R_MIN + Math.random() * (this.BLOB_R_MAX - this.BLOB_R_MIN);
      const ox = (Math.random() - 0.5) * 2 * this.BLOB_SPREAD;
      const oy = (Math.random() - 0.5) * 2 * this.BLOB_SPREAD;
      this.carveInData(data, w, h, center.x + ox, center.y + oy, r);
    }
  }

  // ── Tunnels ─────────────────────────────────────────────────────────

  /**
   * Build a minimum spanning tree over cave centers (so all caves are
   * reachable), then add 1-2 extra random edges for loops.
   */
  private static connectCaves(
    data: Uint8Array, w: number, h: number, caves: Point[],
  ): void {
    if (caves.length < 2) return;

    const connected = new Set<number>([0]);
    const edges: [number, number][] = [];

    // Prim-style MST
    while (connected.size < caves.length) {
      let bestA = 0, bestB = 0, bestD = Infinity;
      for (const a of connected) {
        for (let b = 0; b < caves.length; b++) {
          if (connected.has(b)) continue;
          const d = Math.hypot(caves[a].x - caves[b].x, caves[a].y - caves[b].y);
          if (d < bestD) { bestD = d; bestA = a; bestB = b; }
        }
      }
      connected.add(bestB);
      edges.push([bestA, bestB]);
    }

    // 1-2 extra random edges for variety
    const extras = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < extras; i++) {
      const a = Math.floor(Math.random() * caves.length);
      let b = Math.floor(Math.random() * caves.length);
      if (b === a) b = (a + 1) % caves.length;
      edges.push([a, b]);
    }

    for (const [a, b] of edges) {
      this.carveTunnel(data, w, h, caves[a], caves[b]);
    }
  }

  /** Carve a winding tunnel between two points using biased random walk. */
  private static carveTunnel(
    data: Uint8Array, w: number, h: number, from: Point, to: Point,
  ): void {
    let x = from.x;
    let y = from.y;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const maxSteps = Math.ceil(dist / 3) + 20; // safety cap

    for (let step = 0; step < maxSteps; step++) {
      const dx = to.x - x;
      const dy = to.y - y;
      if (Math.hypot(dx, dy) < this.TUNNEL_R * 2) break;

      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * this.TUNNEL_WANDER;
      const len = 3 + Math.random() * 4;
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;

      const r = this.TUNNEL_R + (Math.random() - 0.5) * 3;
      this.carveInData(data, w, h, x, y, Math.max(3, r));
    }
  }

  // ── Rocks ───────────────────────────────────────────────────────────

  private static scatterRocks(
    data: Uint8Array, w: number, h: number, spawnPoints: Point[],
  ): void {
    const margin = 20;
    let placed = 0;

    for (let attempt = 0; attempt < this.ROCK_CLUSTERS * 4 && placed < this.ROCK_CLUSTERS; attempt++) {
      const cx = margin + Math.random() * (w - 2 * margin);
      const cy = margin + Math.random() * (h - 2 * margin);

      // Don't place rocks near spawn areas
      if (spawnPoints.some(sp => Math.hypot(cx - sp.x, cy - sp.y) < this.SPAWN_CLEAR + 20)) continue;
      // Only place in dirt
      const idx = Math.floor(cy) * w + Math.floor(cx);
      if (data[idx] !== 1) continue;

      const r = this.ROCK_R_MIN + Math.random() * (this.ROCK_R_MAX - this.ROCK_R_MIN);
      // Irregular: 3-6 overlapping circles for organic shape
      const blobs = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < blobs; j++) {
        const bx = cx + (Math.random() - 0.5) * r * 1.4;
        const by = cy + (Math.random() - 0.5) * r * 1.4;
        const br = r * (0.5 + Math.random() * 0.5);
        this.stampCircleInData(data, w, h, bx, by, br, 2);
      }
      placed++;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Carve a circle to air (value 0) directly in the data array. */
  private static carveInData(
    data: Uint8Array, w: number, h: number,
    cx: number, cy: number, r: number,
  ): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
          data[y * w + x] = 0;
        }
      }
    }
  }

  /**
   * Stamp a circle of a given value, but only overwrite dirt (value 1).
   * Used for placing rocks — never overwrites air or existing rocks.
   */
  private static stampCircleInData(
    data: Uint8Array, w: number, h: number,
    cx: number, cy: number, r: number, value: number,
  ): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
          const idx = y * w + x;
          if (data[idx] === 1) data[idx] = value;
        }
      }
    }
  }

  private static fillBorders(data: Uint8Array, w: number, h: number): void {
    const b = this.BORDER;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < b || x >= w - b || y < b || y >= h - b) {
          data[y * w + x] = 1; // dirt border (not rock — allows edge explosions)
        }
      }
    }
  }
}
