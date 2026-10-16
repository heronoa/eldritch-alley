import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import type { Team, UnitId, UnitState } from '../protocol';
import { bannerFor } from './banner';
import type { TurnSlot } from './turn-order';

// The machine's own language decides what `t` answers with, and the banner is about which team took
// the turn rather than about the machine, so the tests pin the reference locale.
setLocale('pt-BR');

/** A slot as `activeSlot` builds it: the banner reads the unit's id and its team, and nothing else. */
function slotOf(id: UnitId, team: Team): TurnSlot {
  return { unit: { id, team } as UnitState, isCurrent: true };
}

const HUMAN = slotOf('A-sniper', 'A');
const ENEMY = slotOf('B-sniper', 'B');

describe('bannerFor', () => {
  it('raises the human banner when the human team takes the turn', () => {
    expect(bannerFor(ENEMY, HUMAN, 'A')).toEqual({ text: 'Sua vez', durationMs: 1500 });
  });

  it('raises the enemy banner when the other team takes the turn', () => {
    expect(bannerFor(HUMAN, ENEMY, 'A')).toEqual({ text: 'Vez do inimigo', durationMs: 1500 });
  });

  it('raises a banner at the start of the match, when nobody was on turn before', () => {
    expect(bannerFor(null, HUMAN, 'A')).toEqual({ text: 'Sua vez', durationMs: 1500 });
  });

  it('reads the team of the unit on turn against the team the player holds', () => {
    expect(bannerFor(HUMAN, ENEMY, 'B')).toEqual({ text: 'Sua vez', durationMs: 1500 });
    expect(bannerFor(ENEMY, HUMAN, 'B')).toEqual({ text: 'Vez do inimigo', durationMs: 1500 });
  });

  it('raises nothing when the unit on turn stays the same, as after a move', () => {
    expect(bannerFor(HUMAN, HUMAN, 'A')).toBeNull();
  });

  it('raises nothing when the match is over and no unit is on turn', () => {
    expect(bannerFor(HUMAN, null, 'A')).toBeNull();
    expect(bannerFor(null, null, 'A')).toBeNull();
  });
});
