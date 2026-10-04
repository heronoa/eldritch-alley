import Phaser from 'phaser';
import { FONT_TITLE, FONT_SIZE, TEXT_COLOR } from '../view/theme';

/** Frame size of both sheets: one column is one pose, one row is one class. */
const FRAME = { frameWidth: 16, frameHeight: 24 };

/**
 * How long the boot waits for the typefaces before showing what it has. The game never blocks on a
 * font: a slow or offline load falls through to the fallback monospace, which still reads.
 */
const FONT_WAIT_MS = 2000;

/** The title is held just long enough to be read, whatever the fonts did. */
const TITLE_MS = 1000;

// Entry scene. It loads the art and the type, then hands over to the lobby.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.spritesheet('unit-ally', 'sprites/spritesheet-ally.png', FRAME);
    this.load.spritesheet('unit-enemy', 'sprites/spritesheet-enemy.png', FRAME);
  }

  create() {
    void this.handOver();
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Eldritch Alley: Tactics', {
        fontFamily: FONT_TITLE,
        fontSize: FONT_SIZE.title,
        color: TEXT_COLOR,
      })
      .setOrigin(0.5);
  }

  /** Waits for the fonts and the title together, then starts the lobby. */
  private async handOver(): Promise<void> {
    await Promise.all([this.waitForFonts(), this.wait(TITLE_MS)]);
    this.scene.start('lobby');
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  /**
   * Asks the browser for the two typefaces, raced against a timeout. A failure is not an error
   * here: the scene continues and the canvas draws with whatever the document already has.
   */
  private async waitForFonts(): Promise<void> {
    const fonts = document.fonts;
    if (fonts === undefined) return;

    const loaded = Promise.all([
      fonts.load(`32px "Special Elite"`),
      fonts.load(`18px "IBM Plex Mono"`),
    ]).then(() => undefined);

    const timeout = new Promise<void>((resolve) => this.time.delayedCall(FONT_WAIT_MS, resolve));

    try {
      await Promise.race([loaded, timeout]);
    } catch {
      // A font that refuses to load is not worth stopping the game for.
    }
  }
}
