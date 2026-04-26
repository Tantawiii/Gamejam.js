import * as Phaser from 'phaser';
import type { MainTrainCoalConfig, MainTrainFleetConfig } from '../game/gameConfig';

export type TrainControllerOptions = {
  x: number;
  y: number;
  engineWidth: number;
  engineHeight: number;
  baseAcceleration: number;
  baseBrakeDeceleration: number;
  baseDragDeceleration: number;
  maxSpeed: number;
  maxHealth: number;
  coalMax: number;
  startingCoal: number;
  fleet: MainTrainFleetConfig;
  coal: MainTrainCoalConfig;
  fillColor?: number;
  strokeColor?: number;
  strokeWidth?: number;
  depth?: number;
  boardingRadius?: number;
};

type FleetPart = {
  rect: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Image;
  isEngine: boolean;
};

/**
 * Engine cabin + optional carriages stacked downward (+Y). Boarding only on engine.
 * Coal drains while moving; no movement or weapons when coal is 0.
 */
export class TrainController {
  private readonly scene: Phaser.Scene;
  private readonly parts: FleetPart[] = [];
  private readonly visualScale = 0.58;
  private baseAcceleration: number;
  private baseBrakeDeceleration: number;
  private baseDragDeceleration: number;
  private accelerationMultiplier = 1;
  private maxSpeed: number;
  private speed = 0;
  private throttle = 0;
  private movementEnabled = true;
  private cruising = false;
  private coalConsumptionEnabled = true;
  private readonly fleetCfg: MainTrainFleetConfig;
  private readonly coalCfg: MainTrainCoalConfig;

  /** Engine hull (camera follow, boarding, player ride offset). */
  readonly body: Phaser.GameObjects.Rectangle;

  health: number;
  maxHealth: number;
  readonly boardingRadius: number;

  coal: number;
  coalMax: number;

  private readonly baseDepth: number;

  constructor(scene: Phaser.Scene, options: TrainControllerOptions) {
    this.scene = scene;
    this.baseAcceleration = options.baseAcceleration;
    this.baseBrakeDeceleration = options.baseBrakeDeceleration;
    this.baseDragDeceleration = options.baseDragDeceleration;
    this.maxSpeed = options.maxSpeed;
    this.maxHealth = options.maxHealth;
    this.health = options.maxHealth;
    this.boardingRadius = options.boardingRadius ?? 96;
    this.coalMax = options.coalMax;
    this.coal = Math.min(options.startingCoal, options.coalMax);
    this.fleetCfg = options.fleet;
    this.coalCfg = options.coal;

    const depth = options.depth ?? 0;
    this.baseDepth = depth;
    const engineSprite = scene.add
      .image(options.x, options.y, 'train_engine_cart')
      .setDepth(depth + 0.1);
    const eFrame = scene.textures.getFrame('train_engine_cart');
    const engineW = (eFrame?.width ?? options.engineWidth) * this.visualScale;
    const engineH = (eFrame?.height ?? options.engineHeight) * this.visualScale;
    const engine = scene.add.rectangle(
      options.x,
      options.y,
      engineW,
      engineH,
      0xffffff,
      1,
    );
    engineSprite.setDisplaySize(engineW, engineH);
    engine.setVisible(false);
    engine.setDepth(depth);
    this.parts.push({ rect: engine, sprite: engineSprite, isEngine: true });
    this.body = engine;
  }

  /** Extra carriages below the engine (from card rewards). */
  addCarriage(): boolean {
    if (this.getCarriageCount() >= this.fleetCfg.maxCarriages) {
      return false;
    }
    const last = this.parts[this.parts.length - 1]!.rect;
    const gap = this.fleetCfg.carriageGap;
    const cFrame = this.scene.textures.getFrame('train_back_cart');
    const h = (cFrame?.height ?? this.fleetCfg.carriageHeight) * this.visualScale;
    const w = (cFrame?.width ?? this.fleetCfg.carriageWidth) * this.visualScale;
    const newY = last.y + last.height * 0.5 + gap + h * 0.5;
    const r = this.scene.add.rectangle(
      last.x,
      newY,
      w,
      h,
      0xffffff,
      1,
    );
    r.setVisible(false);
    r.setDepth(this.baseDepth);
    const sprite = this.scene.add
      .image(last.x, newY, 'train_back_cart')
      .setDepth(this.baseDepth + 0.1);
    sprite.setDisplaySize(w, h);
    this.parts.push({ rect: r, sprite, isEngine: false });
    return true;
  }

  getCarriageCount(): number {
    return Math.max(0, this.parts.length - 1);
  }

  getActiveWeaponCount(): number {
    return (
      this.fleetCfg.engineWeaponSlots +
      this.getCarriageCount() * this.fleetCfg.carriageWeaponSlots
    );
  }

  getMaxCarriageCount(): number {
    return this.fleetCfg.maxCarriages;
  }

  hasCoal(): boolean {
    return this.coal > 0;
  }

  addCoal(amount: number): void {
    if (amount <= 0) return;
    this.coal = Math.min(this.coalMax, this.coal + amount);
  }

  spendCoal(amount: number): void {
    if (amount <= 0) return;
    this.coal = Math.max(0, this.coal - amount);
  }

  addMaxHealth(amount: number): void {
    if (amount <= 0) return;
    this.maxHealth += amount;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  refillHealth(amount: number): void {
    if (amount <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addMaxFuel(amount: number): void {
    if (amount <= 0) return;
    this.coalMax += amount;
    this.coal = Math.min(this.coalMax, this.coal + amount);
  }

  setThrottle(value: number): void {
    this.throttle = Phaser.Math.Clamp(value, -1, 1);
  }

  getSpeed(): number {
    return this.speed;
  }

  getMaxSpeed(): number {
    return this.maxSpeed;
  }

  getThrottle(): number {
    return this.throttle;
  }

  addMaxSpeed(amount: number): void {
    if (amount <= 0) return;
    this.maxSpeed += amount;
  }

  addAccelerationMultiplier(amount: number): void {
    if (amount <= 0) return;
    this.accelerationMultiplier += amount;
  }

  private computeCoalDrainPerSec(): number {
    const carts = this.getCarriageCount();
    const speedRatio = this.maxSpeed > 0 ? this.speed / this.maxSpeed : 0;
    const accelerationDrain =
      this.throttle > 0.05
        ? this.coalCfg.accelerationDrainPerSec * this.throttle * (1 + speedRatio * 1.3)
        : 0;
    const movementDrain = this.coalCfg.movementDrainPerSpeedPerSec * this.speed;
    return (
      movementDrain +
      accelerationDrain +
      carts * this.coalCfg.drainPerCarriagePerSec
    );
  }

  getHullRects(): Phaser.GameObjects.Rectangle[] {
    return this.parts.map((p) => p.rect);
  }

  /** Visible engine sprite (for VFX follow — hull rect is invisible). */
  getEngineSprite(): Phaser.GameObjects.Image {
    return this.parts[0]!.sprite;
  }

  /**
   * Turret mounts: engine gets 2 side mounts near the body centerline.
   */
  getTurretWorldPositions(): Phaser.Math.Vector2[] {
    const roofInset = this.fleetCfg.turretRoofInsetY;
    const out: Phaser.Math.Vector2[] = [];

    const eng = this.parts[0]!.rect;
    const engSideY = eng.y + eng.height * 0.02;
    const engHalfW = eng.width * 0.33;
    out.push(
      new Phaser.Math.Vector2(eng.x - engHalfW, engSideY),
      new Phaser.Math.Vector2(eng.x + engHalfW, engSideY),
    );

    for (let i = 1; i < this.parts.length; i++) {
      const r = this.parts[i]!.rect;
      const n = this.fleetCfg.carriageWeaponSlots;
      if (n === 4) {
        // Align carriage mounts with the painted dot markers on the cart sprite.
        const leftX = r.x - r.width * 0.2;
        const rightX = r.x + r.width * 0.2;
        const topY = r.y - r.height * 0.2;
        const bottomY = r.y + r.height * 0.17;
        out.push(
          new Phaser.Math.Vector2(leftX, topY),
          new Phaser.Math.Vector2(rightX, topY),
          new Phaser.Math.Vector2(leftX, bottomY),
          new Phaser.Math.Vector2(rightX, bottomY),
        );
      } else {
        const ry = r.y - r.height * 0.5 - roofInset;
        const hw = r.width * 0.38;
        for (let k = 0; k < n; k++) {
          const t = n <= 1 ? 0.5 : k / (n - 1);
          const x = r.x - hw + t * (2 * hw);
          out.push(new Phaser.Math.Vector2(x, ry));
        }
      }
    }

    return out;
  }

  setMovementEnabled(on: boolean): void {
    this.movementEnabled = on;
  }

  isMovementEnabled(): boolean {
    return this.movementEnabled;
  }

  setCruising(on: boolean): void {
    this.cruising = on;
  }

  isCruising(): boolean {
    return this.cruising;
  }

  setCoalConsumptionEnabled(on: boolean): void {
    this.coalConsumptionEnabled = on;
  }

  takeDamage(amount: number): void {
    if (amount <= 0 || this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
  }

  get isDestroyed(): boolean {
    return this.health <= 0;
  }

  getRiderWorldPosition(): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      this.body.x,
      this.body.y - this.body.height * 0.12,
    );
  }

  canBoardFrom(worldX: number, worldY: number): boolean {
    const dx = worldX - this.body.x;
    const dy = worldY - this.body.y;
    return dx * dx + dy * dy <= this.boardingRadius * this.boardingRadius;
  }

  update(deltaMs: number): void {
    if (!this.movementEnabled || this.isDestroyed) {
      this.speed = 0;
      return;
    }

    const dt = deltaMs / 1000;
    const accel = this.baseAcceleration * this.accelerationMultiplier;
    const brake = this.baseBrakeDeceleration;
    const drag = this.baseDragDeceleration;

    // Only allow acceleration if we have coal
    const effectiveThrottle = this.coal > 0 ? this.throttle : Math.min(0, this.throttle);

    // We update speed if cruising OR if we already have some speed (to allow coasting/decelerating)
    if (this.cruising || this.speed > 0) {
      if (effectiveThrottle > 0.05) {
        this.speed = Math.min(this.maxSpeed, this.speed + accel * effectiveThrottle * dt);
      } else if (effectiveThrottle < -0.05) {
        this.speed = Math.max(0, this.speed - brake * (-effectiveThrottle) * dt);
      } else {
        this.speed = Math.max(0, this.speed - drag * dt);
      }
    } else {
      // If we are NOT cruising and NOT already moving, speed stays 0.
      this.speed = 0;
    }

    if (this.coalConsumptionEnabled) {
      const drain = this.computeCoalDrainPerSec() * dt;
      this.coal = Math.max(0, this.coal - drain);
    }

    // Keep visuals synced to hull rectangles.
    for (const part of this.parts) {
      part.sprite.setPosition(part.rect.x, part.rect.y);
    }
  }

  destroy(): void {
    for (const p of this.parts) {
      p.sprite.destroy();
      p.rect.destroy();
    }
    this.parts.length = 0;
  }
}
