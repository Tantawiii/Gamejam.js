import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';
import { Enemy } from './Enemy';

/**
 * CHUNKEYENEMY.TS - Slow Tank Enemy With Very High Health
 * 
 * PURPOSE:
 * ChunkyEnemy is a tank/boss-level threat that represents sustained danger rather than 
 * immediate threat. It moves slowly but takes many shots to kill and deals significant 
 * damage per hit. It tests the player's ability to prioritize threats and manage sustained fire.
 * 
 * STATS & CHARACTERISTICS:
 * - Health: 300 HP (6x more than BasicEnemy, 10x more than BombEnemy)
 * - Speed: 31 pixels/second (50% slower than BasicEnemy - 62 * 0.5)
 * - Size: 1.5x radius (50% larger, easier to hit but more imposing)
 * - Color: Brown (0x8b4513) with chocolate stroke (0xd2691e) for tank appearance
 * - Damage: 20 per hit (2x stronger than BasicEnemy)
 * - Damage Cooldown: 500ms between hits (same as BasicEnemy)
 * - Threat Level: MODERATE - high durability but slow approach
 * 
 * DESIGN PHILOSOPHY:
 * - "Slow Tank" archetype common in tower defense / wave-based games
 * - Forces tactical decision: ignore for now or focus fire early
 * - Takes time to reach train but when it does, deals significant damage per hit
 * - Represents the "one big enemy" threat level
 * 
 * BEHAVIOR:
 * 1. CONTINUOUS CHASE: Always moves toward train at half normal speed
 * 2. SUSTAINED ATTACK: When in range, attacks every 500ms (same cooldown as others)
 * 3. COLLISION PUSHBACK: Gets pushed away from train (standard behavior)
 * 4. HEALTH VISUALIZATION: Displays health bar showing high health pool
 * 5. LARGE VISUAL: 50% bigger size makes it visually distinctive
 * 
 * MOVEMENT ALGORITHM (identical to BasicEnemy):
 * - Calculate vector from enemy position to train center
 * - Normalize the direction
 * - Move along direction at 31 px/s (half of normal 62 px/s)
 * - Creates slow, inevitable approach toward train
 * 
 * ATTACK MECHANISM (identical to BasicEnemy):
 * - When distance <= (radius + 20px), enters attack range
 * - If attackCooldownMs <= 0, deals 20 damage to train
 * - Resets cooldown to 500ms
 * - Only one hit per collision per 500ms window
 * 
 * TIME-TO-KILL CALCULATION:
 * - BasicEnemy takes 2 cannon hits (~3 bullets per hit = 6 bullets)
 * - ChunkyEnemy takes 10 cannon hits (~3 bullets per hit = 30 bullets)
 * - This creates noticeable difference in threat level
 * 
 * SPAWN DISTRIBUTION:
 * - Spawned with ~25% frequency (same as other variants)
 * - 0 initial delay but can take 3-5 seconds to reach train
 * - Creates "slow moving threat" that trains player to look ahead
 * 
 * ROLE IN WAVE PROGRESSION:
 * - Easier difficulty: mostly BasicEnemies
 * - Medium difficulty: mix of all variants with more ChunkyEnemies
 * - Hard difficulty: primarily BombEnemies and ChunkyEnemies
 * - Could be scaled differently for wave system later
 * 
 * WHY THIS ARCHETYPE:
 * - Tests different skill: sustained focus fire vs burst killing
 * - Prevents spam of 1-shot enemies (too easy)
 * - Forces resource management (coal usage decision)
 * - Visually and mechanically distinct from basic
 * - Telegraphed threat: slow speed means player can prepare
 * 
 * FUTURE BALANCING:
 * - Speed can be adjusted (currently 50%)
 * - Health can scale with wave number
 * - Damage can increase for later waves
 * - Size could become 2x for final boss variant
 */
export class ChunkyEnemy extends Enemy {
  private readonly radius: number;
  private readonly baseSpeed: number;
  private readonly trainContactDamage: number;
  private readonly trainContactCooldownMs: number;

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
      'FAST_ENEMY',
      true,
    );
    this.radius = radius;
    this.baseSpeed = speed;
    this.trainContactDamage = trainContactDamage;
    this.trainContactCooldownMs = trainContactCooldownMs;
  }

  update(deltaMs: number): void {
    this.speed = this.baseSpeed * this.getExternalSpeedMultiplier();
    const dt = deltaMs / 1000;
    const tx = this.train.body.x;
    const ty = this.train.body.y;

    // Always move towards the train
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    const distance = Math.hypot(dx, dy);

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

  override resetForSpawn(
    x: number,
    y: number,
    health: number,
    bodyTint?: number,
    strokeTint?: number,
  ): void {
    super.resetForSpawn(x, y, health, bodyTint, strokeTint);
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
