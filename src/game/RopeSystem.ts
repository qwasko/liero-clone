import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { InputState } from '../input/InputState';
import { TerrainMap } from '../terrain/TerrainMap';

const MAX_ROPE_LENGTH     = 220;
const MIN_ROPE_LENGTH     = 20;
const ROPE_CAST_START     = 14;
const LENGTH_SHORTEN_SPEED = 400; // px/s
const LENGTH_EXTEND_SPEED  = 400; // px/s
const HOOK_SPEED          = 1000; // px/s — visible but fast

interface Rope {
  anchorX: number;
  anchorY: number;
  length:  number;
  targetWorm: Worm | null;
}

/** In-flight hook that hasn't attached yet. */
interface RopeHook {
  startX: number;
  startY: number;
  aimX:   number;
  aimY:   number;
  dist:   number; // how far the hook has traveled from start
}

/**
 * Ninja rope — always available, independent of the weapon loadout.
 *
 * Activation  : CHANGE + JUMP  → launches a visible hook projectile
 * Attachment  : hook hits terrain or enemy worm → rope becomes active
 * Miss        : hook reaches max range with no hit → disappears
 * Release     : JUMP alone (while rope attached or hook in flight)
 * Lengthen    : CHANGE + DOWN  (while attached, fast arcade speed)
 * Shorten     : CHANGE + UP    (while attached)
 */
export class RopeSystem {
  private ropes    = new Map<Worm, Rope | null>();
  private hooks    = new Map<Worm, RopeHook | null>();
  private prevJump = new Map<Worm, boolean>();

  registerWorm(worm: Worm): void {
    this.ropes.set(worm, null);
    this.hooks.set(worm, null);
    this.prevJump.set(worm, false);
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

    // ── CHANGE + UP/DOWN → adjust rope length while attached ────────────
    if (rope && input.change) {
      if (input.up)   rope.length = Math.max(MIN_ROPE_LENGTH, rope.length - LENGTH_SHORTEN_SPEED * dt);
      if (input.down) rope.length = Math.min(MAX_ROPE_LENGTH, rope.length + LENGTH_EXTEND_SPEED * dt);
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
   * Returns a set of worms whose hooks just attached (for potential audio).
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
      // Step pixel by pixel to avoid tunneling
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
            const len = Math.hypot(worm.x - other.x, worm.y - other.y);
            this.ropes.set(worm, { anchorX: hx, anchorY: hy, length: len, targetWorm: other });
            this.hooks.set(worm, null);
            attached = true;
            break;
          }
        }
        if (attached) break;

        // Check terrain hit
        if (terrain.isSolid(hx, hy)) {
          const len = Math.hypot(worm.x - hx, worm.y - hy);
          this.ropes.set(worm, { anchorX: hx, anchorY: hy, length: len, targetWorm: null });
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

  applyConstraint(worm: Worm): void {
    const rope = this.ropes.get(worm) ?? null;
    if (!rope || worm.isDead) return;

    if (rope.targetWorm) {
      this.applyWormConstraint(worm, rope);
    } else {
      this.applyTerrainConstraint(worm, rope);
    }
  }

  private applyTerrainConstraint(worm: Worm, rope: Rope): void {
    const dx   = worm.x - rope.anchorX;
    const dy   = worm.y - rope.anchorY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;

    const radial = worm.vx * nx + worm.vy * ny;
    if (radial > 0) { worm.vx -= radial * nx; worm.vy -= radial * ny; }

    if (dist > rope.length) {
      worm.x = rope.anchorX + nx * rope.length;
      worm.y = rope.anchorY + ny * rope.length;
    }
  }

  private applyWormConstraint(shooter: Worm, rope: Rope): void {
    const target = rope.targetWorm!;
    if (target.isDead) { this.ropes.set(shooter, null); return; }

    const dx   = shooter.x - target.x;
    const dy   = shooter.y - target.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;

    const relVelRadial = (shooter.vx - target.vx) * nx + (shooter.vy - target.vy) * ny;
    if (relVelRadial > 0) {
      shooter.vx -= relVelRadial * 0.5 * nx;
      shooter.vy -= relVelRadial * 0.5 * ny;
      target.vx  += relVelRadial * 0.5 * nx;
      target.vy  += relVelRadial * 0.5 * ny;
    }

    if (dist > rope.length) {
      const half = (dist - rope.length) * 0.5;
      shooter.x -= nx * half;
      shooter.y -= ny * half;
      target.x  += nx * half;
      target.y  += ny * half;
    }
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

      // Thin line from worm to hook
      g.lineStyle(1, 0x888888, 0.5);
      g.beginPath();
      g.moveTo(worm.x, worm.y);
      g.lineTo(hx, hy);
      g.strokePath();

      // Hook head — bright white dot
      g.fillStyle(0xffffff, 1);
      g.fillCircle(hx, hy, 2);
    });
  }
}
