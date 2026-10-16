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

/**
 * The one game this page runs. A match at a time: the game is destroyed when the player leaves the
 * match, and the next one is created by the next press of the call to action.
 */
let game: Phaser.Game | null = null;

/** What the title does when it gets the screen back. The title sets it; nothing else has one. */
let onTitleShown: (() => void) | null = null;

/**
 * Registers what the title does when the match ends and the title owns the screen again. The title
 * knows what it has to pick back up; this is only the doorbell.
 */
export function whenTitleShown(handler: () => void): void {
  onTitleShown = handler;
}

/**
 * Starts the match with a session the title has already confirmed. The game is created here and
 * never before, so the title screen costs nothing but its own page until the button is pressed.
 *
 * A page runs one match at a time: calling this while a match is on throws, because the second game
 * would take the screen from the first without either of them knowing. The match is what frees the
 * next one, by destroying its own game when the player leaves it.
 */
export function startMatch(session: Session): void {
  if (game !== null) throw new RangeError('the match has already been started');

  showScreen('match');
  const started = new Phaser.Game(CONFIG);
  game = started;

  // The match is over and its game is gone: Phaser removes the canvas on the next frame and says so
  // here. The title takes the screen back, and this is what lets another match be started.
  started.events.once(Phaser.Core.Events.DESTROY, () => {
    if (game === started) game = null;
    showScreen('title');
    onTitleShown?.();
  });

  // The scenes are added here, not declared in the config. Phaser starts the first scene of the
  // config itself, the moment the textures are ready, with an empty data object — and a scene whose
  // start has already begun ignores the data of a second one. The boot would then hand the match a
  // session it never received. Added from here, while the game is still booting, the boot is started
  // once, with the session, and the other two wait for it to start them.
  started.scene.add('boot', BootScene, true, { session });
  started.scene.add('match', MatchScene, false);
  started.scene.add('hud', HudScene, false);
}

/** The page has two screens — the title and the match canvas — and one of them is on at a time. */
function showScreen(screen: 'title' | 'match'): void {
  const title = document.querySelector<HTMLElement>('main.title');
  const mount = document.getElementById('game');
  if (title !== null) title.hidden = screen !== 'title';
  if (mount !== null) mount.hidden = screen !== 'match';
}
