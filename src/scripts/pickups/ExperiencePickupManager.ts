import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';

type Pickup = {
  sprite: Phaser.GameObjects.Arc;
  value: number;
};

export class ExperiencePickupManager {
  private readonly scene: Phaser.Scene;
  private readonly pickups: Pickup[] = [];
  private readonly radius: number;
  private readonly depth: number;
  private readonly fillColor: number;
  private readonly strokeColor: number;
  private magnetRange = 78;
  private magnetSpeed = 240;

  constructor(
    scene: Phaser.Scene,
    options: {
      radius?: number;
      depth?: number;
      fillColor?: number;
      strokeColor?: number;
    } = {},
  ) {
    this.scene = scene;
    this.radius = options.radius ?? 6;
    this.depth = options.depth ?? 10;
    this.fillColor = options.fillColor ?? 0x7ee787;
    this.strokeColor = options.strokeColor ?? 0x2ea043;
  }

  spawn(x: number, y: number, value: number): void {
    if (value <= 0) return;
    const s = this.scene.add.circle(x, y, this.radius, this.fillColor, 1);
    s.setStrokeStyle(2, this.strokeColor);
    s.setDepth(this.depth);
    this.pickups.push({ sprite: s, value });
  }

  addWorldOffset(dx: number, dy: number): void {
    for (const pickup of this.pickups) {
      pickup.sprite.setPosition(pickup.sprite.x + dx, pickup.sprite.y + dy);
    }
  }

  update(
    deltaMs: number,
    playerX: number,
    playerY: number,
    playerRadius: number,
    magnetRange: number,
    train: TrainController,
  ): number {
    this.magnetRange = Math.max(0, magnetRange);
    const dt = deltaMs / 1000;
    let gained = 0;

    const trainRects = train.getHullRects();
    const trainMagnetRange = this.magnetRange * 0.6;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p) continue;

      // Player check
      const pdx = p.sprite.x - playerX;
      const pdy = p.sprite.y - playerY;
      const pDistCenter = Math.sqrt(pdx * pdx + pdy * pdy);
      let minEdgeDist = pDistCenter - playerRadius;

      let bestTargetX = playerX;
      let bestTargetY = playerY;
      let currentMagnetRange = this.magnetRange;

      // Check train parts
      for (const rect of trainRects) {
        const left = rect.x - rect.width * 0.5;
        const right = rect.x + rect.width * 0.5;
        const top = rect.y - rect.height * 0.5;
        const bottom = rect.y + rect.height * 0.5;

        const closestX = Math.max(left, Math.min(p.sprite.x, right));
        const closestY = Math.max(top, Math.min(p.sprite.y, bottom));

        const rdx = p.sprite.x - closestX;
        const rdy = p.sprite.y - closestY;
        const rEdgeDist = Math.sqrt(rdx * rdx + rdy * rdy);

        if (rEdgeDist < minEdgeDist) {
          minEdgeDist = rEdgeDist;
          bestTargetX = rect.x;
          bestTargetY = rect.y;
          currentMagnetRange = trainMagnetRange;
        }
      }

      // Collection check
      if (minEdgeDist <= this.radius) {
        gained += p.value;
        p.sprite.destroy();
        this.pickups.splice(i, 1);
        continue;
      }

      // Attraction check
      if (minEdgeDist <= currentMagnetRange) {
        const dx = p.sprite.x - bestTargetX;
        const dy = p.sprite.y - bestTargetY;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);

        if (distToCenter > 1e-6) {
          const step = Math.min(distToCenter, this.magnetSpeed * dt);
          const nx = p.sprite.x - (dx / distToCenter) * step;
          const ny = p.sprite.y - (dy / distToCenter) * step;
          p.sprite.setPosition(nx, ny);
        }
      }
    }
    return gained;
  }

  collectAt(playerX: number, playerY: number, playerRadius: number): number {
    const collectR = playerRadius + this.radius;
    const rSq = collectR * collectR;
    let gained = 0;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p) continue;
      const dx = p.sprite.x - playerX;
      const dy = p.sprite.y - playerY;
      if (dx * dx + dy * dy > rSq) continue;
      gained += p.value;
      p.sprite.destroy();
      this.pickups.splice(i, 1);
    }
    return gained;
  }

  destroy(): void {
    for (const p of this.pickups) {
      p.sprite.destroy();
    }
    this.pickups.length = 0;
  }
}
