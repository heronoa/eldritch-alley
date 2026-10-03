// First screen: one button, one match against the bot. The session it creates is handed to the
// match scene, which owns it from then on.
import Phaser from 'phaser';
import { Session } from '../net/session';
import { FONT, FONT_SIZE, TEXT_COLOR } from '../view/theme';

/** Where the game server listens when the build declares no other endpoint. */
const DEFAULT_ENDPOINT = 'ws://localhost:2567';

export class LobbyScene extends Phaser.Scene {
  private status!: Phaser.GameObjects.Text;
  /** Blocks a second click while the first one is still waiting for the server. */
  private connecting = false;

  constructor() {
    super('lobby');
  }

  create(): void {
    this.connecting = false;

    const { width } = this.scale;

    this.add
      .text(width / 2, 180, 'Eldritch Alley: Tactics', {
        fontFamily: FONT,
        fontSize: FONT_SIZE.title,
        color: TEXT_COLOR,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 300, 'Jogar contra o bot', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#1b1a24',
        backgroundColor: TEXT_COLOR,
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        void this.startMatch();
      });

    this.status = this.add
      .text(width / 2, 380, '', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#e0b050',
      })
      .setOrigin(0.5);
  }

  /** Joins a match and hands the session over. The button stays usable when the join fails. */
  private async startMatch(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;

    const session = new Session(import.meta.env.VITE_GAME_SERVER ?? DEFAULT_ENDPOINT);
    try {
      await session.connect();
    } catch {
      this.status.setText('Servidor indisponível');
      this.connecting = false;
      return;
    }

    this.scene.start('match', { session });
  }
}
