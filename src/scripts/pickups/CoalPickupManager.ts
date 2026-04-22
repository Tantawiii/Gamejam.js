import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';

type Pickup = {
  sprite: Phaser.GameObjects.Arc;
  value: number;
};

/**
 * Coal pickups dropped by enemies; collected by walking the player over them.
 */
export class CoalPickupManager {
  private readonly scene: Phaser.Scene;
  private readonly pickups: Pickup[] = [];
  private readonly radius: number;
  private readonly depth: number;
  private readonly fillColor: number;
  private readonly strokeColor: number;
  private magnetRange: number;
  private magnetSpeed: number;

  constructor(
    scene: Phaser.Scene,
    options: {
      radius: number;
      depth: number;
      fillColor: number;
      strokeColor: number;
      magnetRange?: number;
      magnetSpeed?: number;
    },
  ) {
    this.scene = scene;
    this.radius = options.radius;
    this.depth = options.depth;
    this.fillColor = options.fillColor;
    this.strokeColor = options.strokeColor;
    this.magnetRange = options.magnetRange ?? 72;
    this.magnetSpeed = options.magnetSpeed ?? 220;
  }

  addMagnetRange(amount: number): void {
    if (amount <= 0) return;
    this.magnetRange += amount;
  }

  getMagnetRange(): number {
    return this.magnetRange;
  }

  spawn(x: number, y: number, value: number): void {
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
    train: TrainController,
    magnetRangeMultiplier: number = 1.0,
  ): number {
    const dt = deltaMs / 1000;
    let gained = 0;

    const trainRects = train.getHullRects();

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p) continue;

      // We will track the minimum squared distance TO THE EDGE of the target.
      // For a circle (player), this is (distance to center - playerRadius).
      // For a rectangle (train part), this is the distance to the nearest point on the rectangle.
      
      // Player check
      const pdx = p.sprite.x - playerX;
      const pdy = p.sprite.y - playerY;
      const pDistCenter = Math.sqrt(pdx * pdx + pdy * pdy);
      // Distance to edge (can be negative if inside)
      let minEdgeDist = pDistCenter - playerRadius;
      
      let bestTargetX = playerX;
      let bestTargetY = playerY;
      let bestTargetIsPlayer = true;

      // Check train parts
      for (const rect of trainRects) {
        // Distance to the closest point on the rectangle
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
          bestTargetIsPlayer = false;
        }
      }

      // Collection check: if edge distance <= our radius, we are touching.
      if (minEdgeDist <= this.radius) {
        train.addCoal(p.value);
        gained += p.value;
        p.sprite.destroy();
        this.pickups.splice(i, 1);
        continue;
      }

      // Attraction check: if edge distance <= magnet range.
      const baseMagnetRange = this.magnetRange * magnetRangeMultiplier;
      const trainMagnetRange = baseMagnetRange * 0.6;
      const currentTargetMagnetRange = bestTargetIsPlayer ? baseMagnetRange : trainMagnetRange;

      if (minEdgeDist <= currentTargetMagnetRange) {
        // Move towards the target center (or could move towards closest point)
        // Moving towards center feels more like a strong magnet.
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

  destroy(): void {
    for (const p of this.pickups) {
      p.sprite.destroy();
    }
    this.pickups.length = 0;
  }
}
