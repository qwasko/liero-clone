# Liero Clone — Status

## Last completed: Treasure chest crate sprite (2026-04-01)

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
- **Controls menu**: configurable key bindings per player, rebind with ENTER, captures next keypress
- **Pause menu**: ESC → Continue / New Game
- **AI bot** with 3 difficulty presets, tactical weapon selection, threat scoring, rope escape
- **Minimap** per-viewport overlay (TAB toggle)
- Ninja rope, digging, magazine ammo, bonus crates, procedural audio
- Game of Tag mode (any death = become IT)
- ARCHITECTURE.md documenting full system design
- **Online multiplayer (lockstep) — working**:
  - Server: Node.js + Socket.io, room creation with 4-char codes, input relay
  - Client: LobbyScene (host/join UI), NetworkClient, LockstepManager
  - Deterministic: SeededRNG replaces Math.random, shared seed for terrain
  - Adaptive input delay: starts at 15 frames, adjusts down based on network conditions (min 6, max 30)
    - Decreases by 1 every 180 clean frames (~3s); increases by 2 on stall
  - Stall logging throttled: max 1 stall log/second; at MAX_DELAY logs summary every 60 frames
  - Stall detection with 30s timeout, overlay shown after 300ms
  - Grace period: first 60 frames ignore stalls for initial network stabilization
  - Host settings propagated to joiner via server
  - **Deployed: client on GitHub Pages, server on Render.com**
  - Server URL override via `?server=URL` query parameter (for ngrok tunnels)
  - Browser tab blur handled (game loop continues in background)
  - **Automatic reconnect**: 3 attempts × 2s delay on transport drop
    - Shows "Reconnecting... (N/3)" overlay; resumes game on success
    - Shows "Connection lost" and returns to menu after all attempts fail
- **Bonus crate sprite**: pixel-art treasure chest (18×16px, Phaser Graphics)
  - Dark brown wood body + domed lid with rounded top corners
  - Gold border stroke, seam band, corner rivets, center clasp
  - Dark outline halo

## Known issues / bugs
- No dedicated sounds for new weapons — they use generic fire/explosion audio
- AI bot may need further tuning
- **[ONLINE] Both players use P1 keybindings** — by design (each player is local P1 on their own machine)
- **[ONLINE] Diagnostic console.logs active** — per-frame tick logs, stall logs, adaptive delay logs still present for debugging

## STOPPED HERE — end of session 2026-04-01

### This session completed
- **Visual: wooden crate sprite** — replaced yellow `?` square with 14×14 Graphics-drawn wooden box (tan fill, brown cross planks, dark border)
- **Visual: treasure chest sprite** — redesigned bonus crate as 18×16px pixel-art treasure chest:
  - Dark brown wood (#5C3317) body + domed lid (rounded top corners)
  - Gold trim (#DAA520): border stroke, horizontal seam band, 4 corner rivets, center clasp
  - Dark outline halo (#2C1810)
  - Removed unused `CRATE_HALF` import from GameScene.ts

### Next steps
1. Enable GitHub Pages in repo Settings → Pages → Source: GitHub Actions (one-time manual step, if not done)
2. Remove diagnostic console.logs when multiplayer is stable (confirmed stable enough)
3. Weapon-specific audio cues (nice to have)

## Possible future steps (not planned)
- Flamethrower / homing missile
- Animated worm sprites
- Sound effects from files
- Server-side reconnect session preservation (currently relies on socket.io session staying alive during brief drop)
