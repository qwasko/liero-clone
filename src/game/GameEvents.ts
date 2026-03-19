import { CrateData, CrateKind } from './CrateSystem';

export type GameEvent =
  | { type: 'sound_fire'; weaponId: string }
  | { type: 'sound_explosion'; big: boolean }
  | { type: 'sound_jump' }
  | { type: 'sound_rope' }
  | { type: 'sound_pickup' }
  | { type: 'muzzle_flash'; x: number; y: number }
  | { type: 'screen_flash'; alpha: number }
  | { type: 'camera_shake'; duration: number; intensity: number }
  | { type: 'crate_spawn'; crate: CrateData }
  | { type: 'crate_collect'; crateId: number; kind: CrateKind }
  | { type: 'match_over'; winner: number; mode: 'normal' | 'tag'; tagTimes?: [number, number] };
