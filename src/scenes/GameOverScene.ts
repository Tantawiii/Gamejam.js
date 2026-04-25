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
    this.cameras.main.fadeIn(280, 0, 0, 0);

    this.add
      .text(width / 2, height * 0.36, 'YOU DIED', {
        fontFamily: 'Nosifer, system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '76px',
        color: '#d83b3b',
        stroke: '#200',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setShadow(0, 8, '#110000', 12, true, true);

    this.add
      .text(width / 2, height * 0.55, 'The train has fallen.', {
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
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('MainMenuScene');
        });
        this.cameras.main.fadeOut(280, 0, 0, 0);
      });
    }
  }
}
