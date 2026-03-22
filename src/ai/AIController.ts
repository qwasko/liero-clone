import { InputState, emptyInputState } from '../input/InputState';
import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { Loadout } from '../weapons/Loadout';
import { TerrainMap } from '../terrain/TerrainMap';
import { CrateData } from '../game/CrateSystem';

// ════════════════════════════════════════════════════════════════════════════
//  Difficulty presets
// ════════════════════════════════════════════════════════════════════════════

export interface AIDifficulty {
  readonly label: string;
  /** Multiplier on the viewport rectangle the AI can "see". */
  readonly visionMultiplier: number;
  /** Frames of reaction delay before the AI acts on new information. */
  readonly reactionFrames: number;
  /** Aim jitter in radians — added randomly to the ideal aim angle. */
  readonly aimJitter: number;
}

export const AI_DIFFICULTIES: Record<string, AIDifficulty> = {
  easy:   { label: 'Easy',   visionMultiplier: 0.8, reactionFrames: 30, aimJitter: 15 * Math.PI / 180 },
  medium: { label: 'Medium', visionMultiplier: 1.0, reactionFrames: 15, aimJitter:  7 * Math.PI / 180 },
  hard:   { label: 'Hard',   visionMultiplier: 1.5, reactionFrames:  5, aimJitter:  2 * Math.PI / 180 },
};

// ════════════════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════════════════

interface VisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type AIState = 'hunt' | 'search' | 'explore';

/** Snapshot of what the AI "sees" this frame. */
interface AIPerception {
  enemyVisible: boolean;
  enemyX: number;
  enemyY: number;
  /** Distance to enemy (or last-known position). */
  enemyDist: number;
  /** Angle from AI worm to enemy (radians, 0=right, -π/2=up). */
  enemyAngle: number;
  /** Projectiles visible inside vision rect (not owned by AI). */
  threats: Projectile[];
}

// ════════════════════════════════════════════════════════════════════════════
//  AI Controller
// ════════════════════════════════════════════════════════════════════════════

/** Memory timeout: seconds after losing sight before AI forgets enemy position. */
const MEMORY_DURATION = 3.0;

/** How often the AI picks a new explore direction (seconds). */
const EXPLORE_CHANGE_MIN = 3.0;
const EXPLORE_CHANGE_MAX = 5.0;


/**
 * Produces InputState each frame for an AI-controlled worm.
 * Uses the same interface as keyboard input — the game cannot tell
 * the difference between a human and this controller.
 *
 * The AI only "sees" objects inside a viewport-sized rectangle centered
 * on its worm, scaled by the difficulty's visionMultiplier.
 */
export class AIController {
  private difficulty: AIDifficulty;

  // ── State machine ────────────────────────────────────────────────────
  private state: AIState = 'explore';

  // ── Memory ───────────────────────────────────────────────────────────
  private lastKnownEnemyX = 0;
  private lastKnownEnemyY = 0;
  private memorySecs = 0; // seconds since enemy was last seen

  // ── Explore behaviour ────────────────────────────────────────────────
  private exploreDir: -1 | 1 = 1;
  private exploreTimer = 0;    // seconds until next direction change
  private exploreJumpCooldown = 0;

  // ── Reaction delay buffer ────────────────────────────────────────────
  private reactionBuffer: AIPerception[] = [];

  // ── Fire control ─────────────────────────────────────────────────────
  private fireHeld = false;   // track press/release for single-fire weapons
  private fireCooldown = 0;   // seconds — prevents full-auto spam
  private searchFireCooldown = 0;

  // ── Aim jitter (computed once per new target acquisition) ────────────
  private currentAimJitter = 0;
  private jitterChangeTimer = 0;

  constructor(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
    this.exploreTimer = this.randomExploreTime();
    this.currentAimJitter = this.randomJitter();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Public API
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Produce one frame of input.
   *
   * @param self      The AI's own worm
   * @param enemy     The opponent worm (may be outside vision)
   * @param loadout   The AI worm's current loadout
   * @param terrain   Terrain map for collision queries
   * @param projectiles All active projectiles (will be vision-filtered)
   * @param crates    All active crates (unused in Phase 1)
   * @param viewportW Viewport width in world pixels (canvas px / zoom)
   * @param viewportH Viewport height in world pixels
   * @param dt        Delta time in seconds
   */
  getInput(
    self: Worm,
    enemy: Worm,
    loadout: Loadout,
    terrain: TerrainMap,
    projectiles: Projectile[],
    _crates: CrateData[],
    viewportW: number,
    viewportH: number,
    dt: number,
  ): InputState {
    if (self.isDead) return emptyInputState();

    // ── Build vision rect ──────────────────────────────────────────────
    const vm = this.difficulty.visionMultiplier;
    const vw = viewportW * vm;
    const vh = viewportH * vm;
    const vision: VisionRect = {
      x: self.x - vw / 2,
      y: self.y - vh / 2,
      width: vw,
      height: vh,
    };

    // ── Perception: what does the AI see right now? ────────────────────
    const rawPerception = this.perceive(self, enemy, projectiles, vision);

    // ── Reaction delay: push raw, pop delayed ──────────────────────────
    this.reactionBuffer.push(rawPerception);
    const delayed = this.reactionBuffer.length > this.difficulty.reactionFrames
      ? this.reactionBuffer.shift()!
      : this.reactionBuffer[0]; // not enough frames yet — use oldest

    // ── Update memory ──────────────────────────────────────────────────
    if (delayed.enemyVisible) {
      this.lastKnownEnemyX = delayed.enemyX;
      this.lastKnownEnemyY = delayed.enemyY;
      this.memorySecs = 0;
    } else {
      this.memorySecs += dt;
    }

    // ── State transitions ──────────────────────────────────────────────
    if (delayed.enemyVisible) {
      this.state = 'hunt';
    } else if (this.memorySecs < MEMORY_DURATION) {
      this.state = 'search';
    } else {
      this.state = 'explore';
    }

    // ── Tick timers ────────────────────────────────────────────────────
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.searchFireCooldown = Math.max(0, this.searchFireCooldown - dt);
    this.exploreJumpCooldown = Math.max(0, this.exploreJumpCooldown - dt);
    this.jitterChangeTimer = Math.max(0, this.jitterChangeTimer - dt);
    if (this.jitterChangeTimer <= 0) {
      this.currentAimJitter = this.randomJitter();
      this.jitterChangeTimer = 0.8 + Math.random() * 1.2; // re-roll every 0.8-2s
    }

    // ── Produce input ──────────────────────────────────────────────────
    switch (this.state) {
      case 'hunt':   return this.doHunt(self, delayed, loadout, terrain, dt);
      case 'search': return this.doSearch(self, terrain, dt);
      case 'explore': return this.doExplore(self, terrain, dt);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Perception
  // ════════════════════════════════════════════════════════════════════════

  private perceive(
    self: Worm,
    enemy: Worm,
    projectiles: Projectile[],
    vision: VisionRect,
  ): AIPerception {
    const enemyVisible = !enemy.isDead && this.inRect(enemy.x, enemy.y, vision);

    const ex = enemyVisible ? enemy.x : this.lastKnownEnemyX;
    const ey = enemyVisible ? enemy.y : this.lastKnownEnemyY;
    const dx = ex - self.x;
    const dy = ey - self.y;

    const threats = projectiles.filter(
      p => p.active && p.ownerId !== self.playerId && this.inRect(p.x, p.y, vision),
    );

    return {
      enemyVisible,
      enemyX: ex,
      enemyY: ey,
      enemyDist: Math.sqrt(dx * dx + dy * dy),
      enemyAngle: Math.atan2(dy, dx),
      threats,
    };
  }

  private inRect(x: number, y: number, r: VisionRect): boolean {
    return x >= r.x && x <= r.x + r.width &&
           y >= r.y && y <= r.y + r.height;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  HUNT — enemy is visible
  // ════════════════════════════════════════════════════════════════════════

  private doHunt(
    self: Worm,
    perception: AIPerception,
    loadout: Loadout,
    terrain: TerrainMap,
    _dt: number,
  ): InputState {
    const input = emptyInputState();

    // ── Aim toward enemy ───────────────────────────────────────────────
    const desiredAngle = perception.enemyAngle + this.currentAimJitter;
    const targetAngle = this.toWormAimAngle(self, desiredAngle);
    const aimDiff = targetAngle - self.aimAngle;

    if (aimDiff < -0.05) {
      input.up = true;
    } else if (aimDiff > 0.05) {
      input.down = true;
    }

    // ── Face toward enemy ──────────────────────────────────────────────
    const dx = perception.enemyX - self.x;
    const wantFacingRight = dx >= 0;
    if (wantFacingRight !== self.facingRight) {
      // Tap the direction to flip facing
      if (wantFacingRight) input.right = true;
      else input.left = true;
    }

    // ── Move toward enemy ──────────────────────────────────────────────
    const absDx = Math.abs(dx);
    if (absDx > 30) {
      // Move toward, but not when very close (avoid running past)
      if (dx > 0) input.right = true;
      else input.left = true;
    }

    // ── Jump over walls ────────────────────────────────────────────────
    if (this.isBlockedHorizontally(self, terrain, input.right ? 1 : input.left ? -1 : 0)) {
      input.jump = true;
    }

    // ── Fire when aim is close enough ──────────────────────────────────
    const aimThreshold = this.difficulty.aimJitter + 0.15; // a little wider than jitter
    if (Math.abs(aimDiff) < aimThreshold && this.fireCooldown <= 0 && loadout.canFire()) {
      const weapon = loadout.activeWeapon;
      if (weapon.fireMode === 'auto') {
        input.fire = true;
        this.fireCooldown = 0.05; // tiny cooldown to avoid weird input
      } else {
        // Single-fire: toggle press/release
        if (!this.fireHeld) {
          input.fire = true;
          this.fireHeld = true;
          this.fireCooldown = 0.3 + Math.random() * 0.4; // 300-700ms between single shots
        } else {
          this.fireHeld = false;
        }
      }
    } else {
      this.fireHeld = false;
    }

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SEARCH — enemy was seen recently, move toward last known pos
  // ════════════════════════════════════════════════════════════════════════

  private doSearch(self: Worm, terrain: TerrainMap, _dt: number): InputState {
    const input = emptyInputState();

    const dx = this.lastKnownEnemyX - self.x;
    const dy = this.lastKnownEnemyY - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Move toward last known position
    if (dist > 20) {
      if (dx > 0) input.right = true;
      else input.left = true;
    }

    // Aim roughly toward last known direction
    const desiredAngle = Math.atan2(dy, dx);
    const targetAngle = this.toWormAimAngle(self, desiredAngle);
    const aimDiff = targetAngle - self.aimAngle;
    if (aimDiff < -0.1) input.up = true;
    else if (aimDiff > 0.1) input.down = true;

    // Jump over obstacles
    if (this.isBlockedHorizontally(self, terrain, dx > 0 ? 1 : -1)) {
      input.jump = true;
    }

    // Occasionally fire in the general direction
    if (this.searchFireCooldown <= 0 && Math.abs(aimDiff) < 0.5) {
      input.fire = true;
      this.searchFireCooldown = 1.5 + Math.random() * 2.0;
    }

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  EXPLORE — no information, wander randomly
  // ════════════════════════════════════════════════════════════════════════

  private doExplore(self: Worm, terrain: TerrainMap, dt: number): InputState {
    const input = emptyInputState();

    // Count down explore timer
    this.exploreTimer -= dt;
    if (this.exploreTimer <= 0) {
      this.exploreDir = Math.random() < 0.5 ? -1 : 1;
      this.exploreTimer = this.randomExploreTime();
    }

    // Walk in explore direction
    if (this.exploreDir > 0) input.right = true;
    else input.left = true;

    // Change direction when hitting a wall
    if (this.isBlockedHorizontally(self, terrain, this.exploreDir)) {
      // Try jumping first
      if (this.exploreJumpCooldown <= 0) {
        input.jump = true;
        this.exploreJumpCooldown = 0.8;
      } else {
        // Already tried jumping, flip direction
        this.exploreDir = (this.exploreDir * -1) as -1 | 1;
        this.exploreTimer = this.randomExploreTime();
      }
    }

    // Random occasional jumps
    if (Math.random() < 0.005) {
      input.jump = true;
    }

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Helpers
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Convert a world-space angle to the worm's aim angle coordinate system.
   * Worm aim: 0=horizontal (facing direction), -π/2=up, +π/3=down.
   * The worm's facing direction matters: if facing left, angles are mirrored.
   */
  private toWormAimAngle(self: Worm, worldAngle: number): number {
    // worldAngle: atan2(dy, dx), where 0=right, +π/2=down, -π/2=up
    // wormAimAngle: 0=horizontal forward, -π/2=up, +π/3=down
    // If facing right: wormAim = worldAngle
    // If facing left:  wormAim = π - worldAngle (mirror)
    let aim: number;
    if (self.facingRight) {
      aim = worldAngle;
    } else {
      aim = Math.PI - worldAngle;
      // Normalize to -π..π
      if (aim > Math.PI) aim -= 2 * Math.PI;
      if (aim < -Math.PI) aim += 2 * Math.PI;
    }
    return this.clampAimAngle(aim);
  }

  /** Clamp to the same range the WormController uses: -π/2 .. +π/3 */
  private clampAimAngle(angle: number): number {
    return Math.max(-Math.PI / 2, Math.min(Math.PI / 3, angle));
  }

  /** Check if there's solid terrain ahead at body level (simple wall detection). */
  private isBlockedHorizontally(self: Worm, terrain: TerrainMap, dir: -1 | 0 | 1): boolean {
    if (dir === 0) return false;
    const probeX = self.x + dir * (self.width / 2 + 3);
    // Check at mid-body and foot level
    return terrain.isSolid(Math.round(probeX), Math.round(self.y)) ||
           terrain.isSolid(Math.round(probeX), Math.round(self.y + self.height / 2 - 1));
  }

  private randomExploreTime(): number {
    return EXPLORE_CHANGE_MIN + Math.random() * (EXPLORE_CHANGE_MAX - EXPLORE_CHANGE_MIN);
  }

  private randomJitter(): number {
    return (Math.random() * 2 - 1) * this.difficulty.aimJitter;
  }
}
