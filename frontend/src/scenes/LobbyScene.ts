// First screen: one button, one match against the bot. The session it creates is handed to the
// match scene, which owns it from then on.
import Phaser from 'phaser';
import { Session } from '../net/session';
import { containsPoint, type Rect } from '../view/layout';
import { FONT_BODY, FONT_SIZE, FONT_TITLE, TEXT_COLOR, TEXT_COLOR_ALERT } from '../view/theme';
import { Button } from './widgets';

/** Where the game server listens when the build declares no other endpoint. */
const DEFAULT_ENDPOINT = 'ws://localhost:2567';

const PLAY_BUTTON = { width: 260, height: 56 };

export class LobbyScene extends Phaser.Scene {
  private status!: Phaser.GameObjects.Text;
  private play!: Button;
  /** The rectangle the play button is drawn in, which is also the one the click is tested against. */
  private playRect!: Rect;
  /** Blocks a second click while the first one is still waiting for the server. */
  private connecting = false;

  constructor() {
    super('lobby');
  }

  create(): void {
    this.connecting = false;

    const { width, height } = this.scale;
    const middle = height / 2;

    this.add
      .text(width / 2, middle - 100, 'Eldritch Alley: Tactics', {
        fontFamily: FONT_TITLE,
        fontSize: FONT_SIZE.title,
        color: TEXT_COLOR,
      })
      .setOrigin(0.5);

    this.playRect = {
      x: width / 2 - PLAY_BUTTON.width / 2,
      y: middle - PLAY_BUTTON.height / 2,
      width: PLAY_BUTTON.width,
      height: PLAY_BUTTON.height,
    };
    this.play = new Button(this, this.playRect, 'Jogar contra o bot');

    // The button only draws; the click is tested against the rectangle it was drawn in (DT-30).
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.connecting && containsPoint(this.playRect, { x: pointer.x, y: pointer.y })) {
        void this.startMatch();
      }
    });

    this.status = this.add
      .text(width / 2, middle + 70, '', {
        fontFamily: FONT_BODY,
        fontSize: FONT_SIZE.unit,
        color: TEXT_COLOR_ALERT,
      })
      .setOrigin(0.5);
  }

  /** Joins a match and hands the session over. The button comes back when the join fails. */
  private async startMatch(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;
    this.play.setEnabled(false);

    const session = new Session(import.meta.env.VITE_GAME_SERVER ?? DEFAULT_ENDPOINT);
    try {
      await session.connect();
    } catch {
      this.status.setText('Servidor indisponível');
      this.connecting = false;
      this.play.setEnabled(true);
      return;
    }

    this.scene.start('match', { session });
  }
}
