// Title screen M1 — the call to action as a state machine: the press, the server's answer, the
// failure, the dismissal, the retry, and the wait that lets the stamp finish landing before the
// screen changes.
import type { FailureReason } from './notice';
import { STAMP_SLAM_MS } from './stamp';

/** Where the call to action is. */
export type FlowState = 'idle' | 'connecting' | 'ready' | 'failed';

/** What can happen to it: the player presses, answers the server, or dismisses a failure. */
export type FlowEvent = 'press' | 'connected' | 'failed' | 'dismiss';

/**
 * The state, when the stamp went up — `null` when there is no stamp to wait for — and why it failed.
 *
 * `failure` is `null` in every state but `failed`, and a `failed` flow always carries a reason: the
 * two the network layer diagnoses, or the download the title names by itself. There is no "failed
 * without a diagnosis", so the screen never has to guess what to say.
 */
export type Flow =
  | {
      readonly state: 'idle' | 'connecting' | 'ready';
      readonly stampStartedAt: number | null;
      readonly failure: null;
    }
  | {
      readonly state: 'failed';
      readonly stampStartedAt: null;
      readonly failure: FailureReason;
    };

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
  failure: FailureReason = 'unavailable',
): Flow {
  switch (flow.state) {
    case 'idle':
      return event === 'press' ? { state: 'connecting', stampStartedAt: now, failure: null } : flow;

    case 'connecting':
      if (event === 'connected') {
        return { state: 'ready', stampStartedAt: flow.stampStartedAt, failure: null };
      }
      if (event === 'failed') return { state: 'failed', stampStartedAt: null, failure };
      // A second press while the first one is still in the air changes nothing, and neither does a
      // dismissal: there is no card up to close.
      return flow;

    case 'failed':
      // A press retries and a dismissal clears: those are the two answers a failed flow has.
      if (event === 'press') return { state: 'connecting', stampStartedAt: now, failure: null };
      if (event === 'dismiss') return { state: 'idle', stampStartedAt: null, failure: null };
      return flow;

    case 'ready':
      return flow;
  }
}

/** The reason the notice shows, or `null` when there is nothing to show. */
export function failureReason(flow: Flow): FailureReason | null {
  return flow.state === 'failed' ? flow.failure : null;
}

/**
 * Whether the title may give way to the match yet. Only a session the server has confirmed can, and
 * only once the stamp has had its 180 ms: the screen never changes while the stamp is still falling.
 */
export function canTransition(flow: Flow, now: number): boolean {
  if (flow.state !== 'ready' || flow.stampStartedAt === null) return false;
  return now - flow.stampStartedAt >= STAMP_SLAM_MS;
}
