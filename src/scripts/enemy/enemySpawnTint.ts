import * as Phaser from 'phaser';
import type { EnemyType } from '../waves/WaveConfiguration';

function jitterChannel(value: number, spread: number): number {
  return Phaser.Math.Clamp(
    value + Phaser.Math.Between(-spread, spread),
    28,
    255,
  );
}

function jitterColor(baseHex: number, spread: number): number {
  const c = Phaser.Display.Color.IntegerToColor(baseHex);
  return Phaser.Display.Color.GetColor(
    jitterChannel(c.red, spread),
    jitterChannel(c.green, spread),
    jitterChannel(c.blue, spread),
  );
}

function strokeFromBody(body: number, lift: number): number {
  const c = Phaser.Display.Color.IntegerToColor(body);
  return Phaser.Display.Color.GetColor(
    Phaser.Math.Clamp(c.red + lift, 0, 255),
    Phaser.Math.Clamp(c.green + lift, 0, 255),
    Phaser.Math.Clamp(c.blue + lift, 0, 255),
  );
}

/** Strong hues so pooled re-tints stay readable (credits-style variety in gameplay). */
const BASIC_BASES = [
  0xd73a49, 0xf97316, 0xea580c, 0xdc2626, 0xbe123c, 0xc026d3, 0x7c3aed, 0x2563eb,
  0x0891b2, 0x0d9488, 0xca8a04, 0x65a30d, 0xdb2777, 0xe11d48,
] as const;

const BOMB_BASES = [
  0x6b21a8, 0x7e22ce, 0x9333ea, 0xa855f7, 0xc026d3, 0x86198f, 0x701a75, 0x581c87,
] as const;

const CHUNKY_BASES = [
  0x78350f, 0x92400e, 0xb45309, 0x713f12, 0x57534e, 0x854d0e, 0x3f6212, 0x7c2d12, 0x44403c,
] as const;

const LONG_RANGE_BASES = [
  0x38bdf8, 0x22d3ee, 0x67e8f9, 0x7dd3fc, 0x93c5fd, 0xa5b4fc, 0xc4b5fd, 0x94a3b8,
] as const;

/**
 * New body + stroke colors for each spawn / pool reuse so every appearance can differ.
 */
export function rollEnemySpawnColors(type: EnemyType): {
  body: number;
  stroke: number;
} {
  const spread =
    type === 'chunky' ? Phaser.Math.Between(22, 34) : Phaser.Math.Between(34, 48);
  let body: number;
  switch (type) {
    case 'basic':
      body = jitterColor(Phaser.Math.RND.pick([...BASIC_BASES]), spread);
      break;
    case 'bomb':
      body = jitterColor(Phaser.Math.RND.pick([...BOMB_BASES]), spread);
      break;
    case 'chunky':
      body = jitterColor(Phaser.Math.RND.pick([...CHUNKY_BASES]), spread);
      break;
    case 'long_range':
      body = jitterColor(Phaser.Math.RND.pick([...LONG_RANGE_BASES]), spread);
      break;
  }
  const stroke = strokeFromBody(body, Phaser.Math.Between(48, 92));
  return { body, stroke };
}
