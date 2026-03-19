import Phaser from 'phaser';
import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';

const AIM_LINE_LEN = 22;

/**
 * Stateless renderer — draws worms, projectiles, and aim lines
 * onto Phaser Graphics objects. No game logic.
 */
export class GameRenderer {

  drawWorms(g: Phaser.GameObjects.Graphics, worms: readonly Worm[]): void {
    g.clear();
    for (const worm of worms) {
      if (worm.isDead) continue;
      this.drawWormSprite(g, worm);
    }
  }

  drawAimLines(g: Phaser.GameObjects.Graphics, worms: readonly Worm[]): void {
    for (const worm of worms) {
      if (worm.isDead) continue;
      const ax = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
      const ay = Math.sin(worm.aimAngle);
      g.lineStyle(1, worm.playerId === 1 ? 0x00ff88 : 0xff4444, 0.7);
      g.beginPath();
      g.moveTo(worm.x, worm.y);
      g.lineTo(worm.x + ax * AIM_LINE_LEN, worm.y + ay * AIM_LINE_LEN);
      g.strokePath();
    }
  }

  drawProjectiles(
    g: Phaser.GameObjects.Graphics,
    projectiles: readonly Projectile[],
    timeNow: number,
  ): void {
    for (const proj of projectiles) {
      if (!proj.active) continue;

      // ── Mine: deployed → small brown rectangle with blinking light ──
      if (proj.weapon.behavior === 'mine' && proj.deployed) {
        g.fillStyle(0x8B5513, 1);
        g.fillRect(proj.x - 5, proj.y - 3, 10, 6);
        const blink = Math.floor(timeNow / 300) % 2 === 0;
        if (blink) {
          g.fillStyle(0xff2200, 1);
          g.fillCircle(proj.x, proj.y - 3, 1.5);
        }
        continue;
      }

      // ── Bounce weapons: pulse red near fuse expiry ──────────────────
      let color = proj.weapon.projectileColor;
      if (proj.fuseTimer !== null && proj.weapon.fuseMs !== null) {
        const urgency = 1 - proj.fuseTimer / proj.weapon.fuseMs;
        if (urgency > 0.65) color = 0xff3300;
      }

      g.fillStyle(color, 1);
      g.fillCircle(proj.x, proj.y, proj.weapon.projectileSize);
    }
  }

  // ── Worm sprite ──────────────────────────────────────────────────────

  private drawWormSprite(g: Phaser.GameObjects.Graphics, worm: Worm): void {
    const p1 = worm.playerId === 1;

    const colors = p1
      ? [0x0a5c25, 0x178a38, 0x22bb4e, 0x33ee66]
      : [0x6b1111, 0x991a1a, 0xcc2727, 0xee4444];

    const x = worm.x;
    const y = worm.y;

    const aimDX = worm.facingRight ?  Math.cos(worm.aimAngle) : -Math.cos(worm.aimAngle);
    const aimDY = Math.sin(worm.aimAngle);
    const perpDX = -aimDY;
    const perpDY =  aimDX;

    const segs: [number, number, number][] = [
      [-6,  0.5, 2.0],
      [-2, -1.5, 2.5],
      [ 2,  1.5, 3.0],
      [ 6,  0.0, 3.5],
    ];

    // Dark outline
    g.fillStyle(0x0a0a0a, 1);
    for (const [a, p, r] of segs) {
      g.fillCircle(x + aimDX * a + perpDX * p, y + aimDY * a + perpDY * p, r + 1.2);
    }

    // Colored segments
    segs.forEach(([a, p, r], i) => {
      g.fillStyle(colors[i], 1);
      g.fillCircle(x + aimDX * a + perpDX * p, y + aimDY * a + perpDY * p, r);
    });

    // Eye
    const hx = x + aimDX * 6;
    const hy = y + aimDY * 6;
    const ex = hx + aimDX * 2.2;
    const ey = hy + aimDY * 2.2;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(ex, ey, 1.5);
    g.fillStyle(0x111111, 1);
    g.fillCircle(ex + aimDX * 0.6, ey + aimDY * 0.6, 0.8);
  }
}
