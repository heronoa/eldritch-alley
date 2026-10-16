import { describe, expect, it } from 'vitest';
import { nextHealthDisplay, revealHealth, type HealthDisplay } from './healthHold';

const FULL = { health: 12, maxHealth: 12 };
const HURT = { health: 8, maxHealth: 12 };

const SHOWING_FULL: HealthDisplay = { shown: FULL, pending: null };

describe('nextHealthDisplay', () => {
  it('shows the incoming value at once while nothing is held', () => {
    expect(nextHealthDisplay(SHOWING_FULL, HURT, 1000, null)).toEqual({ shown: HURT, pending: null });
  });

  it('shows the incoming value at once once the hold has already passed', () => {
    expect(nextHealthDisplay(SHOWING_FULL, HURT, 1000, 999)).toEqual({ shown: HURT, pending: null });
  });

  it('keeps showing the old value while the hold is still running, and remembers the new one', () => {
    expect(nextHealthDisplay(SHOWING_FULL, HURT, 1000, 1001)).toEqual({ shown: FULL, pending: HURT });
  });

  it('remembers only the latest incoming value if it changes again before the hold is up', () => {
    const held = nextHealthDisplay(SHOWING_FULL, HURT, 1000, 1500);
    const healed = { health: 10, maxHealth: 12 };

    expect(nextHealthDisplay(held, healed, 1200, 1500)).toEqual({ shown: FULL, pending: healed });
  });
});

describe('revealHealth', () => {
  it('promotes the pending value to shown', () => {
    const held: HealthDisplay = { shown: FULL, pending: HURT };

    expect(revealHealth(held)).toEqual({ shown: HURT, pending: null });
  });

  it('leaves the shown value alone when nothing was pending', () => {
    expect(revealHealth(SHOWING_FULL)).toEqual(SHOWING_FULL);
  });
});
