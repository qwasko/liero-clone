import Phaser from 'phaser';
import { InputState, emptyInputState } from './InputState';
import { KeyBindings } from '../game/GameSettings';

/**
 * Reads keyboard state each frame and exposes two InputState objects,
 * one per player. Key bindings are configurable via GameSettings.
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

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin, p1: KeyBindings, p2: KeyBindings) {
    this.keys1 = {
      left:   keyboard.addKey(p1.left),
      right:  keyboard.addKey(p1.right),
      up:     keyboard.addKey(p1.up),
      down:   keyboard.addKey(p1.down),
      jump:   keyboard.addKey(p1.jump),
      fire:   keyboard.addKey(p1.fire),
      change: keyboard.addKey(p1.change),
    };

    this.keys2 = {
      left:   keyboard.addKey(p2.left),
      right:  keyboard.addKey(p2.right),
      up:     keyboard.addKey(p2.up),
      down:   keyboard.addKey(p2.down),
      jump:   keyboard.addKey(p2.jump),
      fire:   keyboard.addKey(p2.fire),
      change: keyboard.addKey(p2.change),
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
