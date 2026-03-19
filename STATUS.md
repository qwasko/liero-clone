# Liero Clone — Status

## Last completed: Splitscreen + GameState/Renderer refactoring

## What is currently working
- Two-player same-keyboard match (P1: arrows/Shift/Ctrl, P2: WASD/Space/F)
- Destructible procedural cave terrain
- **Fullscreen canvas** — Phaser Scale Manager FIT + CENTER_BOTH, fills browser window
- **Splitscreen** — classic Liero dual-viewport layout:
  - P1 camera: left half of screen, zoom=3, follows worm 1
  - P2 camera: right half of screen, zoom=3, follows worm 2
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
  - Bazooka — arc shot, ±8% velocity variance, 35 dmg
  - Minigun (10000 ammo) — rapid fire, ±5° spread, 4 dmg/bullet, 2px crater, no particles
  - Grenade — 4 bounces, 3s fuse, 50 dmg → spawns 7 fragments on explosion
  - Shotgun — 8 pellets, ±20° random spread, 9 dmg/pellet
  - Bouncy Larpa — 3 bounces, 3s fuse, 42 dmg
  - Zimm — no gravity, infinite elastic bounces, white; explodes on worm hit only, 27 dmg
  - Cluster Bomb — spawns 5 bomblets on explosion; each bomblet spawns 5 fragments (2-level chain)
  - Mine — deploys on terrain, 700ms arm delay, triggers any worm proximity (22px), 56 dmg
  - Chiquita Bomb — spawns 7 fragments on explosion, 20 dmg primary
- Fragment weapon (internal): 17px explosion radius, 6 dmg, used by grenade/cluster/chiquita
- Object-pooled particle system (200 pool) with 3-phase animation:
  - 6-10 shrapnel pieces per primary explosion
  - 2-3 per shotgun pellet, 3-4 per fragment/bomblet, 0 for minigun
  - Each particle: gravity, 2px terrain carve on hit, 1-2 HP worm damage on hit
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

## STOPPED HERE — end of session 2026-03-19

### Last completed
- GameState/Renderer refactoring: pure logic separated from Phaser rendering
- TerrainDestroyer + CrateSystem decoupled from Phaser
- Splitscreen camera: P1 left half, P2 right half, divider line, both tracked independently
- Splitscreen HUD: player info at bottom of each viewport, timer at top center
- Camera zoom increased to 3x for splitscreen

### Next task to start
- No specific task planned — see possible next steps below

## Possible next steps (not planned)
- AI opponent (bot controller for P2)
- Weapon-specific audio cues (zimm ricochet ping, mine arm click, etc.)
- Flamethrower / homing missile (spec: do not implement yet)
- Animated worm sprites instead of circle-segments
- Sound effects from files instead of procedural Web Audio
- Online multiplayer (WebSocket / Socket.io)
