import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';
import { Enemy } from './Enemy';

/**
 * BASICENEMY.TS - The Standard Weak Enemy Type
 * 
 * PURPOSE:
 * BasicEnemy is the foundational enemy variant. It represents a normal, unspecialized enemy
 * that players will encounter most frequently. It serves as the baseline for comparison with
 * other enemy types (Tough, Bomb, Chunky).
 * 
 * STATS & CHARACTERISTICS:
 * - Health: 50 HP (low health, dies quickly to bullets)
 * - Speed: 62 pixels/second (standard chase speed)
 * - Size: 1x radius (normal enemy size)
 * - Color: Red (0xd73a49) with pink stroke for clarity
 * - Damage: 10 damage per hit to train (with 500ms cooldown)
 * - Threat Level: Low - easy to kill but can swarm
 * 
 * BEHAVIOR:
 * 1. CONTINUOUS CHASE: Always moves toward the train (never targets player)
 * 2. ATTACK ON CONTACT: When close enough to train (radius + 20px), starts attacking
 * 3. ATTACK COOLDOWN: Can only damage train every 500ms to prevent spam damage
 * 4. COLLISION PUSHBACK: Gets pushed away from train to prevent overlap
 * 5. HEALTH VISUALIZATION: Displays health bar above enemy that decreases with damage
 * 
 * MOVEMENT ALGORITHM:
 * - Calculate vector from enemy position to train center
 * - Normalize the direction (divide by distance to get unit vector)
 * - Move along that direction at constant speed: position += (direction * speed * deltaTime)
 * - This creates smooth pursuit movement
 * 
 * ATTACK MECHANISM:
 * - When distance to train <= (radius + 20px), enemy enters attack range
 * - If attack cooldown has elapsed (> 500ms since last hit):
 *   → Call train.takeDamage(10)
 *   → Reset attackCooldownMs to 500
 * - This prevents multiple hits per frame during collision
 * 
 * ROLE IN GAMEPLAY:
 * - Primary cannon fodder enemy spawned with ~25% frequency
 * - Forces player to keep cannons firing continuously
 * - Low threat individually but dangerous in groups (swarms)
 * - Requires sustained fire to clear efficiently
 * 
 * INTERACTION WITH OTHER SYSTEMS:
 * - EnemySwarm spawns BasicEnemy when variant = 0
 * - Turrets detect and fire at BasicEnemies in range
 * - Coal pickups spawn when BasicEnemy dies
 * - Player can collide with BasicEnemy (not implemented yet)
 */
export class BasicEnemy extends Enemy {
  private readonly radius: number;
  private readonly baseSpeed: number;
  private readonly getSpeedScale: () => number;
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
    getSpeedScale: () => number = () => 1,
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
      'NORMAL_ENEMY',
      false,
    );
    this.radius = radius;
    this.baseSpeed = speed;
    this.getSpeedScale = getSpeedScale;
    this.trainContactDamage = trainContactDamage;
    this.trainContactCooldownMs = trainContactCooldownMs;
  }

  update(deltaMs: number): void {
    this.speed = this.baseSpeed * this.getSpeedScale();
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

  override resetForSpawn(x: number, y: number, health: number): void {
    super.resetForSpawn(x, y, health);
    this.attackCooldownMs = 0;
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