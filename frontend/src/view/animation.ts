// The timelines of the unit actions, in milliseconds from the start of the action, and the frame
// each one shows at a given moment. The values come from section 3 of the characters README; the
// scene only plays them, so every boundary is decided here, where a test can reach it.

/** One basic attack: windup, strike, travel, impact and recovery. Frames are 1 and 2 of the row. */
export const ATTACK_TIMELINE = {
  windupStart: 250, // frame 1 from here
  strikeStart: 520, // frame 2 from here
  strikeEnd: 760, // the strike ends; the pip is spent at this moment
  travelStart: 600, // ranged only
  impactLength: 260,
  recover: 2000, // back to idle
} as const;

/** A reload or a meditation: two frames, with the pips refilling one by one through the second. */
export const RELOAD_TIMELINE = {
  start: 300, // frame 1; ground effect fades in over 200
  secondHalf: 760, // frame 2 from here
  pipInterval: 140, // pips refill one by one, one every 140 from 760
  end: 1180, // ground effect fades out over 160; Sniper bolt click here
  fadeIn: 200,
  fadeOut: 160,
} as const;

/** Idle breathing: frame 2 every 500 ms, one pixel lower. */
export const IDLE_STEP_MS = 500;

/** Walk frames alternate every 150 ms. */
export const WALK_STEP_MS = 150;

/** How long a unit takes to cross one cell. A decision of this client, not of the prototype. */
export const MOVE_MS_PER_CELL = 120;

/** Which of the two attack frames the action shows, or 0 for the idle pose. */
export function attackFrame(elapsedMs: number): 1 | 2 | 0 {
  if (elapsedMs < ATTACK_TIMELINE.windupStart) return 0;
  if (elapsedMs < ATTACK_TIMELINE.strikeStart) return 1;
  if (elapsedMs < ATTACK_TIMELINE.strikeEnd) return 2;
  return 0;
}

/** Which of the two reload frames the action shows, or 0 for the idle pose. */
export function reloadFrame(elapsedMs: number): 1 | 2 | 0 {
  if (elapsedMs < RELOAD_TIMELINE.start) return 0;
  if (elapsedMs < RELOAD_TIMELINE.secondHalf) return 1;
  if (elapsedMs < RELOAD_TIMELINE.end) return 2;
  return 0;
}

/**
 * How many pips the magazine shows at a given moment. The refill starts at the second half of the
 * action and takes one pip every `pipInterval`; the count never leaves `from..to`.
 */
export function filledPipsAt(elapsedMs: number, from: number, to: number): number {
  const refilled =
    elapsedMs <= RELOAD_TIMELINE.secondHalf
      ? 0
      : Math.ceil((elapsedMs - RELOAD_TIMELINE.secondHalf) / RELOAD_TIMELINE.pipInterval);

  return Math.min(to, Math.max(from, from + refilled));
}

/** The idle frame at a given moment: the second one drops the upper body by a pixel. */
export function idleFrame(elapsedMs: number): 1 | 2 {
  return Math.floor(elapsedMs / IDLE_STEP_MS) % 2 === 0 ? 1 : 2;
}

/** The walk frame at a given moment: the legs alternate. */
export function walkFrame(elapsedMs: number): 1 | 2 {
  return Math.floor(elapsedMs / WALK_STEP_MS) % 2 === 0 ? 1 : 2;
}

/** How long a move across `cells` takes. The distance is the Chebyshev one, a whole number. */
export function movementDuration(cells: number): number {
  if (!Number.isInteger(cells) || cells < 0) {
    throw new RangeError(`a move covers a whole number of cells, got ${cells}`);
  }

  return cells * MOVE_MS_PER_CELL;
}
