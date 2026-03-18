import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { TerrainMap } from '../terrain/TerrainMap';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';
import { GRAVITY } from './constants';

const POOL_SIZE = 200;

/** Dark shrapnel/debris colours — no glowing sparks. */
const SHRAPNEL_COLORS = [0x3a3028, 0x4a3c30, 0x555555, 0x2a2020, 0x6b5040];

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

/**
 * Object-pooled shrapnel system.
 * Every particle has real collision — disappears on first terrain or worm contact.
 * Terrain hit: 2 px carve. Worm hit: 2–4 HP damage.
 */
export class ParticleSystem {
  private pool: Particle[];
  private live: Particle[] = [];

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

  /** Spawn 6–10 shrapnel pieces at (x, y). */
  spawnExplosion(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 200;

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
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];

      // ── Lifetime failsafe ─────────────────────────────────────────
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.live.splice(i, 1);
        continue;
      }

      // ── Gravity ───────────────────────────────────────────────────
      p.vy += GRAVITY * 0.4 * dt;

      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;

      // ── Terrain hit: carve 2 px, disappear ────────────────────────
      if (terrain.isSolid(nx, ny)) {
        terrainDestroyer.carveCircle(p.x, p.y, 2);
        p.active = false;
        this.live.splice(i, 1);
        continue;
      }

      p.x = nx;
      p.y = ny;

      // ── Worm hit: 2–4 HP, disappear ───────────────────────────────
      for (const worm of worms) {
        if (worm.isDead) continue;
        if (
          Math.abs(p.x - worm.x) < worm.width  / 2 + p.size &&
          Math.abs(p.y - worm.y) < worm.height / 2 + p.size
        ) {
          worm.applyDamage(2 + Math.floor(Math.random() * 3));
          p.active = false;
          this.live.splice(i, 1);
          break;
        }
      }
    }
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    for (const p of this.live) {
      const alpha = Math.min(1, p.life / p.maxLife / 0.35);
      g.fillStyle(p.color, alpha);
      g.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
  }

  reset(): void {
    for (const p of this.live) p.active = false;
    this.live.length = 0;
  }
}
