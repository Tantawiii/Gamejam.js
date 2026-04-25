import * as Phaser from 'phaser';
import type { TrainController } from './TrainController';

export type WeaponType = 'basic' | 'sniper' | 'shuriken' | 'caterpillar' | 'slow_dome';

type EnemyTargetingSystem = {
  findClosestLivingEnemyTo(wx: number, wy: number): { x: number; y: number } | null;
  tryHitEnemyWithBullet(
    bx: number,
    by: number,
    bulletRadius: number,
    bulletDamage?: number,
  ): boolean;
  tryHitEnemiesInRadius?: (x: number, y: number, radius: number, damage: number) => number;
  setSlowFields?: (fields: SlowField[]) => void;
};

type Bullet = {
  graphic: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  ay?: number;
  lifeMs: number;
  damage: number;
  radius: number;
  kind: 'basic' | 'shuriken' | 'caterpillar';
  aoeRadius?: number;
  spin?: number;
};

type SlowField = {
  x: number;
  y: number;
  radius: number;
  slowFactor: number;
};

type WeaponSlot = {
  type: WeaponType;
  level: number;
};

export class TrainTurretSystem {
  private readonly scene: Phaser.Scene;
  private guns: Phaser.GameObjects.Image[] = [];
  private domes: Array<Phaser.GameObjects.Image | null> = [];
  private sniperBeams: Phaser.GameObjects.Image[] = [];
  private readonly fireAcc: number[] = [];
  private readonly bullets: Bullet[] = [];
  private readonly fireIntervalMs: number;
  private readonly bulletSpeed: number;
  private readonly bulletRadius: number;
  private readonly bulletLifeMs: number;
  private readonly depth: number;
  private readonly firingRange: number;
  private readonly slotWeapons: Array<WeaponSlot | null> = [];
  private damageMultiplier = 1;
  private rangeMultiplier = 1;
  private attackSpeedMultiplier = 1;
  private rotationSpeedMultiplier = 1;
  private readonly baseRotationSpeedRadPerSec = Phaser.Math.DegToRad(220);
  private readonly slowFieldByWeapon = 0.1;
  private readonly minLongRangeDistance = 170;

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
    this.depth = options.depth;
    this.firingRange = options.firingRange ?? 500; // Default 500 pixel range
  }

  rebuildFromTrain(train: TrainController): void {
    const previous = [...this.slotWeapons];
    for (const g of this.guns) {
      g.destroy();
    }
    this.guns = [];
    for (const d of this.domes) {
      d?.destroy();
    }
    this.domes = [];
    for (const beam of this.sniperBeams) {
      beam.destroy();
    }
    this.sniperBeams = [];
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
        previous[i] ?? (i < 2 ? { type: 'basic', level: 1 } : null);
      const gun = this.scene.add.image(m.x, m.y, 'weapon_basic');
      gun.setOrigin(0.5, 0.5);
      gun.setDepth(this.depth);
      this.applyGunStyle(gun, this.slotWeapons[i] ?? null);
      this.guns.push(gun);
      this.domes.push(null);
      this.fireAcc.push(0);
    }
  }

  private getWeaponStats(slot: WeaponSlot) {
    const levelScale = 1 + (slot.level - 1) * 0.14;
    switch (slot.type) {
      case 'basic':
        return {
          interval: this.fireIntervalMs / (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: this.bulletSpeed,
          bulletLifeMs: this.bulletLifeMs,
          range: this.firingRange * this.rangeMultiplier,
          damage: 30 * levelScale * this.damageMultiplier,
          pellets: 1 as const,
          spreadRad: 0 as const,
          radiusScale: 1 as const,
        };
      case 'sniper':
        return {
          interval:
            (this.fireIntervalMs * 2.0) /
            (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: 0,
          bulletLifeMs: 120,
          range: this.firingRange * 1.55 * this.rangeMultiplier,
          damage: 60 * levelScale * this.damageMultiplier,
          pellets: 1 as const,
          spreadRad: 0 as const,
          radiusScale: 1 as const,
        };
      case 'shuriken':
        return {
          interval:
            this.fireIntervalMs /
            (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: this.bulletSpeed * 0.9,
          bulletLifeMs: this.bulletLifeMs * 0.72,
          range: this.firingRange * 0.8 * this.rangeMultiplier,
          damage: 45 * levelScale * this.damageMultiplier,
          pellets: 3 as const,
          spreadRad: Phaser.Math.DegToRad(10),
          radiusScale: 1 as const,
        };
      case 'caterpillar':
        return {
          interval: (this.fireIntervalMs * 1.7) / (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: 120,
          bulletLifeMs: this.bulletLifeMs * 1.9,
          range: this.firingRange * 1.2 * this.rangeMultiplier,
          damage: 70 * levelScale * this.damageMultiplier,
          pellets: 1 as const,
          spreadRad: 0 as const,
          radiusScale: 1.2 as const,
        };
      case 'slow_dome':
        return {
          interval: 9999999,
          bulletSpeed: 0,
          bulletLifeMs: 0,
          range: this.firingRange * 0.62 * this.rangeMultiplier,
          damage: 0,
          pellets: 0 as const,
          spreadRad: 0 as const,
          radiusScale: 0 as const,
        };
    }
  }

  private applyGunStyle(
    gun: Phaser.GameObjects.Image,
    slot: WeaponSlot | null,
  ): void {
    if (!slot) {
      gun.setTexture('weapon_basic');
      gun.setAlpha(0.35);
      return;
    }
    const keyMap: Record<WeaponType, string> = {
      basic: 'weapon_basic',
      sniper: 'weapon_sniper',
      shuriken: 'weapon_shuriken',
      caterpillar: 'weapon_caterpillar',
      slow_dome: 'weapon_dome',
    };
    gun.setTexture(keyMap[slot.type]);
    gun.setAlpha(1);
    gun.setScale(1);
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
      const dome = this.domes[i];
      if (dome && slot.type === 'slow_dome') dome.setScale(1);
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
    const slowFields: SlowField[] = [];
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
        this.baseRotationSpeedRadPerSec *
        this.rotationSpeedMultiplier *
        (slot.type === 'sniper' ? 0.5 : 1) *
        (deltaMs / 1000);
      gun.setRotation(Phaser.Math.Angle.RotateTo(gun.rotation, ang, maxStep));

      const stats = this.getWeaponStats(slot);
      if (slot.type === 'slow_dome') {
        if (!this.domes[i]) {
          const dome = this.scene.add.image(m.x, m.y, 'weapon_dome');
          dome.setAlpha(0.22);
          dome.setDepth(this.depth - 1);
          this.domes[i] = dome;
        }
        this.domes[i]?.setPosition(m.x, m.y);
        this.domes[i]?.setScale(1);
        slowFields.push({
          x: m.x,
          y: m.y,
          radius: stats.range,
          slowFactor: this.slowFieldByWeapon,
        });
        continue;
      } else if (this.domes[i]) {
        this.domes[i]?.destroy();
        this.domes[i] = null;
      }

      if (!canFire) {
        continue;
      }

      // Only fire if target is within range AND on screen
      if (distance > stats.range) {
        continue;
      }
      const distanceToTrain = Phaser.Math.Distance.Between(
        m.x,
        m.y,
        train.body.x,
        train.body.y,
      );
      if (
        (slot.type === 'sniper' || slot.type === 'caterpillar') &&
        distanceToTrain < this.minLongRangeDistance
      ) {
        continue;
      }

      // Check if target is within camera bounds
      if (target.x < camX || target.x > camX + camW || target.y < camY || target.y > camY + camH) {
        continue;
      }

      this.fireAcc[i] = (this.fireAcc[i] ?? 0) + deltaMs;
      if ((this.fireAcc[i] ?? 0) < stats.interval) continue;
      this.fireAcc[i] = 0;

      const tipDist = 14;
      const tipX = m.x + Math.cos(ang) * tipDist;
      const tipY = m.y + Math.sin(ang) * tipDist;
      if (slot.type === 'sniper') {
        const beam = this.scene.add.image(tipX, tipY, 'bullet_sniper');
        beam.setDepth(this.depth + 2);
        beam.setOrigin(0, 0.5);
        beam.setRotation(ang);
        beam.setScale(Math.max(0.6, distance / 64), 0.8);
        this.sniperBeams.push(beam);
        this.scene.time.delayedCall(120, () => {
          beam.destroy();
          const idx = this.sniperBeams.indexOf(beam);
          if (idx >= 0) this.sniperBeams.splice(idx, 1);
        });
        enemies.tryHitEnemyWithBullet(target.x, target.y, 14, stats.damage);
        shotsFired += 1;
        continue;
      }

      const pellets = Math.max(1, stats.pellets);
      for (let p = 0; p < pellets; p++) {
        const t = pellets <= 1 ? 0 : p / (pellets - 1);
        const spread = (t - 0.5) * 2 * stats.spreadRad;
        const shotAng = ang + spread;
        const vx = Math.cos(shotAng) * stats.bulletSpeed;
        const vy = Math.sin(shotAng) * stats.bulletSpeed;
        const bulletKey =
          slot.type === 'shuriken'
            ? 'bullet_shuriken'
            : slot.type === 'caterpillar'
              ? 'bullet_caterpillar'
              : 'bullet_basic';
        const g = this.scene.add.image(tipX, tipY, bulletKey);
        g.setDepth(this.depth + 1);
        g.setScale(1);
        this.bullets.push({
          graphic: g,
          vx,
          vy: slot.type === 'caterpillar' ? -190 : vy,
          ay: slot.type === 'caterpillar' ? 520 : 0,
          lifeMs: stats.bulletLifeMs,
          damage: stats.damage,
          radius: this.bulletRadius * stats.radiusScale,
          kind: slot.type === 'shuriken' ? 'shuriken' : slot.type === 'caterpillar' ? 'caterpillar' : 'basic',
          aoeRadius: slot.type === 'caterpillar' ? 58 : undefined,
          spin: slot.type === 'shuriken' ? Phaser.Math.FloatBetween(8, 12) : 0,
        });
        shotsFired += 1;
      }
    }

    this.updateBullets(deltaMs, enemies);
    enemies.setSlowFields?.(slowFields);
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
      b.vy += (b.ay ?? 0) * dt;
      const nx = b.graphic.x + b.vx * dt;
      const ny = b.graphic.y + b.vy * dt;
      b.graphic.setPosition(nx, ny);
      if (b.kind === 'shuriken') {
        b.graphic.rotation += (b.spin ?? 0) * dt;
      }

      // Only hit enemies if bullet is within camera bounds
      const isOnScreen = nx >= camX && nx <= camX + camW && ny >= camY && ny <= camY + camH;
      if (isOnScreen) {
        let hit = enemies.tryHitEnemyWithBullet(nx, ny, b.radius, b.damage);
        if (!hit && b.kind === 'caterpillar' && b.vy > 0 && b.aoeRadius) {
          const hits = enemies.tryHitEnemiesInRadius?.(nx, ny, b.aoeRadius, b.damage * 0.7) ?? 0;
          hit = hits > 0;
        }
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
    for (const d of this.domes) {
      d?.destroy();
    }
    this.domes = [];
    for (const beam of this.sniperBeams) {
      beam.destroy();
    }
    this.sniperBeams = [];
    for (const b of this.bullets) {
      b.graphic.destroy();
    }
    this.bullets.length = 0;
  }
}
