import Phaser from 'phaser';
import { TerrainMap } from '../terrain/TerrainMap';
import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';

const MM_MAX_W = 120;
const MM_MAX_H = 80;
const MM_PAD   = 6;
const MM_BORDER = 1;
const UPDATE_INTERVAL = 10; // frames between terrain redraws

const COLOR_P1    = 0x00ff88;
const COLOR_P2    = 0xff4444;
const COLOR_PROJ  = 0xffff00;
const COLOR_CRATE = 0xffffff;

/**
 * Minimap overlay — one per viewport.
 * P1: bottom-right of left viewport.
 * P2: bottom-left of right viewport.
 * Renders terrain as a downscaled image, plus entity dots.
 */
export class Minimap {
  /** All Phaser objects owned — for camera.ignore(). */
  readonly objects: Phaser.GameObjects.GameObject[] = [];

  private terrain: TerrainMap;

  // Computed minimap pixel dimensions
  private mmW: number;
  private mmH: number;
  private scaleX: number;
  private scaleY: number;

  // Two minimap instances (one per viewport)
  private canvas1!: Phaser.Textures.CanvasTexture;
  private image1!: Phaser.GameObjects.Image;
  private canvas2!: Phaser.Textures.CanvasTexture;
  private image2!: Phaser.GameObjects.Image;

  // Overlay dots drawn on top
  private dots1!: Phaser.GameObjects.Graphics;
  private dots2!: Phaser.GameObjects.Graphics;

  private frameCount = 0;
  private visible = true;

  constructor(scene: Phaser.Scene, terrain: TerrainMap) {
    this.terrain = terrain;

    // Compute proportional size
    const aspect = terrain.width / terrain.height;
    if (aspect >= MM_MAX_W / MM_MAX_H) {
      this.mmW = MM_MAX_W;
      this.mmH = Math.round(MM_MAX_W / aspect);
    } else {
      this.mmH = MM_MAX_H;
      this.mmW = Math.round(MM_MAX_H * aspect);
    }
    this.scaleX = this.mmW / terrain.width;
    this.scaleY = this.mmH / terrain.height;

    const halfW = CANVAS_WIDTH / 2;
    const DEPTH = 45;

    // ── P1 minimap: bottom-right of left viewport ──────────────────────
    const x1 = halfW - MM_PAD - this.mmW - MM_BORDER;
    const y1 = CANVAS_HEIGHT - MM_PAD - this.mmH - MM_BORDER - 36; // above HUD bar

    this.canvas1 = scene.textures.createCanvas('minimap1', this.mmW, this.mmH)!;
    this.image1 = scene.add.image(x1, y1, 'minimap1')
      .setOrigin(0, 0).setDepth(DEPTH).setScrollFactor(0);
    this.objects.push(this.image1);

    this.dots1 = scene.add.graphics().setDepth(DEPTH + 1).setScrollFactor(0);
    this.objects.push(this.dots1);

    // Border
    const border1 = scene.add.graphics().setDepth(DEPTH - 1).setScrollFactor(0);
    border1.lineStyle(1, 0x888888, 0.8);
    border1.strokeRect(x1 - MM_BORDER, y1 - MM_BORDER,
      this.mmW + MM_BORDER * 2, this.mmH + MM_BORDER * 2);
    this.objects.push(border1);

    // ── P2 minimap: bottom-left of right viewport ──────────────────────
    const x2 = halfW + MM_PAD + MM_BORDER;
    const y2 = y1;

    this.canvas2 = scene.textures.createCanvas('minimap2', this.mmW, this.mmH)!;
    this.image2 = scene.add.image(x2, y2, 'minimap2')
      .setOrigin(0, 0).setDepth(DEPTH).setScrollFactor(0);
    this.objects.push(this.image2);

    this.dots2 = scene.add.graphics().setDepth(DEPTH + 1).setScrollFactor(0);
    this.objects.push(this.dots2);

    const border2 = scene.add.graphics().setDepth(DEPTH - 1).setScrollFactor(0);
    border2.lineStyle(1, 0x888888, 0.8);
    border2.strokeRect(x2 - MM_BORDER, y2 - MM_BORDER,
      this.mmW + MM_BORDER * 2, this.mmH + MM_BORDER * 2);
    this.objects.push(border2);

    // Initial terrain render
    this.renderTerrain(this.canvas1);
    this.renderTerrain(this.canvas2);
  }

  toggle(): void {
    this.visible = !this.visible;
    for (const obj of this.objects) {
      (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(this.visible);
    }
  }

  update(
    worms: Worm[],
    projectiles: Projectile[],
    crates: readonly { x: number; y: number; active: boolean }[],
  ): void {
    if (!this.visible) return;

    this.frameCount++;

    // Redraw terrain every N frames
    if (this.frameCount % UPDATE_INTERVAL === 0) {
      this.renderTerrain(this.canvas1);
      this.renderTerrain(this.canvas2);
    }

    // Draw entity dots on both minimaps
    this.drawDots(this.dots1, this.image1.x, this.image1.y, worms, projectiles, crates);
    this.drawDots(this.dots2, this.image2.x, this.image2.y, worms, projectiles, crates);
  }

  private renderTerrain(canvas: Phaser.Textures.CanvasTexture): void {
    const ctx = canvas.getContext();
    const imgData = ctx.createImageData(this.mmW, this.mmH);
    const pixels = imgData.data;
    const terrainData = this.terrain.getData();
    const tw = this.terrain.width;
    const th = this.terrain.height;

    for (let my = 0; my < this.mmH; my++) {
      // Map minimap row to terrain row range
      const ty = Math.floor(my / this.scaleY);
      for (let mx = 0; mx < this.mmW; mx++) {
        const tx = Math.floor(mx / this.scaleX);
        const idx = (my * this.mmW + mx) * 4;

        if (tx >= tw || ty >= th) {
          // Out of bounds — black
          pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; pixels[idx + 3] = 255;
          continue;
        }

        const cell = terrainData[ty * tw + tx];
        let r: number, g: number, b: number;
        if (cell === 2) {
          // Rock — dark gray
          r = 0x55; g = 0x55; b = 0x55;
        } else if (cell === 1) {
          // Dirt — dark brown
          r = 0x6e; g = 0x4b; b = 0x28;
        } else {
          // Air — black
          r = 0; g = 0; b = 0;
        }
        pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    canvas.refresh();
  }

  private drawDots(
    g: Phaser.GameObjects.Graphics,
    ox: number, oy: number,
    worms: Worm[],
    projectiles: Projectile[],
    crates: readonly { x: number; y: number; active: boolean }[],
  ): void {
    g.clear();

    // Crates — tiny white squares
    for (const c of crates) {
      if (!c.active) continue;
      const cx = ox + Math.round(c.x * this.scaleX);
      const cy = oy + Math.round(c.y * this.scaleY);
      g.fillStyle(COLOR_CRATE, 0.9);
      g.fillRect(cx - 1, cy - 1, 2, 2);
    }

    // Projectiles — tiny yellow dots
    for (const p of projectiles) {
      if (!p.active) continue;
      const px = ox + Math.round(p.x * this.scaleX);
      const py = oy + Math.round(p.y * this.scaleY);
      g.fillStyle(COLOR_PROJ, 0.8);
      g.fillRect(px, py, 1, 1);
    }

    // Worms — colored dots (drawn last, on top)
    const colors = [COLOR_P1, COLOR_P2];
    for (let i = 0; i < worms.length; i++) {
      const w = worms[i];
      if (w.isDead) continue;
      const wx = ox + Math.round(w.x * this.scaleX);
      const wy = oy + Math.round(w.y * this.scaleY);
      g.fillStyle(colors[i] ?? COLOR_P1, 1);
      g.fillRect(wx - 1, wy - 1, 3, 3);
    }
  }
}
