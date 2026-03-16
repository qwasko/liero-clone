import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: { winner: number }): void {
    // Dim background
    this.add.rectangle(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000, 0.6);

    const headline = data.winner === 0
      ? 'DRAW!'
      : `Player ${data.winner} Wins!`;

    const headColour = data.winner === 1 ? '#00ff88' : data.winner === 2 ? '#ff4444' : '#ffffff';

    this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40, headline, {
      fontSize: '52px',
      color: headColour,
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30, 'Press ENTER to play again', {
      fontSize: '18px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-ENTER', () => {
      this.scene.start('MenuScene');
    });
  }
}
