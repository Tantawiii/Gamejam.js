import * as Phaser from 'phaser';

const FRAME_KEYS = ['train_smoke_frame_0', 'train_smoke_frame_1'] as const;

/** Puffs per second (both furnaces combined ≈ 2 / interval). */
const EMIT_INTERVAL_MS = 145;
const POOL_SIZE = 56;
const PUFF_LIFE_MS = { min: 1000, max: 1550 };
/** Drift +Y = downward on screen (trail behind nose-up locomotive). */
const PUFF_DRIFT_Y = { min: 32, max: 58 };
const PUFF_DRIFT_X = { min: -7, max: 7 };

type SmokePuff = {
  sprite: Phaser.GameObjects.Sprite;
  inUse: boolean;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  baseScale: number;
};

/**
 * Pooled smoke puffs from `public/assets/Smoke/`: spawned at both boiler furnaces,
 * stacked over time, move downward, fade out, then returned to the pool.
 */
export class TrainFurnaceSmoke {
  private readonly pool: SmokePuff[];
  private emitAcc = 0;

  constructor(scene: Phaser.Scene, depth: number) {
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const sprite = scene.add.sprite(0, 0, FRAME_KEYS[0]);
      sprite.setDepth(depth);
      sprite.setScrollFactor(1);
      sprite.setOrigin(0.5, 0.32);
      sprite.setVisible(false);
      sprite.setActive(false);
      this.pool.push({
        sprite,
        inUse: false,
        vx: 0,
        vy: 0,
        lifeMs: 0,
        maxLifeMs: 0,
        baseScale: 1,
      });
    }
  }

  private acquire(): SmokePuff | null {
    for (const p of this.pool) {
      if (!p.inUse) return p;
    }
    return null;
  }

  private release(p: SmokePuff): void {
    p.inUse = false;
    p.sprite.setVisible(false);
    p.sprite.setActive(false);
    p.sprite.setAlpha(1);
  }

  private spawn(worldX: number, worldY: number, scaleMul: number): void {
    const p = this.acquire();
    if (!p) return;

    const tex = Phaser.Math.RND.pick([...FRAME_KEYS]);
    p.sprite.setTexture(tex);
    p.sprite.setPosition(worldX, worldY);
    p.baseScale = scaleMul * Phaser.Math.FloatBetween(0.82, 1.12);
    p.sprite.setScale(p.baseScale);
    p.sprite.setAlpha(1);
    p.sprite.setVisible(true);
    p.sprite.setActive(true);
    p.inUse = true;
    p.vx = Phaser.Math.FloatBetween(PUFF_DRIFT_X.min, PUFF_DRIFT_X.max);
    p.vy = Phaser.Math.FloatBetween(PUFF_DRIFT_Y.min, PUFF_DRIFT_Y.max);
    p.maxLifeMs = Phaser.Math.Between(PUFF_LIFE_MS.min, PUFF_LIFE_MS.max);
    p.lifeMs = p.maxLifeMs;
  }

  update(deltaMs: number, engine: Phaser.GameObjects.Image): void {
    const ew = engine.displayWidth;
    const eh = engine.displayHeight;
    const fw = engine.scene.textures.getFrame(FRAME_KEYS[0])?.width ?? 48;
    const scaleMul = Phaser.Math.Clamp((ew * 0.36) / fw, 0.14, 0.92);

    /* Both stacks on the boiler centerline (nose is −Y). Front hole above midline, rear hole nearer the tender. */
    const cx = engine.x;
    const yFrontStack = engine.y - eh * 0.228;
    const yRearStack = engine.y + eh * 0.004;

    this.emitAcc += deltaMs;
    while (this.emitAcc >= EMIT_INTERVAL_MS) {
      this.emitAcc -= EMIT_INTERVAL_MS;
      this.spawn(cx + Phaser.Math.FloatBetween(-1.5, 1.5), yFrontStack + Phaser.Math.FloatBetween(-2, 2), scaleMul);
      this.spawn(cx + Phaser.Math.FloatBetween(-1.5, 1.5), yRearStack + Phaser.Math.FloatBetween(-2, 2), scaleMul);
    }

    const dt = deltaMs / 1000;
    for (const p of this.pool) {
      if (!p.inUse) continue;

      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.lifeMs -= deltaMs;

      const u = Phaser.Math.Clamp(p.lifeMs / p.maxLifeMs, 0, 1);
      p.sprite.setAlpha(u * u * (3 - 2 * u));
      const grow = Phaser.Math.Linear(1, 1.45, 1 - u);
      p.sprite.setScale(p.baseScale * grow);

      if (p.lifeMs <= 0) {
        this.release(p);
      }
    }
  }

  destroy(): void {
    for (const p of this.pool) {
      p.sprite.destroy();
    }
    this.pool.length = 0;
  }
}
