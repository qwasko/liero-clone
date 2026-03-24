import { Worm } from './Worm';
import { InputState } from '../input/InputState';
import { MOVE_SPEED, JUMP_VELOCITY } from '../game/constants';

/** Aim rotation speed in radians/s — full 180° arc in ~1 second. */
const AIM_SPEED = Math.PI;

/** Per-second decay rate for horizontal velocity when airborne with no input. */
const AIR_FRICTION = 3.0;

/**
 * Maximum downward aim angle: 60° below horizontal ≈ 30° from straight down.
 * The ~60° dead cone directly below is always blocked.
 */
const AIM_MAX = Math.PI / 3;

/**
 * Horizontal acceleration applied per second while LEFT/RIGHT is held on a rope.
 * This adds angular momentum for pendulum swing rather than forcing a fixed speed.
 * Gravity (600 px/s²) naturally accelerates the swing at the bottom of the arc.
 */
const SWING_IMPULSE = 200; // px/s²

export class WormController {
  private worm: Worm;
  private prevJump: boolean = false;

  /** Set true for one frame when a regular jump fires; used by GameScene for audio. */
  justJumped: boolean = false;

  constructor(worm: Worm) {
    this.worm = worm;
  }

  /**
   * @param input     - this frame's input state
   * @param dt        - delta time in seconds
   * @param isOnRope  - true when the worm is currently attached to a ninja rope
   */
  update(input: InputState, dt: number, isOnRope: boolean): void {
    const w = this.worm;
    this.justJumped = false;
    if (w.isDead) return;

    // When both LEFT and RIGHT are pressed simultaneously the player is
    // triggering a dig (hold direction + tap opposite).  In that case we
    // must NOT change vx or facingRight — the tap is a dig trigger only.
    const bothHoriz = input.left && input.right;

    if (isOnRope) {
      // ── On rope: accumulate swing impulse, never zero vx ─────────────
      if (!input.change && !bothHoriz) {
        if (input.left) {
          w.vx -= SWING_IMPULSE * dt;
          w.facingRight = false;
        } else if (input.right) {
          w.vx += SWING_IMPULSE * dt;
          w.facingRight = true;
        }
        // No else — intentionally preserve momentum when no key pressed
      }
      // bothHoriz / CHANGE held: don't touch vx so pendulum continues
    } else {
      // ── Normal movement — blocked while CHANGE is held ────────────────
      if (!input.change && !bothHoriz) {
        if (input.left) {
          w.vx = -MOVE_SPEED;
          w.facingRight = false;
        } else if (input.right) {
          w.vx = MOVE_SPEED;
          w.facingRight = true;
        } else if (w.state === 'airborne') {
          // Airborne with no input: preserve momentum (knockback/recoil)
          // Apply air friction so it decays naturally (~95% gone in 1s)
          w.vx *= Math.max(0, 1 - AIR_FRICTION * dt);
          if (Math.abs(w.vx) < 1) w.vx = 0;
        } else {
          w.vx = 0;
        }
      } else if (!bothHoriz) {
        // CHANGE held, no dig — preserve airborne momentum, stop if grounded
        if (w.state === 'airborne') {
          w.vx *= Math.max(0, 1 - AIR_FRICTION * dt);
          if (Math.abs(w.vx) < 1) w.vx = 0;
        } else {
          w.vx = 0;
        }
      }
      // bothHoriz on ground: keep current vx (worm continues held direction)
    }

    // ── Regular jump — blocked while CHANGE held or while on rope ────────
    // (CHANGE+JUMP fires rope; JUMP-on-rope releases rope — both handled in GameScene)
    const jumpEdge = input.jump && !this.prevJump;
    if (jumpEdge && !input.change && !isOnRope && w.state !== 'airborne') {
      w.vy = JUMP_VELOCITY;
      w.state = 'airborne';
      this.justJumped = true;
    }
    this.prevJump = input.jump;

    // ── Aim angle — always responds to UP/DOWN ───────────────────────────
    // (UP/DOWN also adjust rope length in RopeSystem, but that runs separately)
    if (input.up) {
      w.aimAngle = Math.max(-Math.PI / 2, w.aimAngle - AIM_SPEED * dt);
    } else if (input.down) {
      w.aimAngle = Math.min(AIM_MAX, w.aimAngle + AIM_SPEED * dt);
    }
  }
}
