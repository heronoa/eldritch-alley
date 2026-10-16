// Onboarding m1 — the sequence as a state machine, on the contract `title/connect-flow.ts` already
// follows: an event the state does not answer returns the flow it was given, the same object, so the
// caller tells "nothing happened" from "something did" by identity.
import { describe, expect, it } from 'vitest';
import { ONBOARDING_CARDS } from './content';
import { next, type FlowEvent, type OnboardingFlow } from './flow';

/** The last card of the sequence, which is the one whose forward button concludes it. */
const LAST = ONBOARDING_CARDS.length - 1;

/** Every event the flow can be handed. */
const EVENTS: readonly FlowEvent[] = ['advance', 'back', 'skip', 'finish'];

/** The flow as the screen opens it: the first card, being read. */
const START: OnboardingFlow = { step: 0, state: 'active' };

/** The flow resting on the card at `step`. */
function at(step: number): OnboardingFlow {
  return { step, state: 'active' };
}

/** The flow once it is over: the cards are behind the player, whichever card they left from. */
function done(step: number): OnboardingFlow {
  return { step, state: 'done' };
}

describe('next', () => {
  it('walks forward one card at a time', () => {
    expect(next(START, 'advance')).toEqual(at(1));
    expect(next(at(2), 'advance')).toEqual(at(3));
  });

  it('concludes on the last card, instead of stepping past the end of the list', () => {
    // The forward button of the last card finishes the sequence: an index one past the end would be a
    // card the screen has nothing to draw.
    expect(next(at(LAST), 'advance')).toEqual(done(LAST));
  });

  it('walks back one card at a time, and refuses to step before the first', () => {
    expect(next(at(2), 'back')).toEqual(at(1));
    expect(next(START, 'back')).toBe(START);
  });

  it('is concluded by a skip from any card at all', () => {
    for (const step of [0, 1, LAST]) {
      expect(next(at(step), 'skip'), String(step)).toEqual(done(step));
    }
  });

  it('is concluded by the last card’s own button, which is the same end as the skip', () => {
    // The last card carries `finish` where every other card carries `advance`; both leave the player at
    // the same place, and the flag the screen marks is the same one either way.
    expect(next(at(LAST), 'finish')).toEqual(done(LAST));
  });

  it('answers nothing once it is over', () => {
    const over = done(LAST);

    for (const event of EVENTS) expect(next(over, event), event).toBe(over);
  });

  it('never leaves the cards: no event from any card reaches an index outside the list', () => {
    for (let step = 0; step <= LAST; step += 1) {
      for (const event of EVENTS) {
        const after = next(at(step), event);

        expect(after.step, `${step} ${event}`).toBeGreaterThanOrEqual(0);
        expect(after.step, `${step} ${event}`).toBeLessThanOrEqual(LAST);
      }
    }
  });

  it('leaves the flow it is handed alone', () => {
    const flow = at(1);
    const snapshot = { ...flow };

    next(flow, 'advance');
    next(flow, 'skip');

    expect(flow).toEqual(snapshot);
  });
});
