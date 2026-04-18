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

  constructor(
    scene: Phaser.Scene,
    options: {
      radius: number;
      depth: number;
      fillColor: number;
      strokeColor: number;
    },
  ) {
    this.scene = scene;
    this.radius = options.radius;
    this.depth = options.depth;
    this.fillColor = options.fillColor;
    this.strokeColor = options.strokeColor;
  }

  spawn(x: number, y: number, value: number): void {
    const s = this.scene.add.circle(x, y, this.radius, this.fillColor, 1);
    s.setStrokeStyle(2, this.strokeColor);
    s.setDepth(this.depth);
    this.pickups.push({ sprite: s, value });
  }

  update(
    playerX: number,
    playerY: number,
    playerRadius: number,
    train: TrainController,
  ): void {
    const collectR = playerRadius + this.radius;
    const rSq = collectR * collectR;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p) continue;
      const dx = p.sprite.x - playerX;
      const dy = p.sprite.y - playerY;
      if (dx * dx + dy * dy <= rSq) {
        train.addCoal(p.value);
        p.sprite.destroy();
        this.pickups.splice(i, 1);
      }
    }
  }

  destroy(): void {
    for (const p of this.pickups) {
      p.sprite.destroy();
    }
    this.pickups.length = 0;
  }
}
