import * as Phaser from 'phaser';
import { CardPityState } from '../scripts/card/CardPityState';
import { CardDraftSystem, type CardOffer } from '../scripts/card/CardDraftSystem';
import { configureGameplayCamera } from '../scripts/camera/configureGameplayCamera';
import { WaveSystem } from '../scripts/waves/WaveSystem';
import type { EnemyType } from '../scripts/waves/WaveConfiguration';
import { DownwardParallaxBackground } from '../scripts/parallax/DownwardParallaxBackground';
import {
  MAIN_COAL_PICKUP,
  MAIN_COAL_RECHARGE_STATION,
  MAIN_GOLDEN_GOOSE,
  MAIN_PARALLAX_LAYERS,
  MAIN_PLAYER_SPAWN_OFFSET,
  MAIN_PLAYER_VISUAL,
  MAIN_TRAIN_COAL,
  MAIN_TRAIN_FLEET,
  MAIN_TRAIN_SPAWN,
  MAIN_ENGINE_SMOKE_DEPTH,
  MAIN_TURRET_SYSTEM,
  MAIN_WEAPON_VISUAL_DEPTH,
  MAIN_WORLD,
} from '../scripts/game/gameConfig';
import { CoalPickupManager } from '../scripts/pickups/CoalPickupManager';
import { CoalRechargeStationManager } from '../scripts/pickups/CoalRechargeStationManager';
import { GoldenGoosePickupManager } from '../scripts/pickups/GoldenGoosePickupManager';
import { PlayerController } from '../scripts/player/PlayerController';
import { TrainController } from '../scripts/train/TrainController';
import { TrainRidingController } from '../scripts/train/TrainRidingController';
import { TrainTurretSystem, type WeaponType } from '../scripts/train/TrainTurretSystem';
import { GameplayHud } from '../scripts/ui/GameplayHud';
import {
  ensureGoldenGooseWalkAnimations,
  ensureSlowDomeShieldAnimation,
} from '../scripts/assets/registerAssets';
import { playCollision02ExplosionFx } from '../scripts/vfx/CollisionImpactVfx';
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
  private coalRechargeStations?: CoalRechargeStationManager;
  private goldenGoose?: GoldenGoosePickupManager;
  private hud?: GameplayHud;
  private engineSmoke?: Phaser.GameObjects.Particles.ParticleEmitter;
  private draft?: CardDraftSystem;
  private placementPrompt?: Phaser.GameObjects.Text;
  private pendingPlacementWeapon?: WeaponType;
  private introCutsceneActive = false;
  /** Title screen: same world/parallax/train as gameplay, no dialogue yet. */
  private mainMenuActive = false;
  /** Main menu widgets; info panel body lives in a Container, but Back is scene-level like Start (Phaser input). */
  private menuPanel?: {
    titles: Phaser.GameObjects.Container;
    startBg: Phaser.GameObjects.Rectangle;
    startTxt: Phaser.GameObjects.Text;
    startDecor: Phaser.GameObjects.Rectangle[];
    controlsBg: Phaser.GameObjects.Rectangle;
    controlsTxt: Phaser.GameObjects.Text;
    controlsDecor: Phaser.GameObjects.Rectangle[];
    infoRoot: Phaser.GameObjects.Container;
    scrollMask: Phaser.GameObjects.Graphics;
    scrollInner: Phaser.GameObjects.Container;
    scrollContent: Phaser.GameObjects.Container;
    clipH: number;
    thumb: Phaser.GameObjects.Rectangle;
    trackLeft: number;
    trackTop: number;
    trackH: number;
    backBg: Phaser.GameObjects.Rectangle;
    backTxt: Phaser.GameObjects.Text;
  };
  private menuScrollY = 0;
  private menuScrollMax = 0;
  private menuInfoOpen = false;
  private menuThumbDragging = false;
  private menuLastPointerY = 0;
  private menuInputCleanup?: () => void;
  private menuStartCommitted = false;
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
  private nightTint?: Phaser.GameObjects.Rectangle;
  private trainHeadlightL?: Phaser.GameObjects.Image;
  private trainHeadlightR?: Phaser.GameObjects.Image;
  private playerNightLight?: Phaser.GameObjects.Image;
  private trainIdleWarningBanner?: Phaser.GameObjects.Container;
  /** Run stats: timer starts when intro dialogue ends. */
  private runStartedAtMs: number | null = null;
  /** Distance the train has traveled (world scroll) after the intro; feeds score. */
  private trainTravelPx = 0;
  private killScore = 0;
  private gooseScore = 0;
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
  /** Cinematic train death: Collision 02 bursts, remove train, then You Died UI. */
  private trainDeathSequenceActive = false;
  private youDiedOverlay?: Phaser.GameObjects.Container;
  /** World scroll while riding with the train moving (for idle-train penalty between batches). */
  private trainProgressThisSegmentPx = 0;
  private static readonly TRAIN_IDLE_PROGRESS_THRESHOLD_PX = 100;
  private static readonly TRAIN_IDLE_MIN_SPEED = 5;

  constructor() {
    super('MainScene');
  }

  private static killScoreForEnemyType(type: EnemyType): number {
    switch (type) {
      case 'bomb':
        return 10;
      case 'chunky':
        return 30;
      case 'long_range':
        return 20;
      case 'basic':
        return 5;
    }
  }

  /** Train cruise + parallax scroll + paused waves while menu or intro dialogue runs. */
  private inOpeningAtmosphere(): boolean {
    return this.mainMenuActive || this.introCutsceneActive;
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    ensureSlowDomeShieldAnimation(this);
    ensureGoldenGooseWalkAnimations(this);
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
    /** Tall wedge: narrow at bottom (lamp), wider toward top (−Y / forward along track). */
    if (!this.textures.exists('night_light_beam')) {
      const g = this.add.graphics({ x: 0, y: 0 });
      const bw = 256;
      const bh = 336;
      const cx = bw * 0.5;
      const step = 3;
      for (let y = 0; y < bh; y += step) {
        const t = y / (bh - 1);
        const halfW = Phaser.Math.Linear(102, 16, t);
        const a = (0.05 + t * 0.11) * (0.35 + 0.65 * t);
        g.fillStyle(0xffffff, Phaser.Math.Clamp(a * 0.28, 0.008, 0.09));
        g.fillRect(cx - halfW, y, halfW * 2, step);
      }
      g.generateTexture('night_light_beam', bw, bh);
      g.destroy();
    }
    this.nightTint = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x05070d, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(6800);
    const headlight = () =>
      this.add
        .image(-9999, -9999, 'night_light_beam')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0)
        .setScrollFactor(1)
        .setDepth(6801);
    this.trainHeadlightL = headlight();
    this.trainHeadlightR = headlight();
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

    const keyRide = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.riding = new TrainRidingController(train, player, keyRide ?? undefined);
    this.riding.setRiding(true);
    this.keyEsc = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyAccelerate = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyBrake = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S);

    this.coalPickups = new CoalPickupManager(this, MAIN_COAL_PICKUP);
    this.coalRechargeStations = new CoalRechargeStationManager(this, MAIN_COAL_RECHARGE_STATION);
    this.goldenGoose = new GoldenGoosePickupManager(this, MAIN_GOLDEN_GOOSE);

    this.hud = new GameplayHud(this);
    this.hud.setVisible(false);

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
        onEnemyDestroyed: (x, y, type, source) => {
          const baseCoal = source?.trainRam ? 12 : 6;
          const coal = this.scaledCoalDropFromBase(baseCoal);
          this.coalPickups?.spawn(x, y, coal);
          if (this.runStartedAtMs != null) {
            this.killScore += MainScene.killScoreForEnemyType(type);
          }
          const gained = this.rollExpDrop(type);
          this.gainExperience(gained);
          this.showExpGainText(x, y, gained);
        },
        onEnemyDespawned: () => {
          // Enemy went off-screen and is being respawned
        },
        onEndlessBatchEnqueued: (batchIndex) => {
          if (batchIndex >= 2) {
            if (
              this.trainProgressThisSegmentPx < MainScene.TRAIN_IDLE_PROGRESS_THRESHOLD_PX
            ) {
              this.showTrainLazyDetectedWarning();
              this.waves?.applyTrainIdlePressure();
            } else {
              this.waves?.decayTrainIdlePressure();
            }
          }
          this.trainProgressThisSegmentPx = 0;
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
    const engineSpr = train.getEngineSprite();
    this.engineSmoke = createGreySmokeVfx(this, {
      x: engineSpr.x,
      y: engineSpr.y,
      depth: MAIN_ENGINE_SMOKE_DEPTH,
      alpha: 1,
      follow: engineSpr,
      followOffsetX: 0,
      followOffsetY: -engineSpr.displayHeight * 0.5,
    });

    train.setCoalConsumptionEnabled(false);
    const menuBoot =
      (this.sys.settings.data as { mainMenu?: boolean } | undefined)?.mainMenu === true;
    if (menuBoot) {
      this.mainMenuActive = true;
      this.introCutsceneActive = false;
      this.scheduleMainMenuOverlay();
    } else {
      this.introCutsceneActive = true;
      this.showIntroDialogue();
    }
    this.draft = new CardDraftSystem(this, {
      canChooseCard: (card) => this.canChooseCard(card),
      onChosen: ({ card }) => this.applyChosenCard(card),
      onStartPlacement: (weaponType) => this.tryStartWeaponPlacement(weaponType),
      onWeaponSlotResolution: (mode, weaponType) =>
        this.resolveWeaponSlotChoice(mode, weaponType),
    });

    /* Mobile (disabled): import VirtualJoystick; add isMobileTouchLayout + virtualJoystick + mobileRideRoot fields;
    set isMobileTouchLayout from device.os.desktop; create VirtualJoystick + Board chip container; destroy both on shutdown;
    in update(): enable joystick + ride visibility when !openingAtmosphere && !cardsActive; feed stick to player walk +
    W/S throttle while riding. Restore "Mobile controls" block in scheduleMainMenuOverlay (mobileBullets + subMob + mobT).
    */

    this.events.once('shutdown', () => {
      this.menuInputCleanup?.();
      this.menuInputCleanup = undefined;
      this.engineSmoke?.stop();
      this.engineSmoke?.destroy();
      this.engineSmoke = undefined;
      this.draft?.close();
      this.placementPrompt?.destroy();
      this.placementPrompt = undefined;
      this.introAutoTimer?.destroy();
      this.introTypeTimer?.destroy();
      this.hud?.destroy();
      this.hud = undefined;
      this.waves?.destroy();
      this.waves = undefined;
      this.coalPickups?.destroy();
      this.coalPickups = undefined;
      this.coalRechargeStations?.destroy();
      this.coalRechargeStations = undefined;
      this.goldenGoose?.destroy();
      this.goldenGoose = undefined;
      this.turrets?.destroy();
      this.turrets = undefined;
      this.train?.destroy();
      this.train = undefined;
      this.player?.destroy();
      this.player = undefined;
      this.parallax?.destroy();
      this.parallax = undefined;
      this.riding = undefined;
    this.nightTint?.destroy();
    this.trainHeadlightL?.destroy();
    this.trainHeadlightR?.destroy();
    this.playerNightLight?.destroy();
    this.trainIdleWarningBanner?.destroy(true);
    this.trainIdleWarningBanner = undefined;
      this.gateTopSprites.forEach((g) => g.destroy());
      this.gateBottomSprites.forEach((g) => g.destroy());
      this.gateBlockers.forEach((g) => g.destroy());
      this.youDiedOverlay?.destroy(true);
      this.youDiedOverlay = undefined;
    });
  }

  private renderNightLighting(nightStrength: number, ridingNow: boolean): void {
    const tint = this.nightTint;
    const hlL = this.trainHeadlightL;
    const hlR = this.trainHeadlightR;
    const playerLight = this.playerNightLight;
    const train = this.train;
    if (!tint || !hlL || !hlR || !playerLight || !train) return;
    const darkness = 0.58 * Phaser.Math.Clamp(nightStrength, 0, 1);
    const lightStrength = Phaser.Math.Clamp(
      (nightStrength - this.nightLightStartThreshold) /
        (1 - this.nightLightStartThreshold),
      0,
      1,
    );
    tint.setFillStyle(0x05070d, darkness);
    if (darkness <= 0.001) {
      hlL.setAlpha(0);
      hlR.setAlpha(0);
      playerLight.setAlpha(0);
      return;
    }

    // Engine headlights: beam texture anchored at cowcatcher; narrow near lamp, wider up the track.
    const eng = train.getEngineSprite();
    const ew = eng.displayWidth;
    const eh = eng.displayHeight;
    const side = ew * 0.26;
    const forward = eh * 0.44;
    hlL.setPosition(eng.x - side, eng.y - forward);
    hlR.setPosition(eng.x + side, eng.y - forward);
    const beamTexW = 256;
    const beamTexH = 336;
    const beamLen = Math.min(eh * 1.22, 268);
    const beamSpan = Math.min(ew * 0.72, 200);
    hlL.setOrigin(0.5, 1);
    hlR.setOrigin(0.5, 1);
    hlL.setScale(beamSpan / beamTexW, beamLen / beamTexH);
    hlR.setScale(beamSpan / beamTexW, beamLen / beamTexH);
    const headAlpha = 0.4 * lightStrength;
    hlL.setAlpha(headAlpha);
    hlR.setAlpha(headAlpha);

    // On-foot light: circular lamp around player.
    const player = this.player?.sprite;
    if (!ridingNow && player) {
      playerLight.setPosition(player.x, player.y);
      const playerRadius = MAIN_PLAYER_VISUAL.radius * 2.1;
      const playerScale = (playerRadius * 2) / 256;
      playerLight.setScale(playerScale, playerScale);
      playerLight.setAlpha(0.28 * lightStrength);
    } else {
      playerLight.setAlpha(0);
    }
  }

  /** +50% coal per player level above 1 (Lv1 ×1, Lv2 ×1.5, Lv3 ×2, …). */
  private scaledCoalDropFromBase(base: number): number {
    const lv = Math.max(1, this.playerLevel);
    const mul = 1 + 0.5 * (lv - 1);
    return Math.max(1, Math.round(base * mul));
  }

  /** Son warns Dad when the idle-train penalty triggers (same bubble style as intro). */
  private showTrainLazyDetectedWarning(): void {
    this.trainIdleWarningBanner?.destroy(true);
    this.trainIdleWarningBanner = undefined;

    const { width, height } = this.scale;
    const bubbleWidth = 680;
    const bubbleHeight = 170;
    const bubbleX = width - bubbleWidth - width * 0.08;
    const bubbleY = height - bubbleHeight - 36;
    const msg =
      'Dad… they picked us up. We were too lazy to keep the train rolling — they know we stalled. They\'re vectoring a whole swarm right onto our pinpointed spot.';

    const { container: c, content } = this.createSpeechBubble(
      bubbleX,
      bubbleY,
      bubbleWidth,
      bubbleHeight,
      'Son',
    );
    content.setText(msg);
    c.setScrollFactor(0).setDepth(8200);
    c.setAlpha(0);
    this.trainIdleWarningBanner = c;

    this.tweens.add({
      targets: c,
      alpha: 1,
      duration: 320,
      ease: 'Sine.Out',
    });
    this.time.delayedCall(7200, () => {
      if (!this.trainIdleWarningBanner || this.trainIdleWarningBanner !== c) return;
      this.tweens.add({
        targets: c,
        alpha: 0,
        duration: 420,
        ease: 'Sine.In',
        onComplete: () => {
          c.destroy(true);
          if (this.trainIdleWarningBanner === c) {
            this.trainIdleWarningBanner = undefined;
          }
        },
      });
    });
  }

  private rollExpDrop(type: EnemyType): number {
    const levelBonus = Math.pow(1.01, Math.max(0, this.playerLevel - 1));
    let base: number;
    switch (type) {
      case 'basic':
        base = Phaser.Math.Between(20, 25);
        break;
      case 'bomb':
        base = Phaser.Math.Between(30, 35);
        break;
      case 'chunky':
        base = Phaser.Math.Between(50, 55);
        break;
      case 'long_range':
        base = Phaser.Math.Between(28, 33);
        break;
    }
    return Math.round(base * levelBonus);
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

  private showGooseScorePopup(x: number, y: number, amount: number): void {
    const t = this.add
      .text(x, y - 18, `+${Math.floor(amount)} GOLD GOOSE`, {
        fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '19px',
        color: '#facc22',
        stroke: '#3d2808',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(9000);
    this.tweens.add({
      targets: t,
      y: y - 56,
      alpha: 0,
      duration: 1000,
      ease: 'Sine.Out',
      onComplete: () => t.destroy(),
    });
  }

  private computeNightStrength(): number {
    if (!this.inOpeningAtmosphere()) {
      this.dayNightCycleMs += this.game.loop.delta;
    }
    const phase =
      ((this.dayNightCycleMs % this.dayNightCycleDurationMs) / this.dayNightCycleDurationMs) *
      Math.PI *
      2;
    return (1 - Math.cos(phase)) * 0.5;
  }

  private showCoalRechargeDadBubble(): void {
    const text =
      'Turns out the old coal mine never got the memo about the robot uprising—still sitting there full of lumps. Dumb rocks, one; fancy smart AI, zero. Free refills. I will take it.';
    const bubble = this.createSpeechBubble(54, this.scale.height - 236, 730, 172, 'Dad');
    bubble.content.setText(text);
    const c = bubble.container.setScrollFactor(0).setDepth(7040).setAlpha(0);
    this.tweens.add({
      targets: c,
      alpha: 1,
      duration: 260,
      ease: 'Sine.Out',
    });
    this.time.delayedCall(6800, () => {
      this.tweens.add({
        targets: c,
        alpha: 0,
        duration: 420,
        ease: 'Sine.In',
        onComplete: () => c.destroy(),
      });
    });
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
    if (this.inOpeningAtmosphere() || !this.draft) return;
    const offers = this.rollCardOffers();
    this.applyWeaponStatBlurbsToOffers(offers);
    this.draft.open(offers);
    this.draftCount += 1;
  }

  private applyWeaponStatBlurbsToOffers(offers: CardOffer[]): void {
    if (!this.turrets) return;
    for (const c of offers) {
      if (c.kind !== 'weapon' || !c.weaponType || c.placementChoice) continue;
      c.description = `${c.description}\n\n${this.turrets.getWeaponCardDraftBlurb(c.weaponType)}`;
    }
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
    if (card.placementChoice === 'add') {
      return !!this.turrets?.hasFreeSlot();
    }
    if (card.placementChoice === 'upgrade') {
      return !!card.weaponType && !!this.turrets?.hasWeaponType(card.weaponType);
    }
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
    if (!this.turrets.hasFreeSlot()) {
      this.turrets.upgradeMatchingWeapon(type);
      return;
    }
    if (this.turrets.hasWeaponType(type)) {
      this.time.delayedCall(0, () => this.openWeaponAddOrUpgradeChoice(type));
      return;
    }
    this.beginWeaponPlacement(type);
  }

  private resolveWeaponSlotChoice(mode: 'add' | 'upgrade', type: WeaponType): void {
    if (!this.turrets) return;
    if (mode === 'upgrade') {
      this.turrets.upgradeMatchingWeapon(type);
      return;
    }
    this.beginWeaponPlacement(type);
  }

  private openWeaponAddOrUpgradeChoice(type: WeaponType): void {
    if (!this.draft || this.inOpeningAtmosphere()) return;
    const addStats = this.turrets?.getWeaponAddSlotChoiceBlurb(type) ?? '';
    const upStats = this.turrets?.getWeaponUpgradeChoiceBlurb(type) ?? '';
    this.draft.open([
      {
        id: 'weapon-slot-add',
        label: 'Add to slot',
        description: `Place a new Lv1 mount on a free slot, then tap the train.\n\n${addStats}`,
        kind: 'weapon',
        weaponType: type,
        placementChoice: 'add',
      },
      {
        id: 'weapon-slot-upgrade',
        label: 'Upgrade existing',
        description: `Level up the first slotted copy of this weapon (same type).\n\n${upStats}`,
        kind: 'weapon',
        weaponType: type,
        placementChoice: 'upgrade',
      },
    ]);
  }

  private beginWeaponPlacement(type: WeaponType): void {
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

  private startTrainDeathSequence(): void {
    if (this.trainDeathSequenceActive) return;
    const train = this.train;
    if (!train) return;

    this.trainDeathSequenceActive = true;
    this.draft?.close();
    this.placementPrompt?.destroy();
    this.placementPrompt = undefined;
    this.pendingPlacementWeapon = undefined;
    this.waves?.setSpawningPaused(true);
    this.hud?.setVisible(false);

    const hulls = train.getHullRects();
    const pts: Phaser.Math.Vector2[] = [];
    for (const h of hulls) {
      pts.push(new Phaser.Math.Vector2(h.x, h.y));
      pts.push(new Phaser.Math.Vector2(h.x - h.width * 0.22, h.y + h.height * 0.1));
      pts.push(new Phaser.Math.Vector2(h.x + h.width * 0.22, h.y + h.height * 0.1));
    }
    for (const t of train.getTurretWorldPositions()) {
      pts.push(new Phaser.Math.Vector2(t.x, t.y));
    }
    const capped = pts.slice(0, 11);
    const staggerMs = 88;
    const msPerFrame = 42;
    const frameCount = 6;
    let maxEnd = 0;
    capped.forEach((p, i) => {
      const start = i * staggerMs;
      this.time.delayedCall(start, () => {
        playCollision02ExplosionFx(this, p.x, p.y, {
          depth: 46,
          displayWidth: Phaser.Math.Between(148, 205),
          msPerFrame,
        });
      });
      maxEnd = Math.max(maxEnd, start + frameCount * msPerFrame + 50);
    });

    this.time.delayedCall(maxEnd + 200, () => this.finishTrainExplosionAndShowYouDied());
  }

  private finishTrainExplosionAndShowYouDied(): void {
    const train = this.train;
    if (train) {
      const cx = train.body.x;
      const cy = train.body.y;
      this.cameras.main.stopFollow();
      this.cameras.main.centerOn(cx, cy);
    }

    this.engineSmoke?.stop();
    this.engineSmoke?.destroy();
    this.engineSmoke = undefined;

    this.turrets?.destroy();
    this.turrets = undefined;

    this.player?.sprite.setVisible(false);

    this.train?.destroy();
    this.train = undefined;

    this.time.delayedCall(140, () => this.showYouDiedOverlay());
  }

  private showYouDiedOverlay(): void {
    if (this.youDiedOverlay) return;
    this.waves?.explodeLivingEnemiesOnCameraWithCollision02();
    const { width, height } = this.scale;
    const cx = width * 0.5;
    const z = 12500;

    const dim = this.add
      .rectangle(cx, height * 0.5, width + 8, height + 8, 0x000000, 0)
      .setScrollFactor(0)
      .setDepth(z);

    const band = this.add
      .rectangle(cx, height * 0.395, width * 0.96, 132, 0x050305, 0)
      .setScrollFactor(0)
      .setDepth(z + 1)
      .setStrokeStyle(1, 0x221418, 0.4);

    const elapsedMs =
      this.runStartedAtMs != null ? Math.max(0, this.time.now - this.runStartedAtMs) : 0;
    const mm = Math.floor(elapsedMs / 60000);
    const ss = Math.floor((elapsedMs % 60000) / 1000);
    const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;
    const totalScore =
      Math.floor(this.trainTravelPx) + this.killScore + this.gooseScore;

    const runStats = this.add
      .text(
        cx,
        height * 0.248,
        `Score ${totalScore}\nTime survived ${timeStr}\n(${Math.floor(this.trainTravelPx)} train + ${this.killScore} kills + ${this.gooseScore} goose)`,
        {
          fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '17px',
          color: '#e8e4dc',
          align: 'center',
          lineSpacing: 4,
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(z + 2)
      .setAlpha(0);

    const title = this.add
      .text(cx, height * 0.382, 'YOU DIED', {
        fontFamily: 'Nosifer, Crimson Text, Georgia, serif',
        fontSize: '56px',
        color: '#7a141c',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(z + 3)
      .setAlpha(0);
    title.setStroke('#100205', 6);
    title.setShadow(0, 5, '#000000', 10, true, true);

    const subtitle = this.add
      .text(cx, height * 0.475, 'The train has fallen.', {
        fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '20px',
        color: '#e8e8ec',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(z + 2)
      .setAlpha(0);

    const btnW = 288;
    const btnH = 48;
    const woodFill = 0x2c1810;
    const woodHover = 0x3d2817;
    const brass = 0xc9a227;
    const menuY = height * 0.62;
    const depthBtns = z + 2;

    const makeLocoDeathButton = (
      y: number,
      label: string,
      onClick: () => void,
    ): Phaser.GameObjects.GameObject[] => {
      const bg = this.add
        .rectangle(cx, y, btnW, btnH, woodFill, 1)
        .setStrokeStyle(3, brass, 1)
        .setScrollFactor(0)
        .setDepth(depthBtns)
        .setInteractive({ useHandCursor: true })
        .setAlpha(0);
      const rivetInset = btnW * 0.44;
      const rivetSize = 7;
      const rivet = this.add
        .rectangle(cx - rivetInset, y, rivetSize, rivetSize, brass, 0.9)
        .setScrollFactor(0)
        .setDepth(depthBtns + 1)
        .setAlpha(0);
      const rivet2 = this.add
        .rectangle(cx + rivetInset, y, rivetSize, rivetSize, brass, 0.9)
        .setScrollFactor(0)
        .setDepth(depthBtns + 1)
        .setAlpha(0);
      const txt = this.add
        .text(cx, y, label, {
          fontFamily:
            'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '28px',
          color: '#f5e6c8',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(depthBtns + 2)
        .setAlpha(0);
      const fire = (): void => {
        if (this.sys.settings.status !== Phaser.Scenes.RUNNING) return;
        onClick();
      };
      bg.on('pointerup', fire);
      bg.on('pointerover', () => {
        bg.setFillStyle(woodHover);
        rivet.setAlpha(1);
        rivet2.setAlpha(1);
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(woodFill);
        rivet.setAlpha(0.9);
        rivet2.setAlpha(0.9);
      });
      return [bg, rivet, rivet2, txt];
    };

    const menuParts = makeLocoDeathButton(menuY, 'Main Menu', () => {
      window.location.reload();
    });

    this.youDiedOverlay = this.add.container(0, 0, [
      dim,
      band,
      runStats,
      subtitle,
      title,
      ...menuParts,
    ]);
    this.youDiedOverlay.setScrollFactor(0);
    this.youDiedOverlay.setDepth(z);

    this.tweens.add({
      targets: dim,
      alpha: 0.7,
      duration: 720,
      ease: 'Sine.Out',
    });
    this.tweens.add({
      targets: band,
      alpha: 0.9,
      duration: 680,
      delay: 100,
      ease: 'Sine.Out',
    });
    this.tweens.add({
      targets: [runStats, title, subtitle, ...menuParts],
      alpha: 1,
      duration: 520,
      delay: 260,
      ease: 'Sine.Out',
    });
  }

  /** Title UI over the live train + parallax; fades out to reveal the same scene and intro dialogue. */
  private scheduleMainMenuOverlay(): void {
    const build = (): void => {
      if (!this.mainMenuActive) return;
      const { width, height } = this.scale;
      const cx = width * 0.5;
      const cy = height * 0.5;
      const depthTitles = 9500;
      const depthBtns = 9510;
      const depthInfo = 9525;

      const title = this.add
        .text(cx, height * 0.14, 'Choot Choot!', {
          fontFamily: 'Nosifer, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '58px',
          color: '#ff3434',
          align: 'center',
        })
        .setOrigin(0.5)
        .setShadow(2, 2, '#333333', 2, false, true)
        .setScrollFactor(0)
        .setDepth(depthTitles);

      const subtitle = this.add
        .text(cx, height * 0.26, 'The rails whisper... board if you dare.', {
          fontFamily:
            'Freckle Face, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '34px',
          color: '#f0f6fc',
          align: 'center',
        })
        .setOrigin(0.5)
        .setShadow(2, 2, '#333333', 2, false, true)
        .setScrollFactor(0)
        .setDepth(depthTitles);

      const titles = this.add.container(0, 0, [title, subtitle]).setScrollFactor(0).setDepth(depthTitles);

      const btnW = 288;
      const btnH = 48;
      const woodFill = 0x2c1810;
      const woodHover = 0x3d2817;
      const brass = 0xc9a227;

      const makeLocoButton = (
        y: number,
        label: string,
        onClick: () => void,
      ): {
        bg: Phaser.GameObjects.Rectangle;
        txt: Phaser.GameObjects.Text;
        decor: Phaser.GameObjects.Rectangle[];
      } => {
        const bg = this.add
          .rectangle(cx, y, btnW, btnH, woodFill, 1)
          .setStrokeStyle(3, brass, 1)
          .setScrollFactor(0)
          .setDepth(depthBtns)
          .setInteractive({ useHandCursor: true });
        const rivet = this.add
          .rectangle(cx - btnW * 0.38, y, 5, 5, brass, 0.85)
          .setScrollFactor(0)
          .setDepth(depthBtns + 1);
        const rivet2 = this.add
          .rectangle(cx + btnW * 0.38, y, 5, 5, brass, 0.85)
          .setScrollFactor(0)
          .setDepth(depthBtns + 1);
        const txt = this.add
          .text(cx, y, label, {
            fontFamily:
              'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
            fontSize: '28px',
            color: '#f5e6c8',
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(depthBtns + 2);
        const fire = (): void => {
          if (!this.mainMenuActive || this.menuStartCommitted) return;
          onClick();
        };
        bg.on('pointerup', fire);
        bg.on('pointerover', () => {
          bg.setFillStyle(woodHover);
          rivet.setAlpha(1);
          rivet2.setAlpha(1);
        });
        bg.on('pointerout', () => {
          bg.setFillStyle(woodFill);
          rivet.setAlpha(0.85);
          rivet2.setAlpha(0.85);
        });
        return { bg, txt, decor: [rivet, rivet2] };
      };

      const startY = height * 0.72;
      const controlsY = height * 0.825;
      const startPair = makeLocoButton(startY, 'Start', () => this.commitMenuStart());
      const controlsPair = makeLocoButton(controlsY, 'Controls & Info', () =>
        this.openMenuInfoPanel(),
      );

      const shortIntro =
        'Steam through hostile country: mind your coal, shoot the scrap, patch the train between waves.';

      /* Mobile "Controls & Info" copy — disabled with touch UI.
      const mobileBullets = `Stick — Tap anywhere to spawn it; drag to move; lift to reset
Cards — Stick sleeps while you pick; it wakes after
Board — On-screen button (= E)
Drive — Stick up / down for gas & brake`;
      */

      /* Full-viewport panel so the copy has maximum width/height and needs less scrolling. */
      const panelW = width;
      const panelH = height;
      const margin = Math.max(10, Math.min(18, Math.round(Math.min(width, height) * 0.028)));
      const scrollTrackW = 14;
      const gap = 8;
      const textColumnW = panelW - margin * 2 - scrollTrackW - gap;
      const innerPad = 10;
      const innerW = textColumnW - innerPad * 2;

      const titleLineY = -panelH * 0.5 + margin;
      const headerBlockH = 44;
      const scrollTop = titleLineY + headerBlockH;
      const backH = 44;
      const backGap = 12;
      const backY = panelH * 0.5 - margin - backH * 0.5;
      const scrollBottom = backY - backH * 0.5 - backGap;
      const scrollH = Math.max(100, scrollBottom - scrollTop);
      const clipH = scrollH;

      const clipX = -panelW * 0.5 + margin;
      const clipY = scrollTop;

      const infoRoot = this.add.container(cx, cy).setScrollFactor(0).setDepth(depthInfo).setVisible(false).setAlpha(0);

      const panelBg = this.add
        .rectangle(0, 0, panelW, panelH, 0x1a120c, 0.97)
        .setStrokeStyle(4, brass, 0.95);
      const panelRivet = (rx: number, ry: number): Phaser.GameObjects.Arc =>
        this.add.circle(rx, ry, 4, brass, 0.75);
      const rivets = [
        panelRivet(-panelW * 0.46, -panelH * 0.46),
        panelRivet(panelW * 0.46, -panelH * 0.46),
        panelRivet(-panelW * 0.46, panelH * 0.46),
        panelRivet(panelW * 0.46, panelH * 0.46),
      ];

      const headerOccluder = this.add
        .rectangle(0, titleLineY + headerBlockH * 0.5 - 2, textColumnW + 24, headerBlockH + 10, 0x1a120c, 1)
        .setOrigin(0.5, 0.5);

      const panelTitle = this.add
        .text(0, titleLineY, 'Controls & Info', {
          fontFamily:
            'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '28px',
          color: '#f5e6c8',
        })
        .setOrigin(0.5, 0);

      const scrollMask = this.add.graphics({ x: 0, y: 0 });
      scrollMask.fillStyle(0xffffff);
      scrollMask.fillRect(clipX, clipY, textColumnW, scrollH);
      scrollMask.setVisible(false);

      const scrollInner = this.add.container(clipX, clipY);
      const scrollContent = this.add.container(0, 0);
      scrollInner.add(scrollContent);
      scrollInner.setMask(scrollMask.createGeometryMask());

      const bodyStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '15px',
        color: '#e8dcc8',
        wordWrap: { width: innerW },
        lineSpacing: 5,
        align: 'left',
      };
      const subStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '16px',
        color: '#f5e6c8',
        fontStyle: 'bold',
        align: 'center',
      };

      let stackY = innerPad;
      const subCenterX = innerPad + innerW * 0.5;

      const introT = this.add.text(innerPad, stackY, shortIntro, bodyStyle).setOrigin(0, 0);
      scrollContent.add(introT);
      stackY += introT.height + 14;

      const subKb = this.add
        .text(subCenterX, stackY, 'Keyboard & mouse', subStyle)
        .setOrigin(0.5, 0);
      scrollContent.add(subKb);
      stackY += subKb.height + 10;

      const labelRowStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily:
          'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '22px',
        color: '#f5e6c8',
        align: 'left',
      };
      const keyCapStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily:
          'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '20px',
        color: '#f5e6c8',
        align: 'center',
      };
      const chipFill = 0x3d2817;
      const rowH = 42;
      const rowGap = 8;
      const keyChipW = Math.min(118, Math.floor(innerW * 0.34));
      const keyRightX = innerPad + innerW;

      const keyRows: { label: string; key: string }[] = [
        { label: 'Move up', key: 'W' },
        { label: 'Move down', key: 'S' },
        { label: 'Move left', key: 'A' },
        { label: 'Move right', key: 'D' },
        { label: 'Board train', key: 'E' },
      ];

      for (const row of keyRows) {
        const labelGo = this.add
          .text(innerPad, stackY, row.label, labelRowStyle)
          .setOrigin(0, 0);
        scrollContent.add(labelGo);
        const kcx = keyRightX - keyChipW * 0.5;
        const kcy = stackY + rowH * 0.5;
        const keyBg = this.add
          .rectangle(kcx, kcy, keyChipW, rowH - 8, chipFill, 1)
          .setStrokeStyle(2, brass, 1);
        const keyTxt = this.add.text(kcx, kcy, row.key, keyCapStyle).setOrigin(0.5, 0.5);
        scrollContent.add(keyBg);
        scrollContent.add(keyTxt);
        stackY += rowH + rowGap;
      }

      const throttleNote = this.add
        .text(
          innerPad,
          stackY,
          'Throttle while driving — same keys as Move up / Move down (W and S).',
          bodyStyle,
        )
        .setOrigin(0, 0);
      scrollContent.add(throttleNote);
      stackY += throttleNote.height + 12;

      const clickNote = this.add
        .text(
          innerPad,
          stackY,
          'Click — story, draft cards, place guns on the train.',
          bodyStyle,
        )
        .setOrigin(0, 0);
      scrollContent.add(clickNote);
      stackY += clickNote.height + 12;

      const skipLabel = this.add
        .text(innerPad, stackY, 'Skip intro', labelRowStyle)
        .setOrigin(0, 0);
      scrollContent.add(skipLabel);
      const skcx = keyRightX - keyChipW * 0.5;
      const skcy = stackY + rowH * 0.5;
      const skipBg = this.add
        .rectangle(skcx, skcy, keyChipW, rowH - 8, chipFill, 1)
        .setStrokeStyle(2, brass, 1);
      const skipTxt = this.add.text(skcx, skcy, 'Esc', keyCapStyle).setOrigin(0.5, 0.5);
      scrollContent.add(skipBg);
      scrollContent.add(skipTxt);
      stackY += rowH + 16;

      /* Mobile section (see mobileBullets block above)
      const subMob = this.add
        .text(subCenterX, stackY, 'Mobile controls', subStyle)
        .setOrigin(0.5, 0);
      scrollContent.add(subMob);
      stackY += subMob.height + 8;
      const mobT = this.add.text(innerPad, stackY, mobileBullets, bodyStyle).setOrigin(0, 0);
      scrollContent.add(mobT);
      */

      const trackLeft = clipX + textColumnW + gap;
      const trackTop = clipY;
      const track = this.add
        .rectangle(
          trackLeft + scrollTrackW * 0.5,
          trackTop + scrollH * 0.5,
          scrollTrackW,
          scrollH,
          0x0d0906,
          0.92,
        )
        .setStrokeStyle(1, brass, 0.55);
      const thumb = this.add
        .rectangle(trackLeft + 2, trackTop, scrollTrackW - 4, 36, brass, 0.92)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      thumb.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!this.menuInfoOpen) return;
        this.menuThumbDragging = true;
        this.menuLastPointerY = pointer.y;
      });

      const backScreenY = cy + backY;
      const backBg = this.add
        .rectangle(cx, backScreenY, 176, backH, woodFill, 1)
        .setStrokeStyle(3, brass, 1)
        .setScrollFactor(0)
        .setDepth(depthInfo + 1)
        .setInteractive({ useHandCursor: true });
      const backTxt = this.add
        .text(cx, backScreenY, 'Back', {
          fontFamily:
            'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '26px',
          color: '#f5e6c8',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(depthInfo + 2)
        .setInteractive({ useHandCursor: true });
      const hoverBack = (over: boolean): void => {
        backBg.setFillStyle(over ? woodHover : woodFill);
      };
      const fireBack = (): void => {
        if (!this.menuInfoOpen) return;
        this.closeMenuInfoPanel();
      };
      for (const o of [backBg, backTxt]) {
        o.on('pointerover', () => hoverBack(true));
        o.on('pointerout', () => hoverBack(false));
        o.on('pointerdown', fireBack);
        o.on('pointerup', fireBack);
      }
      backBg.disableInteractive();
      backTxt.disableInteractive();
      backBg.setVisible(false);
      backTxt.setVisible(false);

      infoRoot.add([
        panelBg,
        headerOccluder,
        panelTitle,
        ...rivets,
        scrollMask,
        scrollInner,
        track,
        thumb,
      ]);

      this.menuPanel = {
        titles,
        startBg: startPair.bg,
        startTxt: startPair.txt,
        startDecor: startPair.decor,
        controlsBg: controlsPair.bg,
        controlsTxt: controlsPair.txt,
        controlsDecor: controlsPair.decor,
        infoRoot,
        scrollMask,
        scrollInner,
        scrollContent,
        clipH,
        thumb,
        trackLeft,
        trackTop,
        trackH: scrollH,
        backBg,
        backTxt,
      };

      const onWheel = (
        _pointer: Phaser.Input.Pointer,
        _go: Phaser.GameObjects.GameObject,
        _dx: number,
        dy: number,
      ): void => {
        if (!this.menuInfoOpen) return;
        this.applyMenuScrollDelta(dy * 0.12);
      };

      const onPointerMove = (pointer: Phaser.Input.Pointer): void => {
        if (!this.menuThumbDragging || !this.menuPanel || !this.menuInfoOpen) return;
        const dy = pointer.y - this.menuLastPointerY;
        this.menuLastPointerY = pointer.y;
        const m = this.menuPanel;
        const thumbH = m.thumb.height;
        const travel = Math.max(1, m.trackH - thumbH);
        const deltaScroll = (dy / travel) * this.menuScrollMax;
        this.applyMenuScrollDelta(deltaScroll);
      };

      const onPointerUp = (): void => {
        this.menuThumbDragging = false;
      };

      this.input.on('wheel', onWheel);
      this.input.on('pointermove', onPointerMove);
      this.input.on('pointerup', onPointerUp);

      this.menuInputCleanup = (): void => {
        this.input.off('wheel', onWheel);
        this.input.off('pointermove', onPointerMove);
        this.input.off('pointerup', onPointerUp);
      };

      this.time.delayedCall(0, () => this.refreshMenuScrollMetrics());
    };

    const webFont = (window as { WebFont?: { load: (cfg: object) => void } })
      .WebFont;
    if (webFont) {
      webFont.load({
        google: {
          families: ['Freckle Face', 'Finger Paint', 'Nosifer'],
        },
        active: build,
      });
    } else {
      build();
    }
  }

  private refreshMenuScrollMetrics(): void {
    const m = this.menuPanel;
    if (!m) return;
    let contentBottom = 0;
    for (const ch of m.scrollContent.list) {
      if (ch instanceof Phaser.GameObjects.Text) {
        contentBottom = Math.max(contentBottom, ch.y + ch.height);
      } else if (ch instanceof Phaser.GameObjects.Rectangle) {
        const oy = ch.originY ?? 0.5;
        contentBottom = Math.max(
          contentBottom,
          ch.y + ch.height * (1 - oy),
        );
      }
    }
    const totalH = contentBottom + 10;
    this.menuScrollMax = Math.max(0, totalH - m.clipH);
    this.menuScrollY = Phaser.Math.Clamp(this.menuScrollY, 0, this.menuScrollMax);
    m.scrollContent.setY(-this.menuScrollY);
    this.layoutMenuScrollbarThumb();
  }

  private applyMenuScrollDelta(delta: number): void {
    const m = this.menuPanel;
    if (!m || !this.menuInfoOpen) return;
    this.menuScrollY = Phaser.Math.Clamp(this.menuScrollY + delta, 0, this.menuScrollMax);
    m.scrollContent.setY(-this.menuScrollY);
    this.layoutMenuScrollbarThumb();
  }

  private layoutMenuScrollbarThumb(): void {
    const m = this.menuPanel;
    if (!m) return;
    const { trackH, trackTop, thumb, trackLeft } = m;
    const tMin = 24;
    const totalContent = this.menuScrollMax + m.clipH;
    const ratio = totalContent <= 0 ? 1 : m.clipH / totalContent;
    const thumbH = Math.max(tMin, Math.floor(trackH * ratio));
    thumb.setSize(thumb.width, thumbH);
    const travel = Math.max(0, trackH - thumbH);
    const yOff =
      this.menuScrollMax <= 0 ? 0 : (this.menuScrollY / this.menuScrollMax) * travel;
    thumb.setPosition(trackLeft + 2, trackTop + yOff);
  }

  private openMenuInfoPanel(): void {
    const m = this.menuPanel;
    if (!m || this.menuInfoOpen) return;
    this.menuInfoOpen = true;
    m.startBg.disableInteractive();
    m.controlsBg.disableInteractive();
    this.menuScrollY = 0;
    this.refreshMenuScrollMetrics();
    m.infoRoot.setVisible(true);
    m.infoRoot.setAlpha(0);
    m.backBg.setVisible(true);
    m.backTxt.setVisible(true);
    m.backBg.setAlpha(0);
    m.backTxt.setAlpha(0);
    m.backBg.setInteractive({ useHandCursor: true });
    m.backTxt.setInteractive({ useHandCursor: true });
    this.tweens.add({
      targets: [
        m.startBg,
        m.startTxt,
        ...m.startDecor,
        m.controlsBg,
        m.controlsTxt,
        ...m.controlsDecor,
      ],
      alpha: 0,
      duration: 240,
      ease: 'Sine.Out',
      onComplete: () => {
        m.startBg.disableInteractive();
        m.controlsBg.disableInteractive();
        [
          m.startBg,
          m.startTxt,
          ...m.startDecor,
          m.controlsBg,
          m.controlsTxt,
          ...m.controlsDecor,
        ].forEach((o) => o.setVisible(false));
      },
    });
    this.tweens.add({
      targets: [m.infoRoot, m.backBg, m.backTxt],
      alpha: 1,
      duration: 300,
      delay: 100,
      ease: 'Sine.Out',
    });
  }

  private closeMenuInfoPanel(animate = true): void {
    const m = this.menuPanel;
    if (!m || !this.menuInfoOpen) return;
    this.menuInfoOpen = false;
    this.menuThumbDragging = false;
    const restoreButtons = (): void => {
      [
        m.startBg,
        m.startTxt,
        ...m.startDecor,
        m.controlsBg,
        m.controlsTxt,
        ...m.controlsDecor,
      ].forEach((o) => {
        o.setVisible(true);
        o.setAlpha(0);
      });
      m.startBg.setInteractive({ useHandCursor: true });
      m.controlsBg.setInteractive({ useHandCursor: true });
    };
    if (!animate) {
      m.infoRoot.setVisible(false);
      m.infoRoot.setAlpha(0);
      m.backBg.disableInteractive();
      m.backTxt.disableInteractive();
      m.backBg.setVisible(false);
      m.backTxt.setVisible(false);
      m.backBg.setAlpha(0);
      m.backTxt.setAlpha(0);
      [
        m.startBg,
        m.startTxt,
        ...m.startDecor,
        m.controlsBg,
        m.controlsTxt,
        ...m.controlsDecor,
      ].forEach((o) => {
        o.setVisible(true);
        o.setAlpha(1);
      });
      m.startBg.setInteractive({ useHandCursor: true });
      m.controlsBg.setInteractive({ useHandCursor: true });
      return;
    }
    this.tweens.add({
      targets: [m.infoRoot, m.backBg, m.backTxt],
      alpha: 0,
      duration: 220,
      ease: 'Sine.In',
      onComplete: () => {
        m.infoRoot.setVisible(false);
        m.backBg.disableInteractive();
        m.backTxt.disableInteractive();
        m.backBg.setVisible(false);
        m.backTxt.setVisible(false);
      },
    });
    this.tweens.add({
      targets: [
        m.startBg,
        m.startTxt,
        ...m.startDecor,
        m.controlsBg,
        m.controlsTxt,
        ...m.controlsDecor,
      ],
      alpha: 1,
      duration: 260,
      delay: 140,
      ease: 'Sine.Out',
      onStart: () => restoreButtons(),
    });
  }

  private destroyMainMenuPanel(): void {
    const m = this.menuPanel;
    if (!m) return;
    m.startDecor.forEach((o) => o.destroy());
    m.controlsDecor.forEach((o) => o.destroy());
    m.backBg.destroy();
    m.backTxt.destroy();
    m.infoRoot.destroy();
    m.titles.destroy();
    m.startBg.destroy();
    m.startTxt.destroy();
    m.controlsBg.destroy();
    m.controlsTxt.destroy();
    this.menuPanel = undefined;
    this.menuScrollY = 0;
    this.menuScrollMax = 0;
    this.menuInfoOpen = false;
    this.menuThumbDragging = false;
  }

  private commitMenuStart(): void {
    if (!this.mainMenuActive || this.menuStartCommitted) return;
    if (this.menuInfoOpen) return;
    this.menuStartCommitted = true;
    const m = this.menuPanel;
    const targets: Phaser.GameObjects.GameObject[] = [];
    if (m) {
      targets.push(
        m.titles,
        m.startBg,
        m.startTxt,
        ...m.startDecor,
        m.controlsBg,
        m.controlsTxt,
        ...m.controlsDecor,
        m.infoRoot,
        m.backBg,
        m.backTxt,
      );
    }
    const finish = (): void => {
      this.menuInputCleanup?.();
      this.menuInputCleanup = undefined;
      this.destroyMainMenuPanel();
      this.beginIntroFromMenu();
    };
    if (targets.length === 0) {
      finish();
      return;
    }
    this.tweens.add({
      targets,
      alpha: 0,
      duration: 520,
      ease: 'Sine.InOut',
      onComplete: finish,
    });
  }

  private beginIntroFromMenu(): void {
    this.mainMenuActive = false;
    this.introDialogueIndex = 0;
    this.introCutsceneActive = true;
    this.showIntroDialogue();
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
    this.runStartedAtMs = this.time.now;
    this.trainTravelPx = 0;
    this.killScore = 0;
    this.gooseScore = 0;
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
      if (!this.mainMenuActive && this.introCutsceneActive) {
        this.finishIntroCutscene();
      }
    }

    if (!this.inOpeningAtmosphere() && !this.draft?.isActive() && !this.pendingPlacementWeapon) {
      this.riding?.processMountInput();
    }

    const gameplayLocked =
      this.inOpeningAtmosphere() ||
      !!this.pendingPlacementWeapon ||
      (this.draft?.isActive() ?? false) ||
      this.trainDeathSequenceActive;
    const cardsActive =
      !!this.pendingPlacementWeapon ||
      (this.draft?.isActive() ?? false) ||
      this.trainDeathSequenceActive;

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
    const shouldCruise = !this.inOpeningAtmosphere() && !gameplayLocked && ridingNow;
    this.train?.setCruising(shouldCruise);
    if (train) {
      const throttle = this.inOpeningAtmosphere()
        ? 0
        : (shouldCruise && accelerateDown)
          ? 1
          : (shouldCruise && brakeDown)
            ? -1
            : 0;
      train.setThrottle(throttle);
    }
    this.train?.update(delta);
    const trainScrollSpeed = this.inOpeningAtmosphere()
      ? this.introScrollSpeed
      : (train?.getSpeed() ?? 0);
    const trainScrollDy = (trainScrollSpeed * delta) / 1000;
    if (
      this.runStartedAtMs != null &&
      train &&
      !this.trainDeathSequenceActive &&
      !this.mainMenuActive &&
      !this.inOpeningAtmosphere()
    ) {
      this.trainTravelPx += trainScrollDy;
    }
    if (
      !this.inOpeningAtmosphere() &&
      !this.trainDeathSequenceActive &&
      !gameplayLocked &&
      train &&
      ridingNow &&
      trainScrollSpeed > MainScene.TRAIN_IDLE_MIN_SPEED
    ) {
      this.trainProgressThisSegmentPx += trainScrollDy;
    }
    let bgScrollDy = 0;
    if (train && trainScrollSpeed > 0 && !this.trainDeathSequenceActive) {
      const speedRatio = trainScrollSpeed / Math.max(1, train.getMaxSpeed());
      const parallaxScale = 0.7 + speedRatio * 1.9;
      bgScrollDy = this.parallax?.update(delta, parallaxScale) ?? 0;
      this.coalPickups?.addWorldOffset(0, bgScrollDy);
      this.coalRechargeStations?.addWorldOffset(0, bgScrollDy);
      this.goldenGoose?.addWorldOffset(0, bgScrollDy);
      if (!this.inOpeningAtmosphere()) {
        this.coalRechargeStations?.tryProgressSpawn(bgScrollDy, this.cameras.main);
        this.goldenGoose?.tryProgressSpawn(bgScrollDy, this.cameras.main);
      }
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
      !this.mainMenuActive &&
      waveIsClear
    ) {
      this.hasShownFirstNightWarning = true;
      this.showNightWarningBubble();
    }
    if (this.inOpeningAtmosphere() && train && waves) {
      this.turrets?.update(delta, train, waves, false, trainScrollSpeed);
    } else if (!cardsActive && train && waves) {
      waves.update(delta);
      waves.updateEnemies(delta);
      waves.constrainEnemiesToBlockers(this.gateBlockers);
      if (trainScrollDy > 0) {
        waves.addEnemyWorldOffset(0, trainScrollDy);
      }
      const hulls = train.getHullRects();
      waves.updateEnemyProjectiles(delta, hulls);
      waves.updateCollisions(hulls);
      const weaponFuel = this.turrets?.update(delta, train, waves, coalOk, trainScrollSpeed) ?? 0;
      if (weaponFuel > 0 && coalOk) {
        train.spendCoal(weaponFuel);
      }
      this.hud?.updateWaveInfo(waves);
    }

    const player = this.player;
    if (
      !this.inOpeningAtmosphere() &&
      train &&
      this.coalPickups &&
      player &&
      !this.trainDeathSequenceActive
    ) {
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
      const stationGained =
        this.coalRechargeStations?.update(
          playerX,
          playerY,
          MAIN_PLAYER_VISUAL.radius,
          train,
          !ridingNow,
        ) ?? 0;
      if (fuelGained > 0) {
        this.showFuelGainText(player.sprite.x, player.sprite.y, fuelGained);
      }
      if (stationGained > 0) {
        this.showFuelGainText(player.sprite.x, player.sprite.y, stationGained);
        this.showCoalRechargeDadBubble();
      }
      const gooseGain =
        this.goldenGoose?.update(
          delta,
          playerX,
          playerY,
          MAIN_PLAYER_VISUAL.radius,
          !ridingNow,
        ) ?? 0;
      if (gooseGain > 0) {
        this.gooseScore += gooseGain;
        this.showGooseScorePopup(player.sprite.x, player.sprite.y, gooseGain);
      }
    }

    if (!this.inOpeningAtmosphere() && train && this.hud && !this.trainDeathSequenceActive) {
      this.hud.update(train, ridingNow, {
        level: this.playerLevel,
        currentExp: this.currentExp,
        expectedExp: this.expectedExp,
      });
    }
    if (
      train?.isDestroyed &&
      !this.trainDeathSequenceActive &&
      !this.mainMenuActive &&
      !this.introCutsceneActive
    ) {
      this.startTrainDeathSequence();
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
