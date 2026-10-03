import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#1b1a24',
  scene: [BootScene],
});
