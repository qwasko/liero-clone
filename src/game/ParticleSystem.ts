import Phaser from 'phaser';
import { TerrainMap } from '../terrain/TerrainMap';
import { GRAVITY } from './constants';

const POOL_SIZE = 400;

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
  bounced: boolean;
}

/**
 * Object-pooled 2D particle system for explosion debris.
 * Particles are small squares, affected by gravity, bounce once off terrain.
 */
export class ParticleSystem {
  private pool: Particle[];
  private live: Particle[] = [];

  constructor() {
    this.pool = Array.from({ length: POOL_SIZE }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1, size: 2, color: 0xffffff, bounced: false,
    }));
  }

  private alloc(): Particle | null {
    for (const p of this.pool) {
      if (!p.active) return p;
    }
    return null; // pool exhausted
  }

  /**
   * Spawn explosion particles at (x, y).
   * colors: array of hex values — each particle picks one at random.
   */
  spawnExplosion(x: number, y: number, count: number, colors: number[]): void {
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 220;

      p.active  = true;
      p.x       = x + (Math.random() - 0.5) * 10;
      p.y       = y + (Math.random() - 0.5) * 10;
      p.vx      = Math.cos(angle) * speed;
      p.vy      = Math.sin(angle) * speed;
      p.maxLife = 0.5 + Math.random() * 0.5;
      p.life    = p.maxLife;
      p.size    = Math.random() > 0.55 ? 3 : 2;
      p.color   = colors[Math.floor(Math.random() * colors.length)];
      p.bounced = false;

      this.live.push(p);
    }
  }

  update(dt: number, terrain: TerrainMap): void {
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

      // Bounce once off terrain (axis-split detection)
      if (!p.bounced && terrain.isSolid(nx, ny)) {
        const hitX = terrain.isSolid(nx, p.y);
        const hitY = terrain.isSolid(p.x, ny);
        if (hitX && !hitY) {
          p.vx *= -0.4;
          p.vy *=  0.4;
        } else if (hitY && !hitX) {
          p.vy *= -0.4;
          p.vx *=  0.4;
        } else {
          p.vx *= -0.35;
          p.vy *= -0.35;
        }
        p.bounced = true;
        // Don't move this frame — stay put
        continue;
      }

      p.x = nx;
      p.y = ny;
    }
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    for (const p of this.live) {
      // Fade out over the last 40% of life
      const alpha = Math.min(1, (p.life / p.maxLife) / 0.4);
      g.fillStyle(p.color, alpha);
      g.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
  }

  reset(): void {
    for (const p of this.live) p.active = false;
    this.live.length = 0;
  }
}
