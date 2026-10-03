import Phaser from 'phaser';
import { FONT, FONT_SIZE, TEXT_COLOR } from '../view/theme';

// Entry scene. It holds the title just long enough to be read, then hands over to the lobby.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Eldritch Alley: Tactics', {
        fontFamily: FONT,
        fontSize: FONT_SIZE.title,
        color: TEXT_COLOR,
      })
      .setOrigin(0.5);

    this.time.delayedCall(1000, () => this.scene.start('lobby'));
  }
}
