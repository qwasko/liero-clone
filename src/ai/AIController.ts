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
  /** Frames of being stuck before AI attempts to dig. */
  readonly digStuckThreshold: number;
  /** Whether the AI uses rope navigation. */
  readonly useRope: boolean;
  /** 0-1: probability each frame of picking optimal weapon vs random. */
  readonly weaponSelectAccuracy: number;
}

export const AI_DIFFICULTIES: Record<string, AIDifficulty> = {
  easy: {
    label: 'Easy', visionMultiplier: 0.8, reactionFrames: 30, aimJitter: 15 * Math.PI / 180,
    digStuckThreshold: 30, useRope: false, weaponSelectAccuracy: 0.5,
  },
  medium: {
    label: 'Medium', visionMultiplier: 1.0, reactionFrames: 15, aimJitter: 7 * Math.PI / 180,
    digStuckThreshold: 10, useRope: true, weaponSelectAccuracy: 0.75,
  },
  hard: {
    label: 'Hard', visionMultiplier: 1.5, reactionFrames: 5, aimJitter: 2 * Math.PI / 180,
    digStuckThreshold: 6, useRope: true, weaponSelectAccuracy: 0.95,
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════════════════

interface VisionRect {
  x: number; y: number; width: number; height: number;
}

type AIState = 'engage' | 'approach' | 'search' | 'explore';

interface AIPerception {
  enemyVisible: boolean;
  enemyX: number;
  enemyY: number;
  enemyDist: number;
  enemyAngle: number;
  threats: Projectile[];
  /** True if a straight line from self to enemy is mostly unobstructed. */
  hasLineOfSight: boolean;
}

// ════════════════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════════════════

const MEMORY_DURATION = 3.0;
const EXPLORE_CHANGE_MIN = 3.0;
const EXPLORE_CHANGE_MAX = 5.0;

/** Weapon indices in DEFAULT_LOADOUT (after shotgun-first reorder). */
const WEAPON_IDX = {
  shotgun: 0, bazooka: 1, minigun: 2, grenade: 3,
  proximity_grenade: 4, larpa: 5, zimm: 6, cluster_bomb: 7,
  mine: 8, sticky_mine: 9, chiquita: 10,
} as const;

/** Range thresholds for weapon selection. */
const RANGE_CLOSE  = 100;
const RANGE_MEDIUM = 250;

/** Rope attempt cooldown — don't spam rope launches. */
const ROPE_COOLDOWN = 2.0;

/** Max frames to dig at rock before giving up and rerouting. */
const ROCK_DIG_TIMEOUT = 20;

// ════════════════════════════════════════════════════════════════════════════
//  AI Controller
// ════════════════════════════════════════════════════════════════════════════

export class AIController {
  private difficulty: AIDifficulty;

  // ── State machine ──────────────────────────────────────────────────
  private state: AIState = 'explore';

  // ── Memory ─────────────────────────────────────────────────────────
  private lastKnownEnemyX = 0;
  private lastKnownEnemyY = 0;
  private memorySecs = 0;

  // ── Explore ────────────────────────────────────────────────────────
  private exploreDir: -1 | 1 = 1;
  private exploreTimer = 0;
  private exploreJumpCooldown = 0;

  // ── Reaction delay ─────────────────────────────────────────────────
  private reactionBuffer: AIPerception[] = [];

  // ── Fire control ───────────────────────────────────────────────────
  private fireHeld = false;
  private fireCooldown = 0;
  private searchFireCooldown = 0;

  // ── Aim jitter ─────────────────────────────────────────────────────
  private currentAimJitter = 0;
  private jitterChangeTimer = 0;

  // ── Stuck detection ────────────────────────────────────────────────
  private lastX = 0;
  private lastY = 0;
  private stuckFrames = 0;

  // ── Digging state ──────────────────────────────────────────────────
  /** When true, the AI is in a dig sequence: first frame holds direction,
   *  next frame taps opposite to trigger the DiggingSystem rising edge. */
  private digPhase: 'idle' | 'hold' | 'tap' = 'idle';
  private digRockFrames = 0; // frames spent digging at rock — reroute if too many

  // ── Rope navigation ────────────────────────────────────────────────
  private ropeCooldown = 0;
  private ropeSwingFrames = 0; // frames on rope — release after enough swing

  // ── Weapon selection ───────────────────────────────────────────────
  private weaponCycleTarget = -1; // target weapon index, or -1 if satisfied
  private weaponCycleDir: -1 | 1 = 1;
  private weaponCycleCooldown = 0;

  constructor(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
    this.exploreTimer = this.randomExploreTime();
    this.currentAimJitter = this.randomJitter();
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Public API
  // ════════════════════════════════════════════════════════════════════════

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
    hasRope: boolean,
    hasHook: boolean,
  ): InputState {
    if (self.isDead) return emptyInputState();

    // ── Build vision rect ────────────────────────────────────────────
    const vm = this.difficulty.visionMultiplier;
    const vw = viewportW * vm;
    const vh = viewportH * vm;
    const vision: VisionRect = {
      x: self.x - vw / 2, y: self.y - vh / 2, width: vw, height: vh,
    };

    // ── Perception ───────────────────────────────────────────────────
    const rawPerception = this.perceive(self, enemy, projectiles, terrain, vision);

    // ── Reaction delay ───────────────────────────────────────────────
    this.reactionBuffer.push(rawPerception);
    const delayed = this.reactionBuffer.length > this.difficulty.reactionFrames
      ? this.reactionBuffer.shift()!
      : this.reactionBuffer[0];

    // ── Update memory ────────────────────────────────────────────────
    if (delayed.enemyVisible) {
      this.lastKnownEnemyX = delayed.enemyX;
      this.lastKnownEnemyY = delayed.enemyY;
      this.memorySecs = 0;
    } else {
      this.memorySecs += dt;
    }

    // ── State transitions ────────────────────────────────────────────
    if (delayed.enemyVisible) {
      if (delayed.enemyDist < RANGE_MEDIUM && delayed.hasLineOfSight) {
        this.state = 'engage';
      } else {
        this.state = 'approach';
      }
    } else if (this.memorySecs < MEMORY_DURATION) {
      this.state = 'search';
    } else {
      this.state = 'explore';
    }

    // ── Stuck detection ──────────────────────────────────────────────
    const moved = Math.abs(self.x - this.lastX) + Math.abs(self.y - this.lastY);
    if (moved < 0.5 && !hasRope) {
      this.stuckFrames++;
    } else {
      this.stuckFrames = 0;
      this.digPhase = 'idle';
      this.digRockFrames = 0;
    }
    this.lastX = self.x;
    this.lastY = self.y;

    // ── Tick timers ──────────────────────────────────────────────────
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.searchFireCooldown = Math.max(0, this.searchFireCooldown - dt);
    this.exploreJumpCooldown = Math.max(0, this.exploreJumpCooldown - dt);
    this.ropeCooldown = Math.max(0, this.ropeCooldown - dt);
    this.weaponCycleCooldown = Math.max(0, this.weaponCycleCooldown - dt);
    this.jitterChangeTimer = Math.max(0, this.jitterChangeTimer - dt);
    if (this.jitterChangeTimer <= 0) {
      this.currentAimJitter = this.randomJitter();
      this.jitterChangeTimer = 0.8 + Math.random() * 1.2;
    }

    // ── On rope: swing and release logic ─────────────────────────────
    if (hasRope) {
      return this.doRopeSwing(self);
    }

    // ── Weapon cycling in progress ───────────────────────────────────
    if (this.weaponCycleTarget >= 0 && this.weaponCycleTarget !== loadout.activeIndex) {
      return this.doWeaponCycle(loadout);
    }
    this.weaponCycleTarget = -1;

    // ── Produce input ────────────────────────────────────────────────
    switch (this.state) {
      case 'engage':  return this.doEngage(self, delayed, loadout, terrain, dt);
      case 'approach': return this.doApproach(self, delayed, loadout, terrain, dt, hasRope, hasHook);
      case 'search':  return this.doSearch(self, terrain, dt, hasRope, hasHook);
      case 'explore': return this.doExplore(self, terrain, dt);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Perception
  // ════════════════════════════════════════════════════════════════════════

  private perceive(
    self: Worm, enemy: Worm, projectiles: Projectile[],
    terrain: TerrainMap, vision: VisionRect,
  ): AIPerception {
    const enemyVisible = !enemy.isDead && this.inRect(enemy.x, enemy.y, vision);
    const ex = enemyVisible ? enemy.x : this.lastKnownEnemyX;
    const ey = enemyVisible ? enemy.y : this.lastKnownEnemyY;
    const dx = ex - self.x;
    const dy = ey - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const threats = projectiles.filter(
      p => p.active && p.ownerId !== self.playerId && this.inRect(p.x, p.y, vision),
    );

    const hasLineOfSight = enemyVisible ? this.checkLOS(self.x, self.y, ex, ey, terrain) : false;

    return {
      enemyVisible, enemyX: ex, enemyY: ey,
      enemyDist: dist, enemyAngle: Math.atan2(dy, dx),
      threats, hasLineOfSight,
    };
  }

  /** Raycast: sample terrain every 8px along the line. If > 30% is solid, no LOS. */
  private checkLOS(x1: number, y1: number, x2: number, y2: number, terrain: TerrainMap): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return true;
    const steps = Math.max(4, Math.ceil(dist / 8));
    let blocked = 0;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (terrain.isSolid(x1 + dx * t, y1 + dy * t)) blocked++;
    }
    return blocked / (steps - 1) < 0.3;
  }

  private inRect(x: number, y: number, r: VisionRect): boolean {
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ENGAGE — enemy visible, in range, has LOS → shoot primarily
  // ════════════════════════════════════════════════════════════════════════

  private doEngage(
    self: Worm, perception: AIPerception, loadout: Loadout,
    terrain: TerrainMap, _dt: number,
  ): InputState {
    const input = emptyInputState();
    const dx = perception.enemyX - self.x;

    // ── Weapon selection ─────────────────────────────────────────────
    this.maybeSelectWeapon(loadout, perception.enemyDist, perception.hasLineOfSight);

    // ── Aim toward enemy ─────────────────────────────────────────────
    const desiredAngle = perception.enemyAngle + this.currentAimJitter;
    const targetAngle = this.toWormAimAngle(self, desiredAngle);
    const aimDiff = targetAngle - self.aimAngle;
    if (aimDiff < -0.05) input.up = true;
    else if (aimDiff > 0.05) input.down = true;

    // ── Face toward enemy ────────────────────────────────────────────
    const wantRight = dx >= 0;
    if (wantRight !== self.facingRight) {
      if (wantRight) input.right = true; else input.left = true;
    }

    // ── Strafe / close distance slightly ─────────────────────────────
    const absDx = Math.abs(dx);
    if (absDx > 50) {
      if (dx > 0) input.right = true; else input.left = true;
    }

    // ── Navigation: jump/dig if stuck ────────────────────────────────
    this.applyNavigation(self, input, terrain, dx > 0 ? 1 : -1);

    // ── Fire ─────────────────────────────────────────────────────────
    this.applyFire(input, aimDiff, loadout);

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  APPROACH — enemy visible but far or no LOS → move toward, shoot opportunistically
  // ════════════════════════════════════════════════════════════════════════

  private doApproach(
    self: Worm, perception: AIPerception, loadout: Loadout,
    terrain: TerrainMap, _dt: number, hasRope: boolean, hasHook: boolean,
  ): InputState {
    const input = emptyInputState();
    const dx = perception.enemyX - self.x;
    const dy = perception.enemyY - self.y;

    // ── Weapon selection ─────────────────────────────────────────────
    this.maybeSelectWeapon(loadout, perception.enemyDist, perception.hasLineOfSight);

    // ── Aim toward enemy (with ballistic lob for grenades at range) ──
    let desiredAngle = perception.enemyAngle + this.currentAimJitter;
    // Lob compensation for high-gravity weapons at long range
    const wep = loadout.activeWeapon;
    if (wep.projectileGravity >= 0.8 && perception.enemyDist > 150) {
      const lobAngle = -0.35 - (perception.enemyDist - 150) * 0.001; // -20° to -35°
      desiredAngle = Math.atan2(dy, dx) + lobAngle + this.currentAimJitter;
    }
    const targetAngle = this.toWormAimAngle(self, desiredAngle);
    const aimDiff = targetAngle - self.aimAngle;
    if (aimDiff < -0.05) input.up = true;
    else if (aimDiff > 0.05) input.down = true;

    // ── Face toward enemy ────────────────────────────────────────────
    const wantRight = dx >= 0;
    if (wantRight !== self.facingRight) {
      if (wantRight) input.right = true; else input.left = true;
    }

    // ── Move toward enemy ────────────────────────────────────────────
    if (Math.abs(dx) > 20) {
      if (dx > 0) input.right = true; else input.left = true;
    }

    // ── Navigation ───────────────────────────────────────────────────
    const moveDir: -1 | 1 = dx > 0 ? 1 : -1;
    const blocked = this.isBlockedHorizontally(self, terrain, moveDir);
    if (blocked) {
      this.applyNavigation(self, input, terrain, moveDir);

      // ── Rope for large gaps / high obstacles ─────────────────────
      if (this.difficulty.useRope && !hasRope && !hasHook &&
          this.ropeCooldown <= 0 && this.stuckFrames > this.difficulty.digStuckThreshold * 2) {
        // Fire rope upward
        return this.doRopeLaunch(self);
      }
    }

    // ── Fire opportunistically ───────────────────────────────────────
    if (perception.hasLineOfSight) {
      this.applyFire(input, aimDiff, loadout);
    }

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  SEARCH — enemy recently seen, move toward last known pos
  // ════════════════════════════════════════════════════════════════════════

  private doSearch(
    self: Worm, terrain: TerrainMap, _dt: number,
    hasRope: boolean, hasHook: boolean,
  ): InputState {
    const input = emptyInputState();
    const dx = this.lastKnownEnemyX - self.x;
    const dy = this.lastKnownEnemyY - self.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 20) {
      if (dx > 0) input.right = true; else input.left = true;
    }

    // Aim toward last known direction
    const desiredAngle = Math.atan2(dy, dx);
    const targetAngle = this.toWormAimAngle(self, desiredAngle);
    const aimDiff = targetAngle - self.aimAngle;
    if (aimDiff < -0.1) input.up = true;
    else if (aimDiff > 0.1) input.down = true;

    // Navigation
    const moveDir: -1 | 1 = dx > 0 ? 1 : -1;
    this.applyNavigation(self, input, terrain, moveDir);

    // Rope for large obstacles
    if (this.difficulty.useRope && !hasRope && !hasHook &&
        this.ropeCooldown <= 0 && this.stuckFrames > this.difficulty.digStuckThreshold * 3) {
      return this.doRopeLaunch(self);
    }

    // Occasional fire
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

    this.exploreTimer -= dt;
    if (this.exploreTimer <= 0) {
      this.exploreDir = Math.random() < 0.5 ? -1 : 1;
      this.exploreTimer = this.randomExploreTime();
    }

    if (this.exploreDir > 0) input.right = true;
    else input.left = true;

    // Navigation (jump/dig)
    this.applyNavigation(self, input, terrain, this.exploreDir);

    // Flip direction if stuck too long even after digging
    if (this.stuckFrames > this.difficulty.digStuckThreshold * 3) {
      this.exploreDir = (this.exploreDir * -1) as -1 | 1;
      this.exploreTimer = this.randomExploreTime();
      this.stuckFrames = 0;
    }

    if (Math.random() < 0.005) input.jump = true;

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Navigation helpers (dig, jump, reroute)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Apply jump/dig logic to the input when the AI is stuck or blocked.
   * Modifies `input` in place. May override left/right for dig tap sequence.
   */
  private applyNavigation(
    self: Worm, input: InputState, terrain: TerrainMap, moveDir: -1 | 0 | 1,
  ): void {
    if (moveDir === 0) return;
    const blocked = this.isBlockedHorizontally(self, terrain, moveDir);

    if (!blocked) {
      // Not blocked — check for small drop or gap ahead (still jump over small bumps)
      return;
    }

    // ── Phase 1: Try jumping (small obstacles) ───────────────────────
    if (this.stuckFrames < this.difficulty.digStuckThreshold) {
      input.jump = true;
      return;
    }

    // ── Phase 2: Dig through (if diggable dirt) ──────────────────────
    const probeX = self.x + moveDir * (self.width / 2 + 5);
    const probeY = self.y;
    const isRock = terrain.isRock(Math.round(probeX), Math.round(probeY));

    if (isRock) {
      this.digRockFrames++;
      if (this.digRockFrames > ROCK_DIG_TIMEOUT) {
        // Rock reroute: try moving vertically
        this.digRockFrames = 0;
        this.digPhase = 'idle';
        // Try jumping up, or if we've been trying, flip direction
        input.jump = true;
        if (this.stuckFrames > this.difficulty.digStuckThreshold * 2) {
          // Give up going this way — flip explore direction
          if (moveDir > 0) { input.right = false; input.left = true; }
          else { input.left = false; input.right = true; }
        }
        return;
      }
    } else {
      this.digRockFrames = 0;
    }

    // Dig sequence: two-frame pattern to trigger DiggingSystem rising edge
    // Frame 1: hold movement direction only
    // Frame 2: hold movement direction AND tap opposite → DiggingSystem detects rising edge
    if (this.digPhase === 'idle' || this.digPhase === 'tap') {
      // Start or restart: hold direction only
      this.digPhase = 'hold';
      if (moveDir > 0) { input.right = true; input.left = false; }
      else { input.left = true; input.right = false; }
    } else if (this.digPhase === 'hold') {
      // Tap opposite while still holding direction → triggers dig
      this.digPhase = 'tap';
      if (moveDir > 0) { input.right = true; input.left = true; }
      else { input.left = true; input.right = true; }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Rope navigation
  // ════════════════════════════════════════════════════════════════════════

  /** Launch rope upward toward ceiling. Returns InputState for this frame. */
  private doRopeLaunch(self: Worm): InputState {
    const input = emptyInputState();
    // Aim upward before launching
    input.up = self.aimAngle > -Math.PI / 3; // aim up if not already
    input.change = true;
    input.jump = true; // CHANGE + JUMP launches rope
    this.ropeCooldown = ROPE_COOLDOWN;
    this.ropeSwingFrames = 0;
    return input;
  }

  /** While on rope: swing toward enemy, then release. */
  private doRopeSwing(self: Worm): InputState {
    const input = emptyInputState();
    this.ropeSwingFrames++;

    // Swing toward target (last known enemy or explore direction)
    const targetX = this.memorySecs < MEMORY_DURATION
      ? this.lastKnownEnemyX
      : self.x + this.exploreDir * 100;

    if (targetX > self.x) input.right = true;
    else input.left = true;

    // Shorten rope to gain height
    if (this.ropeSwingFrames < 20) {
      input.change = true;
      input.up = true;
    }

    // Release after enough swing time (40-70 frames = ~0.7-1.2s)
    const releaseTime = 40 + Math.floor(Math.random() * 30);
    if (this.ropeSwingFrames > releaseTime) {
      // Release: JUMP alone (no CHANGE)
      input.jump = true;
      input.change = false;
      this.ropeSwingFrames = 0;
    }

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Weapon selection
  // ════════════════════════════════════════════════════════════════════════

  /** Decide which weapon to use based on range and LOS. Sets weaponCycleTarget. */
  private maybeSelectWeapon(loadout: Loadout, dist: number, hasLOS: boolean): void {
    // Don't re-select if already cycling or recently selected
    if (this.weaponCycleTarget >= 0 || this.weaponCycleCooldown > 0) return;

    // Random chance to skip optimal selection (difficulty scaling)
    if (Math.random() > this.difficulty.weaponSelectAccuracy) return;

    let target: number;

    if (dist < RANGE_CLOSE && hasLOS) {
      // Close range: shotgun or minigun
      target = Math.random() < 0.6 ? WEAPON_IDX.shotgun : WEAPON_IDX.minigun;
    } else if (dist < RANGE_MEDIUM && hasLOS) {
      // Medium range with LOS: bazooka or minigun
      target = Math.random() < 0.7 ? WEAPON_IDX.bazooka : WEAPON_IDX.minigun;
    } else if (dist >= RANGE_MEDIUM && hasLOS) {
      // Long range with LOS: minigun or zimm
      target = Math.random() < 0.5 ? WEAPON_IDX.minigun : WEAPON_IDX.zimm;
    } else {
      // No LOS: grenade (lob over terrain) or cluster bomb
      target = Math.random() < 0.6 ? WEAPON_IDX.grenade : WEAPON_IDX.cluster_bomb;
    }

    if (target === loadout.activeIndex) return; // already on it

    // Determine shortest cycling direction
    const total = 11; // DEFAULT_LOADOUT length
    const fwd = (target - loadout.activeIndex + total) % total;
    const bwd = (loadout.activeIndex - target + total) % total;
    this.weaponCycleDir = fwd <= bwd ? 1 : -1;
    this.weaponCycleTarget = target;
    this.weaponCycleCooldown = 3.0 + Math.random() * 2.0; // don't re-evaluate for a few seconds
  }

  /** Cycle toward target weapon index using CHANGE + LEFT/RIGHT. */
  private doWeaponCycle(_loadout: Loadout): InputState {
    const input = emptyInputState();
    input.change = true;
    if (this.weaponCycleDir > 0) input.right = true;
    else input.left = true;

    // Check if we reached the target
    // (the actual cycling is done by GameState, we just hold the input)
    // We hold for one frame then release to get one step
    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Fire logic (shared between states)
  // ════════════════════════════════════════════════════════════════════════

  private applyFire(input: InputState, aimDiff: number, loadout: Loadout): void {
    const aimThreshold = this.difficulty.aimJitter + 0.15;
    if (Math.abs(aimDiff) < aimThreshold && this.fireCooldown <= 0 && loadout.canFire()) {
      const weapon = loadout.activeWeapon;
      if (weapon.fireMode === 'auto') {
        input.fire = true;
        this.fireCooldown = 0.05;
      } else {
        if (!this.fireHeld) {
          input.fire = true;
          this.fireHeld = true;
          this.fireCooldown = 0.3 + Math.random() * 0.4;
        } else {
          this.fireHeld = false;
        }
      }
    } else {
      this.fireHeld = false;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Helpers
  // ════════════════════════════════════════════════════════════════════════

  private toWormAimAngle(self: Worm, worldAngle: number): number {
    let aim: number;
    if (self.facingRight) {
      aim = worldAngle;
    } else {
      aim = Math.PI - worldAngle;
      if (aim > Math.PI) aim -= 2 * Math.PI;
      if (aim < -Math.PI) aim += 2 * Math.PI;
    }
    return this.clampAimAngle(aim);
  }

  private clampAimAngle(angle: number): number {
    return Math.max(-Math.PI / 2, Math.min(Math.PI / 3, angle));
  }

  private isBlockedHorizontally(self: Worm, terrain: TerrainMap, dir: -1 | 0 | 1): boolean {
    if (dir === 0) return false;
    const probeX = self.x + dir * (self.width / 2 + 3);
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
