import * as Phaser from 'phaser';

/**
 * Shown when an enemy touches the player.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height * 0.38, 'GAME OVER', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '42px',
        color: '#f85149',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.52, 'An enemy reached you.', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '18px',
        color: '#c9d1d9',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.64, 'Press R to try again', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '16px',
        color: '#8b949e',
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    if (kb) {
      const rKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      rKey.once('down', () => {
        this.scene.start('MainMenuScene');
      });
    }
  }
}
