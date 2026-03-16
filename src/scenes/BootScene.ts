import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Assets will be loaded here in later phases.
    // For Phase 1 we use only programmatically drawn shapes.
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
