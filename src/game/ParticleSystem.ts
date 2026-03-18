import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { TerrainMap } from '../terrain/TerrainMap';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';
import { GRAVITY } from './constants';

const POOL_SIZE = 200;

/** Dark shrapnel/debris colours. */
const SHRAPNEL_COLORS = [0x3a3028, 0x4a3c30, 0x555555, 0x2a2020, 0x6b5040];

/** Bright flash colours for impact bursts. */
const BURST_COLORS = [0xff8800, 0xffcc44, 0xffffff, 0xff4400];

interface Particle {
  active:  boolean;
  x:       number;
  y:       number;
  vx:      number;
  vy:      number;
  life:    number;
  maxLife: number;
  size:    number;
  color:   number;
}

interface Burst {
  x:      number;
  y:      number;
  life:   number;   // counts down from 0.1 to 0
  radius: number;   // 8–12 px
  color:  number;
}

/**
 * Object-pooled shrapnel system.
 * Every particle has real collision — disappears on first terrain or worm contact.
 * Terrain hit: 2 px carve + impact burst. Worm hit: 1–2 HP + impact burst.
 */
export class ParticleSystem {
  private pool:   Particle[];
  private live:   Particle[] = [];
  private bursts: Burst[]    = [];

  constructor() {
    this.pool = Array.from({ length: POOL_SIZE }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1, size: 2, color: 0,
    }));
  }

  private alloc(): Particle | null {
    for (const p of this.pool) {
      if (!p.active) return p;
    }
    return null;
  }

  private spawnBurst(x: number, y: number): void {
    this.bursts.push({
      x, y,
      life:   0.1,
      radius: 8 + Math.random() * 4,
      color:  BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
    });
  }

  /** Spawn shrapnel pieces at (x, y). count should be 6–10 for normal explosions. */
  spawnExplosion(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 100;   // 50% slower than before

      p.active  = true;
      p.x       = x + (Math.random() - 0.5) * 8;
      p.y       = y + (Math.random() - 0.5) * 8;
      p.vx      = Math.cos(angle) * speed;
      p.vy      = Math.sin(angle) * speed;
      p.maxLife = 0.4 + Math.random() * 0.4;
      p.life    = p.maxLife;
      p.size    = Math.random() > 0.5 ? 3 : 2;
      p.color   = SHRAPNEL_COLORS[Math.floor(Math.random() * SHRAPNEL_COLORS.length)];

      this.live.push(p);
    }
  }

  update(
    dt:               number,
    terrain:          TerrainMap,
    worms:            Worm[],
    terrainDestroyer: TerrainDestroyer,
  ): void {
    // ── Bursts ────────────────────────────────────────────────────────
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i].life -= dt;
      if (this.bursts[i].life <= 0) this.bursts.splice(i, 1);
    }

    // ── Shrapnel ──────────────────────────────────────────────────────
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.live.splice(i, 1);
        continue;
      }

      p.vy += GRAVITY * 0.4 * dt;

      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;

      // ── Terrain hit: 2 px carve + burst, disappear ────────────────
      if (terrain.isSolid(nx, ny)) {
        terrainDestroyer.carveCircle(p.x, p.y, 2);
        this.spawnBurst(p.x, p.y);
        p.active = false;
        this.live.splice(i, 1);
        continue;
      }

      p.x = nx;
      p.y = ny;

      // ── Worm hit: 1–2 HP + burst, disappear ──────────────────────
      for (const worm of worms) {
        if (worm.isDead) continue;
        if (
          Math.abs(p.x - worm.x) < worm.width  / 2 + p.size &&
          Math.abs(p.y - worm.y) < worm.height / 2 + p.size
        ) {
          worm.applyDamage(1 + Math.floor(Math.random() * 2));
          this.spawnBurst(p.x, p.y);
          p.active = false;
          this.live.splice(i, 1);
          break;
        }
      }
    }
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    g.clear();

    // Shrapnel (dark debris squares)
    for (const p of this.live) {
      const alpha = Math.min(1, p.life / p.maxLife / 0.35);
      g.fillStyle(p.color, alpha);
      g.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }

    // Impact bursts (bright circles, drawn on top)
    for (const b of this.bursts) {
      const alpha = (b.life / 0.1) * 0.85;
      g.fillStyle(b.color, alpha);
      g.fillCircle(b.x, b.y, b.radius);
    }
  }

  reset(): void {
    for (const p of this.live) p.active = false;
    this.live.length   = 0;
    this.bursts.length = 0;
  }
}
