import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { GameSettings, PlayerType, loadSettings, saveSettings } from '../game/GameSettings';
import { LEVEL_PRESETS } from '../game/LevelPreset';

const TIMER_OPTIONS = [1, 2, 3, 5, 0]; // 0 = unlimited

const PLAYER_TYPES: { key: PlayerType; label: string }[] = [
  { key: 'human',     label: 'Human' },
  { key: 'ai_easy',   label: 'AI Easy' },
  { key: 'ai_medium', label: 'AI Medium' },
  { key: 'ai_hard',   label: 'AI Hard' },
];

interface Row {
  type: 'header' | 'option';
  label: string;
  getValue?: () => string;
  onLeft?: () => void;
  onRight?: () => void;
  labelText?: Phaser.GameObjects.Text;
  valueText?: Phaser.GameObjects.Text;
}

export class SettingsScene extends Phaser.Scene {
  private settings!: GameSettings;
  private rows: Row[] = [];
  private selectableIndices: number[] = [];
  private cursor = 0;

  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    this.settings = loadSettings();
    this.rows = [];
    this.selectableIndices = [];
    this.cursor = 0;

    const cx = CANVAS_WIDTH / 2;

    // Title
    this.add.text(cx, 18, 'SETTINGS', {
      fontSize: '28px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.buildRows();
    this.renderRows();

    // Back hint
    this.add.text(cx, CANVAS_HEIGHT - 22, 'ESC = Save & Back', {
      fontSize: '12px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.refreshDisplay();

    // Input
    const keys = this.input.keyboard!;
    keys.on('keydown-UP',    () => { this.cursor = Math.max(0, this.cursor - 1); this.refreshDisplay(); });
    keys.on('keydown-DOWN',  () => { this.cursor = Math.min(this.selectableIndices.length - 1, this.cursor + 1); this.refreshDisplay(); });
    keys.on('keydown-LEFT',  () => { this.currentRow()?.onLeft?.(); this.save(); this.refreshDisplay(); });
    keys.on('keydown-RIGHT', () => { this.currentRow()?.onRight?.(); this.save(); this.refreshDisplay(); });
    keys.on('keydown-ESC',   () => { this.save(); this.scene.start('MenuScene'); });
  }

  private currentRow(): Row | undefined {
    return this.rows[this.selectableIndices[this.cursor]];
  }

  private save(): void {
    saveSettings(this.settings);
  }

  private renderRows(): void {
    const labelX = 180;
    const valueX = 620;
    const cx = CANVAS_WIDTH / 2;
    let y = 48;
    let isFirst = true;

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (row.type === 'header') {
        if (!isFirst) y += 8;
        isFirst = false;
        row.labelText = this.add.text(cx, y, `── ${row.label} ──`, {
          fontSize: '12px', color: '#666666', fontFamily: 'monospace',
        }).setOrigin(0.5);
        y += 22;
      } else {
        row.labelText = this.add.text(labelX, y, row.label, {
          fontSize: '14px', color: '#888888', fontFamily: 'monospace',
        });
        row.valueText = this.add.text(valueX, y, '', {
          fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
        }).setOrigin(1, 0);
        this.selectableIndices.push(i);
        y += 22;
      }
    }
  }

  private refreshDisplay(): void {
    const activeRowIdx = this.selectableIndices[this.cursor];
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (row.type !== 'option' || !row.valueText || !row.getValue) continue;
      const active = i === activeRowIdx;
      const value = row.getValue();
      row.valueText.setText(active ? `◄ ${value} ►` : value);
      row.labelText?.setColor(active ? '#ffffff' : '#888888');
      row.valueText.setColor(active ? '#ffcc00' : '#aaaaaa');
    }
  }

  private buildRows(): void {
    const s = this.settings;

    // ── Game ──
    this.rows.push({ type: 'header', label: 'Game' });
    this.rows.push({
      type: 'option', label: 'Reload Speed',
      getValue: () => `${s.reloadSpeedPercent}%`,
      onLeft:  () => { s.reloadSpeedPercent = Math.max(0,   s.reloadSpeedPercent - 10); },
      onRight: () => { s.reloadSpeedPercent = Math.min(500, s.reloadSpeedPercent + 10); },
    });
    this.rows.push({
      type: 'option', label: 'Match Timer',
      getValue: () => s.matchTimerMinutes === 0 ? 'Unlimited' : `${s.matchTimerMinutes} min`,
      onLeft: () => {
        const idx = TIMER_OPTIONS.indexOf(s.matchTimerMinutes);
        s.matchTimerMinutes = TIMER_OPTIONS[(idx - 1 + TIMER_OPTIONS.length) % TIMER_OPTIONS.length];
      },
      onRight: () => {
        const idx = TIMER_OPTIONS.indexOf(s.matchTimerMinutes);
        s.matchTimerMinutes = TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length];
      },
    });
    this.rows.push({
      type: 'option', label: 'Lives',
      getValue: () => `${s.lives}`,
      onLeft:  () => { s.lives = Math.max(1,  s.lives - 1); },
      onRight: () => { s.lives = Math.min(10, s.lives + 1); },
    });

    // ── Players ──
    this.rows.push({ type: 'header', label: 'Players' });
    this.rows.push(this.playerRow('Player 1', 'player1Type'));
    this.rows.push(this.playerRow('Player 2', 'player2Type'));
    this.rows.push(this.hpRow('P1 HP', 'p1Hp'));
    this.rows.push(this.hpRow('P2 HP', 'p2Hp'));

    // ── Camera ──
    this.rows.push({ type: 'header', label: 'Camera' });
    this.rows.push(this.zoomRow('P1 Zoom', 'p1Zoom'));
    this.rows.push(this.zoomRow('P2 Zoom', 'p2Zoom'));

    // ── Minimap ──
    this.rows.push({ type: 'header', label: 'Minimap' });
    this.rows.push({
      type: 'option', label: 'Minimap',
      getValue: () => s.minimapEnabled ? 'On' : 'Off',
      onLeft:  () => { s.minimapEnabled = !s.minimapEnabled; },
      onRight: () => { s.minimapEnabled = !s.minimapEnabled; },
    });
    this.rows.push({
      type: 'option', label: 'Bot uses map',
      getValue: () => s.botUseMinimap ? 'Yes' : 'No',
      onLeft:  () => { s.botUseMinimap = !s.botUseMinimap; },
      onRight: () => { s.botUseMinimap = !s.botUseMinimap; },
    });

    // ── Map ──
    this.rows.push({ type: 'header', label: 'Map' });
    this.rows.push({
      type: 'option', label: 'Level Size',
      getValue: () => LEVEL_PRESETS[s.levelIndex]?.name ?? 'Normal',
      onLeft:  () => { s.levelIndex = (s.levelIndex - 1 + LEVEL_PRESETS.length) % LEVEL_PRESETS.length; },
      onRight: () => { s.levelIndex = (s.levelIndex + 1) % LEVEL_PRESETS.length; },
    });
    this.rows.push({
      type: 'option', label: 'Game Mode',
      getValue: () => s.gameMode === 'normal' ? 'Deathmatch' : 'Game of Tag',
      onLeft:  () => { s.gameMode = s.gameMode === 'normal' ? 'tag' : 'normal'; },
      onRight: () => { s.gameMode = s.gameMode === 'normal' ? 'tag' : 'normal'; },
    });
  }

  private playerRow(label: string, key: 'player1Type' | 'player2Type'): Row {
    return {
      type: 'option', label,
      getValue: () => PLAYER_TYPES.find(p => p.key === this.settings[key])?.label ?? 'Human',
      onLeft: () => {
        const idx = PLAYER_TYPES.findIndex(p => p.key === this.settings[key]);
        this.settings[key] = PLAYER_TYPES[(idx - 1 + PLAYER_TYPES.length) % PLAYER_TYPES.length].key;
      },
      onRight: () => {
        const idx = PLAYER_TYPES.findIndex(p => p.key === this.settings[key]);
        this.settings[key] = PLAYER_TYPES[(idx + 1) % PLAYER_TYPES.length].key;
      },
    };
  }

  private static readonly HP_OPTIONS = [50, 100, 150, 200, 300, 500];

  private hpRow(label: string, key: 'p1Hp' | 'p2Hp'): Row {
    const opts = SettingsScene.HP_OPTIONS;
    return {
      type: 'option', label,
      getValue: () => `${this.settings[key]}`,
      onLeft: () => {
        const idx = opts.indexOf(this.settings[key]);
        this.settings[key] = opts[(idx - 1 + opts.length) % opts.length];
      },
      onRight: () => {
        const idx = opts.indexOf(this.settings[key]);
        this.settings[key] = opts[(idx + 1) % opts.length];
      },
    };
  }

  private zoomRow(label: string, key: 'p1Zoom' | 'p2Zoom'): Row {
    return {
      type: 'option', label,
      getValue: () => this.settings[key].toFixed(1),
      onLeft:  () => { this.settings[key] = Math.round(Math.max(0.5, this.settings[key] - 0.1) * 10) / 10; },
      onRight: () => { this.settings[key] = Math.round(Math.min(3.0, this.settings[key] + 0.1) * 10) / 10; },
    };
  }
}
