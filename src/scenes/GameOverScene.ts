import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: { winner: number }): void {
    this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40, `Player ${data.winner} Wins!`, {
      fontSize: '48px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30, 'Press ENTER to play again', {
      fontSize: '20px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-ENTER', () => {
      this.scene.start('GameScene');
    });
  }
}
