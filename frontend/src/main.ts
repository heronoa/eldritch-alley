import Phaser from 'phaser';
import type { Session } from './net/session';
import { BootScene } from './scenes/BootScene';
import { HudScene } from './scenes/HudScene';
import { MatchScene } from './scenes/MatchScene';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './view/layout';
import { BG_COLOR, cssColor } from './view/theme';

/**
 * The game, as the match needs it. The scenes are added in `startMatch`, in the order they draw.
 *
 * Nothing here runs at import time: the title is a page of its own, and the game only exists once
 * the server has confirmed a session (`startMatch`).
 */
const CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: cssColor(BG_COLOR),
  // The units are 16x24 pixel art drawn at three times their size: without this, every edge blurs.
  pixelArt: true,
  // A fixed 1280x720 canvas is cropped outright on a shorter viewport; FIT is the one-line answer.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
};

/** The one game this page runs. */
let game: Phaser.Game | null = null;

/**
 * Starts the match with a session the title has already confirmed. The game is created here and
 * never before, so the title screen costs nothing but its own page until the button is pressed.
 *
 * A page runs one match: calling this twice throws, because the second game would take the screen
 * from the first without either of them knowing.
 */
export function startMatch(session: Session): void {
  if (game !== null) throw new RangeError('the match has already been started');

  showGame();
  game = new Phaser.Game(CONFIG);
  // The scenes are added here, not declared in the config. Phaser starts the first scene of the
  // config itself, the moment the textures are ready, with an empty data object — and a scene whose
  // start has already begun ignores the data of a second one. The boot would then hand the match a
  // session it never received. Added from here, while the game is still booting, the boot is started
  // once, with the session, and the other two wait for it to start them.
  game.scene.add('boot', BootScene, true, { session });
  game.scene.add('match', MatchScene, false);
  game.scene.add('hud', HudScene, false);
}

/** Takes the title down and puts the game canvas on screen. */
function showGame(): void {
  const title = document.querySelector<HTMLElement>('main.title');
  const mount = document.getElementById('game');
  if (title !== null) title.hidden = true;
  if (mount !== null) mount.hidden = false;
}
