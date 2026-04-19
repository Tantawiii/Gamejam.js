/**
 * Interface for objects that can take damage and have health.
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