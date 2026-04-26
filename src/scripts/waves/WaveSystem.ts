import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';
import { BasicEnemy } from '../enemy/BasicEnemy';
import { BombEnemy } from '../enemy/BombEnemy';
import { ChunkyEnemy } from '../enemy/ChunkyEnemy';
import type { Enemy } from '../enemy/Enemy';
import { circleIntersectsCenteredRect } from '../enemy/circleRectIntersect';
import { LongRangeEnemy } from '../enemy/LongRangeEnemy';
import type { EnemyProjectileSpawn } from '../enemy/LongRangeEnemy';
import { playExplosionSfx } from '../audio/gameSfx';
import { playBombTrainExplosionFx, playCollision02ExplosionFx } from '../vfx/CollisionImpactVfx';
import { getWaveConfig, type EnemyType } from './WaveConfiguration';
import { rollEnemySpawnColors } from '../enemy/enemySpawnTint';
import { MAIN_CAMERA_SHAKE_ON_TRAIN_HIT } from '../game/gameConfig';

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
  /** Chunky / long_range bypass player-level gates (idle-penalty spawns + their respawns). */
  ignoreLevelGate?: boolean;
}

export type WaveSystemState = 'spawning' | 'active' | 'completed' | 'between_waves';

export interface WaveSystemCallback {
  onWaveStarted?: (waveNumber: number, totalEnemies: number) => void;
  onWaveCompleted?: (waveNumber: number) => void;
  onEnemyDestroyed?: (
    x: number,
    y: number,
    type: EnemyType,
    source?: { trainRam?: boolean },
  ) => void;
  onEnemyDespawned?: () => void;
  /** Fired at the start of each endless batch (1-based index). */
  onEndlessBatchEnqueued?: (batchIndex: number) => void;
}

export class WaveSystem {
  private static readonly BASIC_ENEMY_SPEED = 72;
  private static readonly BOMB_ENEMY_SPEED = 76;
  private static readonly CHUNKY_ENEMY_SPEED = 62 * 0.5;
  private static readonly LONG_RANGE_ENEMY_SPEED = 72;
  private static readonly ENEMY_PROJECTILE_TTL_MS = 9000;
  /**
   * Chunky enemies spawn only at or above this player level; below that, queued chunkies become bombs.
   * (Must match WaveConfiguration comment / design.)
   */
  private static readonly CHUNKY_MIN_PLAYER_LEVEL = 3;
  /** Long-range: below this level, queued long_range spawn as bombs instead. */
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
  /** Extra spawn pressure when the train barely moved between endless batches (MainScene-driven). */
  private trainIdleStacks = 0;

  // Config
  private enemySpawnInterval: number = 200; // ms between spawning each enemy
  private readonly maxAliveAtOnce = 13;
  private nightIntensity = 0;
  private slowFields: Array<{ x: number; y: number; radius: number; slowFactor: number }> = [];
  private spawningPaused = false;
  private nextTrainImpactShakeAt = 0;

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

  /** Camera feedback whenever the train loses HP to enemies (contact or long-range shells). */
  private shakeOnTrainImpact(): void {
    const now = this.scene.time.now;
    if (now < this.nextTrainImpactShakeAt) return;
    this.nextTrainImpactShakeAt = now + 65;
    const s = MAIN_CAMERA_SHAKE_ON_TRAIN_HIT;
    this.scene.cameras.main.shake(s.durationMs, s.intensity, true);
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
    const stacksBefore = this.trainIdleStacks;
    this.callbacks.onEndlessBatchEnqueued?.(this.spawnCycle);
    const virtualWave = 1 + Math.floor(this.spawnCycle / 2);
    const waveConfig = getWaveConfig(virtualWave, this.difficultyMultiplier);
    this.enemySpawnInterval = waveConfig.spawnIntervalMs;
    const idleCountMul = 1 + this.trainIdleStacks * 0.18;
    const idleHealthMul = 1 + this.trainIdleStacks * 0.08;
    let added = 0;
    for (const spec of waveConfig.baseEnemies) {
      const count = Math.max(1, Math.ceil(spec.count * idleCountMul));
      added += count;
      for (let i = 0; i < count; i++) {
        this.pendingEnemies.push({
          type: spec.type,
          health: Math.ceil(this.getMaxHealthForType(spec.type) * idleHealthMul),
          spawnTime: 0,
        });
      }
    }
    const penaltyApplied = this.trainIdleStacks > stacksBefore;
    if (penaltyApplied) {
      const extras = this.buildIdleThreatPending(idleHealthMul);
      for (const p of extras) {
        this.pendingEnemies.push(p);
      }
      added += extras.length;
    }
    this.totalEnemiesForWave += added;
  }

  /** Extra chunky + long-range spawns when the train-idle penalty fires (ignores player level). */
  private buildIdleThreatPending(idleHealthMul: number): PendingEnemy[] {
    const hChunk = Math.ceil(this.getMaxHealthForType('chunky') * idleHealthMul);
    const hLr = Math.ceil(this.getMaxHealthForType('long_range') * idleHealthMul);
    return [
      { type: 'chunky', health: hChunk, spawnTime: 0, ignoreLevelGate: true },
      { type: 'long_range', health: hLr, spawnTime: 0, ignoreLevelGate: true },
      { type: 'long_range', health: hLr, spawnTime: 0, ignoreLevelGate: true },
    ];
  }

  /** Call when the player rode the train but barely advanced the world before the next endless batch. */
  applyTrainIdlePressure(): void {
    this.trainIdleStacks = Math.min(6, this.trainIdleStacks + 1);
  }

  decayTrainIdlePressure(): void {
    this.trainIdleStacks = Math.max(0, this.trainIdleStacks - 1);
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
    // Night spawns faster; train-idle pressure spawns faster.
    const night = 1 - this.nightIntensity * 0.18;
    const idleFast = 1 / (1 + this.trainIdleStacks * 0.12);
    return Math.max(120, this.enemySpawnInterval * night * idleFast);
  }

  private adjustHealthForNight(baseHealth: number): number {
    // Night enemies are tougher.
    return Math.ceil(baseHealth * (1 + this.nightIntensity * 0.18));
  }

  /**
   * Basic enemies accelerate as endless waves progress (spawnCycle ticks up each batch).
   */
  private getBasicEnemySpeedScale(): number {
    return 1 + Math.min(0.8, this.spawnCycle * 0.03);
  }

  /**
   * Get max health for enemy type
   */
  private resolveSpawnTypeAndHealth(
    type: EnemyType,
    health: number,
    ignoreLevelGate = false,
  ): { type: EnemyType; health: number } {
    if (type === 'basic') {
      return {
        type: 'bomb',
        health: this.getMaxHealthForType('bomb'),
      };
    }
    const level = this.getPlayerLevel();
    if (
      type === 'chunky' &&
      level < WaveSystem.CHUNKY_MIN_PLAYER_LEVEL &&
      !ignoreLevelGate
    ) {
      return {
        type: 'bomb',
        health: this.getMaxHealthForType('bomb'),
      };
    }
    if (
      type === 'long_range' &&
      level < WaveSystem.LONG_RANGE_MIN_PLAYER_LEVEL &&
      !ignoreLevelGate
    ) {
      return {
        type: 'bomb',
        health: this.getMaxHealthForType('bomb'),
      };
    }
    return { type, health };
  }

  private ignoreLevelGateForRespawnType(type: EnemyType): boolean {
    const level = this.getPlayerLevel();
    return (
      (type === 'chunky' && level < WaveSystem.CHUNKY_MIN_PLAYER_LEVEL) ||
      (type === 'long_range' && level < WaveSystem.LONG_RANGE_MIN_PLAYER_LEVEL)
    );
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
    const { body, stroke } = rollEnemySpawnColors(type);
    const pooled = this.enemyPools[type].pop();
    if (pooled) {
      pooled.resetForSpawn(x, y, health, body, stroke);
      this.waveEnemies.push(pooled);
      return pooled;
    }

    let enemy: Enemy;
    const commonRadius = 9;
    const cycleScale = 1 + this.spawnCycle * 0.015;
    const speedScale = 1 + this.spawnCycle * 0.01;
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
          (bx, by) =>
            this.callbacks.onEnemyDestroyed?.(bx, by, 'bomb', { trainRam: true }),
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

    enemy.applySpawnTint(body, stroke);
    this.waveEnemies.push(enemy);
    return enemy;
  }

  private getSpawnPointAroundScreen(): { x: number; y: number } {
    const cam = this.scene.cameras.main.worldView;
    const cx = cam.centerX;
    const cy = cam.centerY;
    const maxDim = Math.max(cam.width, cam.height);
    // Spawn outside a "triple-zoom-out" envelope and outside current camera.
    const spawnRadiusMin = maxDim * 1.7;
    const spawnRadiusMax = maxDim * 2.35;
    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const r = Phaser.Math.FloatBetween(spawnRadiusMin, spawnRadiusMax);
    return {
      x: cx + Math.cos(ang) * r,
      y: cy + Math.sin(ang) * r,
    };
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
    // Keep a large leash so far-spawned enemies can walk into view before recycling.
    const margin = Math.max(
      900,
      Math.max(this.scene.cameras.main.worldView.width, this.scene.cameras.main.worldView.height) *
        1.6,
    );
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
      const { type, health } = this.resolveSpawnTypeAndHealth(
        pending.type,
        pending.health,
        pending.ignoreLevelGate ?? false,
      );
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
          const t = this.getEnemyType(e);
          this.respawnQueue.push({
            type: t,
            health: e.getCurrentHealth(),
            spawnTime: 0,
            ignoreLevelGate: this.ignoreLevelGateForRespawnType(t),
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
      const { type, health } = this.resolveSpawnTypeAndHealth(
        respawning.type,
        respawning.health,
        respawning.ignoreLevelGate ?? false,
      );
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
          this.shakeOnTrainImpact();
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
   * Closest living enemy for turret aim, with velocity for lead and a fresh hit position at fire time.
   * `extraVelY` is world drift from train scroll (px/s), applied on top of `getAimVelocity()`.
   */
  findClosestLivingEnemyTarget(
    wx: number,
    wy: number,
    extraVelY: number,
    ignoreTypes?: readonly EnemyType[],
  ): {
    x: number;
    y: number;
    vx: number;
    vy: number;
    getHitPosition: () => { x: number; y: number };
  } | null {
    let best: {
      e: Enemy;
      x: number;
      y: number;
      d: number;
    } | null = null;
    for (const e of this.waveEnemies) {
      if (!e.isAlive()) continue;
      const type = this.getEnemyType(e);
      if (ignoreTypes?.includes(type)) continue;
      const pos = e.getPosition();
      const dx = pos.x - wx;
      const dy = pos.y - wy;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) {
        best = { e, x: pos.x, y: pos.y, d };
      }
    }
    if (!best) return null;
    const enemy = best.e;
    const v = enemy.getAimVelocity();
    return {
      x: best.x,
      y: best.y,
      vx: v.vx,
      vy: v.vy + extraVelY,
      getHitPosition: () => enemy.getPosition(),
    };
  }

  /** Living enemies whose position lies inside the circle (for dome coal drain, etc.). */
  countEnemiesInRadius(wx: number, wy: number, radius: number): number {
    const rSq = radius * radius;
    let n = 0;
    for (const e of this.waveEnemies) {
      if (!e?.isAlive()) continue;
      const pos = e.getPosition();
      const dx = pos.x - wx;
      const dy = pos.y - wy;
      if (dx * dx + dy * dy <= rSq) {
        n += 1;
      }
    }
    return n;
  }

  /**
   * Find closest living enemy
   */
  findClosestLivingEnemyTo(wx: number, wy: number): { x: number; y: number } | null {
    const t = this.findClosestLivingEnemyTarget(wx, wy, 0);
    return t ? { x: t.x, y: t.y } : null;
  }

  /**
   * Handle train collision for all enemies
   */
  updateCollisions(
    hulls: Array<{ x: number; y: number; width: number; height: number }>,
    onTrainDamaged?: () => void,
  ): void {
    const onHit = () => {
      this.shakeOnTrainImpact();
      onTrainDamaged?.();
    };
    for (let i = this.waveEnemies.length - 1; i >= 0; i--) {
      const e = this.waveEnemies[i];
      if (!e || !e.isAlive()) continue;
      const didDamage = e.handleTrainCollision(hulls, onHit);
      if (!didDamage) continue;
      const type = this.getEnemyType(e);
      const pos = e.getPosition();
      playExplosionSfx(this.scene);
      playBombTrainExplosionFx(this.scene, pos.x, pos.y, { depth: 25, displayWidth: 120 });
      e.deactivateForPool();
      this.enemyPools[type].push(e);
      this.callbacks.onEnemyDestroyed?.(pos.x, pos.y, type, { trainRam: true });
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
   * Game over: living enemies currently in view pop with Collision 02 (no loot / callbacks).
   */
  explodeLivingEnemiesOnCameraWithCollision02(): void {
    const cam = this.scene.cameras.main.worldView;
    const margin = 56;
    const hits: Array<{ enemy: Enemy; x: number; y: number }> = [];
    for (const e of this.waveEnemies) {
      if (!e?.isAlive()) continue;
      const pos = e.getPosition();
      if (
        pos.x < cam.x - margin ||
        pos.x > cam.x + cam.width + margin ||
        pos.y < cam.y - margin ||
        pos.y > cam.y + cam.height + margin
      ) {
        continue;
      }
      hits.push({ enemy: e, x: pos.x, y: pos.y });
    }
    hits.forEach((h, i) => {
      this.scene.time.delayedCall(i * 55, () => {
        playCollision02ExplosionFx(this.scene, h.x, h.y, {
          depth: 54,
          displayWidth: Phaser.Math.Between(118, 168),
          msPerFrame: 40,
        });
      });
      const idx = this.waveEnemies.indexOf(h.enemy);
      if (idx >= 0) {
        this.recycleEnemy(h.enemy);
        this.waveEnemies.splice(idx, 1);
      }
    });
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
