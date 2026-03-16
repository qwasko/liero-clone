import Phaser from 'phaser';
import { InputState, emptyInputState } from './InputState';

/**
 * Reads keyboard state each frame and exposes two InputState objects,
 * one per player. Swap key bindings here without touching game logic.
 *
 * Player 1: Arrow keys + Right-Ctrl (fire) + Right-Shift (jump) + , / . (weapons)
 * Player 2: WASD      + Left-Ctrl  (fire) + Left-Shift  (jump) + Q / E (weapons)
 */
export class InputManager {
  private keys1: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    fire: Phaser.Input.Keyboard.Key;
    nextWeapon: Phaser.Input.Keyboard.Key;
    prevWeapon: Phaser.Input.Keyboard.Key;
  };

  private keys2: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    fire: Phaser.Input.Keyboard.Key;
    nextWeapon: Phaser.Input.Keyboard.Key;
    prevWeapon: Phaser.Input.Keyboard.Key;
  };

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    const K = Phaser.Input.Keyboard.KeyCodes;

    this.keys1 = {
      left:       keyboard.addKey(K.LEFT),
      right:      keyboard.addKey(K.RIGHT),
      up:         keyboard.addKey(K.UP),
      down:       keyboard.addKey(K.DOWN),
      jump:       keyboard.addKey(K.SHIFT),
      fire:       keyboard.addKey(K.CTRL),
      nextWeapon: keyboard.addKey(K.PERIOD),
      prevWeapon: keyboard.addKey(K.COMMA),
    };

    this.keys2 = {
      left:       keyboard.addKey(K.A),
      right:      keyboard.addKey(K.D),
      up:         keyboard.addKey(K.W),
      down:       keyboard.addKey(K.S),
      jump:       keyboard.addKey(K.SPACE),
      fire:       keyboard.addKey(K.F),
      nextWeapon: keyboard.addKey(K.E),
      prevWeapon: keyboard.addKey(K.Q),
    };
  }

  getPlayer1(): InputState {
    return this.readKeys(this.keys1);
  }

  getPlayer2(): InputState {
    return this.readKeys(this.keys2);
  }

  private readKeys(keys: typeof this.keys1): InputState {
    const s = emptyInputState();
    s.left           = keys.left.isDown;
    s.right          = keys.right.isDown;
    s.up             = keys.up.isDown;
    s.down           = keys.down.isDown;
    s.jump           = keys.jump.isDown;
    s.fire           = keys.fire.isDown;
    s.weaponModifier = keys.nextWeapon.isDown; // held = rope mode active
    s.nextWeapon     = Phaser.Input.Keyboard.JustDown(keys.nextWeapon);
    s.prevWeapon     = Phaser.Input.Keyboard.JustDown(keys.prevWeapon);
    return s;
  }
}
