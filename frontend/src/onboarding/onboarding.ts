// Onboarding m2 — the sequence over the title, as a page: the layer that opens by itself on a first
// visit, can be skipped and read to the end, and can be opened again from the title's footer.
//
// What is left here is the DOM, and nothing else: when the layer opens is `overlay.ts`'s answer, the
// sequence is `flow.ts`'s, the words are `copy.ts`'s and the flag is `seen.ts`'s. This file finds the
// elements, writes what the view says, and hands every press to the rules — the same split `title.ts`
// keeps with its own neighbours.
//
// It never touches the connection: `connect-flow.ts`, `press()` and the session are the title's, and the
// sequence is a layer over the title rather than a step of it.
import { onLocaleChange } from '../title/title';
import { onboardingCopy } from './copy';
import { ONBOARDING_CARDS } from './content';
import type { OnboardingFlow } from './flow';
import {
  FIRST_CARD,
  focusAfterTab,
  opensOnLoad,
  OVERLAY_CONTROLS,
  press,
  viewOf,
  type OverlayControl,
} from './overlay';
import { hasSeenOnboarding, markOnboardingSeen } from './seen';

/** The element with this id, or an error: the markup and this file are written together. */
function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the onboarding markup has no #${id}`);
  return found as T;
}

const root = byId<HTMLDivElement>('onboarding');
const heading = byId<HTMLParagraphElement>('onboarding-heading');
const body = byId<HTMLParagraphElement>('onboarding-body');
const dots = byId<HTMLDivElement>('onboarding-dots');
const howToPlay = byId<HTMLButtonElement>('how-to-play');

/** The layer's three controls, by the name the rules know them by. */
const controls: Readonly<Record<OverlayControl, HTMLButtonElement>> = {
  back: byId<HTMLButtonElement>('onboarding-back'),
  forward: byId<HTMLButtonElement>('onboarding-forward'),
  skip: byId<HTMLButtonElement>('onboarding-skip'),
};

/**
 * One dot per card, built from the sequence rather than written in the markup: a card added to
 * `content.ts` cannot arrive without its dot, and the box holds nothing for a page whose script never
 * runs. Same rule the switcher's buttons follow on the title.
 */
const stepDots = ONBOARDING_CARDS.map(() => {
  const dot = document.createElement('span');
  dots.append(dot);
  return dot;
});

/**
 * Whether this load put the layer up, read once: the sequence is shown to a browser that has never been
 * shown it. From here on it is the footer link that opens it, and the link asks nothing of the flag.
 */
let open = opensOnLoad(hasSeenOnboarding());

/** Where the sequence is: the first card until a press moves it. */
let flow: OnboardingFlow = FIRST_CARD;

/** Writes the layer from the rules: what it says, whether it is up, and which dot is lit. */
function render(): void {
  const view = viewOf(flow, onboardingCopy(), open);

  // One label per control, written as a closed map for the same reason the copy is: a fourth control
  // added to `OVERLAY_CONTROLS` is a compile error here before it is a button with no word on it.
  const labels: Readonly<Record<OverlayControl, string>> = {
    back: view.backLabel,
    forward: view.forwardLabel,
    skip: view.skipLabel,
  };

  root.hidden = view.hidden;
  heading.textContent = view.heading;
  body.textContent = view.body;
  controls.back.disabled = !view.backEnabled;
  for (const control of OVERLAY_CONTROLS) controls[control].textContent = labels[control];

  stepDots.forEach((dot, index) => dot.classList.toggle('on', index === view.step));
}

/** Puts the layer up on the card it is on, with the focus on the button that moves the player on. */
function show(): void {
  render();
  // Nothing is focused while the layer is down, so the title keeps the focus it had.
  if (!root.hidden) controls.forward.focus();
}

/**
 * What a press on one of the controls does: the sequence moves, and the flag is marked exactly when the
 * press was one of the two that leave it behind. `outcome.seen` is that answer, decided in `overlay.ts`.
 */
function act(control: OverlayControl): void {
  const outcome = press(flow, control);

  flow = outcome.flow;
  if (outcome.seen) markOnboardingSeen();
  render();
}

for (const control of OVERLAY_CONTROLS) {
  controls[control].addEventListener('click', () => act(control));
}

/**
 * What the footer link does: the sequence opens on its first card, whether or not it has been read. It
 * is a question the player is asking, so the flag is neither read nor written here — the sequence comes
 * back as many times as the link is pressed.
 */
howToPlay.addEventListener('click', () => {
  flow = FIRST_CARD;
  open = true;
  show();
});

// Tab is answered here rather than left to the browser, which would carry the focus out of a dialog
// `aria-modal` promises is modal and onto the call to action behind the card. The title's notice holds
// its single control the same way; this one cycles over its three.
root.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  event.preventDefault();

  const from = OVERLAY_CONTROLS.findIndex((control) => controls[control] === document.activeElement);
  controls[OVERLAY_CONTROLS[focusAfterTab(from, event.shiftKey)]].focus();
});

// The switcher rewrites the card while it is open: the words are read again in the new language and the
// step is left where the player put it.
onLocaleChange(render);

// The first card is under the player's hands from the moment the layer is up, and a browser that has
// read the sequence already gets nothing but a hidden box.
show();
