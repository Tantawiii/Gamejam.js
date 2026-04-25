import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';
import { BasicEnemy } from '../enemy/BasicEnemy';
import { BombEnemy } from '../enemy/BombEnemy';
import { ChunkyEnemy } from '../enemy/ChunkyEnemy';
import type { Enemy } from '../enemy/Enemy';
import { circleIntersectsCenteredRect } from '../enemy/circleRectIntersect';
import { LongRangeEnemy } from '../enemy/LongRangeEnemy';
import type { EnemyProjectileSpawn } from '../enemy/LongRangeEnemy';
import { playBombTrainExplosionFx } from '../vfx/CollisionImpactVfx';
import { getWaveConfig, type EnemyType } from './WaveConfiguration';

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
  onEnemyDestroyed?: (x: number, y: number, type: EnemyType) => void;
  onEnemyDespawned?: () => void;
}

export class WaveSystem {
  private static readonly BASIC_ENEMY_SPEED = 72;
  private static readonly BOMB_ENEMY_SPEED = 76;
  private static readonly CHUNKY_ENEMY_SPEED = 62 * 0.5;
  private static readonly LONG_RANGE_ENEMY_SPEED = 72;
  private static readonly ENEMY_PROJECTILE_TTL_MS = 9000;
  /** Chunky enemies only spawn once the player reaches this level (1-based). */
  private static readonly CHUNKY_MIN_PLAYER_LEVEL = 3;
  /** Long-range enemies only spawn once the player reaches this level (1-based). */
  private static readonly LONG_RANGE_MIN_PLAYER_LEVEL = 5;
  private readonly scene: Phaser.Scene;
  private readonly train: TrainController;
  private readonly getPlayerWorld: () => { x: number; y: number };
  private readonly getPlayerLevel: () => number;
  private readonly callbacks: WaveSystemCallback;
  private readonly difficultyMultiplier: number;
  
  // Wave state
  private currentState: WaveSystemState = 'active';
  private waveEnemies: Enemy[] = [];
  private pendingEnemies: PendingEnemy[] = [];
  private spawnAcc: number = 0;
  private totalEnemiesForWave: number = 0;
  private respawnQueue: PendingEnemy[] = [];
  private readonly enemyPools: Record<EnemyType, Enemy[]> = {
    basic: [],
    bomb: [],
    chunky: [],
    long_range: [],
  };

  private readonly enemyProjectiles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    damage: number;
    ttlMs: number;
    gfx: Phaser.GameObjects.Arc;
  }> = [];
  
  private spawnCycle = 0;
  
  // Config
  private enemySpawnInterval: number = 200; // ms between spawning each enemy
  private readonly maxAliveAtOnce = 18;
  private nightIntensity = 0;
  private slowFields: Array<{ x: number; y: number; radius: number; slowFactor: number }> = [];
  private spawningPaused = false;

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
    getPlayerLevel: () => number = () => 999,
  ) {
    this.scene = scene;
    this.train = train;
    this.getPlayerWorld = getPlayerWorld;
    this.getPlayerLevel = getPlayerLevel;
    this.callbacks = callbacks;
    this.difficultyMultiplier = difficultyMultiplier;

    this.initializeWave(1);
  }

  /**
   * Initialize wave with specific number
   */
  private initializeWave(waveNumber: number): void {
    this.currentState = 'active';
    for (const e of this.waveEnemies) {
      this.recycleEnemy(e);
    }
    this.waveEnemies = [];
    this.pendingEnemies = [];
    this.respawnQueue = [];
    this.spawnAcc = 0;

    const waveConfig = getWaveConfig(Math.max(1, waveNumber), this.difficultyMultiplier);
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
    this.callbacks.onWaveStarted?.(1, this.totalEnemiesForWave);
  }

  private enqueueNextEndlessBatch(): void {
    this.spawnCycle += 1;
    const virtualWave = 1 + Math.floor(this.spawnCycle / 2);
    const waveConfig = getWaveConfig(virtualWave, this.difficultyMultiplier);
    this.enemySpawnInterval = waveConfig.spawnIntervalMs;
    for (const spec of waveConfig.baseEnemies) {
      for (let i = 0; i < spec.count; i++) {
        this.pendingEnemies.push({
          type: spec.type,
          health: this.getMaxHealthForType(spec.type),
          spawnTime: 0,
        });
      }
    }
    this.totalEnemiesForWave += this.pendingEnemies.length;
  }

  setNightIntensity(value: number): void {
    this.nightIntensity = Phaser.Math.Clamp(value, 0, 1);
  }

  setSlowFields(fields: Array<{ x: number; y: number; radius: number; slowFactor: number }>): void {
    this.slowFields = fields;
  }

  setSpawningPaused(paused: boolean): void {
    this.spawningPaused = paused;
  }

  private getCurrentSpawnIntervalMs(): number {
    // Night spawns faster.
    return Math.max(80, this.enemySpawnInterval * (1 - this.nightIntensity * 0.4));
  }

  private adjustHealthForNight(baseHealth: number): number {
    // Night enemies are tougher.
    return Math.ceil(baseHealth * (1 + this.nightIntensity * 0.45));
  }

  /**
   * Basic enemies accelerate as endless waves progress (spawnCycle ticks up each batch).
   */
  private getBasicEnemySpeedScale(): number {
    return 1 + Math.min(2.8, this.spawnCycle * 0.11);
  }

  /**
   * Get max health for enemy type
   */
  private resolveSpawnTypeAndHealth(
    type: EnemyType,
    health: number,
  ): { type: EnemyType; health: number } {
    if (type === 'basic') {
      return {
        type: 'bomb',
        health: this.getMaxHealthForType('bomb'),
      };
    }
    const level = this.getPlayerLevel();
    if (type === 'chunky' && level < WaveSystem.CHUNKY_MIN_PLAYER_LEVEL) {
      return {
        type: 'bomb',
        health: this.getMaxHealthForType('bomb'),
      };
    }
    if (type === 'long_range' && level < WaveSystem.LONG_RANGE_MIN_PLAYER_LEVEL) {
      return {
        type: 'bomb',
        health: this.getMaxHealthForType('bomb'),
      };
    }
    return { type, health };
  }

  private getMaxHealthForType(type: EnemyType): number {
    switch (type) {
      case 'basic':
        return 30;
      case 'bomb':
        return 30;
      case 'chunky':
        return 120;
      case 'long_range':
        return 30;
    }
  }

  private enqueueEnemyProjectile(spawn: EnemyProjectileSpawn): void {
    const r = 5;
    const gfx = this.scene.add.circle(spawn.x, spawn.y, r, 0xff5533, 1);
    gfx.setStrokeStyle(1, 0xffccaa);
    gfx.setDepth(7);
    this.enemyProjectiles.push({
      x: spawn.x,
      y: spawn.y,
      vx: spawn.vx,
      vy: spawn.vy,
      radius: r,
      damage: spawn.damage,
      ttlMs: WaveSystem.ENEMY_PROJECTILE_TTL_MS,
      gfx,
    });
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
    const cycleScale = 1 + this.spawnCycle * 0.08;
    const speedScale = 1 + this.spawnCycle * 0.05;
    const scaledHealth = Math.ceil(health * cycleScale);

    switch (type) {
      case 'basic': {
        enemy = new BasicEnemy(
          this.scene,
          this.train,
          this.getPlayerWorld,
          x,
          y,
          commonRadius,
          WaveSystem.BASIC_ENEMY_SPEED * speedScale,
          0xd73a49, // fillColor
          0xffb1ba, // strokeColor
          8, // depth
          scaledHealth,
          Math.ceil(10 * cycleScale), // trainContactDamage
          500, // trainContactCooldownMs
          () => this.getBasicEnemySpeedScale(),
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
          WaveSystem.BOMB_ENEMY_SPEED * speedScale,
          0x800080, // fillColor
          0xff00ff, // strokeColor
          8, // depth
          scaledHealth,
          0, // trainContactDamage
          0, // trainContactCooldownMs
          Math.ceil(10 * cycleScale), // explosionDamage
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
          WaveSystem.CHUNKY_ENEMY_SPEED * speedScale,
          0x8b4513, // fillColor
          0xd2691e, // strokeColor
          8, // depth
          scaledHealth * 2,
          Math.ceil(22 * cycleScale), // trainContactDamage
          500, // trainContactCooldownMs
        );
        break;
      }
      case 'long_range': {
        enemy = new LongRangeEnemy(
          this.scene,
          this.train,
          this.getPlayerWorld,
          x,
          y,
          commonRadius * 0.95,
          WaveSystem.LONG_RANGE_ENEMY_SPEED * speedScale,
          0xffffff,
          0xffffff,
          8,
          scaledHealth,
          (shot) => this.enqueueEnemyProjectile(shot),
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
    return 1;
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
    if (this.spawningPaused) {
      return;
    }
    // Spawn pending enemies gradually with alive cap
    this.spawnAcc += deltaMs;
    while (
      this.pendingEnemies.length > 0 &&
      this.spawnAcc >= this.getCurrentSpawnIntervalMs() &&
      this.getTotalAliveEnemies() < this.maxAliveAtOnce
    ) {
      this.spawnAcc -= this.getCurrentSpawnIntervalMs();
      const pending = this.pendingEnemies.shift()!;
      const { type, health } = this.resolveSpawnTypeAndHealth(pending.type, pending.health);
      this.spawnEnemy(type, this.adjustHealthForNight(health));
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
      this.spawnAcc >= this.getCurrentSpawnIntervalMs() &&
      this.getTotalAliveEnemies() < this.maxAliveAtOnce
    ) {
      this.spawnAcc -= this.getCurrentSpawnIntervalMs();
      const respawning = this.respawnQueue.shift()!;
      const { type, health } = this.resolveSpawnTypeAndHealth(respawning.type, respawning.health);
      this.spawnEnemy(type, this.adjustHealthForNight(health));
    }

    // Endless mode: always enqueue new enemies when pool is exhausted.
    const aliveCount = this.getTotalAliveEnemies();
    const pendingCount = this.getTotalRemainingToSpawn();
    if (aliveCount === 0 && pendingCount === 0) {
      this.enqueueNextEndlessBatch();
    }
  }

  /**
   * Determine enemy type by checking instance
   */
  private getEnemyType(enemy: Enemy): EnemyType {
    if (enemy instanceof LongRangeEnemy) return 'long_range';
    if (enemy instanceof BasicEnemy) return 'basic';
    if (enemy instanceof BombEnemy) return 'bomb';
    if (enemy instanceof ChunkyEnemy) return 'chunky';
    return 'basic'; // Default fallback
  }

  updateEnemyProjectiles(
    deltaMs: number,
    hulls: Array<{ x: number; y: number; width: number; height: number }>,
    onTrainDamaged?: () => void,
  ): void {
    let i = 0;
    while (i < this.enemyProjectiles.length) {
      const p = this.enemyProjectiles[i]!;
      const dt = deltaMs / 1000;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.gfx.setPosition(p.x, p.y);
      p.ttlMs -= deltaMs;

      let hit = false;
      for (const h of hulls) {
        if (
          circleIntersectsCenteredRect(
            p.x,
            p.y,
            p.radius,
            h.x,
            h.y,
            h.width,
            h.height,
          )
        ) {
          this.train.takeDamage(p.damage);
          onTrainDamaged?.();
          hit = true;
          break;
        }
      }

      if (hit || p.ttlMs <= 0) {
        p.gfx.destroy();
        this.enemyProjectiles.splice(i, 1);
      } else {
        i++;
      }
    }
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
          e.playDeathFade((x, y) => this.callbacks.onEnemyDestroyed?.(x, y, type), () => {
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

  tryHitEnemiesInRadius(x: number, y: number, radius: number, damage: number): number {
    const rSq = radius * radius;
    let hits = 0;
    for (let i = this.waveEnemies.length - 1; i >= 0; i--) {
      const e = this.waveEnemies[i];
      if (!e || !e.isAlive()) continue;
      const pos = e.getPosition();
      const dx = pos.x - x;
      const dy = pos.y - y;
      if (dx * dx + dy * dy > rSq) continue;
      hits += 1;
      const wasDestroyed = e.takeDamage(damage);
      if (!wasDestroyed) continue;
      const type = this.getEnemyType(e);
      e.playDeathFade((ex, ey) => this.callbacks.onEnemyDestroyed?.(ex, ey, type), () => {
        this.enemyPools[type].push(e);
      });
      this.waveEnemies.splice(i, 1);
    }
    return hits;
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
    for (let i = this.waveEnemies.length - 1; i >= 0; i--) {
      const e = this.waveEnemies[i];
      if (!e || !e.isAlive()) continue;
      const didDamage = e.handleTrainCollision(hulls, onTrainDamaged);
      if (!didDamage) continue;
      const type = this.getEnemyType(e);
      const pos = e.getPosition();
      playBombTrainExplosionFx(this.scene, pos.x, pos.y, { depth: 25, displayWidth: 120 });
      e.deactivateForPool();
      this.enemyPools[type].push(e);
      this.callbacks.onEnemyDestroyed?.(pos.x, pos.y, type);
      this.waveEnemies.splice(i, 1);
    }
  }

  /**
   * Update all enemies
   */
  updateEnemies(deltaMs: number): void {
    for (const e of this.waveEnemies) {
      if (e.isAlive()) {
        const pos = e.getPosition();
        let stackedSlow = 0;
        for (const field of this.slowFields) {
          const dx = pos.x - field.x;
          const dy = pos.y - field.y;
          if (dx * dx + dy * dy <= field.radius * field.radius) {
            stackedSlow += field.slowFactor;
          }
        }
        e.setExternalSpeedMultiplier(1 - Phaser.Math.Clamp(stackedSlow, 0, 0.5));
        e.update(deltaMs);
        e.syncSpriteFacingForGameplayCamera();
      }
    }
  }

  constrainEnemiesToBlockers(
    blockers: Array<{ x: number; y: number; width: number; height: number }>,
  ): void {
    if (blockers.length === 0) return;
    for (const e of this.waveEnemies) {
      if (e.isAlive()) {
        e.constrainAgainstRects(blockers);
      }
    }
  }

  addEnemyWorldOffset(dx: number, dy: number): void {
    for (const e of this.waveEnemies) {
      if (e.isAlive()) {
        e.addWorldOffset(dx, dy);
      }
    }
    for (const p of this.enemyProjectiles) {
      p.x += dx;
      p.y += dy;
      p.gfx.setPosition(p.x, p.y);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    for (const e of this.waveEnemies) {
      e.destroy();
    }
    for (const p of this.enemyProjectiles) {
      p.gfx.destroy();
    }
    this.enemyProjectiles.length = 0;
    for (const type of ['basic', 'bomb', 'chunky', 'long_range'] as const) {
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
