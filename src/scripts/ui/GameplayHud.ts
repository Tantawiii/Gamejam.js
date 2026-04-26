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
  private readonly hpBarText: Phaser.GameObjects.Text;
  private readonly coalBarText: Phaser.GameObjects.Text;
  private readonly expBarText: Phaser.GameObjects.Text;
  private readonly cfg = MAIN_HUD_BARS;
  
  // Wave display
  private waveStartText?: Phaser.GameObjects.Text;
  private waveCompletedText?: Phaser.GameObjects.Text;
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

    this.hpBarText = scene.add
      .text(scene.scale.width * 0.5, 28, '', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '15px',
        color: '#f0f6fc',
        stroke: '#0f1720',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(5000);

    this.expBarText = scene.add
      .text(scene.scale.width * 0.5, scene.scale.height - 26, '', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '15px',
        color: '#f0f6fc',
        stroke: '#0f1720',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(5000);

    this.coalBarText = scene.add
      .text(scene.scale.width * 0.5, 52, '', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '15px',
        color: '#f0f6fc',
        stroke: '#0f1720',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
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
    _ridingTrain: boolean,
    progression?: { level: number; currentExp: number; expectedExp: number },
  ): void {
    if (!this.visible) return;

    const c = this.cfg;
    const hpFrac = train.maxHealth > 0 ? train.health / train.maxHealth : 0;
    const fuelFrac = train.coalMax > 0 ? train.coal / train.coalMax : 0;
    if (progression) {
      this.playerLevel = progression.level;
      this.currentExp = progression.currentExp;
      this.expectedExp = Math.max(1, progression.expectedExp);
    }
    const expFrac = this.currentExp / this.expectedExp;

    const g = this.gfx;
    g.clear();

    const barWidth = 360;
    const barHeight = 20;
    const hpX = Math.floor(this.scene.scale.width * 0.5 - barWidth * 0.5);
    const hpY = 18;
    g.fillStyle(c.hpBg, 0.48);
    g.fillRoundedRect(hpX, hpY, barWidth, barHeight, 6);
    g.fillStyle(c.hpFg, 0.74);
    g.fillRoundedRect(hpX, hpY, barWidth * Math.max(0, Math.min(1, hpFrac)), barHeight, 6);
    this.hpBarText.setPosition(this.scene.scale.width * 0.5, hpY + barHeight * 0.5);
    this.hpBarText.setText(`HP ${Math.ceil(train.health)}/${train.maxHealth}`);
    this.hpBarText.setAlpha(0.82);

    const fuelX = hpX;
    const fuelY = hpY + barHeight + 8;
    g.fillStyle(c.coalBg, 0.48);
    g.fillRoundedRect(fuelX, fuelY, barWidth, barHeight, 6);
    g.fillStyle(0x111111, 0.74);
    g.fillRoundedRect(
      fuelX,
      fuelY,
      barWidth * Math.max(0, Math.min(1, fuelFrac)),
      barHeight,
      6,
    );
    this.coalBarText.setPosition(this.scene.scale.width * 0.5, fuelY + barHeight * 0.5);
    this.coalBarText.setText(`Coal ${Math.ceil(train.coal)}/${train.coalMax}`);
    this.coalBarText.setAlpha(0.82);

    const expX = Math.floor(this.scene.scale.width * 0.5 - barWidth * 0.5);
    const expY = this.scene.scale.height - 36;
    g.fillStyle(0x223042, 0.48);
    g.fillRoundedRect(expX, expY, barWidth, barHeight, 6);
    g.fillStyle(0x58a6ff, 0.74);
    g.fillRoundedRect(expX, expY, barWidth * Math.max(0, Math.min(1, expFrac)), barHeight, 6);
    this.expBarText.setPosition(this.scene.scale.width * 0.5, expY + barHeight * 0.5);
    this.expBarText.setAlpha(0.82);
    this.expBarText.setText(
      `EXP Lv.${this.playerLevel} ${Math.floor(this.currentExp)}/${Math.floor(this.expectedExp)}`,
    );
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.gfx.setVisible(on);
    this.hpBarText.setVisible(on);
    this.coalBarText.setVisible(on);
    this.expBarText.setVisible(on);
    this.waveStartText?.setVisible(on);
    this.waveCompletedText?.setVisible(on);
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

    // Top-left wave info removed per UI cleanup request.

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
    this.hpBarText.destroy();
    this.coalBarText.destroy();
    this.expBarText.destroy();
    this.waveStartText?.destroy();
    this.waveCompletedText?.destroy();
    this.betweenWaveText?.destroy();
  }
}
