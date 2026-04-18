import * as Phaser from 'phaser';

/**
 * Keep a circle (center x,y, radius) inside a world-space rectangle with padding.
 */
export function clampCircleToWorldView(
  x: number,
  y: number,
  radius: number,
  view: Phaser.Geom.Rectangle,
  pad: number,
): { x: number; y: number } {
  const minX = view.x + pad + radius;
  const maxX = view.x + view.width - pad - radius;
  const minY = view.y + pad + radius;
  const maxY = view.y + view.height - pad - radius;
  return {
    x: Phaser.Math.Clamp(x, minX, maxX),
    y: Phaser.Math.Clamp(y, minY, maxY),
  };
}
