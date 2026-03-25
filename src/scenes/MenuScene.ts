import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { PlayerType, loadSettings } from '../game/GameSettings';
import { LEVEL_PRESETS } from '../game/LevelPreset';

/**
 * Main menu — 4 options.
 *
 * UP/DOWN  — navigate
 * ENTER    — select
 */
export class MenuScene extends Phaser.Scene {
  private selected = 0;
  private menuTexts!: Phaser.GameObjects.Text[];
  private summaryText!: Phaser.GameObjects.Text;
  private starting = false;

  private readonly ITEMS = ['NEW GAME', 'ONLINE', 'SETTINGS', 'CONTROLS', 'QUIT'];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    this.selected = 0;
    this.starting = false;

    const cx = CANVAS_WIDTH  / 2;
    const cy = CANVAS_HEIGHT / 2;

    this.add.text(cx, cy - 160, 'LIERO', {
      fontSize: '56px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Menu items
    this.menuTexts = this.ITEMS.map((label, i) =>
      this.add.text(cx, cy - 30 + i * 36, label, {
        fontSize: '20px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5),
    );

    // Settings summary line
    this.summaryText = this.add.text(cx, cy + 130, '', {
      fontSize: '11px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Control hints
    this.add.text(cx, cy + 195, 'Key bindings: see CONTROLS menu', {
      fontSize: '11px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 213, 'CHANGE + LEFT/RIGHT = cycle weapons', {
      fontSize: '11px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.refreshDisplay();

    const keys = this.input.keyboard!;
    keys.on('keydown-UP',    () => { this.selected = (this.selected - 1 + this.ITEMS.length) % this.ITEMS.length; this.refreshDisplay(); });
    keys.on('keydown-DOWN',  () => { this.selected = (this.selected + 1) % this.ITEMS.length; this.refreshDisplay(); });
    keys.on('keydown-ENTER', () => this.selectItem());
  }

  private refreshDisplay(): void {
    this.menuTexts.forEach((t, i) => {
      const active = i === this.selected;
      t.setText(active ? `▶ ${this.ITEMS[i]}` : `  ${this.ITEMS[i]}`);
      t.setStyle({
        fontSize: active ? '24px' : '20px',
        color: active ? '#ffffff' : '#444444',
        fontFamily: 'monospace',
      });
    });

    const s = loadSettings();
    const pl = (t: PlayerType) => {
      switch (t) {
        case 'human':     return 'Human';
        case 'ai_easy':   return 'AI Easy';
        case 'ai_medium': return 'AI Medium';
        case 'ai_hard':   return 'AI Hard';
      }
    };
    const level = LEVEL_PRESETS[s.levelIndex]?.name ?? 'Normal';
    const mode  = s.gameMode === 'normal' ? 'Deathmatch' : 'Tag';
    const timer = s.matchTimerMinutes > 0 ? `${s.matchTimerMinutes}min` : 'Unlimited';
    this.summaryText.setText(
      `${mode} | ${level} | ${timer} | ${s.lives} lives | P1: ${pl(s.player1Type)} | P2: ${pl(s.player2Type)}`,
    );
  }

  private selectItem(): void {
    if (this.starting) return;
    switch (this.selected) {
      case 0: // NEW GAME
        this.starting = true;
        this.scene.start('GameScene', { settings: loadSettings() });
        break;
      case 1: // ONLINE
        this.starting = true;
        this.scene.start('LobbyScene');
        break;
      case 2: // SETTINGS
        this.starting = true;
        this.scene.start('SettingsScene');
        break;
      case 3: // CONTROLS
        this.starting = true;
        this.scene.start('ControlsScene');
        break;
      case 4: // QUIT
        break;
    }
  }
}
