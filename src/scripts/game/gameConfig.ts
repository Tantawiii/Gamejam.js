import type { ParallaxLayerConfig } from '../parallax/DownwardParallaxBackground';

export const MAIN_WORLD = {
  width: 6000,
  height: 6000,
} as const;

export const MAIN_PARALLAX_LAYERS: ParallaxLayerConfig[] = [
  { speed: 28, textureKey: 'bg_tile_base', alpha: 1 },
];

/** Smaller scale so multiple carriages fit on screen. */
export const MAIN_TRAIN_SPAWN = {
  xFrac: 0.5,
  yFrac: 0.72,
  engineWidth: 78,
  engineHeight: 118,
  baseAcceleration: 110,
  baseBrakeDeceleration: 210,
  baseDragDeceleration: 46,
  maxSpeed: 58,
  maxHealth: 800,
  coalMax: 120,
  startingCoal: 120,
  fillColor: 0x7a5c36,
  depth: 5,
  boardingRadius: 108,
} as const;

export type MainTrainFleetConfig = {
  carriageGap: number;
  carriageWidth: number;
  carriageHeight: number;
  carriageFillColor: number;
  carriageStrokeColor: number;
  engineWeaponSlots: number;
  carriageWeaponSlots: number;
  /** Small Y offset from car top toward screen top (roof line). */
  turretRoofInsetY: number;
  maxCarriages: number;
};

export const MAIN_TRAIN_FLEET: MainTrainFleetConfig = {
  carriageGap: -4,
  carriageWidth: 72,
  carriageHeight: 96,
  carriageFillColor: 0x654832,
  carriageStrokeColor: 0x3d2817,
  engineWeaponSlots: 2,
  carriageWeaponSlots: 4,
  turretRoofInsetY: 3,
  maxCarriages: 3,
};

export type MainTrainCoalConfig = {
  movementDrainPerSpeedPerSec: number;
  accelerationDrainPerSec: number;
  drainPerWeaponPerSec: number;
  drainPerCarriagePerSec: number;
};

export const MAIN_TRAIN_COAL: MainTrainCoalConfig = {
  movementDrainPerSpeedPerSec: 0.01,
  accelerationDrainPerSec: 1.8,
  drainPerWeaponPerSec: 0.45,
  drainPerCarriagePerSec: 0.35,
};

/** Player spawn: starboard of engine. */
export const MAIN_PLAYER_SPAWN_OFFSET = { x: 62, y: 52 } as const;

export const MAIN_PLAYER_VIEW_PAD = 10;
export const MAIN_PLAYER_OUTSIDE_TRAIN_GAP = 8;

export const MAIN_PLAYER_VISUAL = {
  radius: 8,
  fillColor: 0x58a6ff,
  strokeColor: 0xffffff,
  strokeWidth: 2,
  depth: 20,
  walkSpeed: 200,
} as const;

export const MAIN_ENEMY_SWARM = {
  spawnIntervalMs: 1200, // Every 1.2 seconds
  speed: 62,
  radius: 9,
  maxEnemies: 28,
  spawnRadiusMin: 320,
  spawnRadiusMax: 620,
  fillColor: 0xd73a49,
  strokeColor: 0xffb1ba,
  depth: 8,
  maxHealth: 1,
  trainContactDamage: 10,
  trainContactCooldownMs: 500,
  coalDropOnKill: 6,
} as const;

export const MAIN_COAL_PICKUP = {
  radius: 7,
  depth: 9,
  fillColor: 0x2d2a28,
  strokeColor: 0x8b7355,
  magnetRange: 78,
  magnetSpeed: 240,
} as const;

/** Rare parallax-scrolling hatch: 35% roll each scroll chunk; on-foot player steps on it to refill coal. */
export const MAIN_COAL_RECHARGE_STATION = {
  textureKey: 'coal_recharge_station',
  depth: 7,
  displayMaxPx: 88,
  hitRadius: 36,
  scrollPxPerRoll: 1150,
  spawnChance: 0.35,
  coalMin: 85,
  coalMax: 125,
} as const;

/** Rare golden goose: 10% roll per scroll chunk; catch on foot for bonus score (192×256 sheet → 32×32 frames). */
export const MAIN_GOLDEN_GOOSE = {
  sheetKey: 'gosling_sheet',
  depth: 13,
  displayScale: 1.65,
  hitRadius: 22,
  scrollPxPerRoll: 1150,
  spawnChance: 0.1,
  scoreValue: 100,
  wanderSpeed: 52,
} as const;

export const MAIN_WEAPON_VISUAL_DEPTH = 18;

/** Chimney smoke above all train / weapon world sprites (still below fixed HUD). */
export const MAIN_ENGINE_SMOKE_DEPTH = 400;

export const MAIN_CAMERA_SHAKE_ON_TRAIN_HIT = {
  durationMs: 85,
  /** Subtle feedback on train hits (was easy to overdo at ~0.05+). */
  intensity: 0.028,
} as const;

export const MAIN_TURRET_SYSTEM = {
  fireIntervalMs: 420,
  bulletSpeed: 440,
  bulletRadius: 4,
  bulletLifeMs: 2000,
  bulletColor: 0xffe066,
  gunLength: 22,
  gunThickness: 7,
  firingRange: 500, // Only fire at enemies within 500 pixels
} as const;

/** HUD bars (screen space). */
export const MAIN_HUD_BARS = {
  x: 14,
  y: 12,
  width: 208,
  height: 11,
  gap: 5,
  hpBg: 0x3d3d42,
  hpFg: 0x8b6914,
  coalBg: 0x2f2f34,
  coalFg: 0x4a4a4e,
} as const;
