import * as Phaser from 'phaser';
import { MAIN_HUD_BARS } from '../game/gameConfig';
import type { TrainController } from '../train/TrainController';

/**
 * Screen-fixed HP bar (brown on dark grey), coal bar under it, and hint text.
 */
export class GameplayHud {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly cfg = MAIN_HUD_BARS;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(4999);

    this.text = scene.add
      .text(
        this.cfg.x,
        this.cfg.y + this.cfg.height * 2 + this.cfg.gap + 10,
        '',
        {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '13px',
          color: '#c9d1d9',
        },
      )
      .setScrollFactor(0)
      .setDepth(5000);
  }

  update(train: TrainController, ridingTrain: boolean): void {
    const c = this.cfg;
    const hpFrac = train.maxHealth > 0 ? train.health / train.maxHealth : 0;
    const coalFrac = train.coalMax > 0 ? train.coal / train.coalMax : 0;

    const g = this.gfx;
    g.clear();

    g.fillStyle(c.hpBg, 1);
    g.fillRect(c.x, c.y, c.width, c.height);
    g.fillStyle(c.hpFg, 1);
    g.fillRect(c.x, c.y, c.width * Math.max(0, Math.min(1, hpFrac)), c.height);

    const cy = c.y + c.height + c.gap;
    g.fillStyle(c.coalBg, 1);
    g.fillRect(c.x, cy, c.width, c.height);
    g.fillStyle(c.coalFg, 1);
    g.fillRect(c.x, cy, c.width * Math.max(0, Math.min(1, coalFrac)), c.height);

    const motion =
      !train.hasCoal() && ridingTrain
        ? 'No coal — train stopped'
        : ridingTrain
          ? 'Riding — moving / firing needs coal'
          : 'On foot — board engine (E)';
    this.text.setText(
      `WASD · E board / leave (engine only)\nTrain HP ${Math.ceil(train.health)}/${train.maxHealth} · Coal ${Math.ceil(train.coal)}/${train.coalMax}\n${motion}`,
    );
  }

  destroy(): void {
    this.gfx.destroy();
    this.text.destroy();
  }
}
