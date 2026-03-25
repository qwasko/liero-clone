import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { TerrainMap } from '../terrain/TerrainMap';
import { CollisionUtils } from './CollisionUtils';
import { GRAVITY, MAX_WORM_VX, MAX_WORM_VY } from '../game/constants';
import { SeededRNG } from '../utils/SeededRNG';

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
  constructor(private rng: SeededRNG) {}
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
    // ── Velocity cap (knockback, recoil, etc.) ──────────────────────
    if (Math.abs(worm.vx) > MAX_WORM_VX) worm.vx = Math.sign(worm.vx) * MAX_WORM_VX;
    if (Math.abs(worm.vy) > MAX_WORM_VY) worm.vy = Math.sign(worm.vy) * MAX_WORM_VY;

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

      // ── Mine detach cooldown countdown ─────────────────────────────
      if (proj.detachCooldown > 0) {
        proj.detachCooldown -= dt * 1000;
      }

      // ── Falling mine: re-attach to terrain after cooldown expires ────
      if (proj.weapon.behavior === 'mine' && !proj.deployed && proj.detachCooldown <= 0) {
        const px = Math.round(proj.x);
        const py = Math.round(proj.y);
        const checks: [number, number][] = [
          [px, py + 2], [px - 2, py + 2], [px + 2, py + 2],
          [px, py + 3], [px - 1, py], [px + 1, py],
          [px, py - 2], [px - 2, py - 2], [px + 2, py - 2],
          [px, py - 3],
        ];
        for (const [cx, cy] of checks) {
          if (terrain.isSolid(cx, cy)) {
            proj.deployed = true;
            proj.attachX = cx;
            proj.attachY = cy;
            proj.vx = 0;
            proj.vy = 0;
            proj.armTimer = proj.weapon.sticky ? 0 : 700;
            break;
          }
        }
        if (proj.deployed) continue;
      }

      // ── Mine: deployed → check terrain, arm delay, proximity check ────
      if (proj.weapon.behavior === 'mine' && proj.deployed) {
        // All mines: detach if terrain at attachment point is destroyed
        if (!terrain.isSolid(proj.attachX, proj.attachY)) {
          proj.deployed = false;
          proj.hasDeployed = false;
          proj.detachCooldown = 143; // ~10 frames — brief fall before re-attaching
        } else {
          // Count down timers while deployed
          if (proj.armTimer > 0) proj.armTimer -= dt * 1000;
          if (proj.proximityDelay > 0) proj.proximityDelay -= dt * 1000;

          const armed = proj.armTimer <= 0 && proj.proximityDelay <= 0;
          if (armed) {
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
      }

      // ── Owner grace countdown ────────────────────────────────────────
      if (proj.ownerGrace > 0) {
        proj.ownerGrace -= dt * 1000;
      }

      // ── Proximity activation delay ─────────────────────────────────
      if (proj.proximityDelay > 0) {
        proj.proximityDelay -= dt * 1000;
      }

      // ── Mine falling: proximity check while in air ─────────────────
      if (proj.weapon.behavior === 'mine' && !proj.deployed && proj.proximityDelay <= 0 && proj.armTimer <= 0) {
        for (const worm of worms) {
          if (worm.isDead) continue;
          const dist = Math.hypot(proj.x - worm.x, proj.y - worm.y);
          if (dist <= (proj.weapon.mineProximity ?? 20)) {
            proj.active = false;
            proj.hitReason = 'worm';
            onHit(proj, proj.x, proj.y);
            break;
          }
        }
        if (!proj.active) continue;
      }

      // ── Proximity trigger (non-mine weapons with mineProximity) ────
      if (proj.weapon.mineProximity && proj.weapon.behavior !== 'mine' && proj.proximityDelay <= 0) {
        for (const worm of worms) {
          if (worm.isDead) continue;
          const dist = Math.hypot(proj.x - worm.x, proj.y - worm.y);
          if (dist <= proj.weapon.mineProximity) {
            proj.active = false;
            proj.hitReason = 'worm';
            onHit(proj, proj.x, proj.y);
            break;
          }
        }
        if (!proj.active) continue;
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

      // Falling mines (not deployed) always use full gravity regardless of weapon's projectileGravity
      const isFallingMine = proj.weapon.behavior === 'mine' && !proj.deployed && proj.weapon.projectileGravity === 0;
      const grav = isFallingMine ? 1.0 : proj.weapon.projectileGravity;
      proj.vy += GRAVITY * grav * dt;

      // Zimm stuck detection (runs every frame)
      if (proj.weapon.behavior === 'zimm') this.checkZimmStuck(proj);

      // Ground friction for bounce weapons resting on terrain
      if (proj.weapon.behavior === 'bounce' && terrain.isSolid(proj.x, proj.y + 2)) {
        if (Math.abs(proj.vy) < 50) proj.vy = 0;
        proj.vx *= 0.92;
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
        // Skip worm collision for weapons with wormCollide=false (grenades pass through)
        if (proj.weapon.wormCollide === false) {
          // no worm hit check — projectile flies through worms
        } else {
        // Fragments and certain weapons hit ALL worms including owner.
        // ownerGrace: while active, owner is still excluded even for these weapons.
        const hitsAllWorms = proj.weapon.id === 'chiquita_fragment'
          || proj.weapon.id === 'bazooka_fragment'
          || proj.weapon.id === 'cluster_bomblet'
          || proj.weapon.id === 'chiquita_bomblet'
          || proj.weapon.id === 'larpa'
          || proj.weapon.id === 'larpa_trail'
          || proj.weapon.id === 'sticky_mine'
          || proj.weapon.id === 'zimm'
          || proj.weapon.id === 'sticky_mine_fragment';
        for (const worm of worms) {
          if (worm.isDead) continue;
          const isOwner = worm.playerId === proj.ownerId;
          if (isOwner && (!hitsAllWorms || proj.ownerGrace > 0)) continue;
          if (
            Math.abs(tx - worm.x) < worm.width  / 2 + proj.weapon.projectileSize &&
            Math.abs(ty - worm.y) < worm.height / 2 + proj.weapon.projectileSize
          ) {
            // Direct hitDamage (flat, no falloff) — like Liero NObject.hitDamage
            if (proj.weapon.hitDamage) {
              worm.applyDamage(proj.weapon.hitDamage);
            }
            proj.active = false;
            proj.hitReason = 'worm';
            onHit(proj, tx, ty);
            terrainHit = true;
            break;
          }
        }
        if (terrainHit) break;
        } // end wormCollide check

        // ── Terrain hit (skip during grace period or mine detach cooldown) ─
        // Mine cooldown disables terrain collision for normal detach (terrain destroyed).
        // Knockback mines use terrainGrace instead — they must collide with terrain.
        const mineOnCooldown = proj.weapon.behavior === 'mine' && proj.detachCooldown > 0 && proj.terrainGrace <= 0;
        if (terrain.isSolid(tx, ty) && proj.terrainGrace <= 0 && !mineOnCooldown) {
          if (proj.weapon.behavior === 'bounce' && proj.bounceCount < proj.weapon.maxBounces) {
            this.bounceProjectile(proj, dx, dy);
          } else if (proj.weapon.behavior === 'zimm') {
            // Zimm: elastic infinite bounce off terrain, only explodes on worm hit
            this.bounceZimm(proj, dx, dy);
          } else if (proj.weapon.behavior === 'mine' && !proj.deployed && proj.detachCooldown <= 0) {
            // Mine: stop and deploy on terrain contact (blocked during detach cooldown)
            const len = Math.hypot(dx, dy);
            if (len > 0) {
              proj.x -= dx / len * 3;
              proj.y -= dy / len * 3;
            }
            proj.deployed    = true;
            proj.hasDeployed = true;
            proj.armTimer  = proj.weapon.sticky ? 0 : 700; // sticky uses proximityDelay instead
            // Record attachment point — used to detect terrain destruction beneath mine
            proj.attachX = Math.round(tx);
            proj.attachY = Math.round(ty);
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
    if (Math.hypot(proj.vx, proj.vy) < 50) {
      proj.vx = 0;
      proj.vy = 0;
    }
  }

  /** Zimm: elastic (no dampen) infinite bounce — terrain never detonates it. */
  private bounceZimm(proj: Projectile, dx: number, dy: number): void {
    // Reflect velocity
    if (Math.abs(dx) >= Math.abs(dy)) {
      proj.vx = -proj.vx;
      proj.x -= Math.sign(dx) * 3;
    } else {
      proj.vy = -proj.vy;
      proj.y -= Math.sign(dy) * 3;
    }

    // Angle jitter (±~5° base, escalated by stuck detection)
    const speed = Math.hypot(proj.vx, proj.vy);
    const jitter = 0.08 * proj.jitterMult;
    proj.vx += (this.rng.next() * 2 - 1) * jitter * speed;
    proj.vy += (this.rng.next() * 2 - 1) * jitter * speed;
  }

  /** Zimm stuck detection: progressive jitter escalation based on position uniqueness. */
  private checkZimmStuck(proj: Projectile): void {
    // Reset escalation if projectile moved far from last recorded position
    const last = proj.posHistory[proj.posHistory.length - 1];
    if (last && Math.hypot(proj.x - last.x, proj.y - last.y) > 30) {
      proj.jitterMult = 1;
    }

    proj.posHistory.push({ x: proj.x, y: proj.y });
    if (proj.posHistory.length > 20) proj.posHistory.shift();

    if (proj.posHistory.length >= 20) {
      // Count unique positions on a 5px grid
      const seen = new Set<string>();
      for (const p of proj.posHistory) {
        seen.add(`${Math.round(p.x / 5)},${Math.round(p.y / 5)}`);
      }
      const unique = seen.size;

      if (unique < 2) {
        // Truly stuck — random kick + reset
        proj.vx += (this.rng.next() - 0.5) * 200;
        proj.vy += (this.rng.next() - 0.5) * 200;
        proj.jitterMult = 1;
        proj.posHistory.length = 0;
      } else if (unique < 3) {
        proj.jitterMult = 4;
      } else if (unique < 4) {
        proj.jitterMult = 2;
      }
      // unique >= 4: no escalation, jitterMult stays at current value
    }
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
