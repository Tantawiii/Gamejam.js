import * as Phaser from 'phaser';
import { Enemy } from './Enemy';
import type { TrainController } from '../train/TrainController';
import { circleIntersectsCenteredRect } from './circleRectIntersect';
import { playBombTrainExplosionFx } from '../vfx/CollisionImpactVfx';
import { MAIN_CAMERA_SHAKE_ON_TRAIN_HIT } from '../game/gameConfig';

/**
 * BOMBENEMY.TS - Explosive Enemy That Self-Destructs
 * 
 * PURPOSE:
 * BombEnemy is a high-risk/high-reward enemy variant. It has low health and cannot deal 
 * contact damage, but triggers a massive explosion when it reaches the train. This creates 
 * tension and forces tactical decisions: kill it early or let it explode?
 * 
 * STATS & CHARACTERISTICS:
 * - Health: 30 HP (very fragile, dies in 1-2 cannon shots)
 * - Speed: 62 pixels/second (same as BasicEnemy for fairness)
 * - Size: 0.8x radius (20% smaller, harder to hit)
 * - Color: Purple (0x800080) with magenta stroke for danger indication
 * - Damage: 0 (no contact damage - all damage comes from explosion)
 * - Explosion Damage: 100 damage in single hit (5x more than BasicEnemy)
 * - Threat Level: EXTREME - highest single-hit damage in the game
 * 
 * UNIQUE MECHANICS:
 * 
 * 1. NO CONTACT DAMAGE SYSTEM:
 *    - Unlike BasicEnemy and ChunkyEnemy, BombEnemy NEVER uses the standard damage cooldown
 *    - Does NOT call train.takeDamage() during normal collision handling
 *    - Overrides handleTrainCollision() to do nothing
 * 
 * 2. TRAIN-ONLY TARGETING:
 *    - Explicitly chases ONLY the train, NOT the player
 *    - Does NOT use moveTowardsClosestTarget() which would pick closest entity
 *    - This keeps bomb focused and predictable
 * 
 * 3. EXPLOSION ON CONTACT:
 *    - When touching any train hull: checks circleIntersectsCenteredRect()
 *    - If contact detected:
 *      → Call train.takeDamage(100) for massive explosion damage
 *      → Immediately destroy self (set currentHealth to 0)
 *      → Destroy sprites and exit update loop
 *    - ONE-TIME EFFECT: Explosion happens once, then enemy is gone
 * 
 * MOVEMENT ALGORITHM:
 * - Calculate vector from enemy position to train center
 * - Normalize the direction
 * - Move along that direction at constant speed
 * - Simpler than BasicEnemy because NO attack cooldown needed
 * 
 * GAMEPLAY ROLE:
 * - Spawned with ~25% frequency (same as other variants)
 * - Forces proactive play: must kill before reaching train
 * - Creates tension because killing takes 2+ shots but not killing costs 100 HP
 * - Good for skill expression: dodging vs killing
 * - Added to mix at the same spawn rate (0.5s intervals, 28 max enemies)
 * 
 * STRATEGIC IMPORTANCE:
 * - Highest damage output per enemy
 * - Lowest health makes it vulnerable
 * - Small size makes it hard to target (0.8x radius)
 * - If left alive, it will reach train in ~5-8 seconds
 * - Coal drop on death compensates for difficulty
 * 
 * FUTURE ENHANCEMENTS (commented out):
 * - _explosionRadius: Reserved for area damage that damages nearby enemies
 * - Could eventually create chain reactions with other bombs
 * - Would require redesign of damage system to handle AOE
 * 
 * WHY NOT USE moveTowardsClosestTarget():
 * - That method targets closest entity (train OR player)
 * - Bomb should be single-minded and predictable
 * - If bomb chased player, it would be unfair (no way to block it)
 * - Training wheels off: must manage bomb threats by keeping player safe
 */
export class BombEnemy extends Enemy {
  private readonly radius: number;
  private readonly baseSpeed: number;
  private readonly explosionDamage: number;
  // @ts-ignore - Reserved for future area damage implementation
  private readonly _explosionRadius: number;
  private readonly onExplodedOnTrain?: (x: number, y: number) => void;

  private explosionSound: Phaser.Sound.BaseSound | null = null;

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
    onExplodedOnTrain?: (x: number, y: number) => void,
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
      true,
    );
    this.radius = radius;
    this.baseSpeed = speed;
    this.explosionDamage = explosionDamage;
    this._explosionRadius = _explosionRadius;
    this.onExplodedOnTrain = onExplodedOnTrain;

    if (scene.cache.audio.exists('Explosion_Sound')) {
      this.explosionSound = scene.sound.add('Explosion_Sound', { volume: 0.4 });
    }
  }

  update(deltaMs: number): void {
    // If sprite was destroyed, skip update
    if (!this.sprite) return;

    this.speed = this.baseSpeed * this.getExternalSpeedMultiplier();
    // Move towards train only (not player)
    const dt = deltaMs / 1000;
    const tx = this.train.body.x;
    const ty = this.train.body.y;
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 1e-6) {
      this.sprite.setPosition(
        this.sprite.x + (dx / distance) * this.speed * dt,
        this.sprite.y + (dy / distance) * this.speed * dt,
      );
      this.updateHealthBarPosition();
    }

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
        const ex = this.sprite.x;
        const ey = this.sprite.y;
        this.train.takeDamage(this.explosionDamage);

        this.explosionSound?.play();

        const cam = this.scene.cameras.main;
        const s = MAIN_CAMERA_SHAKE_ON_TRAIN_HIT;
        cam.shake(s.durationMs, s.intensity * 1.12, true);
        playBombTrainExplosionFx(this.scene, ex, ey, { depth: this.sprite.depth + 12 });
        this.currentHealth = 0; // Mark as dead
        this.onExplodedOnTrain?.(ex, ey);
        this.destroy();
        return;
      }
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
    // Bomb enemies don't do contact damage - they explode
    return 0;
  }

  getTrainContactCooldownMs(): number {
    return 0; // Not used for bomb enemies
  }

    override destroy(): void {
      this.explosionSound?.destroy();
      this.explosionSound = null;
      super.destroy();
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