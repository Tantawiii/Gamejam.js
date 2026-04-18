import * as Phaser from 'phaser';
import { pushCircleOutOfCenteredRect } from '../player/circleRectPushOut';
import type { TrainController } from '../train/TrainController';
import { circleIntersectsCenteredRect } from './circleRectIntersect';

export type EnemySwarmOptions = {
  spawnIntervalMs: number;
  speed: number;
  radius: number;
  maxEnemies: number;
  spawnRadiusMin: number;
  spawnRadiusMax: number;
  fillColor: number;
  strokeColor: number;
  depth: number;
  trainContactDamage: number;
  trainContactCooldownMs: number;
  playerRadius: number;
  onPlayerCollide?: () => void;
  onTrainDamagedByEnemy?: () => void;
  onEnemyDestroyed?: (x: number, y: number) => void;
};

export type EnemyEntry = {
  sprite: Phaser.GameObjects.Arc;
  speed: number;
  trainHitCooldownMs: number;
};

/**
 * Chases train or player (whichever is closer). Damages the train on hull overlap with cooldown.
 */
export class EnemySwarm {
  private readonly scene: Phaser.Scene;
  private readonly train: TrainController;
  private readonly getPlayerWorld: () => { x: number; y: number };
  private readonly opts: EnemySwarmOptions;
  readonly enemies: EnemyEntry[] = [];
  private spawnAcc = 0;

  constructor(
    scene: Phaser.Scene,
    train: TrainController,
    getPlayerWorld: () => { x: number; y: number },
    opts: EnemySwarmOptions,
  ) {
    this.scene = scene;
    this.train = train;
    this.getPlayerWorld = getPlayerWorld;
    this.opts = opts;
  }

  findClosestLivingEnemyTo(
    wx: number,
    wy: number,
  ): { x: number; y: number } | null {
    let best: { x: number; y: number; d: number } | null = null;
    for (const e of this.enemies) {
      const dx = e.sprite.x - wx;
      const dy = e.sprite.y - wy;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) {
        best = { x: e.sprite.x, y: e.sprite.y, d };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  tryHitEnemyWithBullet(
    bx: number,
    by: number,
    bulletRadius: number,
  ): boolean {
    const o = this.opts;
    const hitR = bulletRadius + o.radius;
    const hitRSq = hitR * hitR;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e) continue;
      const dx = e.sprite.x - bx;
      const dy = e.sprite.y - by;
      if (dx * dx + dy * dy <= hitRSq) {
        const sx = e.sprite.x;
        const sy = e.sprite.y;
        e.sprite.destroy();
        this.enemies.splice(i, 1);
        o.onEnemyDestroyed?.(sx, sy);
        return true;
      }
    }
    return false;
  }

  update(deltaMs: number): void {
    const o = this.opts;
    this.spawnAcc += deltaMs;
    if (
      this.enemies.length < o.maxEnemies &&
      this.spawnAcc >= o.spawnIntervalMs
    ) {
      this.spawnAcc = 0;
      this.spawnOne();
    }

    const dt = deltaMs / 1000;
    const tx = this.train.body.x;
    const ty = this.train.body.y;
    const { x: px, y: py } = this.getPlayerWorld();
    const hulls = this.train.getHullRects();

    for (const e of this.enemies) {
      const s = e.sprite;
      const dTx = tx - s.x;
      const dTy = ty - s.y;
      const dPx = px - s.x;
      const dPy = py - s.y;
      const dT = dTx * dTx + dTy * dTy;
      const dP = dPx * dPx + dPy * dPy;
      const useTrain = dT <= dP;
      const gx = useTrain ? dTx : dPx;
      const gy = useTrain ? dTy : dPy;
      const len = Math.hypot(gx, gy);
      if (len > 1e-6) {
        s.setPosition(
          s.x + (gx / len) * e.speed * dt,
          s.y + (gy / len) * e.speed * dt,
        );
      }

      e.trainHitCooldownMs = Math.max(0, e.trainHitCooldownMs - deltaMs);

      let dealtTrainDamage = false;
      for (const tb of hulls) {
        if (
          !circleIntersectsCenteredRect(
            s.x,
            s.y,
            o.radius,
            tb.x,
            tb.y,
            tb.width,
            tb.height,
          )
        ) {
          continue;
        }

        if (!dealtTrainDamage && e.trainHitCooldownMs <= 0) {
          dealtTrainDamage = true;
          this.train.takeDamage(o.trainContactDamage);
          e.trainHitCooldownMs = o.trainContactCooldownMs;
          o.onTrainDamagedByEnemy?.();
        }
        const out = pushCircleOutOfCenteredRect(
          s.x,
          s.y,
          o.radius,
          tb.x,
          tb.y,
          tb.width,
          tb.height,
        );
        s.setPosition(out.x, out.y);
      }
    }

    this.checkPlayerCollision();
  }

  private checkPlayerCollision(): void {
    const cb = this.opts.onPlayerCollide;
    if (!cb) return;

    const { x: px, y: py } = this.getPlayerWorld();
    const pr = this.opts.playerRadius;
    const hitR = this.opts.radius + pr;
    const hitRSq = hitR * hitR;

    for (const e of this.enemies) {
      const dx = e.sprite.x - px;
      const dy = e.sprite.y - py;
      if (dx * dx + dy * dy <= hitRSq) {
        cb();
        return;
      }
    }
  }

  private spawnOne(): void {
    const o = this.opts;
    const cx = this.train.body.x;
    const cy = this.train.body.y;
    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist = Phaser.Math.FloatBetween(o.spawnRadiusMin, o.spawnRadiusMax);
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist;
    const sprite = this.scene.add.circle(x, y, o.radius, o.fillColor, 1);
    sprite.setStrokeStyle(2, o.strokeColor);
    sprite.setDepth(o.depth);
    this.enemies.push({ sprite, speed: o.speed, trainHitCooldownMs: 0 });
  }

  destroy(): void {
    for (const e of this.enemies) {
      e.sprite.destroy();
    }
    this.enemies.length = 0;
  }
}
