import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';
import { Enemy } from './Enemy';
import { BasicEnemy } from './BasicEnemy';
import { BombEnemy } from './BombEnemy';
import { ChunkyEnemy } from './ChunkyEnemy';

export type EnemySwarmOptions = {
  spawnIntervalMs: number;
  speed: number;
  radius: number;
  maxEnemies: number;
  spawnRadiusMin: number;
  spawnRadiusMax: number;
  fillColor: number;
  strokeColor: number;
  depth: number;
  maxHealth: number;
  trainContactDamage: number;
  trainContactCooldownMs: number;
  playerRadius: number;
  onPlayerCollide?: () => void;
  onTrainDamagedByEnemy?: () => void;
  onEnemyDestroyed?: (x: number, y: number) => void;
  // New: variant spawning
  enableVariants?: boolean;
};

/**
 * Manages a swarm of enemies. Currently spawns BasicEnemy instances.
 * Can be extended to spawn different enemy types.
 */
export class EnemySwarm {
  private readonly scene: Phaser.Scene;
  private readonly train: TrainController;
  private readonly getPlayerWorld: () => { x: number; y: number };
  private readonly opts: EnemySwarmOptions;
  readonly enemies: Enemy[] = [];
  private spawnAcc = 0;

  constructor(
    scene: Phaser.Scene,
    train: TrainController,
    getPlayerWorld: () => { x: number; y: number },
    opts: EnemySwarmOptions,
  ) {
    this.scene = scene;
    this.train = train;
    this.getPlayerWorld = getPlayerWorld;
    this.opts = opts;
  }

  findClosestLivingEnemyTo(
    wx: number,
    wy: number,
  ): { x: number; y: number } | null {
    let best: { x: number; y: number; d: number } | null = null;
    for (const e of this.enemies) {
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

  tryHitEnemyWithBullet(
    bx: number,
    by: number,
    bulletRadius: number,
    bulletDamage: number = 1,
  ): boolean {
    let i = 0;
    while (i < this.enemies.length) {
      const e = this.enemies[i];
      if (e && e.isAlive() && e.canBeHitByBullet(bx, by, bulletRadius)) {
        const wasDestroyed = e.takeDamage(bulletDamage);
        if (wasDestroyed) {
          e.destroy(this.opts.onEnemyDestroyed);
          this.enemies.splice(i, 1);
        }
        return true;
      }
      i++;
    }
    return false;
  }

  update(deltaMs: number): void {
    const o = this.opts;
    this.spawnAcc += deltaMs;
    if (
      this.enemies.length < o.maxEnemies &&
      this.spawnAcc >= o.spawnIntervalMs
    ) {
      this.spawnAcc = 0;
      this.spawnOne();
    }

    const hulls = this.train.getHullRects();

    // Update living enemies and remove dead ones
    let i = 0;
    while (i < this.enemies.length) {
      const e = this.enemies[i];
      if (e && e.isAlive()) {
        e.update(deltaMs);
        e.handleTrainCollision(hulls, o.onTrainDamagedByEnemy);
        i++;
      } else {
        // Remove dead enemies
        this.enemies.splice(i, 1);
      }
    }

    // TODO: Re-enable player collision when implementing player mechanics
    // this.checkPlayerCollision();
  }

  // TODO: Re-enable when implementing player mechanics
  // private checkPlayerCollision(): void {
  //   const cb = this.opts.onPlayerCollide;
  //   if (!cb) return;

  //   const { x: px, y: py } = this.getPlayerWorld();
  //   const pr = this.opts.playerRadius;

  //   for (const e of this.enemies) {
  //     if (!e.isAlive()) continue;
  //     if (e.checkPlayerCollision(px, py, pr)) {
  //       cb();
  //       return;
  //     }
  //   }
  // }

  private spawnOne(): void {
    const o = this.opts;
    const cx = this.train.body.x;
    const cy = this.train.body.y;
    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist = Phaser.Math.FloatBetween(o.spawnRadiusMin, o.spawnRadiusMax);
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist;

    // Choose enemy variant
    let enemyConfig: {
      radius: number;
      maxHealth: number;
      fillColor: number;
      strokeColor: number;
      trainContactDamage: number;
    };
    let enemyType: 'basic' | 'bomb' | 'chunky' = 'basic';

    if (o.enableVariants) {
      // Randomly choose variant (0 = normal, 1 = tough, 2 = bomb, 3 = chunky)
      const variant = Phaser.Math.Between(0, 3);
      if (variant === 0) {
        // Normal enemy (health 50, red)
        enemyConfig = {
          radius: o.radius,
          maxHealth: 50,
          fillColor: o.fillColor,
          strokeColor: o.strokeColor,
          trainContactDamage: o.trainContactDamage,
        };
        enemyType = 'basic';
      } else if (variant === 1) {
        // Tough enemy (health 100, orange, bigger, more damage)
        enemyConfig = {
          radius: o.radius * 1.2, // 20% bigger
          maxHealth: 100,
          fillColor: 0xffa500, // Orange
          strokeColor: 0xffd700, // Gold stroke
          trainContactDamage: 30,
        };
        enemyType = 'basic';
      } else if (variant === 2) {
        // Bomb enemy (health 30, purple, explodes for 100 damage)
        enemyConfig = {
          radius: o.radius * 0.8, // Smaller
          maxHealth: 30,
          fillColor: 0x800080, // Purple
          strokeColor: 0xff00ff, // Magenta stroke
          trainContactDamage: 0, // No contact damage
        };
        enemyType = 'bomb';
      } else {
        // Chunky enemy (health 300, brown, very big, slow)
        enemyConfig = {
          radius: o.radius * 1.5, // 50% bigger
          maxHealth: 300,
          fillColor: 0x8b4513, // Brown
          strokeColor: 0xd2691e, // Chocolate stroke
          trainContactDamage: 20,
        };
        enemyType = 'chunky';
      }
    } else {
      // Default enemy
      enemyConfig = {
        radius: o.radius,
        maxHealth: o.maxHealth,
        fillColor: o.fillColor,
        strokeColor: o.strokeColor,
        trainContactDamage: o.trainContactDamage,
      };
      enemyType = 'basic';
    }

    let enemy: Enemy;
    if (enemyType === 'bomb') {
      enemy = new BombEnemy(
        this.scene,
        this.train,
        this.getPlayerWorld,
        x,
        y,
        enemyConfig.radius,
        o.speed,
        enemyConfig.fillColor,
        enemyConfig.strokeColor,
        o.depth,
        enemyConfig.maxHealth,
        enemyConfig.trainContactDamage,
        o.trainContactCooldownMs,
        100, // Explosion damage
        enemyConfig.radius * 2, // Explosion radius
      );
    } else if (enemyType === 'chunky') {
      enemy = new ChunkyEnemy(
        this.scene,
        this.train,
        this.getPlayerWorld,
        x,
        y,
        enemyConfig.radius,
        o.speed * 0.5, // 50% slower than normal
        enemyConfig.fillColor,
        enemyConfig.strokeColor,
        o.depth,
        enemyConfig.maxHealth,
        enemyConfig.trainContactDamage,
        o.trainContactCooldownMs,
      );
    } else {
      enemy = new BasicEnemy(
        this.scene,
        this.train,
        this.getPlayerWorld,
        x,
        y,
        enemyConfig.radius,
        o.speed,
        enemyConfig.fillColor,
        enemyConfig.strokeColor,
        o.depth,
        enemyConfig.maxHealth,
        enemyConfig.trainContactDamage,
        o.trainContactCooldownMs,
      );
    }

    this.enemies.push(enemy);
  }

  destroy(): void {
    for (const e of this.enemies) {
      e.destroy();
    }
    this.enemies.length = 0;
  }
}
