// The account, as the title holds it: one load on boot, one value the screens read, and the two
// transitions — signing in and signing out. Nothing here polls, and nothing here touches the DOM.
import type { Api } from '../api/client';
import { failureOf, type ApiErrorKind } from '../api/errors';
import type { AccountState } from './types';

/** What a boot-time load answered: the state, and whether the platform was reachable at all. */
export interface AccountLoad {
  readonly state: AccountState;
  readonly failure: ApiErrorKind | null;
}

/** What a sign-out answered. A failed request keeps the state: the cookie on the server is still alive. */
export interface SignOutOutcome {
  readonly state: AccountState;
  readonly failure: ApiErrorKind | null;
}

/**
 * Who is signed in, once, at load. A 401 is the guest state and not a failure — the title does not need
 * to know it — while a platform that did not answer is the guest state *with* a failure, because the
 * screen says that out loud rather than pretending nobody is signed in.
 */
export async function loadAccount(api: Api): Promise<AccountLoad> {
  try {
    const account = await api.me();
    return account === null
      ? { state: { status: 'guest' }, failure: null }
      : { state: { status: 'signed-in', account }, failure: null };
  } catch (error) {
    return { state: { status: 'guest' }, failure: failureOf(error) };
  }
}

/**
 * Signs in with an address and a password. A refusal is thrown for the dialog to name; after a login
 * that answered, the squad is read from `/me`, because the login route answers the profile alone.
 *
 * A `/me` that fails right after a login that answered keeps the player signed in with the profile the
 * login returned and no agents: the cookie is set, so calling them a guest would be a lie, and the next
 * reload brings the squad.
 */
export async function signIn(
  api: Api,
  credentials: { email: string; password: string },
): Promise<AccountState> {
  const { user } = await api.login(credentials);
  const load = await loadAccount(api);
  return load.state.status === 'signed-in' ? load.state : { status: 'signed-in', account: { user, agents: [] } };
}

/**
 * Signs out. The local state follows the server only when the server answered: a logout that failed
 * leaves the cookie alive, so the panel stays and the screen says the request did not go through.
 */
export async function signOut(api: Api, current: AccountState): Promise<SignOutOutcome> {
  try {
    await api.logout();
    return { state: { status: 'guest' }, failure: null };
  } catch (error) {
    return { state: current, failure: failureOf(error) };
  }
}

// The one value the title and the panels share. It lives here rather than in a screen so that a
// sign-out in the panel and the ticket fetched at press time cannot disagree about who is playing.

let state: AccountState = { status: 'guest' };
const handlers: ((state: AccountState) => void)[] = [];

export function currentAccount(): AccountState {
  return state;
}

/** Replaces the state and tells whoever is listening. The same object changes nothing. */
export function setAccount(next: AccountState): void {
  if (next === state) return;
  state = next;
  for (const handler of handlers) handler(state);
}

/**
 * Registers a handler for a change of account, and calls it once with the state it is in now — a panel
 * that mounts after the boot's `/me` has answered must not wait for the next change to draw itself.
 */
export function onAccountChange(handler: (state: AccountState) => void): () => void {
  handlers.push(handler);
  handler(state);
  return () => {
    const at = handlers.indexOf(handler);
    if (at !== -1) handlers.splice(at, 1);
  };
}
