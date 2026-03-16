# Liero Clone — Status

## Last completed: Phase 10 — Load+Change (per-slot independent reload timers)

## What is currently working
- Two-player same-keyboard match (P1: arrows/Shift/Ctrl, P2: WASD/Space/F)
- Destructible procedural cave terrain
- Full weapon loadout: Bazooka, Minigun, Grenade, Shotgun
- Ninja rope (hold weapon-change key + jump; independent of loadout)
- Terrain digging (hold direction + tap opposite)
- HP bars, match timer, weapon HUD
- Win condition (worm death or timer expiry)
- Bonus crates: spawn every ~18s, max 5 on map
  - Weapon crate: replaces active weapon slot
  - Health crate: restores 10–50 HP
  - Booby trap: explodes on pickup (looks identical to others)
- Procedural audio (fire, explosion, jump, pickup, rope)
- Screen shake on explosions
- Load+Change: each weapon slot has its own independent reload timer;
  switching weapons mid-reload never blocks the newly selected weapon

## Known issues / bugs
- None currently known

## Next step
- Phase 11: Game of Tag mode
