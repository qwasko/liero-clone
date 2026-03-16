import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';

function fmt(secs: number): string {
  const s = Math.floor(secs);
  const ms = Math.floor((secs - s) * 10);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}.${ms}`;
}

/**
 * Post-match screen for Game of Tag mode.
 * Shows each player's total time as "it" and declares the winner.
 */
export class TagOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TagOverScene' });
  }

  create(data: { winner: 0 | 1 | 2; times: [number, number] }): void {
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;

    this.add.rectangle(cx, cy, CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000, 0.7);

    const headline = data.winner === 0
      ? 'DRAW!'
      : `Player ${data.winner} Wins!`;

    const headColour = data.winner === 1 ? '#00ff88' : data.winner === 2 ? '#ff4444' : '#ffffff';

    this.add.text(cx, cy - 100, headline, {
      fontSize: '52px',
      color: headColour,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 30, 'GAME OF TAG — Time as "it"', {
      fontSize: '16px',
      color: '#ffaa00',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const [t1, t2] = data.times;

    this.add.text(cx, cy + 20, `P1: ${fmt(t1)}`, {
      fontSize: '22px',
      color: '#00ff88',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 58, `P2: ${fmt(t2)}`, {
      fontSize: '22px',
      color: '#ff4444',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 115, '(less time = better)', {
      fontSize: '12px',
      color: '#666666',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 150, 'Press ENTER to play again', {
      fontSize: '18px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-ENTER', () => {
      this.scene.start('MenuScene');
    });
  }
}
