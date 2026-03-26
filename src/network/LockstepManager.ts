/**
 * Lockstep synchronization manager.
 *
 * Both clients run the same simulation. Each frame:
 *   1. Capture local input and buffer it for frame N + INPUT_DELAY
 *   2. Send local input to remote via NetworkClient
 *   3. Wait until both inputs are available for the current frame
 *   4. Advance GameState with both inputs
 *
 * Input delay (2-4 frames) hides network latency by delaying local
 * input execution to match the time it takes for remote input to arrive.
 */
import { InputState, emptyInputState } from '../input/InputState';
import { NetworkClient } from './NetworkClient';
import type { NetInputState, ServerMessage } from './protocol';

const FIXED_DT = 1 / 60; // 16.67ms per tick
const INPUT_DELAY = 3;    // frames of input delay
const STALL_TIMEOUT_MS = 5000;   // disconnect after 5s without remote input
const STALL_DISPLAY_MS  = 300;   // only show overlay after 300ms of real stalling

export type TickCallback = (dt: number, input1: InputState, input2: InputState) => void;

export class LockstepManager {
  private localPlayerIndex: 0 | 1;
  private network: NetworkClient;

  // Frame tracking
  private currentFrame = 0;
  private localInputs  = new Map<number, InputState>();
  private remoteInputs = new Map<number, InputState>();

  // Stall detection
  private stallStartTime: number | null = null;
  private stalled = false;
  private stallDisplayed = false; // true once overlay has been shown for this stall
  private disconnected = false;

  // Callback
  private onTick: TickCallback;
  private onStall: (stalled: boolean) => void;
  private onDisconnect: () => void;

  constructor(
    network: NetworkClient,
    localPlayerIndex: 0 | 1,
    onTick: TickCallback,
    onStall: (stalled: boolean) => void,
    onDisconnect: () => void,
  ) {
    this.network = network;
    this.localPlayerIndex = localPlayerIndex;
    this.onTick = onTick;
    this.onStall = onStall;
    this.onDisconnect = onDisconnect;

    // Listen for remote inputs and disconnect
    this.network.onMessage((msg: ServerMessage) => {
      this.handleMessage(msg);
    });

    // Pre-fill empty inputs for the initial delay frames
    for (let f = 0; f < INPUT_DELAY; f++) {
      this.localInputs.set(f, emptyInputState());
      this.remoteInputs.set(f, emptyInputState());
    }
  }

  /**
   * Called every render frame by GameScene.update().
   * Buffers local input, sends it, and advances simulation if both sides are ready.
   */
  update(localInput: InputState): void {
    if (this.disconnected) return;

    // Buffer local input for all frames that need it.
    // tryAdvance() may consume multiple frames per call, so we must ensure
    // every frame from currentFrame up to currentFrame + INPUT_DELAY has local input.
    for (let f = this.currentFrame; f <= this.currentFrame + INPUT_DELAY; f++) {
      if (!this.localInputs.has(f)) {
        this.localInputs.set(f, { ...localInput });
        this.network.sendInput(f, this.toNetInput(localInput));
      }
    }

    // Try to advance as many frames as possible
    this.tryAdvance();
  }

  private tryAdvance(): void {
    // Process up to a few frames per render tick to catch up
    let advanced = 0;
    const maxCatchUp = 4;

    while (advanced < maxCatchUp) {
      const frame = this.currentFrame;
      const local  = this.localInputs.get(frame);
      const remote = this.remoteInputs.get(frame);

      if (!local || !remote) {
        // Stall — waiting for input
        if (!this.stalled) {
          this.stalled = true;
          this.stallStartTime = performance.now();
          console.log('[lockstep] stall detected frame=', frame, 'hasLocal=', !!local, 'hasRemote=', !!remote);
        } else if (this.stallStartTime) {
          const elapsed = performance.now() - this.stallStartTime;
          if (!this.stallDisplayed && elapsed > STALL_DISPLAY_MS) {
            // Only show overlay after a real stall, not brief 1-2 frame gaps
            this.stallDisplayed = true;
            console.log('[lockstep] stall overlay shown at elapsed=', elapsed.toFixed(0), 'ms, frame=', frame);
            this.onStall(true);
          }
          if (elapsed > STALL_TIMEOUT_MS) {
            console.log('[lockstep] disconnect timeout fired at frame=', frame);
            this.disconnected = true;
            this.onDisconnect();
          }
        }
        return;
      }

      // Unstall
      if (this.stalled) {
        this.stalled = false;
        this.stallStartTime = null;
        if (this.stallDisplayed) {
          this.stallDisplayed = false;
          console.log('[lockstep] stall cleared, hiding overlay at frame=', frame);
          this.onStall(false);
        }
      }

      // Determine which input is P1 and which is P2
      const [input1, input2] = this.localPlayerIndex === 0
        ? [local, remote]
        : [remote, local];

      this.onTick(FIXED_DT, input1, input2);

      // Clean up old frames
      this.localInputs.delete(frame);
      this.remoteInputs.delete(frame);

      this.currentFrame++;
      advanced++;
    }
  }

  // ── Network message handling ──────────────────────────────────────────

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'remote_input':
        this.remoteInputs.set(msg.frame, this.fromNetInput(msg.input));
        break;

      case 'player_disconnected':
        this.disconnected = true;
        this.onDisconnect();
        break;
    }
  }

  // ── Input serialization ───────────────────────────────────────────────

  private toNetInput(input: InputState): NetInputState {
    return {
      left: input.left,
      right: input.right,
      up: input.up,
      down: input.down,
      jump: input.jump,
      fire: input.fire,
      change: input.change,
    };
  }

  private fromNetInput(net: NetInputState): InputState {
    return {
      left: net.left,
      right: net.right,
      up: net.up,
      down: net.down,
      jump: net.jump,
      fire: net.fire,
      change: net.change,
    };
  }

  /** Clean up. */
  destroy(): void {
    this.network.disconnect();
  }

  get isDisconnected(): boolean {
    return this.disconnected;
  }

  get isStalled(): boolean {
    return this.stalled;
  }

  get frame(): number {
    return this.currentFrame;
  }
}
