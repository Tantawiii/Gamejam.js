import * as Phaser from 'phaser';
import { pushCircleOutOfCenteredRect } from '../player/circleRectPushOut';
import type { TrainController } from '../train/TrainController';
import { circleIntersectsCenteredRect } from './circleRectIntersect';
import { Damageable } from './Damageable';

/**
 * Abstract base class for all enemy types.
 * Defines common enemy behavior and interface.
 */
export abstract class Enemy implements Damageable {
  protected readonly scene: Phaser.Scene;
  protected readonly train: TrainController;
  protected readonly getPlayerWorld: () => { x: number; y: number };
  protected sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  protected readonly collisionRadius: number;
  protected speed: number;
  protected trainHitCooldownMs: number = 0;
  protected currentHealth: number;
  protected readonly maxHealth: number;
  protected healthBar: Phaser.GameObjects.Graphics;

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
  ) {
    this.scene = scene;
    this.train = train;
    this.getPlayerWorld = getPlayerWorld;
    this.speed = speed;
    this.collisionRadius = radius;
    this.maxHealth = maxHealth;
    this.currentHealth = maxHealth;

    if (scene.textures.exists('NORMAL_ENEMY')) {
      const enemyImage = scene.add.image(x, y, 'NORMAL_ENEMY');
      enemyImage.setDisplaySize(radius * 10, radius * 10);
      enemyImage.setTint(fillColor);
      this.sprite = enemyImage;
    } else {
      const enemyCircle = scene.add.circle(x, y, radius, fillColor, 1);
      enemyCircle.setStrokeStyle(2, strokeColor);
      this.sprite = enemyCircle;
    }
    this.sprite.setDepth(depth);

    // Create health bar
    this.healthBar = scene.add.graphics();
    this.healthBar.setDepth(depth + 1); // Above the enemy
    this.updateHealthBarPosition();
  }

  /**
   * Update enemy logic. Called every frame.
   */
  abstract update(deltaMs: number): void;

  /**
   * Check if this enemy can be hit by a bullet at the given position.
   */
  canBeHitByBullet(bx: number, by: number, bulletRadius: number): boolean {
    const hitR = bulletRadius + this.getRadius();
    const hitRSq = hitR * hitR;
    const dx = this.sprite.x - bx;
    const dy = this.sprite.y - by;
    return dx * dx + dy * dy <= hitRSq;
  }

  /**
   * Destroy this enemy and trigger destruction callback.
   */
  destroy(onDestroyed?: (x: number, y: number) => void): void {
    const x = this.sprite.x;
    const y = this.sprite.y;
    this.sprite.destroy();
    this.healthBar.destroy();
    onDestroyed?.(x, y);
  }

  // Damageable interface implementation
  takeDamage(damage: number): boolean {
    this.currentHealth = Math.max(0, this.currentHealth - damage);
    const wasDestroyed = this.currentHealth <= 0;
    if (wasDestroyed) {
      this.sprite.destroy();
      this.healthBar.destroy();
    } else {
      this.updateHealthBarPosition();
    }
    return wasDestroyed;
  }

  getCurrentHealth(): number {
    return this.currentHealth;
  }

  getMaxHealth(): number {
    return this.maxHealth;
  }

  isAlive(): boolean {
    return this.currentHealth > 0;
  }

  /**
   * Update the health bar position to follow the enemy.
   */
  protected updateHealthBarPosition(): void {
    const radius = this.getRadius();
    const barWidth = radius * 2.5;
    const barHeight = 4;
    const x = this.sprite.x - barWidth / 2;
    const y = this.sprite.y - radius - 8;

    // Clear and redraw at new position
    this.healthBar.clear();

    // Background (gray)
    this.healthBar.fillStyle(0x333333, 0.8);
    this.healthBar.fillRect(x, y, barWidth, barHeight);

    // Health fill (red)
    const healthPercent = this.currentHealth / this.maxHealth;
    this.healthBar.fillStyle(0xff0000, 1);
    this.healthBar.fillRect(x, y, barWidth * healthPercent, barHeight);

    // Border
    this.healthBar.lineStyle(1, 0x000000, 1);
    this.healthBar.strokeRect(x, y, barWidth, barHeight);
  }

  /**
   * Get the enemy's current position.
   */
  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /**
   * Get the enemy's radius for collision detection.
   */
  abstract getRadius(): number;

  /**
   * Get the damage this enemy deals to the train on contact.
   */
  abstract getTrainContactDamage(): number;

  /**
   * Get the cooldown between train damage hits.
   */
  abstract getTrainContactCooldownMs(): number;

  /**
   * Check if this enemy collides with the player.
   */
  checkPlayerCollision(playerX: number, playerY: number, playerRadius: number): boolean {
    const hitR = this.getRadius() + playerRadius;
    const hitRSq = hitR * hitR;
    const dx = this.sprite.x - playerX;
    const dy = this.sprite.y - playerY;
    return dx * dx + dy * dy <= hitRSq;
  }

  /**
   * Handle collision with train hulls. Returns true if damage was dealt.
   */
  handleTrainCollision(
    hulls: Array<{ x: number; y: number; width: number; height: number }>,
    onTrainDamaged?: () => void,
  ): boolean {
    this.trainHitCooldownMs = Math.max(0, this.trainHitCooldownMs - 16.67); // Approximate deltaMs for collision check

    let dealtDamage = false;
    for (const tb of hulls) {
      if (
        !circleIntersectsCenteredRect(
          this.sprite.x,
          this.sprite.y,
          this.getRadius(),
          tb.x,
          tb.y,
          tb.width,
          tb.height,
        )
      ) {
        continue;
      }

      if (!dealtDamage && this.trainHitCooldownMs <= 0) {
        dealtDamage = true;
        this.train.takeDamage(this.getTrainContactDamage());
        this.trainHitCooldownMs = this.getTrainContactCooldownMs();
        onTrainDamaged?.();
      }

      const out = pushCircleOutOfCenteredRect(
        this.sprite.x,
        this.sprite.y,
        this.getRadius(),
        tb.x,
        tb.y,
        tb.width,
        tb.height,
      );
      this.sprite.setPosition(out.x, out.y);
    }

    return dealtDamage;
  }

  /**
   * Move towards the closest target (train or player).
   */
  protected moveTowardsClosestTarget(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const tx = this.train.body.x;
    const ty = this.train.body.y;
    const { x: px, y: py } = this.getPlayerWorld();

    const dTx = tx - this.sprite.x;
    const dTy = ty - this.sprite.y;
    const dPx = px - this.sprite.x;
    const dPy = py - this.sprite.y;

    const dT = dTx * dTx + dTy * dTy;
    const dP = dPx * dPx + dPy * dPy;

    const useTrain = dT <= dP;
    const gx = useTrain ? dTx : dPx;
    const gy = useTrain ? dTy : dPy;
    const len = Math.hypot(gx, gy);

    if (len > 1e-6) {
      this.sprite.setPosition(
        this.sprite.x + (gx / len) * this.speed * dt,
        this.sprite.y + (gy / len) * this.speed * dt,
      );
      this.updateHealthBarPosition();
    }
  }
}