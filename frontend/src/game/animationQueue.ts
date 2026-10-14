// A FIFO of steps the scene plays one at a time, so a burst of several accepted actions landing
// close together — the bot's whole turn, chiefly — never lets one sprite's animation overwrite the
// one before it has had the time it needs to play (M4 playtest fix, P2). Pure: the scene owns the
// clock and the cues, and only tells the queue when the current step is done.
export interface AnimationQueue<T> {
  readonly current: T | null;
  readonly pending: readonly T[];
}

export function emptyQueue<T>(): AnimationQueue<T> {
  return { current: null, pending: [] };
}

/** Whether nothing is playing and nothing is waiting behind it. */
export function isIdle<T>(queue: AnimationQueue<T>): boolean {
  return queue.current === null;
}

/**
 * Adds a step to the back of the queue. It becomes `current` at once if the queue was idle — the
 * caller is the one that notices that and plays it; this only keeps the order.
 */
export function enqueue<T>(queue: AnimationQueue<T>, step: T): AnimationQueue<T> {
  if (queue.current === null) return { current: step, pending: [] };
  return { current: queue.current, pending: [...queue.pending, step] };
}

/** Drops the step that just finished and promotes the next one waiting, or leaves the queue idle. */
export function advance<T>(queue: AnimationQueue<T>): AnimationQueue<T> {
  const [next, ...rest] = queue.pending;
  return { current: next ?? null, pending: rest };
}
