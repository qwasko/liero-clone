# Liero Clone — Status

## Last completed: Architecture docs + knockback/HP tuning (2026-03-25)

## What is currently working
- Two-player same-keyboard match (P1: arrows/Shift/Ctrl, P2: WASD/Space/F)
- Green worm change key: `/` (forward slash)
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
- Full weapon loadout (11 weapons, cycle with CHANGE+LEFT/RIGHT):
  - Bazooka, Minigun, Grenade, Shotgun, Proximity Grenade
  - Bouncy Larpa, Zimm, Cluster Bomb, Mine, Sticky Mine, Chiquita Bomb
- **Knockback & recoil physics** (flat force, no distance falloff):
  - Knockback tiers based on splashDamage: >30 Large (150), 10-30 Medium (100), <10 Small (40)
  - Recoil: Shotgun 200, Bazooka 100, Zimm 60, Grenade 50, Larpa/Cluster/Chiquita 40, Prox.Grenade 30, Minigun 11
  - Mine knockback: deployed mines detached by nearby explosions (50% force)
  - Velocity caps: 600 px/s horizontal, 700 px/s vertical
- **Per-worm HP setting**: 50/100/150/200/300/500, applied at spawn/respawn, heal crate capped
- **Settings menu** with localStorage persistence:
  - Reload Speed 0-500%, Match Timer, Lives 1-10, P1/P2 HP
  - P1/P2 type: Human / AI Easy / AI Medium / AI Hard (bot vs bot supported)
  - P1/P2 camera zoom 0.5-3.0
  - Minimap On/Off, Bot uses map
  - Level Size, Game Mode (Deathmatch/Tag)
- **Controls menu**: configurable key bindings per player, rebind with ENTER, saved to localStorage
- **Pause menu**: ESC → Continue / New Game
- **AI bot** with 3 difficulty presets, tactical weapon selection, threat scoring, rope escape
- **Minimap** per-viewport overlay (TAB toggle)
- Ninja rope, digging, magazine ammo, bonus crates, procedural audio
- Game of Tag mode (any death = become IT)
- ARCHITECTURE.md documenting full system design

## Known issues / bugs
- No dedicated sounds for new weapons — they use generic fire/explosion audio
- AI bot may need further tuning
- `Math.random` not seeded — would block deterministic lockstep multiplayer

## STOPPED HERE — end of session 2026-03-25

### This session completed
- Per-worm HP setting (P1 HP / P2 HP in settings menu)
- Knockback: removed distance falloff (flat force, Liero-accurate)
- Knockback tiers changed from crater-radius-based to splashDamage-based
- Knockback values tuned: 150/100/40
- Recoil tuned: Bazooka 100, Grenade 50, Minigun 11, Shotgun 200, Prox.Grenade 30
- Velocity caps raised: VX 600, VY 700
- ARCHITECTURE.md written (systems, data flow, dependencies, extension seams)

### Next goal: Online Multiplayer

Based on ARCHITECTURE.md analysis, here's what needs to change:

**What's already multiplayer-ready:**
- GameState is pure logic, no Phaser — can run on server
- InputState is a simple interface — trivially serializable
- GameEvent[] for side-effects — can be sent to clients
- All entities (Worm, Projectile) are plain data — no Phaser objects

**What needs to be built:**
1. **Server** — Node.js process running GameState, accepting InputState from both clients via WebSocket
2. **Network layer** — WebSocket (Socket.io) client/server for input + state sync
3. **State serialization** — serialize/deserialize worms, projectiles, terrain damage, loadouts
4. **Lobby/matchmaking** — scene for creating/joining games
5. **Client prediction** — local InputState applied immediately, reconciled with server state
6. **Terrain sync** — initial terrain seed shared; dirty regions broadcast on destruction

**Key architectural decisions needed:**
- Authority model: server-authoritative (recommended) vs lockstep
- If server-authoritative: how much client prediction, how to handle rollback
- If lockstep: need deterministic RNG (seed `Math.random` or use custom PRNG)
- Tick rate: server simulation rate vs client render rate
- Terrain: send full bitmap on join or regenerate from shared seed?
- Latency compensation: input delay buffer, interpolation

**Files that need changes:**
- `GameScene.ts` — swap InputManager for network adapter (remote player)
- `GameState.ts` — extract to run headless on server
- New: `src/network/` — WebSocket client, server, protocol types
- New: `src/scenes/LobbyScene.ts` — create/join game UI
- `GameConfig.ts` — register LobbyScene
- `TerrainGenerator.ts` — accept seed for deterministic generation

## Possible future steps (not planned)
- Weapon-specific audio cues
- Flamethrower / homing missile
- Animated worm sprites
- Sound effects from files
