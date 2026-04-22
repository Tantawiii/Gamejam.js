import * as Phaser from 'phaser';
import { MAIN_HUD_BARS } from '../game/gameConfig';
import type { TrainController } from '../train/TrainController';
import type { WaveSystem } from '../waves/WaveSystem';

/**
 * Screen-fixed HP bar (brown on dark grey), coal bar under it, hint text, and wave info.
 */
export class GameplayHud {
  private readonly scene: Phaser.Scene;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly cfg = MAIN_HUD_BARS;
  
  // Wave display
  private waveStartText?: Phaser.GameObjects.Text;
  private waveCompletedText?: Phaser.GameObjects.Text;
  private waveInfoText?: Phaser.GameObjects.Text;
  private betweenWaveText?: Phaser.GameObjects.Text;
  private waveStartAlpha: number = 1;
  private betweenWaveTimer: number = 0;
  private visible = true;
  private playerLevel = 1;
  private currentExp = 0;
  private expectedExp = 100;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
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

    // Wave info at top left
    this.waveInfoText = scene.add
      .text(this.cfg.x, this.cfg.y, '', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '14px',
        color: '#58a6ff',
      })
      .setScrollFactor(0)
      .setDepth(5000);

    // Wave start text (centered)
    this.waveStartText = scene.add
      .text(scene.scale.width / 2, scene.scale.height / 2 - 40, '', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '32px',
        color: '#58a6ff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setScrollFactor(0)
      .setDepth(5001)
      .setOrigin(0.5, 0.5)
      .setAlpha(0);

    // Wave completed text (centered)
    this.waveCompletedText = scene.add
      .text(scene.scale.width / 2, scene.scale.height / 2 - 40, 'Wave Completed!', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '32px',
        color: '#3fb950',
        fontStyle: 'bold',
        align: 'center',
      })
      .setScrollFactor(0)
      .setDepth(5001)
      .setOrigin(0.5, 0.5)
      .setAlpha(0);

    // Between wave timer text (centered)
    this.betweenWaveText = scene.add
      .text(scene.scale.width / 2, scene.scale.height / 2 + 20, '', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '20px',
        color: '#d29922',
        align: 'center',
      })
      .setScrollFactor(0)
      .setDepth(5001)
      .setOrigin(0.5, 0.5)
      .setAlpha(0);
  }

  update(
    train: TrainController,
    ridingTrain: boolean,
    progression?: { level: number; currentExp: number; expectedExp: number },
  ): void {
    if (!this.visible) return;

    const c = this.cfg;
    const hpFrac = train.maxHealth > 0 ? train.health / train.maxHealth : 0;
    const coalFrac = train.coalMax > 0 ? train.coal / train.coalMax : 0;
    if (progression) {
      this.playerLevel = progression.level;
      this.currentExp = progression.currentExp;
      this.expectedExp = Math.max(1, progression.expectedExp);
    }
    const expFrac = this.currentExp / this.expectedExp;

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

    const ey = cy + c.height + c.gap;
    g.fillStyle(0x223042, 1);
    g.fillRect(c.x, ey, c.width, c.height);
    g.fillStyle(0x58a6ff, 1);
    g.fillRect(c.x, ey, c.width * Math.max(0, Math.min(1, expFrac)), c.height);

    const motion =
      !train.hasCoal() && ridingTrain
        ? 'No coal — train stopped'
        : ridingTrain
          ? 'Riding — W accelerate, S brake'
          : 'On foot — board engine (E)';
    const carts = `${train.getCarriageCount()}/${train.getMaxCarriageCount()}`;
    this.text.setText(
      `WASD · E board/leave (engine only)\nTrain HP ${Math.ceil(train.health)}/${train.maxHealth} · Fuel ${Math.ceil(train.coal)}/${train.coalMax}\nEXP Lv.${this.playerLevel} ${Math.floor(this.currentExp)}/${Math.floor(this.expectedExp)}\nSpeed ${Math.ceil(train.getSpeed())}/${Math.ceil(train.getMaxSpeed())} · Carts ${carts}\n${motion}`,
    );
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.gfx.setVisible(on);
    this.text.setVisible(on);
    this.waveStartText?.setVisible(on);
    this.waveCompletedText?.setVisible(on);
    this.waveInfoText?.setVisible(on);
    this.betweenWaveText?.setVisible(on);
  }

  /**
   * Called when a wave starts
   */
  onWaveStarted(waveNumber: number, _totalEnemies: number): void {
    this.waveStartAlpha = 1;
    if (this.waveStartText) {
      this.waveStartText.setText(`Wave ${waveNumber}`);
      this.waveStartText.setAlpha(1);
    }
  }

  /**
   * Called when a wave completes
   */
  onWaveCompleted(_waveNumber: number): void {
    this.betweenWaveTimer = 3; // 3 seconds
    if (this.waveCompletedText) {
      this.waveCompletedText.setAlpha(1);
    }
    if (this.betweenWaveText) {
      this.betweenWaveText.setAlpha(1);
    }
  }

  /**
   * Update wave information display
   */
  updateWaveInfo(waves: WaveSystem): void {
    // Fade out wave start text
    if (this.waveStartAlpha > 0) {
      this.waveStartAlpha = Math.max(0, this.waveStartAlpha - 0.02);
      if (this.waveStartText) {
        this.waveStartText.setAlpha(this.waveStartAlpha);
      }
    }

    // Update wave info (alive and remaining)
    const aliveCount = waves.getTotalAliveEnemies();
    const remainingCount = waves.getTotalRemainingToSpawn();

    if (this.waveInfoText) {
      this.waveInfoText.setText(`Endless Run\nEnemies: ${aliveCount} alive\nIncoming: ${remainingCount}`);
    }

    // Handle between-wave display
    if (waves.getState() === 'between_waves') {
      this.betweenWaveTimer -= this.scene.game.loop.delta / 1000;
      if (this.betweenWaveTimer > 0) {
        if (this.betweenWaveText) {
          this.betweenWaveText.setText(`Next wave in ${Math.ceil(this.betweenWaveTimer)}s`);
          this.betweenWaveText.setAlpha(1);
        }
      } else {
        if (this.waveCompletedText) {
          this.waveCompletedText.setAlpha(0);
        }
        if (this.betweenWaveText) {
          this.betweenWaveText.setAlpha(0);
        }
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.text.destroy();
    this.waveStartText?.destroy();
    this.waveCompletedText?.destroy();
    this.waveInfoText?.destroy();
    this.betweenWaveText?.destroy();
  }
}
