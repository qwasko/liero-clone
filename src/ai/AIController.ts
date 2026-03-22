import { InputState, emptyInputState } from '../input/InputState';
import { Worm } from '../entities/Worm';
import { Projectile } from '../entities/Projectile';
import { Loadout } from '../weapons/Loadout';
import { WeaponDef } from '../weapons/WeaponDef';
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
  /** 0-1: how cautious about self-damage from explosives (1=very cautious, 0=reckless). */
  readonly selfDamageAwareness: number;
  /** 0-1: probability of attempting rope escape after throwing explosive. */
  readonly escapeRopeProbability: number;
}

export const AI_DIFFICULTIES: Record<string, AIDifficulty> = {
  easy: {
    label: 'Easy', visionMultiplier: 0.8, reactionFrames: 30, aimJitter: 15 * Math.PI / 180,
    digStuckThreshold: 30, useRope: false, weaponSelectAccuracy: 0.5,
    selfDamageAwareness: 0.9, escapeRopeProbability: 0.15,
  },
  medium: {
    label: 'Medium', visionMultiplier: 1.0, reactionFrames: 15, aimJitter: 7 * Math.PI / 180,
    digStuckThreshold: 10, useRope: true, weaponSelectAccuracy: 0.75,
    selfDamageAwareness: 0.6, escapeRopeProbability: 0.45,
  },
  hard: {
    label: 'Hard', visionMultiplier: 6, reactionFrames: 5, aimJitter: 2 * Math.PI / 180,
    digStuckThreshold: 6, useRope: true, weaponSelectAccuracy: 0.95,
    selfDamageAwareness: 0.3, escapeRopeProbability: 0.75,
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
  /** Type of obstacle blocking LOS: 'none', 'dirt' (diggable), 'rock', 'mixed'. */
  blockType: 'none' | 'dirt' | 'rock' | 'mixed';
  /** Approximate thickness of blocking terrain in pixels (0 if none). */
  blockThickness: number;
  /** True if the enemy angle falls in the worm's aim dead zone (below +π/3). */
  inDeadAngle: boolean;
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

/** Weapons with significant self-damage risk from splash. */
const EXPLOSIVE_WEAPONS = new Set([
  'bazooka', 'grenade', 'proximity_grenade', 'larpa',
  'cluster_bomb', 'chiquita', 'zimm',
]);

/** Safe fallback weapon indices (direct-fire, small craters). */
const SAFE_WEAPON_INDICES = [WEAPON_IDX.shotgun, WEAPON_IDX.minigun];

/** Game gravity constant for ballistic estimation. */
const GRAVITY_PXS2 = 600;

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

  // ── Throw-and-swing escape ───────────────────────────────────
  private escapePhase: 'none' | 'wait' | 'launch' = 'none';
  private escapeFrames = 0;
  private escapeTargetFrames = 0;
  /** When true, doRopeSwing swings away from enemy instead of toward. */
  private swingAway = false;

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

    // ── Throw-and-swing escape sequence ──────────────────────────────
    if (this.escapePhase === 'wait') {
      this.escapeFrames++;
      if (this.escapeFrames >= this.escapeTargetFrames) {
        this.escapePhase = 'launch';
      }
    }
    if (this.escapePhase === 'launch' && !hasRope && !hasHook) {
      this.escapePhase = 'none';
      this.swingAway = true;
      return this.doRopeLaunch(self);
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
    const angle = Math.atan2(dy, dx);

    const threats = projectiles.filter(
      p => p.active && p.ownerId !== self.playerId && this.inRect(p.x, p.y, vision),
    );

    const hasLineOfSight = enemyVisible ? this.checkLOS(self.x, self.y, ex, ey, terrain) : false;

    // Obstacle analysis
    let blockType: 'none' | 'dirt' | 'rock' | 'mixed' = 'none';
    let blockThickness = 0;
    if (enemyVisible && !hasLineOfSight) {
      const obs = this.probeObstacle(self.x, self.y, ex, ey, terrain);
      blockType = obs.type;
      blockThickness = obs.thickness;
    }

    // Dead angle: enemy angle (in worm-aim space) falls outside aimable range
    // Worm can aim from -π/2 (up) to +π/3 (60° below horizontal)
    // Check if the world angle, after facing conversion, would be clamped
    const aimAngle = this.toWormAimAngle(self, angle);
    const unclamped = self.facingRight ? angle : (() => {
      let a = Math.PI - angle;
      if (a > Math.PI) a -= 2 * Math.PI;
      if (a < -Math.PI) a += 2 * Math.PI;
      return a;
    })();
    const inDeadAngle = enemyVisible && Math.abs(unclamped - aimAngle) > 0.15;

    return {
      enemyVisible, enemyX: ex, enemyY: ey,
      enemyDist: dist, enemyAngle: angle,
      threats, hasLineOfSight,
      blockType, blockThickness, inDeadAngle,
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

  /** Probe the obstacle between two points: classify as dirt/rock/mixed and measure thickness. */
  private probeObstacle(
    x1: number, y1: number, x2: number, y2: number, terrain: TerrainMap,
  ): { type: 'none' | 'dirt' | 'rock' | 'mixed'; thickness: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return { type: 'none', thickness: 0 };

    const steps = Math.max(4, Math.ceil(dist / 4)); // sample every 4px
    let solidCount = 0;
    let rockCount = 0;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = Math.round(x1 + dx * t);
      const py = Math.round(y1 + dy * t);
      if (terrain.isSolid(px, py)) {
        solidCount++;
        if (terrain.isRock(px, py)) rockCount++;
      }
    }
    if (solidCount === 0) return { type: 'none', thickness: 0 };
    const thickness = solidCount * (dist / steps); // approximate px of solid
    if (rockCount === solidCount) return { type: 'rock', thickness };
    if (rockCount === 0) return { type: 'dirt', thickness };
    return { type: 'mixed', thickness };
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
    const dy = perception.enemyY - self.y;

    // ── Dead angle escape ────────────────────────────────────────────
    if (perception.inDeadAngle) {
      // Enemy directly below → strafe out of dead zone
      if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
        const escapeDir = self.facingRight ? 1 : -1;
        if (escapeDir > 0) input.right = true; else input.left = true;
        if (self.aimAngle < Math.PI / 3 - 0.05) input.down = true;
        this.applyFire(input, 0.1, loadout, self, terrain, perception.enemyDist);
        return input;
      }
      // Enemy directly above → aim up (worm CAN aim straight up)
      // Just move slightly to side so we're not in the narrow dig dead zone
      if (dy < 0 && Math.abs(dx) < 10) {
        input.right = true; // nudge sideways
      }
    }

    // ── Weapon selection ─────────────────────────────────────────────
    this.maybeSelectWeapon(loadout, perception.enemyDist, perception.hasLineOfSight,
      perception.blockType, perception.blockThickness);

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
    this.applyFire(input, aimDiff, loadout, self, terrain, perception.enemyDist);

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

    // ── Dead angle escape ────────────────────────────────────────────
    // Enemy directly below us beyond aim range → move horizontally to get angle
    if (perception.inDeadAngle && Math.abs(dy) > Math.abs(dx) && dy > 0) {
      // Move horizontally to escape dead zone (pick direction away from nearest wall)
      const escapeDir = self.facingRight ? 1 : -1;
      if (escapeDir > 0) input.right = true; else input.left = true;
      // Aim as far down as possible
      if (self.aimAngle < Math.PI / 3 - 0.05) input.down = true;
      // Still fire — projectile gravity will help curve downward
      this.applyFire(input, 0.1, loadout, self, terrain, perception.enemyDist);
      return input;
    }

    // ── Weapon selection (obstacle-aware) ────────────────────────────
    this.maybeSelectWeapon(loadout, perception.enemyDist, perception.hasLineOfSight,
      perception.blockType, perception.blockThickness);

    // ── Aim toward enemy (with ballistic lob for grenades at range) ──
    let desiredAngle = perception.enemyAngle + this.currentAimJitter;
    const wep = loadout.activeWeapon;
    if (wep.projectileGravity >= 0.8 && perception.enemyDist > 150) {
      const lobAngle = -0.35 - (perception.enemyDist - 150) * 0.001;
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

    // ── Active obstacle clearing ─────────────────────────────────────
    // Fire 1: Thin dirt block nearby → blast through with current weapon
    if (!perception.hasLineOfSight && perception.blockType === 'dirt') {
      if (perception.blockThickness < 50 && perception.enemyDist < RANGE_CLOSE) {
        // Close + thin dirt: shoot through it
        this.applyFire(input, aimDiff, loadout, self, terrain, perception.enemyDist);
      } else if (perception.enemyDist >= RANGE_CLOSE) {
        // Far + dirt: dig toward enemy
        const moveDir: -1 | 1 = dx > 0 ? 1 : -1;
        this.applyNavigation(self, input, terrain, moveDir);
        // Also fire lob weapons (grenades arc over)
        if (wep.projectileGravity >= 0.8) {
          this.applyFire(input, aimDiff, loadout, self, terrain, perception.enemyDist);
        }
      }
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

      // Rope for large gaps / high obstacles
      if (this.difficulty.useRope && !hasRope && !hasHook &&
          this.ropeCooldown <= 0 && this.stuckFrames > this.difficulty.digStuckThreshold * 2) {
        return this.doRopeLaunch(self);
      }
    }

    // ── Fire: LOS clear OR dirt obstacle we can shoot through ────────
    if (perception.hasLineOfSight ||
        (perception.blockType === 'dirt' && perception.blockThickness < 50)) {
      this.applyFire(input, aimDiff, loadout, self, terrain, perception.enemyDist);
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

  /** While on rope: swing toward enemy (or away if escaping), then release. */
  private doRopeSwing(self: Worm): InputState {
    const input = emptyInputState();
    this.ropeSwingFrames++;

    // Swing direction: toward enemy normally, away if escaping a blast
    let targetX: number;
    if (this.swingAway) {
      // Mirror enemy position — swing away from blast zone
      targetX = self.x - (this.lastKnownEnemyX - self.x);
    } else {
      targetX = this.memorySecs < MEMORY_DURATION
        ? this.lastKnownEnemyX
        : self.x + this.exploreDir * 100;
    }

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
      this.swingAway = false;
    }

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Weapon selection
  // ════════════════════════════════════════════════════════════════════════

  /** Decide which weapon to use based on range, LOS, and obstacle type. */
  private maybeSelectWeapon(
    loadout: Loadout, dist: number, hasLOS: boolean,
    blockType: 'none' | 'dirt' | 'rock' | 'mixed' = 'none',
    blockThickness: number = 0,
  ): void {
    // Don't re-select if already cycling or recently selected
    if (this.weaponCycleTarget >= 0 || this.weaponCycleCooldown > 0) return;

    // Random chance to skip optimal selection (difficulty scaling)
    if (Math.random() > this.difficulty.weaponSelectAccuracy) return;

    let target: number;

    if (!hasLOS && blockType === 'dirt' && blockThickness < 50) {
      // Thin dirt obstacle: shotgun to blast through
      target = dist < RANGE_CLOSE
        ? WEAPON_IDX.shotgun
        : (Math.random() < 0.5 ? WEAPON_IDX.minigun : WEAPON_IDX.shotgun);
    } else if (!hasLOS && blockType === 'dirt') {
      // Thick dirt: lob grenade over/through
      target = Math.random() < 0.6 ? WEAPON_IDX.grenade : WEAPON_IDX.cluster_bomb;
    } else if (!hasLOS && (blockType === 'rock' || blockType === 'mixed')) {
      // Rock blocking: lob weapons only, can't blast through
      target = Math.random() < 0.7 ? WEAPON_IDX.grenade : WEAPON_IDX.chiquita;
    } else if (dist < RANGE_CLOSE && hasLOS) {
      // Close range, clear LOS
      target = Math.random() < 0.6 ? WEAPON_IDX.shotgun : WEAPON_IDX.minigun;
    } else if (dist < RANGE_MEDIUM && hasLOS) {
      // Medium range with LOS
      target = Math.random() < 0.7 ? WEAPON_IDX.bazooka : WEAPON_IDX.minigun;
    } else if (dist >= RANGE_MEDIUM && hasLOS) {
      // Long range with LOS
      target = Math.random() < 0.5 ? WEAPON_IDX.minigun : WEAPON_IDX.zimm;
    } else {
      // Fallback: grenade or cluster bomb
      target = Math.random() < 0.6 ? WEAPON_IDX.grenade : WEAPON_IDX.cluster_bomb;
    }

    if (target === loadout.activeIndex) return;

    const total = 11;
    const fwd = (target - loadout.activeIndex + total) % total;
    const bwd = (loadout.activeIndex - target + total) % total;
    this.weaponCycleDir = fwd <= bwd ? 1 : -1;
    this.weaponCycleTarget = target;
    this.weaponCycleCooldown = 3.0 + Math.random() * 2.0;
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

  private applyFire(
    input: InputState, aimDiff: number, loadout: Loadout,
    self?: Worm, terrain?: TerrainMap, enemyDist?: number,
  ): void {
    const aimThreshold = this.difficulty.aimJitter + 0.15;
    if (Math.abs(aimDiff) < aimThreshold && this.fireCooldown <= 0 && loadout.canFire()) {
      const weapon = loadout.activeWeapon;

      // ── Self-damage safety check ──────────────────────────────────
      if (self && terrain && enemyDist !== undefined) {
        if (!this.isSafeToFire(self, weapon, terrain, enemyDist)) {
          // Unsafe: switch to a safe weapon instead of firing
          this.switchToSafeWeapon(loadout);
          this.fireHeld = false;
          return;
        }
      }

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

      // ── Throw-and-swing escape trigger ────────────────────────────
      if (input.fire && self && EXPLOSIVE_WEAPONS.has(weapon.id) &&
          this.difficulty.useRope && this.escapePhase === 'none' &&
          this.ropeCooldown <= 0) {
        if (Math.random() < this.difficulty.escapeRopeProbability) {
          this.escapePhase = 'wait';
          this.escapeFrames = 0;
          this.escapeTargetFrames = 20 + Math.floor(Math.random() * 11); // 20-30 frames
        }
      }
    } else {
      this.fireHeld = false;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Self-damage awareness
  // ════════════════════════════════════════════════════════════════════════

  /** Check if firing the current weapon would risk self-damage. */
  private isSafeToFire(
    self: Worm, weapon: WeaponDef, terrain: TerrainMap, enemyDist: number,
  ): boolean {
    // Non-explosive weapons are always safe
    if (!EXPLOSIVE_WEAPONS.has(weapon.id)) return true;

    // Difficulty scaling: less cautious bots skip the check sometimes
    if (Math.random() > this.difficulty.selfDamageAwareness) return true;

    // Tunnel/enclosed space: avoid ALL explosives
    if (this.isEnclosed(self, terrain, weapon.splashRadius)) return false;

    const dangerRadius = weapon.splashRadius * 1.5;

    // Impact weapons (no fuse): explosion at enemy position
    if (weapon.fuseMs === null) {
      return enemyDist > dangerRadius;
    }

    // Fused weapons: estimate detonation distance from self
    const t = weapon.fuseMs / 1000;
    const facing = self.facingRight ? 1 : -1;
    const vx = Math.cos(self.aimAngle) * weapon.projectileSpeed * facing;
    const vy = Math.sin(self.aimAngle) * weapon.projectileSpeed;
    const grav = weapon.projectileGravity * GRAVITY_PXS2;
    const landX = vx * t;
    const landY = vy * t + 0.5 * grav * t * t;
    const distFromSelf = Math.sqrt(landX * landX + landY * landY);

    return distFromSelf > dangerRadius;
  }

  /** Check if worm is in an enclosed space (terrain in 4+ of 8 directions). */
  private isEnclosed(self: Worm, terrain: TerrainMap, radius: number): boolean {
    let blockedDirs = 0;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const px = self.x + Math.cos(angle) * radius;
      const py = self.y + Math.sin(angle) * radius;
      if (terrain.isSolid(Math.round(px), Math.round(py))) {
        blockedDirs++;
      }
    }
    return blockedDirs >= 4;
  }

  /** Switch to a safe direct-fire weapon (shotgun or minigun). */
  private switchToSafeWeapon(loadout: Loadout): void {
    if (this.weaponCycleTarget >= 0) return; // already cycling
    const target = SAFE_WEAPON_INDICES[Math.floor(Math.random() * SAFE_WEAPON_INDICES.length)];
    if (target === loadout.activeIndex) return;
    const total = 11;
    const fwd = (target - loadout.activeIndex + total) % total;
    const bwd = (loadout.activeIndex - target + total) % total;
    this.weaponCycleDir = fwd <= bwd ? 1 : -1;
    this.weaponCycleTarget = target;
    this.weaponCycleCooldown = 1.5 + Math.random() * 1.0;
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
