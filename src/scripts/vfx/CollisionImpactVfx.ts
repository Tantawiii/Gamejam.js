import * as Phaser from 'phaser';

export type CollisionImpactVfxOptions = {
  depth?: number;
  /** Max width in world pixels (height follows aspect ratio). */
  displayWidth?: number;
  msPerFrame?: number;
};

const VFX_01_PREFIX = 'vfx_collision_01_';
const VFX_02_PREFIX = 'vfx_collision_02_';
/** Must match frames loaded in registerAssets. */
const COLLISION_01_FRAME_COUNT = 7;
const COLLISION_02_FRAME_COUNT = 6;

function collectSequentialFrameKeys(
  scene: Phaser.Scene,
  prefix: string,
  maxFrames: number,
): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= maxFrames; i++) {
    const k = `${prefix}${i}`;
    if (scene.textures.exists(k)) {
      keys.push(k);
    } else {
      break;
    }
  }
  return keys;
}

function hasFullCollisionSet(
  scene: Phaser.Scene,
  prefix: string,
  expectedCount: number,
): boolean {
  for (let i = 1; i <= expectedCount; i++) {
    if (!scene.textures.exists(`${prefix}${i}`)) {
      return false;
    }
  }
  return true;
}

/**
 * Plays a full-frame explosion/impact sequence (each PNG is one animation step).
 */
export function playCollisionFrameSequence(
  scene: Phaser.Scene,
  x: number,
  y: number,
  frameKeys: string[],
  options?: CollisionImpactVfxOptions,
): void {
  if (frameKeys.length === 0) {
    return;
  }

  const depth = options?.depth ?? 22;
  const displayWidth = options?.displayWidth ?? 140;
  const msPerFrame = options?.msPerFrame ?? 48;

  const img = scene.add.image(x, y, frameKeys[0]!);
  img.setOrigin(0.5, 0.5);
  img.setDepth(depth);
  const firstFrame = scene.textures.getFrame(frameKeys[0]!);
  const scale = displayWidth / firstFrame.width;
  img.setScale(scale);

  let index = 0;
  const step = (): void => {
    index += 1;
    if (index >= frameKeys.length) {
      img.destroy();
      return;
    }
    img.setTexture(frameKeys[index]!);
    scene.time.delayedCall(msPerFrame, step);
  };

  if (frameKeys.length === 1) {
    scene.time.delayedCall(msPerFrame, () => img.destroy());
    return;
  }
  scene.time.delayedCall(msPerFrame, step);
}

/**
 * Bomb hitting the train: prefer Collision 02; if that set is incomplete, use Collision 01.
 */
export function playBombTrainExplosionFx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options?: CollisionImpactVfxOptions,
): void {
  const use02 = hasFullCollisionSet(scene, VFX_02_PREFIX, COLLISION_02_FRAME_COUNT);
  const prefix = use02 ? VFX_02_PREFIX : VFX_01_PREFIX;
  const max = use02 ? COLLISION_02_FRAME_COUNT : COLLISION_01_FRAME_COUNT;
  const keys = collectSequentialFrameKeys(scene, prefix, max);
  if (keys.length === 0) {
    return;
  }
  playCollisionFrameSequence(scene, x, y, keys, {
    ...options,
    displayWidth: options?.displayWidth ?? 180,
    msPerFrame: options?.msPerFrame ?? 42,
  });
}

/**
 * Standard enemy death / impact (non-bomb train explosion): Collision 01 only.
 */
export function playStandardEnemyImpactFx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options?: CollisionImpactVfxOptions,
): void {
  const keys = collectSequentialFrameKeys(scene, VFX_01_PREFIX, COLLISION_01_FRAME_COUNT);
  if (keys.length === 0) {
    return;
  }
  playCollisionFrameSequence(scene, x, y, keys, options);
}
