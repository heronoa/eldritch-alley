// The match server's configuration, read from the process environment. Each value is checked where it
// is read, so a bad one stops the server at boot instead of failing when it is first used.

/**
 * A TCP port from the environment, or the fallback when the variable is not set. Anything that is not a
 * whole number between 1 and 65535 throws: `Number('abc')` is NaN, and `listen(NaN)` picks a random port.
 */
export function readPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`port must be an integer between 1 and 65535, got ${raw}`);
  }
  return port;
}

/**
 * How many matches this process may have open at once, from the environment, or the fallback when
 * the variable is not set. Counts rooms, not clients — `BattleRoom.maxClients` already caps those.
 * Per process: with no shared presence between game-server processes yet, more than one process
 * behind the load balancer multiplies this rather than sharing one global count.
 */
export function readMaxConcurrentMatches(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;

  const max = Number(raw);
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`max concurrent matches must be a positive integer, got ${raw}`);
  }
  return max;
}

/**
 * The public half of the ticket key pair, or nothing when the variable is not set.
 *
 * Nothing is a supported state and not a failure: a server with no key authenticates nobody and still
 * plays every match, which is what "signing in is offered and never required to play" means for an
 * operator who has not generated a pair yet. A key that is present but wrong is the same outcome one
 * step later — `verifyTicket` refuses everything it cannot vouch for — so neither case can let a match
 * through on a ticket nobody signed.
 */
export function readPublicKey(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  return raw.replace(/\\n/g, '\n');
}

/**
 * Where the match server publishes a finished match, required at boot.
 *
 * There is no fallback on purpose. Without a queue every match a signed-in player finishes loses its
 * history and nothing anywhere says so: the match plays on, the room logs nothing, and the loss is
 * found by a player looking at an empty battle list. Stopping at boot names the variable while somebody
 * is still watching — the same argument the platform's mailer makes for refusing half a credential.
 */
export function readQueueUrl(raw: string | undefined): string {
  if (raw === undefined || raw === '') {
    throw new Error('MATCH_ENDED_QUEUE_URL is required: a finished match has nowhere to be published');
  }
  return raw;
}
