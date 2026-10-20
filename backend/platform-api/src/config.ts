// The platform's configuration, read from the process environment. Each value is checked where it is
// read, so a bad one stops the service at boot instead of failing when it is first used.

/**
 * A TCP port from the environment, or the fallback when the variable is not set. Anything that is not a
 * whole number between 1 and 65535 throws: `Number('abc')` is NaN, and `listen(NaN)` picks a random port.
 */
export function readPort(raw: string | undefined, fallback: number): number {
  const value = raw?.trim() ?? '';
  if (value === '') return fallback;

  return portOf(value, 'port');
}

/**
 * A TCP port that has to be there — a mail server's, where there is no sensible default and a wrong one
 * is a connection refused nobody sees. The variable is named in the refusal, because a port that is not
 * a port is a typo in one line of one file and the message is the only thing that says which.
 */
export function readRequiredPort(raw: string | undefined, name: string): number {
  return portOf(readRequired(raw, name), name);
}

function portOf(value: string, name: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535, got ${value}`);
  }
  return port;
}

/**
 * The PostgreSQL the platform reads and writes. Checked here, while the container is being built, so a
 * platform pointed at the wrong thing refuses to start instead of answering requests with errors.
 */
export function readDatabaseUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value.startsWith('postgres://') && !value.startsWith('postgresql://')) {
    throw new Error(
      `DATABASE_URL must be a postgres:// or postgresql:// connection string, got ${valueOrNothing(raw)}`,
    );
  }
  return value;
}

/**
 * A value that has to be there: a secret, a signing key, a host. Whitespace is not a value, which is
 * what catches the environment variable that was set and left blank.
 */
export function readRequired(raw: string | undefined, name: string): string {
  const value = raw?.trim() ?? '';
  if (value === '') {
    throw new Error(`${name} must be set, got ${valueOrNothing(raw)}`);
  }
  return value;
}

/**
 * A value that may be absent, and whose absence is a configuration of its own rather than a mistake: a
 * provider with no credentials is a provider that is off, and a mailer with no server writes to the
 * log. Blank and whitespace answer the same as unset, because that is what a compose file passes for
 * `${VAR:-}` and what a half-filled `.env` holds.
 */
export function readOptional(raw: string | undefined): string | undefined {
  const value = raw?.trim() ?? '';
  return value === '' ? undefined : value;
}

/**
 * How long a game ticket is worth, in seconds. Five minutes when the environment says nothing, which is
 * what the spec asks for: long enough for a player to reach the match server, short enough that a leaked
 * ticket is worth little. A value that is not a whole positive number stops the service at boot.
 */
export function readGameTicketTtl(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 300;

  const seconds = Number(raw);
  if (!Number.isInteger(seconds) || seconds < 1) {
    throw new Error(`GAME_TICKET_TTL_SECONDS must be a whole number of seconds, got ${raw}`);
  }
  return seconds;
}

/**
 * The queue finished matches arrive on. Required, unlike the mail server: a platform that cannot read it
 * is a platform whose entire battle history is empty, and a refusal at boot is a line in the deploy log
 * rather than a silence nobody notices until a player asks where their matches went.
 */
export function readMatchEndedQueueUrl(raw: string | undefined): string {
  return readRequired(raw, 'MATCH_ENDED_QUEUE_URL');
}

/**
 * How long the consumer waits between two looks at the queue, in milliseconds. A second when the
 * environment says nothing, which is the delay a player sees between finishing a match and seeing it in
 * their history — the queue holds a message until it is deleted, so nothing is lost by waiting longer.
 */
export function readPollIntervalMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 1000;

  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms < 1) {
    throw new Error(`MATCH_ENDED_POLL_INTERVAL_MS must be a whole number of milliseconds, got ${raw}`);
  }
  return ms;
}

/** What an error says it found: `nothing` for an unset or blank variable, the value in quotes otherwise. */
function valueOrNothing(raw: string | undefined): string {
  return raw?.trim() ? `"${raw.trim()}"` : 'nothing';
}

/**
 * A whole positive number from the environment, or the fallback when the variable says nothing. Used
 * by the contact form's limit, where a typo has to stop the boot rather than quietly widen the limit.
 */
export function readPositiveInteger(
  raw: string | undefined,
  name: string,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a whole positive number, got ${raw}`);
  }
  return value;
}

/** How many contact messages one address may send in one window. Five is the spec's floor. */
export function readContactRateLimit(raw: string | undefined): number {
  return readPositiveInteger(raw, 'CONTACT_RATE_LIMIT', 5);
}

/** The window the contact limit counts over, in seconds. Ten minutes by default. */
export function readContactRateWindowSeconds(raw: string | undefined): number {
  return readPositiveInteger(raw, 'CONTACT_RATE_WINDOW_SECONDS', 600);
}
