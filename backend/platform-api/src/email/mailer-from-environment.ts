import { readOptional, readRequiredPort } from '../config';
import { LogMailer, SmtpMailer } from './adapters';
import type { Mailer } from './mailer';

/**
 * Every variable that configures a mail server. All five, or none: the same rule the OAuth providers got
 * in § 8 of the milestone's plan, for the same reason — an account on somebody else's server must never
 * be the reason the project will not boot.
 */
export const EMAIL_VARIABLES = [
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USER',
  'EMAIL_SMTP_PASSWORD',
  'EMAIL_FROM',
] as const;

/**
 * The mailer this deployment sends with.
 *
 * With none of the five values the platform writes the message to the log and opens nothing, which is
 * the state `npm run dev` and `npm test` run in: no contributor needs a mail account to work on this, and
 * no case in the suite holds an SMTP password. With all five it reaches the mail server.
 *
 * Half a set stops the boot, naming every variable that is missing. Half a set is a typo and not a
 * choice, and a mailer that silently swallows a password reset is worse than a container that refuses to
 * start: one is a support request nobody can explain, the other is a line in the deploy log.
 */
export function mailerFromEnvironment(): Mailer {
  const values = EMAIL_VARIABLES.map((name) => readOptional(process.env[name]));
  const missing = EMAIL_VARIABLES.filter((_, index) => values[index] === undefined);

  if (missing.length === EMAIL_VARIABLES.length) return new LogMailer();
  if (missing.length > 0) {
    throw new Error(
      `${EMAIL_VARIABLES.join(', ')} must be set together, or none of them: ` +
        `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing`,
    );
  }

  const [host, port, user, password, from] = values as [string, string, string, string, string];
  return new SmtpMailer({
    host,
    // Through the named port reader, so a value that is not a port is refused at boot with the variable
    // named in the refusal, rather than as a NaN that reaches the socket on the first sign-up.
    port: readRequiredPort(port, 'EMAIL_SMTP_PORT'),
    user,
    password,
    from,
  });
}
