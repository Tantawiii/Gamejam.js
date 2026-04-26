import * as Phaser from 'phaser';
import { wavedashFromWindow } from './scripts/wavedash/wavedashHost';
import { MainScene } from './scenes/MainScene';
import { PreloaderScene } from './scenes/PreloaderScene';

const parent = document.getElementById('game');
if (!parent) {
  throw new Error('Missing #game container');
}

/** Resolve `public/` URLs the same way in dev, itch, and Wavedash iframe hosts. */
const loaderBaseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#0d1117',
  /** Web Audio decodes to AudioBuffer — loop points are gapless vs HTML5 `<audio>`. */
  audio: {
    disableWebAudio: false,
  },
  loader: {
    baseURL: loaderBaseUrl,
  },
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
  scene: [PreloaderScene, MainScene],
  callbacks: {
    postBoot: () => {
      // Host injects `window.Wavedash`; required on Wavedash to dismiss the loading shell.
      wavedashFromWindow()?.init();
    },
  },
});
