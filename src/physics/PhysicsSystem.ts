import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { TerrainMap } from '../terrain/TerrainMap';
import { CollisionUtils } from './CollisionUtils';
import { GRAVITY } from '../game/constants';

/** Maximum pixels a worm can "step up" to climb a slope in one frame. */
const MAX_STEP_HEIGHT = 8;

/**
 * Custom physics system.
 * Phaser arcade physics is NOT used — terrain collision requires
 * pixel-level queries against the TerrainMap bitmap.
 *
 * Per-tick order: horizontal move → horizontal resolve → gravity →
 *                 vertical move → vertical resolve → grounded check.
 */
export class PhysicsSystem {
  /**
   * Pass terrain = null during Phase 1 (floor-only mode).
   * Phase 2+ always passes a TerrainMap.
   */
  update(worms: Worm[], dt: number, terrain: TerrainMap | null): void {
    for (const worm of worms) {
      if (worm.isDead) continue;
      this.stepWorm(worm, dt, terrain);
    }
  }

  private stepWorm(worm: Worm, dt: number, terrain: TerrainMap | null): void {
    // ── Horizontal move ─────────────────────────────────────────────
    worm.x += worm.vx * dt;

    if (terrain) {
      this.resolveHorizontal(worm, terrain);
    }

    // Clamp to map sides
    const halfW = worm.width / 2;
    const mapW  = terrain ? terrain.width : 800;
    if (worm.x < halfW)         { worm.x = halfW; worm.vx = 0; }
    if (worm.x > mapW - halfW)  { worm.x = mapW - halfW; worm.vx = 0; }

    // ── Grounded check (before gravity, to avoid sink/push jitter) ───
    const grounded = terrain
      ? CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.bottom + 1)
      : false;

    // ── Gravity + vertical move ──────────────────────────────────────
    if (!grounded) {
      worm.vy += GRAVITY * dt;
    }
    worm.y += worm.vy * dt;

    if (terrain) {
      this.resolveVertical(worm, terrain);
    } else {
      this.resolveFloor(worm);
    }

    // ── Grounded state ───────────────────────────────────────────────
    if (terrain) {
      if (grounded && Math.abs(worm.vy) < 1.0) worm.vy = 0;
      worm.state = grounded ? (worm.vx !== 0 ? 'moving' : 'idle') : 'airborne';
    }
  }

  // ── Horizontal collision with step-up slope climbing ──────────────

  private resolveHorizontal(worm: Worm, terrain: TerrainMap): void {
    if (worm.vx === 0) return;

    const faceX = worm.vx > 0 ? worm.right : worm.left;

    if (!CollisionUtils.isColumnBlocked(terrain, faceX, worm.top + 1, worm.bottom - 1)) {
      return; // clear, nothing to do
    }

    // Try stepping up pixel by pixel
    for (let step = 1; step <= MAX_STEP_HEIGHT; step++) {
      worm.y -= 1;
      if (!CollisionUtils.isColumnBlocked(terrain, faceX, worm.top + 1, worm.bottom - 1)) {
        return; // stepped up — keep new x and y
      }
    }

    // Couldn't step up — revert horizontal movement and restore y
    worm.x  -= worm.vx * (1 / 60); // approximate 1-frame revert
    worm.y  += MAX_STEP_HEIGHT;     // undo the failed step attempts
    worm.vx  = 0;
  }

  // ── Vertical collision ─────────────────────────────────────────────

  private resolveVertical(worm: Worm, terrain: TerrainMap): void {
    if (worm.vy >= 0) {
      // Falling — check bottom edge
      if (CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.bottom)) {
        // Push up until feet are clear
        let pushes = 0;
        while (
          CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.bottom) &&
          pushes < worm.height + 2
        ) {
          worm.y -= 1;
          pushes++;
        }
        worm.vy = 0;
      }
    } else {
      // Rising — check top edge against ceiling
      if (CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.top)) {
        let pushes = 0;
        while (
          CollisionUtils.isRowBlocked(terrain, worm.left + 1, worm.right - 1, worm.top) &&
          pushes < worm.height + 2
        ) {
          worm.y += 1;
          pushes++;
        }
        worm.vy = 0;
      }
    }
  }

  // ── Projectile physics ────────────────────────────────────────────

  /**
   * Advances all active projectiles.
   * Handles: swept terrain collision, direct worm hits, bounce reflection, fuse timers.
   */
  updateProjectiles(
    projectiles: Projectile[],
    dt: number,
    terrain: TerrainMap,
    worms: Worm[],
    onHit: (proj: Projectile, hitX: number, hitY: number) => void,
  ): void {
    for (const proj of projectiles) {
      if (!proj.active) continue;

      // ── Mine: deployed → arm delay then proximity check, skip movement ─
      if (proj.weapon.behavior === 'mine' && proj.deployed) {
        if (proj.armTimer > 0) {
          proj.armTimer -= dt * 1000;
        } else {
          // Triggers on ANY worm (including owner) once armed
          for (const worm of worms) {
            if (worm.isDead) continue;
            const dist = Math.hypot(proj.x - worm.x, proj.y - worm.y);
            if (dist <= (proj.weapon.mineProximity ?? 20)) {
              proj.active = false;
              onHit(proj, proj.x, proj.y);
              break;
            }
          }
        }
        continue;
      }

      // ── Fuse timer ──────────────────────────────────────────────────
      if (proj.fuseTimer !== null) {
        proj.fuseTimer -= dt * 1000;
        if (proj.fuseTimer <= 0) {
          proj.active = false;
          proj.hitReason = 'timer';
          onHit(proj, proj.x, proj.y);
          continue;
        }
      }

      // Terrain grace: fragments spawn inside craters and need to escape.
      // Grace ends early once the fragment reaches air (prevents tunneling).
      if (proj.terrainGrace > 0) {
        if (!terrain.isSolid(proj.x, proj.y)) {
          proj.terrainGrace = 0;  // reached air — enable terrain collision
        } else {
          proj.terrainGrace -= dt;
        }
      }

      proj.vy += GRAVITY * proj.weapon.projectileGravity * dt;

      // Ground friction for bounce weapons resting on terrain
      if (proj.weapon.behavior === 'bounce' && terrain.isSolid(proj.x, proj.y + 2)) {
        if (Math.abs(proj.vy) < 50) proj.vy = 0;
        proj.vx *= 0.7;
        if (Math.abs(proj.vx) < 2) proj.vx = 0;
      }

      const dx = proj.vx * dt;
      const dy = proj.vy * dt;
      const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy)));

      let terrainHit = false;

      for (let i = 1; i <= steps; i++) {
        const tx = proj.x + dx * (i / steps);
        const ty = proj.y + dy * (i / steps);

        // ── Direct worm hit ─────────────────────────────────────────
        // Fragments (no fuseMs, behavior=normal/bounce internals) hit ALL worms
        // including the owner — matching original Liero NObject behavior.
        const isFragment = proj.weapon.id === 'chiquita_fragment'
          || proj.weapon.id === 'cluster_bomblet'
          || proj.weapon.id === 'chiquita_bomblet';
        for (const worm of worms) {
          if (worm.isDead) continue;
          if (!isFragment && worm.playerId === proj.ownerId) continue;
          if (
            Math.abs(tx - worm.x) < worm.width  / 2 + proj.weapon.projectileSize &&
            Math.abs(ty - worm.y) < worm.height / 2 + proj.weapon.projectileSize
          ) {
            // Direct hitDamage (flat, no falloff) — like Liero NObject.hitDamage
            if (proj.weapon.hitDamage) {
              worm.applyDamage(proj.weapon.hitDamage);
              console.log(`[fragment hit worm] P${worm.playerId} hitDmg=${proj.weapon.hitDamage} weapon=${proj.weapon.id}`);
            }
            proj.active = false;
            proj.hitReason = 'worm';
            onHit(proj, tx, ty);
            terrainHit = true;
            break;
          }
        }
        if (terrainHit) break;

        // ── Terrain hit (skip during grace period) ──────────────────
        if (terrain.isSolid(tx, ty) && proj.terrainGrace <= 0) {
          if (proj.weapon.behavior === 'bounce' && proj.bounceCount < proj.weapon.maxBounces) {
            this.bounceProjectile(proj, dx, dy);
          } else if (proj.weapon.behavior === 'zimm') {
            // Zimm: elastic infinite bounce off terrain, only explodes on worm hit
            this.bounceZimm(proj, dx, dy);
          } else if (proj.weapon.behavior === 'mine' && !proj.deployed) {
            // Mine: stop and deploy on first terrain contact
            const len = Math.hypot(dx, dy);
            if (len > 0) {
              proj.x -= dx / len * 3;
              proj.y -= dy / len * 3;
            }
            proj.deployed  = true;
            proj.armTimer  = 700; // arm after 700 ms — prevents immediate self-trigger
            proj.vx = 0;
            proj.vy = 0;
          } else {
            proj.active = false;
            proj.hitReason = 'terrain';
            onHit(proj, tx, ty);
          }
          terrainHit = true;
          break;
        }
      }

      if (!terrainHit) {
        proj.x += dx;
        proj.y += dy;

        if (
          proj.x < 0 || proj.x > terrain.width ||
          proj.y < 0 || proj.y > terrain.height
        ) {
          proj.active = false;
          proj.hitReason = 'oob';
          // Bounce and timed weapons detonate at the boundary instead of vanishing
          if (proj.weapon.behavior !== 'normal' || proj.weapon.fuseMs !== null) {
            const bx = Math.max(1, Math.min(terrain.width  - 1, proj.x));
            const by = Math.max(1, Math.min(terrain.height - 1, proj.y));
            onHit(proj, bx, by);
          }
        }
      }
    }
  }

  private bounceProjectile(proj: Projectile, dx: number, dy: number): void {
    // Liero bounce formula: perpendicular vel *= -bouncePercent/100,
    // cross-axis vel *= 4/5 (20% damping). bouncePercent=100 is perfect elastic.
    const bp = proj.weapon.bouncePercent ?? 62; // fallback to legacy ~0.62 dampen
    if (bp === 100) {
      // Perfect elastic: just negate the collision axis
      if (Math.abs(dx) >= Math.abs(dy)) {
        proj.vx = -proj.vx;
      } else {
        proj.vy = -proj.vy;
      }
    } else {
      const factor = bp / 100;
      if (Math.abs(dx) >= Math.abs(dy)) {
        proj.vx = -proj.vx * factor;
        proj.vy *= 0.8;                // cross-axis: 4/5
      } else {
        proj.vy = -proj.vy * factor;
        proj.vx *= 0.8;                // cross-axis: 4/5
      }
    }
    proj.bounceCount++;
    proj.x -= Math.sign(dx) * 2;
    proj.y -= Math.sign(dy) * 2;

    // Stop micro-bouncing: aggressive threshold, tune down later if needed
    if (Math.hypot(proj.vx, proj.vy) < 150) {
      proj.vx = 0;
      proj.vy = 0;
    }
  }

  /** Zimm: elastic (no dampen) infinite bounce — terrain never detonates it. */
  private bounceZimm(proj: Projectile, dx: number, dy: number): void {
    if (Math.abs(dx) >= Math.abs(dy)) {
      proj.vx = -proj.vx;
    } else {
      proj.vy = -proj.vy;
    }
    proj.x -= Math.sign(dx) * 3;
    proj.y -= Math.sign(dy) * 3;
  }

  // ── Phase 1 fallback: solid floor at bottom ────────────────────────

  private resolveFloor(worm: Worm): void {
    const floorY = 460; // CANVAS_HEIGHT - 40
    if (worm.bottom >= floorY) {
      worm.y  = floorY - worm.height / 2;
      worm.vy = 0;
      worm.state = worm.vx !== 0 ? 'moving' : 'idle';
    } else {
      worm.state = 'airborne';
    }
  }
}
