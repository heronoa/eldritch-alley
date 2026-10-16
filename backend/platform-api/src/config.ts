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

/** What an error says it found: `nothing` for an unset or blank variable, the value in quotes otherwise. */
function valueOrNothing(raw: string | undefined): string {
  return raw?.trim() ? `"${raw.trim()}"` : 'nothing';
}
