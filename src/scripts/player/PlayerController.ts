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

/**
 * Placeholder player (circle). Movement is manual (no Arcade body) so we can clamp to the
 * camera view and resolve the train hull analytically. Uses WASD.
 */
export class PlayerController {
  readonly sprite: Phaser.GameObjects.Arc;
  private readonly walkSpeed: number;
  private readonly radius: number;
  private readonly keyW: Phaser.Input.Keyboard.Key;
  private readonly keyA: Phaser.Input.Keyboard.Key;
  private readonly keyS: Phaser.Input.Keyboard.Key;
  private readonly keyD: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene, options: PlayerControllerOptions) {
    this.radius = options.radius ?? 14;
    const fill = options.fillColor ?? 0x58a6ff;
    const stroke = options.strokeColor ?? 0xffffff;
    const strokeW = options.strokeWidth ?? 2;
    const depth = options.depth ?? 20;
    this.walkSpeed = options.walkSpeed ?? 220;

    this.sprite = scene.add.circle(
      options.x,
      options.y,
      this.radius,
      fill,
      1,
    );
    this.sprite.setStrokeStyle(strokeW, stroke);
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

  getRadius(): number {
    return this.radius;
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
    deltaMs: number,
    trainBody: Phaser.GameObjects.Rectangle,
    camera: Phaser.Cameras.Scene2D.Camera,
    offset: Phaser.Math.Vector2,
    outsideTrainGap: number,
    viewPad: number,
  ): void {
    const { ax, ay } = this.readWalkAxes();
    const dt = deltaMs / 1000;
    let ox = offset.x + ax * this.walkSpeed * dt;
    let oy = offset.y + ay * this.walkSpeed * dt;
    const minOx = trainBody.width * 0.5 + outsideTrainGap + this.radius;
    ox = Math.max(minOx, ox);

    let wx = trainBody.x + ox;
    let wy = trainBody.y + oy;
    let c = clampCircleToWorldView(
      wx,
      wy,
      this.radius,
      camera.worldView,
      viewPad,
    );
    wx = c.x;
    wy = c.y;
    const minWx = trainBody.x + minOx;
    if (wx < minWx) {
      wx = minWx;
    }
    c = clampCircleToWorldView(wx, wy, this.radius, camera.worldView, viewPad);
    wx = c.x;
    wy = c.y;
    if (wx < minWx) {
      wx = minWx;
    }

    offset.set(wx - trainBody.x, wy - trainBody.y);
    this.sprite.setPosition(wx, wy);
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

    let { x, y } = this.sprite;
    x += ax * this.walkSpeed * dt;
    y += ay * this.walkSpeed * dt;

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
