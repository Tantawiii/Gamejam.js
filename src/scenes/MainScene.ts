import * as Phaser from 'phaser';
import { CardPityState } from '../scripts/card/CardPityState';
import { CardDraftSystem, type CardOffer } from '../scripts/card/CardDraftSystem';
import { configureGameplayCamera } from '../scripts/camera/configureGameplayCamera';
import { WaveSystem } from '../scripts/waves/WaveSystem';
import type { EnemyType } from '../scripts/waves/WaveConfiguration';
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
  private introCurrentLine = '';
  private introTypedChars = 0;
  private introPointerWasDown = false;
  private keyEsc?: Phaser.Input.Keyboard.Key;
  private keyAccelerate?: Phaser.Input.Keyboard.Key;
  private keyBrake?: Phaser.Input.Keyboard.Key;
  private wasPointerDown = false;
  private nextTrainHitShakeAt = 0;
  private nightTint?: Phaser.GameObjects.Rectangle;
  private trainNightLight?: Phaser.GameObjects.Image;
  private playerNightLight?: Phaser.GameObjects.Image;
  private railSegments: Phaser.GameObjects.Image[] = [];
  private gateTopSprites: Phaser.GameObjects.Image[] = [];
  private gateBottomSprites: Phaser.GameObjects.Image[] = [];
  private gateBlockers: Phaser.GameObjects.Rectangle[] = [];
  private currentCameraZoom = 1;
  private dayNightCycleMs = 0;
  private hasShownFirstNightWarning = false;
  private readonly dayNightCycleDurationMs = 220000;
  private readonly introScrollSpeed = 42;
  private readonly nightWarningThreshold = 0.46;
  private readonly nightLightStartThreshold = 0.32;
  private readonly introDialogue: Array<{ speaker: 'Dad' | 'Son'; text: string }> = [
    {
      speaker: 'Son',
      text: 'Dad... are we seriously commuting through the apocalypse on a train?',
    },
    {
      speaker: 'Dad',
      text: 'Post-Skynet housing market is brutal. Rails are free if killer drones do not catch us.',
    },
    {
      speaker: 'Son',
      text: 'So our home address is "Sector 9 Wasteland, moving target"?',
    },
    {
      speaker: 'Dad',
      text: 'Exactly. Mobile bunker, mobile kitchen, and one highly questionable parenting AI policy.',
    },
    {
      speaker: 'Son',
      text: 'If a chrome skull says "I will be back," I am hiding under the coal bin.',
    },
    {
      speaker: 'Dad',
      text: 'Good instinct. Stay low, trust nobody with red eyes, and let me handle the tin cans.',
    },
  ];

  /** Wire your future card UI: pity bonus via {@link CardPityState.getCartOfferWeightBonus}. */
  readonly cardPity = new CardPityState();
  private playerLevel = 1;
  private currentExp = 0;
  private expectedExp = 1500;
  private draftCount = 0;

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.parallax = new DownwardParallaxBackground(this, {
      depth: -1000,
      layers: MAIN_PARALLAX_LAYERS,
    });
    if (!this.textures.exists('night_light_stamp')) {
      const g = this.add.graphics({ x: 0, y: 0 });
      const r = 128;
      for (let i = r; i > 0; i -= 4) {
        const t = i / r;
        g.fillStyle(0xffffff, 0.01 + t * 0.09);
        g.fillCircle(r, r, i);
      }
      g.generateTexture('night_light_stamp', r * 2, r * 2);
      g.destroy();
    }
    this.nightTint = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x05070d, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(6800);
    this.trainNightLight = this.add
      .image(-9999, -9999, 'night_light_stamp')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setScrollFactor(1)
      .setDepth(6801);
    this.playerNightLight = this.add
      .image(-9999, -9999, 'night_light_stamp')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setScrollFactor(1)
      .setDepth(6802);
    if (this.textures.exists('rail_vertical')) {
      const frame = this.textures.getFrame('rail_vertical');
      const srcW = frame?.width ?? 96;
      const srcH = frame?.height ?? 256;
      const engineFrame = this.textures.getFrame('train_engine_cart');
      const targetRailW = Math.max(52, Math.floor((engineFrame?.width ?? srcW) * 0.66));
      const railScale = targetRailW / srcW;
      const stepY = Math.max(1, srcH * railScale);
      // Pre-spawn far above screen so aggressive zoom-out never reveals an empty top gap.
      const upperSpawnY = -Math.max(this.scale.height * 3, stepY * 8);
      const lowerSpawnY = this.scale.height + stepY * 2;
      for (let y = upperSpawnY; y <= lowerSpawnY; y += stepY) {
        const rail = this.add
          .image(this.scale.width * 0.5, y, 'rail_vertical')
          .setScrollFactor(0)
          .setDepth(-900);
        rail.setOrigin(0.5, 0);
        rail.setScale(railScale);
        this.railSegments.push(rail);
      }
    }

    const startX = MAIN_WORLD.width * MAIN_TRAIN_SPAWN.xFrac;
    const startY = MAIN_WORLD.height * MAIN_TRAIN_SPAWN.yFrac;

    const train = new TrainController(this, {
      x: startX,
      y: startY,
      engineWidth: MAIN_TRAIN_SPAWN.engineWidth,
      engineHeight: MAIN_TRAIN_SPAWN.engineHeight,
      baseAcceleration: MAIN_TRAIN_SPAWN.baseAcceleration,
      baseBrakeDeceleration: MAIN_TRAIN_SPAWN.baseBrakeDeceleration,
      baseDragDeceleration: MAIN_TRAIN_SPAWN.baseDragDeceleration,
      maxSpeed: MAIN_TRAIN_SPAWN.maxSpeed,
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
    this.currentCameraZoom = 1;

    const keyRide = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.E,
    );
    if (!keyRide) {
      throw new Error('MainScene requires keyboard input');
    }

    this.riding = new TrainRidingController(train, player, keyRide);
    this.riding.setRiding(true);
    this.keyEsc = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyAccelerate = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyBrake = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S);

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
        },
        onEnemyDestroyed: (x, y, type) => {
          this.coalPickups?.spawn(x, y, 6);
          const gained = this.rollExpDrop(type);
          this.gainExperience(gained);
          this.showExpGainText(x, y, gained);
        },
        onEnemyDespawned: () => {
          // Enemy went off-screen and is being respawned
        },
      },
      1.04, // difficultyMultiplier
      320,
      620,
      () => this.playerLevel,
    );

    this.turrets = new TrainTurretSystem(this, {
      ...MAIN_TURRET_SYSTEM,
      depth: MAIN_WEAPON_VISUAL_DEPTH,
    });
    this.turrets.rebuildFromTrain(train);
    this.engineSmoke = createGreySmokeVfx(this, {
      x: train.body.x,
      y: train.body.y,
      depth: MAIN_TRAIN_SPAWN.depth + 80,
      alpha: 0.85,
      follow: train.body,
      followOffsetX: 0,
      followOffsetY: -train.body.height * 0.42,
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
      this.nightTint?.destroy();
      this.trainNightLight?.destroy();
      this.playerNightLight?.destroy();
      this.gateTopSprites.forEach((g) => g.destroy());
      this.gateBottomSprites.forEach((g) => g.destroy());
      this.gateBlockers.forEach((g) => g.destroy());
    });
  }

  private renderNightLighting(nightStrength: number, ridingNow: boolean): void {
    const tint = this.nightTint;
    const trainLight = this.trainNightLight;
    const playerLight = this.playerNightLight;
    const train = this.train;
    if (!tint || !trainLight || !playerLight || !train) return;
    const darkness = 0.58 * Phaser.Math.Clamp(nightStrength, 0, 1);
    const lightStrength = Phaser.Math.Clamp(
      (nightStrength - this.nightLightStartThreshold) /
        (1 - this.nightLightStartThreshold),
      0,
      1,
    );
    tint.setFillStyle(0x05070d, darkness);
    if (darkness <= 0.001) {
      trainLight.setAlpha(0);
      playerLight.setAlpha(0);
      return;
    }

    // Train light: ellipse from full fleet bounds (engine + all carriages).
    const hulls = train.getHullRects();
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const h of hulls) {
      const l = h.x - h.width * 0.5;
      const r = h.x + h.width * 0.5;
      const t = h.y - h.height * 0.5;
      const b = h.y + h.height * 0.5;
      minX = Math.min(minX, l);
      maxX = Math.max(maxX, r);
      minY = Math.min(minY, t);
      maxY = Math.max(maxY, b);
    }
    const fleetCenterX = (minX + maxX) * 0.5;
    const fleetCenterY = (minY + maxY) * 0.5;
    const fleetWidth = Math.max(1, maxX - minX);
    const fleetHeight = Math.max(1, maxY - minY);
    trainLight.setPosition(fleetCenterX, fleetCenterY);
    const stampSize = 256;
    const trainLightW = fleetWidth * 1.34;
    const trainLightH = fleetHeight * 1.24;
    trainLight.setScale(trainLightW / stampSize, trainLightH / stampSize);
    trainLight.setAlpha(0.33 * lightStrength);

    // On-foot light: circular lamp around player.
    const player = this.player?.sprite;
    if (!ridingNow && player) {
      playerLight.setPosition(player.x, player.y);
      const playerRadius = MAIN_PLAYER_VISUAL.radius * 2.1;
      const playerScale = (playerRadius * 2) / stampSize;
      playerLight.setScale(playerScale, playerScale);
      playerLight.setAlpha(0.28 * lightStrength);
    } else {
      playerLight.setAlpha(0);
    }
  }

  private rollExpDrop(type: EnemyType): number {
    switch (type) {
      case 'basic':
        return Phaser.Math.Between(20, 25);
      case 'bomb':
        return Phaser.Math.Between(30, 35);
      case 'chunky':
        return Phaser.Math.Between(50, 55);
      case 'long_range':
        return Phaser.Math.Between(28, 33);
    }
  }

  private gainExperience(amount: number): void {
    if (amount <= 0) return;
    this.currentExp += amount;
    while (this.currentExp >= this.expectedExp) {
      this.currentExp -= this.expectedExp;
      this.playerLevel += 1;
      this.expectedExp = Math.ceil(this.expectedExp * 1.02);
      this.startCardDraft();
    }
  }

  private showExpGainText(x: number, y: number, amount: number): void {
    const t = this.add
      .text(x, y - 14, `+${Math.floor(amount)} EXP`, {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '18px',
        color: '#7ee787',
        stroke: '#0f1720',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(9000);
    this.tweens.add({
      targets: t,
      y: y - 52,
      alpha: 0,
      duration: 900,
      ease: 'Sine.Out',
      onComplete: () => t.destroy(),
    });
  }

  private showFuelGainText(x: number, y: number, amount: number): void {
    const t = this.add
      .text(x, y - 10, `+${Math.floor(amount)} Coal`, {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '17px',
        color: '#f2cc60',
        stroke: '#0f1720',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(9000);
    this.tweens.add({
      targets: t,
      y: y - 44,
      alpha: 0,
      duration: 850,
      ease: 'Sine.Out',
      onComplete: () => t.destroy(),
    });
  }

  private computeNightStrength(): number {
    this.dayNightCycleMs += this.game.loop.delta;
    const phase =
      ((this.dayNightCycleMs % this.dayNightCycleDurationMs) / this.dayNightCycleDurationMs) *
      Math.PI *
      2;
    return (1 - Math.cos(phase)) * 0.5;
  }

  private showNightWarningBubble(): void {
    const text =
      "Oh what's this Emergency protocol memo: robots go haywire at night due to \"no sunlight power efficiency.\" Totally scientific. Definitely do not panic.";
    this.waves?.setSpawningPaused(true);
    const bubble = this.createSpeechBubble(54, this.scale.height - 220, 700, 150, 'Dad');
    bubble.content.setText(text);
    const c = bubble.container.setScrollFactor(0).setDepth(7050).setAlpha(0);
    this.tweens.add({
      targets: c,
      alpha: 1,
      duration: 250,
      yoyo: false,
    });
    this.time.delayedCall(5200, () => {
      this.tweens.add({
        targets: c,
        alpha: 0,
        duration: 450,
        onComplete: () => {
          c.destroy();
          this.waves?.setSpawningPaused(false);
        },
      });
    });
  }

  private syncNightOverlayCoverage(): void {
    const tint = this.nightTint;
    if (!tint) return;
    const zoomOutCoverageMultiplier = 3;
    const w = this.scale.width * zoomOutCoverageMultiplier;
    const h = this.scale.height * zoomOutCoverageMultiplier;
    // Keep a large fixed overlay so even heavy zoom-out/camera transitions never expose edges.
    tint.setPosition(-this.scale.width, -this.scale.height);
    tint.setSize(w, h);
    tint.setDisplaySize(w, h);
  }

  private startCardDraft(): void {
    if (this.introCutsceneActive || !this.draft) return;
    const offers = this.rollCardOffers();
    this.draft.open(offers);
    this.draftCount += 1;
  }

  private rollCardOffers(): CardOffer[] {
    const train = this.train;
    const turrets = this.turrets;
    const canAddCart =
      !!train && train.getCarriageCount() < train.getMaxCarriageCount();
    const mustShowCartOnFirstDraft = this.draftCount === 0 && canAddCart;
    const firstDraftBoost = mustShowCartOnFirstDraft ? 1 : 0;
    const cartOfferWeight = Math.max(
      firstDraftBoost,
      0.16 + this.cardPity.getCartOfferWeightBonus(),
    );
    const includeCart = mustShowCartOnFirstDraft || Math.random() < cartOfferWeight;
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
        id: 'train-accel',
        label: 'Boiler Overdrive',
        description: '+18% train acceleration.',
        kind: 'train',
      },
      {
        id: 'train-speed',
        label: 'Wheels Tuning',
        description: '+18 max train speed.',
        kind: 'train',
      },
      {
        id: 'train-health-refill',
        label: 'Repair Crew',
        description: 'Refill 140 train HP.',
        kind: 'train',
      },
      {
        id: 'train-fuel-max',
        label: 'Bigger Bunker',
        description: '+35 max coal and refill by 35.',
        kind: 'train',
      },
      {
        id: 'train-fuel-refill',
        label: 'Coal Depot',
        description: 'Refill 70 coal.',
        kind: 'train',
      },
      {
        id: 'train-magnet',
        label: 'Magnet Ring',
        description: '+24 pickup magnet range.',
        kind: 'train',
      },
      {
        id: 'weapon-basic',
        label: 'Basic Turret Mk+',
        description: 'Upgrade Basic. If absent, place a new Basic turret.',
        kind: 'weapon',
        weaponType: 'basic',
      },
      {
        id: 'weapon-caterpillar',
        label: 'Caterpillar Mortar',
        description: 'Upgrade Caterpillar. If absent, place a new one.',
        kind: 'weapon',
        weaponType: 'caterpillar',
      },
      {
        id: 'weapon-sniper',
        label: 'Rail Sniper',
        description: 'Upgrade Sniper. If absent, place a new one.',
        kind: 'weapon',
        weaponType: 'sniper',
      },
      {
        id: 'weapon-shuriken',
        label: 'Shuriken Pod',
        description: 'Upgrade Shuriken. If absent, place a new Shuriken pod.',
        kind: 'weapon',
        weaponType: 'shuriken',
      },
      {
        id: 'weapon-slow-dome',
        label: 'Slowing Dome',
        description: 'Place/upgrade a dome that slows enemies near the train.',
        kind: 'weapon',
        weaponType: 'slow_dome',
      },
      {
        id: 'weapon-damage',
        label: 'High Explosives',
        description: '+18% weapon damage.',
        kind: 'weapon',
      },
      {
        id: 'weapon-range',
        label: 'Long Barrel',
        description: '+14% weapon range.',
        kind: 'weapon',
      },
      {
        id: 'weapon-speed',
        label: 'Rapid Feed',
        description: '+14% weapon attack speed.',
        kind: 'weapon',
      },
      {
        id: 'weapon-rotation',
        label: 'Servo Ring',
        description: '+15% turret rotation speed.',
        kind: 'weapon',
      },
    ];
    if (includeCart && canAddCart) {
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
    if (mustShowCartOnFirstDraft && !chosen.some((c) => c.id === 'train-cart')) {
      const replaceIdx = chosen.findIndex((c) => c.kind !== 'train');
      const idxToReplace = replaceIdx >= 0 ? replaceIdx : Math.max(0, chosen.length - 1);
      chosen[idxToReplace] = {
        id: 'train-cart',
        label: 'New Cart',
        description: 'Add one carriage with fresh weapon slots.',
        kind: 'train',
      };
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
      case 'train-accel':
        this.train.addAccelerationMultiplier(0.18);
        break;
      case 'train-speed':
        this.train.addMaxSpeed(18);
        break;
      case 'train-health-refill':
        this.train.refillHealth(140);
        break;
      case 'train-fuel-max':
        this.train.addMaxFuel(35);
        break;
      case 'train-fuel-refill':
        this.train.addCoal(70);
        break;
      case 'train-magnet':
        this.coalPickups?.addMagnetRange(24);
        break;
      case 'train-cart':
        this.addCarriageFromCard();
        break;
      case 'weapon-damage':
        this.turrets.addDamageMultiplier(0.18);
        break;
      case 'weapon-range':
        this.turrets.addRangeMultiplier(0.14);
        break;
      case 'weapon-speed':
        this.turrets.addAttackSpeedMultiplier(0.14);
        break;
      case 'weapon-rotation':
        this.turrets.addRotationSpeedMultiplier(0.15);
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
      .text(width * 0.5, height - 8, 'Click to continue • Auto dialogue • ESC to skip', {
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
    this.introCurrentLine = line;
    this.introTypedChars = 0;
    this.introTypeTimer = this.time.addEvent({
      delay: 26,
      loop: true,
      callback: () => {
        if (!this.introCutsceneActive) {
          this.introTypeTimer?.destroy();
          this.introTypeTimer = undefined;
          return;
        }
        this.introTypedChars += 1;
        content.setText(line.slice(0, this.introTypedChars));
        if (this.introTypedChars >= line.length) {
          this.introTypeTimer?.destroy();
          this.introTypeTimer = undefined;
          this.introAutoTimer = this.time.delayedCall(3000, () =>
            this.advanceIntroDialogue(),
          );
        }
      },
    });
  }

  private revealCurrentIntroLineImmediately(): void {
    if (!this.introCutsceneActive || !this.introBubbleText) return;
    this.introTypeTimer?.destroy();
    this.introTypeTimer = undefined;
    this.introBubbleText.setText(this.introCurrentLine);
    this.introTypedChars = this.introCurrentLine.length;
    this.introAutoTimer?.destroy();
    this.introAutoTimer = this.time.delayedCall(3000, () =>
      this.advanceIntroDialogue(),
    );
  }

  private handleIntroClickAdvance(): void {
    if (!this.introCutsceneActive) return;
    if (this.introTypeTimer) {
      this.revealCurrentIntroLineImmediately();
      return;
    }
    this.introAutoTimer?.destroy();
    this.introAutoTimer = undefined;
    this.advanceIntroDialogue();
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

    bubble.fillStyle(0x222222, 0.34);
    bubble.fillRoundedRect(6, 6, width, height, 16);
    bubble.fillStyle(0xffffff, 0.58);
    bubble.lineStyle(4, 0x565656, 0.72);
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

    bubble.lineStyle(4, 0x222222, 0.34);
    bubble.lineBetween(point2X - 1, point2Y + 6, point3X + 2, point3Y);
    bubble.fillTriangle(point1X, point1Y, point2X, point2Y, point3X, point3Y);
    bubble.lineStyle(2, 0x565656, 0.72);
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
    const added = this.train?.addCarriage() ?? false;
    if (added && this.train && this.turrets) {
      this.turrets.rebuildFromTrain(this.train);
      this.currentCameraZoom = Math.max(0.76, this.currentCameraZoom - 0.06);
      const forceNightRefresh = () => {
        const strength = this.computeNightStrength();
        const ridingNow = this.riding?.isRiding() ?? false;
        this.renderNightLighting(strength, ridingNow);
      };
      forceNightRefresh();
      this.tweens.add({
        targets: this.cameras.main,
        zoom: this.currentCameraZoom,
        duration: 260,
        ease: 'Sine.Out',
        onUpdate: forceNightRefresh,
        onComplete: forceNightRefresh,
      });
    }
  }

  override update(_time: number, delta: number): void {
    this.syncNightOverlayCoverage();
    const cam = this.cameras.main;
    const ptr = this.input.activePointer;
    if (this.introCutsceneActive) {
      const justPressedIntro = ptr.isDown && !this.introPointerWasDown;
      if (justPressedIntro) {
        this.handleIntroClickAdvance();
      }
      this.introPointerWasDown = ptr.isDown;
    } else {
      this.introPointerWasDown = false;
    }
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
    const accelerateDown = this.keyAccelerate?.isDown ?? false;
    const brakeDown = this.keyBrake?.isDown ?? false;
    const shouldCruise = !this.introCutsceneActive && !gameplayLocked && ridingNow;
    this.train?.setCruising(shouldCruise);
    if (train) {
      const throttle = this.introCutsceneActive
        ? 0
        : (shouldCruise && accelerateDown)
          ? 1
          : (shouldCruise && brakeDown)
            ? -1
            : 0;
      train.setThrottle(throttle);
    }
    this.train?.update(delta);
    const trainScrollSpeed = this.introCutsceneActive
      ? this.introScrollSpeed
      : (train?.getSpeed() ?? 0);
    const trainScrollDy = (trainScrollSpeed * delta) / 1000;
    let bgScrollDy = 0;
    if (train && trainScrollSpeed > 0) {
      const speedRatio = trainScrollSpeed / Math.max(1, train.getMaxSpeed());
      const parallaxScale = 0.7 + speedRatio * 1.9;
      bgScrollDy = this.parallax?.update(delta, parallaxScale) ?? 0;
      this.coalPickups?.addWorldOffset(0, trainScrollDy);
    }
    const coalOk = train?.hasCoal() ?? false;

    if (!cardsActive) {
      this.riding?.updatePlayerMotion(delta, cam, this.gateBlockers);
    }

    const waves = this.waves;
    const nightStrength = this.computeNightStrength();
    this.renderNightLighting(nightStrength, ridingNow);
    waves?.setNightIntensity(nightStrength);
    const waveIsClear =
      (waves?.getTotalAliveEnemies() ?? 0) <= 0 &&
      (waves?.getTotalRemainingToSpawn() ?? 0) <= 0;
    if (
      !this.hasShownFirstNightWarning &&
      nightStrength > this.nightWarningThreshold &&
      !this.introCutsceneActive &&
      waveIsClear
    ) {
      this.hasShownFirstNightWarning = true;
      this.showNightWarningBubble();
    }
    if (this.introCutsceneActive && train && waves) {
      this.turrets?.update(delta, train, waves, false, trainScrollSpeed);
    } else if (!cardsActive && train && waves) {
      waves.update(delta);
      waves.updateEnemies(delta);
      waves.constrainEnemiesToBlockers(this.gateBlockers);
      if (trainScrollDy > 0) {
        waves.addEnemyWorldOffset(0, trainScrollDy);
      }
      const hulls = train.getHullRects();
      const onTrainDamagedByEnemy = () => {
        if (this.time.now >= this.nextTrainHitShakeAt) {
          const s = MAIN_CAMERA_SHAKE_ON_TRAIN_HIT;
          this.cameras.main.shake(s.durationMs, s.intensity, true);
          this.nextTrainHitShakeAt = this.time.now + 120;
        }
      };
      waves.updateEnemyProjectiles(delta, hulls, onTrainDamagedByEnemy);
      waves.updateCollisions(hulls, onTrainDamagedByEnemy);
      const weaponFuel = this.turrets?.update(delta, train, waves, coalOk, trainScrollSpeed) ?? 0;
      if (weaponFuel > 0 && coalOk) {
        train.spendCoal(weaponFuel);
      }
      this.hud?.updateWaveInfo(waves);
    }

    const player = this.player;
    if (!this.introCutsceneActive && train && this.coalPickups && player) {
      // If riding, coal/exp is collected by train; player sprite is invisible and should not collect.
      const playerX = ridingNow ? -999999 : player.sprite.x;
      const playerY = ridingNow ? -999999 : player.sprite.y;

      const fuelGained = this.coalPickups.update(
        delta,
        playerX,
        playerY,
        MAIN_PLAYER_VISUAL.radius,
        train,
        1.0,
      );
      if (fuelGained > 0) {
        this.showFuelGainText(player.sprite.x, player.sprite.y, fuelGained);
      }
    }

    if (!this.introCutsceneActive && train && this.hud) {
      this.hud.update(train, ridingNow, {
        level: this.playerLevel,
        currentExp: this.currentExp,
        expectedExp: this.expectedExp,
      });
    }
    if (train?.isDestroyed) {
      this.scene.start('GameOverScene');
    }
    if (bgScrollDy > 0 && this.railSegments.length > 0) {
      const segmentH = this.railSegments[0]?.displayHeight ?? 256;
      for (const rail of this.railSegments) {
        rail.y += bgScrollDy;
      }
      for (const rail of this.railSegments) {
        if (rail.y - segmentH * 0.5 > this.scale.height + segmentH) {
          const topMost = Math.min(...this.railSegments.map((r) => r.y));
          rail.y = topMost - segmentH + 1;
        }
      }
    }

    // Gate overlays disabled for now.
  }
}
