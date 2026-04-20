import * as Phaser from 'phaser';
import { GameOverScene } from './scenes/GameOverScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { MainScene } from './scenes/MainScene';
import { PreloaderScene } from './scenes/PreloaderScene';

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
  scene: [PreloaderScene, MainMenuScene, MainScene, GameOverScene],
});
