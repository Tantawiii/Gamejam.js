import * as Phaser from 'phaser';
import { Enemy } from './Enemy';
import type { TrainController } from '../train/TrainController';
import { circleIntersectsCenteredRect } from './circleRectIntersect';

/**
 * Bomb enemy that explodes on contact with train, dealing high damage but dying in the process.
 */
export class BombEnemy extends Enemy {
  private readonly radius: number;
  private readonly explosionDamage: number;
  // @ts-ignore - Reserved for future area damage implementation
  private readonly _explosionRadius: number;

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
    _trainContactDamage: number, // Not used by bomb enemies
    _trainContactCooldownMs: number, // Not used by bomb enemies
    explosionDamage: number,
    _explosionRadius: number, // Reserved for future area damage
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
    );
    this.radius = radius;
    this.explosionDamage = explosionDamage;
    this._explosionRadius = _explosionRadius;
  }

  update(deltaMs: number): void {
    // If sprite was destroyed, skip update
    if (!this.sprite) return;

    // Move towards train
    this.moveTowardsClosestTarget(deltaMs);

    // Check for train collision and explode
    const hulls = this.train.getHullRects();
    for (const hull of hulls) {
      if (
        circleIntersectsCenteredRect(
          this.sprite.x,
          this.sprite.y,
          this.getRadius(),
          hull.x,
          hull.y,
          hull.width,
          hull.height,
        )
      ) {
        // Explode! Deal massive damage and destroy self
        this.train.takeDamage(this.explosionDamage);
        this.currentHealth = 0; // Mark as dead
        this.destroy();
        return;
      }
    }
  }

  getRadius(): number {
    return this.radius;
  }

  getTrainContactDamage(): number {
    // Bomb enemies don't do contact damage - they explode
    return 0;
  }

  getTrainContactCooldownMs(): number {
    return 0; // Not used for bomb enemies
  }

  /**
   * Bomb enemies handle their own collision logic in update() method.
   * They don't use the standard contact damage system.
   */
  handleTrainCollision(
    _hulls: Array<{ x: number; y: number; width: number; height: number }>,
    _onTrainDamaged?: () => void,
  ): boolean {
    // Bomb enemies don't do contact damage - they explode instead
    return false;
  }


}