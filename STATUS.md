# Liero Clone — Status

## Last completed: AI self-damage awareness + throw-and-swing escape

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
  - Bazooka — impact explode, 20px crater, 15 splash dmg, 12 fragments
  - Minigun — rapid fire, per-axis jitter, 8px crater, 5 splash dmg
  - Grenade — bounce (40%), 1640ms fuse, 35 fragments, 20px crater, 15 splash dmg, 2/mag
  - Shotgun — 15 pellets, hitDamage 4/pellet, carve-only explosions, 3/mag
  - Proximity Grenade — bounce, proximity trigger (20px), 857ms activation delay, 35 fragments, 5000ms loading
  - Bouncy Larpa — elastic bounce (100%), 8000ms fuse, trail particles (3 dmg each), ownerGrace 857ms, 8 fragments, self-damage after grace
  - Zimm — gravity 0.15, elastic terrain bounce, worm-only explode, 49 HP direct hit, speed 400, visual trail (white→blue), self-damage, ownerGrace 429ms, 15px spawn offset, progressive anti-stuck (jitter escalation + position tracking)
  - Cluster Bomb — bounce (50%), 1930ms fuse, 20 bomblets (bounce+430ms fuse), 20px crater
  - Mine — deploys on terrain, 857ms arm delay, proximity trigger (22px), 20 splash dmg, 8 fragments
  - Sticky Mine — fires with no gravity, attaches to terrain, detaches when terrain destroyed, re-attaches on fall, 857ms arm delay, proximity (25px), 60 HP flat damage, 8 dedicated fragments (8 dmg each), ownerGrace 857ms
  - Chiquita Bomb — bounce (40%), 2140ms fuse, 22 bomblets (bounce+430ms fuse), 20px crater
- **Explosion damage scaling**: effective splash radius = crater × 3
  - Fragment 8px crater → 24px damage zone
  - Medium 14px crater → 42px damage zone
  - Large 20px crater → 60px damage zone
- Fragment/bomblet types:
  - chiquita_fragment: impact-explode (8px crater, 5 dmg) — used by grenade/proximity_grenade
  - bazooka_fragment: impact-explode — used by bazooka/larpa/larpa_trail/mine
  - sticky_mine_fragment: impact-explode (hitDamage 8, gravity 0.7)
  - cluster_bomblet: bounce + 430ms fuse (14px crater, 10 dmg)
  - chiquita_bomblet: bounce + 430ms fuse (20px crater, 15 dmg)
- Fragment terrain grace: 150ms immunity to terrain collision after spawn (escape crater)
- **Owner grace system**: ownerGraceMs on weapons, projectile ownerGrace timer; while > 0 owner excluded from damage, after expiry full self-damage
- **Trail particle system**: data-driven (trailWeaponId/trailIntervalMs on WeaponDef), trail particles inherit parent ownerGrace
- **flatDamage**: ExplosionSystem option for full damage within radius (no distance falloff)
- **hitsAllWorms**: fragments, larpa, larpa_trail, sticky_mine, sticky_mine_fragment, zimm skip owner exclusion on direct hit
- **Zimm anti-resonance system**:
  - Slight gravity (0.15) curves trajectory over time
  - ±5° base jitter on each terrain bounce (escalated by stuck detection)
  - Progressive stuck detection: track 20 positions on 5px grid
    - < 4 unique → 2x jitter, < 3 → 4x jitter, < 2 → random velocity kick
    - Reset escalation when projectile moves > 30px between frames
  - 429ms owner grace (30 frames) prevents self-hit on spawn
  - 15px spawn offset clears worm body and adjacent terrain
- Object-pooled particle system (200 pool) with 3-phase animation
- Self-damage: 50% of splash damage when owner worm is caught in own explosion (except fullSelfDamage weapons)
- Ninja rope with spring/elastic physics (CHANGE+JUMP; anchor destruction releases rope)
- Sub-pixel vy clamp: grounded worms with |vy| < 0.5 snapped to 0
- Terrain digging in crosshair direction; block zone ±10° of straight up only
- Lives system (3 lives each) + respawn after 2s
- Win condition (elimination or timer expiry)
- Bonus crates: spawn every ~18s, max 5 on map
- Procedural audio (fire, explosion, jump, pickup, rope)
- Explosion screen flash (red vignette) + impact ring visual
- **Magazine ammo system**: per-weapon magazine size, shot delay, and loading time
  - HUD shows ammo count + blue reload progress bar
- Level selection menu (Normal / Large Open / Tiny)
- Projectiles travel full map dimensions before despawning
- 4-segment worm sprites with aim-tracking eye (P1 green, P2 red)
- Mode selection: Normal Deathmatch or Game of Tag
- **AI bot opponent** (vs AI mode):
  - AIController produces InputState — same interface as keyboard, game can't distinguish
  - Vision-limited: AI sees only a viewport-sized rectangle centered on its worm
  - Vision rect scales with camera zoom and difficulty visionMultiplier
  - 4 behavior states: ENGAGE, APPROACH, SEARCH, EXPLORE
  - Enemy memory: remembers last known position for 3 seconds after losing sight
  - Reaction delay buffer: raw perceptions delayed by N frames before acting
  - Aim jitter: re-rolled every 0.8-2s for natural-looking inaccuracy
  - Fire control: respects single/auto fire modes, cooldown between shots
  - Navigation: jump, dig (2-frame rising edge), rock reroute, rope swing
  - Obstacle-aware weapon selection: range + LOS + blockType + thickness
  - Dead angle escape: strafes out when enemy is in aim dead zone
  - **Self-damage awareness**: ballistic landing estimate, enclosed space detection
    - Explosive weapons suppressed when blast would hit self (splashRadius × 1.5)
    - Tunnel detection: terrain in 4+ of 8 directions → avoid all explosives
    - Auto-switch to safe weapon (shotgun/minigun) when explosive is unsafe
    - Difficulty scaling: Easy 90% cautious, Medium 60%, Hard 30%
  - **Throw-and-swing escape**: after firing explosive, rope away from blast
    - Sequence: fire → wait 20-30 frames → launch rope → swing away from enemy
    - Probability: Easy 15%, Medium 45%, Hard 75%
    - Swing direction mirrored (away from last known enemy position)
  - 3 difficulty presets (Easy/Medium/Hard) with vision, reaction, aim, awareness tuning
  - Menu: TAB toggles 2P Local / vs AI, 1/2/3 selects difficulty

## Known issues / bugs
- No dedicated sounds for new weapons (larpa, zimm, cluster, mine, chiquita, sticky_mine, proximity_grenade)
  — they use generic fire/explosion audio
- Diagnostic console.log still active in ExplosionSystem, GameState, ParticleSystem
  — remove before release
- AI bot not yet tested in-game — may need tuning (aim, fire timing, movement)

## STOPPED HERE — end of session 2026-03-22

### Last completed
- AI self-damage awareness: ballistic estimate + enclosed space detection + auto-switch to safe weapon
- AI throw-and-swing escape: fire explosive → wait → rope → swing away (difficulty-scaled probability)
- New AIDifficulty fields: selfDamageAwareness, escapeRopeProbability

### Next task to start
- Test AI in-game and tune self-damage awareness thresholds / escape timing

## Possible next steps (not planned)
- AI Phase 3: dodge incoming projectiles, advanced positioning
- Weapon-specific audio cues (zimm ricochet ping, mine arm click, etc.)
- Flamethrower / homing missile (spec: do not implement yet)
- Animated worm sprites instead of circle-segments
- Sound effects from files instead of procedural Web Audio
- Online multiplayer (WebSocket / Socket.io)
- Remove diagnostic console.log statements
