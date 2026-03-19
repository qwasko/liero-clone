# Liero Clone — Status

## Last completed: Fullscreen canvas + camera zoom 2x

## What is currently working
- Two-player same-keyboard match (P1: arrows/Shift/Ctrl, P2: WASD/Space/F)
- Destructible procedural cave terrain
- **Fullscreen canvas** — Phaser Scale Manager FIT + CENTER_BOTH, fills browser window
- **Camera zoom 2x** — dual-camera architecture:
  - Main camera: zoom=2, follows P1 worm, renders world objects
  - HUD camera: zoom=1, static overlay, renders UI elements only
  - camera.ignore() segregates world vs HUD rendering
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
- Object-pooled particle system (200 pool):
  - 6-10 dark shrapnel pieces per primary explosion
  - 2-3 per shotgun pellet, 3-4 per fragment/bomblet, 0 for minigun
  - Each particle: gravity, 2px terrain carve on hit, 1-2 HP worm damage on hit, then disappears
  - Impact burst: 8-12px bright orange/white flash circle lasting 0.1s on every impact
- Self-damage: 50% of splash damage when owner worm is caught in own explosion
- Ninja rope (CHANGE+JUMP; climb to anchor, anchor destruction releases rope)
- Terrain digging in crosshair direction; block zone ±10° of straight up only
- HP bars, match timer, weapon HUD (pinned to screen via dedicated HUD camera)
- Lives system (3 lives each) + respawn after 2s
- Win condition (elimination or timer expiry)
- Bonus crates: spawn every ~18s, max 5 on map
- Procedural audio (fire, explosion, jump, pickup, rope)
- Explosion screen flash (red vignette)
- Per-slot independent reload timers
- Level selection menu (Normal / Large Open / Tiny)
- Camera follows P1 worm; setBounds clamps to map edges
- Projectiles travel full map dimensions before despawning
- 4-segment worm sprites with aim-tracking eye (P1 green, P2 red)
- Mode selection: Normal Deathmatch or Game of Tag

## Known issues / bugs
- Camera only follows P1; P2 can walk off-screen on large maps
  (acceptable for same-screen 2-player testing)
- No dedicated sounds for new weapons (larpa, zimm, cluster, mine, chiquita)
  — they use generic fire/explosion audio

## Session stopped here
Fullscreen canvas and camera zoom 2x complete (dual-camera architecture).
Last commit: `feat: fullscreen canvas + camera zoom 2x with dual-camera HUD`

## Possible next steps (not planned)
- AI opponent (bot controller for P2)
- Weapon-specific audio cues (zimm ricochet ping, mine arm click, etc.)
- Flamethrower / homing missile (spec: do not implement yet)
- Animated worm sprites instead of circle-segments
- Sound effects from files instead of procedural Web Audio
- Online multiplayer (WebSocket / Socket.io)
- Splitscreen camera for proper 2-player experience
