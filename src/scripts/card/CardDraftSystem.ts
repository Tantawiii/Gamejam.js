import * as Phaser from 'phaser';
import type { WeaponType } from '../train/TrainTurretSystem';

export type CardKind = 'player' | 'train' | 'weapon';

export type CardOffer = {
  id: string;
  label: string;
  description: string;
  kind: CardKind;
  weaponType?: WeaponType;
};

type ChoiceResult = {
  card: CardOffer;
};

type DraftCallbacks = {
  canChooseCard: (card: CardOffer) => boolean;
  onChosen: (result: ChoiceResult) => void;
  onStartPlacement: (weaponType: WeaponType) => void;
};

type CardVisual = {
  card: CardOffer;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
};

/**
 * Between-wave card picker with dim/disable rules for invalid cards.
 */
export class CardDraftSystem {
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
    const title = this.scene.add
      .text(width * 0.5, height * 0.13, 'Choose a card', {
        fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
        fontSize: '44px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8001);
    const hint = this.scene.add
      .text(
        width * 0.5,
        height * 0.2,
        'Weapon cards may require placement on a free train slot.',
        {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '18px',
          color: '#c9d1d9',
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8001);

    this.root = this.scene.add
      .container(0, 0, [overlay, title, hint])
      .setScrollFactor(0)
      .setDepth(8000);

    const cardW = 260;
    const cardH = 250;
    const startX = width * 0.5 - cardW - 26;
    const y = height * 0.56;
    this.visuals = offers.map((card, i) => {
      const x = startX + i * (cardW + 26);
      const bg = this.scene.add
        .rectangle(x, y, cardW, cardH, 0x1a2230, 0.98)
        .setStrokeStyle(2, 0x4b5563, 1)
        .setScrollFactor(0)
        .setDepth(8001);
      const titleText = this.scene.add
        .text(x, y - 72, card.label, {
          fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '30px',
          color: '#f0f6fc',
          align: 'center',
          wordWrap: { width: cardW - 20 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(8002);
      const descText = this.scene.add
        .text(x, y + 20, card.description, {
          fontFamily: 'system-ui, Segoe UI, Roboto, sans-serif',
          fontSize: '17px',
          color: '#d1d5db',
          align: 'center',
          wordWrap: { width: cardW - 26 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(8002);
      const root = this.scene.add
        .container(0, 0, [bg, titleText, descText])
        .setScrollFactor(0)
        .setDepth(8001);
      root.setSize(cardW, cardH);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        if (!this.callbacks.canChooseCard(card)) return;
        bg.setStrokeStyle(2, 0x9fb3c8, 1);
      });
      bg.on('pointerout', () => {
        this.refreshInteractableState();
      });
      bg.on('pointerdown', () => this.chooseCard(card));
      this.root?.add(root);
      return { card, root, bg, title: titleText, desc: descText };
    });

    this.refreshInteractableState();
  }

  refreshInteractableState(): void {
    for (const v of this.visuals) {
      const on = this.callbacks.canChooseCard(v.card);
      v.root.setAlpha(on ? 1 : 0.38);
      if (on) {
        v.bg.setInteractive({ useHandCursor: true });
      } else {
        v.bg.disableInteractive();
        v.bg.setStrokeStyle(2, 0x2f3743, 1);
      }
    }
  }

  private chooseCard(card: CardOffer): void {
    if (!this.active || !this.callbacks.canChooseCard(card)) return;
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
