import * as Phaser from 'phaser';
import { CardPityState } from '../scripts/card/CardPityState';
import { CardDraftSystem, type CardOffer } from '../scripts/card/CardDraftSystem';
import { configureGameplayCamera } from '../scripts/camera/configureGameplayCamera';
import { WaveSystem } from '../scripts/waves/WaveSystem';
import { DownwardParallaxBackground } from '../scripts/parallax/DownwardParallaxBackground';
import {
  MAIN_CAMERA_SHAKE_ON_TRAIN_HIT,
  MAIN_COAL_PICKUP,
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
import { TrainTurretSystem, type WeaponType } from '../scripts/train/TrainTurretSystem';
import { GameplayHud } from '../scripts/ui/GameplayHud';
import { createGreySmokeVfx } from '../scripts/vfx/SmokeVfx';

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
  private waves?: WaveSystem;
  private coalPickups?: CoalPickupManager;
  private hud?: GameplayHud;
  private engineSmoke?: Phaser.GameObjects.Particles.ParticleEmitter;
  private draft?: CardDraftSystem;
  private placementPrompt?: Phaser.GameObjects.Text;
  private pendingPlacementWeapon?: WeaponType;
  private introCutsceneActive = true;
  private introDialogueIndex = 0;
  private introBubble?: Phaser.GameObjects.Container;
  private introBubbleText?: Phaser.GameObjects.Text;
  private introHintText?: Phaser.GameObjects.Text;
  private introAutoTimer?: Phaser.Time.TimerEvent;
  private introTypeTimer?: Phaser.Time.TimerEvent;
  private keyEsc?: Phaser.Input.Keyboard.Key;
  private wasPointerDown = false;
  private readonly introDialogue: Array<{ speaker: 'Dad' | 'Son'; text: string }> = [
    {
      speaker: 'Son',
      text: "Dad, are we really living on this train now? This wasn't in my summer plans.",
    },
    {
      speaker: 'Dad',
      text: 'Temporary setup, kiddo. Rent is wild and rails are free if you keep moving.',
    },
    {
      speaker: 'Son',
      text: 'So our address is... wherever the smoke cloud points?',
    },
    {
      speaker: 'Dad',
      text: 'Exactly. Mobile office, mobile kitchen, mobile questionable parenting decisions.',
    },
    {
      speaker: 'Son',
      text: 'If this turns into another "quick stop" adventure, I want hazard pay.',
    },
    {
      speaker: 'Dad',
      text: 'Deal. For now, hang tight. Daddy has some work to do.',
    },
  ];

  /** Wire your future card UI: pity bonus via {@link CardPityState.getCartOfferWeightBonus}. */
  readonly cardPity = new CardPityState();

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
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
    this.riding.setRiding(true);
    this.keyEsc = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.coalPickups = new CoalPickupManager(this, MAIN_COAL_PICKUP);

    this.waves = new WaveSystem(
      this,
      train,
      () => ({
        x: player.sprite.x,
        y: player.sprite.y,
      }),
      MAIN_WORLD.width,
      MAIN_WORLD.height,
      {
        onWaveStarted: (waveNumber, totalEnemies) => {
          this.hud?.onWaveStarted(waveNumber, totalEnemies);
        },
        onWaveCompleted: (waveNumber) => {
          this.hud?.onWaveCompleted(waveNumber);
          this.startCardDraft();
        },
        onEnemyDestroyed: (x, y) => {
          this.coalPickups?.spawn(x, y, 6);
        },
        onEnemyDespawned: () => {
          // Enemy went off-screen and is being respawned
        },
      },
      1.2, // difficultyMultiplier
    );

    this.turrets = new TrainTurretSystem(this, {
      ...MAIN_TURRET_SYSTEM,
      depth: MAIN_WEAPON_VISUAL_DEPTH,
    });
    this.turrets.rebuildFromTrain(train);
    this.engineSmoke = createGreySmokeVfx(this, {
      x: train.body.x,
      y: train.body.y,
      depth: MAIN_WEAPON_VISUAL_DEPTH + 3,
      alpha: 0.88,
      follow: train.body,
      followOffsetX: 0,
      followOffsetY: -train.body.height * 0.3,
    });

    this.hud = new GameplayHud(this);
    this.hud.setVisible(false);
    train.setCoalConsumptionEnabled(false);
    this.showIntroDialogue();
    this.draft = new CardDraftSystem(this, {
      canChooseCard: (card) => this.canChooseCard(card),
      onChosen: ({ card }) => this.applyChosenCard(card),
      onStartPlacement: (weaponType) => this.tryStartWeaponPlacement(weaponType),
    });

    this.events.once('shutdown', () => {
      this.engineSmoke?.stop();
      this.engineSmoke?.destroy();
      this.engineSmoke = undefined;
      this.draft?.close();
      this.placementPrompt?.destroy();
      this.placementPrompt = undefined;
      this.introAutoTimer?.destroy();
      this.introTypeTimer?.destroy();
    });
  }

  private startCardDraft(): void {
    if (this.introCutsceneActive || !this.draft) return;
    const offers = this.rollCardOffers();
    this.draft.open(offers);
  }

  private rollCardOffers(): CardOffer[] {
    const train = this.train;
    const turrets = this.turrets;
    const cartOfferWeight = 0.16 + this.cardPity.getCartOfferWeightBonus();
    const includeCart = Math.random() < cartOfferWeight;
    this.cardPity.recordCycle(includeCart);
    const pool: CardOffer[] = [
      {
        id: 'player-speed',
        label: 'Quick Boots',
        description: '+12% player movement speed.',
        kind: 'player',
      },
      {
        id: 'train-armor',
        label: 'Steel Plates',
        description: '+70 train max HP and heal by 70.',
        kind: 'train',
      },
      {
        id: 'weapon-cannon',
        label: 'Cannon Mk+',
        description: 'Upgrade Cannon. If absent, place a new Cannon.',
        kind: 'weapon',
        weaponType: 'cannon',
      },
      {
        id: 'weapon-sniper',
        label: 'Rail Sniper',
        description: 'Upgrade Sniper. If absent, place a new Sniper.',
        kind: 'weapon',
        weaponType: 'sniper',
      },
      {
        id: 'weapon-scatter',
        label: 'Scatter Pod',
        description: 'Upgrade Scatter. If absent, place a new Scatter.',
        kind: 'weapon',
        weaponType: 'scatter',
      },
    ];
    if (includeCart && train) {
      pool.push({
        id: 'train-cart',
        label: 'New Cart',
        description: 'Add one carriage with fresh weapon slots.',
        kind: 'train',
      });
    }

    const chosen: CardOffer[] = [];
    while (chosen.length < 3 && pool.length > 0) {
      const idx = Phaser.Math.Between(0, pool.length - 1);
      const [card] = pool.splice(idx, 1);
      if (card) chosen.push(card);
    }
    if (!turrets?.hasFreeSlot()) {
      this.addMissingWeaponFallback(chosen, pool);
    }
    return chosen;
  }

  private addMissingWeaponFallback(chosen: CardOffer[], pool: CardOffer[]): void {
    const hasNonWeapon = chosen.some((c) => c.kind !== 'weapon');
    if (hasNonWeapon) return;
    const fallback = pool.find((c) => c.kind !== 'weapon');
    if (!fallback) return;
    chosen.pop();
    chosen.push(fallback);
  }

  private canChooseCard(card: CardOffer): boolean {
    if (card.kind !== 'weapon' || !card.weaponType || !this.turrets) return true;
    return (
      this.turrets.hasWeaponType(card.weaponType) || this.turrets.hasFreeSlot()
    );
  }

  private applyChosenCard(card: CardOffer): void {
    if (!this.train || !this.turrets || !this.player) return;
    switch (card.id) {
      case 'player-speed':
        this.player.addWalkSpeedMultiplier(0.12);
        break;
      case 'train-armor':
        this.train.addMaxHealth(70);
        break;
      case 'train-cart':
        this.addCarriageFromCard();
        break;
      default:
        break;
    }
  }

  private tryStartWeaponPlacement(type: WeaponType): void {
    if (!this.turrets || !this.train) return;
    if (this.turrets.upgradeMatchingWeapon(type)) {
      return;
    }
    if (!this.turrets.hasFreeSlot()) {
      return;
    }
    this.pendingPlacementWeapon = type;
    this.placementPrompt?.destroy();
    this.placementPrompt = this.add
      .text(
        this.scale.width * 0.5,
        24,
        `Place ${type.toUpperCase()}: tap/click near desired cart slot`,
        {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '20px',
          color: '#ffe08a',
          backgroundColor: '#1a2230',
          padding: { left: 12, right: 12, top: 6, bottom: 6 },
        },
      )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(8100);
  }

  private showIntroDialogue(): void {
    this.introAutoTimer?.destroy();
    this.introAutoTimer = undefined;
    this.introTypeTimer?.destroy();
    this.introTypeTimer = undefined;
    this.introBubble?.destroy();
    this.introBubbleText = undefined;
    const { width, height } = this.scale;
    const bubbleWidth = 680;
    const bubbleHeight = 170;
    const line = this.introDialogue[this.introDialogueIndex];
    const speaker = line?.speaker ?? 'Dad';
    const bubbleX =
      speaker === 'Dad' ? width * 0.08 : width - bubbleWidth - width * 0.08;
    const bubbleY = height - bubbleHeight - 36;
    const text = line?.text ?? '';
    const bubble = this.createSpeechBubble(
      bubbleX,
      bubbleY,
      bubbleWidth,
      bubbleHeight,
      speaker,
    );
    this.introBubble = bubble.container;
    this.introBubbleText = bubble.content;
    this.introBubble.setScrollFactor(0).setDepth(7000);
    this.introBubbleText.setText('');

    this.introHintText?.destroy();
    this.introHintText = this.add
      .text(width * 0.5, height - 8, 'Auto dialogue... ESC to skip', {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '16px',
        color: '#d1d5db',
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(7001);
    this.startTypewriter(text);
  }

  private startTypewriter(line: string): void {
    const content = this.introBubbleText;
    if (!content) return;
    let idx = 0;
    this.introTypeTimer = this.time.addEvent({
      delay: 26,
      loop: true,
      callback: () => {
        if (!this.introCutsceneActive) {
          this.introTypeTimer?.destroy();
          this.introTypeTimer = undefined;
          return;
        }
        idx += 1;
        content.setText(line.slice(0, idx));
        if (idx >= line.length) {
          this.introTypeTimer?.destroy();
          this.introTypeTimer = undefined;
          this.introAutoTimer = this.time.delayedCall(3000, () =>
            this.advanceIntroDialogue(),
          );
        }
      },
    });
  }

  private createSpeechBubble(
    x: number,
    y: number,
    width: number,
    height: number,
    speaker: 'Dad' | 'Son',
  ): { container: Phaser.GameObjects.Container; content: Phaser.GameObjects.Text } {
    const bubblePadding = 16;
    const arrowHeight = Math.floor(height / 4);
    const bubble = this.add.graphics({ x: 0, y: 0 });

    bubble.fillStyle(0x222222, 0.5);
    bubble.fillRoundedRect(6, 6, width, height, 16);
    bubble.fillStyle(0xffffff, 1);
    bubble.lineStyle(4, 0x565656, 1);
    bubble.strokeRoundedRect(0, 0, width, height, 16);
    bubble.fillRoundedRect(0, 0, width, height, 16);

    const arrowOnLeft = speaker === 'Dad';
    const point1X = arrowOnLeft ? Math.floor(width / 7) : Math.floor((width / 7) * 6);
    const point1Y = height;
    const point2X = arrowOnLeft
      ? Math.floor((width / 7) * 2)
      : Math.floor((width / 7) * 5);
    const point2Y = height;
    const point3X = point1X;
    const point3Y = height + arrowHeight;

    bubble.lineStyle(4, 0x222222, 0.5);
    bubble.lineBetween(point2X - 1, point2Y + 6, point3X + 2, point3Y);
    bubble.fillTriangle(point1X, point1Y, point2X, point2Y, point3X, point3Y);
    bubble.lineStyle(2, 0x565656, 1);
    bubble.lineBetween(point2X, point2Y, point3X, point3Y);
    bubble.lineBetween(point1X, point1Y, point3X, point3Y);

    const content = this.add.text(width * 0.5, height * 0.5, '', {
      fontFamily: 'Arial',
      fontSize: '27px',
      color: '#000000',
      align: 'center',
      wordWrap: { width: width - bubblePadding * 2 },
    }).setOrigin(0.5);

    const speakerTag = this.add
      .text(12, -8, speaker, {
        fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '22px',
        color: '#facc22',
      })
      .setOrigin(0, 1);

    const container = this.add.container(x, y, [bubble, content, speakerTag]);
    return { container, content };
  }

  private advanceIntroDialogue(): void {
    if (!this.introCutsceneActive) return;
    this.introDialogueIndex += 1;
    if (this.introDialogueIndex >= this.introDialogue.length) {
      this.finishIntroCutscene();
      return;
    }
    this.showIntroDialogue();
  }

  private finishIntroCutscene(): void {
    this.introCutsceneActive = false;
    this.introAutoTimer?.destroy();
    this.introAutoTimer = undefined;
    this.introTypeTimer?.destroy();
    this.introTypeTimer = undefined;
    this.introBubble?.destroy();
    this.introBubble = undefined;
    this.introBubbleText = undefined;
    this.introHintText?.destroy();
    this.introHintText = undefined;
    this.train?.setCoalConsumptionEnabled(true);
    this.hud?.setVisible(true);
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
    if (this.keyEsc && Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.finishIntroCutscene();
    }

    if (!this.introCutsceneActive && !this.draft?.isActive() && !this.pendingPlacementWeapon) {
      this.riding?.processMountInput();
    }

    const gameplayLocked =
      this.introCutsceneActive ||
      !!this.pendingPlacementWeapon ||
      (this.draft?.isActive() ?? false);
    const cardsActive = !!this.pendingPlacementWeapon || (this.draft?.isActive() ?? false);

    if (this.pendingPlacementWeapon && this.train && this.turrets) {
      const ptr = this.input.activePointer;
      const justPressed = ptr.isDown && !this.wasPointerDown;
      if (justPressed) {
        const worldPoint = cam.getWorldPoint(ptr.x, ptr.y);
        const slot = this.turrets.getClosestEmptySlotIndex(
          worldPoint.x,
          worldPoint.y,
          this.train,
        );
        if (slot !== null) {
          this.turrets.placeWeaponAtSlot(slot, this.pendingPlacementWeapon);
          this.pendingPlacementWeapon = undefined;
          this.placementPrompt?.destroy();
          this.placementPrompt = undefined;
        }
      }
      this.wasPointerDown = ptr.isDown;
    } else {
      this.wasPointerDown = false;
    }

    const ridingNow = this.riding?.isRiding() ?? false;
    const train = this.train;
    const coalOk = train?.hasCoal() ?? false;

    const shouldCruise = this.introCutsceneActive
      ? true
      : !gameplayLocked && ridingNow;
    this.train?.setCruising(shouldCruise);
    if (shouldCruise && (coalOk || this.introCutsceneActive)) {
      this.parallax?.update(delta);
    }
    this.train?.update(delta);

    if (!cardsActive) {
      this.riding?.updatePlayerMotion(delta, cam);
    }

    const waves = this.waves;
    if (this.introCutsceneActive && train && waves) {
      this.turrets?.update(delta, train, waves, false);
    } else if (!cardsActive && train && waves) {
      waves.update(delta);
      waves.updateEnemies(delta);
      const hulls = train.getHullRects();
      waves.updateCollisions(hulls, () => {
        const s = MAIN_CAMERA_SHAKE_ON_TRAIN_HIT;
        this.cameras.main.shake(s.durationMs, s.intensity, true);
      });
      this.turrets?.update(delta, train, waves, coalOk);
      this.hud?.updateWaveInfo(waves);
    }

    const player = this.player;
    if (!this.introCutsceneActive && train && this.coalPickups && player) {
      this.coalPickups.update(
        delta,
        player.sprite.x,
        player.sprite.y,
        MAIN_PLAYER_VISUAL.radius,
        train,
      );
    }

    if (!this.introCutsceneActive && train && this.hud) {
      this.hud.update(train, ridingNow);
    }
  }
}
