# Liero Clone

A browser-based clone of the classic 1999 game [Liero](https://liero.nl/) — two worms fight in destructible underground terrain using an arsenal of weapons. Built with TypeScript and Phaser.js.

## Play Now

**[https://qwasko.github.io/liero-clone/](https://qwasko.github.io/liero-clone/)**

---

<!-- Screenshot or GIF goes here -->
<!-- ![gameplay](docs/gameplay.gif) -->

---

## Features

### Gameplay
- Destructible procedural cave terrain
- 11 weapons: Bazooka, Minigun, Grenade, Shotgun, Proximity Grenade, Bouncy Larpa, Zimm, Cluster Bomb, Mine, Sticky Mine, Chiquita Bomb
- Ninja rope, digging, weapon cycling with reload system
- Bonus crates (weapons, health, booby traps)
- Knockback and recoil physics with velocity caps
- Two game modes: **Deathmatch** and **Game of Tag**

### Multiplayer
- **Local 2-player** same-keyboard splitscreen
- **Online 1v1** via lockstep netcode with room codes
- **AI opponents** — Easy / Medium / Hard, supports bot-vs-bot

### Splitscreen
- Classic Liero dual-viewport layout with independent cameras
- Per-player zoom setting (0.5–3.0×)
- Minimap overlay (TAB to toggle)

### Customization
- Configurable key bindings per player
- Settings: HP (50–500), lives (1–10), reload speed (0–500%), match timer, level size
- Persistent settings via localStorage

---

## Online Multiplayer

Online play uses a lockstep model — both clients run the same deterministic simulation using a shared random seed. Inputs are relayed through a server.

### Hosting a game

1. Open the game and select **Online Play → Host Game**
2. Share the 4-character room code with your opponent
3. Wait for them to join — the game starts automatically

### Joining a game

1. Open the game and select **Online Play → Join Game**
2. Enter the 4-character code from your host
3. The game starts automatically once connected

### Using a custom server (ngrok / self-hosted)

Append `?server=<URL>` to the game URL to point at a different server:

```
https://qwasko.github.io/liero-clone/?server=https://your-ngrok-url.ngrok-free.app
```

### Note on free-tier server latency

The default server runs on [Render.com](https://render.com/) free tier, which **spins down after 15 minutes of inactivity**. The first connection after a cold start may take 30–60 seconds. If the lobby seems unresponsive, wait a moment and try again.

The adaptive input delay (6–30 frames) adjusts automatically to match your connection. On a good connection it settles around 6–10 frames (~100–167ms).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Game framework | [Phaser.js](https://phaser.io/) 3 |
| Build tool | [Vite](https://vitejs.dev/) |
| Networking (client) | [Socket.io-client](https://socket.io/) |
| Networking (server) | [Socket.io](https://socket.io/) + Express on Node.js |
| Hosting (client) | GitHub Pages |
| Hosting (server) | Render.com |

---

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Client (game)

```bash
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

### Server (multiplayer)

```bash
cd server
npm install
npm run dev
```

Runs on port 3001. The client automatically connects to `localhost:3001` in local dev mode.

### Build for production

```bash
npm run build   # outputs to dist/
```

---

## Built with Claude Code

This project was built using AI-assisted development with [Claude Code](https://claude.ai/code) — Anthropic's agentic coding tool. Architecture, implementation, and iteration were done collaboratively between the developer and Claude across multiple sessions.
