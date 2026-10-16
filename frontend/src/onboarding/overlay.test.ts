// Onboarding m2 — the layer over the title: when it opens, what the card reads, and what each of its
// controls does to the flow.
//
// The DOM has no part here. `onboarding.ts` writes these decisions onto the page and is the only file of
// the feature that touches `document`, on the split `title-screen.lesson.md` records: every rule with a
// rule of its own lives in a module with Node tests, and what is left in the DOM file is the wiring.
//
// The flag itself belongs to `seen.ts` (m1) and the sequence to `flow.ts` (m1). What is tested here is
// the join of the two: which of the load's two answers opens the overlay, which press marks the sequence
// read and which one does not, and what the card says at each step in the language on screen.
import { describe, expect, it } from 'vitest';
import { setLocale, type Locale } from '../i18n';
import { ONBOARDING_CARDS } from './content';
import { onboardingCopy, type OnboardingCopy } from './copy';
import type { OnboardingFlow } from './flow';
import {
  CARD_COUNT,
  FIRST_CARD,
  focusAfterTab,
  opensOnLoad,
  OVERLAY_CONTROLS,
  press,
  viewOf,
  type OverlayControl,
} from './overlay';

/** The last card: the one whose forward button concludes the sequence. */
const LAST = CARD_COUNT - 1;

/** The copy of a named language, read the way the screen reads it on every render. */
function copyIn(locale: Locale): OnboardingCopy {
  setLocale(locale);
  return onboardingCopy();
}

/** The sequence being read at `step`. */
function at(step: number): OnboardingFlow {
  return { step, state: 'active' };
}

/** What the overlay shows for one flow, with the overlay up. */
function shown(flow: OnboardingFlow, copy: OnboardingCopy = copyIn('pt-BR')) {
  return viewOf(flow, copy, true);
}

describe('opening the sequence', () => {
  it('opens by itself on a first visit, and stays down on a visit that has read it already', () => {
    expect(opensOnLoad(false)).toBe(true);
    expect(opensOnLoad(true)).toBe(false);

    // And the two answers reach the screen as the overlay's own `hidden`, which is what the markup
    // starts with and what the script takes away.
    expect(viewOf(FIRST_CARD, copyIn('pt-BR'), opensOnLoad(false)).hidden).toBe(false);
    expect(viewOf(FIRST_CARD, copyIn('pt-BR'), opensOnLoad(true)).hidden).toBe(true);
  });

  it('starts on the first card, with the sequence being read', () => {
    expect(FIRST_CARD.step).toBe(0);
    expect(FIRST_CARD.state).toBe('active');
    expect(shown(FIRST_CARD).hidden).toBe(false);
  });

  it('opens again on the first card from the title’s footer link, however far the player had read', () => {
    // The link is a question, not a first visit: the sequence it opens is the same `FIRST_CARD` a first
    // visit opens, so a browser that has read it already gets it again from the start, and `seen.ts` is
    // never asked. A sequence left behind stays down until something opens it.
    expect(FIRST_CARD).toEqual({ step: 0, state: 'active' });
    expect(shown(FIRST_CARD).hidden).toBe(false);
    expect(shown({ step: LAST, state: 'done' }).hidden).toBe(true);
  });
});

describe('what the card reads', () => {
  it('shows the heading and the body of the card being read', () => {
    for (let step = 0; step <= LAST; step += 1) {
      const view = shown(at(step));
      const card = ONBOARDING_CARDS[step];

      expect(view.step, String(step)).toBe(step);
      expect(view.heading, card.id).toBe(copyIn('pt-BR').cards[card.id].heading);
      expect(view.body, card.id).toBe(copyIn('pt-BR').cards[card.id].body);
    }
  });

  it('carries the three controls of the sequence, named by the catalog', () => {
    const copy = copyIn('pt-BR');
    const view = shown(FIRST_CARD, copy);

    expect(view.skipLabel).toBe(copy.skip);
    expect(OVERLAY_CONTROLS).toEqual(['back', 'forward', 'skip']);
  });

  it('concludes on the last card instead of advancing: the forward button is the one that finishes', () => {
    const copy = copyIn('pt-BR');

    expect(shown(at(0), copy).forwardLabel).toBe(copy.advance);
    expect(shown(at(0), copy).forwardConcludes).toBe(false);
    expect(shown(at(LAST), copy).forwardLabel).toBe(copy.finish);
    expect(shown(at(LAST), copy).forwardConcludes).toBe(true);
  });

  it('has nothing to go back to on the first card, and the way back from every card after it', () => {
    expect(shown(at(0)).backEnabled).toBe(false);
    for (let step = 1; step <= LAST; step += 1) {
      expect(shown(at(step)).backEnabled, String(step)).toBe(true);
    }
  });

  it('reads the card again in the language on screen, without moving off the card being read', () => {
    // The switcher rewrites the overlay while it is open: the step stays where the player left it and
    // only the words change.
    const flow = at(2);
    const pt = shown(flow, copyIn('pt-BR'));
    const en = shown(flow, copyIn('en-US'));

    expect(en.step).toBe(pt.step);
    expect(en.hidden).toBe(pt.hidden);
    expect(en.heading).not.toBe(pt.heading);
    expect(en.body).not.toBe(pt.body);
    expect(en.forwardLabel).not.toBe(pt.forwardLabel);
    expect(en.skipLabel).not.toBe(pt.skipLabel);
  });
});

describe('what a press does', () => {
  it('walks forward without marking anything, on every card but the last', () => {
    for (let step = 0; step < LAST; step += 1) {
      const outcome = press(at(step), 'forward');

      expect(outcome.seen, String(step)).toBe(false);
      expect(outcome.flow, String(step)).toEqual(at(step + 1));
      expect(viewOf(outcome.flow, copyIn('pt-BR'), true).hidden, String(step)).toBe(false);
    }
  });

  it('marks the sequence read and puts it away when the last card’s own button concludes it', () => {
    // The flag the load reads is bitten here and nowhere else but the skip: this is the press that ends
    // the sequence on purpose, having read all of it.
    const outcome = press(at(LAST), 'forward');

    expect(outcome.seen).toBe(true);
    expect(outcome.flow.state).toBe('done');
    expect(viewOf(outcome.flow, copyIn('pt-BR'), true).hidden).toBe(true);
  });

  it('marks the sequence read and puts it away from a skip on any card at all', () => {
    for (let step = 0; step <= LAST; step += 1) {
      const outcome = press(at(step), 'skip');

      expect(outcome.seen, String(step)).toBe(true);
      expect(outcome.flow.state, String(step)).toBe('done');
      expect(viewOf(outcome.flow, copyIn('pt-BR'), true).hidden, String(step)).toBe(true);
    }
  });

  it('goes back a card without marking anything, and refuses a back on the first one', () => {
    const first = at(0);
    const refused = press(first, 'back');

    expect(refused.seen).toBe(false);
    expect(refused.flow).toBe(first);
    expect(press(at(2), 'back').flow).toEqual(at(1));
  });

  it('marks nothing once the sequence is over', () => {
    const over: OnboardingFlow = { step: LAST, state: 'done' };

    for (const control of OVERLAY_CONTROLS) {
      const outcome = press(over, control);

      expect(outcome.seen, control).toBe(false);
      expect(outcome.flow, control).toBe(over);
    }
  });

  it('marks the sequence read on the way out, whichever card it was left from', () => {
    // The flag is a yes or a no, not a number: how far the player read is not what it records.
    const last = press(at(0), 'skip');
    const first = press(at(LAST), 'skip');

    expect(last.seen).toBe(first.seen);
  });
});

describe('the focus the overlay holds', () => {
  it('cycles over its own three controls and wraps at both ends', () => {
    const last = OVERLAY_CONTROLS.length - 1;

    expect(focusAfterTab(0, false)).toBe(1);
    expect(focusAfterTab(last, false)).toBe(0);
    expect(focusAfterTab(0, true)).toBe(last);
    expect(focusAfterTab(last, true)).toBe(last - 1);
  });

  it('never walks out of the overlay, backwards or forwards, from any of its controls', () => {
    // A dialog `aria-modal` promises is modal: Tab is answered here rather than left to the browser,
    // which would carry the focus on to the call to action behind the card.
    for (let from = 0; from < OVERLAY_CONTROLS.length; from += 1) {
      for (const backwards of [false, true]) {
        const to = focusAfterTab(from, backwards);

        expect(to, `${from} ${backwards}`).toBeGreaterThanOrEqual(0);
        expect(to, `${from} ${backwards}`).toBeLessThan(OVERLAY_CONTROLS.length);
      }
    }
  });

  it('names every control it cycles over', () => {
    const controls: readonly OverlayControl[] = OVERLAY_CONTROLS;

    expect(new Set(controls).size).toBe(controls.length);
  });
});
