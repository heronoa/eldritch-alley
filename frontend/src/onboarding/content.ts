// Onboarding m1 — the sequence of cards the player reads once: the story that frames the game, and then
// one card per rule worth knowing before the first match.
//
// A card is an id and a category and nothing else, and the list is pure data: no DOM, no language, no
// side effect. The words live in the catalog, keyed by the id (`onboarding.<id>.heading` and
// `onboarding.<id>.body`), which is what lets one sequence be read in either language.

/** The two halves of the sequence: the story the player is being told, and the rules they will play. */
export type OnboardingCategory = 'story' | 'howto';

/** One card of the sequence, as the flow and the screen read it. */
export interface OnboardingCard {
  readonly id: string;
  readonly category: OnboardingCategory;
}

/**
 * The cards, in the order the player reads them: the story of the admission test first, then one topic
 * of how to play per card — the grid and its height, the initiative queue, moving and attacking,
 * ammunition and energy, cover with the hit-chance badge, abilities, and the account that keeps the
 * squad and the battle history.
 *
 * The `as const` is what makes the ids the catalog keys: a card added here whose text is missing from
 * `catalog.pt-BR.ts` is a compile error in `copy.ts`, not a card that opens empty on the screen.
 */
export const ONBOARDING_CARDS = [
  { id: 'story-incident', category: 'story' },
  { id: 'story-admission', category: 'story' },
  { id: 'story-squad', category: 'story' },
  { id: 'grid-and-height', category: 'howto' },
  { id: 'initiative-order', category: 'howto' },
  { id: 'move-and-attack', category: 'howto' },
  { id: 'ammo-and-reload', category: 'howto' },
  { id: 'cover-and-chance', category: 'howto' },
  { id: 'abilities', category: 'howto' },
  { id: 'account', category: 'howto' },
] as const satisfies readonly OnboardingCard[];

/** The id of a card, which is also the middle of the keys its two lines live under. */
export type OnboardingCardId = (typeof ONBOARDING_CARDS)[number]['id'];
