import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import {
  KeyBindings, DEFAULT_P1_KEYS, DEFAULT_P2_KEYS,
  loadSettings, saveSettings, keyCodeName,
} from '../game/GameSettings';

const ACTIONS: (keyof KeyBindings)[] = ['left', 'right', 'up', 'down', 'jump', 'fire', 'change'];
const ACTION_LABELS: Record<keyof KeyBindings, string> = {
  left: 'Left', right: 'Right', up: 'Up', down: 'Down',
  jump: 'Jump', fire: 'Fire', change: 'Change',
};

/**
 * Key-binding configuration screen.
 *
 * Two-column layout (P1 left, P2 right).
 * UP/DOWN navigate rows, LEFT/RIGHT switch columns.
 * ENTER starts rebind — next keypress assigns.
 * ESC cancels rebind or returns to menu.
 * Bottom row: RESET DEFAULTS.
 */
export class ControlsScene extends Phaser.Scene {
  private p1Keys!: KeyBindings;
  private p2Keys!: KeyBindings;

  // Grid cursor: col 0=P1, 1=P2; row 0-6=actions, 7=reset
  private col = 0;
  private row = 0;
  private rebinding = false;

  // Display objects
  private cells: { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[][] = [];
  private resetText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ControlsScene' });
  }

  create(): void {
    const settings = loadSettings();
    this.p1Keys = { ...settings.p1Keys };
    this.p2Keys = { ...settings.p2Keys };
    this.col = 0;
    this.row = 0;
    this.rebinding = false;
    this.cells = [[], []];

    const cx = CANVAS_WIDTH / 2;

    // Title
    this.add.text(cx, 18, 'CONTROLS', {
      fontSize: '28px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Column headers
    const colX = [190, 590];
    this.add.text(colX[0], 55, '── Player 1 ──', {
      fontSize: '12px', color: '#00ff88', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add.text(colX[1], 55, '── Player 2 ──', {
      fontSize: '12px', color: '#ff4444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Build rows
    const labelX = [90, 490];
    const valueX = [290, 690];
    const startY = 80;
    const rowH = 24;

    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < ACTIONS.length; r++) {
        const y = startY + r * rowH;
        const label = this.add.text(labelX[c], y, ACTION_LABELS[ACTIONS[r]], {
          fontSize: '14px', color: '#888888', fontFamily: 'monospace',
        });
        const value = this.add.text(valueX[c], y, '', {
          fontSize: '14px', color: '#aaaaaa', fontFamily: 'monospace',
        }).setOrigin(1, 0);
        this.cells[c].push({ label, value });
      }
    }

    // Reset defaults row
    const resetY = startY + ACTIONS.length * rowH + 20;
    this.resetText = this.add.text(cx, resetY, 'RESET DEFAULTS', {
      fontSize: '14px', color: '#888888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Hint
    this.hintText = this.add.text(cx, CANVAS_HEIGHT - 22, '', {
      fontSize: '11px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.refreshDisplay();

    // Input — use raw keydown to handle rebind mode
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      this.handleKey(event.keyCode);
    });
  }

  private handleKey(code: number): void {
    if (this.rebinding) {
      if (code === 27) {
        // ESC cancels rebind
        this.rebinding = false;
        this.refreshDisplay();
        return;
      }
      // Assign key
      const keys = this.col === 0 ? this.p1Keys : this.p2Keys;
      keys[ACTIONS[this.row]] = code;
      this.rebinding = false;
      this.save();
      this.refreshDisplay();
      return;
    }

    // Navigation mode
    switch (code) {
      case 38: // UP
        this.row = Math.max(0, this.row - 1);
        this.refreshDisplay();
        break;
      case 40: // DOWN
        this.row = Math.min(ACTIONS.length, this.row + 1); // 7 = reset row
        this.refreshDisplay();
        break;
      case 37: // LEFT
        this.col = 0;
        this.refreshDisplay();
        break;
      case 39: // RIGHT
        this.col = 1;
        this.refreshDisplay();
        break;
      case 13: // ENTER
        if (this.row === ACTIONS.length) {
          // Reset defaults
          this.p1Keys = { ...DEFAULT_P1_KEYS };
          this.p2Keys = { ...DEFAULT_P2_KEYS };
          this.save();
          this.refreshDisplay();
        } else {
          this.rebinding = true;
          this.refreshDisplay();
        }
        break;
      case 27: // ESC
        this.save();
        this.scene.start('MenuScene');
        break;
    }
  }

  private save(): void {
    const settings = loadSettings();
    settings.p1Keys = { ...this.p1Keys };
    settings.p2Keys = { ...this.p2Keys };
    saveSettings(settings);
  }

  private refreshDisplay(): void {
    const bindings = [this.p1Keys, this.p2Keys];

    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < ACTIONS.length; r++) {
        const cell = this.cells[c][r];
        const active = !this.rebinding && c === this.col && r === this.row;
        const rebindActive = this.rebinding && c === this.col && r === this.row;
        const name = keyCodeName(bindings[c][ACTIONS[r]]);

        if (rebindActive) {
          cell.value.setText('? Press a key ?');
          cell.value.setColor('#ffcc00');
          cell.label.setColor('#ffcc00');
        } else if (active) {
          cell.value.setText(`[ ${name} ]`);
          cell.value.setColor('#ffcc00');
          cell.label.setColor('#ffffff');
        } else {
          cell.value.setText(name);
          cell.value.setColor('#aaaaaa');
          cell.label.setColor('#888888');
        }
      }
    }

    // Reset row
    const resetActive = !this.rebinding && this.row === ACTIONS.length;
    this.resetText.setColor(resetActive ? '#ffcc00' : '#888888');
    this.resetText.setText(resetActive ? '▶ RESET DEFAULTS ◀' : 'RESET DEFAULTS');

    // Hint text
    if (this.rebinding) {
      this.hintText.setText('Press any key to bind  |  ESC = cancel');
    } else {
      this.hintText.setText('UP/DOWN = navigate  LEFT/RIGHT = column  ENTER = rebind  ESC = back');
    }
  }
}
