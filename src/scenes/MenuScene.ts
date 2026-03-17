import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { LEVEL_PRESETS } from '../game/LevelPreset';

/**
 * Mode + level selection screen.
 *
 * UP/DOWN  — navigate mode  (Normal Deathmatch / Game of Tag)
 * LEFT/RIGHT — navigate level preset (Normal / Large Open / Tiny)
 * ENTER    — start game
 */
export class MenuScene extends Phaser.Scene {
  private selectedMode  = 0; // 0 = normal, 1 = tag
  private selectedLevel = 0; // index into LEVEL_PRESETS

  private modeTexts!:  Phaser.GameObjects.Text[];
  private levelTexts!: Phaser.GameObjects.Text[];

  private readonly MODES = [
    { label: 'Normal Deathmatch', color: '#00ff88' },
    { label: 'Game of Tag',       color: '#ffaa00' },
  ];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Reset selection on each visit
    this.selectedMode  = 0;
    this.selectedLevel = 0;

    const cx = CANVAS_WIDTH  / 2;
    const cy = CANVAS_HEIGHT / 2;

    this.add.text(cx, cy - 140, 'LIERO', {
      fontSize: '56px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // ── Mode selection ───────────────────────────────────────────────
    this.add.text(cx, cy - 60, 'MODE  (UP/DOWN)', {
      fontSize: '13px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.modeTexts = this.MODES.map((m, i) =>
      this.add.text(cx, cy - 30 + i * 32, m.label, {
        fontSize: '20px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5),
    );

    // ── Level selection ──────────────────────────────────────────────
    this.add.text(cx, cy + 60, 'LEVEL  (LEFT/RIGHT)', {
      fontSize: '13px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.levelTexts = LEVEL_PRESETS.map((p, i) =>
      this.add.text(cx - 180 + i * 180, cy + 90, p.name, {
        fontSize: '18px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5),
    );

    this.add.text(cx, cy + 155, 'ENTER to start', {
      fontSize: '14px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 185, 'P1: Arrows+Shift/Ctrl   P2: WASD+Space/F', {
      fontSize: '11px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.refreshHighlights();

    // ── Input ────────────────────────────────────────────────────────
    const keys = this.input.keyboard!;

    keys.on('keydown-UP',    () => { this.selectedMode = (this.selectedMode + this.MODES.length - 1) % this.MODES.length; this.refreshHighlights(); });
    keys.on('keydown-DOWN',  () => { this.selectedMode = (this.selectedMode + 1) % this.MODES.length; this.refreshHighlights(); });
    keys.on('keydown-LEFT',  () => { this.selectedLevel = (this.selectedLevel + LEVEL_PRESETS.length - 1) % LEVEL_PRESETS.length; this.refreshHighlights(); });
    keys.on('keydown-RIGHT', () => { this.selectedLevel = (this.selectedLevel + 1) % LEVEL_PRESETS.length; this.refreshHighlights(); });
    keys.once('keydown-ENTER', () => this.startGame());
  }

  private refreshHighlights(): void {
    this.modeTexts.forEach((t, i) => {
      const active = i === this.selectedMode;
      t.setColor(active ? this.MODES[i].color : '#444444');
      t.setText((active ? '▶ ' : '  ') + this.MODES[i].label);
    });

    this.levelTexts.forEach((t, i) => {
      const active = i === this.selectedLevel;
      t.setColor(active ? '#ffffff' : '#444444');
      t.setStyle({ fontSize: active ? '20px' : '16px', color: active ? '#ffffff' : '#444444', fontFamily: 'monospace' });
    });
  }

  private startGame(): void {
    const mode  = this.selectedMode === 0 ? 'normal' : 'tag';
    const level = LEVEL_PRESETS[this.selectedLevel];
    this.scene.start('GameScene', { mode, level });
  }
}
