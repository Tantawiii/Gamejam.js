import * as Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';

const parent = document.getElementById('game');
if (!parent) {
  throw new Error('Missing #game container');
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#0d1117',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [MainScene],
});
