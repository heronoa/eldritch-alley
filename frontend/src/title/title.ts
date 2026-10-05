// Title screen M2 — the entry point of the client. It wires the page the title is drawn on, runs the
// connection the call to action starts, and hands the confirmed session to the match.
//
// Everything with a rule of its own lives next door and is tested there: what the city is made of in
// `city-data.ts`, where the walkers go in `walkers.ts`, when they stop in `ambient.ts`, the stamp in
// `stamp.ts`, the state of the call to action in `connect-flow.ts`, the wording in `copy.ts` and what
// may move in `motion.ts`. What is left here is the DOM.
import { startMatch, whenTitleShown } from '../main';
import { Session } from '../net/session';
import { createCity, type CityView } from './city-render';
import { canTransition, next, type Flow } from './connect-flow';
import { CTA, CTA_BUSY, UNAVAILABLE } from './copy';
import { motionPolicy, type MotionPolicy } from './motion';
import { loadSheets } from './sheet';
import { stampAt } from './stamp';

/** Where the game server listens when the build declares no other endpoint. */
const DEFAULT_ENDPOINT = 'ws://localhost:2567';

/** The player's own setting for how much the screen is allowed to move. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The element with this id, or an error: the markup and this file are written together. */
function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the title markup has no #${id}`);
  return found as T;
}

const canvas = byId<HTMLCanvasElement>('title-city');
const cta = byId<HTMLButtonElement>('cta');
const alertLine = byId<HTMLParagraphElement>('alert');
const granted = byId<HTMLDivElement>('granted');

/**
 * The call to action as the page loads it: nothing pressed, nothing announced. Kept as one value so
 * the title can be put back in this state when a match ends and the title owns the screen again.
 */
const IDLE: Flow = { state: 'idle', stampStartedAt: null };

/** Where the call to action is: idle, waiting for the server, confirmed, or back with an error. */
let flow: Flow = IDLE;

/**
 * Whether the title owns the screen. While the match is on it does not: the page's keys are the
 * match's then, and the city stays where the title left it.
 */
let onScreen = true;

/** The session the server confirmed, until the match takes it over. */
let session: Session | null = null;

/** The city behind the title, once its sheets are in memory. */
let city: CityView | null = null;

/** The stamp's own frame loop, running only while there is a stamp to place. */
let stampLoop = 0;

const reducedMotion = window.matchMedia(REDUCED_MOTION);

/** What the screen may move, from the player's own setting. */
let policy: MotionPolicy = motionPolicy(reducedMotion.matches);

/** The server to join: the build's own if it has one, the development one otherwise. */
function endpoint(): string {
  return import.meta.env.VITE_GAME_SERVER ?? DEFAULT_ENDPOINT;
}

/**
 * One frame of the stamp: the class follows the pose, which is the only thing that changes from one
 * frame to the next. When the server has confirmed and the slam is over, the match takes the screen.
 */
function stampFrame(now: number): void {
  if (flow.stampStartedAt !== null) {
    granted.classList.toggle('on', stampAt(now - flow.stampStartedAt).visible);
  }

  if (canTransition(flow, now)) {
    handOver();
    return;
  }

  stampLoop = requestAnimationFrame(stampFrame);
}

/** Starts the stamp's loop. Calling it twice is the same as calling it once. */
function startStamp(): void {
  if (stampLoop !== 0) return;
  stampLoop = requestAnimationFrame(stampFrame);
}

/** Stops the stamp's loop, leaving the stamp where it is. */
function stopStamp(): void {
  if (stampLoop === 0) return;
  cancelAnimationFrame(stampLoop);
  stampLoop = 0;
}

/** Gives the screen to the match. The session belongs to it from here on. */
function handOver(): void {
  if (session === null) return;
  const confirmed = session;
  session = null;

  stopStamp();
  // The match owns the screen from here: the city has no one left to walk for, and the page's keys
  // are not the title's. Both come back in `resume`, when the match ends.
  onScreen = false;
  city?.stop();
  startMatch(confirmed);
}

/** The server did not answer: the stamp goes, the reason shows, and the button comes back. */
function fail(): void {
  flow = next(flow, 'failed', performance.now());
  stopStamp();
  resetControls();
  alertLine.textContent = UNAVAILABLE;
}

/** The call to action's own controls, back as the page loads them: no stamp, no notice, button ready. */
function resetControls(): void {
  granted.classList.remove('on');
  alertLine.textContent = '';
  cta.disabled = false;
  cta.textContent = CTA;
}

/**
 * The match is over and the title has the screen again: the call to action is usable, and the city
 * picks its walkers back up where it left them.
 */
function resume(): void {
  onScreen = true;
  flow = IDLE;
  resetControls();
  city?.start();
}

/** What a press does: the stamp goes up, the session is opened, and the flow follows both. */
async function press(): Promise<void> {
  // A press belongs to the title only while the title is on screen: during a match, Enter is the
  // match's key, not another call to action.
  if (!onScreen) return;

  const before = flow;
  flow = next(flow, 'press', performance.now());
  // The flow answers an event it ignores with the flow it was given: a press it ignores changes
  // nothing, which is what keeps a second click from opening a second session.
  if (flow === before) return;

  cta.disabled = true;
  cta.textContent = CTA_BUSY;
  alertLine.textContent = '';
  startStamp();

  const opening = new Session(endpoint());
  try {
    await opening.connect();
  } catch {
    // A session that never reached a room is worth dropping, so a retry starts from nothing.
    opening.close();
    fail();
    return;
  }

  // The screen may have been given up while the server was answering; then this session is spare.
  if (flow.state !== 'connecting') {
    opening.close();
    return;
  }

  session = opening;
  flow = next(flow, 'connected', performance.now());
}

/** Loads the sheets and puts the city behind the title. Without them the title still starts a match. */
async function bootCity(): Promise<void> {
  try {
    city = createCity(canvas, await loadSheets(), policy);
    city.start();
  } catch (error) {
    // The city is the backdrop of the screen, not the screen: a broken asset must not take the call
    // to action down with it.
    console.error(error);
  }
}

cta.addEventListener('click', () => void press());

// Enter starts a match from anywhere on the page, as the prototype does. A held key is not a hundred
// presses, and a press the flow ignores costs nothing.
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.repeat) return;
  void press();
});

// A reload, a closed tab or a navigation: a session nobody has taken over is released.
window.addEventListener('pagehide', () => session?.close());

// The setting can change while the page is open, and the city follows it.
reducedMotion.addEventListener('change', (event) => {
  policy = motionPolicy(event.matches);
  city?.setPolicy(policy);
});

// The match ends by taking its own game down, and `main.ts` says so once the canvas is gone: that is
// where the title hears the screen is its own again.
whenTitleShown(resume);

void bootCity();
