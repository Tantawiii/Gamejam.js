import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';
import { Enemy } from './Enemy';

/**
 * Basic enemy that chases the closest target (train or player).
 */
export class BasicEnemy extends Enemy {
  private readonly radius: number;
  private readonly trainContactDamage: number;
  private readonly trainContactCooldownMs: number;
  private attackCooldownMs: number = 0;

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
    trainContactDamage: number,
    trainContactCooldownMs: number,
  ) {
    super(scene, train, getPlayerWorld, x, y, radius, speed, fillColor, strokeColor, depth, maxHealth);
    this.radius = radius;
    this.trainContactDamage = trainContactDamage;
    this.trainContactCooldownMs = trainContactCooldownMs;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const tx = this.train.body.x;
    const ty = this.train.body.y;

    // Always move towards the train
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    const distance = Math.hypot(dx, dy);

    // Update attack cooldown
    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - deltaMs);

    // If we're close enough to the train, attack when cooldown is ready
    if (distance <= this.radius + 20) { // Attack range
      if (this.attackCooldownMs <= 0) {
        this.train.takeDamage(this.trainContactDamage);
        this.attackCooldownMs = this.trainContactCooldownMs;
      }
    } else {
      // Move towards train
      if (distance > 1e-6) {
        const normalizedDx = dx / distance;
        const normalizedDy = dy / distance;
        this.sprite.setPosition(
          this.sprite.x + normalizedDx * this.speed * dt,
          this.sprite.y + normalizedDy * this.speed * dt,
        );
        this.updateHealthBarPosition();
      }
    }
  }

  getRadius(): number {
    return this.radius;
  }

  getTrainContactDamage(): number {
    return this.trainContactDamage;
  }

  getTrainContactCooldownMs(): number {
    return this.trainContactCooldownMs;
  }
}