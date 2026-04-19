import * as Phaser from 'phaser';
import { CardPityState } from '../scripts/card/CardPityState';
import { configureGameplayCamera } from '../scripts/camera/configureGameplayCamera';
import { EnemySwarm } from '../scripts/enemy/EnemySwarm';
import { DownwardParallaxBackground } from '../scripts/parallax/DownwardParallaxBackground';
import {
  MAIN_CAMERA_SHAKE_ON_TRAIN_HIT,
  MAIN_COAL_PICKUP,
  MAIN_ENEMY_SWARM,
  MAIN_PARALLAX_LAYERS,
  MAIN_PLAYER_SPAWN_OFFSET,
  MAIN_PLAYER_VISUAL,
  MAIN_TRAIN_COAL,
  MAIN_TRAIN_FLEET,
  MAIN_TRAIN_SPAWN,
  MAIN_TURRET_SYSTEM,
  MAIN_WEAPON_VISUAL_DEPTH,
  MAIN_WORLD,
} from '../scripts/game/gameConfig';
import { CoalPickupManager } from '../scripts/pickups/CoalPickupManager';
import { PlayerController } from '../scripts/player/PlayerController';
import { TrainController } from '../scripts/train/TrainController';
import { TrainRidingController } from '../scripts/train/TrainRidingController';
import { TrainTurretSystem } from '../scripts/train/TrainTurretSystem';
import { GameplayHud } from '../scripts/ui/GameplayHud';

/**
 * Starter scene — replace with your jam game.
 * Theme: Machines! (Gamedev.js Jam 2026)
 */
export class MainScene extends Phaser.Scene {
  private parallax?: DownwardParallaxBackground;
  private train?: TrainController;
  private player?: PlayerController;
  private riding?: TrainRidingController;
  private turrets?: TrainTurretSystem;
  private enemies?: EnemySwarm;
  private coalPickups?: CoalPickupManager;
  private hud?: GameplayHud;

  /** Wire your future card UI: pity bonus via {@link CardPityState.getCartOfferWeightBonus}. */
  readonly cardPity = new CardPityState();

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.parallax = new DownwardParallaxBackground(this, {
      depth: -1000,
      layers: MAIN_PARALLAX_LAYERS,
    });

    const startX = MAIN_WORLD.width * MAIN_TRAIN_SPAWN.xFrac;
    const startY = MAIN_WORLD.height * MAIN_TRAIN_SPAWN.yFrac;

    const train = new TrainController(this, {
      x: startX,
      y: startY,
      engineWidth: MAIN_TRAIN_SPAWN.engineWidth,
      engineHeight: MAIN_TRAIN_SPAWN.engineHeight,
      cruiseSpeed: MAIN_TRAIN_SPAWN.cruiseSpeed,
      maxHealth: MAIN_TRAIN_SPAWN.maxHealth,
      coalMax: MAIN_TRAIN_SPAWN.coalMax,
      startingCoal: MAIN_TRAIN_SPAWN.startingCoal,
      fleet: MAIN_TRAIN_FLEET,
      coal: MAIN_TRAIN_COAL,
      fillColor: MAIN_TRAIN_SPAWN.fillColor,
      depth: MAIN_TRAIN_SPAWN.depth,
      boardingRadius: MAIN_TRAIN_SPAWN.boardingRadius,
    });

    const player = new PlayerController(this, {
      x: startX + MAIN_PLAYER_SPAWN_OFFSET.x,
      y: startY + MAIN_PLAYER_SPAWN_OFFSET.y,
      radius: MAIN_PLAYER_VISUAL.radius,
      fillColor: MAIN_PLAYER_VISUAL.fillColor,
      strokeColor: MAIN_PLAYER_VISUAL.strokeColor,
      strokeWidth: MAIN_PLAYER_VISUAL.strokeWidth,
      depth: MAIN_PLAYER_VISUAL.depth,
      walkSpeed: MAIN_PLAYER_VISUAL.walkSpeed,
    });

    this.train = train;
    this.player = player;

    configureGameplayCamera(
      this,
      MAIN_WORLD.width,
      MAIN_WORLD.height,
      train.body,
    );

    const keyRide = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.E,
    );
    if (!keyRide) {
      throw new Error('MainScene requires keyboard input');
    }

    this.riding = new TrainRidingController(train, player, keyRide);

    this.coalPickups = new CoalPickupManager(this, MAIN_COAL_PICKUP);

    this.enemies = new EnemySwarm(
      this,
      train,
      () => ({
        x: player.sprite.x,
        y: player.sprite.y,
      }),
      {
        ...MAIN_ENEMY_SWARM,
        playerRadius: MAIN_PLAYER_VISUAL.radius,
        // TODO: Re-enable when implementing player mechanics
        // onPlayerCollide: () => {
        //   this.scene.start('GameOverScene');
        // },
        onTrainDamagedByEnemy: () => {
          const s = MAIN_CAMERA_SHAKE_ON_TRAIN_HIT;
          this.cameras.main.shake(s.durationMs, s.intensity, true);
        },
        onEnemyDestroyed: (x, y) => {
          this.coalPickups?.spawn(x, y, MAIN_ENEMY_SWARM.coalDropOnKill);
        },
        enableVariants: true, // Enable enemy variants
      },
    );

    this.turrets = new TrainTurretSystem(this, {
      ...MAIN_TURRET_SYSTEM,
      depth: MAIN_WEAPON_VISUAL_DEPTH,
    });
    this.turrets.rebuildFromTrain(train);

    this.hud = new GameplayHud(this);
  }

  /**
   * When a card grants a new carriage: extends the train and rebuilds turrets (4 guns per carriage).
   */
  addCarriageFromCard(): void {
    this.train?.addCarriage();
    if (this.train && this.turrets) {
      this.turrets.rebuildFromTrain(this.train);
    }
  }

  override update(_time: number, delta: number): void {
    const cam = this.cameras.main;
    this.riding?.processMountInput();

    const ridingNow = this.riding?.isRiding() ?? false;
    const train = this.train;
    const coalOk = train?.hasCoal() ?? false;

    this.train?.setCruising(ridingNow);
    if (ridingNow && coalOk) {
      this.parallax?.update(delta);
    }
    this.train?.update(delta);

    this.riding?.updatePlayerMotion(delta, cam);

    const enemies = this.enemies;
    if (train && enemies) {
      enemies.update(delta);
      this.turrets?.update(delta, train, enemies, coalOk);
    }

    const player = this.player;
    if (train && this.coalPickups && player) {
      this.coalPickups.update(
        player.sprite.x,
        player.sprite.y,
        MAIN_PLAYER_VISUAL.radius,
        train,
      );
    }

    if (train && this.hud) {
      this.hud.update(train, ridingNow);
    }
  }
}
