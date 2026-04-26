import * as Phaser from 'phaser';
import type { TrainController } from '../train/TrainController';

function ensureEnemyWalk(scene: Phaser.Scene, textureKey: string): string {
  const animKey = `${textureKey}_walk`;
  if (scene.anims.exists(animKey)) {
    return animKey;
  }
  const texture = scene.textures.get(textureKey);
  const end = Math.max(0, texture.frameTotal - 1);
  scene.anims.create({
    key: animKey,
    frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end }),
    frameRate: 8,
    repeat: -1,
  });
  return animKey;
}

type DraggerConfig = {
  startX: number;
  startY: number;
  /** Offset from train center when settled (attack pose). */
  holdOffsetX: number;
  holdOffsetY: number;
  /** Title line + body lines (names). */
  title: string;
  body: string;
  /** Local position of text block relative to container (trail side). */
  textX: number;
  textY: number;
  /** Flip sprite horizontally. */
  flipX: boolean;
  tint: number;
};

type Dragger = {
  container: Phaser.GameObjects.Container;
  holdOffsetX: number;
  holdOffsetY: number;
  speed: number;
};

const MOVE_SPEED = 58;

/**
 * Decorative credits “attack”: enemy sprites pull text toward the train; no gameplay hooks.
 */
export class CreditsCutscene {
  private readonly scene: Phaser.Scene;
  private readonly train: TrainController;
  private readonly draggers: Dragger[] = [];
  private readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, train: TrainController) {
    this.scene = scene;
    this.train = train;
    this.root = scene.add.container(0, 0);
    const depth = 12;
    this.root.setDepth(depth);

    const txKey = scene.textures.exists('NORMAL_ENEMY') ? 'NORMAL_ENEMY' : undefined;
    const eng = train.body;
    const cx = eng.x;
    const cy = eng.y;

    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Finger Paint, system-ui, Segoe UI, Roboto, sans-serif',
      fontSize: '17px',
      color: '#f5e6c8',
      align: 'center',
      stroke: '#1a0f08',
      strokeThickness: 3,
      wordWrap: { width: 220 },
    };
    const titleStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      ...textStyle,
      fontSize: '20px',
      color: '#facc22',
    };

    const configs: DraggerConfig[] = [
      {
        startX: cx - 420,
        startY: cy - 50,
        holdOffsetX: -130,
        holdOffsetY: -15,
        title: 'Game Developers',
        body: 'Tantawii\nGhanduud\npofo x',
        textX: -125,
        textY: -72,
        flipX: false,
        tint: 0xa78bfa,
      },
      {
        /* Stay inside the camera frame (train-centered): large +Y was off-screen below. */
        startX: cx,
        startY: cy + 118,
        holdOffsetX: 0,
        holdOffsetY: 72,
        title: 'Game Designer',
        body: 'KhaliedItches',
        /* Text above sprite so it reads as the enemy dragging the sign upward toward the train. */
        textX: 0,
        textY: -78,
        flipX: false,
        tint: 0x5eead4,
      },
      {
        startX: cx + 430,
        startY: cy - 35,
        holdOffsetX: 132,
        holdOffsetY: -12,
        title: 'Game Artists',
        body: 'Noran Hussain\nRana Mahmoud\nYomna Fayyad',
        textX: 118,
        textY: -78,
        flipX: true,
        tint: 0xf9a8d4,
      },
    ];

    for (const cfg of configs) {
      const titleGo = this.scene.add.text(0, 0, cfg.title, titleStyle).setOrigin(0.5, 0);
      const bodyGo = this.scene.add
        .text(0, titleGo.height + 4, cfg.body, textStyle)
        .setOrigin(0.5, 0);
      const textBundle = this.scene.add.container(cfg.textX, cfg.textY, [titleGo, bodyGo]);

      let visual: Phaser.GameObjects.GameObject;
      if (txKey) {
        const animKey = ensureEnemyWalk(this.scene, txKey);
        const sprite = this.scene.add.sprite(0, 0, txKey);
        sprite.setDisplaySize(56, 56);
        sprite.setTint(cfg.tint);
        sprite.setFlipX(cfg.flipX);
        sprite.play(animKey);
        visual = sprite;
      } else {
        visual = this.scene.add.circle(0, 0, 18, cfg.tint, 1).setStrokeStyle(2, 0xf5e6c8);
      }

      /* Sprite first so title/name text draws on top. */
      const container = this.scene.add.container(cfg.startX, cfg.startY, [visual, textBundle]);
      container.setDepth(depth);
      this.root.add(container);

      this.draggers.push({
        container,
        holdOffsetX: cfg.holdOffsetX,
        holdOffsetY: cfg.holdOffsetY,
        speed: MOVE_SPEED,
      });
    }
  }

  update(deltaMs: number, scrollDy: number): void {
    const eng = this.train.body;
    const tcx = eng.x;
    const tcy = eng.y;
    const dt = deltaMs / 1000;

    for (const d of this.draggers) {
      d.container.y += scrollDy;
      const tx = tcx + d.holdOffsetX;
      const ty = tcy + d.holdOffsetY;
      const dx = tx - d.container.x;
      const dy = ty - d.container.y;
      const len = Math.hypot(dx, dy);
      if (len > 2.5) {
        const step = Math.min(len, d.speed * dt);
        const nx = dx / len;
        const ny = dy / len;
        d.container.x += nx * step;
        d.container.y += ny * step;
      }
    }
  }

  destroy(): void {
    this.root.destroy(true);
    this.draggers.length = 0;
  }
}
