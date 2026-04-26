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
    graphics.fillCircle(10, 10, 10);
    graphics.generateTexture('smoke_particle_white', 20, 20);
    graphics.destroy();
  }

  const emitter = scene.add.particles(config.x, config.y, 'smoke_particle_white', {
    color: [0xe8e6ee, 0xc8c4d0, 0x908c98, 0x45424a],
    colorEase: 'quart.out',
    lifespan: { min: 800, max: 1300 },
    angle: { min: -105, max: -75 },
    scale: { start: 1.85, end: 0.35, ease: 'sine.out' },
    speed: { min: 75, max: 160 },
    advance: 0,
    alpha: { start: Math.min(1, config.alpha ?? 1), end: 0 },
    quantity: 5,
    frequency: 5,
    blendMode: 'SCREEN',
  });

  if (typeof config.depth === 'number') {
    emitter.setDepth(config.depth);
  }
  emitter.setScrollFactor(1);

  if (config.follow) {
    emitter.startFollow(
      config.follow,
      config.followOffsetX ?? 0,
      config.followOffsetY ?? 0,
    );
  }

  return emitter;
}
