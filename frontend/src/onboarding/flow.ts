// Onboarding m1 — the sequence of cards as a state machine, on the contract `title/connect-flow.ts`
// already follows: an event the state does not answer returns the flow it was given, the same object, so
// the caller tells "nothing happened" from "something did" by identity.
//
// No DOM and no storage here: this decides where the sequence is, and nothing else. Whether it is on the
// screen at all is the screen's own question, asked of `seen.ts`.
import { ONBOARDING_CARDS } from './content';

/** Where the sequence is: being read, or behind the player. */
export type OnboardingState = 'active' | 'done';

/** What the player can do to it: move on, go back, skip it, or finish the last card. */
export type FlowEvent = 'advance' | 'back' | 'skip' | 'finish';

/** The card being read, and whether the sequence is still up. */
export interface OnboardingFlow {
  readonly step: number;
  readonly state: OnboardingState;
}

/** The last card: the one whose forward button concludes the sequence. */
const LAST_STEP = ONBOARDING_CARDS.length - 1;

/**
 * The flow one event later. An event the state does not answer returns the flow it was given, the same
 * object.
 *
 * `step` names a card in every state, `done` included: the card the player left from is the one the
 * screen reads when it draws the sequence again from the footer link, and an index past the end of the
 * list would be a card with nothing to draw.
 */
export function next(flow: OnboardingFlow, event: FlowEvent): OnboardingFlow {
  if (flow.state === 'done') return flow;

  switch (event) {
    case 'advance':
      // The forward button of the last card concludes the sequence instead of stepping past its end.
      return flow.step < LAST_STEP ? { step: flow.step + 1, state: 'active' } : concluded(flow.step);

    case 'back':
      // There is nothing before the first card, and the screen keeps the button disabled there.
      return flow.step > 0 ? { step: flow.step - 1, state: 'active' } : flow;

    // Skipping and finishing end the sequence the same way: one is the player declining to read the
    // rest, the other is the last card's own button, and the screen marks the same flag either way.
    case 'skip':
    case 'finish':
      return concluded(flow.step);
  }
}

/** The sequence over, resting on the card it was left from. */
function concluded(step: number): OnboardingFlow {
  return { step, state: 'done' };
}
