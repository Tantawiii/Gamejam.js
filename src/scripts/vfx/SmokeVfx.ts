import * as Phaser from 'phaser';

export interface GreySmokeVfxConfig {
  x: number;
  y: number;
  alpha?: number;
  depth?: number;
  follow?: Phaser.Types.Math.Vector2Like;
  followOffsetX?: number;
  followOffsetY?: number;
}

/**
 * Creates a reusable grey smoke particle effect.
 * Uses a generated circle texture named 'smoke_particle'.
 */
export function createGreySmokeVfx(
  scene: Phaser.Scene,
  config: GreySmokeVfxConfig,
): Phaser.GameObjects.Particles.ParticleEmitter {
  if (!scene.textures.exists('smoke_particle')) {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('smoke_particle', 16, 16);
    graphics.destroy();
  }

  const emitter = scene.add.particles(config.x, config.y, 'smoke_particle', {
    color: [0xf1f1f1, 0xd7d7d7, 0xb8b8b8, 0x8f8f8f, 0x666666, 0x3f3f3f],
    colorEase: 'quad.out',
    lifespan: { min: 1800, max: 2500 },
    angle: { min: -102, max: -78 },
    scale: { start: 1.15, end: 0.08, ease: 'sine.out' },
    speed: { min: 95, max: 165 },
    alpha: { start: config.alpha ?? 0.9, end: 0 },
    quantity: 3,
    frequency: 32,
    blendMode: 'NORMAL',
  });

  if (typeof config.depth === 'number') {
    emitter.setDepth(config.depth);
  }

  if (config.follow) {
    emitter.startFollow(
      config.follow,
      config.followOffsetX ?? 0,
      config.followOffsetY ?? 0,
    );
  }

  return emitter;
}
