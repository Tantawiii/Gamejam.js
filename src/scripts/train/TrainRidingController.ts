import * as Phaser from 'phaser';
import {
  MAIN_PLAYER_OUTSIDE_TRAIN_GAP,
  MAIN_PLAYER_VIEW_PAD,
} from '../game/gameConfig';
import type { PlayerController } from '../player/PlayerController';
import type { TrainController } from './TrainController';

/**
 * E to board / disembark. While riding, player stays on the starboard side of the hull
 * (offset from train center) and moves only inside the camera view.
 */
export class TrainRidingController {
  private riding = false;
  private readonly rideOffset = new Phaser.Math.Vector2();

  constructor(
    private readonly train: TrainController,
    private readonly player: PlayerController,
    private readonly keyRide: Phaser.Input.Keyboard.Key,
  ) {}

  isRiding(): boolean {
    return this.riding;
  }

  private resetRideOffsetToStarboard(): void {
    const t = this.train.body;
    const r = this.player.getRadius();
    const gap = MAIN_PLAYER_OUTSIDE_TRAIN_GAP;
    this.rideOffset.set(t.width * 0.5 + gap + r, 0);
  }

  /** Call before the train steps so cruise state matches the same frame. */
  processMountInput(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.keyRide)) return;

    if (this.riding) {
      this.riding = false;
      const t = this.train.body;
      const r = this.player.getRadius();
      const gap = MAIN_PLAYER_OUTSIDE_TRAIN_GAP;
      this.player.sprite.setPosition(
        t.x + t.width * 0.5 + gap + r,
        t.y + 28,
      );
    } else if (
      this.train.canBoardFrom(this.player.sprite.x, this.player.sprite.y)
    ) {
      this.riding = true;
      this.resetRideOffsetToStarboard();
    }
  }

  /** Call after {@link TrainController#update} so the player follows the moved hull. */
  updatePlayerMotion(
    deltaMs: number,
    camera: Phaser.Cameras.Scene2D.Camera,
  ): void {
    if (this.riding) {
      this.player.applyRideFromTrainOffset(
        deltaMs,
        this.train.body,
        camera,
        this.rideOffset,
        MAIN_PLAYER_OUTSIDE_TRAIN_GAP,
        MAIN_PLAYER_VIEW_PAD,
      );
      this.player.sprite.setVisible(false);
    } else {
      this.player.sprite.setVisible(true);
      this.player.updateOnFoot(
        deltaMs,
        this.train.getHullRects(),
        camera,
        MAIN_PLAYER_VIEW_PAD,
      );
    }
  }
}
