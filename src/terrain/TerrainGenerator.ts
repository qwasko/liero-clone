import { TerrainMap } from './TerrainMap';
import { TerrainParams } from '../game/LevelPreset';
import { SeededRNG } from '../utils/SeededRNG';

interface Point { x: number; y: number }

/**
 * Generates mostly-solid underground terrain with a few large irregular
 * caverns, connecting tunnels, and scattered indestructible rocks.
 * Cave shapes are built from overlapping random circles for an organic feel.
 */
export class TerrainGenerator {
  private static readonly BORDER      = 4;
  private static readonly SPAWN_CLEAR = 32;
  private static readonly CAVE_MARGIN = 50;
  private static readonly TUNNEL_R    = 5;
  private static readonly TUNNEL_WANDER = 1.0;
  private static readonly ROCK_R_MIN  = 6;
  private static readonly ROCK_R_MAX  = 14;

  private static rng: SeededRNG;

  static generate(
    width: number,
    height: number,
    spawnPoints: Point[],
    params: TerrainParams,
    seed?: number,
  ): TerrainMap {
    this.rng = new SeededRNG(seed ?? (Math.random() * 0xffffffff) >>> 0);
    const map  = new TerrainMap(width, height);
    const data = map.getData();

    // 1. Fill everything with dirt
    data.fill(1);

    // 2. Choose cave centers — spawn points become caves, plus a few extras
    const caves: Point[] = spawnPoints.map(p => ({ x: p.x, y: p.y }));
    const extra = params.extraCaves + Math.floor(this.rng.next() * 3);
    for (let i = 0; i < extra; i++) {
      caves.push(this.randomCaveCenter(width, height, caves));
    }

    // 3. Carve cave bubbles
    for (const c of caves) {
      this.carveCaveBubble(data, width, height, c, params);
    }

    // 4. Connect caves with winding tunnels (spanning tree + 1 extra)
    this.connectCaves(data, width, height, caves);

    // 5. Clear spawn areas (guaranteed open, directly in data — ignores rocks)
    for (const pt of spawnPoints) {
      this.carveInData(data, width, height, pt.x, pt.y, this.SPAWN_CLEAR);
    }

    // 6. Scatter indestructible rock clusters (only in solid dirt, away from spawns)
    this.scatterRocks(data, width, height, spawnPoints, params.rockClusters);

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
        x: m + this.rng.next() * (width  - 2 * m),
        y: m + this.rng.next() * (height - 2 * m),
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
    data: Uint8Array, w: number, h: number, center: Point, params: TerrainParams,
  ): void {
    const n = params.blobsMin + Math.floor(this.rng.next() * (params.blobsMax - params.blobsMin + 1));
    for (let i = 0; i < n; i++) {
      const r  = params.blobRMin + this.rng.next() * (params.blobRMax - params.blobRMin);
      const ox = (this.rng.next() - 0.5) * 2 * params.blobSpread;
      const oy = (this.rng.next() - 0.5) * 2 * params.blobSpread;
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
    const extras = 1 + Math.floor(this.rng.next() * 2);
    for (let i = 0; i < extras; i++) {
      const a = Math.floor(this.rng.next() * caves.length);
      let b = Math.floor(this.rng.next() * caves.length);
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

      const angle = Math.atan2(dy, dx) + (this.rng.next() - 0.5) * this.TUNNEL_WANDER;
      const len = 3 + this.rng.next() * 4;
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;

      const r = this.TUNNEL_R + (this.rng.next() - 0.5) * 3;
      this.carveInData(data, w, h, x, y, Math.max(3, r));
    }
  }

  // ── Rocks ───────────────────────────────────────────────────────────

  private static scatterRocks(
    data: Uint8Array, w: number, h: number, spawnPoints: Point[], rockClusters: number,
  ): void {
    const margin = 20;
    let placed = 0;

    for (let attempt = 0; attempt < rockClusters * 4 && placed < rockClusters; attempt++) {
      const cx = margin + this.rng.next() * (w - 2 * margin);
      const cy = margin + this.rng.next() * (h - 2 * margin);

      // Don't place rocks near spawn areas
      if (spawnPoints.some(sp => Math.hypot(cx - sp.x, cy - sp.y) < this.SPAWN_CLEAR + 20)) continue;
      // Only place in dirt
      const idx = Math.floor(cy) * w + Math.floor(cx);
      if (data[idx] !== 1) continue;

      const r = this.ROCK_R_MIN + this.rng.next() * (this.ROCK_R_MAX - this.ROCK_R_MIN);
      // Irregular: 3-6 overlapping circles for organic shape
      const blobs = 3 + Math.floor(this.rng.next() * 4);
      for (let j = 0; j < blobs; j++) {
        const bx = cx + (this.rng.next() - 0.5) * r * 1.4;
        const by = cy + (this.rng.next() - 0.5) * r * 1.4;
        const br = r * (0.5 + this.rng.next() * 0.5);
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
