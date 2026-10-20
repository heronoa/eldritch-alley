// Whether a card of the account is over the title. The title's Enter starts a match from anywhere on
// the page, so it has to know when the page is answering as a dialog instead; the cards are drawn by
// `account.ts`, and this is the one thing it tells the title.
//
// A count rather than a flag: the sign-in dialog can hand the screen to the profile, and the card that
// closes must not take the other one's word with it. The cards open and close in pairs, and the count
// never goes below zero.

let open = 0;

export function cardOpened(): void {
  open += 1;
}

export function cardClosed(): void {
  if (open > 0) open -= 1;
}

/** Whether any card of the account is on screen, so the title's keys belong to it. */
export function cardIsOpen(): boolean {
  return open > 0;
}
