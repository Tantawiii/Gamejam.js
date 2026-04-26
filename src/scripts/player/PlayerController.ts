import * as Phaser from 'phaser';
import { pushCircleOutOfCenteredRect } from './circleRectPushOut';
import { clampCircleToWorldView } from './worldBounds';

export type PlayerControllerOptions = {
  x: number;
  y: number;
  radius?: number;
  fillColor?: number;
  strokeColor?: number;
  strokeWidth?: number;
  depth?: number;
  walkSpeed?: number;
};

const PLAYER_SHEET_KEY = 'player_character_sheet';
const PLAYER_IDLE_ANIM_KEY = 'player_idle';
const PLAYER_WALK_ANIM_KEY = 'player_walk';

/**
 * Placeholder player (circle). Movement is manual (no Arcade body) so we can clamp to the
 * camera view and resolve the train hull analytically. Uses WASD.
 */
export class PlayerController {
  readonly sprite: Phaser.GameObjects.Arc | Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  private readonly walkSpeed: number;
  private walkSpeedMultiplier = 1;
  private readonly radius: number;
  private readonly keyW: Phaser.Input.Keyboard.Key;
  private readonly keyA: Phaser.Input.Keyboard.Key;
  private readonly keyS: Phaser.Input.Keyboard.Key;
  private readonly keyD: Phaser.Input.Keyboard.Key;
  private facingLeft = false;

  constructor(scene: Phaser.Scene, options: PlayerControllerOptions) {
    this.radius = options.radius ?? 14;
    const fill = options.fillColor ?? 0x58a6ff;
    const stroke = options.strokeColor ?? 0xffffff;
    const strokeW = options.strokeWidth ?? 2;
    const depth = options.depth ?? 20;
    this.walkSpeed = options.walkSpeed ?? 220;

    if (scene.textures.exists(PLAYER_SHEET_KEY)) {
      this.ensureAnimations(scene);
      const playerSprite = scene.add.sprite(options.x, options.y, PLAYER_SHEET_KEY, 0);
      playerSprite.setDisplaySize(this.radius * 3.4, this.radius * 4.9);
      playerSprite.play(PLAYER_IDLE_ANIM_KEY);
      this.sprite = playerSprite;
    } else if (scene.textures.exists('gosling_with_shadow')) {
      const playerImage = scene.add.image(options.x, options.y, 'gosling_with_shadow');
      playerImage.setDisplaySize(this.radius * 4.6, this.radius * 4.6);
      this.sprite = playerImage;
    } else {
      const fallback = scene.add.circle(options.x, options.y, this.radius, fill, 1);
      fallback.setStrokeStyle(strokeW, stroke);
      this.sprite = fallback;
    }
    this.sprite.setDepth(depth);

    const kb = scene.input.keyboard;
    if (!kb) {
      throw new Error('PlayerController requires keyboard input');
    }
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }

  private ensureAnimations(scene: Phaser.Scene): void {
    if (!scene.anims.exists(PLAYER_IDLE_ANIM_KEY)) {
      scene.anims.create({
        key: PLAYER_IDLE_ANIM_KEY,
        frames: scene.anims.generateFrameNumbers(PLAYER_SHEET_KEY, { start: 0, end: 5 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (!scene.anims.exists(PLAYER_WALK_ANIM_KEY)) {
      scene.anims.create({
        key: PLAYER_WALK_ANIM_KEY,
        frames: scene.anims.generateFrameNumbers(PLAYER_SHEET_KEY, { start: 8, end: 15 }),
        frameRate: 12,
        repeat: -1,
      });
    }
  }

  private syncSpriteAnimation(ax: number, ay: number): void {
    if (!(this.sprite instanceof Phaser.GameObjects.Sprite)) {
      return;
    }
    const isMoving = ax !== 0 || ay !== 0;
    const targetAnim = isMoving ? PLAYER_WALK_ANIM_KEY : PLAYER_IDLE_ANIM_KEY;
    if (this.sprite.anims.currentAnim?.key !== targetAnim) {
      this.sprite.play(targetAnim, true);
    }
    if (ax !== 0) {
      this.facingLeft = ax < 0;
    }
    this.sprite.setFlipX(this.facingLeft);
  }

  getRadius(): number {
    return this.radius;
  }

  addWalkSpeedMultiplier(amount: number): void {
    this.walkSpeedMultiplier = Math.max(0.1, this.walkSpeedMultiplier + amount);
  }

  private readWalkAxes(): { ax: number; ay: number } {
    let vx = 0;
    let vy = 0;
    if (this.keyA.isDown) vx -= 1;
    if (this.keyD.isDown) vx += 1;
    if (this.keyW.isDown) vy -= 1;
    if (this.keyS.isDown) vy += 1;
    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }
    return { ax: vx, ay: vy };
  }

  /**
   * Riding: offset from train center (world); keep player to the right of the hull and inside the camera view.
   */
  applyRideFromTrainOffset(
    _deltaMs: number,
    trainBody: Phaser.GameObjects.Rectangle,
    camera: Phaser.Cameras.Scene2D.Camera,
    offset: Phaser.Math.Vector2,
    _outsideTrainGap: number,
    viewPad: number,
  ): void {
    this.syncSpriteAnimation(0, 0);
    const wx = trainBody.x + offset.x;
    const wy = trainBody.y + offset.y;
    const clamped = clampCircleToWorldView(
      wx,
      wy,
      this.radius,
      camera.worldView,
      viewPad,
    );
    this.sprite.setPosition(clamped.x, clamped.y);
    offset.set(clamped.x - trainBody.x, clamped.y - trainBody.y);
  }

  /**
   * On-foot: WASD in world space, push out of all hulls, stay inside camera view.
   */
  updateOnFoot(
    deltaMs: number,
    hulls: Phaser.GameObjects.Rectangle[],
    camera: Phaser.Cameras.Scene2D.Camera,
    viewPad: number,
  ): void {
    const dt = deltaMs / 1000;
    const { ax, ay } = this.readWalkAxes();
    this.syncSpriteAnimation(ax, ay);

    const speed = this.walkSpeed * this.walkSpeedMultiplier;
    let { x, y } = this.sprite;
    x += ax * speed * dt;
    y += ay * speed * dt;

    let pushed = { x, y };
    for (const h of hulls) {
      pushed = pushCircleOutOfCenteredRect(
        pushed.x,
        pushed.y,
        this.radius,
        h.x,
        h.y,
        h.width,
        h.height,
      );
    }
    const clamped = clampCircleToWorldView(
      pushed.x,
      pushed.y,
      this.radius,
      camera.worldView,
      viewPad,
    );
    this.sprite.setPosition(clamped.x, clamped.y);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
