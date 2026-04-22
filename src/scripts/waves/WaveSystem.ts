import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';
import { BasicEnemy } from '../enemy/BasicEnemy';
import { BombEnemy } from '../enemy/BombEnemy';
import { ChunkyEnemy } from '../enemy/ChunkyEnemy';
import type { Enemy } from '../enemy/Enemy';
import { getWaveConfig, getBetweenWaveConfig, type EnemyType } from './WaveConfiguration';

/**
 * WAVESYSTEM.TS - Manages Wave-Based Enemy Spawning and Progression
 * 
 * PURPOSE:
 * Replaces the old EnemySwarm system with wave-based progression. Handles:
 * - Spawning specific enemies at specific times
 * - Tracking despawned enemies and respawning them
 * - Detecting wave completion
 * - Managing between-wave delays
 * - Difficulty scaling via multipliers
 * 
 * KEY FEATURES:
 * 1. WAVE STRUCTURE: Each wave has fixed enemy specs that scale with difficulty multiplier
 * 2. DESPAWN TRACKING: Enemies leaving screen are tracked and respawned with same health
 * 3. SPAWN TIMING: Enemies spawn gradually over time (not all at once)
 * 4. COMPLETION DETECTION: Wave ends when all enemies dead (not despawned)
 * 5. WAVE PROGRESSION: Auto-advance to next wave after delay
 */

interface PendingEnemy {
  type: EnemyType;
  health: number;
  spawnTime: number;
}

export type WaveSystemState = 'spawning' | 'active' | 'completed' | 'between_waves';

export interface WaveSystemCallback {
  onWaveStarted?: (waveNumber: number, totalEnemies: number) => void;
  onWaveCompleted?: (waveNumber: number) => void;
  onEnemyDestroyed?: (x: number, y: number) => void;
  onEnemyDespawned?: () => void;
}

export class WaveSystem {
  private readonly scene: Phaser.Scene;
  private readonly train: TrainController;
  private readonly getPlayerWorld: () => { x: number; y: number };
  private readonly callbacks: WaveSystemCallback;
  private readonly difficultyMultiplier: number;
  
  // Wave state
  private currentWave: number = 1;
  private currentState: WaveSystemState = 'spawning';
  private waveEnemies: Enemy[] = [];
  private pendingEnemies: PendingEnemy[] = [];
  private spawnAcc: number = 0;
  private totalEnemiesForWave: number = 0;
  private respawnQueue: PendingEnemy[] = [];
  private readonly enemyPools: Record<EnemyType, Enemy[]> = {
    basic: [],
    bomb: [],
    chunky: [],
  };
  
  // Between wave state
  private betweenWaveAcc: number = 0;
  
  // Config
  private enemySpawnInterval: number = 200; // ms between spawning each enemy
  private readonly maxAliveAtOnce = 18;

  constructor(
    scene: Phaser.Scene,
    train: TrainController,
    getPlayerWorld: () => { x: number; y: number },
    _worldWidth: number,
    _worldHeight: number,
    callbacks: WaveSystemCallback = {},
    difficultyMultiplier: number = 1.2,
    _spawnRadiusMin: number = 320,
    _spawnRadiusMax: number = 620,
  ) {
    this.scene = scene;
    this.train = train;
    this.getPlayerWorld = getPlayerWorld;
    this.callbacks = callbacks;
    this.difficultyMultiplier = difficultyMultiplier;

    this.initializeWave(1);
  }

  /**
   * Initialize wave with specific number
   */
  private initializeWave(waveNumber: number): void {
    this.currentWave = waveNumber;
    this.currentState = 'spawning';
    for (const e of this.waveEnemies) {
      this.recycleEnemy(e);
    }
    this.waveEnemies = [];
    this.pendingEnemies = [];
    this.respawnQueue = [];
    this.spawnAcc = 0;
    this.betweenWaveAcc = 0;

    const waveConfig = getWaveConfig(waveNumber, this.difficultyMultiplier);
    this.enemySpawnInterval = waveConfig.spawnIntervalMs;

    // Create pending enemies to spawn
    for (const spec of waveConfig.baseEnemies) {
      for (let i = 0; i < spec.count; i++) {
        this.pendingEnemies.push({
          type: spec.type,
          health: this.getMaxHealthForType(spec.type),
          spawnTime: i * this.enemySpawnInterval,
        });
      }
    }

    this.totalEnemiesForWave = this.pendingEnemies.length;
    this.callbacks.onWaveStarted?.(waveNumber, this.totalEnemiesForWave);
  }

  /**
   * Get max health for enemy type
   */
  private getMaxHealthForType(type: EnemyType): number {
    switch (type) {
      case 'basic':
        return 50;
      case 'bomb':
        return 30;
      case 'chunky':
        return 300;
    }
  }

  /**
   * Spawn a single enemy
   */
  private spawnEnemy(type: EnemyType, health: number): Enemy {
    const { x, y } = this.getSpawnPointAroundScreen();
    const pooled = this.enemyPools[type].pop();
    if (pooled) {
      pooled.resetForSpawn(x, y, health);
      this.waveEnemies.push(pooled);
      return pooled;
    }

    let enemy: Enemy;
    const commonRadius = 9;

    switch (type) {
      case 'basic': {
        enemy = new BasicEnemy(
          this.scene,
          this.train,
          this.getPlayerWorld,
          x,
          y,
          commonRadius,
          62, // speed
          0xd73a49, // fillColor
          0xffb1ba, // strokeColor
          8, // depth
          health,
          10, // trainContactDamage
          500, // trainContactCooldownMs
        );
        break;
      }
      case 'bomb': {
        enemy = new BombEnemy(
          this.scene,
          this.train,
          this.getPlayerWorld,
          x,
          y,
          commonRadius * 0.8,
          62, // speed
          0x800080, // fillColor
          0xff00ff, // strokeColor
          8, // depth
          health,
          0, // trainContactDamage
          0, // trainContactCooldownMs
          100, // explosionDamage
          (commonRadius * 0.8) * 2, // explosionRadius
        );
        break;
      }
      case 'chunky': {
        enemy = new ChunkyEnemy(
          this.scene,
          this.train,
          this.getPlayerWorld,
          x,
          y,
          commonRadius * 1.5,
          62 * 0.5, // 50% slower
          0x8b4513, // fillColor
          0xd2691e, // strokeColor
          8, // depth
          health,
          20, // trainContactDamage
          500, // trainContactCooldownMs
        );
        break;
      }
    }

    this.waveEnemies.push(enemy);
    return enemy;
  }

  private getSpawnPointAroundScreen(): { x: number; y: number } {
    const cam = this.scene.cameras.main.worldView;
    const margin = 80;
    const side = Phaser.Math.Between(0, 3);
    switch (side) {
      case 0:
        return {
          x: Phaser.Math.Between(cam.x - margin, cam.right + margin),
          y: cam.y - margin,
        };
      case 1:
        return {
          x: cam.right + margin,
          y: Phaser.Math.Between(cam.y - margin, cam.bottom + margin),
        };
      case 2:
        return {
          x: Phaser.Math.Between(cam.x - margin, cam.right + margin),
          y: cam.bottom + margin,
        };
      default:
        return {
          x: cam.x - margin,
          y: Phaser.Math.Between(cam.y - margin, cam.bottom + margin),
        };
    }
  }

  private recycleEnemy(enemy: Enemy): void {
    const type = this.getEnemyType(enemy);
    enemy.deactivateForPool();
    this.enemyPools[type].push(enemy);
  }

  /**
   * Check if enemy is off-screen (despawned)
   */
  private isEnemyOffScreen(x: number, y: number): boolean {
    const margin = 200; // Buffer beyond screen
    const cam = this.scene.cameras.main;
    const camX = cam.worldView.x;
    const camY = cam.worldView.y;
    const camW = cam.worldView.width;
    const camH = cam.worldView.height;

    return x < camX - margin || x > camX + camW + margin || 
           y < camY - margin || y > camY + camH + margin;
  }

  /**
   * Get total alive enemies
   */
  getTotalAliveEnemies(): number {
    return this.waveEnemies.filter(e => e.isAlive()).length;
  }

  /**
   * Get total remaining enemies to spawn
   */
  getTotalRemainingToSpawn(): number {
    return this.pendingEnemies.length + this.respawnQueue.length;
  }

  /**
   * Get current wave number
   */
  getCurrentWave(): number {
    return this.currentWave;
  }

  /**
   * Get current state
   */
  getState(): WaveSystemState {
    return this.currentState;
  }

  /**
   * Update wave system
   */
  update(deltaMs: number): void {
    if (this.currentState === 'between_waves') {
      this.betweenWaveAcc += deltaMs;
      const betweenWaveConfig = getBetweenWaveConfig();
      if (this.betweenWaveAcc >= betweenWaveConfig.delayBeforeNextWaveMs) {
        this.initializeWave(this.currentWave + 1);
      }
      return;
    }

    if (this.currentState === 'completed') {
      return;
    }

    // Spawn pending enemies gradually with alive cap
    this.spawnAcc += deltaMs;
    while (
      this.pendingEnemies.length > 0 &&
      this.spawnAcc >= this.enemySpawnInterval &&
      this.getTotalAliveEnemies() < this.maxAliveAtOnce
    ) {
      this.spawnAcc -= this.enemySpawnInterval;
      const pending = this.pendingEnemies.shift()!;
      this.spawnEnemy(pending.type, pending.health);
      
      if (this.pendingEnemies.length === 0) {
        this.currentState = 'active';
      }
    }

    // Check for despawned enemies
    let i = this.waveEnemies.length - 1;
    while (i >= 0) {
      const e = this.waveEnemies[i];
      if (e && !e.isAlive()) {
        // Dead enemy, remove permanently
        this.waveEnemies.splice(i, 1);
      } else if (e) {
        const pos = e.getPosition();
        if (this.isEnemyOffScreen(pos.x, pos.y)) {
          // Enemy despawned, add to respawn queue
          this.respawnQueue.push({
            type: this.getEnemyType(e),
            health: e.getCurrentHealth(),
            spawnTime: 0,
          });
          this.recycleEnemy(e);
          this.waveEnemies.splice(i, 1);
          this.callbacks.onEnemyDespawned?.();
        }
      }
      i--;
    }

    // Respawn despawned enemies gradually with same cap
    if (
      this.respawnQueue.length > 0 &&
      this.spawnAcc >= this.enemySpawnInterval &&
      this.getTotalAliveEnemies() < this.maxAliveAtOnce
    ) {
      this.spawnAcc -= this.enemySpawnInterval;
      const respawning = this.respawnQueue.shift()!;
      this.spawnEnemy(respawning.type, respawning.health);
    }

    // Check wave completion
    const aliveCount = this.getTotalAliveEnemies();
    const pendingCount = this.getTotalRemainingToSpawn();

    if (aliveCount === 0 && pendingCount === 0) {
      this.currentState = 'between_waves';
      this.callbacks.onWaveCompleted?.(this.currentWave);
      this.betweenWaveAcc = 0;
    }
  }

  /**
   * Determine enemy type by checking instance
   */
  private getEnemyType(enemy: Enemy): EnemyType {
    if (enemy instanceof BasicEnemy) return 'basic';
    if (enemy instanceof BombEnemy) return 'bomb';
    if (enemy instanceof ChunkyEnemy) return 'chunky';
    return 'basic'; // Default fallback
  }

  /**
   * Check if bullet hits enemy
   */
  tryHitEnemyWithBullet(
    bx: number,
    by: number,
    bulletRadius: number,
    bulletDamage: number = 1,
  ): boolean {
    let i = 0;
    while (i < this.waveEnemies.length) {
      const e = this.waveEnemies[i];
      if (e && e.isAlive() && e.canBeHitByBullet(bx, by, bulletRadius)) {
        const wasDestroyed = e.takeDamage(bulletDamage);
        if (wasDestroyed) {
          const type = this.getEnemyType(e);
          e.playDeathFade(this.callbacks.onEnemyDestroyed, () => {
            this.enemyPools[type].push(e);
          });
          this.waveEnemies.splice(i, 1);
        }
        return true;
      }
      i++;
    }
    return false;
  }

  /**
   * Find closest living enemy
   */
  findClosestLivingEnemyTo(wx: number, wy: number): { x: number; y: number } | null {
    let best: { x: number; y: number; d: number } | null = null;
    for (const e of this.waveEnemies) {
      if (!e.isAlive()) continue;
      const pos = e.getPosition();
      const dx = pos.x - wx;
      const dy = pos.y - wy;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) {
        best = { x: pos.x, y: pos.y, d };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /**
   * Handle train collision for all enemies
   */
  updateCollisions(
    hulls: Array<{ x: number; y: number; width: number; height: number }>,
    onTrainDamaged?: () => void,
  ): void {
    for (const e of this.waveEnemies) {
      if (e.isAlive()) {
        e.handleTrainCollision(hulls, onTrainDamaged);
      }
    }
  }

  /**
   * Update all enemies
   */
  updateEnemies(deltaMs: number): void {
    for (const e of this.waveEnemies) {
      if (e.isAlive()) {
        e.update(deltaMs);
      }
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    for (const e of this.waveEnemies) {
      e.destroy();
    }
    for (const type of ['basic', 'bomb', 'chunky'] as const) {
      for (const e of this.enemyPools[type]) {
        e.destroy();
      }
      this.enemyPools[type] = [];
    }
    this.waveEnemies = [];
    this.pendingEnemies = [];
    this.respawnQueue = [];
  }
}
