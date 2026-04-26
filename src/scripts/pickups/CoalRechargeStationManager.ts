import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';

/**
 * Rare world prop: a hatch that scrolls with parallax; on-foot player steps on it to dump coal into the train.
 */
export class CoalRechargeStationManager {
  private readonly scene: Phaser.Scene;
  private sprite?: Phaser.GameObjects.Image;
  private value = 0;
  private readonly textureKey: string;
  private readonly depth: number;
  private readonly displayMaxPx: number;
  private readonly hitRadius: number;
  private readonly scrollPxPerRoll: number;
  private readonly spawnChance: number;
  private readonly coalMin: number;
  private readonly coalMax: number;
  private scrollAccumulator = 0;

  constructor(
    scene: Phaser.Scene,
    options: {
      textureKey: string;
      depth: number;
      displayMaxPx: number;
      hitRadius: number;
      scrollPxPerRoll: number;
      spawnChance: number;
      coalMin: number;
      coalMax: number;
    },
  ) {
    this.scene = scene;
    this.textureKey = options.textureKey;
    this.depth = options.depth;
    this.displayMaxPx = options.displayMaxPx;
    this.hitRadius = options.hitRadius;
    this.scrollPxPerRoll = options.scrollPxPerRoll;
    this.spawnChance = options.spawnChance;
    this.coalMin = options.coalMin;
    this.coalMax = options.coalMax;
  }

  /**
   * Advance scroll bookkeeping; may spawn one station below the camera (only if none active).
   */
  tryProgressSpawn(bgScrollDy: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    if (this.sprite || bgScrollDy <= 0) return;
    this.scrollAccumulator += bgScrollDy;
    if (this.scrollAccumulator < this.scrollPxPerRoll) return;
    this.scrollAccumulator = 0;
    if (Math.random() >= this.spawnChance) return;

    const view = cam.worldView;
    const pad = 140;
    const left = Math.floor(view.x + pad);
    const right = Math.floor(view.right - pad);
    if (right <= left) return;
    const x = Phaser.Math.Between(left, right);
    const y = view.bottom + Phaser.Math.Between(72, 180);

    if (!this.scene.textures.exists(this.textureKey)) return;

    const img = this.scene.add.image(x, y, this.textureKey);
    const frame = this.scene.textures.getFrame(this.textureKey);
    const fw = frame?.width ?? 64;
    const fh = frame?.height ?? 64;
    const s = Math.min(this.displayMaxPx / fw, this.displayMaxPx / fh);
    img.setDisplaySize(fw * s, fh * s);
    img.setDepth(this.depth);
    this.sprite = img;
    this.value = Phaser.Math.Between(this.coalMin, this.coalMax);
  }

  addWorldOffset(dx: number, dy: number): void {
    if (!this.sprite) return;
    this.sprite.setPosition(this.sprite.x + dx, this.sprite.y + dy);
  }

  /** True if a station exists and overlaps the camera world view. */
  isActiveInCamera(cam: Phaser.Cameras.Scene2D.Camera): boolean {
    if (!this.sprite) return false;
    const b = this.sprite.getBounds();
    return Phaser.Geom.Rectangle.Overlaps(cam.worldView, b);
  }

  /**
   * @returns Coal amount added to the train if the on-foot player is on the station.
   */
  update(
    playerX: number,
    playerY: number,
    playerRadius: number,
    train: TrainController,
    onFoot: boolean,
  ): number {
    if (!this.sprite || !onFoot) return 0;
    const dx = playerX - this.sprite.x;
    const dy = playerY - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.hitRadius + playerRadius) return 0;

    const before = train.coal;
    train.addCoal(this.value);
    const gained = train.coal - before;
    if (gained <= 0) return 0;
    this.sprite.destroy();
    this.sprite = undefined;
    this.value = 0;
    return gained;
  }

  destroy(): void {
    this.sprite?.destroy();
    this.sprite = undefined;
    this.value = 0;
    this.scrollAccumulator = 0;
  }
}
