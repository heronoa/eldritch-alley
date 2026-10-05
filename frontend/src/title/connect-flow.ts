// Title screen M1 — the call to action as a state machine: the press, the server's answer, the
// failure, and the wait that lets the stamp finish landing before the screen changes.
import { STAMP_SLAM_MS } from './stamp';

/** Where the call to action is. */
export type FlowState = 'idle' | 'connecting' | 'ready' | 'failed';

/** What can happen to it: the player presses, or the server answers. */
export type FlowEvent = 'press' | 'connected' | 'failed';

/** The state, and when the stamp went up — `null` when there is no stamp to wait for. */
export interface Flow {
  readonly state: FlowState;
  readonly stampStartedAt: number | null;
}

/**
 * The flow one event later. An event the state does not answer returns the flow it was given, the
 * same object, so the caller can tell "nothing happened" from "something did" by identity.
 */
export function next(flow: Flow, event: FlowEvent, now: number): Flow {
  switch (flow.state) {
    case 'idle':
      return event === 'press' ? { state: 'connecting', stampStartedAt: now } : flow;

    case 'connecting':
      if (event === 'connected') return { state: 'ready', stampStartedAt: flow.stampStartedAt };
      if (event === 'failed') return { state: 'failed', stampStartedAt: null };
      // A second press while the first one is still in the air changes nothing.
      return flow;

    case 'failed':
      return event === 'press' ? { state: 'connecting', stampStartedAt: now } : flow;

    case 'ready':
      return flow;
  }
}

/**
 * Whether the title may give way to the match yet. Only a session the server has confirmed can, and
 * only once the stamp has had its 180 ms: the screen never changes while the stamp is still falling.
 */
export function canTransition(flow: Flow, now: number): boolean {
  if (flow.state !== 'ready' || flow.stampStartedAt === null) return false;
  return now - flow.stampStartedAt >= STAMP_SLAM_MS;
}
