import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { LEVEL_PRESETS } from '../game/LevelPreset';

/**
 * Mode + level + opponent selection screen.
 *
 * UP/DOWN     — navigate mode  (Normal Deathmatch / Game of Tag)
 * LEFT/RIGHT  — navigate level preset
 * TAB         — toggle opponent (2P Local / vs AI)
 * 1/2/3       — AI difficulty (when vs AI selected)
 * ENTER       — start game
 */
export class MenuScene extends Phaser.Scene {
  private selectedMode  = 0; // 0 = normal, 1 = tag
  private selectedLevel = 0; // index into LEVEL_PRESETS
  private vsAI          = false;
  private aiDifficulty: 'easy' | 'medium' | 'hard' = 'medium';

  private modeTexts!:  Phaser.GameObjects.Text[];
  private levelTexts!: Phaser.GameObjects.Text[];
  private opponentText!: Phaser.GameObjects.Text;
  private difficultyTexts!: Phaser.GameObjects.Text[];
  private diffHint!: Phaser.GameObjects.Text;

  private readonly MODES = [
    { label: 'Normal Deathmatch', color: '#00ff88' },
    { label: 'Game of Tag',       color: '#ffaa00' },
  ];

  private readonly DIFFICULTIES: { key: 'easy' | 'medium' | 'hard'; label: string; color: string }[] = [
    { key: 'easy',   label: '1 Easy',   color: '#44cc44' },
    { key: 'medium', label: '2 Medium', color: '#cccc44' },
    { key: 'hard',   label: '3 Hard',   color: '#cc4444' },
  ];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Reset selection on each visit
    this.selectedMode  = 0;
    this.selectedLevel = 0;
    this.vsAI          = false;
    this.aiDifficulty  = 'medium';

    const cx = CANVAS_WIDTH  / 2;
    const cy = CANVAS_HEIGHT / 2;

    this.add.text(cx, cy - 160, 'LIERO', {
      fontSize: '56px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // ── Mode selection ───────────────────────────────────────────────
    this.add.text(cx, cy - 80, 'MODE  (UP/DOWN)', {
      fontSize: '13px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.modeTexts = this.MODES.map((m, i) =>
      this.add.text(cx, cy - 50 + i * 32, m.label, {
        fontSize: '20px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5),
    );

    // ── Opponent selection ─────────────────────────────────────────────
    this.opponentText = this.add.text(cx, cy + 30, '', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 50, 'TAB to toggle', {
      fontSize: '11px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // ── AI Difficulty (shown only when vs AI) ──────────────────────────
    this.diffHint = this.add.text(cx, cy + 70, 'DIFFICULTY  (1/2/3)', {
      fontSize: '11px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.difficultyTexts = this.DIFFICULTIES.map((d, i) =>
      this.add.text(cx - 120 + i * 120, cy + 92, d.label, {
        fontSize: '16px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5),
    );

    // ── Level selection ──────────────────────────────────────────────
    this.add.text(cx, cy + 125, 'LEVEL  (LEFT/RIGHT)', {
      fontSize: '13px', color: '#666666', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.levelTexts = LEVEL_PRESETS.map((p, i) =>
      this.add.text(cx - 180 + i * 180, cy + 150, p.name, {
        fontSize: '18px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5),
    );

    this.add.text(cx, cy + 195, 'ENTER to start', {
      fontSize: '14px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 220, 'P1: Arrows+Shift/Ctrl   P2: WASD+Space/F', {
      fontSize: '11px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.refreshHighlights();

    // ── Input ────────────────────────────────────────────────────────
    const keys = this.input.keyboard!;

    keys.on('keydown-UP',    () => { this.selectedMode = (this.selectedMode + this.MODES.length - 1) % this.MODES.length; this.refreshHighlights(); });
    keys.on('keydown-DOWN',  () => { this.selectedMode = (this.selectedMode + 1) % this.MODES.length; this.refreshHighlights(); });
    keys.on('keydown-LEFT',  () => { this.selectedLevel = (this.selectedLevel + LEVEL_PRESETS.length - 1) % LEVEL_PRESETS.length; this.refreshHighlights(); });
    keys.on('keydown-RIGHT', () => { this.selectedLevel = (this.selectedLevel + 1) % LEVEL_PRESETS.length; this.refreshHighlights(); });
    keys.on('keydown-TAB',   (e: KeyboardEvent) => { e.preventDefault(); this.vsAI = !this.vsAI; this.refreshHighlights(); });
    keys.on('keydown-ONE',   () => { this.aiDifficulty = 'easy';   this.refreshHighlights(); });
    keys.on('keydown-TWO',   () => { this.aiDifficulty = 'medium'; this.refreshHighlights(); });
    keys.on('keydown-THREE', () => { this.aiDifficulty = 'hard';   this.refreshHighlights(); });
    keys.once('keydown-ENTER', () => this.startGame());
  }

  private refreshHighlights(): void {
    // Mode
    this.modeTexts.forEach((t, i) => {
      const active = i === this.selectedMode;
      t.setColor(active ? this.MODES[i].color : '#444444');
      t.setText((active ? '▶ ' : '  ') + this.MODES[i].label);
    });

    // Level
    this.levelTexts.forEach((t, i) => {
      const active = i === this.selectedLevel;
      t.setColor(active ? '#ffffff' : '#444444');
      t.setStyle({ fontSize: active ? '20px' : '16px', color: active ? '#ffffff' : '#444444', fontFamily: 'monospace' });
    });

    // Opponent
    this.opponentText.setText(this.vsAI ? '▶ vs AI' : '▶ 2P Local');
    this.opponentText.setColor(this.vsAI ? '#ff6688' : '#6688ff');

    // Difficulty (only visible when vs AI)
    this.diffHint.setVisible(this.vsAI);
    this.difficultyTexts.forEach((t, i) => {
      t.setVisible(this.vsAI);
      const active = this.DIFFICULTIES[i].key === this.aiDifficulty;
      t.setColor(active ? this.DIFFICULTIES[i].color : '#444444');
      t.setStyle({
        fontSize: active ? '18px' : '14px',
        color: active ? this.DIFFICULTIES[i].color : '#444444',
        fontFamily: 'monospace',
      });
    });
  }

  private startGame(): void {
    const mode  = this.selectedMode === 0 ? 'normal' : 'tag';
    const level = LEVEL_PRESETS[this.selectedLevel];
    this.scene.start('GameScene', {
      mode,
      level,
      vsAI: this.vsAI,
      aiDifficulty: this.vsAI ? this.aiDifficulty : undefined,
    });
  }
}
