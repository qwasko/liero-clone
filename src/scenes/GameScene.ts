import Phaser from 'phaser';
import { InputManager } from '../input/InputManager';
import { InputState } from '../input/InputState';
import { TerrainGenerator } from '../terrain/TerrainGenerator';
import { TerrainRenderer } from '../terrain/TerrainRenderer';
import { AudioManager } from '../utils/AudioManager';
import { HUD } from '../ui/HUD';
import { Minimap } from '../ui/Minimap';
import { GameState } from '../game/GameState';
import { GameRenderer } from '../game/GameRenderer';
import { GameEvent } from '../game/GameEvents';
import { LEVEL_PRESETS } from '../game/LevelPreset';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { CRATE_HALF } from '../game/CrateSystem';
import { AIController, AI_DIFFICULTIES } from '../ai/AIController';
import { GameSettings, PlayerType, loadSettings } from '../game/GameSettings';
import { NetworkClient } from '../network/NetworkClient';
import { LockstepManager } from '../network/LockstepManager';
import type { NetGameSettings } from '../network/protocol';

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
  private minimap!: Minimap;

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

  // AI controllers (null = human)
  private aiController1: AIController | null = null;
  private aiController2: AIController | null = null;

  // Tag mode "IT" indicator
  private tagItGraphics: Phaser.GameObjects.Text | null = null;

  // Crate visuals synced to GameState crate data
  private crateVisuals = new Map<number, { body: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Text }>();

  // Pause menu
  private paused = false;
  private pauseOverlay: Phaser.GameObjects.GameObject[] = [];
  private pauseSelected = 0;

  // Online multiplayer
  private isOnline = false;
  private networkClient: NetworkClient | null = null;
  private lockstepManager: LockstepManager | null = null;
  private localPlayerIndex: 0 | 1 = 0;
  private stallText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(data?: {
    settings?: GameSettings;
    online?: {
      socket: import('socket.io-client').Socket;
      seed: number;
      settings: NetGameSettings;
      playerIndex: 0 | 1;
    };
  }): void {
    // ── Clean up stale state from previous game ──────────────────────────
    if (this.textures.exists('terrain')) {
      this.textures.remove('terrain');
    }
    if (this.textures.exists('minimap1')) this.textures.remove('minimap1');
    if (this.textures.exists('minimap2')) this.textures.remove('minimap2');
    this.crateVisuals.clear();
    this.isOnline = !!data?.online;
    this.networkClient = null;
    this.lockstepManager = null;
    this.stallText = null;

    // ── Settings ─────────────────────────────────────────────────────────
    const online = data?.online;
    let mode: 'normal' | 'tag';
    let levelIndex: number;
    let reloadMultiplier: number;
    let matchDuration: number;
    let lives: number;
    let p1Hp: number;
    let p2Hp: number;
    let seed: number | undefined;

    if (online) {
      // Online mode: use settings from the server (host's settings)
      const ns = online.settings;
      mode = ns.gameMode;
      levelIndex = ns.levelIndex;
      reloadMultiplier = ns.reloadMultiplier;
      matchDuration = ns.matchDurationSeconds > 0 ? ns.matchDurationSeconds : Infinity;
      lives = ns.lives;
      p1Hp = ns.p1Hp;
      p2Hp = ns.p2Hp;
      seed = online.seed;
      this.localPlayerIndex = online.playerIndex;
    } else {
      // Local mode: use local settings
      const settings = data?.settings ?? loadSettings();
      mode = settings.gameMode;
      levelIndex = settings.levelIndex;
      reloadMultiplier = settings.reloadSpeedPercent / 100;
      matchDuration = settings.matchTimerMinutes > 0 ? settings.matchTimerMinutes * 60 : Infinity;
      lives = settings.lives;
      p1Hp = settings.p1Hp;
      p2Hp = settings.p2Hp;
    }

    const settings = data?.settings ?? loadSettings();
    const level = LEVEL_PRESETS[levelIndex] ?? LEVEL_PRESETS[0];
    const halfW = CANVAS_WIDTH / 2;

    // ── Terrain ──────────────────────────────────────────────────────────
    const spawnP1 = { x: level.width * 0.25, y: level.height * 0.44 };
    const spawnP2 = { x: level.width * 0.75, y: level.height * 0.44 };
    const terrain = TerrainGenerator.generate(level.width, level.height, [spawnP1, spawnP2], level.terrain, seed);
    this.terrainRenderer = new TerrainRenderer(this, terrain);

    // ── GameState ────────────────────────────────────────────────────────
    this.gameState = new GameState(terrain, level, mode, {
      lives,
      reloadMultiplier,
      matchDurationSeconds: matchDuration,
      p1Hp,
      p2Hp,
      seed,
    });
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
    this.inputManager = new InputManager(this.input.keyboard!, settings.p1Keys, settings.p2Keys);
    this.audio        = new AudioManager();

    // ── AI controllers (disabled in online mode) ────────────────────────
    this.aiController1 = null;
    this.aiController2 = null;
    if (!this.isOnline) {
      const makeAI = (playerType: PlayerType): AIController | null => {
        if (playerType === 'human') return null;
        const diffKey = playerType.replace('ai_', '');
        const diff = AI_DIFFICULTIES[diffKey] ?? AI_DIFFICULTIES['medium'];
        return new AIController(diff, settings.botUseMinimap);
      };
      this.aiController1 = makeAI(settings.player1Type);
      this.aiController2 = makeAI(settings.player2Type);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Splitscreen camera setup
    // ════════════════════════════════════════════════════════════════════

    // ── P1 camera (left half, above HUD) ──────────────────────────────────
    const vpH = CANVAS_HEIGHT - HUD.HEIGHT;
    const cam1 = this.cameras.main;
    cam1.setViewport(0, 0, halfW, vpH);
    cam1.setZoom(settings.p1Zoom);
    cam1.setBounds(0, 0, level.width, level.height);
    cam1.setRoundPixels(true);

    this.cameraFocusP1 = this.add.zone(spawnP1.x, spawnP1.y, 1, 1);
    cam1.startFollow(this.cameraFocusP1);

    // ── P2 camera (right half, above HUD) ────────────────────────────────
    this.p2Camera = this.cameras.add(halfW, 0, halfW, vpH);
    this.p2Camera.setZoom(settings.p2Zoom);
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

    // ── Divider line (2px dark line at center, viewport height only) ─────
    this.divider = this.add.rectangle(halfW, vpH / 2, 2, vpH, 0x222222, 1)
      .setScrollFactor(0).setDepth(55);

    // ── HUD (splitscreen layout) ─────────────────────────────────────────
    this.hud = new HUD(this, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── Minimap ────────────────────────────────────────────────────────────
    this.minimap = new Minimap(this, terrain);
    if (!settings.minimapEnabled) {
      this.minimap.toggle();
    }

    // Toggle minimap with Tab
    this.input.keyboard!.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault();
      this.minimap.toggle();
    });

    // Pause menu with ESC
    this.paused = false;
    this.pauseOverlay = [];
    this.pauseSelected = 0;
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.gameState.matchOver) return;
      if (this.paused) this.resumeGame();
      else this.showPauseMenu();
    });

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
      ...this.minimap.objects,
    ];
    for (const obj of hudObjects) {
      cam1.ignore(obj);
      this.p2Camera.ignore(obj);
    }

    // ── Online multiplayer setup ────────────────────────────────────────
    if (online) {
      this.networkClient = new NetworkClient(online.socket);
      this.lockstepManager = new LockstepManager(
        this.networkClient,
        this.localPlayerIndex,
        (dt, input1, input2) => this.tickAndRender(dt, input1, input2),
        (stalled) => this.onStallChange(stalled),
        () => this.onNetworkDisconnect(),
      );

      // Stall overlay text (hidden by default)
      this.stallText = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 'Waiting for opponent...', {
        fontSize: '20px', color: '#ffcc00', fontFamily: 'monospace',
        backgroundColor: '#000000aa',
        padding: { x: 16, y: 8 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setVisible(false);
      cam1.ignore(this.stallText);
      this.p2Camera.ignore(this.stallText);
    }
  }

  update(_time: number, delta: number): void {
    if (this.paused || this.gameState.matchOver) return;

    if (this.isOnline && this.lockstepManager) {
      // ── Online mode: feed local input to lockstep manager ─────────────
      const localInput = this.inputManager.getPlayer1(); // always use P1 keys for local player
      this.lockstepManager.update(localInput);
    } else {
      // ── Local mode: get inputs and tick directly ──────────────────────
      // Cap dt to 1/60 so local physics matches lockstep (which runs at fixed 1/60).
      // Without the cap, >60fps monitors get smaller dt per tick, making forces feel lighter.
      const dt     = Math.min(delta / 1000, 1 / 60);
      const state  = this.gameState;
      const [worm1, worm2] = state.worms;

      // P1 input: keyboard or AI
      let input1;
      if (this.aiController1) {
        const loadout1 = state.loadouts.get(worm1)!;
        const zoom1 = this.cameras.main.zoom;
        const vpW1  = (CANVAS_WIDTH / 2) / zoom1;
        const vpH1  = (CANVAS_HEIGHT - HUD.HEIGHT) / zoom1;
        const crates = state.crateSystem.getCrates().filter(c => c.active);
        const rope   = state.ropeSystem;
        input1 = this.aiController1.getInput(
          worm1, worm2, loadout1,
          state.terrain, state.activeProjectiles,
          crates, vpW1, vpH1, dt,
          rope.hasRope(worm1), rope.hasHook(worm1),
        );
      } else {
        input1 = this.inputManager.getPlayer1();
      }

      // P2 input: keyboard or AI
      let input2;
      if (this.aiController2) {
        const loadout2 = state.loadouts.get(worm2)!;
        const zoom2 = this.p2Camera.zoom;
        const vpW2  = (CANVAS_WIDTH / 2) / zoom2;
        const vpH2  = (CANVAS_HEIGHT - HUD.HEIGHT) / zoom2;
        const crates = state.crateSystem.getCrates().filter(c => c.active);
        const rope   = state.ropeSystem;
        input2 = this.aiController2.getInput(
          worm2, worm1, loadout2,
          state.terrain, state.activeProjectiles,
          crates, vpW2, vpH2, dt,
          rope.hasRope(worm2), rope.hasHook(worm2),
        );
      } else {
        input2 = this.inputManager.getPlayer2();
      }

      this.tickAndRender(dt, input1, input2);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Core tick + render (called by both local update and lockstep manager)
  // ════════════════════════════════════════════════════════════════════════

  private tickAndRender(dt: number, input1: InputState, input2: InputState): void {
    const state = this.gameState;

    // ── Tick game logic ──────────────────────────────────────────────────
    const events = state.update(dt, input1, input2);

    // ── Process events ───────────────────────────────────────────────────
    for (const event of events) {
      this.processEvent(event);
    }

    // ── Sync terrain renderer ────────────────────────────────────────────
    const dirty = state.terrainDestroyer.flushDirty();
    for (const region of dirty) {
      this.terrainRenderer.redrawRegion(
        state.terrain, region.x, region.y, region.w, region.h,
      );
    }

    // ── Sync crate visuals ───────────────────────────────────────────────
    this.syncCrateVisuals();

    // ── Draw ─────────────────────────────────────────────────────────────
    const [worm1, worm2] = state.worms;
    this.gameRenderer.drawWorms(this.wormLayer, state.worms);
    this.particleLayer.clear();

    this.overlayGraphics.clear();
    state.ropeSystem.draw(this.overlayGraphics);
    this.gameRenderer.drawAimLines(this.overlayGraphics, state.worms);
    this.gameRenderer.drawProjectiles(this.overlayGraphics, state.activeProjectiles, this.time.now, dt);

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
    this.cameraFocusP1.setPosition(Math.round(worm1.x), Math.round(worm1.y));
    this.cameraFocusP2.setPosition(Math.round(worm2.x), Math.round(worm2.y));

    const cam1 = this.cameras.main;
    cam1.scrollX = Math.round(cam1.scrollX);
    cam1.scrollY = Math.round(cam1.scrollY);
    this.p2Camera.scrollX = Math.round(this.p2Camera.scrollX);
    this.p2Camera.scrollY = Math.round(this.p2Camera.scrollY);

    // ── Minimap ────────────────────────────────────────────────────────────
    this.minimap.update(
      state.worms,
      state.activeProjectiles,
      state.crateSystem.getCrates(),
    );

    // ── HUD ──────────────────────────────────────────────────────────────
    this.hud.update(
      worm1, state.loadouts.get(worm1)!, state.getLives(worm1),
      worm2, state.loadouts.get(worm2)!, state.getLives(worm2),
      state.timeRemaining,
      state.tagSystem,
      state.maxHp,
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Online multiplayer callbacks
  // ════════════════════════════════════════════════════════════════════════

  private onStallChange(stalled: boolean): void {
    console.log('[GameScene] onStallChange:', stalled, 'stallText exists:', !!this.stallText);
    if (this.stallText) {
      this.stallText.setVisible(stalled);
      console.log('[GameScene] stallText.visible set to:', stalled);
    }
  }

  private onNetworkDisconnect(): void {
    // Clean up network
    this.lockstepManager?.destroy();
    this.lockstepManager = null;
    this.networkClient = null;

    // Show disconnect message briefly, then return to menu
    if (this.stallText) {
      this.stallText.setText('Opponent disconnected');
      this.stallText.setStyle({
        fontSize: '20px', color: '#ff4444', fontFamily: 'monospace',
        backgroundColor: '#000000aa',
        padding: { x: 16, y: 8 },
      });
      this.stallText.setVisible(true);
    }
    this.time.delayedCall(2000, () => {
      this.scene.start('MenuScene');
    });
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
      case 'impact_ring':
        this.gameRenderer.spawnImpactRing(event.x, event.y, event.radius);
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
  //  Pause menu
  // ════════════════════════════════════════════════════════════════════════

  private showPauseMenu(): void {
    this.paused = true;
    this.pauseSelected = 0;

    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;

    const bg = this.add.rectangle(cx, cy, CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(100);

    const title = this.add.text(cx, cy - 60, 'PAUSED', {
      fontSize: '36px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    const items = ['CONTINUE', 'NEW GAME'];
    const texts = items.map((label, i) =>
      this.add.text(cx, cy + 10 + i * 36, label, {
        fontSize: '22px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101),
    );

    this.pauseOverlay = [bg, title, ...texts];

    // Hide from world cameras, show only on HUD camera
    for (const obj of this.pauseOverlay) {
      this.cameras.main.ignore(obj);
      this.p2Camera.ignore(obj);
    }

    const refreshPause = () => {
      texts.forEach((t, i) => {
        const active = i === this.pauseSelected;
        t.setText(active ? `▶ ${items[i]}` : `  ${items[i]}`);
        t.setStyle({
          fontSize: active ? '24px' : '20px',
          color: active ? '#ffffff' : '#444444',
          fontFamily: 'monospace',
        });
      });
    };
    refreshPause();

    const onUp = () => { this.pauseSelected = (this.pauseSelected + 1) % 2; refreshPause(); };
    const onDown = () => { this.pauseSelected = (this.pauseSelected + 1) % 2; refreshPause(); };
    const onEnter = () => {
      cleanup();
      if (this.pauseSelected === 0) this.resumeGame();
      else this.scene.start('MenuScene');
    };

    const keys = this.input.keyboard!;
    keys.on('keydown-UP', onUp);
    keys.on('keydown-DOWN', onDown);
    keys.on('keydown-ENTER', onEnter);

    const cleanup = () => {
      keys.off('keydown-UP', onUp);
      keys.off('keydown-DOWN', onDown);
      keys.off('keydown-ENTER', onEnter);
    };

    // Store cleanup so resumeGame can call it
    (this as any)._pauseCleanup = cleanup;
  }

  private resumeGame(): void {
    (this as any)._pauseCleanup?.();
    for (const obj of this.pauseOverlay) obj.destroy();
    this.pauseOverlay = [];
    this.paused = false;
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
    // Clean up network on match end
    if (this.isOnline) {
      this.lockstepManager?.destroy();
      this.lockstepManager = null;
      this.networkClient = null;
    }

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
