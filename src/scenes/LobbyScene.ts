import Phaser from 'phaser';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/constants';
import { loadSettings } from '../game/GameSettings';
import type { NetGameSettings, ServerMessage } from '../network/protocol';

type LobbyState = 'menu' | 'hosting' | 'joining' | 'waiting' | 'error';

const SERVER_URL = 'http://localhost:3001';

/**
 * Lobby scene for online multiplayer.
 *
 * States:
 *   menu    — HOST / JOIN / BACK
 *   hosting — waiting for opponent (shows room code)
 *   joining — typing room code
 *   waiting — opponent joined, game starting
 *   error   — show error, press any key to return
 */
export class LobbyScene extends Phaser.Scene {
  private state: LobbyState = 'menu';
  private selected = 0;

  // UI elements
  private titleText!: Phaser.GameObjects.Text;
  private menuTexts!: Phaser.GameObjects.Text[];
  private infoText!: Phaser.GameObjects.Text;
  private codeText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;

  // Network — stored as socket.io Socket (not WebSocket)
  private socket: import('socket.io-client').Socket | null = null;
  private roomCode = '';
  private joinInput = '';

  private readonly MENU_ITEMS = ['HOST GAME', 'JOIN GAME', 'BACK'];

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    this.state = 'menu';
    this.selected = 0;
    this.roomCode = '';
    this.joinInput = '';
    this.socket = null;

    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;

    this.titleText = this.add.text(cx, cy - 160, 'ONLINE PLAY', {
      fontSize: '40px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.menuTexts = this.MENU_ITEMS.map((label, i) =>
      this.add.text(cx, cy - 30 + i * 36, label, {
        fontSize: '20px', color: '#444444', fontFamily: 'monospace',
      }).setOrigin(0.5),
    );

    this.infoText = this.add.text(cx, cy + 60, '', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5);

    this.codeText = this.add.text(cx, cy + 10, '', {
      fontSize: '48px', color: '#00ff88', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.hintText = this.add.text(cx, cy + 195, '', {
      fontSize: '11px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.refreshDisplay();

    // Keyboard input
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      this.handleKey(event);
    });
  }

  shutdown(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.socket) {
      this.socket.off(); // remove all listeners
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ── Key handling ──────────────────────────────────────────────────────

  private handleKey(event: KeyboardEvent): void {
    switch (this.state) {
      case 'menu':
        this.handleMenuKey(event);
        break;
      case 'hosting':
      case 'waiting':
        if (event.key === 'Escape') {
          this.cleanup();
          this.state = 'menu';
          this.refreshDisplay();
        }
        break;
      case 'joining':
        this.handleJoinKey(event);
        break;
      case 'error':
        this.cleanup();
        this.state = 'menu';
        this.refreshDisplay();
        break;
    }
  }

  private handleMenuKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowUp':
        this.selected = (this.selected - 1 + this.MENU_ITEMS.length) % this.MENU_ITEMS.length;
        this.refreshDisplay();
        break;
      case 'ArrowDown':
        this.selected = (this.selected + 1) % this.MENU_ITEMS.length;
        this.refreshDisplay();
        break;
      case 'Enter':
        this.selectItem();
        break;
      case 'Escape':
        this.scene.start('MenuScene');
        break;
    }
  }

  private handleJoinKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.state = 'menu';
      this.joinInput = '';
      this.refreshDisplay();
      return;
    }
    if (event.key === 'Backspace') {
      this.joinInput = this.joinInput.slice(0, -1);
      this.refreshDisplay();
      return;
    }
    if (event.key === 'Enter' && this.joinInput.length === 4) {
      this.doJoin(this.joinInput.toUpperCase());
      return;
    }
    // Accept alphanumeric chars, max 4
    if (/^[a-zA-Z0-9]$/.test(event.key) && this.joinInput.length < 4) {
      this.joinInput += event.key.toUpperCase();
      this.refreshDisplay();
    }
  }

  // ── Menu actions ──────────────────────────────────────────────────────

  private selectItem(): void {
    switch (this.selected) {
      case 0: // HOST
        this.doHost();
        break;
      case 1: // JOIN
        this.state = 'joining';
        this.joinInput = '';
        this.refreshDisplay();
        break;
      case 2: // BACK
        this.scene.start('MenuScene');
        break;
    }
  }

  private doHost(): void {
    this.state = 'hosting';
    this.refreshDisplay();

    this.connectSocket(() => {
      const settings = this.buildNetSettings();
      this.sendMessage({ type: 'create_room', settings });
    });
  }

  private doJoin(code: string): void {
    this.state = 'waiting';
    this.refreshDisplay();

    this.connectSocket(() => {
      this.sendMessage({ type: 'join_room', code });
    });
  }

  // ── Socket.io via raw WebSocket (socket.io-client not needed) ─────────

  private connectSocket(onConnect: () => void): void {
    // If we already have a connected socket, reuse it
    if (this.socket?.connected) {
      this.socket.off(); // clear stale listeners
      this.setupSocketListeners(this.socket, onConnect);
      onConnect();
      return;
    }

    // Clean up any disconnected/stale socket before creating a new one
    this.cleanup();
    this.loadSocketIO(onConnect);
  }

  private async loadSocketIO(onConnect: () => void): Promise<void> {
    try {
      const { io } = await import('socket.io-client');
      const socket = io(SERVER_URL, {
        transports: ['websocket'],
        autoConnect: true,
      });

      this.socket = socket;
      this.setupSocketListeners(socket, onConnect);
    } catch {
      this.showError('Cannot connect to server');
    }
  }

  private setupSocketListeners(
    socket: import('socket.io-client').Socket,
    onConnect: () => void,
  ): void {
    // Remove all existing listeners first to prevent stacking
    socket.off('connect');
    socket.off('message');
    socket.off('connect_error');
    socket.off('disconnect');

    socket.on('connect', () => {
      onConnect();
    });

    socket.on('message', (msg: ServerMessage) => {
      this.handleServerMessage(msg);
    });

    socket.on('connect_error', () => {
      this.showError('Cannot connect to server');
    });

    socket.on('disconnect', () => {
      if (this.state === 'hosting' || this.state === 'waiting') {
        this.showError('Disconnected from server');
      }
    });
  }

  private sendMessage(msg: import('../network/protocol').ClientMessage): void {
    if (!this.socket) return;
    this.socket.emit('message', msg);
  }

  // ── Server message handling ───────────────────────────────────────────

  private handleServerMessage(msg: ServerMessage): void {
    if (!this.scene.isActive()) return;
    console.log('[LobbyScene] received message:', msg.type, msg);
    switch (msg.type) {
      case 'room_created':
        this.roomCode = msg.code;
        this.state = 'hosting';
        this.refreshDisplay();
        break;

      case 'game_start': {
        console.log('[LobbyScene] game_start! seed=', msg.seed, 'playerIndex=', msg.playerIndex);
        // Remove all listeners before handing socket to GameScene
        const sock = this.socket;
        if (!sock) break;
        sock.off(); // remove all listeners — GameScene/NetworkClient will add its own
        // Transition to GameScene with network settings
        this.scene.start('GameScene', {
          settings: loadSettings(),
          online: {
            socket: sock,
            seed: msg.seed,
            settings: msg.settings,
            playerIndex: msg.playerIndex,
          },
        });
        // Don't close socket — GameScene takes ownership
        this.socket = null;
        break;
      }

      case 'error':
        this.showError(msg.message);
        break;

      case 'player_disconnected':
        this.showError('Opponent disconnected');
        break;
    }
  }

  // ── Display ───────────────────────────────────────────────────────────

  private refreshDisplay(): void {
    // Hide all dynamic elements first
    this.menuTexts.forEach(t => t.setVisible(false));
    this.codeText.setVisible(false);
    this.infoText.setVisible(false);
    this.hintText.setVisible(false);

    switch (this.state) {
      case 'menu':
        this.titleText.setText('ONLINE PLAY');
        this.menuTexts.forEach((t, i) => {
          t.setVisible(true);
          const active = i === this.selected;
          t.setText(active ? `▶ ${this.MENU_ITEMS[i]}` : `  ${this.MENU_ITEMS[i]}`);
          t.setStyle({
            fontSize: active ? '24px' : '20px',
            color: active ? '#ffffff' : '#444444',
            fontFamily: 'monospace',
          });
        });
        this.hintText.setVisible(true);
        this.hintText.setText('UP/DOWN = navigate | ENTER = select | ESC = back');
        break;

      case 'hosting':
        this.titleText.setText('HOSTING GAME');
        this.codeText.setVisible(true);
        this.codeText.setText(this.roomCode || '....');
        this.infoText.setVisible(true);
        this.infoText.setText('Share this code with your opponent');
        this.hintText.setVisible(true);
        this.hintText.setText('Waiting for opponent... | ESC = cancel');
        break;

      case 'joining':
        this.titleText.setText('JOIN GAME');
        this.codeText.setVisible(true);
        this.codeText.setText(this.joinInput + '_'.repeat(4 - this.joinInput.length));
        this.codeText.setStyle({ fontSize: '48px', color: '#ffcc00', fontFamily: 'monospace' });
        this.infoText.setVisible(true);
        this.infoText.setText('Enter 4-character room code');
        this.hintText.setVisible(true);
        this.hintText.setText('Type code + ENTER | ESC = cancel');
        break;

      case 'waiting':
        this.titleText.setText('CONNECTING...');
        this.infoText.setVisible(true);
        this.infoText.setText('Connecting to server...');
        this.hintText.setVisible(true);
        this.hintText.setText('ESC = cancel');
        break;

      case 'error':
        // handled by showError
        break;
    }
  }

  private showError(message: string): void {
    if (!this.scene.isActive()) return;
    this.state = 'error';
    this.menuTexts.forEach(t => t.setVisible(false));
    this.codeText.setVisible(false);
    this.titleText.setText('ERROR');
    this.infoText.setVisible(true);
    this.infoText.setText(message);
    this.infoText.setStyle({ fontSize: '16px', color: '#ff4444', fontFamily: 'monospace', align: 'center' });
    this.hintText.setVisible(true);
    this.hintText.setText('Press any key to return');
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private buildNetSettings(): NetGameSettings {
    const s = loadSettings();
    return {
      lives: s.lives,
      reloadMultiplier: s.reloadSpeedPercent / 100,
      matchDurationSeconds: s.matchTimerMinutes > 0 ? s.matchTimerMinutes * 60 : 0,
      p1Hp: s.p1Hp,
      p2Hp: s.p2Hp,
      levelIndex: s.levelIndex,
      gameMode: s.gameMode,
    };
  }
}
