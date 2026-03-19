import Phaser from 'phaser';
import { InputManager } from '../input/InputManager';
import { TerrainGenerator } from '../terrain/TerrainGenerator';
import { TerrainRenderer } from '../terrain/TerrainRenderer';
import { AudioManager } from '../utils/AudioManager';
import { HUD } from '../ui/HUD';
import { GameState } from '../game/GameState';
import { GameRenderer } from '../game/GameRenderer';
import { GameEvent } from '../game/GameEvents';
import { LevelPreset, LEVEL_PRESETS } from '../game/LevelPreset';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { CRATE_HALF } from '../game/CrateSystem';

/**
 * Thin Phaser orchestrator with splitscreen:
 *   P1 camera (left half) follows worm 1
 *   P2 camera (right half) follows worm 2
 *   HUD camera (full screen) renders overlay UI
 */
export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private gameRenderer!: GameRenderer;

  private inputManager!: InputManager;
  private terrainRenderer!: TerrainRenderer;
  private audio!: AudioManager;
  private hud!: HUD;

  // Phaser display layers
  private wormLayer!: Phaser.GameObjects.Graphics;
  private particleLayer!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private flashRect!: Phaser.GameObjects.Rectangle;

  // Splitscreen cameras
  private p2Camera!: Phaser.Cameras.Scene2D.Camera;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private cameraFocusP1!: Phaser.GameObjects.Zone;
  private cameraFocusP2!: Phaser.GameObjects.Zone;
  private divider!: Phaser.GameObjects.Rectangle;

  // Tag mode "IT" indicator
  private tagItGraphics: Phaser.GameObjects.Text | null = null;

  // Crate visuals synced to GameState crate data
  private crateVisuals = new Map<number, { body: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Text }>();

  constructor() {
    super({ key: 'GameScene' });
  }

  create(data?: { mode?: 'normal' | 'tag'; level?: LevelPreset }): void {
    // ── Clean up stale state from previous game ──────────────────────────
    if (this.textures.exists('terrain')) {
      this.textures.remove('terrain');
    }
    this.crateVisuals.clear();

    const mode  = data?.mode ?? 'normal';
    const level = data?.level ?? LEVEL_PRESETS[0];
    const halfW = CANVAS_WIDTH / 2;

    // ── Terrain ──────────────────────────────────────────────────────────
    const spawnP1 = { x: level.width * 0.25, y: level.height * 0.44 };
    const spawnP2 = { x: level.width * 0.75, y: level.height * 0.44 };
    const terrain = TerrainGenerator.generate(level.width, level.height, [spawnP1, spawnP2], level.terrain);
    this.terrainRenderer = new TerrainRenderer(this, terrain);

    // ── GameState ────────────────────────────────────────────────────────
    this.gameState    = new GameState(terrain, level, mode);
    this.gameRenderer = new GameRenderer();

    // ── Graphics layers ──────────────────────────────────────────────────
    this.wormLayer = this.add.graphics().setDepth(5);

    // ── Tag indicator ────────────────────────────────────────────────────
    this.tagItGraphics = null;
    if (mode === 'tag') {
      this.tagItGraphics = this.add.text(0, 0, '★ IT', {
        fontSize: '11px', color: '#ffaa00', fontFamily: 'monospace',
      }).setDepth(15).setVisible(false);
    }

    // ── Input + audio ────────────────────────────────────────────────────
    this.inputManager = new InputManager(this.input.keyboard!);
    this.audio        = new AudioManager();

    // ════════════════════════════════════════════════════════════════════
    //  Splitscreen camera setup
    // ════════════════════════════════════════════════════════════════════

    // ── P1 camera (left half) ────────────────────────────────────────────
    const cam1 = this.cameras.main;
    cam1.setViewport(0, 0, halfW, CANVAS_HEIGHT);
    cam1.setZoom(3);
    cam1.setBounds(0, 0, level.width, level.height);
    cam1.setRoundPixels(true);

    this.cameraFocusP1 = this.add.zone(spawnP1.x, spawnP1.y, 1, 1);
    cam1.startFollow(this.cameraFocusP1);

    // ── P2 camera (right half) ───────────────────────────────────────────
    this.p2Camera = this.cameras.add(halfW, 0, halfW, CANVAS_HEIGHT);
    this.p2Camera.setZoom(3);
    this.p2Camera.setBounds(0, 0, level.width, level.height);
    this.p2Camera.setRoundPixels(true);

    this.cameraFocusP2 = this.add.zone(spawnP2.x, spawnP2.y, 1, 1);
    this.p2Camera.startFollow(this.cameraFocusP2);

    // ── Overlay layers ───────────────────────────────────────────────────
    this.particleLayer   = this.add.graphics().setDepth(9);
    this.overlayGraphics = this.add.graphics().setDepth(10);

    // Screen-space flash (covers full screen via HUD camera)
    this.flashRect = this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0xff2200, 0)
      .setOrigin(0, 0).setDepth(50).setScrollFactor(0);

    // ── Divider line (2px dark line at center) ───────────────────────────
    this.divider = this.add.rectangle(halfW, CANVAS_HEIGHT / 2, 2, CANVAS_HEIGHT, 0x222222, 1)
      .setScrollFactor(0).setDepth(55);

    // ── HUD (splitscreen layout) ─────────────────────────────────────────
    this.hud = new HUD(this, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── HUD camera (full-screen overlay, renders last → on top) ──────────
    this.hudCamera = this.cameras.add(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, false, 'hud');
    this.hudCamera.setZoom(1);
    this.hudCamera.setScroll(0, 0);

    // ── Camera visibility ────────────────────────────────────────────────
    // World objects: visible to both world cameras, NOT to HUD camera
    const worldObjects: Phaser.GameObjects.GameObject[] = [
      this.terrainRenderer.image,
      this.wormLayer,
      this.particleLayer,
      this.overlayGraphics,
      this.cameraFocusP1,
      this.cameraFocusP2,
    ];
    if (this.tagItGraphics) worldObjects.push(this.tagItGraphics);
    for (const obj of worldObjects) {
      this.hudCamera.ignore(obj);
    }

    // HUD objects: visible to HUD camera only, NOT to world cameras
    const hudObjects: Phaser.GameObjects.GameObject[] = [
      this.flashRect,
      this.divider,
      ...this.hud.objects,
    ];
    for (const obj of hudObjects) {
      cam1.ignore(obj);
      this.p2Camera.ignore(obj);
    }
  }

  update(_time: number, delta: number): void {
    if (this.gameState.matchOver) return;

    const dt     = delta / 1000;
    const input1 = this.inputManager.getPlayer1();
    const input2 = this.inputManager.getPlayer2();

    // ── Tick game logic ──────────────────────────────────────────────────
    const events = this.gameState.update(dt, input1, input2);

    // ── Process events ───────────────────────────────────────────────────
    for (const event of events) {
      this.processEvent(event);
    }

    // ── Sync terrain renderer ────────────────────────────────────────────
    const dirty = this.gameState.terrainDestroyer.flushDirty();
    for (const region of dirty) {
      this.terrainRenderer.redrawRegion(
        this.gameState.terrain, region.x, region.y, region.w, region.h,
      );
    }

    // ── Sync crate visuals ───────────────────────────────────────────────
    this.syncCrateVisuals();

    // ── Draw ─────────────────────────────────────────────────────────────
    const state = this.gameState;

    this.gameRenderer.drawWorms(this.wormLayer, state.worms);
    state.particleSystem.draw(this.particleLayer);

    this.overlayGraphics.clear();
    state.ropeSystem.draw(this.overlayGraphics);
    this.gameRenderer.drawAimLines(this.overlayGraphics, state.worms);
    this.gameRenderer.drawProjectiles(this.overlayGraphics, state.activeProjectiles, this.time.now);

    // ── Tag "IT" indicator ───────────────────────────────────────────────
    if (state.tagSystem && this.tagItGraphics) {
      const itWorm = state.tagSystem.it;
      if (itWorm && !itWorm.isDead) {
        this.tagItGraphics
          .setPosition(itWorm.x - 10, itWorm.y - itWorm.height / 2 - 14)
          .setVisible(true);
      } else {
        this.tagItGraphics.setVisible(false);
      }
    }

    // ── Cameras: each follows its worm ───────────────────────────────────
    const [worm1, worm2] = state.worms;
    this.cameraFocusP1.setPosition(Math.round(worm1.x), Math.round(worm1.y));
    this.cameraFocusP2.setPosition(Math.round(worm2.x), Math.round(worm2.y));

    const cam1 = this.cameras.main;
    cam1.scrollX = Math.round(cam1.scrollX);
    cam1.scrollY = Math.round(cam1.scrollY);
    this.p2Camera.scrollX = Math.round(this.p2Camera.scrollX);
    this.p2Camera.scrollY = Math.round(this.p2Camera.scrollY);

    // ── HUD ──────────────────────────────────────────────────────────────
    this.hud.update(
      worm1, state.loadouts.get(worm1)!, state.getLives(worm1),
      worm2, state.loadouts.get(worm2)!, state.getLives(worm2),
      state.timeRemaining,
      state.tagSystem,
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Event processing
  // ════════════════════════════════════════════════════════════════════════

  private processEvent(event: GameEvent): void {
    switch (event.type) {
      case 'sound_fire':
        if (event.weaponId === 'minigun') this.audio.playMinigunShot();
        else                              this.audio.playFire();
        break;
      case 'sound_explosion':
        this.audio.playExplosion(event.big);
        break;
      case 'sound_jump':
        this.audio.playJump();
        break;
      case 'sound_rope':
        this.audio.playRopeShoot();
        break;
      case 'sound_pickup':
        this.audio.playPickup();
        break;
      case 'muzzle_flash':
        this.spawnMuzzleFlash(event.x, event.y);
        break;
      case 'screen_flash':
        this.triggerFlash(event.alpha);
        break;
      case 'camera_shake':
        this.cameras.main.shake(event.duration, event.intensity);
        this.p2Camera.shake(event.duration, event.intensity);
        break;
      case 'crate_spawn':
        this.createCrateVisual(event.crate.id, event.crate.x, event.crate.y);
        break;
      case 'crate_collect':
        this.destroyCrateVisual(event.crateId);
        break;
      case 'match_over':
        this.handleMatchOver(event);
        break;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Visual helpers
  // ════════════════════════════════════════════════════════════════════════

  private triggerFlash(alpha: number): void {
    this.tweens.killTweensOf(this.flashRect);
    this.flashRect.setAlpha(alpha);
    this.tweens.add({
      targets:  this.flashRect,
      alpha:    0,
      duration: 120,
      ease:     'Quad.easeOut',
    });
  }

  private spawnMuzzleFlash(x: number, y: number): void {
    const flash = this.add.circle(x, y, 7, 0xffffff, 1).setDepth(12);
    this.hudCamera.ignore(flash);
    this.tweens.add({
      targets:    flash,
      alpha:      0,
      scaleX:     2.5,
      scaleY:     2.5,
      duration:   90,
      onComplete: () => flash.destroy(),
    });
  }

  private createCrateVisual(id: number, x: number, y: number): void {
    const body = this.add
      .rectangle(x, y, CRATE_HALF * 2, CRATE_HALF * 2, 0xddaa00)
      .setDepth(6);
    const icon = this.add
      .text(x, y, '?', { fontSize: '10px', color: '#000000', fontFamily: 'monospace' })
      .setOrigin(0.5)
      .setDepth(7);

    this.hudCamera.ignore(body);
    this.hudCamera.ignore(icon);

    this.crateVisuals.set(id, { body, icon });
  }

  private destroyCrateVisual(crateId: number): void {
    const visual = this.crateVisuals.get(crateId);
    if (visual) {
      visual.body.destroy();
      visual.icon.destroy();
      this.crateVisuals.delete(crateId);
    }
  }

  private syncCrateVisuals(): void {
    const activeCrates = new Set(
      this.gameState.crateSystem.getCrates()
        .filter(c => c.active)
        .map(c => c.id),
    );
    for (const [id, visual] of this.crateVisuals) {
      if (!activeCrates.has(id)) {
        visual.body.destroy();
        visual.icon.destroy();
        this.crateVisuals.delete(id);
      }
    }
  }

  private handleMatchOver(event: GameEvent & { type: 'match_over' }): void {
    if (event.mode === 'tag') {
      this.time.delayedCall(800, () => {
        this.scene.start('TagOverScene', {
          winner: event.winner,
          times: event.tagTimes,
        });
      });
    } else {
      this.time.delayedCall(800, () => {
        this.scene.start('GameOverScene', { winner: event.winner });
      });
    }
  }
}
