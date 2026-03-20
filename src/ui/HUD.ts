import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { Loadout } from '../weapons/Loadout';
import { TagSystem } from '../game/TagSystem';
import { WORM_MAX_HP } from '../game/constants';

const BAR_W = 100;
const BAR_H = 11;
const PAD   = 8;

/** Green → orange → red based on HP percentage. */
function hpColour(pct: number): number {
  if (pct > 0.6) return 0x44cc44;
  if (pct > 0.3) return 0xeeaa22;
  return 0xcc2222;
}

/**
 * Splitscreen HUD:
 *   P1 info → bottom-left of left viewport
 *   P2 info → bottom-right of right viewport
 *   Timer   → top center (spans divider)
 */
export class HUD {
  static readonly HEIGHT = 36;

  private bars:     Phaser.GameObjects.Graphics;
  private p1Hp:     Phaser.GameObjects.Text;
  private p2Hp:     Phaser.GameObjects.Text;
  private p1Weapon: Phaser.GameObjects.Text;
  private p2Weapon: Phaser.GameObjects.Text;
  private p1Lives:  Phaser.GameObjects.Text;
  private p2Lives:  Phaser.GameObjects.Text;
  private timer:    Phaser.GameObjects.Text;
  private tagLine:  Phaser.GameObjects.Text;

  /** Every Phaser display object owned by the HUD — for camera.ignore(). */
  readonly objects: Phaser.GameObjects.GameObject[] = [];

  private readonly barX1: number;
  private readonly barX2: number;
  private readonly barY:  number;

  constructor(scene: Phaser.Scene, canvasWidth: number, canvasHeight: number) {
    const W = canvasWidth;
    const H = canvasHeight;
    const DEPTH = 20;

    this.barY = H - HUD.HEIGHT + PAD;

    // ── Bottom HUD backgrounds (one per viewport half) ─────────────────
    const bgLeft = scene.add.graphics().setDepth(DEPTH).setScrollFactor(0)
      .fillStyle(0x000000, 0.72)
      .fillRect(0, H - HUD.HEIGHT, W / 2 - 1, HUD.HEIGHT);
    this.objects.push(bgLeft);

    const bgRight = scene.add.graphics().setDepth(DEPTH).setScrollFactor(0)
      .fillStyle(0x000000, 0.72)
      .fillRect(W / 2 + 1, H - HUD.HEIGHT, W / 2 - 1, HUD.HEIGHT);
    this.objects.push(bgRight);

    // ── Timer background (top center, spans both viewports) ────────────
    const timerBg = scene.add.graphics().setDepth(DEPTH).setScrollFactor(0)
      .fillStyle(0x000000, 0.72)
      .fillRect(W / 2 - 120, 0, 240, 36);
    this.objects.push(timerBg);

    // ── HP bars (redrawn each frame) ───────────────────────────────────
    this.bars = scene.add.graphics().setDepth(DEPTH + 1).setScrollFactor(0);
    this.objects.push(this.bars);

    this.barX1 = PAD + 22;                // P1 bar: left-aligned in left half
    this.barX2 = W - PAD - BAR_W;         // P2 bar: right-aligned in right half

    const mono = (color: string): Phaser.Types.GameObjects.Text.TextStyle =>
      ({ fontSize: '11px', color, fontFamily: 'monospace' });

    const txt = (x: number, y: number, str: string, style: Phaser.Types.GameObjects.Text.TextStyle) => {
      const t = scene.add.text(x, y, str, style).setDepth(DEPTH + 2).setScrollFactor(0);
      this.objects.push(t);
      return t;
    };

    // ── P1 (bottom-left of left viewport) ──────────────────────────────
    txt(PAD, this.barY, 'P1', mono('#00ff88'));
    this.p1Hp     = txt(this.barX1 + BAR_W + 4, this.barY,      '', mono('#ffffff'));
    this.p1Weapon = txt(PAD,                    this.barY + 16, '', mono('#aaffcc'));
    this.p1Lives  = txt(this.barX1 + BAR_W + 4, this.barY + 16, '', mono('#00ff88'));

    // ── P2 (bottom-right of right viewport, right-aligned) ─────────────
    txt(W - PAD, this.barY, 'P2', mono('#ff4444')).setOrigin(1, 0);
    this.p2Hp     = txt(this.barX2 - 4,         this.barY,      '', mono('#ffffff')).setOrigin(1, 0);
    this.p2Weapon = txt(W - PAD,                this.barY + 16, '', mono('#ffaaaa')).setOrigin(1, 0);
    this.p2Lives  = txt(this.barX2 - 4,         this.barY + 16, '', mono('#ff4444')).setOrigin(1, 0);

    // ── Timer (top center) ─────────────────────────────────────────────
    this.timer = txt(W / 2, 4, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    // ── Tag info (below timer) ─────────────────────────────────────────
    this.tagLine = txt(W / 2, 20, '', {
      fontSize: '11px', color: '#ffaa00', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
  }

  update(
    worm1: Worm, load1: Loadout, lives1: number,
    worm2: Worm, load2: Loadout, lives2: number,
    timeRemaining: number,
    tagSystem?: TagSystem | null,
  ): void {
    this.bars.clear();

    this.drawBar(this.bars, worm1, this.barX1);
    this.drawBar(this.bars, worm2, this.barX2);

    // Reload progress bars (below HP bars)
    this.drawReloadBar(this.bars, this.barX1, this.barY + BAR_H + 1, BAR_W, load1.reloadProgress);
    this.drawReloadBar(this.bars, this.barX2, this.barY + BAR_H + 1, BAR_W, load2.reloadProgress);

    this.p1Hp.setText(worm1.isDead ? 'DEAD' : `${worm1.hp}hp`);
    this.p2Hp.setText(worm2.isDead ? 'DEAD' : `${worm2.hp}hp`);
    this.p1Weapon.setText(this.weaponLine(load1));
    this.p2Weapon.setText(this.weaponLine(load2));
    this.p1Lives.setText('♥'.repeat(lives1));
    this.p2Lives.setText('♥'.repeat(lives2));

    const secs = Math.max(0, Math.ceil(timeRemaining));
    const mm   = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss   = String(secs % 60).padStart(2, '0');
    this.timer.setText(`${mm}:${ss}`);
    this.timer.setColor(timeRemaining < 30 ? '#ff4444' : '#ffffff');

    if (tagSystem) {
      const t1 = tagSystem.getTime(worm1);
      const t2 = tagSystem.getTime(worm2);
      const fmtT = (s: number) => `${Math.floor(s)}s`;
      const itMark = (w: Worm) => tagSystem.isIt(w) ? ' ★' : '';
      this.tagLine.setText(`TAG — P1: ${fmtT(t1)}${itMark(worm1)}  P2: ${fmtT(t2)}${itMark(worm2)}`);
      this.tagLine.setVisible(true);
    } else {
      this.tagLine.setVisible(false);
    }
  }

  private drawBar(g: Phaser.GameObjects.Graphics, worm: Worm, x: number): void {
    if (worm.isDead) {
      g.fillStyle(0x444444, 1).fillRect(x, this.barY, BAR_W, BAR_H);
      return;
    }
    const pct  = worm.hp / WORM_MAX_HP;
    const fill = Math.round(BAR_W * pct);
    g.fillStyle(0x222222, 1).fillRect(x, this.barY, BAR_W, BAR_H);
    g.fillStyle(hpColour(pct), 1).fillRect(x, this.barY, fill, BAR_H);
  }

  private drawReloadBar(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number,
    progress: number,
  ): void {
    if (progress <= 0 || progress >= 1) return;
    const h = 3;
    g.fillStyle(0x333333, 1).fillRect(x, y, w, h);
    g.fillStyle(0x44aaff, 1).fillRect(x, y, Math.round(w * progress), h);
  }

  private weaponLine(load: Loadout): string {
    const { name } = load.activeWeapon;
    if (load.activeWeapon.infiniteAmmo) return name;
    return load.isReloading
      ? `${name} [...]`
      : `${name} x${load.activeAmmo}`;
  }
}
