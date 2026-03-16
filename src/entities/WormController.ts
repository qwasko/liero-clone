import { Worm } from './Worm';
import { InputState } from '../input/InputState';
import { MOVE_SPEED, JUMP_VELOCITY } from '../game/constants';

/**
 * Translates an InputState into velocity changes on a Worm.
 * Swapping this class out (for an AI controller, network controller, etc.)
 * is the intended extension point for future game modes.
 */
export class WormController {
  private worm: Worm;

  constructor(worm: Worm) {
    this.worm = worm;
  }

  update(input: InputState): void {
    const w = this.worm;
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

    // Jump — only when grounded
    if (input.jump && w.state !== 'airborne') {
      w.vy = JUMP_VELOCITY;
      w.state = 'airborne';
    }
  }
}
