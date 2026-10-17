import type { OAuthProviderName } from '../auth/provider';
import type { EmailMessage } from './mailer';
import type { EmailLocale } from './locale';

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
 * The words of every message, once per language. The shape is the same in both, so a message that is
 * added has to be written twice before the compiler is satisfied — a half-translated message is not a
 * state this file can be in.
 */
interface MailCopy {
  verification: {
    subject: string;
    greeting: string;
    instruction: string;
    validity: string;
  };
  reset: {
    subject: string;
    notice: string;
    instruction: string;
    validity: string;
  };
  deleted: {
    subject: string;
    notice: string;
    erased: string;
    unexpected: string;
  };
  linked: {
    subject: string;
    notice: (provider: string) => string;
    same: string;
    unexpected: string;
  };
}

const COPY: Readonly<Record<EmailLocale, MailCopy>> = {
  'en-US': {
    verification: {
      subject: 'Confirm your address — Eldritch Alley: Tactics',
      greeting: 'Welcome to Eldritch Alley: Tactics.',
      instruction: 'Confirm this address to finish creating your account:',
      validity:
        'The link is good for 24 hours. If you did not ask for an account, ignore this message and\n' +
        'nothing happens.',
    },
    reset: {
      subject: 'Choose a new password — Eldritch Alley: Tactics',
      notice: 'Somebody asked to choose a new password for this address.',
      instruction: 'Choose it here:',
      validity:
        'The link is good for one hour and can be used once. If it was not you, ignore this message:\n' +
        'your password stays as it is.',
    },
    deleted: {
      subject: 'Your account was deleted — Eldritch Alley: Tactics',
      notice: 'The account for this address has been deleted, as asked.',
      erased:
        'Your squad, your battle history and every way in to the account are gone. This cannot be undone.',
      unexpected: 'If this was not you, reply to this message so we can look at it.',
    },
    linked: {
      subject: 'A new way in — Eldritch Alley: Tactics',
      notice: (provider) => `Your account can now also be entered with ${provider}.`,
      same: 'It is the same account: nothing was copied and your squad is where it was.',
      unexpected: 'If this was not you, reply to this message so we can look at it.',
    },
  },
  'pt-BR': {
    verification: {
      subject: 'Confirme seu endereço — Eldritch Alley: Tactics',
      greeting: 'Bem-vindo a Eldritch Alley: Tactics.',
      instruction: 'Confirme este endereço para concluir a criação da sua conta:',
      validity:
        'O link vale por 24 horas. Se você não pediu uma conta, ignore esta mensagem e nada acontece.',
    },
    reset: {
      subject: 'Escolha uma nova senha — Eldritch Alley: Tactics',
      notice: 'Alguém pediu para escolher uma nova senha para este endereço.',
      instruction: 'Escolha aqui:',
      validity:
        'O link vale por uma hora e só pode ser usado uma vez. Se não foi você, ignore esta mensagem:\n' +
        'sua senha continua a mesma.',
    },
    deleted: {
      subject: 'Sua conta foi excluída — Eldritch Alley: Tactics',
      notice: 'A conta deste endereço foi excluída, como pedido.',
      erased:
        'Seu esquadrão, seu histórico de batalhas e todas as formas de entrar na conta foram apagados.\n' +
        'Isso não pode ser desfeito.',
      unexpected: 'Se não foi você, responda a esta mensagem para que possamos investigar.',
    },
    linked: {
      subject: 'Uma nova forma de entrar — Eldritch Alley: Tactics',
      notice: (provider) => `Sua conta agora também pode ser acessada com ${provider}.`,
      same: 'É a mesma conta: nada foi copiado e seu esquadrão está onde estava.',
      unexpected: 'Se não foi você, responda a esta mensagem para que possamos investigar.',
    },
  },
};

/**
 * The message a new account gets. The link is alone on its line, with no punctuation after it, and that
 * is deliberate: a `)` or a full stop glued to the address is part of the address to anything that reads
 * the message with a regular expression — including this repository's own tests, which pull the token
 * back out of the text they recorded.
 */
export function verificationMessage(to: string, link: string, locale: EmailLocale): EmailMessage {
  const copy = COPY[locale].verification;
  return {
    to,
    subject: copy.subject,
    text: [copy.greeting, copy.instruction, link, copy.validity].join('\n\n'),
  };
}

/** The message a player who forgot their password gets. A reset is worth an hour, not a day. */
export function resetMessage(to: string, link: string, locale: EmailLocale): EmailMessage {
  const copy = COPY[locale].reset;
  return {
    to,
    subject: copy.subject,
    text: [copy.notice, copy.instruction, link, copy.validity].join('\n\n'),
  };
}

/**
 * The record of an erased account. It carries no link and no token, because there is nothing left to
 * act on and no account to sign in to: it exists so that the person who owns the address has a trace of
 * the deletion — and so that a deletion they did not ask for is noticed.
 */
export function accountDeletedMessage(to: string, locale: EmailLocale): EmailMessage {
  const copy = COPY[locale].deleted;
  return {
    to,
    subject: copy.subject,
    text: [copy.notice, copy.erased, copy.unexpected].join('\n\n'),
  };
}

/**
 * The notice an account gets when a sign-in adds a second way in. It carries no link and no token: its
 * whole job is to be read by the person who owns the address, so that a way in they did not add is
 * noticed. The provider is named in words a player recognises — "single sign-on", never "keycloak".
 */
export function linkedAccountMessage(
  to: string,
  provider: OAuthProviderName,
  locale: EmailLocale,
): EmailMessage {
  const copy = COPY[locale].linked;
  return {
    to,
    subject: copy.subject,
    text: [copy.notice(PROVIDER_LABELS[locale][provider]), copy.same, copy.unexpected].join('\n\n'),
  };
}

/**
 * What each provider is called in a message. `keycloak` is the realm the deployment runs, which is an
 * implementation name, not something a player has ever seen.
 */
const PROVIDER_LABELS: Readonly<Record<EmailLocale, Readonly<Record<OAuthProviderName, string>>>> = {
  'en-US': {
    github: 'GitHub',
    google: 'Google',
    keycloak: 'single sign-on',
  },
  'pt-BR': {
    github: 'GitHub',
    google: 'Google',
    keycloak: 'login único',
  },
};
