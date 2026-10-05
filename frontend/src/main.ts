import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LobbyScene } from './scenes/LobbyScene';
import { HudScene } from './scenes/HudScene';
import { MatchScene } from './scenes/MatchScene';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './view/layout';
import { BG_COLOR, cssColor } from './view/theme';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: cssColor(BG_COLOR),
  // The units are 16x24 pixel art drawn at three times their size: without this, every edge blurs.
  pixelArt: true,
  // A fixed 1280x720 canvas is cropped outright on a shorter viewport; FIT is the one-line answer.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // The HUD comes after the match, so it is drawn above the map.
  scene: [BootScene, LobbyScene, MatchScene, HudScene],
});
