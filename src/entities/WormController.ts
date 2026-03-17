import { Worm } from './Worm';
import { InputState } from '../input/InputState';
import { MOVE_SPEED, JUMP_VELOCITY } from '../game/constants';

/** Aim rotation speed in radians/s — full 180° arc in ~1 second. */
const AIM_SPEED = Math.PI;

/**
 * Maximum downward aim angle: 60° below horizontal ≈ 30° from straight down.
 * The ~60° dead cone directly below is always blocked.
 */
const AIM_MAX = Math.PI / 3;

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

    // ── Horizontal movement — blocked while CHANGE is held ──────────────
    if (!input.change) {
      if (input.left) {
        w.vx = -MOVE_SPEED;
        w.facingRight = false;
      } else if (input.right) {
        w.vx = MOVE_SPEED;
        w.facingRight = true;
      } else {
        w.vx = 0;
      }
    } else {
      w.vx = 0;
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
