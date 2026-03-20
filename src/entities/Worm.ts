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

  /** Aim angle in radians. 0 = horizontal, -π/2 = straight up, +π/2 = straight down. */
  aimAngle: number = 0;

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
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    console.log(`[worm damage] P${this.playerId} hp_before=${before} dmg=${amount} hp_after=${this.hp}`);
    if (this.hp <= 0) {
      this.state = 'dead';
    }
  }
}
