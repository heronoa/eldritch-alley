// The join of the call to action, as one rule: a guest joins as today, a signed-in player joins with a
// ticket, and a ticket the room refuses costs exactly one retry without it.
//
// It lives outside `title.ts` so the three decisions (D1, D2, D3 of the milestone) are testable without
// a document, and outside `Session` so the socket keeps knowing nothing about accounts.
import { isTicketRefusal } from './join-failure';
import type { JoinOptions } from './session';

/** What the join needs of a session. `Session` satisfies it; the tests use a stand-in. */
export interface Openable {
  open(options?: JoinOptions): Promise<void>;
  close(): void;
}

export interface JoinPorts<T extends Openable> {
  /** Nobody signed in: the platform is not asked anything, which is D1 expressed as code. */
  readonly signedIn: boolean;
  readonly create: () => T;
  /** A ticket, or `null` when there is none to have. Throwing is the same as `null`. */
  readonly ticket: () => Promise<string | null>;
}

/**
 * Joins, and answers the session that holds the seat. Every failure closes the session it was trying:
 * the caller only ever receives a session that has a room, or an error.
 */
export async function joinWithTicket<T extends Openable>(ports: JoinPorts<T>): Promise<T> {
  const ticket = ports.signedIn ? await ticketOrNull(ports.ticket) : null;

  const first = ports.create();
  try {
    // A guest and a ticket that could not be fetched send the same options: none.
    await first.open(ticket === null ? {} : { ticket });
    return first;
  } catch (error) {
    first.close();
    // The retry is for one situation only: a ticket was offered, and the room refused it (D3). A
    // refused seat (`room full`), a dropped network, or a guest's own failure is the caller's to name.
    if (ticket === null || !isTicketRefusal(error)) throw error;
  }

  const second = ports.create();
  try {
    await second.open({});
    return second;
  } catch (error) {
    second.close();
    throw error;
  }
}

/** A ticket the platform did not answer for is no ticket: playing is the default, signing in is not. */
async function ticketOrNull(ticket: () => Promise<string | null>): Promise<string | null> {
  try {
    return await ticket();
  } catch {
    return null;
  }
}
