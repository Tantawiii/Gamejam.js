import * as Phaser from 'phaser';
import { playUiButtonClick } from '../audio/gameSfx';
import type { WeaponType } from '../train/TrainTurretSystem';

export type CardKind = 'player' | 'train' | 'weapon';

export type CardOffer = {
  id: string;
  label: string;
  description: string;
  kind: CardKind;
  weaponType?: WeaponType;
  /** Second-step pick: place on empty mount vs level up an existing turret. */
  placementChoice?: 'add' | 'upgrade';
};

type ChoiceResult = {
  card: CardOffer;
};

type DraftCallbacks = {
  canChooseCard: (card: CardOffer) => boolean;
  onChosen: (result: ChoiceResult) => void;
  onStartPlacement: (weaponType: WeaponType) => void;
  onWeaponSlotResolution?: (mode: 'add' | 'upgrade', weaponType: WeaponType) => void;
};

type CardVisual = {
  card: CardOffer;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  rivetL: Phaser.GameObjects.Rectangle;
  rivetR: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
};

/**
 * Between-wave card picker with dim/disable rules for invalid cards.
 */
export class CardDraftSystem {
  private static readonly CARD_WOOD = 0x2c1810;
  private static readonly CARD_WOOD_HOVER = 0x3d2817;
  private static readonly CARD_WOOD_DIM = 0x1a1410;
  private static readonly CARD_BRASS = 0xc9a227;
  private static readonly CARD_BRASS_MUTED = 0x6a5a28;

  private readonly scene: Phaser.Scene;
  private readonly callbacks: DraftCallbacks;
  private root?: Phaser.GameObjects.Container;
  private visuals: CardVisual[] = [];
  private active = false;

  constructor(scene: Phaser.Scene, callbacks: DraftCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
  }

  isActive(): boolean {
    return this.active;
  }

  open(offers: CardOffer[]): void {
    this.close();
    this.active = true;
    const { width, height } = this.scene.scale;
    const overlay = this.scene.add
      .rectangle(width * 0.5, height * 0.5, width, height, 0x05070c, 0.8)
      .setScrollFactor(0)
      .setDepth(8000);
    const resolutionPick =
      offers.length === 2 && offers.every((c) => !!c.placementChoice);
    const title = this.scene.add
      .text(
        width * 0.5,
        height * 0.13,
        resolutionPick ? 'New mount or upgrade?' : 'Choose a card',
        {
          fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: resolutionPick ? '30px' : '34px',
          color: '#f5e6c8',
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8001);
    const hint = this.scene.add
      .text(
        width * 0.5,
        height * 0.2,
        resolutionPick
          ? 'You already have this weapon. Put another on an empty slot, or level one up.'
          : 'Weapon cards may require placement on a free train slot.',
        {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '15px',
          color: '#c9d1d9',
          align: 'center',
          wordWrap: { width: width * 0.88 },
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8001);

    this.root = this.scene.add
      .container(0, 0, [overlay, title, hint])
      .setScrollFactor(0)
      .setDepth(8000);

    const cardW = 272;
    const cardH = 268;
    const step = cardW + 22;
    const startX = width * 0.5 - ((offers.length - 1) * step) / 2;
    const y = height * 0.56;
    this.visuals = offers.map((card, i) => {
      const x = startX + i * step;
      const bg = this.scene.add
        .rectangle(x, y, cardW, cardH, CardDraftSystem.CARD_WOOD, 1)
        .setStrokeStyle(3, CardDraftSystem.CARD_BRASS, 1)
        .setScrollFactor(0)
        .setDepth(8001);
      const rivetL = this.scene.add
        .rectangle(x - cardW * 0.5 + 14, y, 6, 6, CardDraftSystem.CARD_BRASS, 0.9)
        .setScrollFactor(0)
        .setDepth(8002);
      const rivetR = this.scene.add
        .rectangle(x + cardW * 0.5 - 14, y, 6, 6, CardDraftSystem.CARD_BRASS, 0.9)
        .setScrollFactor(0)
        .setDepth(8002);
      const titleText = this.scene.add
        .text(x, y - 96, card.label, {
          fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '22px',
          color: '#f5e6c8',
          align: 'center',
          wordWrap: { width: cardW - 22 },
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(8002);
      const descText = this.scene.add
        .text(x, y - 38, card.description, {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '13px',
          color: '#e8e4dc',
          align: 'center',
          lineSpacing: 2,
          wordWrap: { width: cardW - 28 },
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(8002);
      const root = this.scene.add
        .container(0, 0, [bg, rivetL, rivetR, titleText, descText])
        .setScrollFactor(0)
        .setDepth(8001);
      root.setSize(cardW, cardH);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        if (!this.callbacks.canChooseCard(card)) return;
        bg.setFillStyle(CardDraftSystem.CARD_WOOD_HOVER);
      });
      bg.on('pointerout', () => {
        this.refreshInteractableState();
      });
      bg.on('pointerdown', () => this.chooseCard(card));
      this.root?.add(root);
      return { card, root, bg, rivetL, rivetR, title: titleText, desc: descText };
    });

    this.refreshInteractableState();
  }

  refreshInteractableState(): void {
    const { CARD_WOOD, CARD_WOOD_DIM, CARD_BRASS, CARD_BRASS_MUTED } = CardDraftSystem;
    for (const v of this.visuals) {
      const on = this.callbacks.canChooseCard(v.card);
      v.root.setAlpha(on ? 1 : 0.42);
      v.bg.setFillStyle(on ? CARD_WOOD : CARD_WOOD_DIM);
      v.bg.setStrokeStyle(3, on ? CARD_BRASS : CARD_BRASS_MUTED, 1);
      v.rivetL.setAlpha(on ? 0.95 : 0.35);
      v.rivetR.setAlpha(on ? 0.95 : 0.35);
      if (on) {
        v.bg.setInteractive({ useHandCursor: true });
      } else {
        v.bg.disableInteractive();
      }
    }
  }

  private chooseCard(card: CardOffer): void {
    if (!this.active || !this.callbacks.canChooseCard(card)) return;
    playUiButtonClick(this.scene);
    if (card.placementChoice && card.weaponType) {
      this.callbacks.onWeaponSlotResolution?.(card.placementChoice, card.weaponType);
      this.close();
      return;
    }
    if (card.kind === 'weapon' && card.weaponType) {
      this.callbacks.onStartPlacement(card.weaponType);
      this.close();
      return;
    }
    this.callbacks.onChosen({ card });
    this.close();
  }

  close(): void {
    this.active = false;
    this.visuals.forEach((v) => v.root.destroy());
    this.visuals = [];
    this.root?.destroy(true);
    this.root = undefined;
  }
}
