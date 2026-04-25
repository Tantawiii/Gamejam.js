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
 * Uses a generated white texture and "smokey" color ramp.
 */
export function createGreySmokeVfx(
  scene: Phaser.Scene,
  config: GreySmokeVfxConfig,
): Phaser.GameObjects.Particles.ParticleEmitter {
  if (!scene.textures.exists('smoke_particle_white')) {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(6, 6, 6);
    graphics.generateTexture('smoke_particle_white', 12, 12);
    graphics.destroy();
  }

  const emitter = scene.add.particles(config.x, config.y, 'smoke_particle_white', {
    color: [0x4b4a4f, 0x353438, 0x1f1f22, 0x040404],
    colorEase: 'quart.out',
    lifespan: { min: 1400, max: 1900 },
    angle: { min: -102, max: -78 },
    scale: { start: 0.75, end: 0, ease: 'sine.out' },
    speed: { min: 180, max: 280 },
    advance: 1400,
    alpha: { start: config.alpha ?? 0.9, end: 0 },
    quantity: 2,
    frequency: 24,
    blendMode: 'ADD',
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
