import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';
import { Enemy } from './Enemy';

export type EnemyProjectileSpawn = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
};

/**
 * Keeps distance from the train and periodically fires slow projectiles toward it.
 */
export class LongRangeEnemy extends Enemy {
  private readonly radius: number;
  private readonly projectileSpeed: number;
  private readonly preferredDistMin: number;
  private readonly preferredDistMax: number;
  private readonly shotCooldownMs: number;
  private readonly shotDamage: number;
  private readonly queueProjectile: (shot: EnemyProjectileSpawn) => void;

  private fireCooldownMs = 0;

  /** Keep artillery on-screen; padding is world pixels inside the main camera view. */
  private clampToCameraView(pad: number): void {
    const cam = this.scene.cameras.main.worldView;
    const minX = cam.x + pad;
    const maxX = cam.x + cam.width - pad;
    const minY = cam.y + pad;
    const maxY = cam.y + cam.height - pad;
    const nx = Phaser.Math.Clamp(this.sprite.x, minX, maxX);
    const ny = Phaser.Math.Clamp(this.sprite.y, minY, maxY);
    if (nx !== this.sprite.x || ny !== this.sprite.y) {
      this.sprite.setPosition(nx, ny);
      this.updateHealthBarPosition();
    }
  }

  /** Require a margin inside the view before firing so shots never come from off-screen. */
  private isFullyOnScreenForShooting(pad: number): boolean {
    const cam = this.scene.cameras.main.worldView;
    return (
      this.sprite.x >= cam.x + pad &&
      this.sprite.x <= cam.x + cam.width - pad &&
      this.sprite.y >= cam.y + pad &&
      this.sprite.y <= cam.y + cam.height - pad
    );
  }

  constructor(
    scene: Phaser.Scene,
    train: TrainController,
    getPlayerWorld: () => { x: number; y: number },
    x: number,
    y: number,
    radius: number,
    speed: number,
    fillColor: number,
    strokeColor: number,
    depth: number,
    maxHealth: number,
    queueProjectile: (shot: EnemyProjectileSpawn) => void,
  ) {
    super(
      scene,
      train,
      getPlayerWorld,
      x,
      y,
      radius,
      speed,
      fillColor,
      strokeColor,
      depth,
      maxHealth,
      'LONG_RANGE',
      false,
    );
    this.radius = radius;
    this.projectileSpeed = 240;
    this.preferredDistMin = 260;
    this.preferredDistMax = 400;
    this.shotCooldownMs = 1700;
    this.shotDamage = 12;
    this.queueProjectile = queueProjectile;
  }

  update(deltaMs: number): void {
    if (!this.sprite) return;

    const edgePad = 36 + this.radius * 2;
    const shootPad = 52 + this.radius * 2;

    const dt = deltaMs / 1000;
    const tx = this.train.body.x;
    const ty = this.train.body.y;
    const ex = this.sprite.x;
    const ey = this.sprite.y;
    const toTx = tx - ex;
    const toTy = ty - ey;
    const dist = Math.hypot(toTx, toTy);

    this.fireCooldownMs = Math.max(0, this.fireCooldownMs - deltaMs);

    if (dist > 1e-6) {
      const ux = toTx / dist;
      const uy = toTy / dist;
      let mx = 0;
      let my = 0;

      if (dist < this.preferredDistMin) {
        mx = -ux;
        my = -uy;
      } else if (dist > this.preferredDistMax) {
        mx = ux;
        my = uy;
      } else {
        mx = -uy;
        my = ux;
      }

      const mLen = Math.hypot(mx, my);
      if (mLen > 1e-6) {
        this.sprite.setPosition(
          ex + (mx / mLen) * this.speed * dt,
          ey + (my / mLen) * this.speed * dt,
        );
        this.updateHealthBarPosition();
      }
    }

    this.clampToCameraView(edgePad);

    const ndx = tx - this.sprite.x;
    const ndy = ty - this.sprite.y;
    const ndist = Math.hypot(ndx, ndy);
    if (
      ndist > 1e-6 &&
      this.fireCooldownMs <= 0 &&
      this.isFullyOnScreenForShooting(shootPad) &&
      ndist >= this.preferredDistMin - 50 &&
      ndist <= this.preferredDistMax + 80
    ) {
      const vx = (ndx / ndist) * this.projectileSpeed;
      const vy = (ndy / ndist) * this.projectileSpeed;
      this.queueProjectile({
        x: this.sprite.x,
        y: this.sprite.y,
        vx,
        vy,
        damage: this.shotDamage,
      });
      this.fireCooldownMs = this.shotCooldownMs;
    }
  }

  override resetForSpawn(x: number, y: number, health: number): void {
    super.resetForSpawn(x, y, health);
    this.fireCooldownMs = Phaser.Math.Between(400, 1200);
  }

  getRadius(): number {
    return this.radius;
  }

  getTrainContactDamage(): number {
    return 0;
  }

  getTrainContactCooldownMs(): number {
    return 999999;
  }
}
