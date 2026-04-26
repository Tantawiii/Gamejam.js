import * as Phaser from 'phaser';

/** Cache keys — must match `PreloaderScene` audio loads. */
export const SFX_BUTTON_KEY = 'sfx_button';
export const SFX_FOOTSTEP_KEY = 'sfx_footstep';

export function playUiButtonClick(scene: Phaser.Scene, volume = 0.55): void {
  if (!scene.cache.audio.exists(SFX_BUTTON_KEY)) return;
  scene.sound.play(SFX_BUTTON_KEY, { volume });
}

export function playFootstep(scene: Phaser.Scene, volume = 0.35): void {
  if (!scene.cache.audio.exists(SFX_FOOTSTEP_KEY)) return;
  scene.sound.play(SFX_FOOTSTEP_KEY, { volume });
}
