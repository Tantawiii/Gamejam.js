import * as Phaser from 'phaser';
import type { EnemyType } from '../waves/WaveConfiguration';
import type { TrainController } from './TrainController';

export type WeaponType = 'basic' | 'sniper' | 'shuriken' | 'caterpillar' | 'slow_dome';

export type AimTargetSnapshot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  getHitPosition: () => { x: number; y: number };
};

type EnemyTargetingSystem = {
  findClosestLivingEnemyTarget(
    wx: number,
    wy: number,
    extraVelY: number,
    ignoreTypes?: readonly EnemyType[],
  ): AimTargetSnapshot | null;
  tryHitEnemyWithBullet(
    bx: number,
    by: number,
    bulletRadius: number,
    bulletDamage?: number,
  ): boolean;
  tryHitEnemiesInRadius?: (x: number, y: number, radius: number, damage: number) => number;
  setSlowFields?: (fields: SlowField[]) => void;
  countEnemiesInRadius?: (wx: number, wy: number, radius: number) => number;
};

type Bullet = {
  graphic: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  ay?: number;
  lifeMs: number;
  damage: number;
  radius: number;
  /** Optional larger hit radius (e.g. shuriken) without changing sprite scale. */
  hitRadius?: number;
  kind: 'basic' | 'shuriken' | 'caterpillar';
  aoeRadius?: number;
  spin?: number;
  /** Straight-line travel angle; sprite pitch is faked in update for a “drop” look. */
  caterpillarFallVis?: { initialLifeMs: number; travelAng: number };
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
  private domes: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null> = [];
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
  private readonly slowFieldByWeapon = 0.18;
  private readonly caterpillarMinFireDistance = 170;
  private readonly aimToleranceRad = Phaser.Math.DegToRad(8);
  private readonly sniperAimToleranceRad = Phaser.Math.DegToRad(5);
  private static readonly COAL_PER_SNIPER_SHOT = 15;
  private static readonly COAL_PER_CATERPILLAR_SHOT = 3;
  private static readonly COAL_PER_BASIC_SHOT = 1;
  private static readonly COAL_PER_SHURIKEN_VOLLEY = 2;

  /**
   * Most weapon/bullet sprites are drawn facing up.
   * `bullet_basic` and `bullet_sniper` are drawn facing up-right (north-east).
   */
  private readonly upFacingToWorldRotationOffset = Math.PI / 2;
  private readonly northEastFacingToWorldRotationOffset = Math.PI / 4;

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
    return this.getWeaponStatsForLevel(slot.type, slot.level);
  }

  private getWeaponStatsForLevel(type: WeaponType, level: number) {
    const levelScale = 1 + (level - 1) * 0.14;
    switch (type) {
      case 'basic':
        return {
          interval: this.fireIntervalMs / (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: this.bulletSpeed,
          bulletLifeMs: this.bulletLifeMs,
          range: this.firingRange * 0.78 * this.rangeMultiplier,
          damage: 30 * levelScale * this.damageMultiplier,
          pellets: 1 as const,
          spreadRad: 0 as const,
          radiusScale: 1 as const,
        };
      case 'sniper':
        return {
          interval:
            (this.fireIntervalMs * 3.25) /
            (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: 0,
          bulletLifeMs: 120,
          range: this.firingRange * 2.4 * this.rangeMultiplier,
          damage: 210 * levelScale * this.damageMultiplier,
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
          pellets: 4 as const,
          spreadRad: Phaser.Math.DegToRad(10),
          radiusScale: 1 as const,
        };
      case 'caterpillar':
        return {
          interval: (this.fireIntervalMs * 1.7) / (levelScale * this.attackSpeedMultiplier),
          bulletSpeed: 270,
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
          range: this.firingRange * 0.4 * this.rangeMultiplier,
          damage: 0,
          pellets: 0 as const,
          spreadRad: 0 as const,
          radiusScale: 0 as const,
        };
    }
  }

  getBestWeaponLevel(type: WeaponType): number {
    let best = 0;
    for (const s of this.slotWeapons) {
      if (s?.type === type) {
        best = Math.max(best, s.level);
      }
    }
    return best;
  }

  /** Level of the copy that {@link upgradeMatchingWeapon} upgrades first (slot order). */
  getFirstMatchingWeaponLevel(type: WeaponType): number | null {
    for (const s of this.slotWeapons) {
      if (s?.type === type) return s.level;
    }
    return null;
  }

  private formatWeaponStatsLineAtLevel(type: WeaponType, level: number): string {
    const st = this.getWeaponStatsForLevel(type, level);
    const slowPct = Math.round(this.slowFieldByWeapon * 100);
    switch (type) {
      case 'basic':
        return `DMG ${Math.round(st.damage)}, ${(1000 / st.interval).toFixed(1)}/s, rng ${Math.round(st.range)}px`;
      case 'sniper':
        return `DMG ${Math.round(st.damage)}, ${(st.interval / 1000).toFixed(1)}s cadence, rng ${Math.round(st.range)}px, ${TrainTurretSystem.COAL_PER_SNIPER_SHOT} coal/shot`;
      case 'shuriken':
        return `DMG ${Math.round(st.damage)}×${st.pellets}, ${(1000 / st.interval).toFixed(1)}/s, rng ${Math.round(st.range)}px`;
      case 'caterpillar':
        return `DMG ${Math.round(st.damage)}, ${(st.interval / 1000).toFixed(1)}s volley, rng ${Math.round(st.range)}px, ${TrainTurretSystem.COAL_PER_CATERPILLAR_SHOT} coal/shot`;
      case 'slow_dome':
        return `Aura ${Math.round(st.range)}px, ~${slowPct}% slow, 1 coal/s +1/enemy/s in aura`;
    }
  }

  /** Main draft card: current best copy if you own it, otherwise Lv1 preview. */
  getWeaponCardDraftBlurb(type: WeaponType): string {
    const best = this.getBestWeaponLevel(type);
    const lv = best > 0 ? best : 1;
    const line = this.formatWeaponStatsLineAtLevel(type, lv);
    return best > 0 ? `Strongest copy Lv${lv}: ${line}` : `New turret Lv1: ${line}`;
  }

  /** Add-to-slot step: new mount is always level 1. */
  getWeaponAddSlotChoiceBlurb(type: WeaponType): string {
    return `Lv1: ${this.formatWeaponStatsLineAtLevel(type, 1)}`;
  }

  /** Upgrade step: stats for the copy that will receive +1 level first. */
  getWeaponUpgradeChoiceBlurb(type: WeaponType): string {
    const lv = this.getFirstMatchingWeaponLevel(type);
    if (lv == null) return '';
    const cur = this.formatWeaponStatsLineAtLevel(type, lv);
    const next = this.formatWeaponStatsLineAtLevel(type, lv + 1);
    return `First slotted copy Lv${lv} → Lv${lv + 1}\n\nNOW\n${cur}\n\nAFTER\n${next}`;
  }

  private applyGunStyle(
    gun: Phaser.GameObjects.Image,
    slot: WeaponSlot | null,
  ): void {
    if (!slot) {
      gun.setTexture('weapon_basic');
      gun.setAlpha(0);
      gun.setVisible(false);
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
    gun.setVisible(true);
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

  /**
   * Where to aim so a constant-speed projectile from `px,py` meets a target moving at `evx,eVy`.
   * Falls back to a simple time estimate if the quadratic has no sensible root.
   */
  private static solveLinearLead(
    px: number,
    py: number,
    tx: number,
    ty: number,
    evx: number,
    evy: number,
    bulletSpeed: number,
  ): { x: number; y: number; ang: number } {
    const rx = tx - px;
    const ry = ty - py;
    const vv = evx * evx + evy * evy;
    const s = Math.max(8, bulletSpeed);
    const aCoef = vv - s * s;
    const bCoef = 2 * (rx * evx + ry * evy);
    const cCoef = rx * rx + ry * ry;
    let t: number | null = null;
    if (Math.abs(aCoef) < 1e-4) {
      if (Math.abs(bCoef) >= 1e-6) {
        const tLin = -cCoef / bCoef;
        if (tLin > 0 && Number.isFinite(tLin)) {
          t = tLin;
        }
      }
    } else {
      const disc = bCoef * bCoef - 4 * aCoef * cCoef;
      if (disc >= 0) {
        const sqrtD = Math.sqrt(disc);
        const t1 = (-bCoef - sqrtD) / (2 * aCoef);
        const t2 = (-bCoef + sqrtD) / (2 * aCoef);
        const candidates = [t1, t2].filter((v) => v > 0 && Number.isFinite(v));
        if (candidates.length > 0) {
          t = Math.min(...candidates);
        }
      }
    }
    if (t === null || t > 7.5) {
      t = Math.hypot(rx, ry) / s;
    }
    const ax = tx + evx * t;
    const ay = ty + evy * t;
    const dx = ax - px;
    const dy = ay - py;
    return { x: ax, y: ay, ang: Math.atan2(dy, dx) };
  }

  update(
    deltaMs: number,
    train: TrainController,
    enemies: EnemyTargetingSystem,
    canFire: boolean,
    trainScrollSpeedPxPerSec: number = 0,
  ): number {
    let fuelSpent = 0;
    const slowFields: SlowField[] = [];
    const mounts = train.getTurretWorldPositions();
    if (mounts.length !== this.guns.length) {
      this.rebuildFromTrain(train);
    }

    for (let i = 0; i < this.guns.length; i++) {
      const gun = this.guns[i];
      const m = mounts[i];
      const slot = this.slotWeapons[i];
      if (!gun || !m || !slot) continue;
      gun.setPosition(m.x, m.y);

      const target = enemies.findClosestLivingEnemyTarget(
        m.x,
        m.y,
        trainScrollSpeedPxPerSec,
        slot.type === 'caterpillar' ? (['long_range'] as const) : undefined,
      );
      if (!target && slot.type !== 'shuriken') {
        continue;
      }
      const stats = this.getWeaponStats(slot);
      let distance = Number.POSITIVE_INFINITY;
      let ang = gun.rotation - this.upFacingToWorldRotationOffset;
      let aimX = m.x;
      let aimY = m.y;
      let getHitPosition: (() => { x: number; y: number }) | undefined;

      if (slot.type === 'shuriken') {
        const spinStep =
          this.baseRotationSpeedRadPerSec * 1.35 * this.rotationSpeedMultiplier * (deltaMs / 1000);
        gun.rotation += spinStep;
        ang = gun.rotation - this.upFacingToWorldRotationOffset;
      } else if (target) {
        const { x: ex, y: ey, vx: evx, vy: evy, getHitPosition: targetHitPos } = target;
        getHitPosition = targetHitPos;
        distance = Math.hypot(ex - m.x, ey - m.y);
        if (slot.type === 'slow_dome') {
          ang = Math.atan2(ey - m.y, ex - m.x);
          aimX = ex;
          aimY = ey;
        } else {
          const leadSpeed =
            slot.type === 'sniper'
              ? 5200
              : stats.bulletSpeed;
          const lead = TrainTurretSystem.solveLinearLead(
            m.x,
            m.y,
            ex,
            ey,
            evx,
            evy,
            leadSpeed,
          );
          ang = lead.ang;
          aimX = lead.x;
          aimY = lead.y;
        }
        const desiredGunRotation = ang + this.upFacingToWorldRotationOffset;
        const rotMul = slot.type === 'sniper' ? 0.72 : 1;
        const maxStep =
          this.baseRotationSpeedRadPerSec *
          this.rotationSpeedMultiplier *
          rotMul *
          (deltaMs / 1000);
        gun.setRotation(
          Phaser.Math.Angle.RotateTo(gun.rotation, desiredGunRotation, maxStep),
        );
      }

      if (slot.type === 'slow_dome') {
        if (!canFire) {
          if (this.domes[i]) {
            this.domes[i]?.destroy();
            this.domes[i] = null;
          }
          continue;
        }
        const domeDiam = stats.range * 2;
        let dome = this.domes[i];
        if (!dome || !(dome instanceof Phaser.GameObjects.Sprite)) {
          dome?.destroy();
          const s = this.scene.add.sprite(m.x, m.y, 'shield_frame_0');
          s.setOrigin(0.5, 0.5);
          s.setDepth(this.depth - 1);
          if (this.scene.anims.exists('slow_dome_shield')) {
            s.play('slow_dome_shield');
          }
          this.domes[i] = s;
          dome = s;
        }
        dome.setPosition(m.x, m.y);
        dome.setAlpha(0.4);
        dome.setDisplaySize(domeDiam, domeDiam);
        slowFields.push({
          x: m.x,
          y: m.y,
          radius: stats.range,
          slowFactor: this.slowFieldByWeapon,
        });
        const inAura = enemies.countEnemiesInRadius?.(m.x, m.y, stats.range) ?? 0;
        fuelSpent += (deltaMs / 1000) * (1 + inAura);
        continue;
      } else if (this.domes[i]) {
        this.domes[i]?.destroy();
        this.domes[i] = null;
      }

      if (!canFire) {
        continue;
      }

      // Weapon must finish aiming before it can fire (sniper snaps aim; still gate on alignment).
      if (slot.type !== 'shuriken') {
        const desiredGunRotation = ang + this.upFacingToWorldRotationOffset;
        const aimError = Math.abs(
          Phaser.Math.Angle.Wrap(gun.rotation - desiredGunRotation),
        );
        const tol =
          slot.type === 'sniper' ? this.sniperAimToleranceRad : this.aimToleranceRad;
        if (aimError > tol) {
          continue;
        }
      }

      // Only fire if target is within range AND on screen
      if (slot.type !== 'shuriken' && distance > stats.range) {
        continue;
      }
      if (slot.type === 'caterpillar' && distance < this.caterpillarMinFireDistance) {
        continue;
      }

      this.fireAcc[i] = (this.fireAcc[i] ?? 0) + deltaMs;
      if ((this.fireAcc[i] ?? 0) < stats.interval) continue;
      this.fireAcc[i] = 0;

      if (slot.type === 'sniper') {
        fuelSpent += TrainTurretSystem.COAL_PER_SNIPER_SHOT;
      } else if (slot.type === 'caterpillar') {
        fuelSpent += TrainTurretSystem.COAL_PER_CATERPILLAR_SHOT;
      } else if (slot.type === 'basic') {
        fuelSpent += TrainTurretSystem.COAL_PER_BASIC_SHOT;
      } else if (slot.type === 'shuriken') {
        fuelSpent += TrainTurretSystem.COAL_PER_SHURIKEN_VOLLEY;
      }

      const tipDist = slot.type === 'sniper' ? 20 : 14;
      const tipX = m.x + Math.cos(ang) * tipDist;
      const tipY = m.y + Math.sin(ang) * tipDist;
      if (slot.type === 'sniper') {
        const beam = this.scene.add.image(tipX, tipY, 'bullet_sniper');
        beam.setDepth(this.depth + 2);
        beam.setOrigin(0, 0.5);
        // Beam art extends along +X; align with shot direction (barrel / world angle).
        beam.setRotation(ang);
        const beamLen = Math.max(24, Math.hypot(aimX - tipX, aimY - tipY));
        beam.setScale(Math.max(0.6, beamLen / 64), 0.8);
        this.sniperBeams.push(beam);
        this.scene.time.delayedCall(120, () => {
          beam.destroy();
          const idx = this.sniperBeams.indexOf(beam);
          if (idx >= 0) this.sniperBeams.splice(idx, 1);
        });
        if (getHitPosition) {
          const hp = getHitPosition();
          enemies.tryHitEnemyWithBullet(hp.x, hp.y, 14, stats.damage);
        }
        continue;
      }

      const pellets = Math.max(1, stats.pellets);
      for (let p = 0; p < pellets; p++) {
        const shotAng =
          slot.type === 'shuriken'
            ? Phaser.Math.FloatBetween(-Math.PI, Math.PI)
            : ang + ((pellets <= 1 ? 0 : p / (pellets - 1)) - 0.5) * 2 * stats.spreadRad;
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
        if (slot.type === 'caterpillar') {
          g.setRotation(0 + this.upFacingToWorldRotationOffset);
        } else if (slot.type === 'shuriken') {
          g.setRotation(shotAng + this.upFacingToWorldRotationOffset);
        } else {
          // W01 bullet art faces north-east.
          g.setRotation(shotAng + this.northEastFacingToWorldRotationOffset);
        }
        this.bullets.push({
          graphic: g,
          vx,
          vy,
          ay: 0,
          lifeMs: stats.bulletLifeMs,
          damage: stats.damage,
          radius: this.bulletRadius * stats.radiusScale,
          hitRadius:
            slot.type === 'shuriken'
              ? this.bulletRadius * stats.radiusScale * 1.85
              : undefined,
          kind: slot.type === 'shuriken' ? 'shuriken' : slot.type === 'caterpillar' ? 'caterpillar' : 'basic',
          aoeRadius: slot.type === 'caterpillar' ? 58 : undefined,
          spin: slot.type === 'shuriken' ? Phaser.Math.FloatBetween(8, 12) : 0,
          caterpillarFallVis:
            slot.type === 'caterpillar'
              ? { initialLifeMs: stats.bulletLifeMs, travelAng: shotAng }
              : undefined,
        });
      }
    }

    this.updateBullets(deltaMs, enemies);
    enemies.setSlowFields?.(slowFields);
    return fuelSpent;
  }

  private updateBullets(deltaMs: number, enemies: EnemyTargetingSystem): void {
    const dt = deltaMs / 1000;
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
      } else if (b.kind === 'caterpillar' && b.caterpillarFallVis) {
        const maxL = b.caterpillarFallVis.initialLifeMs;
        const t = Phaser.Math.Clamp(1 - b.lifeMs / maxL, 0, 1);
        const eased = t * t * (3 - 2 * t);
        const travelAng = b.caterpillarFallVis.travelAng;
        const dropTilt = (1 - eased) * Phaser.Math.DegToRad(52);
        b.graphic.rotation = travelAng + dropTilt + this.upFacingToWorldRotationOffset;
      } else if (b.kind === 'caterpillar') {
        const bulletAng = Math.atan2(b.vy, b.vx);
        b.graphic.rotation = bulletAng + this.upFacingToWorldRotationOffset;
      } else {
        const bulletAng = Math.atan2(b.vy, b.vx);
        b.graphic.rotation = bulletAng + this.northEastFacingToWorldRotationOffset;
      }

      const hitR = b.hitRadius ?? b.radius;
      let hit = enemies.tryHitEnemyWithBullet(nx, ny, hitR, b.damage);
      const caterpillarSplashPhase =
        b.kind === 'caterpillar' &&
        b.caterpillarFallVis &&
        1 - b.lifeMs / b.caterpillarFallVis.initialLifeMs > 0.18;
      if (!hit && caterpillarSplashPhase && b.aoeRadius) {
        const hits = enemies.tryHitEnemiesInRadius?.(nx, ny, b.aoeRadius, b.damage * 0.7) ?? 0;
        hit = hits > 0;
      }
      if (hit) {
        b.graphic.destroy();
        this.bullets.splice(i, 1);
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
