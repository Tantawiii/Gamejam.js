import type * as Phaser from 'phaser';

/**
 * World bounds + follow camera for top-down gameplay.
 */
export function configureGameplayCamera(
  scene: Phaser.Scene,
  worldWidth: number,
  worldHeight: number,
  followTarget: Phaser.GameObjects.GameObject,
  lerpX = 0.12,
  lerpY = 0.12,
): void {
  scene.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
  scene.cameras.main.startFollow(followTarget, true, lerpX, lerpY);
  scene.cameras.main.setZoom(1);
}
