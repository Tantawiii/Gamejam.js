import * as Phaser from 'phaser';
import { pushCircleOutOfCenteredRect } from '../player/circleRectPushOut';
import type { TrainController } from '../train/TrainController';
import { playStandardEnemyImpactFx } from '../vfx/CollisionImpactVfx';
import { circleIntersectsCenteredRect } from './circleRectIntersect';
import { Damageable } from './Damageable';

/**
 * ENEMY.TS - Abstract Base Class for All Enemy Types
 * 
 * PURPOSE:
 * This is the foundational class that all enemy variants (BasicEnemy, BombEnemy, ChunkyEnemy) 
 * inherit from. It provides the core enemy framework including health management, collision 
 * detection with trains, rendering, and common enemy mechanics.
 * 
 * KEY RESPONSIBILITIES:
 * 1. Health System - Track enemy health with takeDamage() and manage destruction when health reaches 0
 * 2. Visual Rendering - Sprite sheet walk animation (or circle fallback) plus health bar
 * 3. Train Collision Detection - Handle collision with train hulls and trigger damage/pushback
 * 4. Player Collision Detection - Detect when enemy touches the player (for future player damage)
 * 5. Damage To Bullets - Determine when bullets hit this enemy
 * 6. Abstract Methods - Define interface that subclasses must implement (update, getRadius, etc.)
 * 
 * IMPORTANT PROPERTIES:
 * - sprite: The visual (animated sprite or circle fallback) for the enemy
 * - healthBar: Graphics object showing health as a bar above the enemy
 * - currentHealth / maxHealth: Track damage taken and total health pool
 * - trainHitCooldownMs: Prevents the same collision from dealing damage repeatedly per frame
 * - speed: How fast the enemy moves toward targets (pixels per second)
 * 
 * COLLISION & DAMAGE FLOW:
 * 1. Enemy hits train hull → circleIntersectsCenteredRect() returns true
 * 2. handleTrainCollision() checks cooldown and deals damage if ready
 * 3. pushCircleOutOfCenteredRect() pushes enemy away to prevent overlap
 * 4. trainHitCooldownMs is reset to prevent spam damage
 * 5. When health reaches 0, enemy sprites are destroyed
 * 
 * ABSTRACT METHODS (must be implemented by subclasses):
 * - update(deltaMs): Called every frame to handle movement, collision checks, special behavior
 * - getRadius(): Return the circular collision radius of this enemy
 * - getTrainContactDamage(): Damage dealt to train when colliding
 * - getTrainContactCooldownMs(): Milliseconds between train damage hits
 */
export abstract class Enemy implements Damageable {
  protected readonly scene: Phaser.Scene;
  protected readonly train: TrainController;
  protected readonly getPlayerWorld: () => { x: number; y: number };
  protected sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  protected readonly collisionRadius: number;
  protected speed: number;
  protected trainHitCooldownMs: number = 0;
  protected currentHealth: number;
  protected readonly maxHealth: number;
  protected healthBar: Phaser.GameObjects.Graphics;
  protected activeInWorld = true;
  private externalSpeedMultiplier = 1;

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
    textureKey?: string,
    tintWithFillColor: boolean = true,
  ) {
    this.scene = scene;
    this.train = train;
    this.getPlayerWorld = getPlayerWorld;
    this.speed = speed;
    this.collisionRadius = radius;
    this.maxHealth = maxHealth;
    this.currentHealth = maxHealth;

    const resolvedKey =
      textureKey && scene.textures.exists(textureKey)
        ? textureKey
        : !textureKey && scene.textures.exists('NORMAL_ENEMY')
          ? 'NORMAL_ENEMY'
          : undefined;

    if (resolvedKey) {
      this.ensureEnemyWalkAnimation(resolvedKey);
      const animKey = Enemy.walkAnimKey(resolvedKey);
      const enemySprite = scene.add.sprite(x, y, resolvedKey);
      enemySprite.setDisplaySize(radius * 10, radius * 10);
      if (tintWithFillColor) {
        enemySprite.setTint(fillColor);
      }
      enemySprite.play(animKey);
      this.sprite = enemySprite;
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

  private static walkAnimKey(textureKey: string): string {
    return `${textureKey}_walk`;
  }

  private ensureEnemyWalkAnimation(textureKey: string): void {
    const animKey = Enemy.walkAnimKey(textureKey);
    if (this.scene.anims.exists(animKey)) {
      return;
    }
    const texture = this.scene.textures.get(textureKey);
    const end = Math.max(0, texture.frameTotal - 1);
    this.scene.anims.create({
      key: animKey,
      frames: this.scene.anims.generateFrameNumbers(textureKey, { start: 0, end: end }),
      frameRate: 8,
      repeat: -1,
    });
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

  resetForSpawn(x: number, y: number, health: number): void {
    this.currentHealth = Math.max(1, Math.min(this.maxHealth, health));
    this.activeInWorld = true;
    this.sprite.setPosition(x, y);
    this.sprite.setAlpha(1);
    this.sprite.setVisible(true);
    if (this.sprite instanceof Phaser.GameObjects.Sprite) {
      const tk = this.sprite.texture.key;
      const animKey = Enemy.walkAnimKey(tk);
      if (this.scene.anims.exists(animKey)) {
        this.sprite.play(animKey);
      }
    }
    this.healthBar.setAlpha(1);
    this.healthBar.setVisible(true);
    this.updateHealthBarPosition();
  }

  deactivateForPool(): void {
    this.activeInWorld = false;
    this.currentHealth = 0;
    if (this.sprite instanceof Phaser.GameObjects.Sprite) {
      this.sprite.anims.stop();
    }
    this.sprite.setVisible(false);
    this.healthBar.clear();
    this.healthBar.setVisible(false);
  }

  playDeathFade(
    onDestroyed?: (x: number, y: number) => void,
    onFadeDone?: () => void,
  ): void {
    const x = this.sprite.x;
    const y = this.sprite.y;
    playStandardEnemyImpactFx(this.scene, x, y, { depth: this.sprite.depth + 10 });
    this.healthBar.clear();
    this.scene.tweens.add({
      targets: [this.sprite, this.healthBar],
      alpha: 0,
      duration: 220,
      ease: 'Sine.Out',
      onComplete: () => {
        this.deactivateForPool();
        onFadeDone?.();
      },
    });
    onDestroyed?.(x, y);
  }

  // Damageable interface implementation
  takeDamage(damage: number): boolean {
    this.currentHealth = Math.max(0, this.currentHealth - damage);
    const wasDestroyed = this.currentHealth <= 0;
    if (!wasDestroyed) {
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
    return this.activeInWorld && this.currentHealth > 0;
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

  addWorldOffset(dx: number, dy: number): void {
    this.sprite.setPosition(this.sprite.x + dx, this.sprite.y + dy);
    this.updateHealthBarPosition();
  }

  constrainAgainstRects(
    rects: Array<{ x: number; y: number; width: number; height: number }>,
  ): void {
    for (const r of rects) {
      const out = pushCircleOutOfCenteredRect(
        this.sprite.x,
        this.sprite.y,
        this.getRadius(),
        r.x,
        r.y,
        r.width,
        r.height,
      );
      this.sprite.setPosition(out.x, out.y);
    }
    this.updateHealthBarPosition();
  }

  setExternalSpeedMultiplier(multiplier: number): void {
    this.externalSpeedMultiplier = Phaser.Math.Clamp(multiplier, 0.2, 1.5);
  }

  protected getExternalSpeedMultiplier(): number {
    return this.externalSpeedMultiplier;
  }

  /**
   * Sprite art faces right by default. On the right half of the viewport, flip so enemies
   * face inward toward the train; left half stays unflipped.
   */
  syncSpriteFacingForGameplayCamera(): void {
    if (!(this.sprite instanceof Phaser.GameObjects.Sprite)) {
      return;
    }
    const cam = this.scene.cameras.main.worldView;
    const midX = cam.x + cam.width * 0.5;
    this.sprite.setFlipX(this.sprite.x >= midX);
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