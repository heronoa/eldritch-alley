import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MatchScene } from './scenes/MatchScene';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './view/layout';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#1b1a24',
  // A fixed 1280x720 canvas is cropped outright on a shorter viewport; FIT is the one-line answer.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, LobbyScene, MatchScene],
});
