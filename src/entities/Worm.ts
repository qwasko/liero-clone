import { WORM_WIDTH, WORM_HEIGHT, WORM_MAX_HP } from '../game/constants';

export type WormState = 'idle' | 'moving' | 'airborne' | 'dead';

export class Worm {
  x: number;
  y: number;
  vx: number = 0;
  vy: number = 0;

  hp: number = WORM_MAX_HP;
  state: WormState = 'airborne';
  facingRight: boolean = true;

  readonly width = WORM_WIDTH;
  readonly height = WORM_HEIGHT;
  readonly playerId: 1 | 2;

  constructor(x: number, y: number, playerId: 1 | 2) {
    this.x = x;
    this.y = y;
    this.playerId = playerId;
  }

  get isDead(): boolean {
    return this.state === 'dead' || this.hp <= 0;
  }

  /** Bottom-centre of the worm (feet position). */
  get footX(): number { return this.x; }
  get footY(): number { return this.y + this.height / 2; }

  /** Top-left corner for collision box. */
  get left():   number { return this.x - this.width / 2; }
  get right():  number { return this.x + this.width / 2; }
  get top():    number { return this.y - this.height / 2; }
  get bottom(): number { return this.y + this.height / 2; }

  applyDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.state = 'dead';
    }
  }
}
