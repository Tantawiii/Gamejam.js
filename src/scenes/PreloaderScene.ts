import * as Phaser from 'phaser';
import { registerAssets } from '../scripts/assets/registerAssets';

export class PreloaderScene extends Phaser.Scene {
  constructor() {
    super('PreloaderScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    const barWidth = Math.min(420, width * 0.62);
    const barHeight = 18;
    const barX = (width - barWidth) / 2;
    const barY = height * 0.56;

    this.add
      .text(width / 2, height * 0.44, 'Loading...', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '24px',
        color: '#c9d1d9',
      })
      .setOrigin(0.5);

    const progressBox = this.add
      .rectangle(width / 2, barY + barHeight / 2, barWidth, barHeight, 0x2f333b)
      .setOrigin(0.5);

    const progressBar = this.add
      .rectangle(barX, barY + barHeight / 2, 0, barHeight - 4, 0x58a6ff)
      .setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      progressBar.width = Math.max(0, barWidth - 4) * Phaser.Math.Clamp(value, 0, 1);
    });

    this.load.once('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      this.scene.start('MainMenuScene');
    });

    this.load.image('NORMAL_ENEMY', 'assets/NORMAL_ENEMY.png');
    registerAssets(this);
  }
}
