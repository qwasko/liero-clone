# Liero Clone — Project Instructions for Claude Code

## Project Goal
Browser-based clone of the classic game Liero (1999).
Two worms fight in destructible underground terrain using various weapons.

## Tech Stack
- **TypeScript** — always, never plain JavaScript
- **Vite** — dev server and build tool
- **Phaser.js** — game framework (rendering, physics, input)
- Target: runs in browser, no installation needed for players

## Architecture Rules
- Keep code **modular** — every system in its own file/class
- No "god classes" — one responsibility per module
- Weapon system must be **data-driven** (easy to add new weapons without touching core logic)
- Game modes must be **cleanly separated** so future refactoring is painless

## Folder Structure
```
src/
  game/         # Core game loop, config, constants
  scenes/       # Phaser scenes (Boot, Menu, Game, GameOver)
  entities/     # Worm, Projectile and other game objects
  weapons/      # Weapon definitions and behaviour
  terrain/      # Destructible terrain logic
  ui/           # HUD, menus, overlays
  utils/        # Helpers, math, shared utilities
```

## Future Modes (do NOT implement yet — design for them)
The architecture must support these future extensions without major refactoring:
1. **2-player splitscreen** — two cameras, same machine
2. **1-player vs AI** — AI controller for second worm
3. **1v1 online multiplayer** — WebSocket based (e.g. Socket.io)

For now implement only: **local 2-player same-screen mode**.

## Workflow Rules
- **For small fixes and tuning: code directly, no approval needed.For new major features or architecture changes: confirm plan first**
- Break work into small phases — each phase must be runnable and testable
- After completing each phase: remind me to do a `git commit`
- If you are unsure about a design decision: ask, don't assume
- Prefer simple and readable code over clever one-liners

## Git Commit Convention
```
feat: add destructible terrain rendering
fix: worm gravity not applying on steep slopes
refactor: extract weapon system into separate module
```

## Commands (fill in after project init)
- `npm run dev` — start dev server
- `npm run build` — production build

## Session Management

### After every git commit:
Update STATUS.md with:
- What was just completed
- What is currently working
- Known issues or bugs
- Exact next step

### At end of every session:
Update STATUS.md with a clear "STOPPED HERE" section:
- Last completed task
- Next task to start
- Any unfinished work in progress
- Open decisions that need to be made

## Documentation
- CLAUDE.md — project rules and conventions
- STATUS.md — current state, last session
- ARCHITECTURE.md — system design, data flow, seams
Read all three at session start, before doing anything else.
Summarize current state and confirm next step with me.

## Completion Signals

### Interactive mode (default):
After completing any task, beep to signal done:
powershell -c "[console]::beep(800,200)"

### End of day mode:
If the prompt contains the phrase "DNES VSE",
after the final git commit:
1. Update STATUS.md with completed work and next steps
2. Print session ID: run `claude --print-session-id` or note current session
3. Beep three times to signal end:
   powershell -c "1..3 | % { [console]::beep(1000,300); Start-Sleep -m 300 }"
4. Run /exit to close session
