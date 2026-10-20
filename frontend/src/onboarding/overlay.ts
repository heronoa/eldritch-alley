// Onboarding m2 — the layer over the title, as rules: when it opens, what the card reads, and what each
// of its three controls does to the flow.
//
// Every decision lives here and none of them is written on the page: `onboarding.ts` is the DOM half and
// does the writing, on the same split as `title.ts` and its neighbours. That is what makes the layer
// testable without a browser, which is how this project tests everything else (see
// `.ia_context/project-lessons/lessons/title-screen.lesson.md`).
//
// Nothing here touches storage. The flag is read once, at load, by the DOM half — and never by the footer
// link, which opens the sequence without asking whether it has been read before.
import type { OnboardingCopy } from './copy';
import { ONBOARDING_CARDS } from './content';
import { next, type FlowEvent, type OnboardingFlow } from './flow';

/** How many cards the sequence has: the number of step dots, and the length of every walk over it. */
export const CARD_COUNT = ONBOARDING_CARDS.length;

/** The last card, which is the one whose forward button concludes the sequence. */
const LAST_STEP = CARD_COUNT - 1;

/**
 * The sequence open on its first card: where a first visit starts it, and where the title's footer link
 * starts it again. The same flow either way, because the link is a question and not a first visit.
 */
export const FIRST_CARD: OnboardingFlow = { step: 0, state: 'active' };

/**
 * The controls of the layer, in the order Tab walks them. The sequence carries three, and the DOM half
 * looks each one up by the name it has here.
 */
export const OVERLAY_CONTROLS = ['back', 'forward', 'skip'] as const;

/** One of the layer's controls, by the name the flow's events are told apart by. */
export type OverlayControl = (typeof OVERLAY_CONTROLS)[number];

/** Where one press leaves the sequence, and whether the player is to be shown it again by itself. */
export interface OverlayOutcome {
  /** The flow one event later. */
  readonly flow: OnboardingFlow;
  /**
   * The sequence was left behind by this press, so the flag is to be marked. It is true for the two
   * presses that end the sequence — a skip, and the last card's own button — and for nothing else.
   */
  readonly seen: boolean;
}

/** The card on the screen, as the DOM half writes it. Every line comes from the catalog, never from here. */
export interface OnboardingView {
  /** The layer is over the title, or behind it. */
  readonly hidden: boolean;
  /** The card being read, which is also the dot that is lit. */
  readonly step: number;
  readonly heading: string;
  readonly body: string;
  readonly backLabel: string;
  /** There is a card before this one. The first card's button is drawn disabled. */
  readonly backEnabled: boolean;
  /** The forward button: `advance` on every card but the last, `finish` on it. */
  readonly forwardLabel: string;
  /** The forward button of the last card concludes the sequence instead of moving on. */
  readonly forwardConcludes: boolean;
  readonly skipLabel: string;
}

/**
 * Whether this load opens the sequence by itself: it does on a browser that has never been shown it, and
 * never again after that. The flag itself is `seen.ts`'s; this is only the answer read off it.
 */
export function opensOnLoad(hasSeen: boolean): boolean {
  return !hasSeen;
}

/**
 * The sequence one press of `control` later. Marking the flag is left to the caller: what is decided here
 * is whether this press is one of the two that end the sequence, and the DOM half bites the flag on it.
 */
export function press(flow: OnboardingFlow, control: OverlayControl): OverlayOutcome {
  const after = next(flow, eventFor(control, flow));

  return { flow: after, seen: flow.state !== 'done' && after.state === 'done' };
}

/** The event a control asks of the flow. Only the forward button's event depends on where the flow is. */
function eventFor(control: OverlayControl, flow: OnboardingFlow): FlowEvent {
  switch (control) {
    case 'back':
      return 'back';
    case 'skip':
      return 'skip';
    // The forward button of the last card is the one that finishes; every other one moves on. Both are
    // read from `flow.step`, so a card added to `content.ts` moves the last one without a second list.
    case 'forward':
      return flow.step < LAST_STEP ? 'advance' : 'finish';
  }
}

/**
 * What the layer shows for one flow, in the language on screen.
 *
 * `open` is whether this load put the layer up: a browser that has read the sequence already shows
 * nothing until the footer link asks for it. A flow that is over is hidden either way — a skip puts the
 * layer away without waiting for the load to change its mind about showing it.
 */
export function viewOf(flow: OnboardingFlow, copy: OnboardingCopy, open: boolean): OnboardingView {
  const card = ONBOARDING_CARDS[flow.step];
  const lines = copy.cards[card.id];
  const concludes = flow.step === LAST_STEP;

  return {
    hidden: !open || flow.state === 'done',
    step: flow.step,
    heading: lines.heading,
    body: lines.body,
    backLabel: copy.back,
    backEnabled: flow.step > 0,
    forwardLabel: concludes ? copy.finish : copy.advance,
    forwardConcludes: concludes,
    skipLabel: copy.skip,
  };
}

/**
 * The control Tab moves to, from the control at `from`. The layer answers Tab itself rather than leaving
 * it to the browser, which would walk the focus out of a dialog `aria-modal` promises is modal and onto
 * the call to action behind it. A `from` outside the controls is read as the first of them.
 */
export function focusAfterTab(from: number, backwards: boolean): number {
  const count = OVERLAY_CONTROLS.length;
  const start = Math.max(0, Math.min(from, count - 1));

  return (start + (backwards ? -1 : 1) + count) % count;
}
