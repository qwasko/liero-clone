import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { InputState } from '../input/InputState';
import { TerrainMap } from '../terrain/TerrainMap';
import { GRAVITY } from './constants';

const MAX_ROPE_LENGTH     = 275;
const MIN_ROPE_LENGTH     = 4;    // ~0.25 worm heights — can climb nearly to anchor
const ROPE_CAST_START     = 14;
const LENGTH_SHORTEN_SPEED = 200; // px/s — rate rest length decreases
const LENGTH_EXTEND_SPEED  = 400; // px/s — rate rest length increases
const HOOK_SPEED          = 1000; // px/s

// ── Spring physics constants ─────────────────────────────────────────
const SPRING_K          = 200;  // Hooke constant — sag=gravity/k=3px, settles ~10px from anchor
const RADIAL_DAMPING    = 8;    // damping coefficient — raised to match stiffer spring
const ROPE_REST_LENGTH  = 7;    // ~0.5 worm heights — fixed spring rest length
const MAX_ROPE_PULL_SPEED = 350; // px/s — cap on velocity added by spring per frame

// ── Directional jitter (subtle organic wobble) ──────────────────────
const JITTER_MAX_ANGLE = 0.07;  // ~4° max offset
const JITTER_FREQ1     = 3.0;   // rad/s — slow primary drift
const JITTER_FREQ2     = 7.3;   // rad/s — faster secondary (incommensurate → quasi-random)

interface Rope {
  anchorX: number;
  anchorY: number;
  /** Spring rest length — force pulls worm toward this distance from anchor. */
  restLength: number;
  targetWorm: Worm | null;
}

/** In-flight hook that hasn't attached yet. */
interface RopeHook {
  startX: number;
  startY: number;
  aimX:   number;
  aimY:   number;
  dist:   number;
}

/**
 * Ninja rope with spring/elastic physics.
 *
 * The rope acts like a bungee cord: when the worm is further than the
 * rest length from the anchor a spring force pulls it back (Hooke's law);
 * when closer the rope is slack and gravity dominates.
 *
 * UP/DOWN (while CHANGE held) adjust the rest length, not the worm's
 * position — so shortening makes the spring tighter and lengthening
 * lets the worm drop naturally.
 *
 * Activation  : CHANGE + JUMP  → launches a visible hook projectile
 * Attachment  : hook hits terrain or enemy worm → rope becomes active
 * Miss        : hook reaches max range with no hit → disappears
 * Release     : JUMP alone (while rope attached or hook in flight)
 * Lengthen    : CHANGE + DOWN  (adjusts rest length)
 * Shorten     : CHANGE + UP    (adjusts rest length)
 */
export class RopeSystem {
  private ropes      = new Map<Worm, Rope | null>();
  private hooks      = new Map<Worm, RopeHook | null>();
  private prevJump   = new Map<Worm, boolean>();
  private jitterTime = new Map<Worm, number>();

  registerWorm(worm: Worm): void {
    this.ropes.set(worm, null);
    this.hooks.set(worm, null);
    this.prevJump.set(worm, false);
    this.jitterTime.set(worm, Math.random() * 100); // random phase so worms don't sync
  }

  /** True only when rope is attached and constraint is active. */
  hasRope(worm: Worm): boolean {
    return (this.ropes.get(worm) ?? null) !== null;
  }

  /** True when a hook projectile is in flight (not yet attached). */
  hasHook(worm: Worm): boolean {
    return (this.hooks.get(worm) ?? null) !== null;
  }

  /**
   * Process rope/hook input for one worm.
   * Returns true if a hook was just launched this frame (for audio).
   */
  handleInput(
    worm:  Worm,
    input: InputState,
    dt:    number,
  ): boolean {
    const wasJump  = this.prevJump.get(worm) ?? false;
    const jumpEdge = input.jump && !wasJump;
    this.prevJump.set(worm, input.jump);

    if (worm.isDead) {
      this.ropes.set(worm, null);
      this.hooks.set(worm, null);
      return false;
    }

    const rope = this.ropes.get(worm) ?? null;
    const hook = this.hooks.get(worm) ?? null;

    // ── CHANGE + JUMP → cancel current state, launch new hook ──────────
    if (input.change && jumpEdge) {
      this.ropes.set(worm, null);
      this.hooks.set(worm, null);
      this.launchHook(worm);
      return true;
    }

    // ── JUMP alone → release rope / cancel hook ────────────────────────
    if (jumpEdge && !input.change && (rope || hook)) {
      this.ropes.set(worm, null);
      this.hooks.set(worm, null);
      return false;
    }

    // ── CHANGE + UP/DOWN → adjust rest length while attached ───────────
    if (rope && input.change) {
      if (input.up)   rope.restLength = Math.max(MIN_ROPE_LENGTH, rope.restLength - LENGTH_SHORTEN_SPEED * dt);
      if (input.down)  rope.restLength = Math.min(MAX_ROPE_LENGTH, rope.restLength + LENGTH_EXTEND_SPEED * dt);
    }

    return false;
  }

  private launchHook(worm: Worm): void {
    const aimX = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
    const aimY = Math.sin(worm.aimAngle);
    this.hooks.set(worm, {
      startX: worm.x,
      startY: worm.y,
      aimX, aimY,
      dist: ROPE_CAST_START,
    });
  }

  /**
   * Advance all in-flight hooks. Call once per frame from GameScene.
   */
  updateHooks(
    dt:       number,
    terrain:  TerrainMap,
    allWorms: Worm[],
  ): void {
    for (const [worm, hook] of this.hooks) {
      if (!hook) continue;
      if (worm.isDead) { this.hooks.set(worm, null); continue; }

      const advance = HOOK_SPEED * dt;
      const steps = Math.max(1, Math.ceil(advance));
      const stepSize = advance / steps;

      let attached = false;
      for (let s = 0; s < steps; s++) {
        hook.dist += stepSize;
        const hx = hook.startX + hook.aimX * hook.dist;
        const hy = hook.startY + hook.aimY * hook.dist;

        // Check enemy worm hit
        for (const other of allWorms) {
          if (other === worm || other.isDead) continue;
          if (
            Math.abs(hx - other.x) < other.width  / 2 &&
            Math.abs(hy - other.y) < other.height / 2
          ) {
            this.ropes.set(worm, { anchorX: hx, anchorY: hy, restLength: ROPE_REST_LENGTH, targetWorm: other });
            this.hooks.set(worm, null);
            attached = true;
            break;
          }
        }
        if (attached) break;

        // Check terrain hit
        if (terrain.isSolid(hx, hy)) {
          this.ropes.set(worm, { anchorX: hx, anchorY: hy, restLength: ROPE_REST_LENGTH, targetWorm: null });
          this.hooks.set(worm, null);
          attached = true;
          break;
        }
      }

      // Max range reached — miss
      if (!attached && hook.dist >= MAX_ROPE_LENGTH) {
        this.hooks.set(worm, null);
      }
    }
  }

  applyConstraint(worm: Worm, dt: number): void {
    const rope = this.ropes.get(worm) ?? null;
    if (!rope || worm.isDead) return;

    if (rope.targetWorm) {
      this.applyWormConstraint(worm, rope, dt);
    } else {
      this.applyTerrainConstraint(worm, rope, dt);
    }
  }

  /**
   * Spring/elastic constraint for terrain-anchored rope.
   *
   * When the worm is further than the rest length, a spring force
   * (Hooke's law) pulls it toward the anchor.  Radial velocity is
   * damped to prevent infinite oscillation while keeping the elastic
   * bounce feel.  When closer, the rope is slack — no forces applied.
   */
  private applyTerrainConstraint(worm: Worm, rope: Rope, dt: number): void {
    const dx   = worm.x - rope.anchorX;
    const dy   = worm.y - rope.anchorY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const nx = dx / dist; // unit vector: anchor → worm
    const ny = dy / dist;

    const extension = dist - rope.restLength;

    // ── Debug: log rope physics each frame ─────────────────────────────
    const springForce = extension > 0 ? SPRING_K * extension : 0;
    console.log(
      `[rope] rest=${rope.restLength.toFixed(1)} dist=${dist.toFixed(1)} spring=${springForce.toFixed(0)} gravity=${GRAVITY}`,
    );

    if (extension > 0) {
      // ── Directional jitter: rotate spring direction by smooth offset ─
      const jt = this.jitterTime.get(worm) ?? 0;
      this.jitterTime.set(worm, jt + dt);
      const jitter = (Math.sin(jt * JITTER_FREQ1) * 0.6 + Math.sin(jt * JITTER_FREQ2) * 0.4) * JITTER_MAX_ANGLE;
      const cosJ = Math.cos(jitter);
      const sinJ = Math.sin(jitter);
      const jnx = nx * cosJ - ny * sinJ; // jittered pull direction
      const jny = nx * sinJ + ny * cosJ;

      // ── Spring force: pull worm toward anchor (with jitter), capped ─
      const springAccel = Math.min(SPRING_K * extension, MAX_ROPE_PULL_SPEED / dt);
      worm.vx -= jnx * springAccel * dt;
      worm.vy -= jny * springAccel * dt;

      // ── Radial damping: oppose true radial velocity (no jitter) ───
      const radialVel = worm.vx * nx + worm.vy * ny;
      const dampAccel = RADIAL_DAMPING * radialVel;
      worm.vx -= nx * dampAccel * dt;
      worm.vy -= ny * dampAccel * dt;

      // ── Hard clamp at max rope range (safety for extreme speeds) ──
      if (dist > MAX_ROPE_LENGTH) {
        worm.x = rope.anchorX + nx * MAX_ROPE_LENGTH;
        worm.y = rope.anchorY + ny * MAX_ROPE_LENGTH;
        // Kill outward radial velocity
        const rv = worm.vx * nx + worm.vy * ny;
        if (rv > 0) {
          worm.vx -= rv * nx;
          worm.vy -= rv * ny;
        }
      }
    }
  }

  /**
   * Spring constraint for worm-to-worm rope (hook attached to enemy).
   * Same spring model, forces split equally between both worms.
   */
  private applyWormConstraint(shooter: Worm, rope: Rope, dt: number): void {
    const target = rope.targetWorm!;
    if (target.isDead) { this.ropes.set(shooter, null); return; }

    const dx   = shooter.x - target.x;
    const dy   = shooter.y - target.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;

    const extension = dist - rope.restLength;

    if (extension > 0) {
      // ── Spring force (split 50/50), capped ────────────────────────
      const halfSpring = Math.min(SPRING_K * extension, MAX_ROPE_PULL_SPEED / dt) * 0.5;
      shooter.vx -= nx * halfSpring * dt;
      shooter.vy -= ny * halfSpring * dt;
      target.vx  += nx * halfSpring * dt;
      target.vy  += ny * halfSpring * dt;

      // ── Radial damping on relative velocity ─────────────────────
      const relRadial = (shooter.vx - target.vx) * nx + (shooter.vy - target.vy) * ny;
      const halfDamp = RADIAL_DAMPING * relRadial * 0.5;
      shooter.vx -= nx * halfDamp * dt;
      shooter.vy -= ny * halfDamp * dt;
      target.vx  += nx * halfDamp * dt;
      target.vy  += ny * halfDamp * dt;

      // ── Hard clamp ──────────────────────────────────────────────
      if (dist > MAX_ROPE_LENGTH) {
        const half = (dist - MAX_ROPE_LENGTH) * 0.5;
        shooter.x -= nx * half;
        shooter.y -= ny * half;
        target.x  += nx * half;
        target.y  += ny * half;

        const rv = (shooter.vx - target.vx) * nx + (shooter.vy - target.vy) * ny;
        if (rv > 0) {
          shooter.vx -= rv * 0.5 * nx;
          shooter.vy -= rv * 0.5 * ny;
          target.vx  += rv * 0.5 * nx;
          target.vy  += rv * 0.5 * ny;
        }
      }
    }
  }

  /**
   * Release any rope whose terrain anchor has been destroyed.
   */
  checkAnchorDestroyed(terrain: TerrainMap): void {
    this.ropes.forEach((rope, worm) => {
      if (!rope || rope.targetWorm) return;
      if (!terrain.isSolid(rope.anchorX, rope.anchorY)) {
        this.ropes.set(worm, null);
      }
    });
  }

  releaseOnDeath(worm: Worm): void {
    if (worm.isDead) {
      this.ropes.set(worm, null);
      this.hooks.set(worm, null);
    }
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    // Draw attached ropes
    this.ropes.forEach((rope, worm) => {
      if (!rope || worm.isDead) return;

      const ax = rope.targetWorm ? rope.targetWorm.x : rope.anchorX;
      const ay = rope.targetWorm ? rope.targetWorm.y : rope.anchorY;

      const color = rope.targetWorm ? 0xff8800 : 0xdddddd;
      g.lineStyle(1, color, 0.9);
      g.beginPath();
      g.moveTo(worm.x, worm.y);
      g.lineTo(ax, ay);
      g.strokePath();

      if (!rope.targetWorm) {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(ax, ay, 3);
      }
    });

    // Draw in-flight hooks
    this.hooks.forEach((hook, worm) => {
      if (!hook || worm.isDead) return;

      const hx = hook.startX + hook.aimX * hook.dist;
      const hy = hook.startY + hook.aimY * hook.dist;

      g.lineStyle(1, 0x888888, 0.5);
      g.beginPath();
      g.moveTo(worm.x, worm.y);
      g.lineTo(hx, hy);
      g.strokePath();

      g.fillStyle(0xffffff, 1);
      g.fillCircle(hx, hy, 2);
    });
  }
}
