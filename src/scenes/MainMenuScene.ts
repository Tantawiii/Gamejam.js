import * as Phaser from 'phaser';

export class MainMenuScene extends Phaser.Scene {
  private controlsVisible = false;
  private controlsPanel?: Phaser.GameObjects.Container;

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(280, 0, 0, 0);
    const startGame = (): void => {
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MainScene');
      });
      this.cameras.main.fadeOut(280, 0, 0, 0);
    };
    const toggleControls = (): void => {
      this.controlsVisible = !this.controlsVisible;
      this.controlsPanel?.setVisible(this.controlsVisible);
    };

    const renderMenu = (): void => {
      this.add
        .text(width / 2, height * 0.22, "Rails? WHAT'S DAT!", {
          fontFamily: 'Nosifer, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '84px',
          color: '#ff3434',
          align: 'center',
        })
        .setOrigin(0.5)
        .setShadow(2, 2, '#333333', 2, false, true);

      this.add
        .text(width / 2, height * 0.35, 'The rails whisper... board if you dare.', {
          fontFamily:
            'Freckle Face, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '34px',
          color: '#f0f6fc',
          align: 'center',
        })
        .setOrigin(0.5)
        .setShadow(2, 2, '#333333', 2, false, true);

      const makeButton = (
        y: number,
        label: string,
        onClick: () => void,
      ): Phaser.GameObjects.Text => {
        const button = this.add
          .text(width / 2, y, label, {
            fontFamily:
              'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: '42px',
            color: '#ffffff',
          })
          .setOrigin(0.5)
          .setPadding(16, 10, 16, 10)
          .setBackgroundColor('#20252f')
          .setInteractive({ useHandCursor: true });

        button.on('pointerover', () => {
          button.setBackgroundColor('#343b4a');
        });
        button.on('pointerout', () => {
          button.setBackgroundColor('#20252f');
        });
        button.on('pointerdown', onClick);
        return button;
      };

      makeButton(height * 0.56, 'Start', startGame);
      makeButton(height * 0.69, 'Controls', toggleControls);

      const controlsBg = this.add
        .rectangle(width / 2, height * 0.86, width * 0.72, 118, 0x111827, 0.92)
        .setStrokeStyle(2, 0x4b5563, 1);
      const controlsText = this.add
        .text(
          width / 2,
          height * 0.86,
          'WASD / Arrow Keys: Move\nE: Board or leave train',
          {
            fontFamily:
              'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: '24px',
            color: '#d1d5db',
            align: 'center',
          },
        )
        .setOrigin(0.5);
      this.controlsPanel = this.add
        .container(0, 0, [controlsBg, controlsText])
        .setVisible(false);

      this.input.keyboard?.once('keydown-SPACE', startGame);
      this.input.keyboard?.on('keydown-C', toggleControls);
    };

    const webFont = (window as { WebFont?: { load: (cfg: object) => void } })
      .WebFont;
    if (webFont) {
      webFont.load({
        google: {
          families: ['Freckle Face', 'Finger Paint', 'Nosifer'],
        },
        active: renderMenu,
      });
      return;
    }

    renderMenu();
  }
}
