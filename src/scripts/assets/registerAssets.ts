import * as Phaser from 'phaser';

/**
 * Queue all game assets here so PreloaderScene can load them.
 * Files should live under public/assets and be referenced as `assets/...`.
 */
export function registerAssets(_scene: Phaser.Scene): void {
  _scene.load.atlas(
    'flares',
    'assets/particles/flares.png',
    'assets/particles/flares.json',
  );

  // Example:
  // _scene.load.image('ui-logo', 'assets/ui/logo.png');
  // _scene.load.audio('music-main-menu', 'assets/audio/main-menu.ogg');
}
