# Liero Clone — Status

## Last completed: Online multiplayer bug fix (2026-03-25)

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
- **Online multiplayer (lockstep)**:
  - Server: Node.js + Socket.io, room creation with 4-char codes, input relay
  - Client: LobbyScene (host/join UI), NetworkClient, LockstepManager
  - Deterministic: SeededRNG replaces Math.random, shared seed for terrain
  - INPUT_DELAY=3 frames, stall detection with 5s timeout
  - Host settings propagated to joiner via server

## Known issues / bugs
- No dedicated sounds for new weapons — they use generic fire/explosion audio
- AI bot may need further tuning
- Online multiplayer not yet tested end-to-end after socket bug fix
- No reconnection handling — WebSocket drop = 5s stall then disconnect

## Next steps
- Test online multiplayer end-to-end (two browser tabs)
- Handle edge cases: mid-game disconnect UI, return to lobby
- Consider adding latency display / frame counter for debugging

## Possible future steps (not planned)
- Weapon-specific audio cues
- Flamethrower / homing missile
- Animated worm sprites
- Sound effects from files
