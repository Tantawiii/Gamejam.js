import * as Phaser from 'phaser';

/**
 * Starter scene — replace with your jam game.
 * Theme: Machines! (Gamedev.js Jam 2026)
 */
export class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height * 0.28, 'MACHINES!', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '48px',
        color: '#58a6ff',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.42, 'Gamedev.js Jam 2026 — template ready', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '20px',
        color: '#c9d1d9',
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height * 0.55,
        'npm run dev  ·  npm run build  ·  ship dist/ as HTML5',
        {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#8b949e',
        },
      )
      .setOrigin(0.5);

    const gear = this.add.graphics();
    const cx = width / 2;
    const cy = height * 0.72;
    const r = 36;
    const teeth = 8;
    gear.lineStyle(4, 0x3fb950, 1);
    gear.strokeCircle(cx, cy, r);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const x0 = cx + Math.cos(a) * (r - 4);
      const y0 = cy + Math.sin(a) * (r - 4);
      const x1 = cx + Math.cos(a) * (r + 14);
      const y1 = cy + Math.sin(a) * (r + 14);
      gear.lineBetween(x0, y0, x1, y1);
    }

    this.tweens.add({
      targets: gear,
      angle: 360,
      duration: 8000,
      repeat: -1,
    });
  }
}
