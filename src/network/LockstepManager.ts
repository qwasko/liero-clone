/**
 * Lockstep synchronization manager.
 *
 * Both clients run the same simulation. Each frame:
 *   1. Capture local input and buffer it for frame N + INPUT_DELAY
 *   2. Send local input to remote via NetworkClient
 *   3. Wait until both inputs are available for the current frame
 *   4. Advance GameState with both inputs
 *
 * Tick rate is controlled by a real-time accumulator: one sim tick fires
 * per FIXED_DT of elapsed wall-clock time, regardless of monitor refresh
 * rate. This prevents the double-speed bug on >60 Hz displays.
 */
import { InputState, emptyInputState } from '../input/InputState';
import { NetworkClient } from './NetworkClient';
import type { NetInputState, ServerMessage } from './protocol';

const FIXED_DT = 1 / 60; // 16.67ms per tick
const INPUT_DELAY = 3;    // frames of input delay
const STALL_TIMEOUT_MS = 5000;  // disconnect after 5s without remote input
const STALL_DISPLAY_MS  = 300;  // only show overlay after 300ms of real stalling

export type TickCallback = (dt: number, input1: InputState, input2: InputState) => void;

export class LockstepManager {
  private localPlayerIndex: 0 | 1;
  private network: NetworkClient;

  // Frame tracking
  private currentFrame = 0;
  private localInputs  = new Map<number, InputState>();
  private remoteInputs = new Map<number, InputState>();

  // Accumulator: real elapsed time waiting to be consumed as sim ticks
  private accumulatedTime = 0;
  private lastRenderTime  = performance.now();

  // Stall detection
  private stallStartTime: number | null = null;
  private stalled       = false;
  private stallDisplayed = false;
  private disconnected  = false;

  // Callbacks
  private onTick:       TickCallback;
  private onStall:      (stalled: boolean) => void;
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
   * Measures real elapsed time, buffers local input, then advances the
   * simulation by exactly one tick if enough time has accumulated.
   */
  update(localInput: InputState): void {
    if (this.disconnected) return;

    // Accumulate real elapsed time; clamp to avoid spiral-of-death after
    // tab focus loss or debugger pause.
    const now = performance.now();
    const elapsed = now - this.lastRenderTime;
    this.lastRenderTime = now;
    this.accumulatedTime += Math.min(elapsed / 1000, FIXED_DT * 4);

    // Buffer local input for all frames that need it.
    for (let f = this.currentFrame; f <= this.currentFrame + INPUT_DELAY; f++) {
      if (!this.localInputs.has(f)) {
        this.localInputs.set(f, { ...localInput });
        this.network.sendInput(f, this.toNetInput(localInput));
      }
    }

    this.tryAdvance();
  }

  private tryAdvance(): void {
    // Only tick when enough real time has elapsed for one sim frame.
    // Advance exactly one frame per call — no catch-up loop — so sim
    // speed is always 1:1 with wall-clock time regardless of refresh rate.
    if (this.accumulatedTime < FIXED_DT) return;

    const frame  = this.currentFrame;
    const local  = this.localInputs.get(frame);
    const remote = this.remoteInputs.get(frame);

    if (!local || !remote) {
      // Stall — waiting for remote input
      if (!this.stalled) {
        this.stalled = true;
        this.stallStartTime = performance.now();
      } else if (this.stallStartTime) {
        const stallElapsed = performance.now() - this.stallStartTime;
        if (!this.stallDisplayed && stallElapsed > STALL_DISPLAY_MS) {
          this.stallDisplayed = true;
          this.onStall(true);
        }
        if (stallElapsed > STALL_TIMEOUT_MS) {
          this.disconnected = true;
          this.onDisconnect();
        }
      }
      // Do NOT consume accumulatedTime while stalled — resume from here
      // once remote input arrives rather than trying to catch up.
      return;
    }

    // Unstall
    if (this.stalled) {
      this.stalled = false;
      this.stallStartTime = null;
      if (this.stallDisplayed) {
        this.stallDisplayed = false;
        this.onStall(false);
      }
      // Drop accumulated time built up during the stall to avoid a burst
      // of catch-up ticks that would fast-forward the simulation.
      this.accumulatedTime = 0;
    }

    // Determine which input is P1 and which is P2
    const [input1, input2] = this.localPlayerIndex === 0
      ? [local, remote]
      : [remote, local];

    this.onTick(FIXED_DT, input1, input2);
    this.accumulatedTime -= FIXED_DT;

    // Clean up consumed frames
    this.localInputs.delete(frame);
    this.remoteInputs.delete(frame);

    this.currentFrame++;
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
      left:   input.left,
      right:  input.right,
      up:     input.up,
      down:   input.down,
      jump:   input.jump,
      fire:   input.fire,
      change: input.change,
    };
  }

  private fromNetInput(net: NetInputState): InputState {
    return {
      left:   net.left,
      right:  net.right,
      up:     net.up,
      down:   net.down,
      jump:   net.jump,
      fire:   net.fire,
      change: net.change,
    };
  }

  /** Clean up. */
  destroy(): void {
    this.network.disconnect();
  }

  get isDisconnected(): boolean { return this.disconnected; }
  get isStalled():      boolean { return this.stalled; }
  get frame():          number  { return this.currentFrame; }
}
