// Onboarding m1 — every line the sequence shows, read from the catalog of the language the client is in,
// on the same contract as `title/copy.ts`: a line missing from this map is a compile error, and a key the
// reference catalog does not define is another.
//
// The lines are read again on every call and never held as constants: the switcher rewrites the card on
// the screen while the sequence is open, and a constant cannot follow a language that changes after the
// page is up.
import { t } from '../i18n';
import { ONBOARDING_CARDS, type OnboardingCardId } from './content';

/** The two lines of one card: what it is called, and what it says. */
export interface OnboardingCardCopy {
  readonly heading: string;
  readonly body: string;
}

/**
 * Every line of the sequence, by the name the screen knows it by. The cards are keyed by the id the
 * sequence gives them, so a card added to `content.ts` without its text is a compile error here.
 */
export interface OnboardingCopy {
  readonly cards: Readonly<Record<OnboardingCardId, OnboardingCardCopy>>;
  /** The forward button of every card but the last. */
  readonly advance: string;
  /** The button that returns to the card before this one. */
  readonly back: string;
  /** The button that leaves the sequence without reading the rest. */
  readonly skip: string;
  /** The forward button of the last card, which concludes the sequence. */
  readonly finish: string;
  /** The link in the title's footer, which opens the sequence again at any time. */
  readonly howToPlay: string;
}

/** Every line of the sequence, in the language the client is showing right now. */
export function onboardingCopy(): OnboardingCopy {
  const cards = {} as Record<OnboardingCardId, OnboardingCardCopy>;

  // The list is the type, so every id is written here before this function returns.
  for (const card of ONBOARDING_CARDS) {
    cards[card.id] = {
      heading: t(`onboarding.${card.id}.heading`),
      body: t(`onboarding.${card.id}.body`),
    };
  }

  return {
    cards,
    advance: t('onboarding.advance'),
    back: t('onboarding.back'),
    skip: t('onboarding.skip'),
    finish: t('onboarding.finish'),
    howToPlay: t('onboarding.howToPlay'),
  };
}
