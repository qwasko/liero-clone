import Phaser from 'phaser';
import { InputState, emptyInputState } from './InputState';

/**
 * Reads keyboard state each frame and exposes two InputState objects,
 * one per player. Swap key bindings here without touching game logic.
 *
 * Player 1: Arrow keys + Right-Shift (jump) + Right-Ctrl (fire) + Period (CHANGE)
 * Player 2: WASD      + Space        (jump) + F           (fire) + E      (CHANGE)
 *
 * The CHANGE key is held to: cycle weapons (+ LEFT/RIGHT), fire rope (+ JUMP),
 * and adjust rope length (+ UP/DOWN). It disables movement and FIRE while held.
 */
export class InputManager {
  private keys1: {
    left:   Phaser.Input.Keyboard.Key;
    right:  Phaser.Input.Keyboard.Key;
    up:     Phaser.Input.Keyboard.Key;
    down:   Phaser.Input.Keyboard.Key;
    jump:   Phaser.Input.Keyboard.Key;
    fire:   Phaser.Input.Keyboard.Key;
    change: Phaser.Input.Keyboard.Key;
  };

  private keys2: {
    left:   Phaser.Input.Keyboard.Key;
    right:  Phaser.Input.Keyboard.Key;
    up:     Phaser.Input.Keyboard.Key;
    down:   Phaser.Input.Keyboard.Key;
    jump:   Phaser.Input.Keyboard.Key;
    fire:   Phaser.Input.Keyboard.Key;
    change: Phaser.Input.Keyboard.Key;
  };

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    const K = Phaser.Input.Keyboard.KeyCodes;

    this.keys1 = {
      left:   keyboard.addKey(K.LEFT),
      right:  keyboard.addKey(K.RIGHT),
      up:     keyboard.addKey(K.UP),
      down:   keyboard.addKey(K.DOWN),
      jump:   keyboard.addKey(K.SHIFT),
      fire:   keyboard.addKey(K.CTRL),
      change: keyboard.addKey(K.PERIOD),
    };

    this.keys2 = {
      left:   keyboard.addKey(K.A),
      right:  keyboard.addKey(K.D),
      up:     keyboard.addKey(K.W),
      down:   keyboard.addKey(K.S),
      jump:   keyboard.addKey(K.SPACE),
      fire:   keyboard.addKey(K.F),
      change: keyboard.addKey(K.E),
    };
  }

  getPlayer1(): InputState { return this.readKeys(this.keys1); }
  getPlayer2(): InputState { return this.readKeys(this.keys2); }

  private readKeys(keys: typeof this.keys1): InputState {
    const s = emptyInputState();
    s.left   = keys.left.isDown;
    s.right  = keys.right.isDown;
    s.up     = keys.up.isDown;
    s.down   = keys.down.isDown;
    s.jump   = keys.jump.isDown;
    s.fire   = keys.fire.isDown;
    s.change = keys.change.isDown;
    return s;
  }
}
