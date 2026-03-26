import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { GameScene } from '../scenes/GameScene';
import { GameOverScene } from '../scenes/GameOverScene';
import { TagOverScene } from '../scenes/TagOverScene';
import { SettingsScene } from '../scenes/SettingsScene';
import { ControlsScene } from '../scenes/ControlsScene';
import { LobbyScene } from '../scenes/LobbyScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    // Phaser arcade physics is intentionally not used for terrain —
    // custom physics in PhysicsSystem handles that.
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, MenuScene, SettingsScene, ControlsScene, LobbyScene, GameScene, GameOverScene, TagOverScene],
};
