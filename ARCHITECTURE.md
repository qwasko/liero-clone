# Liero Clone — Architecture

## Overview

Browser-based 2-player worm combat game. Core design principle: **pure game logic separated from Phaser rendering**. `GameState` owns all simulation; `GameScene` orchestrates input, events, and visuals.

---

## 1. Main Systems and Responsibilities

### Game Core (`src/game/`)

| File | Responsibility |
|---|---|
| `GameState.ts` | Central game loop. Owns all entities, systems, terrain. `update(dt, input1, input2)` returns `GameEvent[]` for side-effects. **No Phaser dependency.** |
| `GameEvents.ts` | Union type for all events: sound, visual effects, match results. |
| `GameSettings.ts` | Persistent user preferences (localStorage). Reload speed, lives, HP, keys, zoom, mode. |
| `GameConfig.ts` | Phaser bootstrap — registers all scenes, canvas size, scale mode. |
| `LevelPreset.ts` | Static level definitions (name, dimensions, terrain generation params). |
| `constants.ts` | Tuning values: gravity, move speed, knockback forces, velocity caps, match duration. |
| `ExplosionSystem.ts` | On detonation: carve crater, splash damage with falloff, flat knockback. |
| `RopeSystem.ts` | Ninja rope: launch hook, attach to terrain/worm, spring physics (Hooke's law). |
| `DiggingSystem.ts` | Tunnel carving triggered by directional tap combos. |
| `CrateSystem.ts` | Spawn weapon/health/booby crates on terrain, detect pickup. |
| `TagSystem.ts` | "Game of Tag" mode: track IT worm, accumulate time, determine winner. |

### Entities (`src/entities/`)

| File | Responsibility |
|---|---|
| `Worm.ts` | Player data: position, velocity, HP, aim angle, facing. Pure data + `applyDamage()`. |
| `WormController.ts` | Converts `InputState` → worm velocity/aim. Handles ground, air, and rope states. |
| `Projectile.ts` | Bullet/mine/fragment data: position, velocity, fuse, bounce count, deployment state. |

### Weapons (`src/weapons/`)

| File | Responsibility |
|---|---|
| `WeaponDef.ts` | Interface defining all weapon parameters (speed, gravity, damage, behavior, ammo, etc). |
| `WeaponRegistry.ts` | Data-driven catalog of all weapons. Add weapon = one data entry, zero code changes. |
| `WeaponSystem.ts` | Fire logic: check ammo, spawn pellets with spread/jitter, apply recoil. |
| `Loadout.ts` | Per-worm magazine system: independent reload/delay timers per weapon slot. |

### Terrain (`src/terrain/`)

| File | Responsibility |
|---|---|
| `TerrainMap.ts` | Authoritative pixel-level bitmap. Values: 0=air, 1=dirt, 2=rock (indestructible). |
| `TerrainGenerator.ts` | Procedural level creation: cave bubbles, winding tunnels, rock clusters. Accepts seed for deterministic output. |
| `TerrainDestroyer.ts` | Wraps `carveCircle()`, tracks dirty regions for efficient re-rendering. |
| `TerrainRenderer.ts` | Maintains Phaser CanvasTexture mirroring TerrainMap. Redraws only dirty regions. |

### Physics (`src/physics/`)

| File | Responsibility |
|---|---|
| `PhysicsSystem.ts` | Custom pixel-level collision. Worm movement with step-up slopes, projectile bounce/fuse/proximity. No Phaser arcade physics. |
| `CollisionUtils.ts` | Low-level terrain probes (row/column blocked queries). |

### Input (`src/input/`)

| File | Responsibility |
|---|---|
| `InputState.ts` | Frame snapshot: `{ left, right, up, down, jump, fire, change }`. Also `emptyInputState()`. |
| `InputManager.ts` | Polls Phaser keyboard → `InputState` per player. Respects custom keybindings. |

### Network (`src/network/`)

| File | Responsibility |
|---|---|
| `protocol.ts` | Shared message types for client↔server communication. `ClientMessage`, `ServerMessage`, `NetInputState`, `NetGameSettings`. Used by both browser client and Node server. |
| `NetworkClient.ts` | Thin wrapper around a socket.io `Socket`. Sends `ClientInput` messages, routes incoming `ServerMessage` to a single handler. |
| `LockstepManager.ts` | Deterministic lockstep synchronization. Buffers local input with INPUT_DELAY=3 frames, waits for remote input before advancing `GameState`. Stall detection with 5s disconnect timeout. |

### Server (`server/src/`)

| File | Responsibility |
|---|---|
| `index.ts` | Node.js + Socket.io server. Handles room create/join, relays `ClientInput` to opponent as `ServerRemoteInput`, sends `game_start` with shared seed to both players on room fill. |
| `Room.ts` | Room data: code, seed (generated at creation), settings, player list. Tracks started state. |

### AI (`src/ai/`)

| File | Responsibility |
|---|---|
| `AIController.ts` | Bot opponent. Perceives game state, returns `InputState` — same interface as keyboard. Three difficulty presets (easy/medium/hard) with tunable vision, reaction, accuracy, tactics. |

### UI (`src/ui/`)

| File | Responsibility |
|---|---|
| `HUD.ts` | Splitscreen overlay: HP bars, weapon name, ammo, lives, timer, tag info. Solid bar below viewport. |
| `Minimap.ts` | Top-down terrain view with entity dots. Toggleable (TAB key). |

### Rendering (`src/rendering/`)

| File | Responsibility |
|---|---|
| `GameRenderer.ts` | Stateless draw calls: worms (segmented body + eye), projectiles (mines blink, trails fade), aim crosshairs, impact rings. No game logic imports. |

### Utils (`src/utils/`)

| File | Responsibility |
|---|---|
| `Knockback.ts` | `computeKnockback()` — flat force within blast radius. `getKnockbackForce()` — tier by splash damage. |
| `AudioManager.ts` | Procedural sound via Web Audio API (no audio files). |
| `SeededRNG.ts` | Deterministic PRNG (mulberry32). Replaces `Math.random` everywhere in game logic for lockstep determinism. |

### Scenes (`src/scenes/`)

| File | Responsibility |
|---|---|
| `BootScene.ts` | Brief splash, transition to menu. |
| `MenuScene.ts` | Main menu: New Game, Online Play, Settings, Controls, Quit. |
| `LobbyScene.ts` | Online multiplayer lobby. HOST creates room (gets 4-char code), JOIN enters code. Manages socket.io connection lifecycle, hands socket to GameScene on `game_start`. |
| `SettingsScene.ts` | Data-driven settings rows. UP/DOWN navigate, LEFT/RIGHT change values. |
| `ControlsScene.ts` | Two-column key binding editor. ENTER to rebind, captures next keypress. |
| `GameScene.ts` | **Main orchestrator.** Wires input → GameState → rendering. Manages cameras, HUD, AI, pause menu, crate visuals. In online mode: feeds local input to LockstepManager instead of directly to GameState. |
| `GameOverScene.ts` | Deathmatch results screen. |
| `TagOverScene.ts` | Tag mode results with time breakdown. |

---

## 2. Data Flow

### Per-Frame Game Loop (local mode)

```
GameScene.update(delta)
│
├─ INPUT
│  ├─ InputManager.getPlayer1/2()  →  InputState
│  └─ AIController.getInput(...)   →  InputState  (for bot players)
│
├─ SIMULATION
│  └─ GameState.update(dt, input1, input2)  →  GameEvent[]
│     ├─ RopeSystem.handleInput()
│     ├─ WormController.update()        (movement, aim)
│     ├─ Weapon cycling (with repeat acceleration)
│     ├─ Loadout.update(dt)             (reload/delay timers)
│     ├─ DiggingSystem.update()
│     ├─ CrateSystem.update(dt)         (spawn, pickup)
│     ├─ WeaponSystem.tryFire()         → new Projectile[]
│     ├─ PhysicsSystem.update()         (worms)
│     ├─ PhysicsSystem.updateProjectiles()  → onHit callbacks
│     │   └─ ExplosionSystem.detonate() (crater + damage + knockback)
│     ├─ RopeSystem.applyConstraint()
│     ├─ Trail particle spawning
│     ├─ Respawn timers
│     └─ Win condition check
│
├─ EVENTS → SIDE EFFECTS
│  └─ processEvent(event)
│     ├─ AudioManager.play*()
│     ├─ Camera shake
│     ├─ Screen flash
│     └─ Impact ring visuals
│
├─ RENDERING
│  ├─ TerrainRenderer.redrawRegion()   (dirty regions only)
│  ├─ Crate visual sync (create/destroy sprites)
│  ├─ GameRenderer.drawWorms()
│  ├─ GameRenderer.drawAimLines()
│  ├─ GameRenderer.drawProjectiles()
│  ├─ RopeSystem.draw()
│  └─ HUD.update() / Minimap.update()
│
└─ CAMERA
   ├─ Main camera → follows worm1
   └─ P2 camera   → follows worm2
```

### Per-Frame Game Loop (online/lockstep mode)

```
GameScene.update(delta)
│
├─ INPUT
│  └─ InputManager.getPlayer1()  →  localInput  (always P1 keys — each machine is local P1)
│
├─ LOCKSTEP
│  └─ LockstepManager.update(localInput)
│     ├─ Buffer localInput for frames currentFrame .. currentFrame + INPUT_DELAY
│     ├─ NetworkClient.sendInput(frame, input)  →  server  →  opponent
│     └─ tryAdvance(): for each frame where both local + remote input available:
│           GameState.update(FIXED_DT, input1, input2)  →  GameEvent[]  [same as local]
│           (stall if remote input missing; disconnect after 5s stall)
│
├─ EVENTS → SIDE EFFECTS   [same as local]
│
├─ RENDERING               [same as local]
│
└─ CAMERA                  [same as local]

Incoming from server (async, via socket.io):
  ServerRemoteInput  →  LockstepManager.remoteInputs.set(frame, input)
  ServerPlayerDisconnected  →  LockstepManager.onDisconnect()
```

### Lobby / Game Start Flow (online)

```
LobbyScene (HOST)                    Server                    LobbyScene (JOIN)
     │                                  │                            │
     ├─ create_room(settings) ─────────►│                            │
     │◄─ room_created(code, seed) ──────┤                            │
     │  [show code to user]             │                            │
     │                                  │◄─── join_room(code) ───────┤
     │                                  │  room.start()              │
     │◄─ game_start(seed, P0) ──────────┤                            │
     │                                  ├──── game_start(seed, P1) ──►│
     │  sock.off() → GameScene          │          sock.off() → GameScene
     │  GameScene.create({ online })    │          GameScene.create({ online })
     │  TerrainGenerator(seed) ─────────────────── TerrainGenerator(seed)  [identical]
     │  NetworkClient + LockstepManager │          NetworkClient + LockstepManager
     └─ [game loop begins] ─────────────────────── [game loop begins]
```

### Settings Flow

```
SettingsScene / ControlsScene
  │  saveSettings()
  ↓
localStorage (JSON)
  │  loadSettings()
  ↓
MenuScene  →  GameScene.create({ settings })
                ├─ GameState(options: lives, reloadMultiplier, p1Hp, p2Hp, duration)
                ├─ Cameras (p1Zoom, p2Zoom)
                ├─ InputManager(p1Keys, p2Keys)
                └─ AIController(difficulty, botUseMinimap)

Online mode: host's settings are sent to server in create_room,
server stores them in Room, sends to both clients in game_start.
```

---

## 3. Dependency Rules

### Pure Logic Layer (no Phaser)

These modules have **zero Phaser imports** and can be tested or reused independently:

```
GameState, GameEvents, GameSettings, constants, LevelPreset
Worm, WormController, Projectile
PhysicsSystem, CollisionUtils
WeaponSystem, WeaponDef, WeaponRegistry, Loadout
ExplosionSystem, RopeSystem, DiggingSystem, CrateSystem, TagSystem
TerrainMap, TerrainDestroyer, TerrainGenerator
Knockback, AIController, SeededRNG
NetworkClient, LockstepManager, protocol  (socket.io-client only, no Phaser)
```

### Phaser-Coupled Layer

These depend on Phaser for rendering, input, or scene management:

```
GameScene, MenuScene, LobbyScene, SettingsScene, ControlsScene, GameOverScene, TagOverScene, BootScene
InputManager, GameRenderer, TerrainRenderer
HUD, Minimap, AudioManager (Web Audio API)
GameConfig
```

### Server Layer (Node.js only, no browser APIs)

```
server/src/index.ts, server/src/Room.ts
Shares: src/network/protocol.ts (types only, no runtime deps)
```

### Dependency Direction

```
Scenes  →  Pure Logic  →  (nothing external)
   ↓          ↓
   └──────────┴──  Network layer  →  socket.io-client (browser)
                                  →  socket.io (server)

UI / Renderers  →  Entity types only (Worm, Projectile, Loadout)
```

Key rules:
- **Pure logic never imports Phaser or rendering code.**
- **Renderers accept data arrays** (worms, projectiles) — they never import GameState directly.
- **GameScene is the only bridge** between input, logic, and rendering.
- **AIController produces InputState** — same interface as keyboard input. GameState doesn't know the difference.
- **GameState communicates outward only via GameEvent[]** — no callbacks, no observer pattern.
- **LockstepManager wraps GameState.update()** — GameState doesn't know it's being called from lockstep vs local.
- **protocol.ts is shared** between browser and server with no platform-specific imports.

---

## 4. Extension Seams

### Multiplayer (WebSocket) — implemented

**Authority model chosen: lockstep.** Both clients run identical `GameState` with shared seed and exchanged inputs.

**Input seam:** `LockstepManager` wraps `GameState.update()`, supplying `(FIXED_DT, localInput, remoteInput)`. GameState is unchanged.

**Determinism:** `SeededRNG` replaces `Math.random` everywhere. Both clients use the same seed (from server) → identical terrain, identical physics.

**Known limitation:** Physics runs at fixed 60fps in lockstep but at variable fps locally. If local game runs at >60fps, local dt < 1/60s per tick, making forces feel lighter. To fully match: cap local dt to 1/60 as well.

### AI Extensions

**AI seam:** `AIController.getInput()` takes full game state as parameters and returns `InputState`. To add new AI:
- Implement same interface.
- Difficulty is data-driven (`AIDifficulty` interface) — new presets need no code changes.

**Bot-vs-bot:** Already supported. `GameScene` creates `aiController1` and/or `aiController2` based on `PlayerType` settings.

### Splitscreen / Camera

**Camera seam:** `GameScene` already creates two independent Phaser cameras with per-player zoom. Adding more viewports or changing layout only affects `GameScene.create()`.

### New Weapons

**Weapon seam:** Add entry to `WeaponRegistry` and optionally to `DEFAULT_LOADOUT`. No code changes needed — all behavior is data-driven through `WeaponDef` fields (fire mode, projectile behavior, bounce, fuse, proximity, cluster, trail, etc).

### New Game Modes

**Mode seam:** `GameState` checks `gameMode` for win conditions and tag logic. New modes:
- Add mode to `GameSettings.gameMode` union type.
- Add win-condition branch in `GameState.checkMatchEnd()`.
- Create results scene (like `TagOverScene`).

---

## 5. Key Files Per System

| System | Entry Point | Core Files |
|---|---|---|
| **Game Loop** | `GameScene.ts` | `GameState.ts`, `GameEvents.ts`, `constants.ts` |
| **Settings** | `SettingsScene.ts` | `GameSettings.ts`, `ControlsScene.ts` |
| **Entities** | — | `Worm.ts`, `Projectile.ts`, `WormController.ts` |
| **Weapons** | `WeaponRegistry.ts` | `WeaponDef.ts`, `WeaponSystem.ts`, `Loadout.ts` |
| **Terrain** | `TerrainGenerator.ts` | `TerrainMap.ts`, `TerrainDestroyer.ts`, `TerrainRenderer.ts` |
| **Physics** | `PhysicsSystem.ts` | `CollisionUtils.ts`, `Knockback.ts` |
| **Input** | `InputManager.ts` | `InputState.ts` |
| **AI** | `AIController.ts` | (self-contained) |
| **Explosions** | `ExplosionSystem.ts` | `Knockback.ts`, `TerrainDestroyer.ts` |
| **Rope** | `RopeSystem.ts` | (self-contained, draws own visuals) |
| **UI** | `HUD.ts` | `Minimap.ts` |
| **Rendering** | `GameRenderer.ts` | `TerrainRenderer.ts` |
| **Audio** | `AudioManager.ts` | (self-contained, Web Audio API) |
| **Network (client)** | `LockstepManager.ts` | `NetworkClient.ts`, `protocol.ts` |
| **Network (server)** | `server/src/index.ts` | `server/src/Room.ts`, `src/network/protocol.ts` |
