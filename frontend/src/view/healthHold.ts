// What a unit's health bar shows while an attack against it is still swinging (M4 playtest fix, P2):
// the old value stays on screen until the swing's own impact moment, so a result is never seen before
// the animation that caused it. Pure: the sprite owns the clock and the timer, and only asks this
// what to show and what to remember.
export interface Health {
  readonly health: number;
  readonly maxHealth: number;
}

export interface HealthDisplay {
  /** What is actually drawn right now. */
  readonly shown: Health;
  /** The latest value held back, or null while nothing is held. */
  readonly pending: Health | null;
}

/**
 * What to show once a new value is known: at once, unless a hold is still running (`now < holdUntil`),
 * in which case the old value stays shown and the new one is only remembered.
 */
export function nextHealthDisplay(
  current: HealthDisplay,
  incoming: Health,
  now: number,
  holdUntil: number | null,
): HealthDisplay {
  if (holdUntil !== null && now < holdUntil) {
    return { shown: current.shown, pending: incoming };
  }
  return { shown: incoming, pending: null };
}

/** The hold is over: whatever was remembered is shown now, or nothing changes if nothing was. */
export function revealHealth(display: HealthDisplay): HealthDisplay {
  if (display.pending === null) return display;
  return { shown: display.pending, pending: null };
}
