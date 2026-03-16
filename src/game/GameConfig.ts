import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { GameOverScene } from '../scenes/GameOverScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#1a1a2e',
  physics: {
    // Phaser arcade physics is intentionally not used for terrain —
    // custom physics in PhysicsSystem handles that.
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, GameScene, GameOverScene],
};
