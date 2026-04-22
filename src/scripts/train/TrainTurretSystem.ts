import * as Phaser from 'phaser';
import type { TrainController } from './TrainController';

export type WeaponType = 'cannon' | 'sniper' | 'scatter' | 'bomb';

type EnemyTargetingSystem = {
  findClosestLivingEnemyTo(wx: number, wy: number): { x: number; y: number } | null;
  tryHitEnemyWithBullet(
    bx: number,
    by: number,
    bulletRadius: number,
    bulletDamage?: number,
  ): boolean;
};

type Bullet = {
  graphic: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  lifeMs: number;
  damage: number;
  radius: number;
};

type WeaponSlot = {
  type: WeaponType;
  level: number;
};

/**
 * One gun per turret mount on engine + carriages. Guns render above hulls; barrel points at target (horizontal sprite + rotation).
 */
export class TrainTurretSystem {
  private readonly scene: Phaser.Scene;
  private guns: Phaser.GameObjects.Rectangle[] = [];
  private readonly fireAcc: number[] = [];
  private readonly bullets: Bullet[] = [];
  private readonly fireIntervalMs: number;
  private readonly bulletSpeed: number;
  private readonly bulletRadius: number;
  private readonly bulletLifeMs: number;
  private readonly bulletColor: number;
  private readonly gunLength: number;
  private readonly gunThickness: number;
  private readonly depth: number;
  private readonly firingRange: number;
  private readonly slotWeapons: Array<WeaponSlot | null> = [];
  private damageMultiplier = 1;
  private rangeMultiplier = 1;
  private attackSpeedMultiplier = 1;
  private rotationSpeedMultiplier = 1;
  private readonly baseRotationSpeedRadPerSec = Phaser.Math.DegToRad(220);

  constructor(
    scene: Phaser.Scene,
    options: {
      fireIntervalMs: number;
      bulletSpeed: number;
      bulletRadius: number;
      bulletLifeMs: number;
      bulletColor: number;
      gunLength: number;
      gunThickness: number;
      depth: number;
      firingRange?: number;
    },
  ) {
    this.scene = scene;
    this.fireIntervalMs = options.fireIntervalMs;
    this.bulletSpeed = options.bulletSpeed;
    this.bulletRadius = options.bulletRadius;
    this.bulletLifeMs = options.bulletLifeMs;
    this.bulletColor = options.bulletColor;
    this.gunLength = options.gunLength;
    this.gunThickness = options.gunThickness;
    this.depth = options.depth;
    this.firingRange = options.firingRange ?? 500; // Default 500 pixel range
  }

  rebuildFromTrain(train: TrainController): void {
    const previous = [...this.slotWeapons];
    for (const g of this.guns) {
      g.destroy();
    }
    this.guns = [];
    this.fireAcc.length = 0;
    for (const b of this.bullets) {
      b.graphic.destroy();
    }
    this.bullets.length = 0;

    const mounts = train.getTurretWorldPositions();
    this.slotWeapons.length = mounts.length;
    for (let i = 0; i < mounts.length; i++) {
      const m = mounts[i]!;
      this.slotWeapons[i] =
        previous[i] ?? (i < 2 ? { type: 'cannon', level: 1 } : null);
      const gun = this.scene.add.rectangle(
        m.x,
        m.y,
        this.gunLength,
        this.gunThickness,
        0x6e7681,
        1,
      );
      gun.setStrokeStyle(2, 0xc9d1d9);
      gun.setOrigin(0.2, 0.5);
      gun.setDepth(this.depth);
      this.applyGunStyle(gun, this.slotWeapons[i] ?? null);
      this.guns.push(gun);
      this.fireAcc.push(0);
    }
  }

  private getWeaponStats(slot: WeaponSlot) {
    const levelScale = 1 + (slot.level - 1) * 0.14;
    switch (slot.type) {
      case 'cannon':
        return {
          color: 0xc9d1d9,
          interval: this.fireIntervalMs / (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: this.bulletSpeed,
          bulletLifeMs: this.bulletLifeMs,
          range: this.firingRange * this.rangeMultiplier,
          damage: 30 * levelScale * this.damageMultiplier,
          pellets: 1,
          spreadRad: 0,
          radiusScale: 1,
        };
      case 'sniper':
        return {
          color: 0x8bd5ff,
          interval:
            (this.fireIntervalMs * 1.45) /
            (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: this.bulletSpeed * 1.55,
          bulletLifeMs: this.bulletLifeMs * 1.5,
          range: this.firingRange * 1.55 * this.rangeMultiplier,
          damage: 55 * levelScale * this.damageMultiplier,
          pellets: 1,
          spreadRad: 0,
          radiusScale: 1,
        };
      case 'scatter':
        return {
          color: 0xffc266,
          interval:
            (this.fireIntervalMs * 0.92) /
            (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: this.bulletSpeed * 0.9,
          bulletLifeMs: this.bulletLifeMs * 0.72,
          range: this.firingRange * 0.8 * this.rangeMultiplier,
          damage: 14 * levelScale * this.damageMultiplier,
          pellets: 3,
          spreadRad: Phaser.Math.DegToRad(10),
          radiusScale: 1,
        };
      case 'bomb':
        return {
          color: 0xff6b4a,
          interval: (this.fireIntervalMs * 1.8) / (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: this.bulletSpeed * 0.66,
          bulletLifeMs: this.bulletLifeMs * 1.35,
          range: this.firingRange * 1.1 * this.rangeMultiplier,
          damage: 90 * levelScale * this.damageMultiplier,
          pellets: 1,
          spreadRad: 0,
          radiusScale: 1.8,
        };
    }
  }

  private applyGunStyle(
    gun: Phaser.GameObjects.Rectangle,
    slot: WeaponSlot | null,
  ): void {
    if (!slot) {
      gun.setFillStyle(0x4a4f57, 0.65);
      gun.setStrokeStyle(1, 0x707680, 0.7);
      return;
    }
    const stats = this.getWeaponStats(slot);
    gun.setFillStyle(0x6e7681, 1);
    gun.setStrokeStyle(2, stats.color, 1);
    gun.setScale(1 + (slot.level - 1) * 0.04, 1 + (slot.level - 1) * 0.04);
  }

  hasFreeSlot(): boolean {
    return this.slotWeapons.some((s) => s === null);
  }

  hasWeaponType(type: WeaponType): boolean {
    return this.slotWeapons.some((s) => s?.type === type);
  }

  getClosestEmptySlotIndex(wx: number, wy: number, train: TrainController): number | null {
    const mounts = train.getTurretWorldPositions();
    let best: { idx: number; d: number } | null = null;
    for (let i = 0; i < mounts.length; i++) {
      if (this.slotWeapons[i] !== null) continue;
      const m = mounts[i];
      if (!m) continue;
      const dx = m.x - wx;
      const dy = m.y - wy;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) {
        best = { idx: i, d };
      }
    }
    return best ? best.idx : null;
  }

  placeWeaponAtSlot(index: number, type: WeaponType): boolean {
    if (!this.guns[index] || this.slotWeapons[index] !== null) return false;
    this.slotWeapons[index] = { type, level: 1 };
    this.applyGunStyle(this.guns[index]!, this.slotWeapons[index]);
    return true;
  }

  upgradeMatchingWeapon(type: WeaponType): boolean {
    for (let i = 0; i < this.slotWeapons.length; i++) {
      const slot = this.slotWeapons[i];
      if (slot?.type !== type) continue;
      slot.level += 1;
      const gun = this.guns[i];
      if (gun) {
        this.applyGunStyle(gun, slot);
      }
      return true;
    }
    return false;
  }

  addDamageMultiplier(amount: number): void {
    if (amount <= 0) return;
    this.damageMultiplier += amount;
  }

  addRangeMultiplier(amount: number): void {
    if (amount <= 0) return;
    this.rangeMultiplier += amount;
  }

  addAttackSpeedMultiplier(amount: number): void {
    if (amount <= 0) return;
    this.attackSpeedMultiplier += amount;
  }

  addRotationSpeedMultiplier(amount: number): void {
    if (amount <= 0) return;
    this.rotationSpeedMultiplier += amount;
  }

  update(
    deltaMs: number,
    train: TrainController,
    enemies: EnemyTargetingSystem,
    canFire: boolean,
  ): number {
    let shotsFired = 0;
    const mounts = train.getTurretWorldPositions();
    if (mounts.length !== this.guns.length) {
      this.rebuildFromTrain(train);
    }

    // Get camera bounds
    const cam = this.scene.cameras.main;
    const camX = cam.worldView.x;
    const camY = cam.worldView.y;
    const camW = cam.worldView.width;
    const camH = cam.worldView.height;

    for (let i = 0; i < this.guns.length; i++) {
      const gun = this.guns[i];
      const m = mounts[i];
      const slot = this.slotWeapons[i];
      if (!gun || !m || !slot) continue;
      gun.setPosition(m.x, m.y);

      const target = enemies.findClosestLivingEnemyTo(m.x, m.y);
      if (!target) {
        continue;
      }

      const dx = target.x - m.x;
      const dy = target.y - m.y;
      const distance = Math.hypot(dx, dy);

      const ang = Math.atan2(dy, dx);
      const maxStep =
        this.baseRotationSpeedRadPerSec * this.rotationSpeedMultiplier * (deltaMs / 1000);
      gun.setRotation(Phaser.Math.Angle.RotateTo(gun.rotation, ang, maxStep));

      if (!canFire) {
        continue;
      }

      const stats = this.getWeaponStats(slot);

      // Only fire if target is within range AND on screen
      if (distance > stats.range) {
        continue;
      }

      // Check if target is within camera bounds
      if (target.x < camX || target.x > camX + camW || target.y < camY || target.y > camY + camH) {
        continue;
      }

      this.fireAcc[i] = (this.fireAcc[i] ?? 0) + deltaMs;
      if ((this.fireAcc[i] ?? 0) < stats.interval) continue;
      this.fireAcc[i] = 0;

      const tipDist = this.gunLength * 0.85;
      const tipX = m.x + Math.cos(ang) * tipDist;
      const tipY = m.y + Math.sin(ang) * tipDist;
      const pellets = Math.max(1, stats.pellets);
      for (let p = 0; p < pellets; p++) {
        const t = pellets <= 1 ? 0 : p / (pellets - 1);
        const spread = (t - 0.5) * 2 * stats.spreadRad;
        const shotAng = ang + spread;
        const vx = Math.cos(shotAng) * stats.bulletSpeed;
        const vy = Math.sin(shotAng) * stats.bulletSpeed;
        const g = this.scene.add.circle(
          tipX,
          tipY,
          this.bulletRadius * stats.radiusScale,
          stats.color ?? this.bulletColor,
          1,
        );
        g.setDepth(this.depth + 1);
        this.bullets.push({
          graphic: g,
          vx,
          vy,
          lifeMs: stats.bulletLifeMs,
          damage: stats.damage,
          radius: this.bulletRadius * stats.radiusScale,
        });
        shotsFired += 1;
      }
    }

    this.updateBullets(deltaMs, enemies);
    return shotsFired;
  }

  private updateBullets(deltaMs: number, enemies: EnemyTargetingSystem): void {
    const dt = deltaMs / 1000;
    const cam = this.scene.cameras.main;
    const camX = cam.worldView.x;
    const camY = cam.worldView.y;
    const camW = cam.worldView.width;
    const camH = cam.worldView.height;
    
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b) continue;
      b.lifeMs -= deltaMs;
      if (b.lifeMs <= 0) {
        b.graphic.destroy();
        this.bullets.splice(i, 1);
        continue;
      }
      const nx = b.graphic.x + b.vx * dt;
      const ny = b.graphic.y + b.vy * dt;
      b.graphic.setPosition(nx, ny);

      // Only hit enemies if bullet is within camera bounds
      const isOnScreen = nx >= camX && nx <= camX + camW && ny >= camY && ny <= camY + camH;
      if (isOnScreen) {
        const hit = enemies.tryHitEnemyWithBullet(nx, ny, b.radius, b.damage);
        if (hit) {
          b.graphic.destroy();
          this.bullets.splice(i, 1);
        }
      }
    }
  }

  destroy(): void {
    for (const g of this.guns) {
      g.destroy();
    }
    this.guns = [];
    for (const b of this.bullets) {
      b.graphic.destroy();
    }
    this.bullets.length = 0;
  }
}
