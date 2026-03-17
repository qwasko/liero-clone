import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { InputState } from '../input/InputState';
import { TerrainMap } from '../terrain/TerrainMap';

const MAX_ROPE_LENGTH     = 220;
const MIN_ROPE_LENGTH     = 20;
const ROPE_CAST_START     = 14;
const LENGTH_ADJUST_SPEED = 70; // px/s

interface Rope {
  /** Terrain anchor — used when targetWorm is null. */
  anchorX: number;
  anchorY: number;
  length:  number;
  /** Set when rope is latched to an enemy worm rather than terrain. */
  targetWorm: Worm | null;
}

/**
 * Ninja rope — always available, independent of the weapon loadout.
 *
 * Activation  : CHANGE + JUMP  (releases existing rope first if attached)
 * Release     : JUMP alone     (while rope is attached)
 * Lengthen    : CHANGE + DOWN  (while attached)
 * Shorten     : CHANGE + UP    (while attached)
 * Fire weapon : normal FIRE    (works while on rope, as long as CHANGE is NOT held)
 * Weapons     : CHANGE + LEFT/RIGHT cycles weapons even while on rope (GameScene handles)
 */
export class RopeSystem {
  private ropes    = new Map<Worm, Rope | null>();
  private prevJump = new Map<Worm, boolean>();

  registerWorm(worm: Worm): void {
    this.ropes.set(worm, null);
    this.prevJump.set(worm, false);
  }

  hasRope(worm: Worm): boolean {
    return (this.ropes.get(worm) ?? null) !== null;
  }

  /**
   * Process rope input for one worm.
   * Returns true if a rope was just fired this frame (for audio).
   */
  handleInput(
    worm:     Worm,
    input:    InputState,
    terrain:  TerrainMap,
    allWorms: Worm[],
    dt:       number,
  ): boolean {
    const wasJump  = this.prevJump.get(worm) ?? false;
    const jumpEdge = input.jump && !wasJump;
    this.prevJump.set(worm, input.jump);

    if (worm.isDead) { this.ropes.set(worm, null); return false; }

    const rope = this.ropes.get(worm) ?? null;

    // ── CHANGE + JUMP → release existing rope (if any) then fire new one ──
    if (input.change && jumpEdge) {
      if (rope) this.ropes.set(worm, null);
      return this.shoot(worm, terrain, allWorms);
    }

    // ── JUMP alone → release rope ──────────────────────────────────────
    if (jumpEdge && !input.change && rope) {
      this.ropes.set(worm, null);
      return false;
    }

    // ── CHANGE + UP/DOWN → adjust rope length while attached ────────────
    if (rope && input.change) {
      if (input.up)   rope.length = Math.max(MIN_ROPE_LENGTH, rope.length - LENGTH_ADJUST_SPEED * dt);
      if (input.down) rope.length = Math.min(MAX_ROPE_LENGTH, rope.length + LENGTH_ADJUST_SPEED * dt);
    }

    return false;
  }

  private shoot(worm: Worm, terrain: TerrainMap, allWorms: Worm[]): boolean {
    const aimX = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
    const aimY = Math.sin(worm.aimAngle);

    for (let i = ROPE_CAST_START; i <= MAX_ROPE_LENGTH; i++) {
      const rx = worm.x + aimX * i;
      const ry = worm.y + aimY * i;

      // Check enemy worm hit before terrain
      for (const other of allWorms) {
        if (other === worm || other.isDead) continue;
        if (
          Math.abs(rx - other.x) < other.width  / 2 &&
          Math.abs(ry - other.y) < other.height / 2
        ) {
          this.ropes.set(worm, { anchorX: rx, anchorY: ry, length: i, targetWorm: other });
          return true;
        }
      }

      if (terrain.isSolid(rx, ry)) {
        this.ropes.set(worm, { anchorX: rx, anchorY: ry, length: i, targetWorm: null });
        return true;
      }
    }
    return false;
  }

  /**
   * Apply pendulum / drag constraint after PhysicsSystem has integrated worms.
   * Must be called once per worm per frame.
   */
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

    // Release if target died
    if (target.isDead) { this.ropes.set(shooter, null); return; }

    const dx   = shooter.x - target.x;
    const dy   = shooter.y - target.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    const nx = dx / dist;
    const ny = dy / dist;

    // Remove outward relative velocity
    const relVelRadial = (shooter.vx - target.vx) * nx + (shooter.vy - target.vy) * ny;
    if (relVelRadial > 0) {
      shooter.vx -= relVelRadial * 0.5 * nx;
      shooter.vy -= relVelRadial * 0.5 * ny;
      target.vx  += relVelRadial * 0.5 * nx;
      target.vy  += relVelRadial * 0.5 * ny;
    }

    // Position correction split equally between both worms
    if (dist > rope.length) {
      const half = (dist - rope.length) * 0.5;
      shooter.x -= nx * half;
      shooter.y -= ny * half;
      target.x  += nx * half;
      target.y  += ny * half;
    }
  }

  releaseOnDeath(worm: Worm): void {
    if (worm.isDead) this.ropes.set(worm, null);
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    this.ropes.forEach((rope, worm) => {
      if (!rope || worm.isDead) return;

      const ax = rope.targetWorm ? rope.targetWorm.x : rope.anchorX;
      const ay = rope.targetWorm ? rope.targetWorm.y : rope.anchorY;

      // Worm-latched rope is orange; terrain rope is grey
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
  }
}
