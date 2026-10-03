import Phaser from 'phaser';

// Cena de entrada. As telas de partida e de menu entram como cenas próprias.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Eldritch Alley: Tactics', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#e8e2d0',
      })
      .setOrigin(0.5);
  }
}
