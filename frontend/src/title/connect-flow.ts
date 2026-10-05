// Title screen M1 — the call to action as a state machine: the press, the server's answer, the
// failure, and the wait that lets the stamp finish landing before the screen changes.
import type { JoinFailure } from '../net/join-failure';
import { STAMP_SLAM_MS } from './stamp';

/** Where the call to action is. */
export type FlowState = 'idle' | 'connecting' | 'ready' | 'failed';

/** What can happen to it: the player presses, or the server answers. */
export type FlowEvent = 'press' | 'connected' | 'failed';

/**
 * The state, when the stamp went up — `null` when there is no stamp to wait for — and why it failed.
 *
 * `failure` is `null` in every state but `failed`. In `failed` it is the reason the screen shows,
 * which is `null` too when nothing diagnosed the failure: the title sets that one by hand when the
 * match's own code cannot be downloaded, and the screen falls back to the generic line.
 */
export interface Flow {
  readonly state: FlowState;
  readonly stampStartedAt: number | null;
  readonly failure: JoinFailure | null;
}

/**
 * The flow one event later. An event the state does not answer returns the flow it was given, the
 * same object, so the caller can tell "nothing happened" from "something did" by identity.
 *
 * `failure` is read only by the `failed` event, and defaults to the generic one: a failure nobody
 * diagnosed is the failure the screen already knows how to show.
 */
export function next(
  flow: Flow,
  event: FlowEvent,
  now: number,
  failure: JoinFailure = 'unavailable',
): Flow {
  switch (flow.state) {
    case 'idle':
      return event === 'press' ? { state: 'connecting', stampStartedAt: now, failure: null } : flow;

    case 'connecting':
      if (event === 'connected') {
        return { state: 'ready', stampStartedAt: flow.stampStartedAt, failure: null };
      }
      if (event === 'failed') return { state: 'failed', stampStartedAt: null, failure };
      // A second press while the first one is still in the air changes nothing.
      return flow;

    case 'failed':
      return event === 'press' ? { state: 'connecting', stampStartedAt: now, failure: null } : flow;

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
