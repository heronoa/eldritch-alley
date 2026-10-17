// The account as a screen reads it: either nobody is signed in, or there is an answer from `/me`.
//
// This is not `net/session.ts`, which is the match socket. The two are named apart on purpose: one is a
// player's identity across visits, the other is a seat in one battle.
import type { Account } from '../api/client';

export type AccountState =
  | { readonly status: 'guest' }
  | { readonly status: 'signed-in'; readonly account: Account };
