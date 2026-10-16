// Title screen — the notice that says why the player is not in a match: the reasons it can be opened
// with, and the lines the card shows for each. Pure: it reads no locale, touches no DOM and decides
// nothing about whether the card is up, which is the flow's answer (`connect-flow.ts`).
//
// The vocabulary is the network layer's two reasons, next door to the classifier that produces them,
// plus the one failure the title diagnoses by itself: a match whose code never arrived. That one is
// not a join failure — the seat was granted — so it is not the network layer's to name.
import type { JoinFailure } from '../net/join-failure';
import type { TitleCopy } from './copy';

/** Why the player is not in a match. */
export type FailureReason = JoinFailure | 'load-failed';

/** The card, as lines: what it calls the failure, what it says about it, and how it is closed. */
export interface NoticeCopy {
  readonly heading: string;
  readonly body: string;
  readonly close: string;
}

/**
 * The sentence each reason explains itself with. Keyed by the reason, so a reason added to the union
 * above without a sentence is a compile error and never a card that opens empty.
 */
const BODIES: Record<FailureReason, (copy: TitleCopy) => string> = {
  occupied: (copy) => copy.occupied,
  unavailable: (copy) => copy.unavailable,
  'load-failed': (copy) => copy.loadFailed,
};

/**
 * The card for one reason, in the language of the copy it was handed. The two refused seats are one
 * kind of failure and share their heading; a match that did not load was authorized, and says so.
 */
export function noticeFor(copy: TitleCopy, reason: FailureReason): NoticeCopy {
  return {
    heading: reason === 'load-failed' ? copy.noticeLoadFailed : copy.noticeRefused,
    body: BODIES[reason](copy),
    close: copy.noticeClose,
  };
}
