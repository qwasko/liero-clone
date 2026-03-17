# Liero Clone — Status

## Last completed: Camera follow + level selection system

## What is currently working
- Two-player same-keyboard match (P1: arrows/Shift/Ctrl, P2: WASD/Space/F)
- Destructible procedural cave terrain
- Full weapon loadout: Bazooka, Minigun (10000 ammo), Grenade, Shotgun
- Ninja rope (CHANGE+JUMP; climb to anchor, anchor destruction releases rope)
- Terrain digging in crosshair direction (hold direction + tap opposite)
  - Block zone reduced to ±10° of straight up only
- HP bars, match timer, weapon HUD (pinned to screen with setScrollFactor)
- Lives system (3 lives each) + respawn after 2s
- Win condition (elimination or timer expiry)
- Bonus crates: spawn every ~18s, max 5 on map
- Procedural audio (fire, explosion, jump, pickup, rope)
- Explosion screen flash (red vignette, replaces camera shake)
- Load+Change: per-slot independent reload timers
- Level selection menu (UP/DOWN = mode, LEFT/RIGHT = level, ENTER = start):
  - Normal: 800×500, ~80% fill, few large caves
  - Large Open: 1600×1000, ~50% fill, many large caves (2× map size)
  - Tiny: 400×250, ~90% fill, tight tunnels
- Camera follows P1 worm via Phaser startFollow + Zone focus point
  - setBounds clamps to map edges (no black space)
  - 1:1 pixel scale always (no zoom)
- Projectiles travel full map width before despawning (not capped at canvas size)
- Worm edge-clamping uses terrain dimensions (works on all map sizes)
- Mode selection: Normal Deathmatch or Game of Tag
- Game of Tag mode with cumulative time tracking and results screen

## Known issues / bugs
- Camera only follows P1; P2 can walk off-screen on large maps
  (acceptable for same-screen 2-player testing)

## Session stopped here
Camera system rewritten using Phaser startFollow + invisible Zone target.
Last commit: `fix: camera follows P1 worm only, not midpoint between worms`

## Possible next steps (not planned)
- AI opponent (bot controller for P2)
- More weapons (flamethrower, dynamite, homing missile, etc.)
- Animated worm sprites instead of rectangles
- Sound effects from files instead of procedural Web Audio
- Online multiplayer (WebSocket / Socket.io)
- Splitscreen camera for proper 2-player experience
