import * as Phaser from 'phaser';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height * 0.38, 'MACHINES', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '48px',
        color: '#f0f6fc',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.54, 'Press SPACE or click to start', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '20px',
        color: '#8b949e',
      })
      .setOrigin(0.5);

    const startGame = () => {
      this.scene.start('MainScene');
    };

    this.input.once('pointerdown', startGame);
    this.input.keyboard?.once('keydown-SPACE', startGame);
  }
}
