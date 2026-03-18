# Liero Clone — Status

## Last completed: Particle system + weapon expansion

## What is currently working
- Two-player same-keyboard match (P1: arrows/Shift/Ctrl, P2: WASD/Space/F)
- Destructible procedural cave terrain
- Full weapon loadout (9 weapons, cycle with CHANGE+LEFT/RIGHT):
  - Bazooka — arc shot with minor velocity variance
  - Minigun (10000 ammo) — rapid fire, ±5° spread
  - Grenade — bounces up to 4×, 3s fuse
  - Shotgun — 8 pellets, wide random spread (~49°)
  - Bouncy Larpa — bounces up to 3×, 3s fuse, purple
  - Zimm — no gravity, infinite elastic terrain bounces, white; explodes on worm hit only
  - Cluster Bomb — spawns 7 bomblets on explosion, each with 1.2s fuse
  - Mine — deployes on terrain landing, triggers on enemy proximity (22px), blinks red
  - Chiquita Bomb — on explosion spawns 11 banana fragments flying outward
- Object-pooled particle system (400 particle pool):
  - 20–50 square particles per explosion, weapon-coloured palette
  - Gravity-affected, bounce once off terrain, fade out over 0.5–1s
- Ninja rope (CHANGE+JUMP; climb to anchor, anchor destruction releases rope)
- Terrain digging in crosshair direction; block zone ±10° of straight up only
- HP bars, match timer, weapon HUD (pinned to screen with setScrollFactor)
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
- No sounds for new weapons (larpa, zimm, cluster, mine, chiquita) — they use
  the generic fire/explosion sounds

## Session stopped here
Weapon variety pass complete. Particle system added (object pool).
5 new weapons + shotgun upgrade + bazooka spread variance.
Last commit: `feat: particle system + 5 new weapons (Larpa/Zimm/Cluster/Mine/Chiquita)`

## Possible next steps (not planned)
- AI opponent (bot controller for P2)
- Flamethrower / homing missile (spec: do not implement yet)
- Animated worm sprites instead of circle-segments
- Sound effects from files instead of procedural Web Audio
- Online multiplayer (WebSocket / Socket.io)
- Splitscreen camera for proper 2-player experience
- Weapon-specific audio cues (zimm ricochet ping, mine arm click, etc.)
