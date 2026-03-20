import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { TerrainMap } from '../terrain/TerrainMap';
import { TerrainDestroyer } from '../terrain/TerrainDestroyer';
import { ExplosionSystem } from './ExplosionSystem';
import { GRAVITY } from './constants';

const POOL_SIZE = 200;

/** Particle impact triggers a real small_explosion (Liero: detectRange=8, damage=5). */
const PARTICLE_IMPACT_RADIUS = 4;
const PARTICLE_IMPACT_DAMAGE = 3;
const PARTICLE_IMPACT_SPLASH = 8;

/** Phase enum for 3-phase particle lifecycle. */
const enum Phase {
  FLYING,
  IMPACT,
  FADEOUT,
}

/** Impact ring expanding duration (seconds). */
const IMPACT_DURATION = 0.12;
/** Fadeout shrink/fade duration (seconds). */
const FADEOUT_DURATION = 0.1;

/** Impact ring start / end radius. */
const IMPACT_RADIUS_START = 4;
const IMPACT_RADIUS_END = 16;

/** Flying-phase colours. */
const CORE_COLORS = [0xffcc44, 0xffaa22, 0xffdd66]; // bright orange/yellow
const EDGE_COLOR = 0x881100; // dark red outline

interface Particle {
  active:   boolean;
  x:        number;
  y:        number;
  vx:       number;
  vy:       number;
  life:     number;
  maxLife:  number;
  size:     number;
  phase:    Phase;
  phaseT:   number; // time spent in current phase
}

/**
 * Object-pooled shrapnel system with 3-phase animation.
 * Phase 1 — FLYING: bright core + dark outline, moves with gravity.
 * Phase 2 — IMPACT: expanding bright ring on hit (terrain or worm).
 * Phase 3 — FADEOUT: shrink + fade to transparent, then recycle.
 */
export class ParticleSystem {
  private pool: Particle[];
  private live: Particle[] = [];

  constructor() {
    this.pool = Array.from({ length: POOL_SIZE }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1, size: 3, phase: Phase.FLYING, phaseT: 0,
    }));
  }

  private alloc(): Particle | null {
    for (const p of this.pool) {
      if (!p.active) return p;
    }
    return null;
  }

  /** Transition a particle to the IMPACT phase (freeze in place). */
  private toImpact(p: Particle): void {
    p.phase  = Phase.IMPACT;
    p.phaseT = 0;
    p.vx     = 0;
    p.vy     = 0;
  }

  /** Spawn shrapnel pieces at (x, y). count should be 6–10 for normal explosions. */
  spawnExplosion(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      // Base speed reduced by 33% (×0.67)
      const speed = (30 + Math.random() * 100) * 0.67;

      p.active  = true;
      p.x       = x + (Math.random() - 0.5) * 8;
      p.y       = y + (Math.random() - 0.5) * 8;
      p.vx      = Math.cos(angle) * speed;
      p.vy      = Math.sin(angle) * speed;
      p.maxLife = 0.4 + Math.random() * 0.4;
      p.life    = p.maxLife;
      p.size    = Math.random() > 0.5 ? 4 : 3;
      p.phase   = Phase.FLYING;
      p.phaseT  = 0;

      this.live.push(p);
    }
  }

  update(
    dt:               number,
    terrain:          TerrainMap,
    worms:            Worm[],
    _terrainDestroyer: TerrainDestroyer,
    explosionSystem:  ExplosionSystem,
  ): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.phaseT += dt;

      // ── FLYING phase ───────────────────────────────────────────────
      if (p.phase === Phase.FLYING) {
        p.life -= dt;
        if (p.life <= 0) {
          // Ran out of life → detonate in place (no free ride, every particle counts)
          explosionSystem.detonate(
            p.x, p.y,
            PARTICLE_IMPACT_RADIUS,
            PARTICLE_IMPACT_DAMAGE,
            PARTICLE_IMPACT_SPLASH,
          );
          this.toImpact(p);
          continue;
        }

        p.vy += GRAVITY * 0.4 * dt;
        const nx = p.x + p.vx * dt;
        const ny = p.y + p.vy * dt;

        // Terrain hit: carve crater + trigger small_explosion (Liero chain damage)
        if (terrain.isSolid(nx, ny)) {
          explosionSystem.detonate(
            p.x, p.y,
            PARTICLE_IMPACT_RADIUS,
            PARTICLE_IMPACT_DAMAGE,
            PARTICLE_IMPACT_SPLASH,
          );
          console.log(`[particle hit] terrain at ${Math.round(p.x)},${Math.round(p.y)} carved=${PARTICLE_IMPACT_RADIUS}px dmg=${PARTICLE_IMPACT_DAMAGE}`);
          this.toImpact(p);
          continue;
        }

        p.x = nx;
        p.y = ny;

        // Worm hit: direct damage + trigger small_explosion (Liero chain damage)
        for (const worm of worms) {
          if (worm.isDead) continue;
          if (
            Math.abs(p.x - worm.x) < worm.width  / 2 + p.size &&
            Math.abs(p.y - worm.y) < worm.height / 2 + p.size
          ) {
            const directDmg = 1 + Math.floor(Math.random() * 2);
            worm.applyDamage(directDmg);
            explosionSystem.detonate(
              p.x, p.y,
              PARTICLE_IMPACT_RADIUS,
              PARTICLE_IMPACT_DAMAGE,
              PARTICLE_IMPACT_SPLASH,
            );
            console.log(`[particle hit] worm P${worm.playerId} at ${Math.round(p.x)},${Math.round(p.y)} directDmg=${directDmg} splashDmg=${PARTICLE_IMPACT_DAMAGE} carved=${PARTICLE_IMPACT_RADIUS}px`);
            this.toImpact(p);
            break;
          }
        }
        continue;
      }

      // ── IMPACT phase ───────────────────────────────────────────────
      if (p.phase === Phase.IMPACT) {
        if (p.phaseT >= IMPACT_DURATION) {
          p.phase  = Phase.FADEOUT;
          p.phaseT = 0;
        }
        continue;
      }

      // ── FADEOUT phase ──────────────────────────────────────────────
      if (p.phase === Phase.FADEOUT) {
        if (p.phaseT >= FADEOUT_DURATION) {
          p.active = false;
          this.live.splice(i, 1);
        }
      }
    }
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    g.clear();

    for (const p of this.live) {
      // ── FLYING: bright core + dark outline ─────────────────────
      if (p.phase === Phase.FLYING) {
        const alpha = Math.min(1, p.life / p.maxLife / 0.35);
        const coreColor = CORE_COLORS[Math.floor(Math.random() * CORE_COLORS.length)];

        // Dark red outline (1px larger)
        g.fillStyle(EDGE_COLOR, alpha * 0.9);
        g.fillCircle(p.x, p.y, p.size * 0.5 + 1);

        // Bright orange/yellow core
        g.fillStyle(coreColor, alpha);
        g.fillCircle(p.x, p.y, p.size * 0.5);
        continue;
      }

      // ── IMPACT: expanding bright ring ──────────────────────────
      if (p.phase === Phase.IMPACT) {
        const t = p.phaseT / IMPACT_DURATION; // 0→1
        const radius = IMPACT_RADIUS_START + (IMPACT_RADIUS_END - IMPACT_RADIUS_START) * t;
        const alpha = (1 - t) * 0.85;

        // Bright flash fading orange→dark
        const flashColor = t < 0.3 ? 0xffffff : t < 0.6 ? 0xff8800 : 0x882200;
        g.fillStyle(flashColor, alpha);
        g.fillCircle(p.x, p.y, radius);
        continue;
      }

      // ── FADEOUT: shrink + fade ─────────────────────────────────
      if (p.phase === Phase.FADEOUT) {
        const t = p.phaseT / FADEOUT_DURATION; // 0→1
        const alpha = (1 - t) * 0.6;
        const radius = (1 - t) * 3;
        g.fillStyle(0x882200, alpha);
        g.fillCircle(p.x, p.y, radius);
      }
    }
  }

  reset(): void {
    for (const p of this.live) p.active = false;
    this.live.length = 0;
  }
}
