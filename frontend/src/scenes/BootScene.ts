import Phaser from 'phaser';
import type { Session } from '../net/session';

/** Frame size of both sheets: one column is one pose, one row is one class. */
const FRAME = { frameWidth: 16, frameHeight: 24 };

/**
 * How long the boot waits for the typefaces before showing what it has. The game never blocks on a
 * font: a slow or offline load falls through to the fallback monospace, which still reads.
 */
const FONT_WAIT_MS = 2000;

// Entry scene of the match. It loads the art and the type, then hands the session to the match.
export class BootScene extends Phaser.Scene {
  /** The session the title confirmed. The match owns it from `create` on. */
  private session!: Session;

  constructor() {
    super('boot');
  }

  init(data: { session: Session }): void {
    this.session = data.session;
  }

  preload(): void {
    this.load.spritesheet('unit-ally', 'sprites/spritesheet-ally.png', FRAME);
    this.load.spritesheet('unit-enemy', 'sprites/spritesheet-enemy.png', FRAME);
  }

  create(): void {
    // The boot has one job, and the session is the whole of it. Started without one, it would hand
    // the match an empty session and the screen would stay black; better to say so here.
    if (this.session === undefined) {
      throw new Error('the boot scene was started without a session');
    }
    void this.handOver();
  }

  /** Waits for the fonts, then starts the match with the session it was given. */
  private async handOver(): Promise<void> {
    await this.waitForFonts();
    this.scene.start('match', { session: this.session });
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
