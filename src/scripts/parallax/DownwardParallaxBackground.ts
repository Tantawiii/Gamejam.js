import * as Phaser from 'phaser';

export type ParallaxLayerConfig = {
  /** Pixels per second. Positive = layers scroll downward on screen. */
  speed: number;
  /** Optional texture key; if provided, this image tiles instead of generated stripes. */
  textureKey?: string;
  colorA?: number;
  colorB?: number;
  /** Vertical size of one full A→B cycle in the generated texture. */
  bandHeight?: number;
  /** 0–1; defaults to 1. */
  alpha?: number;
};

export type DownwardParallaxOptions = {
  layers: ParallaxLayerConfig[];
  /** Display depth for the stack; back layer uses this, each next layer +1. */
  depth?: number;
};

let textureKeySeq = 0;

function makeStripeTextureKey(): string {
  return `parallax_stripe_${textureKeySeq++}`;
}

function registerStripeTexture(
  scene: Phaser.Scene,
  key: string,
  colorA: number,
  colorB: number,
  bandHeight: number,
): void {
  const h = Math.max(2, Math.floor(bandHeight)) * 2;
  const w = 4;
  const g = new Phaser.GameObjects.Graphics(scene, { x: 0, y: 0 });
  g.fillStyle(colorA, 1);
  g.fillRect(0, 0, w, h / 2);
  g.fillStyle(colorB, 1);
  g.fillRect(0, h / 2, w, h / 2);
  g.generateTexture(key, w, h);
  g.destroy();
}

/**
 * Full-screen layered tile sprites. Positive layer speeds move stripes downward on screen
 * (typical sense of forward / upward travel). Owns its TileSprites; call {@link update} when active.
 */
export class DownwardParallaxBackground {
  private readonly layers: { tile: Phaser.GameObjects.TileSprite; speed: number }[] =
    [];

  constructor(scene: Phaser.Scene, options: DownwardParallaxOptions) {
    const { width, height } = scene.scale;
    const baseDepth = options.depth ?? -1000;

    options.layers.forEach((layer, layerIndex) => {
      const key = layer.textureKey ?? makeStripeTextureKey();
      if (!layer.textureKey) {
        registerStripeTexture(
          scene,
          key,
          layer.colorA ?? 0x12151c,
          layer.colorB ?? 0x1a1f28,
          layer.bandHeight ?? 56,
        );
      }

      const tile = scene.add.tileSprite(0, 0, width, height, key);
      tile.setOrigin(0, 0);
      tile.setScrollFactor(0);
      tile.setDepth(baseDepth + layerIndex);
      if (layer.alpha !== undefined) {
        tile.setAlpha(layer.alpha);
      }

      this.layers.push({ tile, speed: layer.speed });
    });
  }

  update(deltaMs: number, speedScale = 1): number {
    const dt = deltaMs / 1000;
    let primaryDy = 0;
    for (const { tile, speed } of this.layers) {
      const dy = speed * Math.max(0, speedScale) * dt;
      tile.tilePositionY -= dy;
      if (primaryDy === 0) {
        primaryDy = dy;
      }
    }
    return primaryDy;
  }

  destroy(): void {
    for (const { tile } of this.layers) {
      tile.destroy();
    }
    this.layers.length = 0;
  }
}
