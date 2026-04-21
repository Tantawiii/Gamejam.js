/**
 * DAMAGEABLE.TS - Interface for Health & Damage System
 * 
 * PURPOSE:
 * This interface defines a contract for any game object that can take damage and has health 
 * (enemies, train, possibly the player in the future). It ensures that all damageable entities
 * implement a consistent API for health management and damage calculation.
 * 
 * WHY USE AN INTERFACE:
 * - Allows different entity types (Enemy, Train, Player) to implement damage differently
 * - Provides a common interface so other systems (bullets, weapons) can damage anything damageable
 * - Makes the code more flexible and extensible without changing gun/bullet logic
 * 
 * METHODS EXPLAINED:
 * 
 * takeDamage(damage: number): boolean
 *   - Called when this entity is hit by a bullet, collision, or other damage source
 *   - Subtracts 'damage' from currentHealth
 *   - Returns TRUE if entity was destroyed (health <= 0), FALSE if still alive
 *   - Caller should remove destroyed entity from active lists
 * 
 * getCurrentHealth(): number
 *   - Returns the current health value (0 to maxHealth)
 *   - Used by UI systems to display health bars and status info
 *   - Can be 0 if destroyed but not yet cleaned up from memory
 * 
 * getMaxHealth(): number
 *   - Returns the maximum health this entity can have
 *   - Used for calculating health percentages (currentHealth / maxHealth * 100)
 *   - Different enemy types have different max health values
 * 
 * isAlive(): boolean
 *   - Quick check: returns true if currentHealth > 0
 *   - Used to filter out dead enemies from collision/targeting loops
 *   - Helps EnemySwarm know which enemies to update each frame
 * 
 * EXAMPLE USAGE IN TURRET SYSTEM:
 * When a bullet hits an enemy:
 * 1. enemies.tryHitEnemyWithBullet() is called
 * 2. Inside that method: wasDestroyed = enemy.takeDamage(bulletDamage)
 * 3. If wasDestroyed is true, enemy is removed from the active enemies list
 * 4. Coal pickup is spawned at enemy position using onEnemyDestroyed callback
 */
export interface Damageable {
  /**
   * Deal damage to this entity.
   * @param damage Amount of damage to deal
   * @returns true if the entity was destroyed by this damage
   */
  takeDamage(damage: number): boolean;

  /**
   * Get the current health of this entity.
   */
  getCurrentHealth(): number;

  /**
   * Get the maximum health of this entity.
   */
  getMaxHealth(): number;

  /**
   * Check if this entity is still alive.
   */
  isAlive(): boolean;
}