import * as Phaser from 'phaser';

type Pickup = {
  sprite: Phaser.GameObjects.Arc;
  value: number;
};

export class ExperiencePickupManager {
  private readonly scene: Phaser.Scene;
  private readonly pickups: Pickup[] = [];
  private readonly radius: number;
  private readonly depth: number;
  private readonly fillColor: number;
  private readonly strokeColor: number;
  private magnetRange = 78;
  private magnetSpeed = 240;

  constructor(
    scene: Phaser.Scene,
    options: {
      radius?: number;
      depth?: number;
      fillColor?: number;
      strokeColor?: number;
    } = {},
  ) {
    this.scene = scene;
    this.radius = options.radius ?? 6;
    this.depth = options.depth ?? 10;
    this.fillColor = options.fillColor ?? 0x7ee787;
    this.strokeColor = options.strokeColor ?? 0x2ea043;
  }

  spawn(x: number, y: number, value: number): void {
    if (value <= 0) return;
    const s = this.scene.add.circle(x, y, this.radius, this.fillColor, 1);
    s.setStrokeStyle(2, this.strokeColor);
    s.setDepth(this.depth);
    this.pickups.push({ sprite: s, value });
  }

  update(
    deltaMs: number,
    playerX: number,
    playerY: number,
    playerRadius: number,
    magnetRange: number,
  ): number {
    this.magnetRange = Math.max(0, magnetRange);
    const collectR = playerRadius + this.radius;
    const rSq = collectR * collectR;
    const magnetRSq = this.magnetRange * this.magnetRange;
    const dt = deltaMs / 1000;
    let gained = 0;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p) continue;
      const dx = p.sprite.x - playerX;
      const dy = p.sprite.y - playerY;
      const dSq = dx * dx + dy * dy;
      if (dSq <= rSq) {
        gained += p.value;
        p.sprite.destroy();
        this.pickups.splice(i, 1);
        continue;
      }
      if (dSq <= magnetRSq && dSq > 1e-6) {
        const dist = Math.sqrt(dSq);
        const step = Math.min(dist, this.magnetSpeed * dt);
        p.sprite.setPosition(
          p.sprite.x - (dx / dist) * step,
          p.sprite.y - (dy / dist) * step,
        );
      }
    }
    return gained;
  }

  collectAt(playerX: number, playerY: number, playerRadius: number): number {
    const collectR = playerRadius + this.radius;
    const rSq = collectR * collectR;
    let gained = 0;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p) continue;
      const dx = p.sprite.x - playerX;
      const dy = p.sprite.y - playerY;
      if (dx * dx + dy * dy > rSq) continue;
      gained += p.value;
      p.sprite.destroy();
      this.pickups.splice(i, 1);
    }
    return gained;
  }

  destroy(): void {
    for (const p of this.pickups) {
      p.sprite.destroy();
    }
    this.pickups.length = 0;
  }
}
