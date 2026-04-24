import * as Phaser from 'phaser';

/**
 * Encode each path segment for URLs (spaces and special chars in folder names).
 * `pathFromPublic` is relative to `public/` e.g. `assets/Enemies/NORMAL_ENEMY.png`.
 */
export function encodePublicAssetUrl(pathFromPublic: string): string {
  return pathFromPublic.split('/').map(encodeURIComponent).join('/');
}

/**
 * Enemy PNGs are 2 columns × 1 row (walk cycle). Current assets: 92×46 → 46×46 frames.
 */
export const ENEMY_SPRITESHEET_CONFIG = {
  frameWidth: 46,
  frameHeight: 46,
} as const;

const RUINS_FILES = [
  'Blue-gray_ruins1.png',
  'Blue-gray_ruins2.png',
  'Blue-gray_ruins3.png',
  'Blue-gray_ruins4.png',
  'Blue-gray_ruins5.png',
  'Brown-gray_ruins1.png',
  'Brown-gray_ruins2.png',
  'Brown-gray_ruins3.png',
  'Brown-gray_ruins4.png',
  'Brown-gray_ruins5.png',
  'Brown_ruins1.png',
  'Brown_ruins2.png',
  'Brown_ruins3.png',
  'Brown_ruins4.png',
  'Brown_ruins5.png',
  'Sand_ruins1.png',
  'Sand_ruins2.png',
  'Sand_ruins3.png',
  'Sand_ruins4.png',
  'Sand_ruins5.png',
  'Snow_ruins1.png',
  'Snow_ruins2.png',
  'Snow_ruins3.png',
  'Snow_ruins4.png',
  'Snow_ruins5.png',
  'Water_ruins1.png',
  'Water_ruins2.png',
  'Water_ruins3.png',
  'Water_ruins4.png',
  'Water_ruins5.png',
  'White_ruins1.png',
  'White_ruins2.png',
  'White_ruins3.png',
  'White_ruins4.png',
  'White_ruins5.png',
  'Yellow_ruins1.png',
  'Yellow_ruins2.png',
  'Yellow_ruins3.png',
  'Yellow_ruins4.png',
  'Yellow_ruins5.png',
] as const;

const TREE_FILES = [
  'Broken_tree1.png',
  'Broken_tree2.png',
  'Broken_tree3.png',
  'Broken_tree4.png',
  'Broken_tree5.png',
  'Broken_tree6.png',
  'Broken_tree7.png',
  'Burned_tree1.png',
  'Burned_tree2.png',
  'Burned_tree3.png',
] as const;

/**
 * Queue all game assets under public/assets for PreloaderScene.
 */
export function registerAssets(scene: Phaser.Scene): void {
  // Enemy sprite sheets: 2 walk frames per row (keys must match Enemy subclasses / WaveSystem)
  const enemySheets: Array<[string, string]> = [
    ['NORMAL_ENEMY', 'assets/Enemies/NORMAL_ENEMY.png'],
    ['FAST_ENEMY', 'assets/Enemies/FAST_ENEMY.png'],
    ['LONG_RANGE', 'assets/Enemies/LONG_RANGE.png'],
  ];
  for (const [key, path] of enemySheets) {
    scene.load.spritesheet(key, encodePublicAssetUrl(path), ENEMY_SPRITESHEET_CONFIG);
  }

  // Snowy ground / tile layers
  for (let i = 1; i <= 7; i++) {
    const n = String(i).padStart(2, '0');
    scene.load.image(
      `bg_snow_${n}`,
      encodePublicAssetUrl(
        `assets/Background Assets/Top-Down Snowy Tileset_Environment - Snow ${n}.png`,
      ),
    );
  }
  scene.load.image(
    'bg_tile_untitled',
    encodePublicAssetUrl('assets/Background Assets/Untitled-1.png'),
  );
  scene.load.image(
    'bg_photo_untitled',
    encodePublicAssetUrl('assets/Background/Untitled-1.jpg'),
  );

  // Decorative props
  for (let rock = 1; rock <= 8; rock++) {
    for (let v = 1; v <= 5; v++) {
      scene.load.image(
        `rock_${rock}_${v}`,
        encodePublicAssetUrl(`assets/Rocks/Rock${rock}_${v}.png`),
      );
    }
  }

  for (const file of RUINS_FILES) {
    const key = `ruin_${file.replace(/\.png$/i, '')}`;
    scene.load.image(key, encodePublicAssetUrl(`assets/Ruines/${file}`));
  }

  for (const file of TREE_FILES) {
    const key = `tree_${file.replace(/\.png$/i, '')}`;
    scene.load.image(key, encodePublicAssetUrl(`assets/Trees/${file}`));
  }

  scene.load.image(
    'gosling_with_shadow',
    encodePublicAssetUrl('assets/Golden Goose/Gosling_with_shadow.png'),
  );

  // Train / impact VFX frames (for future animations)
  for (let frame = 1; frame <= 7; frame++) {
    scene.load.image(
      `vfx_collision_01_${frame}`,
      encodePublicAssetUrl(`assets/CollisionFX/Collision 01/${frame}.png`),
    );
  }
  for (let frame = 1; frame <= 6; frame++) {
    scene.load.image(
      `vfx_collision_02_${frame}`,
      encodePublicAssetUrl(`assets/CollisionFX/Collision 02/${frame}.png`),
    );
  }
}
