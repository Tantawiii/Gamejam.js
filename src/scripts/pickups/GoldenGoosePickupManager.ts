import * as Phaser from 'phaser';

/**
 * Rare wandering gosling; on-foot player overlap awards score (no coal).
 */
export class GoldenGoosePickupManager {
  private readonly scene: Phaser.Scene;
  private sprite?: Phaser.GameObjects.Sprite;
  private readonly sheetKey: string;
  private readonly depth: number;
  private readonly displayScale: number;
  private readonly hitRadius: number;
  private readonly scrollPxPerRoll: number;
  private readonly spawnChance: number;
  private readonly scoreValue: number;
  private readonly wanderSpeed: number;
  private scrollAccumulator = 0;
  private wanderVx = 0;
  private wanderVy = 0;
  private wanderRetargetAcc = 0;
  private readonly wanderRetargetMs = 2400;

  constructor(
    scene: Phaser.Scene,
    options: {
      sheetKey: string;
      depth: number;
      displayScale: number;
      hitRadius: number;
      scrollPxPerRoll: number;
      spawnChance: number;
      scoreValue: number;
      wanderSpeed: number;
    },
  ) {
    this.scene = scene;
    this.sheetKey = options.sheetKey;
    this.depth = options.depth;
    this.displayScale = options.displayScale;
    this.hitRadius = options.hitRadius;
    this.scrollPxPerRoll = options.scrollPxPerRoll;
    this.spawnChance = options.spawnChance;
    this.scoreValue = options.scoreValue;
    this.wanderSpeed = options.wanderSpeed;
  }

  private pickWander(): void {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const sp = this.wanderSpeed;
    this.wanderVx = Math.cos(a) * sp;
    this.wanderVy = Math.sin(a) * sp;
  }

  private syncAnim(): void {
    if (!this.sprite) return;
    const vx = this.wanderVx;
    const vy = this.wanderVy;
    let key = 'gosling_walk_down';
    if (Math.abs(vx) >= Math.abs(vy)) {
      key = vx >= 0 ? 'gosling_walk_right' : 'gosling_walk_left';
    } else {
      key = vy >= 0 ? 'gosling_walk_down' : 'gosling_walk_up';
    }
    if (this.sprite.anims.currentAnim?.key !== key) {
      this.sprite.play(key);
    }
  }

  tryProgressSpawn(bgScrollDy: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    if (this.sprite || bgScrollDy <= 0) return;
    this.scrollAccumulator += bgScrollDy;
    if (this.scrollAccumulator < this.scrollPxPerRoll) return;
    this.scrollAccumulator = 0;
    if (Math.random() >= this.spawnChance) return;
    if (!this.scene.textures.exists(this.sheetKey)) return;

    const view = cam.worldView;
    const pad = 140;
    const left = Math.floor(view.x + pad);
    const right = Math.floor(view.right - pad);
    if (right <= left) return;
    const x = Phaser.Math.Between(left, right);
    const y = view.bottom + Phaser.Math.Between(72, 180);

    const sp = this.scene.add.sprite(x, y, this.sheetKey, 0);
    sp.setScale(this.displayScale);
    sp.setDepth(this.depth);
    this.pickWander();
    this.syncAnim();
    this.sprite = sp;
  }

  addWorldOffset(dx: number, dy: number): void {
    if (!this.sprite) return;
    this.sprite.setPosition(this.sprite.x + dx, this.sprite.y + dy);
  }

  hasSprite(): boolean {
    return this.sprite != null;
  }

  /** True if the goose overlaps the camera world view (on-screen). */
  isActiveInCamera(cam: Phaser.Cameras.Scene2D.Camera): boolean {
    if (!this.sprite) return false;
    const b = this.sprite.getBounds();
    return Phaser.Geom.Rectangle.Overlaps(cam.worldView, b);
  }

  /**
   * @returns Score awarded if the on-foot player touches the goose.
   */
  update(
    deltaMs: number,
    playerX: number,
    playerY: number,
    playerRadius: number,
    onFoot: boolean,
  ): number {
    if (!this.sprite) return 0;

    this.wanderRetargetAcc += deltaMs;
    if (this.wanderRetargetAcc >= this.wanderRetargetMs) {
      this.wanderRetargetAcc = 0;
      this.pickWander();
    }
    const dt = deltaMs / 1000;
    this.sprite.setPosition(
      this.sprite.x + this.wanderVx * dt,
      this.sprite.y + this.wanderVy * dt,
    );
    this.syncAnim();

    if (!onFoot) return 0;
    const dx = playerX - this.sprite.x;
    const dy = playerY - this.sprite.y;
    if (Math.hypot(dx, dy) > this.hitRadius + playerRadius) return 0;

    this.sprite.destroy();
    this.sprite = undefined;
    return this.scoreValue;
  }

  destroy(): void {
    this.sprite?.destroy();
    this.sprite = undefined;
    this.scrollAccumulator = 0;
    this.wanderRetargetAcc = 0;
  }
}
