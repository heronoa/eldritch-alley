// Onboarding m1 — the sequence of cards: what the player is shown, and in which order.
//
// A card is an id and a category and nothing else. The words live in the catalogs, keyed by the id
// (`onboarding.<id>.heading`, `onboarding.<id>.body`), and this file is where the two are held
// together: a card with no text in a language is a card that would open empty on the screen.
import { describe, expect, it } from 'vitest';
import { missingKeys, ptBR, type MessageKey } from '../i18n';
import { ONBOARDING_CARDS, type OnboardingCardId } from './content';

/** The key one line of a card lives under in the catalog, spelled the way `copy.ts` reads it. */
function keyOf(id: OnboardingCardId, line: 'heading' | 'body'): MessageKey {
  return `onboarding.${id}.${line}`;
}

/** The ids of one half of the sequence, in the order the sequence shows them. */
function idsOf(category: 'story' | 'howto'): OnboardingCardId[] {
  return ONBOARDING_CARDS.filter((card) => card.category === category).map((card) => card.id);
}

describe('the sequence of cards', () => {
  it('introduces the game before it explains it: no how-to card is read before a story one', () => {
    const firstHowTo = ONBOARDING_CARDS.findIndex((card) => card.category === 'howto');
    const lastStory = ONBOARDING_CARDS.map((card) => card.category).lastIndexOf('story');

    expect(firstHowTo).toBeGreaterThan(-1);
    expect(lastStory).toBeLessThan(firstHowTo);
  });

  it('names each card once, so no card is read twice', () => {
    const ids = ONBOARDING_CARDS.map((card) => card.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.trim(), id).not.toBe('');
  });

  it('holds both halves: the story the player is being told, and one card per topic of how to play', () => {
    // Two or three cards of story is the contract; the six topics of how to play are the grid and its
    // height, the initiative order, moving and attacking, ammunition/mana and reloading, cover with
    // direction and height and the hit-chance badge, and abilities.
    expect(idsOf('story').length).toBeGreaterThanOrEqual(2);
    expect(idsOf('howto').length).toBeGreaterThanOrEqual(6);
  });

  it('has a heading and a body for every card, in the reference catalog and translated in English', () => {
    // The English is checked by presence and not by reading it: a key en-US has not translated answers
    // with the Portuguese, so a card read through `t()` alone would look translated when it is not.
    const untranslated = missingKeys('en-US').filter((key) => key.startsWith('onboarding.'));
    expect(untranslated).toEqual([]);

    for (const card of ONBOARDING_CARDS) {
      for (const line of ['heading', 'body'] as const) {
        expect(ptBR[keyOf(card.id, line)].trim(), `${card.id} ${line}`).not.toBe('');
      }
    }
  });
});
