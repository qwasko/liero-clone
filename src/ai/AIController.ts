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
  /** 0-1: probability of checking grenade trajectory before firing. */
  readonly trajectoryAwareness: number;
  /** Seconds of sustained damage before suppression kicks in. */
  readonly suppressionDelay: number;
  /** 0-1: probability of using proximity grenade / larpa in correct situations. */
  readonly tacticalWeaponAccuracy: number;
}

export const AI_DIFFICULTIES: Record<string, AIDifficulty> = {
  easy: {
    label: 'Easy', visionMultiplier: 0.8, reactionFrames: 30, aimJitter: 15 * Math.PI / 180,
    digStuckThreshold: 30, useRope: false, weaponSelectAccuracy: 0.5,
    selfDamageAwareness: 0.9, escapeRopeProbability: 0.15,
    trajectoryAwareness: 0.4, suppressionDelay: 3.0, tacticalWeaponAccuracy: 0.3,
  },
  medium: {
    label: 'Medium', visionMultiplier: 1.0, reactionFrames: 15, aimJitter: 7 * Math.PI / 180,
    digStuckThreshold: 10, useRope: true, weaponSelectAccuracy: 0.75,
    selfDamageAwareness: 0.6, escapeRopeProbability: 0.45,
    trajectoryAwareness: 0.75, suppressionDelay: 2.0, tacticalWeaponAccuracy: 0.65,
  },
  hard: {
    label: 'Hard', visionMultiplier: 6, reactionFrames: 5, aimJitter: 2 * Math.PI / 180,
    digStuckThreshold: 6, useRope: true, weaponSelectAccuracy: 0.95,
    selfDamageAwareness: 0.3, escapeRopeProbability: 0.75,
    trajectoryAwareness: 0.95, suppressionDelay: 1.0, tacticalWeaponAccuracy: 0.9,
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
  /** Highest individual threat score among nearby projectiles. */
  maxThreatScore: number;
  /** True if enemy is above bot (angle > 45° upward). */
  enemyAbove: boolean;
  /** True if enemy is below bot (near dead angle area). */
  enemyBelow: boolean;
  /** True if enemy distance is decreasing (approaching). */
  enemyApproaching: boolean;
  /** True if bot is in an enclosed space (terrain in 3+ of 8 dirs within 200px). */
  inEnclosedArea: boolean;
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

/** Dead angle below: minimum Y offset to consider enemy "below". */
const DEAD_ANGLE_BELOW_MIN_DY = 20;
/** Dead angle below: half-angle cone from straight down (30° = ~0.524 rad). */
const DEAD_ANGLE_BELOW_CONE = 30 * Math.PI / 180;
/** Dead angle below: commit to chosen action for this many frames (~2s at 60fps). */
const DEAD_ANGLE_COMMIT_FRAMES = 120;
/** Dead angle below: minimum open space below for grenade drop (px). */
const DEAD_ANGLE_GRENADE_CLEARANCE = 80;

/** Weapons with significant self-damage risk from splash. */
const EXPLOSIVE_WEAPONS = new Set([
  'bazooka', 'grenade', 'proximity_grenade', 'larpa',
  'cluster_bomb', 'chiquita', 'zimm',
]);

/** Grenade-type weapons that arc under gravity (self-damage from steep upward aim). */
const GRENADE_WEAPONS = new Set([
  'grenade', 'proximity_grenade', 'cluster_bomb', 'chiquita',
]);

/** Safe fallback weapon indices (direct-fire, small craters). */
const SAFE_WEAPON_INDICES = [WEAPON_IDX.shotgun, WEAPON_IDX.minigun];

/** Game gravity constant for ballistic estimation. */
const GRAVITY_PXS2 = 600;

/** Threat score thresholds. */
const THREAT_CRITICAL = 80;
const THREAT_MODERATE = 30;

/** Threat scan radius in pixels. */
const THREAT_SCAN_RADIUS = 200;

/** Suppression: damage threshold in HP within window. */
const SUPPRESSION_DAMAGE_THRESHOLD = 15;
/** Suppression: frames without effective shot before considered suppressed. */
const SUPPRESSION_NO_SHOT_FRAMES = 120;
/** Suppression: max duration before giving up (seconds). */
const SUPPRESSION_MAX_DURATION = 4.0;

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
  private prevEnemyDist = 0; // for approach detection

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
  private digPhase: 'idle' | 'hold' | 'tap' = 'idle';
  private digRockFrames = 0;

  // ── Rope navigation ────────────────────────────────────────────────
  private ropeCooldown = 0;
  private ropeSwingFrames = 0;

  // ── Weapon selection ───────────────────────────────────────────────
  private weaponCycleTarget = -1;
  private weaponCycleDir: -1 | 1 = 1;
  private weaponCycleCooldown = 0;

  // ── Throw-and-swing escape ───────────────────────────────────
  private escapePhase: 'none' | 'wait' | 'launch' = 'none';
  private escapeFrames = 0;
  private escapeTargetFrames = 0;
  private swingAway = false;
  /** Direction to escape from grenade: -1 = left, 1 = right (opposite of throw). */
  private escapeAwayDir: -1 | 1 = 1;

  // ── Threat / suppression tracking ─────────────────────────────────
  private lastHp = 100;
  private recentDamage = 0; // damage accumulated in rolling window
  private damageDecayTimer = 0; // seconds since last damage decay
  private framesWithoutShot = 0; // frames since bot last had clear shot opportunity
  private suppressionActive = false;
  private suppressionTimer = 0; // seconds in suppression state
  private dangerEscapeActive = false; // critical threat override

  // ── Explosive burn learning ──────────────────────────────────────
  /** Seconds remaining where bot forces safe weapons after upward self-damage. */
  private explosiveBurnCooldown = 0;
  /** Tracks self-damage from upward explosive shots in last 3s. */
  private upwardSelfDamage = 0;
  private upwardDamageDecay = 0;

  // ── Dead angle below handling ──────────────────────────────────
  /** Currently committed dead-angle action: 'none' | 'dig' | 'reposition' | 'grenade'. */
  private deadAngleAction: 'none' | 'dig' | 'reposition' | 'grenade' = 'none';
  /** Frames spent in dead-angle committed action. */
  private deadAngleActionFrames = 0;
  /** Direction chosen for reposition (-1 left, 1 right). */
  private deadAngleRepositionDir: -1 | 1 = 1;

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

    // ── Track damage for suppression ─────────────────────────────────
    const hpDelta = this.lastHp - self.hp;
    if (hpDelta > 0) {
      this.recentDamage += hpDelta;
      this.upwardSelfDamage += hpDelta;
    }
    this.lastHp = self.hp;
    // Decay damage accumulator over 2s window
    this.damageDecayTimer += dt;
    if (this.damageDecayTimer >= 0.5) {
      this.recentDamage = Math.max(0, this.recentDamage - 4);
      this.damageDecayTimer = 0;
    }
    // Decay upward self-damage over 3s window
    this.upwardDamageDecay += dt;
    if (this.upwardDamageDecay >= 0.5) {
      this.upwardSelfDamage = Math.max(0, this.upwardSelfDamage - 3);
      this.upwardDamageDecay = 0;
    }
    // "Learn" from mistake: force safe weapons after heavy upward self-damage
    if (this.upwardSelfDamage > 20 && this.explosiveBurnCooldown <= 0) {
      this.explosiveBurnCooldown = 5.0;
      this.upwardSelfDamage = 0;
    }
    this.explosiveBurnCooldown = Math.max(0, this.explosiveBurnCooldown - dt);

    // Track frames without effective shot
    if (delayed.hasLineOfSight && delayed.enemyVisible) {
      this.framesWithoutShot = 0;
    } else {
      this.framesWithoutShot++;
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

    // ── Suppression detection ────────────────────────────────────────
    if (!this.suppressionActive) {
      if (this.recentDamage >= SUPPRESSION_DAMAGE_THRESHOLD &&
          !delayed.hasLineOfSight &&
          this.framesWithoutShot >= SUPPRESSION_NO_SHOT_FRAMES) {
        // Delay by difficulty
        if (this.damageDecayTimer >= this.difficulty.suppressionDelay) {
          this.suppressionActive = true;
          this.suppressionTimer = 0;
        }
      }
    } else {
      this.suppressionTimer += dt;
      // Exit suppression when LOS restored or timeout
      if (delayed.hasLineOfSight || this.suppressionTimer > SUPPRESSION_MAX_DURATION) {
        this.suppressionActive = false;
        this.suppressionTimer = 0;
        this.recentDamage = 0;
      }
    }

    // ── Critical threat detection ────────────────────────────────────
    this.dangerEscapeActive = delayed.maxThreatScore >= THREAT_CRITICAL;

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

    // ── DANGER: critical threat override ─────────────────────────────
    if (this.dangerEscapeActive && !hasRope) {
      return this.doDangerEscape(self, delayed, terrain, hasRope, hasHook);
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
      return this.doEscapeRopeLaunch(self);
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

    // ── SUPPRESSION: reposition override ─────────────────────────────
    if (this.suppressionActive) {
      return this.doReposition(self, delayed, loadout, terrain, hasRope, hasHook);
    }

    // ── Moderate threat: sidestep while attacking ────────────────────
    // (applied as modifier inside engage/approach rather than separate state)

    // ── Produce input ────────────────────────────────────────────────
    let result: InputState;
    switch (this.state) {
      case 'engage':  result = this.doEngage(self, delayed, loadout, terrain, dt); break;
      case 'approach': result = this.doApproach(self, delayed, loadout, terrain, dt, hasRope, hasHook); break;
      case 'search':  result = this.doSearch(self, terrain, dt, hasRope, hasHook); break;
      case 'explore': result = this.doExplore(self, terrain, dt); break;
    }

    // ── Face toward enemy every frame ──────────────────────────────
    // If enemy is visible and no directional input was set by the state
    // handler, inject a facing correction so the bot doesn't stare the
    // wrong way when the enemy crosses to the opposite side.
    if (delayed.enemyVisible && !result.left && !result.right && !result.change) {
      const edx = delayed.enemyX - self.x;
      if (edx >= 0 && !self.facingRight) result.right = true;
      else if (edx < 0 && self.facingRight) result.left = true;
    }

    return result;
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

    // Dead angle detection
    const aimAngle = this.toWormAimAngle(self, angle);
    const unclamped = self.facingRight ? angle : (() => {
      let a = Math.PI - angle;
      if (a > Math.PI) a -= 2 * Math.PI;
      if (a < -Math.PI) a += 2 * Math.PI;
      return a;
    })();
    const inDeadAngle = enemyVisible && Math.abs(unclamped - aimAngle) > 0.15;

    // Threat scoring — evaluate projectiles within scan radius
    let maxThreatScore = 0;
    for (const p of threats) {
      const pdx = p.x - self.x;
      const pdy = p.y - self.y;
      const pDist = Math.max(10, Math.sqrt(pdx * pdx + pdy * pdy));
      if (pDist > THREAT_SCAN_RADIUS) continue;

      const damage = Math.max(p.weapon.splashDamage, p.weapon.hitDamage ?? 0, 5);
      // Dot product: negative means approaching
      const dot = pdx * p.vx + pdy * p.vy;
      const approachFactor = dot < 0 ? 2.0 : 0.5;
      const score = damage * (150 / pDist) * approachFactor;
      if (score > maxThreatScore) maxThreatScore = score;
    }

    // Directional checks
    const enemyAbove = dy < -Math.abs(dx); // enemy significantly above
    const enemyBelow = dy > Math.abs(dx);  // enemy significantly below

    // Enemy approaching: compare to previous distance
    const enemyApproaching = enemyVisible && dist < this.prevEnemyDist - 1;
    this.prevEnemyDist = dist;

    // Enclosed area: terrain in 3+ of 8 directions within 200px
    const inEnclosedArea = this.checkEnclosedArea(self, terrain, 200);

    return {
      enemyVisible, enemyX: ex, enemyY: ey,
      enemyDist: dist, enemyAngle: angle,
      threats, hasLineOfSight,
      blockType, blockThickness, inDeadAngle,
      maxThreatScore, enemyAbove, enemyBelow,
      enemyApproaching, inEnclosedArea,
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

    const steps = Math.max(4, Math.ceil(dist / 4));
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
    const thickness = solidCount * (dist / steps);
    if (rockCount === solidCount) return { type: 'rock', thickness };
    if (rockCount === 0) return { type: 'dirt', thickness };
    return { type: 'mixed', thickness };
  }

  private inRect(x: number, y: number, r: VisionRect): boolean {
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  }

  /** Check if position is enclosed (terrain in N+ of 8 directions at given radius). */
  private checkEnclosedArea(self: Worm, terrain: TerrainMap, radius: number): boolean {
    let blocked = 0;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      if (terrain.isSolid(
        Math.round(self.x + Math.cos(a) * radius),
        Math.round(self.y + Math.sin(a) * radius),
      )) blocked++;
    }
    return blocked >= 3;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DANGER ESCAPE — critical threat, drop everything and flee
  // ════════════════════════════════════════════════════════════════════════

  private doDangerEscape(
    self: Worm, perception: AIPerception, terrain: TerrainMap,
    _hasRope: boolean, hasHook: boolean,
  ): InputState {
    const input = emptyInputState();

    // Find the most dangerous threat direction and run opposite
    let threatX = 0, worstScore = 0;
    for (const p of perception.threats) {
      const pdx = p.x - self.x;
      const pdy = p.y - self.y;
      const pDist = Math.max(10, Math.sqrt(pdx * pdx + pdy * pdy));
      if (pDist > THREAT_SCAN_RADIUS) continue;
      const damage = Math.max(p.weapon.splashDamage, p.weapon.hitDamage ?? 0, 5);
      const dot = pdx * p.vx + pdy * p.vy;
      const score = damage * (150 / pDist) * (dot < 0 ? 2.0 : 0.5);
      if (score > worstScore) {
        worstScore = score;
        threatX = p.x;
      }
    }

    // Run away from worst threat
    const fleeDx = self.x - threatX;
    if (fleeDx >= 0) input.right = true; else input.left = true;

    // Jump to gain distance
    input.jump = true;

    // Try rope if ceiling available
    if (this.difficulty.useRope && !hasHook && this.ropeCooldown <= 0) {
      // Check for ceiling within 150px
      if (this.hasCeilingAbove(self, terrain, 150)) {
        return this.doRopeLaunch(self);
      }
    }

    this.applyNavigation(self, input, terrain, fleeDx >= 0 ? 1 : -1);
    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  REPOSITION — under suppression, find new line of sight
  // ════════════════════════════════════════════════════════════════════════

  private doReposition(
    self: Worm, perception: AIPerception, loadout: Loadout,
    terrain: TerrainMap, hasRope: boolean, hasHook: boolean,
  ): InputState {
    const input = emptyInputState();
    const dx = this.lastKnownEnemyX - self.x;

    // Move perpendicular to enemy direction to find new angle
    // Try moving along the axis we're NOT blocked on
    const moveDir: -1 | 1 = Math.random() < 0.5 ? 1 : -1;
    if (moveDir > 0) input.right = true; else input.left = true;

    // Jump frequently while repositioning
    if (Math.random() < 0.1) input.jump = true;

    // Rope for fast repositioning (Hard bot prefers this)
    if (this.difficulty.useRope && !hasRope && !hasHook &&
        this.ropeCooldown <= 0 && this.hasCeilingAbove(self, terrain, 200)) {
      return this.doRopeLaunch(self);
    }

    this.applyNavigation(self, input, terrain, moveDir);

    // Area denial: lob grenade toward last known enemy position while moving
    if (this.memorySecs < MEMORY_DURATION) {
      const desiredAngle = Math.atan2(
        this.lastKnownEnemyY - self.y,
        dx,
      );
      const targetAngle = this.toWormAimAngle(self, desiredAngle);
      const aimDiff = targetAngle - self.aimAngle;
      if (aimDiff < -0.1) input.up = true;
      else if (aimDiff > 0.1) input.down = true;

      // Face toward enemy for the lob
      if (dx >= 0 && !self.facingRight) input.right = true;
      if (dx < 0 && self.facingRight) input.left = true;

      // Try to select grenade for area denial
      if (Math.random() < this.difficulty.tacticalWeaponAccuracy) {
        this.startWeaponCycle(loadout, WEAPON_IDX.grenade);
      }

      // Fire blindly
      if (this.fireCooldown <= 0 && Math.abs(aimDiff) < 0.5) {
        this.applyFire(input, aimDiff, loadout, self, terrain, perception.enemyDist);
      }
    }

    return input;
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

    // ── Dead angle below — enemy directly beneath ───────────────────
    if (this.isInLowerDeadAngle(self, perception.enemyX, perception.enemyY)) {
      return this.doDeadAngleBelow(self, perception, loadout, terrain);
    }
    // Reset dead angle commitment when no longer in dead angle
    if (this.deadAngleAction !== 'none') {
      this.deadAngleAction = 'none';
      this.deadAngleActionFrames = 0;
    }

    // ── Dead angle escape (enemy above, very close horizontally) ────
    if (perception.inDeadAngle && dy < 0 && Math.abs(dx) < 10) {
      input.right = true;
    }

    // ── Moderate threat sidestep ─────────────────────────────────────
    if (perception.maxThreatScore >= THREAT_MODERATE &&
        perception.maxThreatScore < THREAT_CRITICAL) {
      this.applySidestep(self, perception, input);
    }

    // ── Weapon selection ─────────────────────────────────────────────
    this.maybeSelectWeapon(loadout, perception, self, terrain);

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

    // ── Dead angle below — enemy directly beneath ───────────────────
    if (this.isInLowerDeadAngle(self, perception.enemyX, perception.enemyY)) {
      return this.doDeadAngleBelow(self, perception, loadout, terrain);
    }
    if (this.deadAngleAction !== 'none') {
      this.deadAngleAction = 'none';
      this.deadAngleActionFrames = 0;
    }

    // ── Moderate threat sidestep ─────────────────────────────────────
    if (perception.maxThreatScore >= THREAT_MODERATE &&
        perception.maxThreatScore < THREAT_CRITICAL) {
      this.applySidestep(self, perception, input);
    }

    // ── Weapon selection (full tactical ruleset) ─────────────────────
    this.maybeSelectWeapon(loadout, perception, self, terrain);

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
    if (!perception.hasLineOfSight && perception.blockType === 'dirt') {
      if (perception.blockThickness < 50 && perception.enemyDist < RANGE_CLOSE) {
        this.applyFire(input, aimDiff, loadout, self, terrain, perception.enemyDist);
      } else if (perception.enemyDist >= RANGE_CLOSE) {
        const moveDir: -1 | 1 = dx > 0 ? 1 : -1;
        this.applyNavigation(self, input, terrain, moveDir);
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

    const desiredAngle = Math.atan2(dy, dx);
    const targetAngle = this.toWormAimAngle(self, desiredAngle);
    const aimDiff = targetAngle - self.aimAngle;
    if (aimDiff < -0.1) input.up = true;
    else if (aimDiff > 0.1) input.down = true;

    const moveDir: -1 | 1 = dx > 0 ? 1 : -1;
    this.applyNavigation(self, input, terrain, moveDir);

    if (this.difficulty.useRope && !hasRope && !hasHook &&
        this.ropeCooldown <= 0 && this.stuckFrames > this.difficulty.digStuckThreshold * 3) {
      return this.doRopeLaunch(self);
    }

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

    this.applyNavigation(self, input, terrain, this.exploreDir);

    if (this.stuckFrames > this.difficulty.digStuckThreshold * 3) {
      this.exploreDir = (this.exploreDir * -1) as -1 | 1;
      this.exploreTimer = this.randomExploreTime();
      this.stuckFrames = 0;
    }

    if (Math.random() < 0.005) input.jump = true;

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Threat sidestep (moderate threats — dodge while continuing action)
  // ════════════════════════════════════════════════════════════════════════

  private applySidestep(self: Worm, perception: AIPerception, input: InputState): void {
    // Find approaching threat direction and step perpendicular
    let worstX = 0, worstY = 0, worstScore = 0;
    for (const p of perception.threats) {
      const pdx = p.x - self.x;
      const pdy = p.y - self.y;
      const pDist = Math.max(10, Math.sqrt(pdx * pdx + pdy * pdy));
      if (pDist > THREAT_SCAN_RADIUS) continue;
      const damage = Math.max(p.weapon.splashDamage, p.weapon.hitDamage ?? 0, 5);
      const dot = pdx * p.vx + pdy * p.vy;
      const score = damage * (150 / pDist) * (dot < 0 ? 2.0 : 0.5);
      if (score > worstScore) {
        worstScore = score;
        worstX = pdx;
        worstY = pdy;
      }
    }
    if (worstScore < THREAT_MODERATE) return;

    // Step perpendicular to threat approach direction
    // Choose the side that moves away from enemy least
    if (Math.abs(worstY) > Math.abs(worstX)) {
      // Threat coming vertically — dodge horizontally
      if (worstX >= 0) input.left = true; else input.right = true;
    } else {
      // Threat coming horizontally — jump
      input.jump = true;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Navigation helpers (dig, jump, reroute)
  // ════════════════════════════════════════════════════════════════════════

  private applyNavigation(
    self: Worm, input: InputState, terrain: TerrainMap, moveDir: -1 | 0 | 1,
  ): void {
    if (moveDir === 0) return;
    const blocked = this.isBlockedHorizontally(self, terrain, moveDir);
    if (!blocked) return;

    if (this.stuckFrames < this.difficulty.digStuckThreshold) {
      input.jump = true;
      return;
    }

    const probeX = self.x + moveDir * (self.width / 2 + 5);
    const probeY = self.y;
    const isRock = terrain.isRock(Math.round(probeX), Math.round(probeY));

    if (isRock) {
      this.digRockFrames++;
      if (this.digRockFrames > ROCK_DIG_TIMEOUT) {
        this.digRockFrames = 0;
        this.digPhase = 'idle';
        input.jump = true;
        if (this.stuckFrames > this.difficulty.digStuckThreshold * 2) {
          if (moveDir > 0) { input.right = false; input.left = true; }
          else { input.left = false; input.right = true; }
        }
        return;
      }
    } else {
      this.digRockFrames = 0;
    }

    if (this.digPhase === 'idle' || this.digPhase === 'tap') {
      this.digPhase = 'hold';
      if (moveDir > 0) { input.right = true; input.left = false; }
      else { input.left = true; input.right = false; }
    } else if (this.digPhase === 'hold') {
      this.digPhase = 'tap';
      if (moveDir > 0) { input.right = true; input.left = true; }
      else { input.left = true; input.right = true; }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Rope navigation
  // ════════════════════════════════════════════════════════════════════════

  private doRopeLaunch(self: Worm): InputState {
    const input = emptyInputState();
    input.up = self.aimAngle > -Math.PI / 3;
    input.change = true;
    input.jump = true;
    this.ropeCooldown = ROPE_COOLDOWN;
    this.ropeSwingFrames = 0;
    return input;
  }

  /** Launch rope away from grenade — face opposite to throw direction, aim up. */
  private doEscapeRopeLaunch(_self: Worm): InputState {
    const input = emptyInputState();
    // Face away from grenade before launching rope
    if (this.escapeAwayDir > 0) input.right = true; else input.left = true;
    // Aim upward — always safe escape direction
    input.up = true;
    input.change = true;
    input.jump = true;
    this.ropeCooldown = ROPE_COOLDOWN;
    this.ropeSwingFrames = 0;
    return input;
  }

  private doRopeSwing(self: Worm): InputState {
    const input = emptyInputState();
    this.ropeSwingFrames++;

    let targetX: number;
    if (this.swingAway) {
      targetX = self.x - (this.lastKnownEnemyX - self.x);
    } else {
      targetX = this.memorySecs < MEMORY_DURATION
        ? this.lastKnownEnemyX
        : self.x + this.exploreDir * 100;
    }

    if (targetX > self.x) input.right = true;
    else input.left = true;

    if (this.ropeSwingFrames < 20) {
      input.change = true;
      input.up = true;
    }

    const releaseTime = 40 + Math.floor(Math.random() * 30);
    if (this.ropeSwingFrames > releaseTime) {
      input.jump = true;
      input.change = false;
      this.ropeSwingFrames = 0;
      this.swingAway = false;
    }

    return input;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Weapon selection — full tactical ruleset
  // ════════════════════════════════════════════════════════════════════════

  private maybeSelectWeapon(loadout: Loadout, perception: AIPerception, self: Worm, terrain: TerrainMap): void {
    if (this.weaponCycleTarget >= 0 || this.weaponCycleCooldown > 0) return;
    if (Math.random() > this.difficulty.weaponSelectAccuracy) return;

    const dist = perception.enemyDist;
    const hasLOS = perception.hasLineOfSight;
    const blockType = perception.blockType;
    const blockThickness = perception.blockThickness;
    const tactical = Math.random() < this.difficulty.tacticalWeaponAccuracy;

    let target: number;

    // ── Enclosed space: larpa / zimm ─────────────────────────────────
    if (perception.inEnclosedArea && hasLOS && tactical) {
      if (dist > RANGE_CLOSE) {
        // Larpa excels in enclosed spaces — bouncing coverage
        target = Math.random() < 0.6 ? WEAPON_IDX.larpa : WEAPON_IDX.zimm;
      } else {
        // Too close for larpa — trail would damage self
        target = Math.random() < 0.6 ? WEAPON_IDX.shotgun : WEAPON_IDX.minigun;
      }
    }
    // ── Enemy approaching through corridor (no LOS, thin dirt) ───────
    else if (!hasLOS && perception.enemyApproaching && tactical) {
      // Proximity grenade as corridor trap
      if (blockType === 'dirt' && blockThickness < 80) {
        target = Math.random() < 0.6 ? WEAPON_IDX.proximity_grenade : WEAPON_IDX.mine;
      } else {
        target = Math.random() < 0.5 ? WEAPON_IDX.larpa : WEAPON_IDX.grenade;
      }
    }
    // ── Enemy above (>45° upward angle) — clearance-aware ────────────
    else if (perception.enemyAbove && hasLOS) {
      // Burned by self-damage recently → safe weapons only
      if (this.explosiveBurnCooldown > 0) {
        target = Math.random() < 0.6 ? WEAPON_IDX.minigun : WEAPON_IDX.shotgun;
      } else if (dist < RANGE_CLOSE) {
        target = Math.random() < 0.7 ? WEAPON_IDX.shotgun : WEAPON_IDX.minigun;
      } else {
        // Check vertical clearance for explosive safety
        const clearance = this.scanVerticalClearance(self, terrain);
        if (clearance < 100) {
          // Tight tunnel — no explosives upward
          target = Math.random() < 0.6 ? WEAPON_IDX.minigun : WEAPON_IDX.shotgun;
        } else if (dist > RANGE_MEDIUM) {
          // Far + open: bazooka, maybe grenade if very far and escape route exists
          const hasEscapeRoute = !this.isBlockedHorizontally(self, terrain, 1) ||
                                 !this.isBlockedHorizontally(self, terrain, -1);
          if (hasEscapeRoute && Math.random() < 0.3) {
            target = WEAPON_IDX.grenade;
          } else {
            target = Math.random() < 0.7 ? WEAPON_IDX.bazooka : WEAPON_IDX.minigun;
          }
        } else {
          // Medium range + open: bazooka preferred
          target = Math.random() < 0.7 ? WEAPON_IDX.bazooka : WEAPON_IDX.minigun;
        }
      }
    }
    // ── Enemy below (near dead angle) ────────────────────────────────
    else if (perception.enemyBelow) {
      // Zimm bounces can reach below; avoid grenades (dangerous below)
      if (tactical && perception.inEnclosedArea) {
        target = WEAPON_IDX.zimm;
      } else {
        target = Math.random() < 0.6 ? WEAPON_IDX.minigun : WEAPON_IDX.bazooka;
      }
    }
    // ── No LOS, dirt obstacle ────────────────────────────────────────
    else if (!hasLOS && blockType === 'dirt' && blockThickness < 50) {
      target = dist < RANGE_CLOSE
        ? WEAPON_IDX.shotgun
        : (Math.random() < 0.5 ? WEAPON_IDX.minigun : WEAPON_IDX.shotgun);
    } else if (!hasLOS && blockType === 'dirt') {
      target = Math.random() < 0.6 ? WEAPON_IDX.grenade : WEAPON_IDX.cluster_bomb;
    } else if (!hasLOS && (blockType === 'rock' || blockType === 'mixed')) {
      // Rock: lob or larpa bounce
      if (tactical) {
        target = Math.random() < 0.5 ? WEAPON_IDX.larpa : WEAPON_IDX.grenade;
      } else {
        target = Math.random() < 0.7 ? WEAPON_IDX.grenade : WEAPON_IDX.chiquita;
      }
    }
    // ── Close range, clear LOS ───────────────────────────────────────
    else if (dist < RANGE_CLOSE && hasLOS) {
      target = Math.random() < 0.6 ? WEAPON_IDX.shotgun : WEAPON_IDX.minigun;
    }
    // ── Medium range with LOS ────────────────────────────────────────
    else if (dist < RANGE_MEDIUM && hasLOS) {
      // Proximity grenade if enemy approaching
      if (tactical && perception.enemyApproaching && Math.random() < 0.4) {
        target = WEAPON_IDX.proximity_grenade;
      } else {
        target = Math.random() < 0.7 ? WEAPON_IDX.bazooka : WEAPON_IDX.minigun;
      }
    }
    // ── Long range with LOS ──────────────────────────────────────────
    else if (dist >= RANGE_MEDIUM && hasLOS) {
      target = Math.random() < 0.5 ? WEAPON_IDX.minigun : WEAPON_IDX.zimm;
    }
    // ── Fallback ─────────────────────────────────────────────────────
    else {
      target = Math.random() < 0.6 ? WEAPON_IDX.grenade : WEAPON_IDX.cluster_bomb;
    }

    this.startWeaponCycle(loadout, target);
  }

  /** Begin cycling to a target weapon index (shortest path). */
  private startWeaponCycle(loadout: Loadout, target: number): void {
    if (this.weaponCycleTarget >= 0 || this.weaponCycleCooldown > 0) return;
    if (target === loadout.activeIndex) return;

    const total = 11;
    const fwd = (target - loadout.activeIndex + total) % total;
    const bwd = (loadout.activeIndex - target + total) % total;
    this.weaponCycleDir = fwd <= bwd ? 1 : -1;
    this.weaponCycleTarget = target;
    this.weaponCycleCooldown = 3.0 + Math.random() * 2.0;
  }

  private doWeaponCycle(_loadout: Loadout): InputState {
    const input = emptyInputState();
    input.change = true;
    if (this.weaponCycleDir > 0) input.right = true;
    else input.left = true;
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
          this.escapeTargetFrames = 20 + Math.floor(Math.random() * 11);
          // Escape opposite to throw direction
          this.escapeAwayDir = self.facingRight ? -1 : 1;
        }
      }
    } else {
      this.fireHeld = false;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Self-damage awareness
  // ════════════════════════════════════════════════════════════════════════

  private isSafeToFire(
    self: Worm, weapon: WeaponDef, terrain: TerrainMap, enemyDist: number,
  ): boolean {
    if (!EXPLOSIVE_WEAPONS.has(weapon.id)) return true;

    // Burned by self-damage → force safe weapons
    if (this.explosiveBurnCooldown > 0) return false;

    // Difficulty scaling: less cautious bots skip the check sometimes
    if (Math.random() > this.difficulty.selfDamageAwareness) return true;

    // Tunnel/enclosed space: avoid ALL explosives
    if (this.isEnclosed(self, terrain, weapon.splashRadius)) return false;

    // ── Upward explosive clearance check ──────────────────────────────
    if (self.aimAngle < -Math.PI / 6) { // aiming >30° upward
      const clearance = this.scanVerticalClearance(self, terrain);
      // Difficulty error: sometimes get the estimate wrong
      const errorRates: Record<string, number> = { Easy: 0.5, Medium: 0.25, Hard: 0.08 };
      const errorRate = errorRates[this.difficulty.label] ?? 0.25;
      const estimateCorrect = Math.random() > errorRate;

      if (estimateCorrect) {
        // Tight tunnel: no explosives upward
        if (clearance < 100) return false;

        // Check if explosion at estimated position would reach bot
        const landDist = this.estimateLandingDist(self, weapon);
        if (landDist < weapon.splashRadius * 1.5) return false;

        // Grenade-specific: only allow at long range with escape route
        if (GRENADE_WEAPONS.has(weapon.id)) {
          if (self.aimAngle < -Math.PI / 3) {
            // Steep upward grenade: Hard bot allows if far enough
            if (this.difficulty.label === 'Hard' && landDist > 200) {
              return true;
            }
            return false;
          }
          // Medium lob: require >250px and escape route
          if (enemyDist < RANGE_MEDIUM) return false;
          const hasEscape = !this.isBlockedHorizontally(self, terrain, 1) ||
                            !this.isBlockedHorizontally(self, terrain, -1);
          if (!hasEscape) return false;
        }
      }
      // If estimate was wrong (errorRate), fall through to standard checks
    }

    // ── Grenade trajectory intuition (non-upward) ─────────────────────
    if (GRENADE_WEAPONS.has(weapon.id) &&
        Math.random() < this.difficulty.trajectoryAwareness) {
      if (self.aimAngle < -Math.PI / 3) {
        if (this.difficulty.label === 'Hard') {
          const landDist = this.estimateLandingDist(self, weapon);
          if (landDist > 200) return true;
        }
        return false;
      }
    }

    const dangerRadius = weapon.splashRadius * 1.5;

    // Impact weapons (no fuse): explosion at enemy position
    if (weapon.fuseMs === null) {
      return enemyDist > dangerRadius;
    }

    // Fused weapons: estimate detonation distance from self
    const landDist = this.estimateLandingDist(self, weapon);
    return landDist > dangerRadius;
  }

  /** Estimate how far from self a fused projectile will detonate. */
  private estimateLandingDist(self: Worm, weapon: WeaponDef): number {
    const t = (weapon.fuseMs ?? 1000) / 1000;
    const facing = self.facingRight ? 1 : -1;
    const vx = Math.cos(self.aimAngle) * weapon.projectileSpeed * facing;
    const vy = Math.sin(self.aimAngle) * weapon.projectileSpeed;
    const grav = weapon.projectileGravity * GRAVITY_PXS2;
    const landX = vx * t;
    const landY = vy * t + 0.5 * grav * t * t;
    return Math.sqrt(landX * landX + landY * landY);
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
    if (this.weaponCycleTarget >= 0) return;
    const target = SAFE_WEAPON_INDICES[Math.floor(Math.random() * SAFE_WEAPON_INDICES.length)];
    this.startWeaponCycle(loadout, target);
    // Override the long cooldown for safety switches
    this.weaponCycleCooldown = 1.5 + Math.random() * 1.0;
  }

  /** Check if there's solid terrain above (ceiling for rope). */
  private hasCeilingAbove(self: Worm, terrain: TerrainMap, maxDist: number): boolean {
    for (let dy = 20; dy < maxDist; dy += 10) {
      if (terrain.isSolid(Math.round(self.x), Math.round(self.y - dy))) return true;
    }
    return false;
  }

  /** Scan upward from bot and return pixels of open space before hitting terrain. */
  private scanVerticalClearance(self: Worm, terrain: TerrainMap): number {
    for (let dy = 5; dy < 400; dy += 5) {
      if (terrain.isSolid(Math.round(self.x), Math.round(self.y - dy))) return dy;
    }
    return 400;
  }

  /** Scan downward from bot: returns { clearance, isDirt }. clearance = open pixels, isDirt = first solid is diggable. */
  private scanBelow(self: Worm, terrain: TerrainMap): { clearance: number; isDirt: boolean } {
    for (let dy = 5; dy < 300; dy += 5) {
      const px = Math.round(self.x);
      const py = Math.round(self.y + dy);
      if (terrain.isSolid(px, py)) {
        return { clearance: dy, isDirt: !terrain.isRock(px, py) };
      }
    }
    return { clearance: 300, isDirt: false };
  }

  /** Check if enemy is in the lower dead angle cone (below ±30° of straight down). */
  private isInLowerDeadAngle(self: Worm, enemyX: number, enemyY: number): boolean {
    const dx = enemyX - self.x;
    const dy = enemyY - self.y;
    if (dy <= DEAD_ANGLE_BELOW_MIN_DY) return false;
    // Angle from straight down: atan2(|dx|, dy)
    const angleFromDown = Math.atan2(Math.abs(dx), dy);
    return angleFromDown <= DEAD_ANGLE_BELOW_CONE;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Dead angle below — enemy directly beneath, can't aim down enough
  // ════════════════════════════════════════════════════════════════════════

  private doDeadAngleBelow(
    self: Worm, perception: AIPerception, loadout: Loadout,
    terrain: TerrainMap,
  ): InputState {
    const input = emptyInputState();
    const dx = perception.enemyX - self.x;

    // 1. Always update facing toward enemy X
    if (dx >= 0 && !self.facingRight) input.right = true;
    if (dx < 0 && self.facingRight) input.left = true;

    // Aim as far down as possible
    if (self.aimAngle < Math.PI / 3 - 0.05) input.down = true;

    // 2. If committed to an action and not expired, continue it
    if (this.deadAngleAction !== 'none') {
      this.deadAngleActionFrames++;
      if (this.deadAngleActionFrames < DEAD_ANGLE_COMMIT_FRAMES) {
        this.applyDeadAngleAction(self, perception, loadout, terrain, input);
        return input;
      }
      // Expired — reset and re-evaluate
      this.deadAngleAction = 'none';
      this.deadAngleActionFrames = 0;
    }

    // 3. Pick an action
    const below = this.scanBelow(self, terrain);

    // Option A — Dig down toward enemy (terrain below is diggable dirt)
    if (below.clearance < 30 && below.isDirt) {
      this.deadAngleAction = 'dig';
      this.deadAngleActionFrames = 0;
      // Pick sideways shift direction: toward enemy X to angle the dig
      this.deadAngleRepositionDir = dx >= 0 ? 1 : -1;
      this.applyDeadAngleAction(self, perception, loadout, terrain, input);
      return input;
    }

    // Option B — Drop grenade down (hard bot only, 40% chance, enough open space)
    if (this.difficulty.label === 'Hard' && Math.random() < 0.4 &&
        below.clearance >= DEAD_ANGLE_GRENADE_CLEARANCE) {
      this.deadAngleAction = 'grenade';
      this.deadAngleActionFrames = 0;
      this.startWeaponCycle(loadout, WEAPON_IDX.grenade);
      this.applyDeadAngleAction(self, perception, loadout, terrain, input);
      return input;
    }

    // Option C — Reposition horizontally until enemy is at 45°+
    this.deadAngleAction = 'reposition';
    this.deadAngleActionFrames = 0;
    // Move so enemy angle opens up — pick direction away from enemy X if close,
    // otherwise move in whichever direction is not blocked
    const tryDir: -1 | 1 = dx >= 0 ? -1 : 1;
    if (!this.isBlockedHorizontally(self, terrain, tryDir)) {
      this.deadAngleRepositionDir = tryDir;
    } else {
      this.deadAngleRepositionDir = (-tryDir) as -1 | 1;
    }
    this.applyDeadAngleAction(self, perception, loadout, terrain, input);
    return input;
  }

  /** Continue the committed dead-angle action. */
  private applyDeadAngleAction(
    self: Worm, perception: AIPerception, loadout: Loadout,
    terrain: TerrainMap, input: InputState,
  ): void {
    switch (this.deadAngleAction) {
      case 'dig': {
        // Shift sideways 20px first, then dig downward
        const shiftDir = this.deadAngleRepositionDir;
        if (shiftDir > 0) input.right = true; else input.left = true;
        // Trigger dig: the sideways movement + aim down will carve terrain
        // Also apply navigation to handle stuck/dig mechanic
        this.applyNavigation(self, input, terrain, shiftDir);
        // Fire to help dig through
        this.applyFire(input, 0.1, loadout, self, terrain, perception.enemyDist);
        break;
      }
      case 'grenade': {
        // Aim down and fire grenade
        this.applyFire(input, 0.1, loadout, self, terrain, perception.enemyDist);
        break;
      }
      case 'reposition': {
        // Move horizontally to escape dead angle
        const dir = this.deadAngleRepositionDir;
        if (dir > 0) input.right = true; else input.left = true;
        this.applyNavigation(self, input, terrain, dir);
        // Jump to speed up lateral movement
        if (this.deadAngleActionFrames % 30 === 0) input.jump = true;
        // Check if enemy is no longer in dead angle — exit early
        if (!this.isInLowerDeadAngle(self, perception.enemyX, perception.enemyY)) {
          this.deadAngleAction = 'none';
          this.deadAngleActionFrames = 0;
        }
        break;
      }
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
