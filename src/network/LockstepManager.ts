/**
 * Lockstep synchronization manager.
 *
 * Both clients run the same simulation. Each frame:
 *   1. Capture local input and buffer it for frame N + INPUT_DELAY
 *   2. Send local input to remote via NetworkClient
 *   3. Wait until both inputs are available for the current frame
 *   4. Advance GameState with both inputs
 *
 * Tick rate is controlled by a real-time accumulator so the sim always
 * runs at ~60 ticks/s regardless of monitor refresh rate. A bounded
 * catch-up loop (max MAX_CATCH_UP ticks per render frame) lets the sim
 * recover after brief stalls without fast-forwarding.
 *
 * Input delay is adaptive: starts at INITIAL_DELAY and adjusts based
 * on stall frequency to find the sweet spot for current conditions.
 */
import { InputState, emptyInputState } from '../input/InputState';
import { NetworkClient } from './NetworkClient';
import type { NetInputState, ServerMessage } from './protocol';

const FIXED_DT = 1 / 60;          // 16.67ms per sim tick
const INITIAL_DELAY = 20;          // starting input delay (frames) — start high, decrease gradually
const MIN_DELAY     = 6;           // lowest adaptive delay
const MAX_DELAY     = 30;          // highest adaptive delay
const MAX_CATCH_UP  = 4;           // max sim ticks per render frame
const STALL_TIMEOUT_MS = 30000;    // disconnect after 30s without remote input
const STALL_DISPLAY_MS = 300;      // only show overlay after 300ms of real stalling
const GRACE_FRAMES  = 60;          // ignore stalls during initial network stabilization

// Adaptive delay tuning
const STALL_WINDOW_UP   = 60;     // look-back window for increase decision
const STALL_THRESHOLD   = 1;      // stalls in window → increase delay (1 = immediate)
const DELAY_INCREASE    = 2;      // frames to add per stall event
const CLEAN_WINDOW_DOWN = 300;    // consecutive clean frames (~5s) before decreasing

export type TickCallback = (dt: number, input1: InputState, input2: InputState) => void;

export class LockstepManager {
  private localPlayerIndex: 0 | 1;
  private network: NetworkClient;

  // Frame tracking
  private currentFrame = 0;
  private localInputs  = new Map<number, InputState>();
  private remoteInputs = new Map<number, InputState>();

  // Adaptive input delay
  private inputDelay = INITIAL_DELAY;
  private stallHistory: number[] = [];    // frame numbers where stalls occurred
  private framesSinceLastStall = 0;       // consecutive clean frames
  private diagLogTime = performance.now();

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
    for (let f = 0; f < this.inputDelay; f++) {
      this.localInputs.set(f, emptyInputState());
      this.remoteInputs.set(f, emptyInputState());
    }
  }

  /**
   * Called every render frame by GameScene.update().
   * Measures real elapsed time, buffers local input, then advances the
   * simulation by up to MAX_CATCH_UP ticks if enough time has accumulated.
   */
  update(localInput: InputState): void {
    if (this.disconnected) return;

    // Accumulate real elapsed time; clamp to avoid spiral-of-death after
    // tab focus loss or debugger pause.
    const now = performance.now();
    const elapsed = now - this.lastRenderTime;
    this.lastRenderTime = now;
    this.accumulatedTime += Math.min(elapsed / 1000, FIXED_DT * MAX_CATCH_UP);

    // Buffer local input for all frames that need it.
    for (let f = this.currentFrame; f <= this.currentFrame + this.inputDelay; f++) {
      if (!this.localInputs.has(f)) {
        this.localInputs.set(f, { ...localInput });
        this.network.sendInput(f, this.toNetInput(localInput));
      }
    }

    this.tryAdvance();
  }

  private tryAdvance(): void {
    let advanced = 0;

    // Advance up to MAX_CATCH_UP ticks per render frame, gated by both
    // the real-time accumulator AND input availability.
    while (advanced < MAX_CATCH_UP && this.accumulatedTime >= FIXED_DT) {
      const frame  = this.currentFrame;
      const local  = this.localInputs.get(frame);
      const remote = this.remoteInputs.get(frame);

      if (!local || !remote) {
        // Stall — waiting for remote input
        if (!this.stalled) {
          this.stalled = true;
          this.stallStartTime = performance.now();
          console.log('[lockstep] STALL frame=', frame, 'delay=', this.inputDelay);
          this.recordStall();
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
        // Don't consume accumulatedTime while stalled — we'll catch up
        // on the next call once remote input arrives.
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
        // Cap accumulated time so catch-up is bounded, but don't zero it —
        // zeroing throws away real elapsed time causing permanent slowdown.
        this.accumulatedTime = Math.min(this.accumulatedTime, FIXED_DT * MAX_CATCH_UP);
      }

      // Determine which input is P1 and which is P2
      const [input1, input2] = this.localPlayerIndex === 0
        ? [local, remote]
        : [remote, local];

      try {
        this.onTick(FIXED_DT, input1, input2);
      } catch (err) {
        console.error('[lockstep] tick error at frame=', this.currentFrame, err);
      }
      this.accumulatedTime -= FIXED_DT;

      // Clean up consumed frames
      this.localInputs.delete(frame);
      this.remoteInputs.delete(frame);

      this.currentFrame++;
      this.framesSinceLastStall++;
      advanced++;

      // Adaptive delay: try decreasing after sustained clean run
      this.maybeDecreaseDelay();

      // Status log once per second
      const logNow = performance.now();
      if (logNow - this.diagLogTime >= 1000) {
        const cutoff = this.currentFrame - STALL_WINDOW_UP;
        const recentStalls = this.stallHistory.filter(f => f >= cutoff).length;
        console.log('[lockstep] delay=', this.inputDelay, 'stalls_last60=', recentStalls, 'frame=', this.currentFrame);
        this.diagLogTime = logNow;
      }
    }
  }

  // ── Adaptive delay ────────────────────────────────────────────────────

  private recordStall(): void {
    this.stallHistory.push(this.currentFrame);
    this.framesSinceLastStall = 0;

    // Don't adjust delay during initial grace period
    if (this.currentFrame < GRACE_FRAMES) return;

    // Prune old entries outside the look-back window
    const cutoff = this.currentFrame - STALL_WINDOW_UP;
    while (this.stallHistory.length > 0 && this.stallHistory[0] < cutoff) {
      this.stallHistory.shift();
    }

    // Stall detected → increase delay immediately by DELAY_INCREASE
    if (this.stallHistory.length >= STALL_THRESHOLD && this.inputDelay < MAX_DELAY) {
      this.inputDelay = Math.min(this.inputDelay + DELAY_INCREASE, MAX_DELAY);
      this.stallHistory.length = 0; // reset after adjustment
      console.log('[lockstep] delay adjusted to', this.inputDelay, '(increased — stall detected)');
    }
  }

  private maybeDecreaseDelay(): void {
    if (this.framesSinceLastStall >= CLEAN_WINDOW_DOWN && this.inputDelay > MIN_DELAY) {
      this.inputDelay--;
      this.framesSinceLastStall = 0;
      console.log('[lockstep] delay adjusted to', this.inputDelay, '(decreased — stable)');
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
