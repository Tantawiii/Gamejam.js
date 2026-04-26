import * as Phaser from 'phaser';

/**
 * First touch on screen spawns a stick at that point; drag for −1..1 axes in screen space
 * (x right positive, y down positive — matches world walk when camera is axis-aligned).
 * Disabled while hidden: no capture, vector reads zero.
 */
export class VirtualJoystick {
  private readonly sceneRef: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly stick: Phaser.GameObjects.Arc;
  private enabled = false;
  private activePointerId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private readonly baseRadius = 68;
  private readonly stickRadius = 26;
  private vecX = 0;
  private vecY = 0;

  private readonly onDown: (p: Phaser.Input.Pointer) => void;
  private readonly onMove: (p: Phaser.Input.Pointer) => void;
  private readonly onUp: (p: Phaser.Input.Pointer) => void;

  constructor(scene: Phaser.Scene) {
    this.sceneRef = scene;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(7590).setVisible(false);
    this.base = scene.add
      .circle(0, 0, this.baseRadius, 0x1a120c, 0.45)
      .setStrokeStyle(3, 0xc9a227, 0.75);
    this.stick = scene.add.circle(0, 0, this.stickRadius, 0xf5e6c8, 0.55).setStrokeStyle(2, 0x8b6914, 0.9);
    this.root.add([this.base, this.stick]);

    this.onDown = (pointer: Phaser.Input.Pointer) => this.handleDown(pointer);
    this.onMove = (pointer: Phaser.Input.Pointer) => this.handleMove(pointer);
    this.onUp = (pointer: Phaser.Input.Pointer) => this.handleUp(pointer);
    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.endSession();
    }
  }

  getVectorX(): number {
    return this.vecX;
  }

  getVectorY(): number {
    return this.vecY;
  }

  destroy(): void {
    this.sceneRef.input.off('pointerdown', this.onDown);
    this.sceneRef.input.off('pointermove', this.onMove);
    this.sceneRef.input.off('pointerup', this.onUp);
    this.root.destroy(true);
  }

  private handleDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || this.activePointerId !== null) return;
    // Let buttons, cards, and other interactive UI own the tap; empty hit = world / chrome.
    if (this.sceneRef.input.hitTestPointer(pointer).length > 0) return;
    this.activePointerId = pointer.id;
    this.centerX = pointer.x;
    this.centerY = pointer.y;
    this.root.setPosition(this.centerX, this.centerY);
    this.root.setVisible(true);
    this.stick.setPosition(0, 0);
    this.applyStick(pointer);
  }

  private handleMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || pointer.id !== this.activePointerId) return;
    this.applyStick(pointer);
  }

  private handleUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.endSession();
  }

  private endSession(): void {
    this.activePointerId = null;
    this.vecX = 0;
    this.vecY = 0;
    this.root.setVisible(false);
  }

  private applyStick(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.centerX;
    const dy = pointer.y - this.centerY;
    const dist = Math.hypot(dx, dy);
    const maxStick = this.baseRadius - this.stickRadius * 0.5;
    let sx = dx;
    let sy = dy;
    if (dist > maxStick && dist > 0) {
      sx = (dx / dist) * maxStick;
      sy = (dy / dist) * maxStick;
    }
    this.stick.setPosition(sx, sy);

    const dead = 10;
    if (dist < dead) {
      this.vecX = 0;
      this.vecY = 0;
      return;
    }
    const nx = dx / Math.max(dist, 0.001);
    const ny = dy / Math.max(dist, 0.001);
    this.vecX = nx;
    this.vecY = ny;
  }
}
