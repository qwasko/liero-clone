import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { Loadout } from '../weapons/Loadout';
import { WORM_MAX_HP } from '../game/constants';

const BAR_W = 120;
const BAR_H = 11;
const PAD   = 8;

/** Green → orange → red based on HP percentage. */
function hpColour(pct: number): number {
  if (pct > 0.6) return 0x44cc44;
  if (pct > 0.3) return 0xeeaa22;
  return 0xcc2222;
}

/**
 * Fixed-position HUD strip rendered at the top of the screen.
 * All Phaser objects created once in the constructor and updated each frame.
 */
export class HUD {
  static readonly HEIGHT = 36;

  private bars:     Phaser.GameObjects.Graphics;
  private p1Hp:     Phaser.GameObjects.Text;
  private p2Hp:     Phaser.GameObjects.Text;
  private p1Weapon: Phaser.GameObjects.Text;
  private p2Weapon: Phaser.GameObjects.Text;
  private timer:    Phaser.GameObjects.Text;

  // Pre-computed x positions for the two HP bars
  private readonly barX1: number;
  private readonly barX2: number;

  constructor(scene: Phaser.Scene, canvasWidth: number) {
    const W = canvasWidth;
    const DEPTH = 20;

    // Background strip
    scene.add.graphics().setDepth(DEPTH)
      .fillStyle(0x000000, 0.72)
      .fillRect(0, 0, W, HUD.HEIGHT);

    // HP bars (redrawn each frame)
    this.bars = scene.add.graphics().setDepth(DEPTH + 1);

    // P1 bar starts after the "P1" label (~20px)
    this.barX1 = PAD + 22;
    // P2 bar ends PAD px from the right edge
    this.barX2 = W - PAD - BAR_W;

    const mono = (color: string): Phaser.Types.GameObjects.Text.TextStyle =>
      ({ fontSize: '11px', color, fontFamily: 'monospace' });

    // P1 — left side
    scene.add.text(PAD, PAD, 'P1', mono('#00ff88')).setDepth(DEPTH + 2);
    this.p1Hp     = scene.add.text(this.barX1 + BAR_W + 4, PAD,      '', mono('#ffffff')).setDepth(DEPTH + 2);
    this.p1Weapon = scene.add.text(PAD,                    PAD + 16, '', mono('#aaffcc')).setDepth(DEPTH + 2);

    // P2 — right side
    scene.add.text(W - PAD, PAD, 'P2', mono('#ff4444')).setOrigin(1, 0).setDepth(DEPTH + 2);
    this.p2Hp     = scene.add.text(this.barX2 - 4,         PAD,      '', mono('#ffffff')).setOrigin(1, 0).setDepth(DEPTH + 2);
    this.p2Weapon = scene.add.text(W - PAD,                PAD + 16, '', mono('#ffaaaa')).setOrigin(1, 0).setDepth(DEPTH + 2);

    // Timer — centred
    this.timer = scene.add.text(W / 2, PAD, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setDepth(DEPTH + 2);
  }

  update(
    worm1: Worm, load1: Loadout,
    worm2: Worm, load2: Loadout,
    timeRemaining: number,
  ): void {
    this.bars.clear();

    this.drawBar(this.bars, worm1, this.barX1);
    this.drawBar(this.bars, worm2, this.barX2);

    this.p1Hp.setText(worm1.isDead ? 'DEAD' : `${worm1.hp}hp`);
    this.p2Hp.setText(worm2.isDead ? 'DEAD' : `${worm2.hp}hp`);
    this.p1Weapon.setText(this.weaponLine(load1));
    this.p2Weapon.setText(this.weaponLine(load2));

    const secs = Math.max(0, Math.ceil(timeRemaining));
    const mm   = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss   = String(secs % 60).padStart(2, '0');
    this.timer.setText(`${mm}:${ss}`);
    this.timer.setColor(timeRemaining < 30 ? '#ff4444' : '#ffffff');
  }

  private drawBar(g: Phaser.GameObjects.Graphics, worm: Worm, x: number): void {
    if (worm.isDead) {
      g.fillStyle(0x444444, 1).fillRect(x, PAD, BAR_W, BAR_H);
      return;
    }
    const pct  = worm.hp / WORM_MAX_HP;
    const fill = Math.round(BAR_W * pct);
    g.fillStyle(0x222222, 1).fillRect(x, PAD, BAR_W, BAR_H);
    g.fillStyle(hpColour(pct), 1).fillRect(x, PAD, fill, BAR_H);
  }

  private weaponLine(load: Loadout): string {
    const { name } = load.activeWeapon;
    return load.isReloading
      ? `${name} [~]`
      : `${name} x${load.activeAmmo}`;
  }
}
