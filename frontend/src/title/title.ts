// Title screen M2 — the entry point of the client. It wires the page the title is drawn on, runs the
// connection the call to action starts, and hands the confirmed session to the match.
//
// Everything with a rule of its own lives next door and is tested there: what the city is made of in
// `city-data.ts`, where the walkers go in `walkers.ts`, when they stop in `ambient.ts`, the stamp in
// `stamp.ts`, the state of the call to action in `connect-flow.ts`, the wording in `copy.ts`, which
// languages the switcher offers in `language.ts`, and what may move in `motion.ts`. What is left
// here is the DOM.
import { gameServerEndpoint } from '../config';
import { getLocale, saveLocale, setLocale, type Locale } from '../i18n';
import { Session } from '../net/session';
import { createCity, type CityView } from './city-render';
import { canTransition, next, type Flow } from './connect-flow';
import { titleCopy, type TitleCopy } from './copy';
import { LANGUAGE_OPTIONS, switchesTo } from './language';
import { motionPolicy, type MotionPolicy } from './motion';
import { loadSheets } from './sheet';
import { stampAt } from './stamp';

/** The player's own setting for how much the screen is allowed to move. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The element with this id, or an error: the markup and this file are written together. */
function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the title markup has no #${id}`);
  return found as T;
}

const canvas = byId<HTMLCanvasElement>('title-city');
const meta = byId<HTMLParagraphElement>('meta');
const heading = byId<HTMLHeadingElement>('name');
const stampTag = byId<HTMLSpanElement>('stamp');
const tagline = byId<HTMLParagraphElement>('tagline');
const cta = byId<HTMLButtonElement>('cta');
const hint = byId<HTMLParagraphElement>('hint');
const alertLine = byId<HTMLParagraphElement>('alert');
const granted = byId<HTMLDivElement>('granted');
const footerVersion = byId<HTMLSpanElement>('footer-version');
const footerPlace = byId<HTMLSpanElement>('footer-place');
const switcher = byId<HTMLDivElement>('lang');

/**
 * Writes the page in the language the client is in: the title's own lines, the document's language,
 * and the tab's name. The markup carries the same text in Portuguese, which is what a page whose
 * script never runs shows; from here on the catalog is the one source. The switcher calls this again
 * on a press, which is why it reads the copy instead of holding it.
 */
function render(): void {
  const copy = titleCopy();

  document.documentElement.lang = getLocale();
  document.title = copy.document;
  meta.textContent = copy.meta;
  heading.textContent = copy.name;
  stampTag.textContent = copy.stampTag;
  tagline.textContent = copy.tagline;
  hint.textContent = copy.hint;
  granted.textContent = copy.granted;
  footerVersion.textContent = copy.footerVersion;
  footerPlace.textContent = copy.footerPlace;

  renderFlow(copy);
  renderSwitcher(copy);
}

/**
 * The lines the flow owns, read from the flow rather than written at each step: the button's label,
 * whether it answers, and what went wrong. Deriving them is what keeps a language change and a state
 * change from disagreeing about what the screen says.
 *
 * The button answers in `idle` and `failed` alone. From the press until the match takes the screen —
 * `connecting`, then `ready` while the stamp lands — the session is the title's to finish, and the
 * only thing a second press would do is nothing.
 */
function renderFlow(copy: TitleCopy): void {
  const answers = flow.state === 'idle' || flow.state === 'failed';

  cta.disabled = !answers;
  cta.textContent = answers ? copy.cta : copy.ctaBusy;
  alertLine.textContent = flow.state === 'failed' ? copy.unavailable : '';
}

/** The switcher: what it is called, and which of its buttons is the language on screen. */
function renderSwitcher(copy: TitleCopy): void {
  switcher.setAttribute('aria-label', copy.language);

  for (const button of languageButtons) {
    button.element.setAttribute('aria-pressed', String(button.locale === getLocale()));
  }
}

/**
 * The switcher's buttons, built from the locales the client ships rather than written in the markup:
 * a third language cannot be shipped without its button, and the markup holds only the box around
 * them, which draws nothing while it is empty. The press is wired here and decided in `language.ts`.
 */
const languageButtons = LANGUAGE_OPTIONS.map((option) => {
  const element = document.createElement('button');
  element.type = 'button';
  // The label is the language's own code, so it is announced in that language: "EN" inside a page in
  // pt-BR would otherwise be read with Portuguese phonetics, which is not what the player is looking
  // for. The letter pair itself is the same in either locale, so only this attribute changes.
  element.lang = option.locale;
  element.textContent = option.label;
  element.addEventListener('click', () => switchLanguage(option.locale));

  switcher.append(element);
  return { locale: option.locale, element };
});

/** What a press on the switcher does: the language changes, the page is written again, and it is kept. */
function switchLanguage(locale: Locale): void {
  if (!switchesTo(getLocale(), locale)) return;

  setLocale(locale);
  saveLocale(locale);
  render();
}

/** The server to join. Resolved here, at load: a build without a valid endpoint never shows the title. */
const endpoint = gameServerEndpoint(import.meta.env);

/**
 * The call to action as the page loads it: nothing pressed, nothing announced. Kept as one value so
 * the title can be put back in this state when a match ends and the title owns the screen again.
 */
const IDLE: Flow = { state: 'idle', stampStartedAt: null };

/** Where the call to action is: idle, waiting for the server, confirmed, or back with an error. */
let flow: Flow = IDLE;

// The page opens in the language the player picked last time, or the one the browser asks for, which
// is what `getLocale` resolves. Every line below the title is written from here.
render();

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

/**
 * The match module, Phaser included. It is downloaded the first time a match starts, never with the
 * title. A failed download is forgotten, so the next press tries again.
 */
let matchModule: Promise<typeof import('../main')> | null = null;

function loadMatch(): Promise<typeof import('../main')> {
  matchModule ??= import('../main').then(
    (main) => {
      // The match's handler for "the title has the screen again", registered once, before any match.
      main.whenTitleShown(resume);
      return main;
    },
    (error) => {
      matchModule = null;
      throw error;
    },
  );
  return matchModule;
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

  loadMatch().then(
    (main) => main.startMatch(confirmed),
    () => {
      // The match could not be downloaded: the session is released and the title is usable again.
      // The flow is set by hand, because `next` answers nothing from `ready`.
      confirmed.close();
      flow = { state: 'failed', stampStartedAt: null };
      onScreen = true;
      renderControls();
      city?.start();
    },
  );
}

/** The server did not answer: the stamp goes, the reason shows, and the button comes back. */
function fail(): void {
  flow = next(flow, 'failed', performance.now());
  stopStamp();
  renderControls();
}

/**
 * The call to action's own controls in the state the flow is in: the stamp is put away, and the
 * button's two lines are written again. Called wherever the flow moves outside of `render`.
 */
function renderControls(): void {
  granted.classList.remove('on');
  renderFlow(titleCopy());
}

/**
 * The match is over and the title has the screen again: the call to action is usable, and the city
 * picks its walkers back up where it left them.
 */
function resume(): void {
  onScreen = true;
  flow = IDLE;
  renderControls();
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

  // The flow is `connecting` by now, so the button reads its own two lines from it.
  renderControls();
  startStamp();

  const opening = new Session(endpoint);
  try {
    // Resumes the match this page was in before a reload, when there is one to resume.
    await opening.open();
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

void bootCity();
