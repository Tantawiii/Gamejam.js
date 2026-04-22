import * as Phaser from 'phaser';
import type { TrainController } from './TrainController';

type EnemyTargetingSystem = {
  findClosestLivingEnemyTo(wx: number, wy: number): { x: number; y: number } | null;
  tryHitEnemyWithBullet(
    bx: number,
    by: number,
    bulletRadius: number,
    bulletDamage?: number,
  ): boolean;
};

type Bullet = {
  graphic: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  lifeMs: number;
};

/**
 * One gun per turret mount on engine + carriages. Guns render above hulls; barrel points at target (horizontal sprite + rotation).
 */
export class TrainTurretSystem {
  private readonly scene: Phaser.Scene;
  private guns: Phaser.GameObjects.Rectangle[] = [];
  private readonly fireAcc: number[] = [];
  private readonly bullets: Bullet[] = [];
  private readonly fireIntervalMs: number;
  private readonly bulletSpeed: number;
  private readonly bulletRadius: number;
  private readonly bulletLifeMs: number;
  private readonly bulletColor: number;
  private readonly gunLength: number;
  private readonly gunThickness: number;
  private readonly depth: number;
  private readonly firingRange: number;

  constructor(
    scene: Phaser.Scene,
    options: {
      fireIntervalMs: number;
      bulletSpeed: number;
      bulletRadius: number;
      bulletLifeMs: number;
      bulletColor: number;
      gunLength: number;
      gunThickness: number;
      depth: number;
      firingRange?: number;
    },
  ) {
    this.scene = scene;
    this.fireIntervalMs = options.fireIntervalMs;
    this.bulletSpeed = options.bulletSpeed;
    this.bulletRadius = options.bulletRadius;
    this.bulletLifeMs = options.bulletLifeMs;
    this.bulletColor = options.bulletColor;
    this.gunLength = options.gunLength;
    this.gunThickness = options.gunThickness;
    this.depth = options.depth;
    this.firingRange = options.firingRange ?? 500; // Default 500 pixel range
  }

  rebuildFromTrain(train: TrainController): void {
    for (const g of this.guns) {
      g.destroy();
    }
    this.guns = [];
    this.fireAcc.length = 0;
    for (const b of this.bullets) {
      b.graphic.destroy();
    }
    this.bullets.length = 0;

    const mounts = train.getTurretWorldPositions();
    for (let i = 0; i < mounts.length; i++) {
      const m = mounts[i]!;
      const gun = this.scene.add.rectangle(
        m.x,
        m.y,
        this.gunLength,
        this.gunThickness,
        0x6e7681,
        1,
      );
      gun.setStrokeStyle(2, 0xc9d1d9);
      gun.setOrigin(0.2, 0.5);
      gun.setDepth(this.depth);
      this.guns.push(gun);
      this.fireAcc.push(0);
    }
  }

  update(
    deltaMs: number,
    train: TrainController,
    enemies: EnemyTargetingSystem,
    canFire: boolean,
  ): void {
    const mounts = train.getTurretWorldPositions();
    if (mounts.length !== this.guns.length) {
      this.rebuildFromTrain(train);
    }

    // Get camera bounds
    const cam = this.scene.cameras.main;
    const camX = cam.worldView.x;
    const camY = cam.worldView.y;
    const camW = cam.worldView.width;
    const camH = cam.worldView.height;

    for (let i = 0; i < this.guns.length; i++) {
      const gun = this.guns[i];
      const m = mounts[i];
      if (!gun || !m) continue;
      gun.setPosition(m.x, m.y);

      const target = enemies.findClosestLivingEnemyTo(m.x, m.y);
      if (!target) {
        continue;
      }

      const dx = target.x - m.x;
      const dy = target.y - m.y;
      const distance = Math.hypot(dx, dy);

      const ang = Math.atan2(dy, dx);
      gun.setRotation(ang);

      if (!canFire) {
        continue;
      }

      // Only fire if target is within range AND on screen
      if (distance > this.firingRange) {
        continue;
      }

      // Check if target is within camera bounds
      if (target.x < camX || target.x > camX + camW || target.y < camY || target.y > camY + camH) {
        continue;
      }

      this.fireAcc[i] = (this.fireAcc[i] ?? 0) + deltaMs;
      if ((this.fireAcc[i] ?? 0) < this.fireIntervalMs) continue;
      this.fireAcc[i] = 0;

      const tipDist = this.gunLength * 0.85;
      const tipX = m.x + Math.cos(ang) * tipDist;
      const tipY = m.y + Math.sin(ang) * tipDist;
      const vx = Math.cos(ang) * this.bulletSpeed;
      const vy = Math.sin(ang) * this.bulletSpeed;

      const g = this.scene.add.circle(
        tipX,
        tipY,
        this.bulletRadius,
        this.bulletColor,
        1,
      );
      g.setDepth(this.depth + 1);
      this.bullets.push({ graphic: g, vx, vy, lifeMs: this.bulletLifeMs });
    }

    this.updateBullets(deltaMs, enemies);
  }

  private updateBullets(deltaMs: number, enemies: EnemyTargetingSystem): void {
    const dt = deltaMs / 1000;
    const cam = this.scene.cameras.main;
    const camX = cam.worldView.x;
    const camY = cam.worldView.y;
    const camW = cam.worldView.width;
    const camH = cam.worldView.height;
    
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) continue;
      b.lifeMs -= deltaMs;
      if (b.lifeMs <= 0) {
        b.graphic.destroy();
        this.bullets.splice(i, 1);
        continue;
      }
      const nx = b.graphic.x + b.vx * dt;
      const ny = b.graphic.y + b.vy * dt;
      b.graphic.setPosition(nx, ny);

      // Only hit enemies if bullet is within camera bounds
      const isOnScreen = nx >= camX && nx <= camX + camW && ny >= camY && ny <= camY + camH;
      if (isOnScreen) {
        const hit = enemies.tryHitEnemyWithBullet(nx, ny, this.bulletRadius, 30);
        if (hit) {
          b.graphic.destroy();
          this.bullets.splice(i, 1);
        }
      }
    }
  }

  destroy(): void {
    for (const g of this.guns) {
      g.destroy();
    }
    this.guns = [];
    for (const b of this.bullets) {
      b.graphic.destroy();
    }
    this.bullets.length = 0;
  }
}
