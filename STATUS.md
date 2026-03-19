# Liero Clone — Status

## Last completed: Explosion damage scaling + fragment terrain fix

## What is currently working
- Two-player same-keyboard match (P1: arrows/Shift/Ctrl, P2: WASD/Space/F)
- Destructible procedural cave terrain
- **Fullscreen canvas** — Phaser Scale Manager FIT + CENTER_BOTH, fills browser window
- **Splitscreen** — classic Liero dual-viewport layout:
  - P1 camera: left half of screen, zoom=2.5, follows worm 1
  - P2 camera: right half of screen, zoom=2.5, follows worm 2
  - HUD camera: full-screen overlay, zoom=1, renders UI only
  - 2px dark divider line at screen center
  - Camera scroll rounded to integer each frame (prevents sub-pixel jitter)
  - Both cameras clamped to map bounds
  - Camera shake affects both viewports simultaneously
- **Splitscreen HUD**:
  - P1 HP/weapon/lives: bottom-left of left viewport
  - P2 HP/weapon/lives: bottom-right of right viewport
  - Timer: top center (spans divider)
  - Tag info: below timer
- **GameState/Renderer architecture** (clean separation):
  - GameState: pure game logic, no Phaser dependency
  - GameRenderer: stateless drawing (worms, projectiles, aim lines)
  - GameScene: thin orchestrator (input → state → events → render)
  - GameEvents: typed union for audio/visual side-effects
  - TerrainDestroyer: decoupled from renderer, dirty region tracking
  - CrateSystem: decoupled from Phaser, pure data + events
- Full weapon loadout (9 weapons, cycle with CHANGE+LEFT/RIGHT):
  - Bazooka — impact explode, 20px crater, 15 splash dmg, 12 fragments
  - Minigun — rapid fire, per-axis jitter, 8px crater, 5 splash dmg
  - Grenade — bounce (40%), 1640ms fuse, 50 fragments, 20px crater, 15 splash dmg
  - Shotgun — 15 pellets, per-axis jitter, 8px crater, 5 splash dmg
  - Bouncy Larpa — elastic bounce (100%), 5430ms fuse, 5 fragments, 14px crater
  - Zimm — no gravity, elastic terrain bounce, worm-only explode, 49 splash dmg
  - Cluster Bomb — bounce (50%), 1930ms fuse, 20 bomblets (bounce+430ms fuse), 20px crater
  - Mine — deploys on terrain, 700ms arm delay, proximity trigger (22px), 20px crater
  - Chiquita Bomb — bounce (40%), 2140ms fuse, 22 bomblets (bounce+430ms fuse), 20px crater
- **Explosion damage scaling**: effective splash radius = crater × 3
  - Fragment 8px crater → 24px damage zone
  - Medium 14px crater → 42px damage zone
  - Large 20px crater → 60px damage zone
  - Bigger blasts deal proportionally wider damage
- Fragment/bomblet types:
  - chiquita_fragment: impact-explode (8px crater, 5 dmg) — used by grenade/bazooka/larpa
  - cluster_bomblet: bounce + 430ms fuse (14px crater, 10 dmg)
  - chiquita_bomblet: bounce + 430ms fuse (20px crater, 15 dmg)
- Fragment terrain grace: 150ms immunity to terrain collision after spawn (escape crater)
- Object-pooled particle system (200 pool) with 3-phase animation:
  - 6-10 shrapnel pieces per primary explosion
  - 2-3 per shotgun pellet, 3-4 per fragment/bomblet, 0 for minigun
  - Each particle: gravity, terrain carve + small_explosion on hit (4px carve, 3 dmg, 8px splash), 1-2 HP direct worm damage on hit
  - Velocities reduced by 33% (×0.67) for slower, more visible flight
  - Phase 1 FLYING: bright orange/yellow core (3-4px) with dark red outline
  - Phase 2 IMPACT: expanding ring 4→16px over 0.12s, white→orange→dark
  - Phase 3 FADEOUT: shrink + fade to transparent over 0.1s
- Self-damage: 50% of splash damage when owner worm is caught in own explosion
- Ninja rope with spring/elastic physics (CHANGE+JUMP; anchor destruction releases rope)
  - Hooke's law spring model: rope pulls when stretched past rest length, slack when closer
  - Fixed rest length 7px (~0.5 worm heights) — immediate pull on long-range attach
  - Spring constant k=200, radial damping=8, pull velocity capped at 35 px/s
  - UP/DOWN adjust rest length (min 4px / max 275px), not direct position
  - Subtle directional jitter (~4° smooth wobble) for organic vertical rope feel
  - Hard clamp at MAX_ROPE_LENGTH (275px) as safety net
  - Worm-to-worm rope: 100% pull on shooter, 50% on target
  - Target worm treated as "on rope" by controller (preserves momentum)
- Sub-pixel vy clamp: grounded worms with |vy| < 0.5 snapped to 0
- Terrain digging in crosshair direction; block zone ±10° of straight up only
- Lives system (3 lives each) + respawn after 2s
- Win condition (elimination or timer expiry)
- Bonus crates: spawn every ~18s, max 5 on map
- Procedural audio (fire, explosion, jump, pickup, rope)
- Explosion screen flash (red vignette)
- Per-slot independent reload timers
- Level selection menu (Normal / Large Open / Tiny)
- Projectiles travel full map dimensions before despawning
- 4-segment worm sprites with aim-tracking eye (P1 green, P2 red)
- Mode selection: Normal Deathmatch or Game of Tag

## Known issues / bugs
- No dedicated sounds for new weapons (larpa, zimm, cluster, mine, chiquita)
  — they use generic fire/explosion audio
- Diagnostic console.log still active in ExplosionSystem, GameState, ParticleSystem
  — remove before release

## STOPPED HERE — end of session 2026-03-19

### Last completed
- Bomblet explosion triggers: cluster_bomblet and chiquita_bomblet now bounce + 430ms fuse
- Fragment terrain grace: 150ms terrain immunity so fragments escape craters
- Explosion damage scaling: effectiveRadius = craterRadius × 3 (bigger blast → wider damage)
- Grenade near worm now deals ~30-40 HP total (primary + fragments + particles)

### Next task to start
- No specific task planned — see possible next steps below

## Possible next steps (not planned)
- AI opponent (bot controller for P2)
- Weapon-specific audio cues (zimm ricochet ping, mine arm click, etc.)
- Flamethrower / homing missile (spec: do not implement yet)
- Animated worm sprites instead of circle-segments
- Sound effects from files instead of procedural Web Audio
- Online multiplayer (WebSocket / Socket.io)
- Remove diagnostic console.log statements
