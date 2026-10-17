import type { EmailMessage } from './mailer';

/**
 * The two pages in the client where a link from a message lands. They are the client's routes, not the
 * platform's, and they are named here because the link has to be built by whoever sends the message —
 * the platform does not serve them and cannot check that they exist.
 */
export const VERIFY_PATH = '/verify-email';
export const RESET_PATH = '/reset-password';

/**
 * Where a player goes to prove an address, and where they go to choose a new password.
 *
 * The link points at the **client** and carries the token as a query parameter, and that is the whole
 * reason these live here rather than in the API: a link that spends its token on the `GET` is spent by
 * the first machine that reads the mailbox — a scanner, a preview, an antivirus proxy — and the player
 * then finds their own link already used. The client shows a page with a button, and the button is the
 * `POST` that spends it (ADR 0021).
 */
export function verificationLink(clientOrigin: string, token: string): string {
  return link(VERIFY_PATH, clientOrigin, token);
}

export function resetLink(clientOrigin: string, token: string): string {
  return link(RESET_PATH, clientOrigin, token);
}

function link(path: string, clientOrigin: string, token: string): string {
  const url = new URL(path, clientOrigin);
  url.searchParams.set('token', token);
  return url.href;
}

/**
 * The message a new account gets. The link is alone on its line, with no punctuation after it, and that
 * is deliberate: a `)` or a full stop glued to the address is part of the address to anything that reads
 * the message with a regular expression — including this repository's own tests, which pull the token
 * back out of the text they recorded.
 */
export function verificationMessage(to: string, link: string): EmailMessage {
  return {
    to,
    subject: 'Confirm your address — Eldritch Alley: Tactics',
    text: [
      'Welcome to Eldritch Alley: Tactics.',
      '',
      'Confirm this address to finish creating your account:',
      '',
      link,
      '',
      'The link is good for 24 hours. If you did not ask for an account, ignore this message and',
      'nothing happens.',
    ].join('\n'),
  };
}

/** The message a player who forgot their password gets. A reset is worth an hour, not a day. */
export function resetMessage(to: string, link: string): EmailMessage {
  return {
    to,
    subject: 'Choose a new password — Eldritch Alley: Tactics',
    text: [
      'Somebody asked to choose a new password for this address.',
      '',
      'Choose it here:',
      '',
      link,
      '',
      'The link is good for one hour and can be used once. If it was not you, ignore this message:',
      'your password stays as it is.',
    ].join('\n'),
  };
}
