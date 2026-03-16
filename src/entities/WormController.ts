import { Worm } from './Worm';
import { InputState } from '../input/InputState';
import { MOVE_SPEED, JUMP_VELOCITY } from '../game/constants';

/** Aim rotation speed: full 180° arc in ~1 second. */
const AIM_SPEED = Math.PI; // radians/s

export class WormController {
  private worm: Worm;
  private prevJump: boolean = false;

  /** Set by GameScene when a jump sound should play (rising edge detected here). */
  justJumped: boolean = false;

  constructor(worm: Worm) {
    this.worm = worm;
  }

  update(input: InputState, dt: number): void {
    const w = this.worm;
    this.justJumped = false;
    if (w.isDead) return;

    // Horizontal movement
    if (input.left) {
      w.vx = -MOVE_SPEED;
      w.facingRight = false;
    } else if (input.right) {
      w.vx = MOVE_SPEED;
      w.facingRight = true;
    } else {
      w.vx = 0;
    }

    // Jump — only when grounded, rising edge
    const jumpPressed = input.jump && !this.prevJump;
    if (jumpPressed && w.state !== 'airborne') {
      w.vy = JUMP_VELOCITY;
      w.state = 'airborne';
      this.justJumped = true;
    }
    this.prevJump = input.jump;

    // Aim angle (up = more negative, down = more positive)
    if (input.up) {
      w.aimAngle = Math.max(-Math.PI / 2, w.aimAngle - AIM_SPEED * dt);
    } else if (input.down) {
      w.aimAngle = Math.min(Math.PI / 2, w.aimAngle + AIM_SPEED * dt);
    }
  }
}
