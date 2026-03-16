import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';

/**
 * Simple mode-selection screen shown before each match.
 * Press 1 for Normal deathmatch, press 2 for Game of Tag.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;

    this.add.text(cx, cy - 100, 'LIERO', {
      fontSize: '56px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy - 30, 'Select Mode', {
      fontSize: '20px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 30, '[1]  Normal Deathmatch', {
      fontSize: '18px',
      color: '#00ff88',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 70, '[2]  Game of Tag', {
      fontSize: '18px',
      color: '#ffaa00',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 130, 'P1: Arrows + Shift/Ctrl   P2: WASD + Space/F', {
      fontSize: '11px',
      color: '#555555',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const keys = this.input.keyboard!;

    keys.once('keydown-ONE', () => {
      this.scene.start('GameScene', { mode: 'normal' });
    });
    keys.once('keydown-TWO', () => {
      this.scene.start('GameScene', { mode: 'tag' });
    });
  }
}
