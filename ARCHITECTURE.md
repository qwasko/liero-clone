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
| `TerrainGenerator.ts` | Procedural level creation: cave bubbles, winding tunnels, rock clusters. |
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
| `InputState.ts` | Frame snapshot: `{ left, right, up, down, jump, fire, change }`. |
| `InputManager.ts` | Polls Phaser keyboard → `InputState` per player. Respects custom keybindings. |

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

### Scenes (`src/scenes/`)

| File | Responsibility |
|---|---|
| `BootScene.ts` | Brief splash, transition to menu. |
| `MenuScene.ts` | Main menu: New Game, Settings, Controls, Quit. Shows settings summary. |
| `SettingsScene.ts` | Data-driven settings rows. UP/DOWN navigate, LEFT/RIGHT change values. |
| `ControlsScene.ts` | Two-column key binding editor. ENTER to rebind, captures next keypress. |
| `GameScene.ts` | **Main orchestrator.** Wires input → GameState → rendering. Manages cameras, HUD, AI, pause menu, crate visuals. |
| `GameOverScene.ts` | Deathmatch results screen. |
| `TagOverScene.ts` | Tag mode results with time breakdown. |

---

## 2. Data Flow

### Per-Frame Game Loop

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
Knockback, AIController
```

### Phaser-Coupled Layer

These depend on Phaser for rendering, input, or scene management:

```
GameScene, MenuScene, SettingsScene, ControlsScene, GameOverScene, TagOverScene, BootScene
InputManager, GameRenderer, TerrainRenderer
HUD, Minimap, AudioManager (Web Audio API)
GameConfig
```

### Dependency Direction

```
Scenes  →  Pure Logic  →  (nothing external)
   ↓
UI / Renderers  →  Entity types only (Worm, Projectile, Loadout)
```

Key rules:
- **Pure logic never imports Phaser or rendering code.**
- **Renderers accept data arrays** (worms, projectiles) — they never import GameState directly.
- **GameScene is the only bridge** between input, logic, and rendering.
- **AIController produces InputState** — same interface as keyboard input. GameState doesn't know the difference.
- **GameState communicates outward only via GameEvent[]** — no callbacks, no observer pattern.

---

## 4. Extension Seams

### Multiplayer (WebSocket)

**Input seam:** `GameState.update()` accepts two `InputState` objects. For networked play:
- Replace `InputManager` with a network adapter that sends local input and receives remote input.
- GameState runs identically — it doesn't care where input comes from.

**Serialization seam:** All entities are plain data (no Phaser objects). Worm, Projectile, TerrainMap are trivially serializable.

**Authority models:**
- *Lockstep:* Both clients run GameState, exchange inputs. Deterministic (no `Math.random` seeding yet — would need fixing).
- *Server-authoritative:* Server runs GameState, sends entity snapshots. Client runs GameRenderer only.

**Event seam:** `GameEvent[]` can be transmitted for remote audio/visual sync.

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
